// SPDX-License-Identifier: Apache-2.0
// WCH ISP packet behavior is independently implemented from public protocol
// documentation and the GPL-2.0 ch32-rs/wchisp reference. See docs/THIRD_PARTY.md.

export const WCH_USB_FILTERS = Object.freeze([
  { vendorId: 0x4348, productId: 0x55e0 },
  { vendorId: 0x1a86, productId: 0x55e0 },
]);

export const EXPECTED_CHIP_ID = 0x82;
export const EXPECTED_DEVICE_TYPE = 0x16;
export const CH582_FLASH_BYTES = 448 * 1024;
export const SECTOR_BYTES = 1024;
export const PROGRAM_CHUNK_BYTES = 56;
export const MIN_FIRMWARE_BYTES = 256;
export const CH58X_CONFIG_MASK = 0x07;
export const OPEN_BADGEMAGIC_RECOVERY = Object.freeze({
  id: "fossasia-badgemagic-v0.1-hardware-rev1",
  kind: "open-badgemagic-recovery",
  label: "FOSSASIA open BadgeMagic firmware",
  version: "v0.1",
  target: "ch582m-badgemagic-11x44",
  hardwareRevision: "HARDWARE_REV1",
  file: "badgemagic-open-v0.1-hardware-rev1.bin",
  bytes: 155_672,
  sha256: "7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9",
  repository: "https://github.com/fossasia/badgemagic-firmware",
  releaseUrl: "https://github.com/fossasia/badgemagic-firmware/releases/tag/v0.1",
  artifactUrl:
    "https://github.com/fossasia/badgemagic-firmware/releases/download/v0.1/badgemagic-ch582.bin",
  sourceCommit: "68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8",
  sourceUrl:
    "https://github.com/fossasia/badgemagic-firmware/commit/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8",
  license: "Apache-2.0",
});
export const CH58X_RESET_CONFIG = Uint8Array.of(
  0xff, 0xff, 0xff, 0xff,
  0xff, 0xff, 0xff, 0xff,
  0x4f, 0xff, 0x0f, 0xd5,
);

export const COMMAND = Object.freeze({
  IDENTIFY: 0xa1,
  ISP_END: 0xa2,
  ISP_KEY: 0xa3,
  ERASE: 0xa4,
  PROGRAM: 0xa5,
  VERIFY: 0xa6,
  READ_CONFIG: 0xa7,
  WRITE_CONFIG: 0xa8,
});

const IDENTIFY_MAGIC = new TextEncoder().encode("MCU ISP & WCH.CN");

function writeU16LE(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32LE(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function readU16LE(source, offset) {
  return source[offset] | (source[offset + 1] << 8);
}

export function identifyPacket(chipId = 0, deviceType = 0) {
  const packet = new Uint8Array(21);
  packet.set([COMMAND.IDENTIFY, 0x12, 0x00, chipId, deviceType]);
  packet.set(IDENTIFY_MAGIC, 5);
  return packet;
}

export function readConfigPacket(mask = 0x1f) {
  return Uint8Array.of(COMMAND.READ_CONFIG, 0x02, 0x00, mask, 0x00);
}

export function writeConfigPacket(mask, data) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 0xff) {
    throw new RangeError("configuration mask is invalid");
  }
  if (!(data instanceof Uint8Array) || data.byteLength !== 12) {
    throw new RangeError("CH58x configuration writes require 12 bytes");
  }
  const packet = new Uint8Array(5 + data.byteLength);
  packet[0] = COMMAND.WRITE_CONFIG;
  writeU16LE(packet, 1, 2 + data.byteLength);
  packet[3] = mask;
  packet.set(data, 5);
  return packet;
}

export function resetConfigPacket() {
  return writeConfigPacket(CH58X_CONFIG_MASK, CH58X_RESET_CONFIG);
}

export function ispKeyPacket() {
  const packet = new Uint8Array(33);
  packet.set([COMMAND.ISP_KEY, 0x1e, 0x00]);
  return packet;
}

export function erasePacket(sectors) {
  if (!Number.isInteger(sectors) || sectors < 1 || sectors > 0xffffffff) {
    throw new RangeError("erase sector count is invalid");
  }
  const packet = new Uint8Array(7);
  packet.set([COMMAND.ERASE, 0x04, 0x00]);
  writeU32LE(packet, 3, sectors);
  return packet;
}

