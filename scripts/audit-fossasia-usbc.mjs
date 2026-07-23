#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, "..");
export const lockPath = path.join(
  repositoryRoot,
  "firmware/fossasia-usbc/upstream-lock.json",
);
export const canaryText =
  "FROGALERT:FOSSASIA-USB-C-BASE:9ce885d682b5c56c3ac7595c09e009a210885221:UNVERIFIED";
export const surveyText =
  "FROGALERT:SURVEY-FLIPPER:FOSSASIA-9ce885d:B1144C_250901_USB_C:UNVERIFIED";

function validateMode(mode) {
  assert.ok(
    mode === "baseline" || mode === "canary" || mode === "survey",
    "invalid build mode",
  );
}

export async function loadLock(file = lockPath) {
  const lock = JSON.parse(await readFile(file, "utf8"));
  validateLock(lock);
  return lock;
}

export function validateLock(lock) {
  assert.equal(lock.schema_version, 1, "unsupported FOSSASIA lock schema");
  assert.equal(lock.profile, "B1144C_250901_USB_C");
  assert.equal(lock.hardware_status, "build-evidence-only");
  assert.match(lock.upstream.commit, /^[0-9a-f]{40}$/);
  assert.ok(
    lock.upstream.archive_url.endsWith(lock.upstream.commit),
    "source URL must end in the exact commit",
  );
  assert.equal(
    lock.upstream.archive_file,
    `badgemagic-firmware-${lock.upstream.commit}.tar.gz`,
  );
  assert.equal(
    lock.upstream.extracted_directory,
    `badgemagic-firmware-${lock.upstream.commit}`,
  );
  assert.equal(lock.upstream.archive_size, 14644075);
  assert.match(lock.upstream.archive_sha256, /^[0-9a-f]{64}$/);
  assert.equal(lock.toolchain.name, "MRS_Toolchain_Linux_x64_V1.92");
  assert.equal(lock.toolchain.release, "1.92-toolchain");
  assert.equal(lock.toolchain.asset_id, 184573118);
  assert.equal(
    lock.toolchain.archive_file,
    "MRS_Toolchain_Linux_x64_V1.92.tar.xz",
  );
  assert.equal(lock.toolchain.archive_size, 330007712);
  assert.equal(
    lock.toolchain.prefix,
    "RISC-V_Embedded_GCC/bin/riscv-none-embed-",
  );
  assert.match(lock.toolchain.archive_sha256, /^[0-9a-f]{64}$/);
  assert.match(lock.toolchain.embedded_gcc_tree_sha256, /^[0-9a-f]{64}$/);
  assert.equal(lock.build.usbc_version, 1);
  assert.equal(lock.build.version, "v0.1-42-g9ce885d");
  assert.equal(lock.build.version_abbreviation, "v0.1");
  assert.equal(lock.build.startup_sentinel_offset, 0x14);
  assert.equal(lock.build.startup_sentinel_hex, "a9bdf9f5");
  assert.equal(lock.build.known_good_baseline_size, 177704);
  assert.match(lock.build.known_good_baseline_sha256, /^[0-9a-f]{64}$/);
  assert.equal(lock.build.known_good_canary_size, 177788);
  assert.match(lock.build.known_good_canary_sha256, /^[0-9a-f]{64}$/);
  assert.ok(lock.build.known_good_survey_size > 177788);
  assert.match(lock.build.known_good_survey_sha256, /^[0-9a-f]{64}$/);
  assert.equal(lock.build.minimum_stack_headroom, 8192);
  assert.ok(lock.build.required_symbols.length >= 8);
  assert.ok(lock.build.required_survey_symbols.length >= 6);
  assert.equal(
    lock.survey_reference.commit,
    "bd508ad7ceed48377619837051412a651952857f",
  );
  assert.equal(
    lock.survey_reference.combined_role_example,
    "EVT/EXAM/BLE/CentPeri/APP/centPeri_main.c",
  );
  assert.equal(
    lock.survey_reference.central_scan_example,
    "EVT/EXAM/BLE/CentPeri/APP/central.c",
  );
  assert.equal(
    lock.survey_reference.ble_heap_config,
    "EVT/EXAM/BLE/HAL/include/config.h",
  );
  assert.equal(
    lock.flipper_reference.repository,
    "https://github.com/flipperdevices/flipperzero-firmware",
  );
  assert.match(lock.flipper_reference.commit, /^[0-9a-f]{40}$/);
  assert.equal(
    lock.flipper_reference.device_name_source,
    "targets/f7/furi_hal/furi_hal_version.c",
  );
  assert.equal(
    lock.flipper_reference.advertising_source,
    "targets/f7/ble_glue/gap.c",
  );
  assert.match(lock.known_good_upstream_elf.bin_commit, /^[0-9a-f]{40}$/);
  assert.equal(
    lock.known_good_upstream_elf.path,
    "usb-c/badgemagic-ch582.elf",
  );
  assert.ok(
    lock.known_good_upstream_elf.url.includes(
      lock.known_good_upstream_elf.bin_commit,
    ),
    "known-good ELF URL must include its exact bin commit",
  );
  assert.equal(lock.known_good_upstream_elf.size, 250072);
  assert.match(lock.known_good_upstream_elf.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(lock.known_good_upstream_elf.objcopy_arguments, [
    "-O",
    "binary",
    "-S",
  ]);
  assert.equal(
    lock.known_good_upstream_elf.objcopy_output_size,
    lock.build.known_good_baseline_size,
  );
  assert.equal(
    lock.known_good_upstream_elf.objcopy_output_sha256,
    lock.build.known_good_baseline_sha256,
  );
  assert.ok(Object.keys(lock.critical_source_sha256).length >= 12);
}

export async function sha256File(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function verifyLockedFile(file, expected, label) {
  const details = await stat(file);
  assert.equal(
    details.size,
    expected.size,
    `${label} size differs from the lock`,
  );
  assert.equal(
    await sha256File(file),
    expected.sha256,
    `${label} SHA-256 differs from the lock`,
  );
}

function safeSourcePath(sourceDirectory, relativePath) {
  assert.equal(path.isAbsolute(relativePath), false);
  const resolved = path.resolve(sourceDirectory, relativePath);
  assert.ok(
    resolved.startsWith(`${path.resolve(sourceDirectory)}${path.sep}`),
    `source lock path escapes its root: ${relativePath}`,
  );
  return resolved;
}

export async function verifySourceTree(sourceDirectory, lock) {
  for (const [relativePath, expectedHash] of Object.entries(
    lock.critical_source_sha256,
  )) {
    const file = safeSourcePath(sourceDirectory, relativePath);
    assert.equal(
      await sha256File(file),
      expectedHash,
      `pinned source drift: ${relativePath}`,
    );
  }

  const [main, power, ble, startup, usbDevice] = await Promise.all([
    readFile(path.join(sourceDirectory, "src/main.c"), "utf8"),
    readFile(path.join(sourceDirectory, "src/power.h"), "utf8"),
    readFile(path.join(sourceDirectory, "src/ble/setup.c"), "utf8"),
    readFile(
      path.join(
        sourceDirectory,
        "CH5xx_ble_firmware_library/Startup/startup_CH583.S",
      ),
      "utf8",
    ),
    readFile(path.join(sourceDirectory, "src/usb/dev.c"), "utf8"),
  ]);

  assert.match(main, /#define SCAN_BOOTLD_BTN_SPEED_T\s+\(200000\)/);
  assert.match(main, /hold\s*>\s*10/);
  assert.match(main, /reset_jump\(\);/);
  assert.match(main, /usb_start\(\);/);
  assert.match(main, /legacy_registerService\(\);/);
  assert.match(main, /ble_setup\(\);/);
  assert.match(main, /PFIC_EnableIRQ\(TMR0_IRQn\);/);
  assert.match(power, /asm volatile\("j 0x00"\);/);
  assert.match(ble, /R8_CK32K_CONFIG\s*\|=\s*RB_CLK_INT32K_PON/);
  assert.match(ble, /Calibration_LSI\(Level_128\);/);
  assert.match(ble, /#define BLE_MEMHEAP_SIZE\s+\(1024 \* 6\)/);
  assert.match(startup, /\.word\s+0xF5F9BDA9/);
  assert.match(startup, /\.word\s+TMR0_IRQHandler/);
  assert.match(startup, /\.word\s+USB_IRQHandler/);
  assert.match(usbDevice, /\.idVendor\s*=\s*0x0416/);
  assert.match(usbDevice, /\.idProduct\s*=\s*0x5020/);
  assert.match(usbDevice, /'B', 'M', '1', '1', '4', '4'/);
  assert.match(usbDevice, /#ifdef USBC_VERSION/);
}

export function verifySymbolTable(nmOutput, mode, lock) {
  validateMode(mode);
  const symbols = new Set(
    nmOutput
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).at(-1))
      .filter(Boolean),
  );

  for (const symbol of lock.build.required_symbols) {
    assert.ok(symbols.has(symbol), `required runtime symbol missing: ${symbol}`);
  }
  assert.equal(
    symbols.has("frogalert_build_canary"),
    mode === "canary",
    `canary symbol mismatch for ${mode} build`,
  );
  assert.equal(
    symbols.has("frogalert_survey_identity"),
    mode === "survey",
    `survey symbol mismatch for ${mode} build`,
  );
  if (mode === "survey") {
    for (const symbol of lock.build.required_survey_symbols) {
      assert.ok(symbols.has(symbol), `required survey symbol missing: ${symbol}`);
    }
  }
}

function symbolAddresses(nmOutput) {
  const addresses = new Map();
  for (const line of nmOutput.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-fA-F]+)\s+\S\s+(\S+)$/);
    if (match) addresses.set(match[2], Number.parseInt(match[1], 16));
  }
  return addresses;
}

