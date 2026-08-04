#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareFirmwareVersions,
  validateFirmwareVersion,
} from "./frogalert-version.mjs";

export function requireFirmwareVersionBump(previousMetadata, currentMetadata) {
  const previous = validateFirmwareVersion(previousMetadata);
  const current = validateFirmwareVersion(currentMetadata);
  assert.ok(
    compareFirmwareVersions(current.version, previous.version) > 0,
    `active firmware changes must advance version.json beyond ${previous.version}; found ${current.version}`,
  );
  return current;
}

async function main(argv) {
  assert.equal(
    argv.length,
    2,
    "usage: require-firmware-version-bump.mjs PREVIOUS_VERSION_JSON CURRENT_VERSION_JSON",
  );
  const [previousPath, currentPath] = argv.map((value) => path.resolve(value));
  const previous = JSON.parse(await readFile(previousPath, "utf8"));
  const current = JSON.parse(await readFile(currentPath, "utf8"));
  const result = requireFirmwareVersionBump(previous, current);
  console.log(`firmware version advances to ${result.version}`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`FrogAlert firmware version policy error: ${error.message}`);
    process.exitCode = 1;
  });
}
