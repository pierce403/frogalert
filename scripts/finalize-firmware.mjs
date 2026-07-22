#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { finalizeCh58xFirmware } from "./firmware-image.mjs";

const [imagePath] = process.argv.slice(2);
if (!imagePath || process.argv.length !== 3) {
  console.error("usage: node scripts/finalize-firmware.mjs PATH.bin");
  process.exit(2);
}

const original = await readFile(imagePath);
const finalized = finalizeCh58xFirmware(original);
await writeFile(imagePath, finalized);
console.log(`finalized CH58x startup sentinel at image offset 0x14: ${imagePath}`);
