import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CandidateArtifactUnavailableError,
  downloadGithubCandidate,
  githubActionsRunEndpoint,
  githubAttestationArguments,
  materializeFirmwareArtifacts,
  validateGithubActionsRun,
} from "../scripts/materialize-firmware-artifacts.mjs";

const PROFILE = "B1144C_260404_USB_C";
const SOURCE_COMMIT = "a".repeat(40);
const TEST_ROOT = fileURLToPath(new URL("../tmp/", import.meta.url));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeFixture(t) {
  await mkdir(TEST_ROOT, { recursive: true });
  const root = await mkdtemp(join(TEST_ROOT, "materialize-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of [
    "firmware/releases",
    "firmware/evidence",
    "agent-memory/logs",
    "tmp/download-source/counter",
  ]) {
    await mkdir(join(root, directory), { recursive: true });
  }

  const bin = Buffer.alloc(8192, 0x5a);
  bin.writeUInt32LE(0xf5f9bda9, 0x14);
  const elf = Buffer.alloc(4096, 0x2a);
  elf.set([0x7f, 0x45, 0x4c, 0x46], 0);
  const binName = "frogalert-0.2.0-beta.1-top-b1144c-260404-usb-c.bin";
  const elfName = "frogalert-0.2.0-beta.1-top-b1144c-260404-usb-c.elf";
  const candidate = {
    schema_version: 3,
    kind: "frogalert-candidate",
    version: "0.2.0-beta.1",
    source_commit: SOURCE_COMMIT,
    github_repository: "pierce403/frogalert",
    provenance: {
      provider: "github-actions",
      repository: "pierce403/frogalert",
      run_id: "123",
      run_attempt: "1",
      workflow:
        "pierce403/frogalert/.github/workflows/ci.yml@refs/heads/main",
    },
    build_lane: "survey",
    hardware_verified: false,
    flash_approved: false,
    publishable: false,
    hosted_on_site: false,
    artifacts: {
      [PROFILE]: {
        hardware_profile: PROFILE,
        pcb_marking: "B1144C_260404",
        firmware: { file: binName, bytes: bin.byteLength, sha256: sha256(bin) },
        debug_elf: { file: elfName, bytes: elf.byteLength, sha256: sha256(elf) },
      },
    },
  };
  const candidateBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`);
  const candidateRoot = join(root, "tmp", "download-source", "counter");
  await writeFile(join(candidateRoot, "candidate.json"), candidateBytes);
  await writeFile(join(candidateRoot, binName), bin);
  await writeFile(join(candidateRoot, elfName), elf);

  const provenance = {
    kind: "github-actions-candidate",
    workflow_run_id: 123,
    workflow_path: ".github/workflows/ci.yml",
    workflow_run_attempt: 1,
    artifact_id: 456,
    artifact_name: `frogalert-candidate-${SOURCE_COMMIT}`,
    artifact_digest: `sha256:${"d".repeat(64)}`,
    candidate_metadata_sha256: sha256(candidateBytes),
    build_lane: "survey",
  };
  const descriptor = {
    id: "frogalert-0.2.0-beta.1-b1144c-260404-usbc",
    kind: "frogalert-release",
    label: "FrogAlert",
    version: "0.2.0-beta.1",
    channel: "beta",
    release_tag: "v0.2.0-beta.1",
    release_url: "https://github.com/pierce403/frogalert/releases/tag/v0.2.0-beta.1",
    release_notes: "firmware/releases/notes/v0.2.0-beta.1.md",
    published_at: "2026-08-03",
    firmware_variant: "counter",
    target: "ch582m-badgemagic-11x44",
    hardware_revisions: [PROFILE],
    pcb_markings: ["B1144C_260404"],
    source_commit: SOURCE_COMMIT,
    file: binName,
    bytes: bin.byteLength,
    sha256: sha256(bin),
    debug_file: elfName,
    debug_bytes: elf.byteLength,
    debug_sha256: sha256(elf),
    hardware_verified: false,
    verification_basis: "ci-audited",
    flash_approved: true,
    build_provenance: provenance,
  };
  const manifest = {
    schema_version: 5,
    updated: "2026-08-03",
    github_repository: "pierce403/frogalert",
    legacy_repository_release_tags: [],
    releases: [descriptor],
    lab_images: [],
    recovery_images: [],
  };
  await writeFile(
    join(root, "firmware/releases/manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(root, "firmware/quarantine.json"),
    `${JSON.stringify({ schema_version: 1, artifacts: [] })}\n`,
  );
  return {
    root,
    candidateRoot: join(root, "tmp", "download-source"),
    descriptor,
    bin,
    elf,
    candidate,
    manifest,
    provenance,
  };
}

async function makePublishedRelease(fixture) {
  const { root, descriptor, bin, elf } = fixture;
  const publishCommit = "c".repeat(40);
  const assetRoot = join(root, "tmp", "published-release-source");
  await mkdir(assetRoot, { recursive: true });
  const contents = new Map([
    [descriptor.file, bin],
    [descriptor.debug_file, elf],
    [
      `${descriptor.file}.sha256`,
      Buffer.from(`${descriptor.sha256}  ${descriptor.file}\n`),
    ],
    [
      `${descriptor.id}.json`,
      Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
    ],
  ]);
  const assets = [];
  const assetFiles = {};
  let assetId = 700;
  for (const [name, content] of contents) {
    assetId += 1;
    const path = join(assetRoot, `asset-${assetId}`);
    await writeFile(path, content);
    assets.push({
      id: assetId,
      name,
      size: content.byteLength,
      state: "uploaded",
      digest: `sha256:${sha256(content)}`,
      url: `https://api.github.com/repos/pierce403/frogalert/releases/assets/${assetId}`,
      browser_download_url:
        `https://github.com/pierce403/frogalert/releases/download/${descriptor.release_tag}/${name}`,
    });
    assetFiles[String(assetId)] = path;
  }
  const published = {
    release: {
      id: 99,
      url: "https://api.github.com/repos/pierce403/frogalert/releases/99",
      html_url: descriptor.release_url,
      tag_name: descriptor.release_tag,
      name: `${descriptor.label} ${descriptor.version}`,
      target_commitish: publishCommit,
      draft: false,
      prerelease: true,
    },
    assets,
    tagTarget: publishCommit,
    comparison: {
      status: "ahead",
      behind_by: 0,
      base_commit: { sha: descriptor.source_commit },
      merge_base_commit: { sha: descriptor.source_commit },
      head_commit: { sha: publishCommit },
    },
    assetFiles,
  };
  const fetchPublishedRelease = async ({
    repository,
    releaseTag,
    sourceCommit,
    expectedAssetNames,
  }) => {
    assert.equal(repository, "pierce403/frogalert");
    assert.equal(releaseTag, descriptor.release_tag);
    assert.equal(sourceCommit, descriptor.source_commit);
    assert.deepEqual(new Set(expectedAssetNames), new Set(contents.keys()));
    return published;
  };
  return { published, fetchPublishedRelease };
}