export function dataPacket(command, address, padding, data) {
  if (command !== COMMAND.PROGRAM && command !== COMMAND.VERIFY) {
    throw new RangeError("data packet command must be PROGRAM or VERIFY");
  }
  if (!Number.isInteger(address) || address < 0 || address > 0xffffffff) {
    throw new RangeError("data packet address is invalid");
  }
  if (!(data instanceof Uint8Array) || data.byteLength > PROGRAM_CHUNK_BYTES) {
    throw new RangeError("data packet payload must be at most 56 bytes");
  }
  const packet = new Uint8Array(8 + data.byteLength);
  packet[0] = command;
  writeU16LE(packet, 1, packet.byteLength - 3);
  writeU32LE(packet, 3, address);
  packet[7] = padding & 0xff;
  packet.set(data, 8);
  return packet;
}

export function ispEndPacket(reason = 1) {
  return Uint8Array.of(COMMAND.ISP_END, 0x01, 0x00, reason & 0xff);
}

export function parseResponse(raw, expectedCommand) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.byteLength < 4) {
    throw new Error("bootloader response is shorter than four bytes");
  }
  if (bytes[0] !== expectedCommand) {
    throw new Error(
      `bootloader echoed command 0x${bytes[0].toString(16)}, expected 0x${expectedCommand.toString(16)}`,
    );
  }
  if (bytes[1] !== 0x00) {
    throw new Error(`bootloader returned status 0x${bytes[1].toString(16).padStart(2, "0")}`);
  }
  const length = readU16LE(bytes, 2);
  if (length !== bytes.byteLength - 4) {
    throw new Error(`bootloader response length mismatch (${length} != ${bytes.byteLength - 4})`);
  }
  return bytes.slice(4);
}

export function parseIdentity(payload) {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 2) {
    throw new Error("identify response did not include a chip id and device type");
  }
  const chipId = payload[0];
  const deviceType = payload[1];
  if (chipId !== EXPECTED_CHIP_ID || deviceType !== EXPECTED_DEVICE_TYPE) {
    throw new Error(
      `unsupported WCH target 0x${chipId.toString(16).padStart(2, "0")}${deviceType
        .toString(16)
        .padStart(2, "0")}; FrogAlert requires CH582[0x8216]`,
    );
  }
  return { chipId, deviceType, name: "CH582", flashBytes: CH582_FLASH_BYTES };
}

export function parseConfig(payload) {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 26) {
    throw new Error("configuration response is missing bootloader or UID data");
  }
  const bootloaderVersion = payload.slice(14, 18);
  const uid = payload.slice(18, 26);
  validateUid(uid);
  return { bootloaderVersion, uid, registers: parseConfigRegisters(payload) };
}

export function parseConfigRegisters(payload) {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 14) {
    throw new Error("configuration response is missing CH58x registers");
  }
  return payload.slice(2, 14);
}

export function isResetConfig(registers) {
  return (
    registers instanceof Uint8Array &&
    registers.byteLength === CH58X_RESET_CONFIG.byteLength &&
    registers.every((byte, index) => byte === CH58X_RESET_CONFIG[index])
  );
}

export function validateUid(uid) {
  if (!(uid instanceof Uint8Array) || uid.byteLength !== 8) {
    throw new Error("CH582 UID must contain eight bytes");
  }
  const sum = (readU16LE(uid, 0) + readU16LE(uid, 2) + readU16LE(uid, 4)) & 0xffff;
  if (sum !== readU16LE(uid, 6)) {
    throw new Error("CH582 UID checksum failed");
  }
  return true;
}

export function deriveXorKey(uid, chipId = EXPECTED_CHIP_ID) {
  validateUid(uid);
  const checksum = uid.reduce((sum, byte) => (sum + byte) & 0xff, 0);
  const key = new Uint8Array(8).fill(checksum);
  key[7] = (key[7] + chipId) & 0xff;
  return key;
}

export function xorChunk(data, key) {
  if (!(data instanceof Uint8Array) || !(key instanceof Uint8Array) || key.byteLength !== 8) {
    throw new TypeError("xorChunk requires byte arrays and an eight-byte key");
  }
  return data.map((byte, index) => byte ^ key[index % key.byteLength]);
}

export function padFirmware(raw) {
  if (!(raw instanceof Uint8Array)) {
    throw new TypeError("firmware must be a byte array");
  }
  const paddedLength = Math.ceil(raw.byteLength / SECTOR_BYTES) * SECTOR_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(raw);
  return padded;
}

