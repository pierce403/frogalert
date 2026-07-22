# Release process

FrogAlert has two independently versioned surfaces: the static website and the
badge firmware. A website release can ship without firmware; a firmware release
cannot ship without hardware evidence.

## Website-only release

1. Update site copy, tests, docs, and `FEATURES.md` together.
2. Run `./scripts/verify`.
3. Perform a real local browser smoke at desktop and mobile widths.
4. Commit and push the cohesive change.
5. Verify GitHub Pages publishes the exact commit over HTTPS.
6. Confirm `frogalert.org` and the firmware manifest load without mixed content.
7. Record the deployed commit and any browser limitations in a dated log.

## Firmware release gate

Do not publish a firmware entry until all of these exist:

- positively identified CH582M 11×44 badge and recorded PCB revision;
- clean release build from the pinned FOSSASIA source and MRS toolchain, plus
  a pinned Rust toolchain if the image links the Rust policy archive;
- ELF and raw BIN artifacts;
- raw BIN size within the target region;
- SHA-256 and manifest entry tied to the source commit;
- captured local `wchisp` program and byte-verify success;
- WebUSB program and verify success;
- display, button, power-cycle, and recovery smoke tests;
- official BadgeMagic app upload before and after an alert/scan cycle;
- release notes with irreversible first-flash warning and CLI fallback.

The historical `frogalert-pixel-walk` and `frogalert-count` standalone Rust
images do not satisfy this gate. Their final ELFs contain a broken external
interrupt-vector layout, their build helpers intentionally refuse to emit a
BIN, and their failed SHA remains permanently quarantined.

The replacement USB-C path inherits the calibrated internal-LSI, USB,
BadgeMagic, display, button, and recovery systems from FOSSASIA source
`9ce885d`. Do not publish its C-only or Rust-ABI canaries until the exact bytes
pass the complete gate above.

## Manifest entry

The manifest is `firmware/releases/manifest.json`. It separates physically
approved FrogAlert firmware in `releases`, physically approved experimental
FrogAlert builds in `lab_images`, and attributed third-party substitutes in
`recovery_images`. A future FrogAlert release entry has this shape:

```json
{
  "id": "frogalert-0.1.0-alpha.1-b1144c-250901-usbc",
  "kind": "frogalert-release",
  "label": "FrogAlert 0.1.0 alpha 1",
  "version": "0.1.0-alpha.1",
  "channel": "alpha",
  "target": "ch582m-badgemagic-11x44",
  "hardware_revisions": ["B1144C_250901_USB_C"],
  "pcb_markings": ["B1144C_250901"],
  "source_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "file": "frogalert-0.1.0-alpha.1-ch582m.bin",
  "bytes": 123456,
  "sha256": "64-lowercase-hex-characters",
  "hardware_verified": true,
  "hardware_evidence": {
    "artifact_sha256": "64-lowercase-hex-characters",
    "source_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "record": "firmware/evidence/YYYY-MM-DD-image-profile.json",
    "tested_at": "YYYY-MM-DD",
    "hardware_profile": "B1144C_250901_USB_C",
    "pcb_marking": "B1144C_250901",
    "transcript": "agent-memory/logs/YYYY-MM-DD-image-profile-smoke.md",
    "cli_program_verified": true,
    "cli_byte_verify_passed": true,
    "webusb_program_verified": true,
    "webusb_byte_verify_passed": true,
    "boot_observed": true,
    "power_cycle_passed": true,
    "key1_behavior_passed": true,
    "short_key2_behavior_passed": true,
    "application_usb_id": "0416:5020",
    "application_hid_enumeration_passed": true,
    "application_cdc_enumeration_passed": true,
    "display_passed": true,
    "badgemagic_upload_passed": true,
    "key2_dot_observed": true,
    "key2_recovery_passed": true,
    "known_good_reflash_passed": true,
    "known_good_reflash_sha256": "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2",
    "recovery_method": "key2-only",
    "recovery_usb_id": "4348:55e0"
  },
  "release_url": "https://github.com/pierce403/frogalert/releases/tag/v0.1.0-alpha.1"
}
```