test("approved release bytes can be materialized from one exact Actions candidate", async (t) => {
  const { root, candidateRoot, descriptor, bin } = await makeFixture(t);
  let downloads = 0;
  const attested = [];
  const result = await materializeFirmwareArtifacts({
    repositoryRoot: root,
    outputRoot: join(root, "tmp", "release-artifacts"),
    fetchCandidate: async () => {
      downloads += 1;
      return candidateRoot;
    },
    verifyAttestations: async ({ files }) => attested.push(...files),
  });
  assert.equal(downloads, 1);
  assert.equal(attested.length, 2);
  assert.deepEqual(await readFile(join(result.outputRoot, descriptor.file)), bin);
});

test("candidate download accepts a successful later attempt and fetches the exact artifact id", async (t) => {
  const { root, provenance: fixtureProvenance } = await makeFixture(t);
  const archive = Buffer.from("exact artifact archive bytes");
  const provenance = {
    ...fixtureProvenance,
    workflow_run_attempt: 7,
    artifact_digest: `sha256:${sha256(archive)}`,
  };
  const outputRoot = join(root, "tmp", "exact-artifact-download");
  await mkdir(outputRoot, { recursive: true });
  const textCalls = [];
  const binaryCalls = [];
  const execute = async (command, args) => {
    textCalls.push([command, ...args]);
    const endpoint = args.at(-1);
    if (endpoint.endsWith("/actions/runs/123")) {
      return {
        stdout: JSON.stringify({
          id: 123,
          path: ".github/workflows/ci.yml",
          run_attempt: 8,
          event: "push",
          head_branch: "main",
          head_sha: SOURCE_COMMIT,
          head_repository: { full_name: "pierce403/frogalert" },
          repository: { full_name: "pierce403/frogalert" },
          status: "completed",
          conclusion: "success",
        }),
      };
    }
    if (endpoint.endsWith("/actions/artifacts/456")) {
      return {
        stdout: JSON.stringify({
          id: 456,
          name: provenance.artifact_name,
          digest: provenance.artifact_digest,
          expired: false,
          workflow_run: { id: 123, head_sha: SOURCE_COMMIT },
        }),
      };
    }
    throw new Error(`unexpected text command: ${command} ${args.join(" ")}`);
  };
  const executeBinary = async (command, args) => {
    binaryCalls.push([command, ...args]);
    return { stdout: archive };
  };
  let extracted = false;
  await downloadGithubCandidate({
    repository: "pierce403/frogalert",
    provenance,
    sourceCommit: SOURCE_COMMIT,
    outputRoot,
    execute,
    executeBinary,
    extractArchive: async ({ archivePath }) => {
      extracted = true;
      assert.deepEqual(await readFile(archivePath), archive);
    },
  });
  assert.equal(
    githubActionsRunEndpoint(provenance),
    "actions/runs/123",
  );
  assert.equal(extracted, true);
  assert.deepEqual(textCalls[0], [
    "gh",
    "api",
    "repos/pierce403/frogalert/actions/runs/123",
  ]);
  assert.deepEqual(binaryCalls[0], [
    "gh",
    "api",
    "repos/pierce403/frogalert/actions/artifacts/456/zip",
    "-H",
    "Accept: application/vnd.github+json",
  ]);
  assert.equal(
    [...textCalls, ...binaryCalls].some((call) => call[1] === "run"),
    false,
  );
});

