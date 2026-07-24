import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateFirmwarePublicationManifest,
  validateFirmwareQuarantine,
  validateHardwareEvidenceRecord,
  validateHardwareEvidenceTranscript,
} from "../scripts/firmware-publication.mjs";

const VERIFIED_SHA = "c".repeat(64);
const FAILED_SHA = "02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22";
const KNOWN_GOOD_SHA = "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2";

const evidence = (overrides = {}) => ({
  artifact_sha256: VERIFIED_SHA,
  source_commit: "a".repeat(40),
  record: "firmware/evidence/2026-07-22-example-hardware-smoke.json",
  transcript: "agent-memory/logs/2026-07-22-example-hardware-smoke.md",
  tested_at: "2026-07-22",
  hardware_profile: "B1144C_250901_USB_C",
  pcb_marking: "B1144C_250901",
  cli_program_verified: true,
  cli_byte_verify_passed: true,
  webusb_program_verified: true,
  webusb_byte_verify_passed: true,
  boot_observed: true,
  power_cycle_passed: true,
  key1_behavior_passed: true,
  short_key2_behavior_passed: true,
  application_usb_id: "0416:5020",
  application_hid_enumeration_passed: true,
  application_cdc_enumeration_passed: true,
  display_passed: true,
  badgemagic_upload_passed: true,
  key2_dot_observed: true,
  key2_recovery_passed: true,
  known_good_reflash_passed: true,
  known_good_reflash_sha256: KNOWN_GOOD_SHA,
  recovery_method: "key2-only",
  recovery_usb_id: "4348:55e0",
  ...overrides,
});

const artifact = (overrides = {}) => ({
  id: "frogalert-0.1.0-alpha.1-b1144c-250901-usbc",
  kind: "frogalert-release",
  label: "FrogAlert",
  version: "0.1.0-alpha.1",
  channel: "alpha",
  target: "ch582m-badgemagic-11x44",
  hardware_revisions: ["B1144C_250901_USB_C"],
  pcb_markings: ["B1144C_250901"],
  hardware_verified: true,
  file: "frogalert-verified-lab.bin",
  bytes: 8192,
  sha256: VERIFIED_SHA,
  source_commit: "a".repeat(40),
  release_tag: "v0.1.0-alpha.1",
  release_url:
    "https://github.com/pierce403/frogalert/releases/tag/v0.1.0-alpha.1",
  release_notes: "firmware/releases/notes/v0.1.0-alpha.1.md",
  debug_file: "frogalert-verified-lab.elf",
  debug_bytes: 16384,
  debug_sha256: "e".repeat(64),
  hardware_evidence: evidence(),
  ...overrides,
});

const manifest = (overrides = {}) => ({
  schema_version: 4,
  github_repository: "pierce403/frogalert",
  releases: [],
  lab_images: [],
  recovery_images: [],
  ...overrides,
});

const emptyQuarantine = { schema_version: 1, artifacts: [] };

test("quarantine registry pins the failed USB-C pixel-walk SHA", async () => {
  const quarantine = JSON.parse(
    await readFile(new URL("../firmware/quarantine.json", import.meta.url), "utf8"),
  );
  const hashes = validateFirmwareQuarantine(quarantine);
  assert.equal(hashes.has(FAILED_SHA), true);
  assert.equal(quarantine.artifacts[0].status, "failed-hardware-smoke");
});

test("physically verified, hash-bound FrogAlert artifacts may be published", () => {
  assert.equal(
    validateFirmwarePublicationManifest(
      manifest({
        releases: [artifact()],
        lab_images: [
          artifact({
            id: "frogalert-verified-display-lab",
            file: "frogalert-verified-display-lab.bin",
          }),
        ],
      }),
      emptyQuarantine,
    ),
    true,
  );
});

test("release metadata is canonical for commit-driven GitHub publication", () => {
  for (const [override, pattern] of [
    [{ id: "../release" }, /id is invalid/],
    [{ kind: "frogalert-lab" }, /kind is invalid/],
    [{ label: "" }, /label is missing/],
    [{ version: "latest" }, /version is invalid/],
    [{ channel: "nightly" }, /channel is invalid/],
    [{ channel: "stable" }, /version does not match its stable channel/],
    [{ release_tag: "latest" }, /tag must be/],
    [{ release_url: "https://example.com/release" }, /URL must be/],
    [{ release_notes: "../notes.md" }, /release notes path is invalid/],
    [{ debug_file: "../debug.elf" }, /debug ELF filename is invalid/],
    [{ debug_sha256: "short" }, /debug ELF SHA-256 is invalid/],
  ]) {
    assert.throws(
      () =>
        validateFirmwarePublicationManifest(
          manifest({ releases: [artifact(override)] }),
          emptyQuarantine,
        ),
      pattern,
    );
  }
});

