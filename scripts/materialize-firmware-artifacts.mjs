#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";
import { validateFirmwarePublicationManifest } from "./firmware-publication.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const BUILD_LANES = new Set(["survey", "frogs"]);
const FIRMWARE_VARIANTS = new Map([
  ["counter", "survey"],
  ["frogs", "frogs"],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export class CandidateArtifactUnavailableError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "CandidateArtifactUnavailableError";
  }
}

function assertSafeOutput(root, outputRoot) {
  const scratch = join(root, "tmp");
  const output = resolve(outputRoot);
  if (!output.startsWith(`${scratch}/`)) {
    throw new Error("materialized firmware output must stay under repository tmp");
  }
  return output;
}

function validateCloudProvenance(provenance, repository) {
  if (
    !provenance ||
    provenance.kind !== "github-actions-candidate" ||
    !Number.isSafeInteger(provenance.workflow_run_id) ||
    provenance.workflow_run_id < 1 ||
    !Number.isSafeInteger(provenance.artifact_id) ||
    provenance.artifact_id < 1 ||
    provenance.workflow_path !== ".github/workflows/ci.yml" ||
    !Number.isSafeInteger(provenance.workflow_run_attempt) ||
    provenance.workflow_run_attempt < 1 ||
    typeof provenance.artifact_name !== "string" ||
    !/^frogalert-candidate-[a-f0-9]{40}$/.test(provenance.artifact_name) ||
    !ARTIFACT_DIGEST_PATTERN.test(provenance.artifact_digest || "") ||
    !SHA256_PATTERN.test(provenance.candidate_metadata_sha256 || "") ||
    !BUILD_LANES.has(provenance.build_lane)
  ) {
    throw new Error("release candidate build provenance is invalid");
  }
  if (!REPOSITORY_PATTERN.test(repository || "")) {
    throw new Error("release repository is invalid");
  }
  return provenance;
}

export function validateGithubActionsRun(run, {
  repository,
  provenance,
  sourceCommit,
}) {
  if (
    !run ||
    run.id !== provenance.workflow_run_id ||
    run.path !== provenance.workflow_path ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < provenance.workflow_run_attempt ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    run.head_branch !== "main" ||
    run.head_sha !== sourceCommit ||
    run.head_repository?.full_name !== repository ||
    run.repository?.full_name !== repository ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  ) {
    throw new Error("candidate workflow run is not a successful canonical main CI build");
  }
  return true;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      const result = {
        status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (status === 0) resolvePromise(result);
      else {
        reject(
          new Error(
            `${command} failed (${status}): ${result.stderr.trim() || result.stdout.trim()}`,
          ),
        );
      }
    });
  });
}

function runBinary(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      const result = {
        status,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (status === 0) resolvePromise(result);
      else {
        reject(
          new Error(
            `${command} failed (${status}): ${result.stderr.trim() || "binary command failed"}`,
          ),
        );
      }
    });
  });
}

async function extractZipArchive({ archivePath, outputRoot, execute = run }) {
  const listing = await execute("unzip", ["-Z1", archivePath]);
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (
    entries.length === 0 ||
    entries.some((entry) => {
      const segments = entry.split("/");
      return (
        entry.includes("\\") ||
        entry.includes("\0") ||
        entry.startsWith("/") ||
        /^[A-Za-z]:/.test(entry) ||
        segments.includes("..")
      );
    })
  ) {
    throw new Error("candidate artifact archive contains an unsafe path");
  }
  await execute("unzip", ["-q", archivePath, "-d", outputRoot]);
}

export function githubActionsRunEndpoint(provenance) {
  if (
    !Number.isSafeInteger(provenance?.workflow_run_id) ||
    provenance.workflow_run_id < 1 ||
    !Number.isSafeInteger(provenance?.workflow_run_attempt) ||
    provenance.workflow_run_attempt < 1
  ) {
    throw new Error("candidate workflow run attempt is invalid");
  }
  return `actions/runs/${provenance.workflow_run_id}`;
}

