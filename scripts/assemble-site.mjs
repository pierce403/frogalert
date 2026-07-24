#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";

import { validateLabDescriptor, validateRecoveryDescriptor } from "../site/wchisp-protocol.js";
import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";
import {
  validateFirmwarePublicationManifest,
  validateHardwareEvidenceRecord,
  validateHardwareEvidenceTranscript,
} from "./firmware-publication.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(repositoryRoot, process.argv[2] || "_site");
const releaseRoot = join(repositoryRoot, "firmware", "releases");

if (outputRoot === repositoryRoot || !outputRoot.startsWith(`${repositoryRoot}/`)) {
  throw new Error("site output must be a directory inside the FrogAlert repository");
}

const manifestPath = join(releaseRoot, "manifest.json");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const quarantine = JSON.parse(await readFile(join(repositoryRoot, "firmware", "quarantine.json")));
if (
  manifest.schema_version !== 4 ||
  !Array.isArray(manifest.releases) ||
  !Array.isArray(manifest.lab_images) ||
  !Array.isArray(manifest.recovery_images)
) {
  throw new Error("unsupported firmware release manifest schema");
}
validateFirmwarePublicationManifest(manifest, quarantine);

for (const artifact of quarantine.artifacts) {
  try {
    await readFile(join(repositoryRoot, artifact.evidence));
  } catch {
    throw new Error(`quarantined firmware evidence record is unavailable: ${artifact.evidence}`);
  }
}

for (const descriptor of [...manifest.releases, ...manifest.lab_images]) {
  try {
    const evidenceRecord = JSON.parse(
      await readFile(join(repositoryRoot, descriptor.hardware_evidence.record), "utf8"),
    );
    validateHardwareEvidenceRecord(descriptor, evidenceRecord, descriptor.file);
    const evidenceTranscript = await readFile(
      join(repositoryRoot, evidenceRecord.transcript),
      "utf8",
    );
    validateHardwareEvidenceTranscript(
      descriptor,
      evidenceRecord,
      evidenceTranscript,
      descriptor.file,
    );
  } catch {
    throw new Error(
      `physical hardware evidence record is unavailable or invalid: ${descriptor.hardware_evidence.record}`,
    );
  }
}

const labIds = new Set();
for (const lab of manifest.lab_images) {
  validateLabDescriptor(lab);
  if (labIds.has(lab.id)) {
    throw new Error(`duplicate firmware lab image id: ${lab.id}`);
  }
  labIds.add(lab.id);
}

if (manifest.recovery_images.length !== 1) {
  throw new Error("manifest must contain exactly one reviewed open BadgeMagic recovery image");
}
validateRecoveryDescriptor(manifest.recovery_images[0], "HARDWARE_REV1");

const descriptors = [...manifest.releases, ...manifest.lab_images, ...manifest.recovery_images];
const listedFiles = new Set();
for (const descriptor of descriptors) {
  if (
    typeof descriptor.file !== "string" ||
    basename(descriptor.file) !== descriptor.file ||
    !descriptor.file.endsWith(".bin")
  ) {
    throw new Error(`unsafe firmware artifact filename: ${descriptor.file}`);
  }
  if (listedFiles.has(descriptor.file)) {
    throw new Error(`duplicate firmware artifact in manifest: ${descriptor.file}`);
  }
  listedFiles.add(descriptor.file);

  const bytes = await readFile(join(releaseRoot, descriptor.file));
  assertCh58xUserOptionMagic(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256.toLowerCase()) {
    throw new Error(`firmware artifact does not match manifest: ${descriptor.file}`);
  }
}

const listedDebugFiles = new Set();
for (const descriptor of manifest.releases) {
  if (
    typeof descriptor.debug_file !== "string" ||
    basename(descriptor.debug_file) !== descriptor.debug_file ||
    !descriptor.debug_file.endsWith(".elf")
  ) {
    throw new Error(`unsafe firmware debug ELF filename: ${descriptor.debug_file}`);
  }
  if (listedDebugFiles.has(descriptor.debug_file)) {
    throw new Error(`duplicate firmware debug ELF in manifest: ${descriptor.debug_file}`);
  }
  listedDebugFiles.add(descriptor.debug_file);
  const bytes = await readFile(join(releaseRoot, descriptor.debug_file));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.byteLength !== descriptor.debug_bytes ||
    bytes.byteLength < 64 ||
    bytes[0] !== 0x7f ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0x4c ||
    bytes[3] !== 0x46 ||
    digest !== descriptor.debug_sha256.toLowerCase()
  ) {
    throw new Error(`firmware debug ELF does not match manifest: ${descriptor.debug_file}`);
  }
}

const sourceBins = (await readdir(releaseRoot)).filter((name) => name.endsWith(".bin"));
for (const name of sourceBins) {
  if (!listedFiles.has(name)) {
    throw new Error(`refusing to publish unlisted firmware artifact: ${name}`);
  }
}
const sourceElfs = (await readdir(releaseRoot)).filter((name) => name.endsWith(".elf"));
for (const name of sourceElfs) {
  if (!listedDebugFiles.has(name)) {
    throw new Error(`refusing to publish unlisted firmware debug ELF: ${name}`);
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "firmware", "releases"), { recursive: true });
for (const name of ["index.html", "CNAME", ".nojekyll"]) {
  await cp(join(repositoryRoot, name), join(outputRoot, name));
}
await cp(join(repositoryRoot, "site"), join(outputRoot, "site"), { recursive: true });
await cp(join(repositoryRoot, "flash"), join(outputRoot, "flash"), { recursive: true });
await cp(
  join(repositoryRoot, "firmware", "quarantine.json"),
  join(outputRoot, "firmware", "quarantine.json"),
);
await writeFile(join(outputRoot, "firmware", "releases", "manifest.json"), manifestBytes);
for (const name of listedFiles) {
  await cp(join(releaseRoot, name), join(outputRoot, "firmware", "releases", name));
}

console.log(
  `assembled ${outputRoot} with ${listedFiles.size} manifest-listed firmware artifact${listedFiles.size === 1 ? "" : "s"}`,
);
