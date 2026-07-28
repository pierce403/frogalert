import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_BUILTIN_TARGETS,
  BUILTIN_TARGET_BITS,
  DEFAULT_FIRMWARE_CONFIG,
  FIRMWARE_CONFIG_BLOCK_SIZE,
  FIRMWARE_CONFIG_MAGIC,
  HARDWARE_PROFILES,
  MATCH_TYPES,
  createDefaultFirmwareConfig,
  decodeFirmwareConfig,
  encodeFirmwareConfig,
  findUniqueFirmwareConfigBlock,
  firmwareConfigCrc32,
  patchFirmwareConfig,
} from "../site/firmware-config.js";

function firmwareWithConfig(config, prefixLength = 37, suffixLength = 19) {
  const firmware = new Uint8Array(prefixLength + FIRMWARE_CONFIG_BLOCK_SIZE + suffixLength);
  firmware.fill(0xa5, 0, prefixLength);
  firmware.set(encodeFirmwareConfig(config), prefixLength);
  firmware.fill(0x5a, prefixLength + FIRMWARE_CONFIG_BLOCK_SIZE);
  return firmware;
}

function rewriteCrc(block) {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  view.setUint32(28, firmwareConfigCrc32(block), true);
}

test("default configuration selects the flipped 260404 profile and every built-in target", () => {
  const expectedMask =
    BUILTIN_TARGET_BITS.POLICE |
    BUILTIN_TARGET_BITS.FLIPPER |
    BUILTIN_TARGET_BITS.KARR |
    BUILTIN_TARGET_BITS.RAY_BAN |
    BUILTIN_TARGET_BITS.BADGEMAGIC;

  assert.equal(FIRMWARE_CONFIG_MAGIC.length, 16);
  assert.equal(FIRMWARE_CONFIG_BLOCK_SIZE, 384);
  assert.equal(ALL_BUILTIN_TARGETS, expectedMask);
  assert.deepEqual(DEFAULT_FIRMWARE_CONFIG, {
    hardwareProfile: HARDWARE_PROFILES.B1144C_260404_USB_C,
    builtInTargets: expectedMask,
    customRules: [],
  });
  assert.deepEqual(
    createDefaultFirmwareConfig(HARDWARE_PROFILES.B1144C_250901_USB_C),
    {
      hardwareProfile: HARDWARE_PROFILES.B1144C_250901_USB_C,
      builtInTargets: expectedMask,
      customRules: [],
    },
  );
});

test("configuration round-trips every custom rule type with canonical identifiers", () => {
  const config = {
    hardwareProfile: HARDWARE_PROFILES.B1144C_260404_USB_C,
    builtInTargets: BUILTIN_TARGET_BITS.FLIPPER | BUILTIN_TARGET_BITS.BADGEMAGIC,
    customRules: [
      { type: MATCH_TYPES.NAME_CONTAINS, value: "Tracker", message: "TRACKER" },
      { type: MATCH_TYPES.NAME_PREFIX, value: "ACME ", message: "ACME" },
      { type: MATCH_TYPES.NAME_EXACT, value: "Beacon", message: "BEACON" },
      { type: MATCH_TYPES.PUBLIC_OUI, value: "a1-b2-c3", message: "VENDOR" },
      { type: MATCH_TYPES.SERVICE_16_BIT, value: "0xfeaa", message: "EDDYSTONE" },
    ],
  };

  const encoded = encodeFirmwareConfig(config);
  assert.equal(encoded.length, FIRMWARE_CONFIG_BLOCK_SIZE);
  assert.deepEqual(decodeFirmwareConfig(encoded), {
    schemaVersion: 1,
    hardwareProfile: HARDWARE_PROFILES.B1144C_260404_USB_C,
    builtInTargets: config.builtInTargets,
    customRules: [
      ...config.customRules.slice(0, 3),
      { type: MATCH_TYPES.PUBLIC_OUI, value: "A1:B2:C3", message: "VENDOR" },
      { type: MATCH_TYPES.SERVICE_16_BIT, value: "FEAA", message: "EDDYSTONE" },
    ],
  });
});

test("CRC32 protects the entire configuration while treating its own field as zero", () => {
  const encoded = encodeFirmwareConfig();
  const view = new DataView(encoded.buffer);
  const storedCrc = view.getUint32(28, true);

  assert.equal(storedCrc, firmwareConfigCrc32(encoded));
  encoded[40] ^= 0x01;
  assert.throws(() => decodeFirmwareConfig(encoded), /CRC32 mismatch/);
});

test("strict decoding rejects non-zero reserved, padding, and unused rule bytes", () => {
  const oneRule = encodeFirmwareConfig({
    ...DEFAULT_FIRMWARE_CONFIG,
    customRules: [{ type: MATCH_TYPES.NAME_EXACT, value: "Tag", message: "FOUND" }],
  });

  const reserved = Uint8Array.from(oneRule);
  reserved[35] = 1;
  rewriteCrc(reserved);
  assert.throws(() => decodeFirmwareConfig(reserved), /reserved byte must be zero/);

  const padding = Uint8Array.from(oneRule);
  padding[32 + 4 + 3] = 1;
  rewriteCrc(padding);
  assert.throws(() => decodeFirmwareConfig(padding), /value padding bytes must be zero/);

  const unused = Uint8Array.from(oneRule);
  unused[32 + 44] = 1;
  rewriteCrc(unused);
  assert.throws(() => decodeFirmwareConfig(unused), /unused custom monitoring rule 2/);
});

