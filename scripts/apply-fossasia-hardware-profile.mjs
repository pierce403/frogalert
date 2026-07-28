#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SUPPORTED_HARDWARE_PROFILES = Object.freeze([
  "B1144C_250901_USB_C",
  "B1144C_260404_USB_C",
]);
export const DEFAULT_HARDWARE_PROFILE = "B1144C_260404_USB_C";

function normalizeLineEndings(source, label) {
  assert.equal(typeof source, "string", `${label} must be a string`);
  return source.replaceAll("\r\n", "\n");
}

function replaceOnce(source, before, after, label) {
  const pieces = source.split(before);
  assert.equal(
    pieces.length,
    2,
    `${label} must match exactly once in the pinned FOSSASIA source`,
  );
  return `${pieces[0]}${after}${pieces[1]}`;
}

const buttonPullDown =
  "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);";
const buttonPullUp =
  "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);";
const key1ActiveHigh =
  "\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))";
const key1ActiveLow =
  "\t\t\t\t!GPIOA_ReadPortPin(KEY1_PIN))";
const powerWakeActiveHigh = [
  "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
  "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);",
].join("\n");
const powerWakeActiveLow = [
  "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);",
  "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_FallEdge);",
].join("\n");

export function applyHardwareProfile({
  buttonSource,
  buttonHeader,
  powerSource,
  profile,
}) {
  assert.ok(
    SUPPORTED_HARDWARE_PROFILES.includes(profile),
    `unsupported FOSSASIA hardware profile: ${profile}`,
  );

  const normalizedButtonSource = normalizeLineEndings(
    buttonSource,
    "button source",
  );
  const normalizedButtonHeader = normalizeLineEndings(
    buttonHeader,
    "button header",
  );
  const normalizedPowerSource = normalizeLineEndings(
    powerSource,
    "power source",
  );

  const verifiedButtonSource = replaceOnce(
    normalizedButtonSource,
    buttonPullDown,
    profile === DEFAULT_HARDWARE_PROFILE ? buttonPullUp : buttonPullDown,
    "KEY1 input-pull configuration",
  );
  const verifiedButtonHeader = replaceOnce(
    normalizedButtonHeader,
    key1ActiveHigh,
    profile === DEFAULT_HARDWARE_PROFILE ? key1ActiveLow : key1ActiveHigh,
    "KEY1 pressed-polarity expression",
  );
  const verifiedPowerSource = replaceOnce(
    normalizedPowerSource,
    powerWakeActiveHigh,
    profile === DEFAULT_HARDWARE_PROFILE
      ? powerWakeActiveLow
      : powerWakeActiveHigh,
    "KEY1 shutdown wake configuration",
  );

  return {
    buttonSource: verifiedButtonSource,
    buttonHeader: verifiedButtonHeader,
    powerSource: verifiedPowerSource,
    changed: profile === DEFAULT_HARDWARE_PROFILE,
  };
}

async function main() {
  const [sourceDirectoryArgument, profile] = process.argv.slice(2);
  assert.ok(
    sourceDirectoryArgument && profile && process.argv.length === 4,
    "usage: node scripts/apply-fossasia-hardware-profile.mjs SOURCE_DIR PROFILE",
  );

  const sourceDirectory = path.resolve(sourceDirectoryArgument);
  const files = {
    buttonSource: path.join(sourceDirectory, "src/button.c"),
    buttonHeader: path.join(sourceDirectory, "src/button.h"),
    powerSource: path.join(sourceDirectory, "src/power.c"),
  };
  const [buttonSource, buttonHeader, powerSource] = await Promise.all([
    readFile(files.buttonSource, "utf8"),
    readFile(files.buttonHeader, "utf8"),
    readFile(files.powerSource, "utf8"),
  ]);
  const result = applyHardwareProfile({
    buttonSource,
    buttonHeader,
    powerSource,
    profile,
  });

  if (result.changed) {
    await Promise.all([
      writeFile(files.buttonSource, result.buttonSource),
      writeFile(files.buttonHeader, result.buttonHeader),
      writeFile(files.powerSource, result.powerSource),
    ]);
    process.stdout.write(`Applied FOSSASIA hardware profile ${profile}\n`);
  } else {
    process.stdout.write(`Verified FOSSASIA hardware profile ${profile}\n`);
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