test("an expired candidate can be materialized from its exact published release", async (t) => {
  const fixture = await makeFixture(t);
  const { root, descriptor, bin, elf } = fixture;
  const { fetchPublishedRelease } = await makePublishedRelease(fixture);
  let candidateFetches = 0;
  const result = await materializeFirmwareArtifacts({
    repositoryRoot: root,
    outputRoot: join(root, "tmp", "release-artifacts"),
    fetchCandidate: async () => {
      candidateFetches += 1;
      throw new CandidateArtifactUnavailableError("candidate artifact has expired");
    },
    fetchPublishedRelease,
    verifyAttestations: async () => assert.fail("published fallback must not re-attest"),
  });
  assert.equal(candidateFetches, 1);
  assert.deepEqual(await readFile(join(result.outputRoot, descriptor.file)), bin);
  assert.deepEqual(await readFile(join(result.outputRoot, descriptor.debug_file)), elf);
});

test("an unpublished release cannot bypass its candidate and attestations", async (t) => {
  const { root } = await makeFixture(t);
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => {
        throw new CandidateArtifactUnavailableError("candidate artifact has expired");
      },
      fetchPublishedRelease: async () => {
        throw new Error("release tag was not found");
      },
      verifyAttestations: async () => {},
    }),
    /candidate artifact is unavailable and published release fallback failed: release tag was not found/,
  );
});

test("published fallback rejects drafts and prerelease status drift", async (t) => {
  const fixture = await makeFixture(t);
  const { root } = fixture;
  const { published, fetchPublishedRelease } = await makePublishedRelease(fixture);
  published.release.draft = true;
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => {
        throw new CandidateArtifactUnavailableError("gone");
      },
      fetchPublishedRelease,
      verifyAttestations: async () => {},
    }),
    /release identity or status differs/,
  );
  published.release.draft = false;
  published.release.prerelease = false;
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => {
        throw new CandidateArtifactUnavailableError("gone");
      },
      fetchPublishedRelease,
      verifyAttestations: async () => {},
    }),
    /release identity or status differs/,
  );
});

