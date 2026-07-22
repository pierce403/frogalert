import assert from "node:assert/strict";
import test from "node:test";

import {
  CH582_FLASH_BYTES,
  CH58X_RESET_CONFIG,
  COMMAND,
  OPEN_BADGEMAGIC_RECOVERY,
  dataPacket,
  deriveXorKey,
  erasePacket,
  identifyPacket,
  isResetConfig,
  ispEndPacket,
  ispKeyPacket,
  parseConfig,
  parseConfigRegisters,
  parseIdentity,
  parseResponse,
  readConfigPacket,
  resetConfigPacket,
  sha256Hex,
  validateFirmware,
  validateLabDescriptor,
  validateLabHardwareBinding,
  validateRecoveryDescriptor,
  validateReleaseDescriptor,
  xorChunk,
} from "../site/wchisp-protocol.js";

test("identify packet matches WCH ISP envelope", () => {
  assert.deepEqual([...identifyPacket(0, 0).slice(0, 5)], [0xa1, 0x12, 0x00, 0x00, 0x00]);
  assert.equal(new TextDecoder().decode(identifyPacket().slice(5)), "MCU ISP & WCH.CN");
});

test("read config requests all config groups", () => {
  assert.deepEqual([...readConfigPacket()], [0xa7, 0x02, 0x00, 0x1f, 0x00]);
});

test("CH58x reset config writes reviewed defaults and requires exact readback", () => {
  assert.deepEqual([...resetConfigPacket()], [
    0xa8, 0x0e, 0x00, 0x07, 0x00,
    ...CH58X_RESET_CONFIG,
  ]);
  const response = new Uint8Array(14);
  response.set(CH58X_RESET_CONFIG, 2);
  const registers = parseConfigRegisters(response);
  assert.equal(isResetConfig(registers), true);
  registers[0] = 0;
  assert.equal(isResetConfig(registers), false);
});

test("ISP session and reset packets match the protocol envelopes", () => {
  assert.deepEqual([...ispKeyPacket().slice(0, 3)], [0xa3, 0x1e, 0x00]);
  assert.equal(ispKeyPacket().byteLength, 33);
  assert.deepEqual([...ispEndPacket()], [0xa2, 0x01, 0x00, 0x01]);
});

test("response parser validates echo, status, and length", () => {
  assert.deepEqual([...parseResponse(Uint8Array.of(0xa1, 0x00, 0x02, 0x00, 0x82, 0x16), 0xa1)], [0x82, 0x16]);
  assert.throws(() => parseResponse(Uint8Array.of(0xa2, 0, 0, 0), 0xa1), /echoed command/);
  assert.throws(() => parseResponse(Uint8Array.of(0xa1, 1, 0, 0), 0xa1), /status/);
  assert.throws(() => parseResponse(Uint8Array.of(0xa1, 0, 2, 0, 0), 0xa1), /length mismatch/);
});

test("identity gate accepts CH582 only", () => {
  assert.equal(parseIdentity(Uint8Array.of(0x82, 0x16)).flashBytes, CH582_FLASH_BYTES);
  assert.throws(() => parseIdentity(Uint8Array.of(0x83, 0x16)), /unsupported WCH target/);
});

test("config parser validates UID and derives the expected key", () => {
  const payload = new Uint8Array(26);
  payload.set([0x00, 0x02, 0x90, 0x00], 14);
  // u16 words 0x0201 + 0x0403 + 0x0605 = 0x0c09.
  payload.set([1, 2, 3, 4, 5, 6, 0x09, 0x0c], 18);
  const { uid, bootloaderVersion } = parseConfig(payload);
  assert.deepEqual([...bootloaderVersion], [0, 2, 0x90, 0]);
  assert.deepEqual([...deriveXorKey(uid)], [0x2a, 0x2a, 0x2a, 0x2a, 0x2a, 0x2a, 0x2a, 0xac]);
  assert.deepEqual([...xorChunk(Uint8Array.of(0, 1, 2), deriveXorKey(uid))], [0x2a, 0x2b, 0x28]);
});

test("erase and data packets use little-endian fields", () => {
  assert.deepEqual([...erasePacket(8)], [0xa4, 4, 0, 8, 0, 0, 0]);
  assert.deepEqual(
    [...dataPacket(COMMAND.PROGRAM, 0x12345678, 0x9a, Uint8Array.of(1, 2))],
    [0xa5, 7, 0, 0x78, 0x56, 0x34, 0x12, 0x9a, 1, 2],
  );
});

test("firmware validation pads and reserves the extra erase sector", () => {
  const firmware = new Uint8Array(1025).map((_, index) => index);
  const result = validateFirmware(firmware, "frogalert.bin");
  assert.equal(result.padded.byteLength, 2048);
  assert.equal(result.eraseSectors, 8);
  const tooBig = new Uint8Array(448 * 1024).map((_, index) => index);
  assert.throws(() => validateFirmware(tooBig, "too-big.bin"), /exceeds/);
  assert.throws(() => validateFirmware(new Uint8Array(1), "firmware.hex"), /raw .bin/);
  assert.throws(() => validateFirmware(Uint8Array.of(1, 2, 3), "tiny.bin"), /implausibly short/);
  assert.throws(() => validateFirmware(new Uint8Array(1024).fill(0xff), "blank.bin"), /one repeated byte/);
});

