#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";
import { validateFirmwarePublicationManifest } from "./firmware-publication.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BUILD_LANES = new Set(["survey", "frogs"]);
const FIRMWARE_VARIANTS = new Map([
  ["counter", "survey"],
  ["frogs", "frogs"],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
    run.run_attempt !== provenance.workflow_run_attempt ||
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

export async function downloadGithubCandidate({
  repository,
  provenance,
  sourceCommit,
  outputRoot,
}) {
  validateCloudProvenance(provenance, repository);
  const runResult = await run("gh", [
    "api",
    `repos/${repository}/actions/runs/${provenance.workflow_run_id}`,
  ]);
  validateGithubActionsRun(JSON.parse(runResult.stdout), {
    repository,
    provenance,
    sourceCommit,
  });
  const metadataResult = await run("gh", [
    "api",
    `repos/${repository}/actions/artifacts/${provenance.artifact_id}`,
  ]);
  const remote = JSON.parse(metadataResult.stdout);
  if (
    remote.id !== provenance.artifact_id ||
    remote.name !== provenance.artifact_name ||
    remote.workflow_run?.id !== provenance.workflow_run_id ||
    remote.workflow_run?.head_sha !== sourceCommit ||
    remote.digest !== provenance.artifact_digest ||
    remote.expired === true
  ) {
    throw new Error("GitHub candidate artifact does not match recorded provenance");
  }
  await run("gh", [
    "run",
    "download",
    String(provenance.workflow_run_id),
    "--repo",
    repository,
    "--name",
    provenance.artifact_name,
    "--dir",
    outputRoot,
  ]);
  return outputRoot;
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

async function materializeCloudGroup({
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

export async function materializeFirmwareArtifacts({
  repositoryRoot,
  outputRoot,
  fetchCandidate = downloadGithubCandidate,
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