test("profiles, custom rule count, ASCII lengths, OUI, and services fail closed", () => {
  assert.throws(
    () => createDefaultFirmwareConfig(99),
    /hardwareProfile must be 1 .* or 2 /,
  );
  assert.throws(
    () =>
      encodeFirmwareConfig({
        ...DEFAULT_FIRMWARE_CONFIG,
        customRules: Array.from({ length: 9 }, () => ({
          type: MATCH_TYPES.NAME_EXACT,
          value: "X",
          message: "X",
        })),
      }),
    /maximum is 8/,
  );
  assert.throws(
    () =>
      encodeFirmwareConfig({
        ...DEFAULT_FIRMWARE_CONFIG,
        customRules: [
          { type: MATCH_TYPES.NAME_EXACT, value: "snowman \u2603", message: "FOUND" },
        ],
      }),
    /printable ASCII/,
  );
  assert.throws(
    () =>
      encodeFirmwareConfig({
        ...DEFAULT_FIRMWARE_CONFIG,
        customRules: [
          { type: MATCH_TYPES.NAME_EXACT, value: "x".repeat(25), message: "FOUND" },
        ],
      }),
    /at most 24/,
  );
  assert.throws(
    () =>
      encodeFirmwareConfig({
        ...DEFAULT_FIRMWARE_CONFIG,
        customRules: [
          { type: MATCH_TYPES.NAME_PREFIX, value: "   ", message: "FOUND" },
        ],
      }),
    /non-whitespace name/,
  );
  assert.throws(
    () =>
      encodeFirmwareConfig({
        ...DEFAULT_FIRMWARE_CONFIG,
        customRules: [
          { type: MATCH_TYPES.PUBLIC_OUI, value: "not-an-oui", message: "FOUND" },
        ],
      }),
    /public OUI/,
  );
  assert.throws(
    () =>
      encodeFirmwareConfig({
        ...DEFAULT_FIRMWARE_CONFIG,
        customRules: [
          { type: MATCH_TYPES.SERVICE_16_BIT, value: "123", message: "FOUND" },
        ],
      }),
    /four-digit 16-bit service/,
  );
});

test("configuration block lookup requires one complete marker", () => {
  assert.throws(
    () => findUniqueFirmwareConfigBlock(new Uint8Array(512)),
    /does not contain/,
  );

  const firmware = firmwareWithConfig(DEFAULT_FIRMWARE_CONFIG);
  assert.equal(findUniqueFirmwareConfigBlock(firmware), 37);

  const duplicate = new Uint8Array(firmware.length + FIRMWARE_CONFIG_BLOCK_SIZE);
  duplicate.set(firmware);
  duplicate.set(encodeFirmwareConfig(), firmware.length);
  assert.throws(() => findUniqueFirmwareConfigBlock(duplicate), /contains 2/);

  const truncated = new Uint8Array(FIRMWARE_CONFIG_MAGIC.length + 2);
  truncated.set(FIRMWARE_CONFIG_MAGIC);
  assert.throws(() => findUniqueFirmwareConfigBlock(truncated), /truncated/);
});

test("patching preserves the source, non-config bytes, and compiled hardware profile", () => {
  const originalConfig = createDefaultFirmwareConfig(
    HARDWARE_PROFILES.B1144C_260404_USB_C,
  );
  const source = firmwareWithConfig(originalConfig);
  const before = Uint8Array.from(source);
  const replacement = {
    hardwareProfile: HARDWARE_PROFILES.B1144C_260404_USB_C,
    builtInTargets: BUILTIN_TARGET_BITS.KARR,
    customRules: [
      { type: MATCH_TYPES.NAME_PREFIX, value: "MY-", message: "MY DEVICE" },
    ],
  };

  const patched = patchFirmwareConfig(source, replacement);
  const offset = findUniqueFirmwareConfigBlock(patched);
  assert.notEqual(patched, source);
  assert.deepEqual(source, before);
  assert.deepEqual(patched.subarray(0, offset), source.subarray(0, offset));
  assert.deepEqual(
    patched.subarray(offset + FIRMWARE_CONFIG_BLOCK_SIZE),
    source.subarray(offset + FIRMWARE_CONFIG_BLOCK_SIZE),
  );
  assert.deepEqual(
    decodeFirmwareConfig(patched.subarray(offset, offset + FIRMWARE_CONFIG_BLOCK_SIZE)),
    { schemaVersion: 1, ...replacement },
  );

  assert.throws(
    () =>
      patchFirmwareConfig(source, {
        ...replacement,
        hardwareProfile: HARDWARE_PROFILES.B1144C_250901_USB_C,
      }),
    /firmware was built for profile/,
  );
});