export function validateFirmware(raw, filename = "firmware.bin") {
  if (!(raw instanceof Uint8Array) || raw.byteLength === 0) {
    throw new Error("choose a non-empty raw firmware image");
  }
  if (!filename.toLowerCase().endsWith(".bin")) {
    throw new Error("the browser flasher accepts raw .bin firmware images only");
  }
  if (raw.byteLength < MIN_FIRMWARE_BYTES) {
    throw new Error(`firmware is implausibly short (minimum ${MIN_FIRMWARE_BYTES} bytes)`);
  }
  if (raw.every((byte) => byte === raw[0])) {
    throw new Error("firmware contains only one repeated byte and would not be bootable");
  }
  const padded = padFirmware(raw);
  // Match wchisp's conservative erase plan, which includes one extra sector.
  const eraseSectors = Math.max(8, padded.byteLength / SECTOR_BYTES + 1);
  if (eraseSectors * SECTOR_BYTES > CH582_FLASH_BYTES) {
    throw new Error("firmware erase plan exceeds the CH582 448 KiB code-flash limit");
  }
  return { padded, eraseSectors };
}

export function validateReleaseDescriptor(release, pcbRevision) {
  if (!release || release.target !== "ch582m-badgemagic-11x44" || release.hardware_verified !== true) {
    throw new Error("release is not hardware-verified for the FrogAlert target");
  }
  if (!Array.isArray(release.hardware_revisions) || release.hardware_revisions.length === 0) {
    throw new Error("release does not declare any verified PCB revisions");
  }
  const revision = String(pcbRevision || "").trim();
  if (!revision || !release.hardware_revisions.includes(revision)) {
    throw new Error(`release does not support PCB revision ${revision || "(not entered)"}`);
  }
  if (typeof release.file !== "string" || !/^[a-zA-Z0-9._-]+\.bin$/.test(release.file)) {
    throw new Error("release filename is not a safe raw BIN name");
  }
  if (!Number.isSafeInteger(release.bytes) || release.bytes < 1) {
    throw new Error("release byte length is invalid");
  }
  if (typeof release.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256)) {
    throw new Error("release SHA-256 is invalid");
  }
  return true;
}

export function validateRecoveryDescriptor(recovery, pcbRevision) {
  if (!recovery || typeof recovery !== "object") {
    throw new Error("open BadgeMagic recovery descriptor is missing");
  }
  if (
    recovery.id !== OPEN_BADGEMAGIC_RECOVERY.id ||
    recovery.kind !== OPEN_BADGEMAGIC_RECOVERY.kind ||
    recovery.label !== OPEN_BADGEMAGIC_RECOVERY.label ||
    recovery.version !== OPEN_BADGEMAGIC_RECOVERY.version ||
    recovery.target !== OPEN_BADGEMAGIC_RECOVERY.target
  ) {
    throw new Error("recovery descriptor is not the reviewed FOSSASIA v0.1 image");
  }
  if (recovery.hardware_verified_by_frogalert !== false) {
    throw new Error("recovery descriptor must preserve FrogAlert's hardware-unverified status");
  }
  if (
    !Array.isArray(recovery.hardware_revisions) ||
    recovery.hardware_revisions.length !== 1 ||
    recovery.hardware_revisions[0] !== OPEN_BADGEMAGIC_RECOVERY.hardwareRevision
  ) {
    throw new Error("recovery descriptor must target HARDWARE_REV1 only");
  }
  const revision = String(pcbRevision || "").trim();
  if (revision !== OPEN_BADGEMAGIC_RECOVERY.hardwareRevision) {
    throw new Error(
      `open BadgeMagic v0.1 supports ${OPEN_BADGEMAGIC_RECOVERY.hardwareRevision}, not ${revision || "(not entered)"}`,
    );
  }
  if (
    recovery.file !== OPEN_BADGEMAGIC_RECOVERY.file ||
    recovery.bytes !== OPEN_BADGEMAGIC_RECOVERY.bytes ||
    recovery.sha256 !== OPEN_BADGEMAGIC_RECOVERY.sha256
  ) {
    throw new Error("recovery artifact metadata does not match the reviewed FOSSASIA v0.1 bytes");
  }
  const upstream = recovery.upstream;
  if (
    !upstream ||
    upstream.repository !== OPEN_BADGEMAGIC_RECOVERY.repository ||
    upstream.release_url !== OPEN_BADGEMAGIC_RECOVERY.releaseUrl ||
    upstream.artifact_url !== OPEN_BADGEMAGIC_RECOVERY.artifactUrl ||
    upstream.source_commit !== OPEN_BADGEMAGIC_RECOVERY.sourceCommit ||
    upstream.source_url !== OPEN_BADGEMAGIC_RECOVERY.sourceUrl ||
    upstream.license !== OPEN_BADGEMAGIC_RECOVERY.license
  ) {
    throw new Error("recovery provenance does not match the reviewed FOSSASIA source and release");
  }
  return true;
}

export async function sha256Hex(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("SHA-256 input must be a byte array");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatBootloaderVersion(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 4) return "unknown";
  return `${bytes[0].toString(16)}${bytes[1].toString(16)}.${bytes[2].toString(16)}${bytes[3].toString(16)}`;
}