test("release tags group board descriptors only when immutable metadata agrees", () => {
  const secondBoard = artifact({
    id: "frogalert-0.1.0-alpha.1-second-board",
    file: "frogalert-0.1.0-alpha.1-second-board.bin",
    debug_file: "frogalert-0.1.0-alpha.1-second-board.elf",
    pcb_markings: ["B1144C_250902"],
    hardware_evidence: evidence({ pcb_marking: "B1144C_250902" }),
  });
  assert.equal(
    validateFirmwarePublicationManifest(
      manifest({ releases: [artifact(), secondBoard] }),
      emptyQuarantine,
    ),
    true,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          releases: [
            artifact(),
            {
              ...secondBoard,
              source_commit: "b".repeat(40),
              hardware_evidence: evidence({
                source_commit: "b".repeat(40),
                pcb_marking: "B1144C_250902",
              }),
            },
          ],
        }),
        emptyQuarantine,
      ),
    /conflicting source_commit/,
  );
});

test("publication ids and filenames are unique across release and lab catalogs", () => {
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          releases: [artifact()],
          lab_images: [artifact()],
        }),
        emptyQuarantine,
      ),
    /duplicate FrogAlert publication id/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          releases: [artifact()],
          lab_images: [
            artifact({
              id: "frogalert-distinct-lab",
            }),
          ],
        }),
        emptyQuarantine,
      ),
    /duplicate FrogAlert publication filename/,
  );
});

test("hardware-unverified FrogAlert releases and labs are rejected before site assembly", () => {
  for (const collection of ["releases", "lab_images"]) {
    assert.throws(
      () =>
        validateFirmwarePublicationManifest(
          manifest({ [collection]: [artifact({ hardware_verified: false })] }),
          emptyQuarantine,
        ),
      /not physically hardware-verified/,
      collection,
    );
  }
});

test("publication evidence must be present and bound to the exact artifact hash", () => {
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({ lab_images: [artifact({ hardware_evidence: undefined })] }),
        emptyQuarantine,
      ),
    /no physical hardware evidence/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          lab_images: [artifact({ hardware_evidence: evidence({ artifact_sha256: "d".repeat(64) }) })],
        }),
        emptyQuarantine,
      ),
    /not bound to its SHA-256/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          lab_images: [artifact({ hardware_evidence: evidence({ source_commit: "b".repeat(40) }) })],
        }),
        emptyQuarantine,
      ),
    /not bound to its source commit/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          lab_images: [
            artifact({
              hardware_evidence: evidence({ record: "agent-memory/logs/unstructured.md" }),
            }),
          ],
        }),
        emptyQuarantine,
      ),
    /evidence record is invalid/,
  );
});

test("publication evidence requires application, display, BadgeMagic, and KEY2 recovery proof", () => {
  for (const check of [
    "cli_program_verified",
    "cli_byte_verify_passed",
    "webusb_program_verified",
    "webusb_byte_verify_passed",
    "boot_observed",
    "power_cycle_passed",
    "key1_behavior_passed",
    "short_key2_behavior_passed",
    "application_hid_enumeration_passed",
    "application_cdc_enumeration_passed",
    "display_passed",
    "badgemagic_upload_passed",
    "key2_dot_observed",
    "key2_recovery_passed",
    "known_good_reflash_passed",
  ]) {
    assert.throws(
      () =>
        validateFirmwarePublicationManifest(
          manifest({ lab_images: [artifact({ hardware_evidence: evidence({ [check]: false }) })] }),
          emptyQuarantine,
        ),
      new RegExp(check),
      check,
    );
  }
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          lab_images: [artifact({ hardware_evidence: evidence({ recovery_method: "c3-reset" }) })],
        }),
        emptyQuarantine,
      ),
    /KEY2-only recovery/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          lab_images: [artifact({ hardware_evidence: evidence({ application_usb_id: "0000:0000" }) })],
        }),
        emptyQuarantine,
      ),
    /application USB stack/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({ lab_images: [artifact({ hardware_evidence: evidence({ recovery_usb_id: "0416:5020" }) })] }),
        emptyQuarantine,
      ),
    /WCH ROM ISP recovery/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          lab_images: [
            artifact({
              hardware_evidence: evidence({ known_good_reflash_sha256: "f".repeat(64) }),
            }),
          ],
        }),
        emptyQuarantine,
      ),
    /known-good recovery image/,
  );
});

test("one artifact descriptor cannot extrapolate one smoke test to other boards", () => {
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          releases: [
            artifact({
              hardware_revisions: ["B1144C_250901_USB_C", "HARDWARE_REV1"],
            }),
          ],
        }),
        emptyQuarantine,
      ),
    /exactly one valid hardware profile/,
  );
  assert.throws(
    () =>
      validateFirmwarePublicationManifest(
        manifest({
          releases: [artifact({ pcb_markings: ["B1144C_250901", "BM1144-C"] })],
        }),
        emptyQuarantine,
      ),
    /exactly one physical PCB marking/,
  );
});