export function verifyRamLayout(nmOutput, lock) {
  const addresses = symbolAddresses(nmOutput);
  for (const symbol of ["_ebss", "_eusrstack"]) {
    assert.ok(addresses.has(symbol), `RAM audit symbol missing: ${symbol}`);
  }
  const staticEnd = addresses.get("_ebss");
  const stackTop = addresses.get("_eusrstack");
  assert.ok(staticEnd <= stackTop, "static RAM extends past the stack top");
  assert.ok(
    stackTop - staticEnd >= lock.build.minimum_stack_headroom,
    `RAM headroom is below ${lock.build.minimum_stack_headroom} bytes`,
  );
}

export function verifyVectorTable(highcode, nmOutput) {
  assert.ok(highcode.length >= 0x5c, "highcode section is too short for vectors");
  const symbols = symbolAddresses(nmOutput);
  for (const symbol of [
    "_highcode_vma_start",
    "_vector_base",
    "TMR0_IRQHandler",
    "USB_IRQHandler",
  ]) {
    assert.ok(symbols.has(symbol), `vector audit symbol missing: ${symbol}`);
  }
  assert.equal(
    symbols.get("_vector_base"),
    symbols.get("_highcode_vma_start"),
    "vector base is not the start of RAM highcode",
  );
  assert.equal(
    highcode.readUInt32LE(0x10),
    0xf5f9bda9,
    "highcode startup sentinel is missing",
  );
  assert.equal(
    highcode.readUInt32LE(16 * 4),
    symbols.get("TMR0_IRQHandler"),
    "TMR0 vector slot does not point at TMR0_IRQHandler",
  );
  assert.equal(
    highcode.readUInt32LE((16 + 6) * 4),
    symbols.get("USB_IRQHandler"),
    "USB vector slot does not point at USB_IRQHandler",
  );
}

