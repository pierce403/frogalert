#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";
import { loadFirmwareVersion } from "./frogalert-version.mjs";

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PROFILES = Object.freeze([
  "B1144C_260404_USB_C",
  "B1144C_250901_USB_C",
]);
const DEFAULT_PROFILE = PROFILES[0];
const BUILD_LANES = Object.freeze(["survey", "frogs"]);
const FIRMWARE_VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const GITHUB_JOB_PATTERN = /^[A-Za-z0-9_.-]+$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireCommit(sourceCommit) {
  if (!COMMIT_PATTERN.test(sourceCommit || "")) {
    throw new Error("candidate source commit must be a full lowercase Git commit id");
  }
  return sourceCommit;
}

function requireRepository(repository) {
  if (!REPOSITORY_PATTERN.test(repository || "")) {
    throw new Error("candidate GitHub repository must be owner/name");
  }
  return repository;
}

function requireNonemptyString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}

function requirePositiveIntegerString(value, message) {
  const normalized = String(value || "");
  if (!POSITIVE_INTEGER_PATTERN.test(normalized)) throw new Error(message);
  return normalized;
}

export function validateGitHubActionsProvenance(provenance, repository) {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    throw new Error("candidate GitHub Actions provenance is required");
  }
  const githubRepository = requireRepository(repository);
  if (provenance.repository !== githubRepository) {
    throw new Error("candidate GitHub Actions repository does not match the candidate repository");
  }
  const workflow = requireNonemptyString(
    provenance.workflow,
    "candidate GitHub Actions workflow is required",
  );
  if (!workflow.includes("/.github/workflows/") || !workflow.includes("@")) {
    throw new Error("candidate GitHub Actions workflow reference is invalid");
  }
  const job = requireNonemptyString(
    provenance.job,
    "candidate GitHub Actions job is required",
  );
  if (!GITHUB_JOB_PATTERN.test(job)) {
    throw new Error("candidate GitHub Actions job is invalid");
  }
  return {
    provider: "github-actions",
    repository: githubRepository,
    run_id: requirePositiveIntegerString(
      provenance.run_id,
      "candidate GitHub Actions run id is invalid",
    ),
    workflow,
    job,
    run_attempt: requirePositiveIntegerString(
      provenance.run_attempt,
      "candidate GitHub Actions run attempt is invalid",
    ),
  };
}

export function githubActionsProvenanceFromEnvironment(environment = process.env) {
  return {
    repository: environment.FROGALERT_CANDIDATE_GITHUB_REPOSITORY,
    run_id: environment.FROGALERT_CANDIDATE_GITHUB_RUN_ID,
    workflow: environment.FROGALERT_CANDIDATE_GITHUB_WORKFLOW,
    job: environment.FROGALERT_CANDIDATE_GITHUB_JOB,
    run_attempt: environment.FROGALERT_CANDIDATE_GITHUB_RUN_ATTEMPT,
  };
}

function assertElf(bytes) {
  if (
    bytes.byteLength < 64 ||
    bytes[0] !== 0x7f ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0x4c ||
    bytes[3] !== 0x46
  ) {
    throw new Error("candidate debug artifact is not an ELF");
  }
}

function profileStem(profile) {
  return profile.toLowerCase().replaceAll("_", "-");
}

function profilePosition(profile) {
  return profile === "B1144C_250901_USB_C" ? "bottom" : "top";
}

export function firmwareCandidateVersion(version, sourceCommit) {
  if (!FIRMWARE_VERSION_PATTERN.test(version || "")) {
    throw new Error("candidate firmware version is invalid");
  }
  return `${version}+candidate.${requireCommit(sourceCommit).slice(0, 12)}`;
}

