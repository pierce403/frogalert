import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const TAG_PATTERN =
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function asBytes(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") return Buffer.from(data);
  throw new Error("GitHub release asset response was not binary data");
}

export async function loadFirmwareReleaseBundle(bundleRoot) {
  const root = resolve(bundleRoot);
  const plan = JSON.parse(await readFile(`${root}/plan.json`, "utf8"));
  if (
    plan.schema_version !== 1 ||
    typeof plan.repository !== "string" ||
    !COMMIT_PATTERN.test(plan.publish_commit || "") ||
    !Array.isArray(plan.releases)
  ) {
    throw new Error("firmware release publication plan is invalid");
  }

  for (const release of plan.releases) {
    if (
      !TAG_PATTERN.test(release.tag || "") ||
      typeof release.name !== "string" ||
      !release.name.trim() ||
      typeof release.prerelease !== "boolean" ||
      !Array.isArray(release.assets)
    ) {
      throw new Error("firmware release plan entry is invalid");
    }
    const bodyPath = resolve(root, release.body_file || "");
    if (!bodyPath.startsWith(`${root}/`)) throw new Error("release body path is unsafe");
    release.body = await readFile(bodyPath, "utf8");
    if (sha256(Buffer.from(release.body)) !== release.body_sha256) {
      throw new Error(`release body hash mismatch for ${release.tag}`);
    }

    const assetNames = new Set();
    for (const asset of release.assets) {
      if (
        basename(asset.name || "") !== asset.name ||
        assetNames.has(asset.name) ||
        !Number.isSafeInteger(asset.bytes) ||
        asset.bytes < 1 ||
        !SHA256_PATTERN.test(asset.sha256 || "")
      ) {
        throw new Error(`release asset metadata is invalid for ${release.tag}`);
      }
      assetNames.add(asset.name);
      const assetPath = resolve(root, asset.path || "");
      if (!assetPath.startsWith(`${root}/`)) {
        throw new Error(`release asset path is unsafe: ${asset.name}`);
      }
      asset.content = await readFile(assetPath);
      if (asset.content.byteLength !== asset.bytes || sha256(asset.content) !== asset.sha256) {
        throw new Error(`release bundle asset hash mismatch: ${asset.name}`);
      }
    }
  }
  return plan;
}

async function findReleaseByTag(github, owner, repo, tag) {
  try {
    const response = await github.rest.repos.getReleaseByTag({ owner, repo, tag });
    return response.data;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const releases = await github.paginate(github.rest.repos.listReleases, {
    owner,
    repo,
    per_page: 100,
  });
  return releases.find((release) => release.tag_name === tag) || null;
}

async function downloadReleaseAsset(github, owner, repo, assetId) {
  const response = await github.request(
    "GET /repos/{owner}/{repo}/releases/assets/{asset_id}",
    {
      owner,
      repo,
      asset_id: assetId,
      headers: { accept: "application/octet-stream" },
    },
  );
  return asBytes(response.data);
}

async function assertRemoteAssetMatches(github, owner, repo, remoteAsset, plannedAsset) {
  if (remoteAsset.size !== plannedAsset.bytes) {
    throw new Error(`published release asset size differs: ${plannedAsset.name}`);
  }
  const remoteBytes = await downloadReleaseAsset(
    github,
    owner,
    repo,
    remoteAsset.id,
  );
  if (sha256(remoteBytes) !== plannedAsset.sha256) {
    throw new Error(`published release asset hash differs: ${plannedAsset.name}`);
  }
}

async function reconcileReleaseAssets({
  github,
  owner,
  repo,
  release,
  remoteRelease,
  allowUpload,
}) {
  const remoteAssets = await github.paginate(github.rest.repos.listReleaseAssets, {
    owner,
    repo,
    release_id: remoteRelease.id,
    per_page: 100,
  });
  const remoteByName = new Map();
  for (const remoteAsset of remoteAssets) {
    if (remoteByName.has(remoteAsset.name)) {
      throw new Error(`GitHub release has duplicate asset name: ${remoteAsset.name}`);
    }
    remoteByName.set(remoteAsset.name, remoteAsset);
  }

  for (const asset of release.assets) {
    const existing = remoteByName.get(asset.name);
    if (existing) {
      await assertRemoteAssetMatches(github, owner, repo, existing, asset);
      remoteByName.delete(asset.name);
      continue;
    }
    if (!allowUpload) {
      throw new Error(`published GitHub release is missing asset: ${asset.name}`);
    }
    const uploaded = await github.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: remoteRelease.id,
      name: asset.name,
      data: asset.content,
      headers: {
        "content-type": asset.content_type,
        "content-length": asset.bytes,
      },
    });
    await assertRemoteAssetMatches(github, owner, repo, uploaded.data, asset);
  }

  if (remoteByName.size > 0) {
    throw new Error(
      `GitHub release contains unplanned asset: ${remoteByName.keys().next().value}`,
    );
  }
}

export async function publishFirmwareReleaseBundle({
  github,
  owner,
  repo,
  bundleRoot,
  targetCommitish,
  log = () => {},
}) {
  const plan = await loadFirmwareReleaseBundle(bundleRoot);
  if (plan.repository !== `${owner}/${repo}`) {
    throw new Error(`release bundle repository ${plan.repository} does not match ${owner}/${repo}`);
  }
  if (plan.publish_commit !== targetCommitish) {
    throw new Error("release bundle publication commit does not match the workflow commit");
  }

  for (const release of plan.releases) {
    let remoteRelease = await findReleaseByTag(github, owner, repo, release.tag);
    if (remoteRelease && !remoteRelease.draft) {
      if (
        remoteRelease.name !== release.name ||
        remoteRelease.prerelease !== release.prerelease ||
        remoteRelease.body !== release.body
      ) {
        throw new Error(`published GitHub release metadata differs for ${release.tag}`);
      }
      await reconcileReleaseAssets({
        github,
        owner,
        repo,
        release,
        remoteRelease,
        allowUpload: false,
      });
      log(`verified existing immutable GitHub release ${release.tag}`);
      continue;
    }

    if (!remoteRelease) {
      const created = await github.rest.repos.createRelease({
        owner,
        repo,
        tag_name: release.tag,
        target_commitish: targetCommitish,
        name: release.name,
        body: release.body,
        draft: true,
        prerelease: release.prerelease,
        generate_release_notes: false,
      });
      remoteRelease = created.data;
      log(`created draft GitHub release ${release.tag}`);
    } else if (
      remoteRelease.name !== release.name ||
      remoteRelease.prerelease !== release.prerelease ||
      remoteRelease.body !== release.body
    ) {
      throw new Error(`draft GitHub release metadata differs for ${release.tag}`);
    }

    await reconcileReleaseAssets({
      github,
      owner,
      repo,
      release,
      remoteRelease,
      allowUpload: true,
    });
    await github.rest.repos.updateRelease({
      owner,
      repo,
      release_id: remoteRelease.id,
      tag_name: release.tag,
      target_commitish: targetCommitish,
      name: release.name,
      body: release.body,
      draft: false,
      prerelease: release.prerelease,
    });
    log(`published verified GitHub release ${release.tag}`);
  }
  return plan.releases.length;
}