export function verifyDisassembly(disassembly) {
  assert.doesNotMatch(
    disassembly,
    /(^|\s)(amo[a-z0-9_.]*|lr\.[wd]|sc\.[wd])(\s|$)/im,
    "QingKe-unsafe AMO/LR/SC instruction found",
  );
}

function utf16LittleEndian(text) {
  const result = Buffer.alloc(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    result.writeUInt16LE(text.charCodeAt(index), index * 2);
  }
  return result;
}

function contains(haystack, needle) {
  return haystack.indexOf(needle) !== -1;
}

export async function verifyBinary(file, mode, lock) {
  validateMode(mode);
  const image = await readFile(file);
  assert.ok(image.length > 0, "firmware BIN is empty");
  assert.ok(image.length <= 448 * 1024, "firmware BIN exceeds CH582 flash");

  const sentinel = Buffer.from(lock.build.startup_sentinel_hex, "hex");
  assert.deepEqual(
    image.subarray(
      lock.build.startup_sentinel_offset,
      lock.build.startup_sentinel_offset + sentinel.length,
    ),
    sentinel,
    "WCH startup sentinel is missing from raw offset 0x14",
  );

  for (const descriptor of [
    "FOSSASIA WAS HERE",
    "LED Badge Magic",
    "BM1144-C fw: ",
  ]) {
    assert.ok(
      contains(image, utf16LittleEndian(descriptor)),
      `USB descriptor missing from BIN: ${descriptor}`,
    );
  }
  assert.ok(
    contains(image, Buffer.from(lock.build.version, "ascii")),
    "pinned firmware version is missing from BIN",
  );
  assert.equal(
    contains(image, Buffer.from(canaryText, "ascii")),
    mode === "canary",
    `canary marker mismatch for ${mode} build`,
  );
  assert.equal(
    contains(image, Buffer.from(surveyText, "ascii")),
    mode === "survey",
    `survey marker mismatch for ${mode} build`,
  );

  const lockedImages = {
    baseline: {
      size: lock.build.known_good_baseline_size,
      sha256: lock.build.known_good_baseline_sha256,
    },
    canary: {
      size: lock.build.known_good_canary_size,
      sha256: lock.build.known_good_canary_sha256,
    },
    survey: {
      size: lock.build.known_good_survey_size,
      sha256: lock.build.known_good_survey_sha256,
    },
  };
  await verifyLockedFile(
    file,
    lockedImages[mode],
    `locked FOSSASIA USB-C ${mode}`,
  );
}

