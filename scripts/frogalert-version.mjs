#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const defaultVersionPath = path.resolve(
  scriptDirectory,
  "../firmware/fossasia-usbc/version.json",
);

export function compactFirmwareVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(
    version,
  );
  assert.ok(match, "firmware version must be stable, alpha, beta, or rc semver");
  const [, major, minor, patch, channel, iteration] = match;
  const suffix = channel
    ? `${channel === "alpha" ? "a" : channel === "beta" ? "b" : "r"}${iteration}`
    : "";
  return `v${major}.${minor}.${patch}${suffix}`;
}

function parsedFirmwareVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(
    version,
  );
  assert.ok(match, "firmware version must be stable, alpha, beta, or rc semver");
  const [, major, minor, patch, channel, iteration] = match;
  return {
    core: [BigInt(major), BigInt(minor), BigInt(patch)],
    channel: channel || "stable",
    iteration: iteration === undefined ? 0n : BigInt(iteration),
  };
}

export function compareFirmwareVersions(leftVersion, rightVersion) {
  const left = parsedFirmwareVersion(leftVersion);
  const right = parsedFirmwareVersion(rightVersion);
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] > right.core[index] ? 1 : -1;
    }
  }
  const channelRank = new Map([
    ["alpha", 0],
    ["beta", 1],
    ["rc", 2],
    ["stable", 3],
  ]);
  const channelDifference =
    channelRank.get(left.channel) - channelRank.get(right.channel);
  if (channelDifference !== 0) return channelDifference > 0 ? 1 : -1;
  if (left.iteration === right.iteration) return 0;
  return left.iteration > right.iteration ? 1 : -1;
}

export function validateFirmwareVersion(metadata) {
  assert.equal(metadata?.schema_version, 1, "unsupported firmware version schema");
  assert.equal(typeof metadata.version, "string", "firmware version is required");
  assert.equal(
    typeof metadata.display_version,
    "string",
    "firmware display version is required",
  );
  assert.equal(
    metadata.display_version,
    compactFirmwareVersion(metadata.version),
    "display version must be the lossless compact form of the firmware version",
  );
  assert.match(
    metadata.display_version,
    /^v[0-9]+\.[0-9]+\.[0-9]+(?:[abr][0-9]+)?$/,
    "display version contains an unsupported 3x5 glyph",
  );
  assert.ok(
    metadata.display_version.length <= 10,
    "display version plus profile marker does not fit the 44-column panel",
  );
  return Object.freeze({
    schema_version: metadata.schema_version,
    version: metadata.version,
    display_version: metadata.display_version,
  });
}

export async function loadFirmwareVersion(file = defaultVersionPath) {
  return validateFirmwareVersion(JSON.parse(await readFile(file, "utf8")));
}

async function main(argv) {
  assert.ok(argv.length <= 1, "usage: frogalert-version.mjs [VERSION_JSON]");
  const metadata = await loadFirmwareVersion(
    argv[0] ? path.resolve(argv[0]) : defaultVersionPath,
  );
  console.log(metadata.version);
  console.log(metadata.display_version);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`FrogAlert firmware version error: ${error.message}`);
    process.exitCode = 1;
  });
}