export async function downloadGithubCandidate({
  repository,
  provenance,
  sourceCommit,
  outputRoot,
  execute = run,
  executeBinary = runBinary,
  extractArchive = extractZipArchive,
}) {
  validateCloudProvenance(provenance, repository);
  let runResult;
  try {
    runResult = await execute("gh", [
      "api",
      `repos/${repository}/${githubActionsRunEndpoint(provenance)}`,
    ]);
  } catch (error) {
    throw new CandidateArtifactUnavailableError(
      "candidate workflow run is unavailable",
      { cause: error },
    );
  }
  validateGithubActionsRun(JSON.parse(runResult.stdout), {
    repository,
    provenance,
    sourceCommit,
  });
  let metadataResult;
  try {
    metadataResult = await execute("gh", [
      "api",
      `repos/${repository}/actions/artifacts/${provenance.artifact_id}`,
    ]);
  } catch (error) {
    throw new CandidateArtifactUnavailableError(
      "candidate artifact metadata is unavailable",
      { cause: error },
    );
  }
  const remote = JSON.parse(metadataResult.stdout);
  if (remote.expired === true) {
    throw new CandidateArtifactUnavailableError("candidate artifact has expired");
  }
  if (
    remote.id !== provenance.artifact_id ||
    remote.name !== provenance.artifact_name ||
    remote.workflow_run?.id !== provenance.workflow_run_id ||
    remote.workflow_run?.head_sha !== sourceCommit ||
    remote.digest !== provenance.artifact_digest
  ) {
    throw new Error("GitHub candidate artifact does not match recorded provenance");
  }
  let archiveResult;
  try {
    archiveResult = await executeBinary("gh", [
      "api",
      `repos/${repository}/actions/artifacts/${provenance.artifact_id}/zip`,
      "-H",
      "Accept: application/vnd.github+json",
    ]);
  } catch (error) {
    throw new CandidateArtifactUnavailableError(
      "candidate artifact download is unavailable",
      { cause: error },
    );
  }
  const archive = Buffer.from(archiveResult.stdout);
  if (`sha256:${sha256(archive)}` !== provenance.artifact_digest) {
    throw new Error("downloaded candidate artifact archive digest differs from provenance");
  }
  const archivePath = join(outputRoot, `.candidate-artifact-${provenance.artifact_id}.zip`);
  await writeFile(archivePath, archive);
  try {
    await extractArchive({ archivePath, outputRoot, execute });
  } finally {
    await rm(archivePath, { force: true });
  }
  return outputRoot;
}

function parsePaginatedArrays(stdout, description) {
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error(`${description} response is not an array`);
  }
  if (parsed.length === 0 || !Array.isArray(parsed[0])) return parsed;
  if (parsed.some((page) => !Array.isArray(page))) {
    throw new Error(`${description} response contains an invalid page`);
  }
  return parsed.flat();
}

async function resolveGithubTagCommit({ repository, releaseTag, execute }) {
  const encodedTag = encodeURIComponent(releaseTag);
  const refResult = await execute("gh", [
    "api",
    `repos/${repository}/git/ref/tags/${encodedTag}`,
  ]);
  let object = JSON.parse(refResult.stdout)?.object;
  for (let depth = 0; object?.type === "tag" && depth < 4; depth += 1) {
    const tagResult = await execute("gh", [
      "api",
      `repos/${repository}/git/tags/${object.sha}`,
    ]);
    object = JSON.parse(tagResult.stdout)?.object;
  }
  if (object?.type !== "commit" || !COMMIT_PATTERN.test(object.sha || "")) {
    throw new Error(`published release tag ${releaseTag} does not resolve to a commit`);
  }
  return object.sha;
}