test("structured evidence must repeat every safety fact for the exact artifact", () => {
  const descriptor = artifact();
  const { record: _recordPath, ...recordFields } = descriptor.hardware_evidence;
  const record = { schema_version: 1, ...recordFields };
  assert.equal(validateHardwareEvidenceRecord(descriptor, record), true);
  assert.throws(
    () => validateHardwareEvidenceRecord(descriptor, { ...record, key2_recovery_passed: false }),
    /differs at key2_recovery_passed/,
  );
  assert.throws(
    () => validateHardwareEvidenceRecord(descriptor, { ...record, artifact_sha256: "d".repeat(64) }),
    /differs at artifact_sha256/,
  );
});

test("a hardware evidence transcript must contain exact facts and every captured test section", () => {
  const descriptor = artifact();
  const { record: _recordPath, ...recordFields } = descriptor.hardware_evidence;
  const record = { schema_version: 1, ...recordFields };
  const transcript = [
    "# Exact image hardware smoke",
    record.tested_at,
    record.artifact_sha256,
    record.source_commit,
    record.hardware_profile,
    record.pcb_marking,
    record.application_usb_id,
    record.recovery_usb_id,
    record.known_good_reflash_sha256,
    "## CLI program and byte verification\n$ wchisp flash canary.bin\nProgram completed and byte verify passed.",
    "## WebUSB program and byte verification\nWebUSB program completed and byte verify passed in the browser log.",
    `## Application USB HID and CDC\nKernel observed ${record.application_usb_id} with HID and CDC ACM interfaces.`,
    "## Display and BadgeMagic upload\nBadgeMagic app upload passed and the display showed the uploaded nametag.",
    "## KEY1 and short KEY2\nKEY1 behavior passed; a short KEY2 press stayed in the application.",
    `## KEY2-only recovery\nLong KEY2 showed the dot and enumerated ${record.recovery_usb_id}.`,
    `## Known-good reflash\nReflash of ${record.known_good_reflash_sha256} completed and verify passed.`,
  ].join("\n");
  assert.equal(validateHardwareEvidenceTranscript(descriptor, record, transcript), true);
  assert.throws(
    () => validateHardwareEvidenceTranscript(descriptor, record, ""),
    /transcript is empty/,
  );
  const headingsOnly = [
    "# Exact image hardware smoke",
    record.tested_at,
    record.artifact_sha256,
    record.source_commit,
    record.hardware_profile,
    record.pcb_marking,
    record.application_usb_id,
    record.recovery_usb_id,
    record.known_good_reflash_sha256,
    "## CLI program and byte verification",
    "## WebUSB program and byte verification",
    "## Application USB HID and CDC",
    "## Display and BadgeMagic upload",
    "## KEY1 and short KEY2",
    "## KEY2-only recovery",
    "## Known-good reflash",
  ].join("\n");
  assert.throws(
    () => validateHardwareEvidenceTranscript(descriptor, record, headingsOnly),
    /no captured evidence/,
  );
  assert.throws(
    () =>
      validateHardwareEvidenceTranscript(
        descriptor,
        record,
        transcript.replace("## Known-good reflash", "## Missing"),
      ),
    /Known-good reflash/,
  );
});

test("a quarantined SHA cannot be republished even with claimed hardware evidence", async () => {
  const quarantine = JSON.parse(
    await readFile(new URL("../firmware/quarantine.json", import.meta.url), "utf8"),
  );
  const failed = artifact({
    sha256: FAILED_SHA,
    hardware_evidence: evidence({ artifact_sha256: FAILED_SHA }),
  });
  assert.throws(
    () => validateFirmwarePublicationManifest(manifest({ lab_images: [failed] }), quarantine),
    /matches a quarantined firmware SHA-256/,
  );
});

test("third-party recovery descriptors remain outside the FrogAlert publication evidence gate", () => {
  const recovery = {
    kind: "open-badgemagic-recovery",
    hardware_verified_by_frogalert: false,
  };
  assert.equal(
    validateFirmwarePublicationManifest(manifest({ recovery_images: [recovery] }), emptyQuarantine),
    true,
  );
});

test("quarantine entries reject duplicate hashes", () => {
  const entry = {
    sha256: FAILED_SHA,
    source_commit: "a".repeat(40),
    hardware_profile: "B1144C_250901_USB_C",
    pcb_marking: "B1144C_250901",
    status: "failed-hardware-smoke",
    evidence: "agent-memory/logs/2026-07-22-failure.md",
    reason: "failed",
  };
  assert.throws(
    () => validateFirmwareQuarantine({ schema_version: 1, artifacts: [entry, { ...entry }] }),
    /duplicate quarantined firmware SHA-256/,
  );
});