The site must reject unknown targets, false `hardware_verified`, invalid hashes,
oversize images, and unsupported hardware revisions for destructive use. One
descriptor covers exactly one firmware profile and one physical PCB marking;
publish a separate artifact descriptor and evidence record for every additional
board. Site assembly parses the structured record under `firmware/evidence/`
and requires every hash, source, board, USB, display, app-upload, KEY2-only
recovery, and known-good-reflash fact to match the manifest. It also reads the
bound dated transcript and requires exact identifiers plus dedicated CLI,
WebUSB, application USB, display/app, button, KEY2, and reflash sections. A
C3-assisted ROM entry is useful recovery evidence but cannot satisfy the
application KEY2 acceptance gate.

A `lab_images` entry carries the same immutable identity and physical-evidence
fields as a release. It differs in stability/support expectations, not in
hardware safety. Unverified images stay only under ignored `tmp/`; the public
assembler rejects `hardware_verified: false`, missing or mismatched evidence,
and every SHA in `firmware/quarantine.json`. The browser also checks that
registry after hashing a manually selected local file, so a previously
downloaded failed artifact cannot be reintroduced through the developer path.

The current `releases` and `lab_images` arrays are empty. The first USB-C
pixel-walk build was withdrawn after a blank-boot hardware failure and failed
KEY2 recovery. A build-only or failed FrogAlert artifact must remain under
ignored `tmp/` paths and must never be copied into the public release directory.
The one `recovery_images` entry is FOSSASIA's official open BadgeMagic firmware
v0.1 substitute, constrained to exact `HARDWARE_REV1` and recorded as
`hardware_verified_by_frogalert: false`. It is not a FrogAlert release and it is
not the original OEM firmware.

## Temporary build evidence

Prepare and build the replacement shell only through its pinned scripts:

```sh
./scripts/prepare-fossasia-usbc --with-toolchain
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
```

The baseline must reproduce the known-good 177,704-byte BIN at SHA-256
`2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`.
The canary adds only an inert retained metadata string. Both lanes preserve the
FOSSASIA USB-C startup/linker/runtime and audit required symbols, startup
marker, USB identity, KEY2-related runtime, and forbidden atomic instructions.
The final Make-produced BIN must also match a fresh `objcopy -O binary -S` of
the audited ELF, and both baseline and canary size/SHA-256 values are locked.
Everything remains under ignored `tmp/fossasia-usbc/`; the scripts neither
flash nor copy bytes into a public directory.

The old standalone Rust helpers are diagnostic quarantine checks only. They
build an ELF, demonstrate the misplaced external table and wrong Timer 0
vector, delete any stale BIN, and fail before `objcopy`. Do not work around that
failure or use a historical temporary BIN.

## Rollback and recovery

There is no factory/OEM rollback. The original image is read-protected,
unavailable, cannot be dumped, and therefore cannot be restored after the first
replacement.

For an exactly identified FOSSASIA Micro-USB `HARDWARE_REV1` board, the website
may prepare FOSSASIA's published open BadgeMagic v0.1 firmware as a substitute:

- file: `badgemagic-open-v0.1-hardware-rev1.bin`;
- length: `155672` bytes;
- SHA-256: `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`;
- FrogAlert hardware verification: false.

Preparing that image is non-destructive. While its hardware-verification flag
is false, it cannot reach the separate final program action. Unknown revisions,
`HARDWARE_REV2`, and `HARDWARE_REV3` have no approved substitute. After
FrogAlert releases exist, a failed update should be recoverable by re-entering
WCH ISP and reflashing a
physically tested last-known-good open image. That retry must itself be tested
before any FrogAlert release is called stable.

A physical Rev1 recovery smoke must pass before changing that flag and enabling
the path.