export async function downloadGithubPublishedRelease({
  repository,
  releaseTag,
  sourceCommit,
  expectedAssetNames,
  outputRoot,
  execute = run,
  executeBinary = runBinary,
}) {
  if (!REPOSITORY_PATTERN.test(repository || "") || !COMMIT_PATTERN.test(sourceCommit || "")) {
    throw new Error("published release repository or source commit is invalid");
  }
  const expectedNames = new Set(expectedAssetNames || []);
  if (
    expectedNames.size === 0 ||
    expectedNames.size !== expectedAssetNames.length ||
    [...expectedNames].some((name) => basename(name) !== name)
  ) {
    throw new Error("published release expected asset names are invalid");
  }
  const encodedTag = encodeURIComponent(releaseTag);
  const releaseResult = await execute("gh", [
    "api",
    `repos/${repository}/releases/tags/${encodedTag}`,
  ]);
  const release = JSON.parse(releaseResult.stdout);
  if (!Number.isSafeInteger(release?.id) || release.id < 1) {
    throw new Error("published release identity is invalid");
  }
  const assetsResult = await execute("gh", [
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/releases/${release.id}/assets?per_page=100`,
  ]);
  const assets = parsePaginatedArrays(assetsResult.stdout, "published release assets");
  const tagTarget = await resolveGithubTagCommit({ repository, releaseTag, execute });
  const comparisonResult = await execute("gh", [
    "api",
    `repos/${repository}/compare/${sourceCommit}...${tagTarget}`,
  ]);
  const comparison = JSON.parse(comparisonResult.stdout);

  const assetFiles = {};
  for (const asset of assets) {
    if (
      !expectedNames.has(asset?.name) ||
      !Number.isSafeInteger(asset?.id) ||
      asset.id < 1 ||
      Object.hasOwn(assetFiles, String(asset.id))
    ) {
      continue;
    }
    const downloadResult = await executeBinary("gh", [
      "api",
      `repos/${repository}/releases/assets/${asset.id}`,
      "-H",
      "Accept: application/octet-stream",
    ]);
    const assetPath = join(outputRoot, `release-asset-${asset.id}`);
    await writeFile(assetPath, downloadResult.stdout);
    assetFiles[String(asset.id)] = assetPath;
  }
  return { release, assets, tagTarget, comparison, assetFiles };
}

export function githubAttestationArguments({
  repository,
  provenance,
  sourceCommit,
  file,
}) {
  const signerWorkflow = `${repository}/${provenance.workflow_path}`;
  return [
    "attestation",
    "verify",
    file,
    "--repo",
    repository,
    "--signer-workflow",
    signerWorkflow,
    "--source-digest",
    sourceCommit,
    "--source-ref",
    "refs/heads/main",
    "--deny-self-hosted-runners",
  ];
}

export async function verifyGithubAttestations({
  repository,
  provenance,
  sourceCommit,
  files,
}) {
  for (const file of files) {
    await run("gh", githubAttestationArguments({
      repository,
      provenance,
      sourceCommit,
      file,
    }));
  }
}

function profileArtifact(metadata, descriptor) {
  const [profile] = descriptor.hardware_revisions;
  const artifact = metadata.artifacts?.[profile];
  if (!artifact) {
    throw new Error(`${descriptor.file} is absent from its candidate profile`);
  }
  return artifact;
}

async function verifyAndCopy({ source, destination, descriptor, debug = false }) {
  const bytes = await readFile(source);
  if (debug) {
    if (
      bytes.byteLength < 64 ||
      bytes[0] !== 0x7f ||
      bytes[1] !== 0x45 ||
      bytes[2] !== 0x4c ||
      bytes[3] !== 0x46
    ) {
      throw new Error(`${descriptor.debug_file} is not an ELF`);
    }
    if (
      bytes.byteLength !== descriptor.debug_bytes ||
      sha256(bytes) !== descriptor.debug_sha256
    ) {
      throw new Error(`${descriptor.debug_file} differs from its release descriptor`);
    }
  } else {
    assertCh58xUserOptionMagic(bytes);
    if (bytes.byteLength !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) {
      throw new Error(`${descriptor.file} differs from its release descriptor`);
    }
  }
  await copyFile(source, destination);
}

async function publishedReleaseAssetPlan(root, descriptors) {
  const plan = new Map();
  function add(name, { bytes, hash, content, descriptor, debug = false }) {
    if (basename(name) !== name || plan.has(name)) {
      throw new Error(`published release has an unsafe or duplicate planned asset: ${name}`);
    }
    plan.set(name, { name, bytes, sha256: hash, content, descriptor, debug });
  }

  for (const descriptor of descriptors) {
    add(descriptor.file, {
      bytes: descriptor.bytes,
      hash: descriptor.sha256,
      descriptor,
    });
    add(descriptor.debug_file, {
      bytes: descriptor.debug_bytes,
      hash: descriptor.debug_sha256,
      descriptor,
      debug: true,
    });
    const checksum = Buffer.from(`${descriptor.sha256}  ${descriptor.file}\n`);
    add(`${descriptor.file}.sha256`, {
      bytes: checksum.byteLength,
      hash: sha256(checksum),
      content: checksum,
    });
    const snapshot = Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
    add(`${descriptor.id}.json`, {
      bytes: snapshot.byteLength,
      hash: sha256(snapshot),
      content: snapshot,
    });
    if (descriptor.hardware_verified === true) {
      const evidencePath = resolve(root, descriptor.hardware_evidence?.record || "");
      if (!evidencePath.startsWith(`${root}/`)) {
        throw new Error("published release evidence record path is unsafe");
      }
      const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
      const evidenceSnapshot = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
      add(`${descriptor.id}.evidence.json`, {
        bytes: evidenceSnapshot.byteLength,
        hash: sha256(evidenceSnapshot),
        content: evidenceSnapshot,
      });
    }
  }
  return plan;
}

function assertPublishedReleaseIdentity({
  repository,
  descriptor,
  remote,
  tagTarget,
  comparison,
}) {
  const expectedApiUrl = `https://api.github.com/repos/${repository}/releases/${remote?.id}`;
  const expectedHtmlUrl = `https://github.com/${repository}/releases/tag/${descriptor.release_tag}`;
  if (
    !remote ||
    !Number.isSafeInteger(remote.id) ||
    remote.id < 1 ||
    remote.url !== expectedApiUrl ||
    remote.html_url !== expectedHtmlUrl ||
    remote.tag_name !== descriptor.release_tag ||
    remote.name !== `${descriptor.label} ${descriptor.version}` ||
    remote.draft !== false ||
    remote.prerelease !== (descriptor.channel !== "stable") ||
    !COMMIT_PATTERN.test(remote.target_commitish || "") ||
    remote.target_commitish !== tagTarget
  ) {
    throw new Error("published GitHub release identity or status differs from its descriptor");
  }
  if (
    !comparison ||
    comparison.base_commit?.sha !== descriptor.source_commit ||
    comparison.merge_base_commit?.sha !== descriptor.source_commit ||
    comparison.head_commit?.sha !== tagTarget ||
    !["ahead", "identical"].includes(comparison.status) ||
    comparison.behind_by !== 0
  ) {
    throw new Error("published GitHub release tag is not descended from its source commit");
  }
}

async function materializePublishedReleaseGroup({
  root,
  output,
  repository,
  descriptors,
  fetchPublishedRelease,
}) {
  const release = descriptors[0];
  const plan = await publishedReleaseAssetPlan(root, descriptors);
  const downloadRoot = join(root, "tmp", "published-release-downloads", release.release_tag);
  await rm(downloadRoot, { recursive: true, force: true });
  await mkdir(downloadRoot, { recursive: true });
  const fetched = await fetchPublishedRelease({
    repository,
    releaseTag: release.release_tag,
    sourceCommit: release.source_commit,
    expectedAssetNames: [...plan.keys()],
    outputRoot: downloadRoot,
  });
  assertPublishedReleaseIdentity({
    repository,
    descriptor: release,
    remote: fetched?.release,
    tagTarget: fetched?.tagTarget,
    comparison: fetched?.comparison,
  });

  if (!Array.isArray(fetched.assets) || fetched.assets.length !== plan.size) {
    throw new Error("published GitHub release asset set differs from the planned release");
  }
  const remoteByName = new Map();
  for (const asset of fetched.assets) {
    if (
      !asset ||
      basename(asset.name || "") !== asset.name ||
      remoteByName.has(asset.name) ||
      !Number.isSafeInteger(asset.id) ||
      asset.id < 1
    ) {
      throw new Error("published GitHub release contains invalid or duplicate assets");
    }
    remoteByName.set(asset.name, asset);
  }

  for (const planned of plan.values()) {
    const asset = remoteByName.get(planned.name);
    const expectedApiUrl = `https://api.github.com/repos/${repository}/releases/assets/${asset?.id}`;
    const expectedBrowserUrl =
      `https://github.com/${repository}/releases/download/${release.release_tag}/${planned.name}`;
    if (
      !asset ||
      asset.size !== planned.bytes ||
      asset.state !== "uploaded" ||
      asset.url !== expectedApiUrl ||
      asset.browser_download_url !== expectedBrowserUrl ||
      (asset.digest != null && asset.digest !== `sha256:${planned.sha256}`)
    ) {
      throw new Error(`published GitHub release asset metadata differs: ${planned.name}`);
    }
    const assetPath = fetched.assetFiles?.[String(asset.id)];
    if (typeof assetPath !== "string") {
      throw new Error(`published GitHub release asset was not downloaded: ${planned.name}`);
    }
    const bytes = await readFile(assetPath);
    if (bytes.byteLength !== planned.bytes || sha256(bytes) !== planned.sha256) {
      throw new Error(`published GitHub release asset bytes differ: ${planned.name}`);
    }
    if (planned.content && !bytes.equals(planned.content)) {
      throw new Error(`published GitHub release generated asset differs: ${planned.name}`);
    }
    if (planned.descriptor) {
      await verifyAndCopy({
        source: assetPath,
        destination: join(output, planned.name),
        descriptor: planned.descriptor,
        debug: planned.debug,
      });
    }
  }
}

async function materializeCandidateGroup({
  root,
  output,
  repository,
  descriptors,
  provenance,
  fetchCandidate,
  verifyAttestations,
}) {
  validateCloudProvenance(provenance, repository);
  const release = descriptors[0];
  if (provenance.artifact_name !== `frogalert-candidate-${release.source_commit}`) {
    throw new Error("candidate artifact name is not bound to the release source commit");
  }
  if (
    FIRMWARE_VARIANTS.get(release.firmware_variant) !== provenance.build_lane
  ) {
    throw new Error("release firmware variant does not match its candidate lane");
  }
  const downloadRoot = join(root, "tmp", "candidate-downloads", String(provenance.artifact_id));
  await rm(downloadRoot, { recursive: true, force: true });
  await mkdir(downloadRoot, { recursive: true });
  const extractedRoot = await fetchCandidate({
    repository,
    provenance,
    sourceCommit: release.source_commit,
    outputRoot: downloadRoot,
  });
  const laneDirectory = provenance.build_lane === "frogs" ? "frogs" : "counter";
  const candidateRoot = join(extractedRoot, laneDirectory);
  const metadataBytes = await readFile(join(candidateRoot, "candidate.json"));
  if (sha256(metadataBytes) !== provenance.candidate_metadata_sha256) {
    throw new Error("candidate metadata differs from its recorded SHA-256");
  }
  const metadata = JSON.parse(metadataBytes);
  if (
    metadata.schema_version !== 3 ||
    metadata.kind !== "frogalert-candidate" ||
    metadata.version !== release.version ||
    metadata.source_commit !== release.source_commit ||
    metadata.github_repository !== repository ||
    metadata.build_lane !== provenance.build_lane ||
    metadata.hardware_verified !== false ||
    metadata.flash_approved !== false ||
    metadata.publishable !== false ||
    metadata.hosted_on_site !== false
  ) {
    throw new Error("candidate metadata does not match the approved release group");
  }
  if (
    metadata.provenance?.provider !== "github-actions" ||
    metadata.provenance?.repository !== repository ||
    metadata.provenance?.run_id !== String(provenance.workflow_run_id) ||
    metadata.provenance?.run_attempt !==
      String(provenance.workflow_run_attempt) ||
    !metadata.provenance?.workflow?.startsWith(
      `${repository}/${provenance.workflow_path}@`,
    )
  ) {
    throw new Error("candidate metadata is not bound to the recorded Actions run");
  }

  const attestationFiles = [];
  for (const descriptor of descriptors) {
    if (
      descriptor.version !== release.version ||
      descriptor.source_commit !== release.source_commit ||
      descriptor.release_tag !== release.release_tag ||
      descriptor.firmware_variant !== release.firmware_variant
    ) {
      throw new Error("candidate release group contains conflicting release intent");
    }
    const artifact = profileArtifact(metadata, descriptor);
    if (
      artifact.hardware_profile !== descriptor.hardware_revisions[0] ||
      artifact.pcb_marking !== descriptor.pcb_markings[0] ||
      artifact.firmware?.bytes !== descriptor.bytes ||
      artifact.firmware?.sha256 !== descriptor.sha256 ||
      artifact.debug_elf?.bytes !== descriptor.debug_bytes ||
      artifact.debug_elf?.sha256 !== descriptor.debug_sha256
    ) {
      throw new Error(`${descriptor.file} descriptor differs from candidate metadata`);
    }
    for (const name of [artifact.firmware.file, artifact.debug_elf.file]) {
      if (basename(name) !== name) {
        throw new Error("candidate metadata contains an unsafe artifact filename");
      }
    }
    attestationFiles.push(
      join(candidateRoot, artifact.firmware.file),
      join(candidateRoot, artifact.debug_elf.file),
    );
    await verifyAndCopy({
      source: join(candidateRoot, artifact.firmware.file),
      destination: join(output, descriptor.file),
      descriptor,
    });
    await verifyAndCopy({
      source: join(candidateRoot, artifact.debug_elf.file),
      destination: join(output, descriptor.debug_file),
      descriptor,
      debug: true,
    });
  }
  await verifyAttestations({
    repository,
    provenance,
    sourceCommit: release.source_commit,
    files: attestationFiles,
  });
}

async function materializeCloudGroup({
  root,
  output,
  repository,
  descriptors,
  provenance,
  fetchCandidate,
  fetchPublishedRelease,
  verifyAttestations,
}) {
  validateCloudProvenance(provenance, repository);
  const release = descriptors[0];
  if (provenance.artifact_name !== `frogalert-candidate-${release.source_commit}`) {
    throw new Error("candidate artifact name is not bound to the release source commit");
  }
  if (FIRMWARE_VARIANTS.get(release.firmware_variant) !== provenance.build_lane) {
    throw new Error("release firmware variant does not match its candidate lane");
  }
  try {
    await materializeCandidateGroup({
      root,
      output,
      repository,
      descriptors,
      provenance,
      fetchCandidate,
      verifyAttestations,
    });
  } catch (error) {
    if (!(error instanceof CandidateArtifactUnavailableError)) throw error;
    try {
      await materializePublishedReleaseGroup({
        root,
        output,
        repository,
        descriptors,
        fetchPublishedRelease,
      });
    } catch (releaseError) {
      throw new Error(
        `candidate artifact is unavailable and published release fallback failed: ${releaseError.message}`,
        { cause: releaseError },
      );
    }
  }
}

export async function materializeFirmwareArtifacts({
  repositoryRoot,
  outputRoot,
  fetchCandidate = downloadGithubCandidate,
  fetchPublishedRelease = downloadGithubPublishedRelease,
  verifyAttestations = verifyGithubAttestations,
} = {}) {
  const root = resolve(repositoryRoot || ".");
  const output = assertSafeOutput(root, outputRoot || join(root, "tmp", "release-artifacts"));
  const releaseRoot = join(root, "firmware", "releases");
  const manifest = JSON.parse(await readFile(join(releaseRoot, "manifest.json"), "utf8"));
  const quarantine = JSON.parse(await readFile(join(root, "firmware", "quarantine.json"), "utf8"));
  validateFirmwarePublicationManifest(manifest, quarantine);

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const cloudGroups = new Map();
  for (const descriptor of manifest.releases) {
    if (descriptor.build_provenance?.kind === "github-actions-candidate") {
      const provenance = validateCloudProvenance(
        descriptor.build_provenance,
        manifest.github_repository,
      );
      const key = `${descriptor.release_tag}:${provenance.artifact_id}:${provenance.build_lane}`;
      const group = cloudGroups.get(key) || { provenance, descriptors: [] };
      if (JSON.stringify(group.provenance) !== JSON.stringify(provenance)) {
        throw new Error("release group has conflicting candidate provenance");
      }
      group.descriptors.push(descriptor);
      cloudGroups.set(key, group);
      continue;
    }
    await verifyAndCopy({
      source: join(releaseRoot, descriptor.file),
      destination: join(output, descriptor.file),
      descriptor,
    });
    await verifyAndCopy({
      source: join(releaseRoot, descriptor.debug_file),
      destination: join(output, descriptor.debug_file),
      descriptor,
      debug: true,
    });
  }

  for (const { provenance, descriptors } of cloudGroups.values()) {
    await materializeCloudGroup({
      root,
      output,
      repository: manifest.github_repository,
      descriptors,
      provenance,
      fetchCandidate,
      fetchPublishedRelease,
      verifyAttestations,
    });
  }

  for (const descriptor of [...manifest.lab_images, ...manifest.recovery_images]) {
    await verifyAndCopy({
      source: join(releaseRoot, descriptor.file),
      destination: join(output, descriptor.file),
      descriptor,
    });
  }

  return { manifest, outputRoot: output };
}

async function runCli() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const outputRoot = resolve(repositoryRoot, process.argv[2] || "tmp/release-artifacts");
  const { manifest } = await materializeFirmwareArtifacts({
    repositoryRoot,
    outputRoot,
  });
  console.log(
    `materialized ${manifest.releases.length} approved FrogAlert release image${manifest.releases.length === 1 ? "" : "s"} from recorded sources`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await runCli();
}