test("release descriptors bind artifacts to an exact verified PCB revision", () => {
  const release = {
    target: "ch582m-badgemagic-11x44",
    hardware_verified: true,
    hardware_revisions: ["rev-a"],
    pcb_markings: ["BOARD-A"],
    file: "frogalert-rev-a.bin",
    bytes: 1024,
    sha256: "a".repeat(64),
  };
  assert.equal(validateReleaseDescriptor(release, "rev-a", "BOARD-A"), true);
  assert.throws(() => validateReleaseDescriptor(release, "rev-b", "BOARD-A"), /does not support/);
  assert.throws(() => validateReleaseDescriptor(release, "rev-a", "BOARD-B"), /physical PCB marking/);
  assert.throws(
    () => validateReleaseDescriptor({ ...release, file: "../unsafe.bin" }, "rev-a", "BOARD-A"),
    /safe raw BIN/,
  );
});

test("hosted lab descriptors require exact profile and physical-board binding", () => {
  const lab = {
    id: "frogalert-pixel-walk-b1144c-250901",
    kind: "frogalert-lab",
    purpose: "pixel-walk",
    label: "FrogAlert USB-C pixel walk",
    version: "0.1.0-dev.1",
    target: "ch582m-badgemagic-11x44",
    hardware_revisions: ["B1144C_250901_USB_C"],
    pcb_markings: ["B1144C_250901"],
    connector: "usb-c",
    hardware_verified: false,
    file: "frogalert-pixel-walk-b1144c-250901.bin",
    bytes: 4096,
    sha256: "b".repeat(64),
    source_commit: "a".repeat(40),
  };

  assert.equal(validateLabDescriptor(lab), true);
  assert.equal(
    validateLabHardwareBinding(lab, "B1144C_250901_USB_C", "B1144C_250901"),
    true,
  );
  assert.throws(
    () => validateLabHardwareBinding(lab, "HARDWARE_REV1", "B1144C_250901"),
    /does not support hardware profile/,
  );
  assert.throws(
    () => validateLabHardwareBinding(lab, "B1144C_250901_USB_C", "BM1144-C"),
    /does not support physical PCB marking/,
  );
  assert.throws(() => validateLabDescriptor({ ...lab, hardware_verified: "no" }), /verification status/);
  assert.throws(() => validateLabDescriptor({ ...lab, connector: "generic-usb" }), /connector/);
  assert.throws(() => validateLabDescriptor({ ...lab, source_commit: "dirty" }), /source commit/);
  assert.throws(() => validateLabDescriptor({ ...lab, file: "../unsafe.bin" }), /safe raw BIN/);
});

test("open BadgeMagic recovery descriptor is pinned to official v0.1 HARDWARE_REV1 bytes", () => {
  const recovery = {
    id: OPEN_BADGEMAGIC_RECOVERY.id,
    kind: OPEN_BADGEMAGIC_RECOVERY.kind,
    label: OPEN_BADGEMAGIC_RECOVERY.label,
    version: OPEN_BADGEMAGIC_RECOVERY.version,
    target: OPEN_BADGEMAGIC_RECOVERY.target,
    hardware_revisions: [OPEN_BADGEMAGIC_RECOVERY.hardwareRevision],
    hardware_verified_by_frogalert: false,
    file: OPEN_BADGEMAGIC_RECOVERY.file,
    bytes: OPEN_BADGEMAGIC_RECOVERY.bytes,
    sha256: OPEN_BADGEMAGIC_RECOVERY.sha256,
    upstream: {
      repository: OPEN_BADGEMAGIC_RECOVERY.repository,
      release_url: OPEN_BADGEMAGIC_RECOVERY.releaseUrl,
      artifact_url: OPEN_BADGEMAGIC_RECOVERY.artifactUrl,
      source_commit: OPEN_BADGEMAGIC_RECOVERY.sourceCommit,
      source_url: OPEN_BADGEMAGIC_RECOVERY.sourceUrl,
      license: OPEN_BADGEMAGIC_RECOVERY.license,
    },
  };

  assert.equal(validateRecoveryDescriptor(recovery, "HARDWARE_REV1"), true);
  for (const revision of ["", "HARDWARE_REV2", "HARDWARE_REV3", "unknown"]) {
    assert.throws(() => validateRecoveryDescriptor(recovery, revision), /supports HARDWARE_REV1/);
  }
  assert.throws(
    () => validateRecoveryDescriptor({ ...recovery, sha256: "0".repeat(64) }, "HARDWARE_REV1"),
    /artifact metadata/,
  );
  assert.throws(
    () =>
      validateRecoveryDescriptor(
        { ...recovery, upstream: { ...recovery.upstream, source_commit: "0".repeat(40) } },
        "HARDWARE_REV1",
      ),
    /provenance/,
  );
  assert.throws(
    () =>
      validateRecoveryDescriptor(
        { ...recovery, hardware_verified_by_frogalert: true },
        "HARDWARE_REV1",
      ),
    /hardware-unverified/,
  );
});

test("SHA-256 uses the browser-compatible Web Crypto path", async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode("frog")),
    "74fa5327cc0f4e947789dd5e989a61a8242986a596f170640ac90337b1da1ee4",
  );
});
