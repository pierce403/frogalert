#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";
import {
  compareFirmwareVersions,
  loadFirmwareVersion,
} from "./frogalert-version.mjs";

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WORKFLOW_PATH = ".github/workflows/ci.yml";

const PROFILES = Object.freeze([
  Object.freeze({
    hardwareProfile: "B1144C_260404_USB_C",
    pcbMarking: "B1144C_260404",
    position: "top",
    idSuffix: "b1144c-260404-usbc",
    fileSuffix: "b1144c-260404-usb-c",
  }),
  Object.freeze({
    hardwareProfile: "B1144C_250901_USB_C",
    pcbMarking: "B1144C_250901",
    position: "bottom",
    idSuffix: "b1144c-250901-usbc",
    fileSuffix: "b1144c-250901-usb-c",
  }),
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireCommit(value, message = "release source commit is invalid") {
  if (!COMMIT_PATTERN.test(value || "")) throw new Error(message);
  return value;
}

function requirePositiveInteger(value, message) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(message);
  return number;
}

function normalizeArtifactDigest(value) {
  const digest = String(value || "").startsWith("sha256:")
    ? String(value)
    : `sha256:${String(value || "")}`;
  if (!ARTIFACT_DIGEST_PATTERN.test(digest)) {
    throw new Error("candidate artifact digest is invalid");
  }
  return digest;
}

function releaseChannel(version) {
  const prerelease = version.split("-", 2)[1];
  if (!prerelease) return "stable";
  const channel = prerelease.split(".", 1)[0].toLowerCase();
  if (!new Set(["alpha", "beta"]).has(channel)) {
    throw new Error(`candidate version ${version} has no supported release channel`);
  }
  return channel;
}

function assertSafeCandidateFilename(value, extension, description) {
  if (
    typeof value !== "string" ||
    basename(value) !== value ||
    !value.endsWith(extension)
  ) {
    throw new Error(`${description} filename is invalid`);
  }
}

function assertElf(bytes, description) {
  if (
    bytes.byteLength < 64 ||
    bytes[0] !== 0x7f ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0x4c ||
    bytes[3] !== 0x46
  ) {
    throw new Error(`${description} is not an ELF`);
  }
}

async function verifyCandidateFile({
  candidateRoot,
  metadata,
  kind,
  description,
}) {
  const extension = kind === "firmware" ? ".bin" : ".elf";
  assertSafeCandidateFilename(metadata?.file, extension, description);
  if (
    !Number.isSafeInteger(metadata.bytes) ||
    metadata.bytes < (kind === "firmware" ? 1 : 64) ||
    !SHA256_PATTERN.test(metadata.sha256 || "")
  ) {
    throw new Error(`${description} metadata is invalid`);
  }
  const bytes = await readFile(join(candidateRoot, metadata.file));
  if (kind === "firmware") assertCh58xUserOptionMagic(bytes);
  else assertElf(bytes, description);
  if (bytes.byteLength !== metadata.bytes || sha256(bytes) !== metadata.sha256) {
    throw new Error(`${description} differs from candidate metadata`);
  }
  return {
    file: metadata.file,
    bytes: metadata.bytes,
    sha256: metadata.sha256,
  };
}

async function loadAndVerifyCandidate({
  candidateRoot,
  repository,
  sourceCommit,
  workflowRunId,
  workflowRunAttempt,
}) {
  const metadataBytes = await readFile(join(candidateRoot, "candidate.json"));
  const metadata = JSON.parse(metadataBytes);
  if (
    metadata.schema_version !== 3 ||
    metadata.kind !== "frogalert-candidate" ||
    !VERSION_PATTERN.test(metadata.version || "") ||
    metadata.source_commit !== sourceCommit ||
    metadata.github_repository !== repository ||
    metadata.build_lane !== "survey" ||
    metadata.hardware_verified !== false ||
    metadata.flash_approved !== false ||
    metadata.publishable !== false ||
    metadata.hosted_on_site !== false
  ) {
    throw new Error("counter candidate metadata is not a publishable CI receipt");
  }
  if (
    metadata.provenance?.provider !== "github-actions" ||
    metadata.provenance?.repository !== repository ||
    metadata.provenance?.run_id !== String(workflowRunId) ||
    metadata.provenance?.run_attempt !== String(workflowRunAttempt) ||
    metadata.provenance?.job !== "firmware-candidate" ||
    metadata.provenance?.workflow !==
      `${repository}/${WORKFLOW_PATH}@refs/heads/main`
  ) {
    throw new Error("counter candidate is not bound to the triggering CI run");
  }

  const artifacts = new Map();
  for (const profile of PROFILES) {
    const candidate = metadata.artifacts?.[profile.hardwareProfile];
    if (
      candidate?.hardware_profile !== profile.hardwareProfile ||
      candidate?.pcb_marking !== profile.pcbMarking
    ) {
      throw new Error(`counter candidate is missing ${profile.hardwareProfile}`);
    }
    artifacts.set(profile.hardwareProfile, {
      firmware: await verifyCandidateFile({
        candidateRoot,
        metadata: candidate.firmware,
        kind: "firmware",
        description: `${profile.hardwareProfile} candidate BIN`,
      }),
      debugElf: await verifyCandidateFile({
        candidateRoot,
        metadata: candidate.debug_elf,
        kind: "debug",
        description: `${profile.hardwareProfile} candidate ELF`,
      }),
    });
  }

  return {
    version: metadata.version,
    candidateMetadataSha256: sha256(metadataBytes),
    artifacts,
  };
}

function releaseNotes(version) {
  return [
    `# FrogAlert ${version}`,
    "",
    "This FrogAlert release was built, audited, and published automatically by the canonical GitHub Actions workflow so it can be flashed directly from a phone.",
    "",
    "Two exact counter images are included:",
    "",
    "- the top-button image for PCB marking `B1144C_260404`;",
    "- the bottom-button image for PCB marking `B1144C_250901`.",
    "",
    "The release preserves the BadgeMagic nametag and upload path while adding FrogAlert's passive Bluetooth survey, counter, and configured alerts. The site checks the selected image's profile, size, SHA-256, startup sentinel, and quarantine status before programming, then verifies the programmed bytes.",
    "",
    "This is a CI-audited release and has not been physically smoke-tested before publication. Match the button path shown by the mobile flasher to the badge, keep the badge connected through verification, and remember that the original read-protected OEM image cannot be backed up or restored.",
    "",
  ].join("\n");
}

function descriptorFor({
  profile,
  artifact,
  version,
  channel,
  repository,
  sourceCommit,
  publishedAt,
  provenance,
}) {
  const releaseTag = `v${version}`;
  const stem = `frogalert-${version}-${profile.position}-${profile.fileSuffix}`;
  return {
    id: `frogalert-${version}-${profile.idSuffix}`,
    kind: "frogalert-release",
    label: "FrogAlert",
    version,
    channel,
    release_tag: releaseTag,
    release_url: `https://github.com/${repository}/releases/tag/${releaseTag}`,
    release_notes: `firmware/releases/notes/${releaseTag}.md`,
    published_at: publishedAt,
    firmware_variant: "counter",
    target: "ch582m-badgemagic-11x44",
    hardware_revisions: [profile.hardwareProfile],
    pcb_markings: [profile.pcbMarking],
    source_commit: sourceCommit,
    file: `${stem}.bin`,
    bytes: artifact.firmware.bytes,
    sha256: artifact.firmware.sha256,
    debug_file: `${stem}.elf`,
    debug_bytes: artifact.debugElf.bytes,
    debug_sha256: artifact.debugElf.sha256,
    hardware_verified: false,
    verification_basis: "ci-audited",
    flash_approved: true,
    build_provenance: provenance,
  };
}

function sortedDescriptors(descriptors) {
  return [...descriptors].sort((left, right) => left.id.localeCompare(right.id));
}

async function ensureReleaseNotes(repositoryRoot, notesPath, version) {
  const absolute = join(repositoryRoot, notesPath);
  try {
    await readFile(absolute, "utf8");
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, releaseNotes(version));
  return true;
}

export async function recordFirmwareRelease({
  repositoryRoot,
  candidateRoot,
  repository,
  sourceCommit,
  workflowRunId,
  workflowRunAttempt,
  artifactId,
  artifactName,
  artifactDigest,
  publishedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  const root = resolve(repositoryRoot || ".");
  const candidate = resolve(candidateRoot || join(root, "tmp/firmware-candidate/counter"));
  if (!REPOSITORY_PATTERN.test(repository || "")) {
    throw new Error("release GitHub repository is invalid");
  }
  const commit = requireCommit(sourceCommit);
  const runId = requirePositiveInteger(workflowRunId, "candidate workflow run id is invalid");
  const runAttempt = requirePositiveInteger(
    workflowRunAttempt,
    "candidate workflow run attempt is invalid",
  );
  const candidateArtifactId = requirePositiveInteger(
    artifactId,
    "candidate artifact id is invalid",
  );
  const expectedArtifactName = `frogalert-candidate-${commit}`;
  if (artifactName !== expectedArtifactName) {
    throw new Error("candidate artifact name is not bound to the source commit");
  }
  const archiveDigest = normalizeArtifactDigest(artifactDigest);
  if (!DATE_PATTERN.test(publishedAt || "")) {
    throw new Error("release publication date is invalid");
  }

  const receipt = await loadAndVerifyCandidate({
    candidateRoot: candidate,
    repository,
    sourceCommit: commit,
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
  });
  const declaredVersion = await loadFirmwareVersion(
    join(root, "firmware", "fossasia-usbc", "version.json"),
  );
  if (receipt.version !== declaredVersion.version) {
    throw new Error(
      `counter candidate version ${receipt.version} does not match source version ${declaredVersion.version}`,
    );
  }
  const manifestPath = join(root, "firmware/releases/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schema_version !== 5 ||
    manifest.github_repository !== repository ||
    !Array.isArray(manifest.releases)
  ) {
    throw new Error("firmware release manifest cannot accept an automatic release");
  }

  const existingVersion = manifest.releases.filter(
    (release) => release.version === receipt.version,
  );
  if (existingVersion.length === 0) {
    const nonOlderRelease = manifest.releases.find(
      (release) =>
        compareFirmwareVersions(receipt.version, release.version) <= 0,
    );
    if (nonOlderRelease) {
      throw new Error(
        `automatic release version ${receipt.version} must advance beyond existing ${nonOlderRelease.version}`,
      );
    }
  }
  const effectivePublishedAt = existingVersion[0]?.published_at || publishedAt;
  const provenance = {
    kind: "github-actions-candidate",
    workflow_run_id: runId,
    workflow_path: WORKFLOW_PATH,
    workflow_run_attempt: runAttempt,
    artifact_id: candidateArtifactId,
    artifact_name: artifactName,
    artifact_digest: archiveDigest,
    candidate_metadata_sha256: receipt.candidateMetadataSha256,
    build_lane: "survey",
  };
  const descriptors = PROFILES.map((profile) =>
    descriptorFor({
      profile,
      artifact: receipt.artifacts.get(profile.hardwareProfile),
      version: receipt.version,
      channel: releaseChannel(receipt.version),
      repository,
      sourceCommit: commit,
      publishedAt: effectivePublishedAt,
      provenance,
    }),
  );

  if (existingVersion.length > 0) {
    if (
      existingVersion.length !== descriptors.length ||
      !isDeepStrictEqual(
        sortedDescriptors(existingVersion),
        sortedDescriptors(descriptors),
      )
    ) {
      throw new Error(
        `release version ${receipt.version} already exists with different bytes, source, or provenance`,
      );
    }
    const notesChanged = await ensureReleaseNotes(
      root,
      descriptors[0].release_notes,
      receipt.version,
    );
    return {
      changed: notesChanged,
      version: receipt.version,
      releaseTag: descriptors[0].release_tag,
      descriptors,
      notesPath: descriptors[0].release_notes,
    };
  }

  const occupiedIds = new Set(manifest.releases.map((release) => release.id));
  const occupiedFiles = new Set(
    manifest.releases.flatMap((release) => [release.file, release.debug_file]),
  );
  for (const descriptor of descriptors) {
    if (occupiedIds.has(descriptor.id)) {
      throw new Error(`automatic release id is already occupied: ${descriptor.id}`);
    }
    if (
      occupiedFiles.has(descriptor.file) ||
      occupiedFiles.has(descriptor.debug_file)
    ) {
      throw new Error(`automatic release filename is already occupied: ${descriptor.file}`);
    }
  }

  await ensureReleaseNotes(root, descriptors[0].release_notes, receipt.version);
  manifest.updated = publishedAt;
  manifest.releases.push(...descriptors);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    changed: true,
    version: receipt.version,
    releaseTag: descriptors[0].release_tag,
    descriptors,
    notesPath: descriptors[0].release_notes,
  };
}

async function runCli() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const candidateRoot = resolve(
    repositoryRoot,
    process.argv[2] || "tmp/firmware-candidate/counter",
  );
  const result = await recordFirmwareRelease({
    repositoryRoot,
    candidateRoot,
    repository: process.env.GITHUB_REPOSITORY || "pierce403/frogalert",
    sourceCommit:
      process.env.FROGALERT_RELEASE_SOURCE_COMMIT || process.env.GITHUB_SHA,
    workflowRunId:
      process.env.FROGALERT_RELEASE_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID,
    workflowRunAttempt:
      process.env.FROGALERT_RELEASE_WORKFLOW_RUN_ATTEMPT ||
      process.env.GITHUB_RUN_ATTEMPT,
    artifactId: process.env.FROGALERT_RELEASE_ARTIFACT_ID,
    artifactName: process.env.FROGALERT_RELEASE_ARTIFACT_NAME,
    artifactDigest: process.env.FROGALERT_RELEASE_ARTIFACT_DIGEST,
    publishedAt: process.env.FROGALERT_RELEASE_PUBLISHED_AT,
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${result.changed ? "true" : "false"}\nversion=${result.version}\nrelease_tag=${result.releaseTag}\nnotes_path=${result.notesPath}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      result.changed
        ? `Recorded FrogAlert ${result.version} as a paired CI-audited release.\n`
        : `FrogAlert ${result.version} was already recorded exactly; no metadata changed.\n`,
    );
  }
  console.log(
    result.changed
      ? `recorded FrogAlert ${result.version} automatic release metadata`
      : `FrogAlert ${result.version} release metadata is already exact`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await runCli();
}