async function main(argv) {
  const [command, ...parameters] = argv;
  const lock = await loadLock();

  switch (command) {
    case "lock": {
      assert.equal(parameters.length, 0, "lock takes no arguments");
      break;
    }
    case "source": {
      assert.equal(parameters.length, 1, "source requires a directory");
      await verifySourceTree(path.resolve(parameters[0]), lock);
      break;
    }
    case "binary": {
      assert.equal(parameters.length, 2, "binary requires MODE and BIN");
      await verifyBinary(path.resolve(parameters[1]), parameters[0], lock);
      break;
    }
    case "symbols": {
      assert.equal(parameters.length, 2, "symbols requires MODE and nm output");
      verifySymbolTable(await readFile(parameters[1], "utf8"), parameters[0], lock);
      break;
    }
    case "disassembly": {
      assert.equal(parameters.length, 1, "disassembly requires a file");
      verifyDisassembly(await readFile(parameters[0], "utf8"));
      break;
    }
    case "vectors": {
      assert.equal(parameters.length, 2, "vectors requires highcode and nm output");
      verifyVectorTable(
        await readFile(parameters[0]),
        await readFile(parameters[1], "utf8"),
      );
      break;
    }
    case "ram": {
      assert.equal(parameters.length, 1, "ram requires nm output");
      verifyRamLayout(await readFile(parameters[0], "utf8"), lock);
      break;
    }
    default:
      throw new Error(
        "usage: node scripts/audit-fossasia-usbc.mjs {lock|source DIR|binary MODE BIN|symbols MODE NM|disassembly FILE|vectors HIGHCODE NM|ram NM}",
      );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`FOSSASIA USB-C audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
