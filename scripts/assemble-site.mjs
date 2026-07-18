#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(repositoryRoot, process.argv[2] || "_site");
const releaseRoot = join(repositoryRoot, "firmware", "releases");

if (outputRoot === repositoryRoot || !outputRoot.startsWith(`${repositoryRoot}/`)) {
  throw new Error("site output must be a directory inside the FrogAlert repository");
}

const manifestPath = join(releaseRoot, "manifest.json");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
if (
  manifest.schema_version !== 2 ||
  !Array.isArray(manifest.releases) ||
  !Array.isArray(manifest.recovery_images)
) {
  throw new Error("unsupported firmware release manifest schema");
}

const descriptors = [...manifest.releases, ...manifest.recovery_images];
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
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256.toLowerCase()) {
    throw new Error(`firmware artifact does not match manifest: ${descriptor.file}`);
  }
}

const sourceBins = (await readdir(releaseRoot)).filter((name) => name.endsWith(".bin"));
for (const name of sourceBins) {
  if (!listedFiles.has(name)) {
    throw new Error(`refusing to publish unlisted firmware artifact: ${name}`);
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "firmware", "releases"), { recursive: true });
for (const name of ["index.html", "CNAME", ".nojekyll"]) {
  await cp(join(repositoryRoot, name), join(outputRoot, name));
}
await cp(join(repositoryRoot, "site"), join(outputRoot, "site"), { recursive: true });
await writeFile(join(outputRoot, "firmware", "releases", "manifest.json"), manifestBytes);
for (const name of listedFiles) {
  await cp(join(releaseRoot, name), join(outputRoot, "firmware", "releases", name));
}

console.log(
  `assembled ${outputRoot} with ${listedFiles.size} manifest-listed firmware artifact${listedFiles.size === 1 ? "" : "s"}`,
);
