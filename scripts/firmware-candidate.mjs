#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PROFILE = "B1144C_250901_USB_C";
const BUILD_LANE = "survey";

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

export function firmwareCandidateVersion(sourceCommit) {
  return `0.0.0-candidate.${requireCommit(sourceCommit).slice(0, 12)}`;
}

export async function buildFirmwareCandidateBundle({
  repositoryRoot,
  outputRoot,
  sourceCommit,
  repository = "pierce403/frogalert",
} = {}) {
  const root = resolve(repositoryRoot || ".");
  const scratchRoot = join(root, "tmp");
  const output = resolve(outputRoot || join(scratchRoot, "firmware-candidate"));
  if (!output.startsWith(`${scratchRoot}/`)) {
    throw new Error("candidate output must stay under the repository tmp directory");
  }

  const commit = requireCommit(sourceCommit);
  const githubRepository = requireRepository(repository);
  const version = firmwareCandidateVersion(commit);
  const stem = `frogalert-${version}-b1144c-250901-usbc`;
  const binName = `${stem}.bin`;
  const elfName = `${stem}.elf`;

  const lock = JSON.parse(
    await readFile(join(root, "firmware", "fossasia-usbc", "upstream-lock.json"), "utf8"),
  );
  if (
    lock.schema_version !== 1 ||
    lock.profile !== PROFILE ||
    lock.hardware_status !== "build-evidence-only" ||
    !lock.upstream?.commit ||
    !lock.toolchain?.archive_sha256 ||
    !Number.isSafeInteger(lock.build?.known_good_survey_size) ||
    typeof lock.build?.known_good_survey_sha256 !== "string"
  ) {
    throw new Error("candidate build lock is invalid");
  }

  const buildRoot = join(root, "tmp", "fossasia-usbc", "build", BUILD_LANE);
  const bin = await readFile(join(buildRoot, "badgemagic-ch582.bin"));
  const elf = await readFile(join(buildRoot, "badgemagic-ch582.elf"));
  const binFromElf = await readFile(
    join(buildRoot, "badgemagic-ch582.from-elf.bin"),
  );
  assertCh58xUserOptionMagic(bin);
  assertElf(elf);
  if (!bin.equals(binFromElf)) {
    throw new Error("candidate BIN is not the audited ELF's exact loadable bytes");
  }

  const binSha256 = sha256(bin);
  const elfSha256 = sha256(elf);
  if (
    bin.byteLength !== lock.build.known_good_survey_size ||
    binSha256 !== lock.build.known_good_survey_sha256
  ) {
    throw new Error("candidate BIN does not match the audited survey lock");
  }

  const metadata = {
    schema_version: 1,
    id: `${stem}-${commit}`,
    kind: "frogalert-candidate",
    label: "FrogAlert CI candidate",
    version,
    channel: "candidate",
    source_commit: commit,
    github_repository: githubRepository,
    target: "ch582m-badgemagic-11x44",
    hardware_profile: PROFILE,
    build_lane: BUILD_LANE,
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
    artifacts: {
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
    },
    warning:
      "Hardware-unverified CI build evidence only. Not a FrogAlert release, not approved for flashing, and never served by the website.",
  };

  const readme = [
    "# FrogAlert hardware-unverified CI candidate",
    "",
    `Version: ${version}`,
    `Source commit: ${commit}`,
    `Target profile: ${PROFILE}`,
    `Firmware SHA-256: ${binSha256}`,
    "",
    "This archive is build evidence only. It is not a FrogAlert release, has not passed exact-board physical testing, is not approved for flashing, and is never copied into the website firmware catalog.",
    "",
    "Only a separately reviewed manifest entry with complete hash-bound physical evidence may reach GitHub Releases or frogalert.org/flash/.",
    "",
  ].join("\n");
  const checksums = [
    `${binSha256}  ${binName}`,
    `${elfSha256}  ${elfName}`,
    "",
  ].join("\n");

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await copyFile(join(buildRoot, "badgemagic-ch582.bin"), join(output, binName));
  await copyFile(join(buildRoot, "badgemagic-ch582.elf"), join(output, elfName));
  await writeFile(join(output, "candidate.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(join(output, "SHA256SUMS"), checksums);
  await writeFile(join(output, "README.md"), readme);

  return metadata;
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
  });
  console.log(
    `prepared ${metadata.version} hardware-unverified candidate in ${relative(repositoryRoot, outputRoot)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await runCli();
}