export async function buildFirmwareCandidateBundle({
  repositoryRoot,
  outputRoot,
  sourceCommit,
  repository = "pierce403/frogalert",
  buildLane = "survey",
  githubActionsProvenance,
} = {}) {
  const root = resolve(repositoryRoot || ".");
  const scratchRoot = join(root, "tmp");
  const output = resolve(outputRoot || join(scratchRoot, "firmware-candidate"));
  if (!output.startsWith(`${scratchRoot}/`)) {
    throw new Error("candidate output must stay under the repository tmp directory");
  }

  const commit = requireCommit(sourceCommit);
  const githubRepository = requireRepository(repository);
  const provenance = validateGitHubActionsProvenance(
    githubActionsProvenance,
    githubRepository,
  );
  if (!BUILD_LANES.includes(buildLane)) {
    throw new Error(`unsupported candidate build lane: ${buildLane}`);
  }
  const declaredVersion = await loadFirmwareVersion(
    join(root, "firmware", "fossasia-usbc", "version.json"),
  );
  const version = declaredVersion.version;
  const candidateVersion = firmwareCandidateVersion(version, commit);
  const lock = JSON.parse(
    await readFile(join(root, "firmware", "fossasia-usbc", "upstream-lock.json"), "utf8"),
  );
  if (
    lock.schema_version !== 2 ||
    lock.default_profile !== DEFAULT_PROFILE ||
    lock.hardware_status !== "build-evidence-only" ||
    !lock.upstream?.commit ||
    !lock.toolchain?.archive_sha256
  ) {
    throw new Error("candidate build lock is invalid");
  }

  const artifacts = {};
  const copies = [];
  const checksumLines = [];
  for (const profile of PROFILES) {
    if (!lock.profiles?.[profile]?.pcb_marking) {
      throw new Error(`candidate build lock is missing ${profile}`);
    }
    const buildRoot = join(
      root,
      "tmp",
      "fossasia-usbc",
      "build",
      profile,
      buildLane,
    );
    const bin = await readFile(join(buildRoot, "badgemagic-ch582.bin"));
    const elf = await readFile(join(buildRoot, "badgemagic-ch582.elf"));
    const binFromElf = await readFile(
      join(buildRoot, "badgemagic-ch582.from-elf.bin"),
    );
    assertCh58xUserOptionMagic(bin);
    assertElf(elf);
    if (!bin.equals(binFromElf)) {
      throw new Error(`${profile} candidate BIN is not the audited ELF's exact loadable bytes`);
    }

    const binSha256 = sha256(bin);
    const elfSha256 = sha256(elf);
    if (bin.byteLength === 0 || bin.byteLength > 448 * 1024) {
      throw new Error(`${profile} candidate BIN size is outside the CH582 application limit`);
    }

    const variant = buildLane === "frogs" ? "-frogs" : "";
    const stem =
      `frogalert${variant}-${version}-candidate-${commit.slice(0, 12)}-${profilePosition(profile)}-${profileStem(profile)}`;
    const binName = `${stem}.bin`;
    const elfName = `${stem}.elf`;
    artifacts[profile] = {
      hardware_profile: profile,
      pcb_marking: lock.profiles[profile].pcb_marking,
      firmware: {
        file: binName,
        bytes: bin.byteLength,
        sha256: binSha256,
      },
      debug_elf: {
        file: elfName,
        bytes: elf.byteLength,
        sha256: elfSha256,
      },
    };
    copies.push(
      [join(buildRoot, "badgemagic-ch582.bin"), binName],
      [join(buildRoot, "badgemagic-ch582.elf"), elfName],
    );
    checksumLines.push(
      `${binSha256}  ${binName}`,
      `${elfSha256}  ${elfName}`,
    );
  }

  const metadata = {
    schema_version: 3,
    id: `frogalert-${version}-${buildLane}-${commit}-run-${provenance.run_id}-${provenance.run_attempt}`,
    kind: "frogalert-candidate",
    label:
      buildLane === "frogs"
        ? "FrogAlert dancing-frog CI candidate"
        : "FrogAlert CI candidate",
    version,
    display_version: declaredVersion.display_version,
    candidate_version: candidateVersion,
    channel: "candidate",
    source_commit: commit,
    github_repository: githubRepository,
    provenance,
    target: "ch582m-badgemagic-11x44",
    default_hardware_profile: DEFAULT_PROFILE,
    hardware_profiles: [...PROFILES],
    build_lane: buildLane,
    hardware_verified: false,
    flash_approved: false,
    publishable: false,
    hosted_on_site: false,
    build: {
      upstream_commit: lock.upstream.commit,
      upstream_archive_sha256: lock.upstream.archive_sha256,
      toolchain: lock.toolchain.name,
      toolchain_archive_sha256: lock.toolchain.archive_sha256,
      compiler_sha256: lock.toolchain.compiler_sha256,
      usbc_version: lock.build.usbc_version,
    },
    artifacts,
    warning:
      "Hardware-unverified CI build evidence only. Not a FrogAlert release, not approved for flashing, and never served by the website.",
  };

  const readme = [
    "# FrogAlert hardware-unverified CI candidate",
    "",
    `Version: ${version}`,
    `Display version: ${declaredVersion.display_version}`,
    `Candidate revision: ${candidateVersion}`,
    `Source commit: ${commit}`,
    `GitHub Actions run: ${provenance.run_id} (attempt ${provenance.run_attempt}, job ${provenance.job})`,
    `Default target profile: ${DEFAULT_PROFILE}`,
    `Included profiles: ${PROFILES.join(", ")}`,
    `Build lane: ${buildLane}`,
    "",
    ...PROFILES.flatMap((profile) => [
      `- ${profile} (${artifacts[profile].pcb_marking}): \`${artifacts[profile].firmware.sha256}\``,
    ]),
    "",
    "This archive is build evidence only. It is not a FrogAlert release, has not passed exact-board physical testing, is not approved for flashing, and is never copied into the website firmware catalog.",
    "",
    "Only a separately reviewed manifest entry with complete hash-bound physical evidence may reach GitHub Releases or frogalert.org/flash/.",
    "",
  ].join("\n");

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [source, destination] of copies) {
    await copyFile(source, join(output, destination));
  }
  await writeFile(join(output, "candidate.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(join(output, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);
  await writeFile(join(output, "README.md"), readme);

  return metadata;
}

export function firmwareCandidateSummary(metadata) {
  const title =
    metadata.build_lane === "frogs"
      ? "Dancing-frog candidate"
      : "Counter candidate";
  return [
    `### ${title} · ${metadata.version}`,
    "",
    `Hardware-unverified build from \`${metadata.source_commit}\`; not approved for flashing or publication.`,
    "",
    "| Image | Profile | Bytes | SHA-256 |",
    "| --- | --- | ---: | --- |",
    ...PROFILES.map((profile) => {
      const artifact = metadata.artifacts[profile];
      return `| ${profilePosition(profile)} | \`${profile}\` | ${artifact.firmware.bytes} | \`${artifact.firmware.sha256}\` |`;
    }),
    "",
    "",
  ].join("\n");
}

async function runCli() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const outputRoot = resolve(
    repositoryRoot,
    process.argv[2] || "tmp/firmware-candidate",
  );
  const sourceCommit = process.env.FROGALERT_CANDIDATE_COMMIT;
  if (!sourceCommit) {
    throw new Error("FROGALERT_CANDIDATE_COMMIT is required");
  }
  const metadata = await buildFirmwareCandidateBundle({
    repositoryRoot,
    outputRoot,
    sourceCommit,
    repository: process.env.GITHUB_REPOSITORY || "pierce403/frogalert",
    buildLane: process.env.FROGALERT_CANDIDATE_LANE || "survey",
    githubActionsProvenance: githubActionsProvenanceFromEnvironment(),
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const metadataDigest = sha256(
      await readFile(join(outputRoot, "candidate.json")),
    );
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `${firmwareCandidateSummary(metadata)}Candidate metadata SHA-256: \`${metadataDigest}\`\n\n`,
    );
  }
  console.log(
    `prepared ${metadata.version} hardware-unverified candidate in ${relative(repositoryRoot, outputRoot)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await runCli();
}