test("published fallback requires the exact planned release asset set", async (t) => {
  const fixture = await makeFixture(t);
  const { root } = fixture;
  const { published, fetchPublishedRelease } = await makePublishedRelease(fixture);
  published.assets.push({
    id: 999,
    name: "unplanned.bin",
    size: 1,
    state: "uploaded",
  });
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => {
        throw new CandidateArtifactUnavailableError("gone");
      },
      fetchPublishedRelease,
      verifyAttestations: async () => {},
    }),
    /asset set differs from the planned release/,
  );
});

test("published fallback rehashes downloaded release bytes", async (t) => {
  const fixture = await makeFixture(t);
  const { root, descriptor } = fixture;
  const { published, fetchPublishedRelease } = await makePublishedRelease(fixture);
  const binAsset = published.assets.find((asset) => asset.name === descriptor.file);
  await writeFile(published.assetFiles[String(binAsset.id)], Buffer.alloc(descriptor.bytes));
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => {
        throw new CandidateArtifactUnavailableError("gone");
      },
      fetchPublishedRelease,
      verifyAttestations: async () => {},
    }),
    /release asset bytes differ/,
  );
});

test("materialization fails closed when candidate metadata is not the approved receipt", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  await writeFile(join(candidateRoot, "counter", "candidate.json"), "{}\n");
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => candidateRoot,
      verifyAttestations: async () => {},
    }),
    /candidate metadata differs/,
  );
});

test("future releases reject transitional candidate metadata", async (t) => {
  const { root, candidateRoot, candidate, manifest } = await makeFixture(t);
  candidate.schema_version = 2;
  const candidateBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`);
  await writeFile(join(candidateRoot, "counter", "candidate.json"), candidateBytes);
  manifest.releases[0].build_provenance.candidate_metadata_sha256 =
    sha256(candidateBytes);
  await writeFile(
    join(root, "firmware/releases/manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => candidateRoot,
      verifyAttestations: async () => {},
    }),
    /candidate metadata does not match/,
  );
});

test("only a successful canonical main CI run may supply release bytes", () => {
  const repository = "pierce403/frogalert";
  const provenance = {
    workflow_run_id: 123,
    workflow_path: ".github/workflows/ci.yml",
    workflow_run_attempt: 1,
  };
  const run = {
    id: 123,
    path: ".github/workflows/ci.yml",
    run_attempt: 1,
    event: "push",
    head_branch: "main",
    head_sha: SOURCE_COMMIT,
    head_repository: { full_name: repository },
    repository: { full_name: repository },
    status: "completed",
    conclusion: "success",
  };
  assert.equal(
    validateGithubActionsRun(run, {
      repository,
      provenance,
      sourceCommit: SOURCE_COMMIT,
    }),
    true,
  );
  assert.equal(
    validateGithubActionsRun(
      { ...run, run_attempt: 2 },
      { repository, provenance, sourceCommit: SOURCE_COMMIT },
    ),
    true,
  );
  for (const override of [
    { event: "pull_request" },
    { head_branch: "feature" },
    { head_sha: "b".repeat(40) },
    { conclusion: "failure" },
    { run_attempt: 0 },
    { run_attempt: undefined },
  ]) {
    assert.throws(
      () =>
        validateGithubActionsRun(
          { ...run, ...override },
          { repository, provenance, sourceCommit: SOURCE_COMMIT },
        ),
      /successful canonical main CI build/,
    );
  }
});

test("attestation verification is bound to main, source commit, and CI workflow", () => {
  assert.deepEqual(
    githubAttestationArguments({
      repository: "pierce403/frogalert",
      provenance: { workflow_path: ".github/workflows/ci.yml" },
      sourceCommit: SOURCE_COMMIT,
      file: "/tmp/frogalert.bin",
    }),
    [
      "attestation",
      "verify",
      "/tmp/frogalert.bin",
      "--repo",
      "pierce403/frogalert",
      "--signer-workflow",
      "pierce403/frogalert/.github/workflows/ci.yml",
      "--source-digest",
      SOURCE_COMMIT,
      "--source-ref",
      "refs/heads/main",
      "--deny-self-hosted-runners",
    ],
  );
});
