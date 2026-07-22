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
- clean release build from a pinned Rust toolchain and HAL revision;
- ELF and raw BIN artifacts;
- raw BIN size within the target region;
- SHA-256 and manifest entry tied to the source commit;
- local `wchisp` program and verify success;
- WebUSB program and verify success;
- display, button, power-cycle, and recovery smoke tests;
- official BadgeMagic app upload before and after an alert/scan cycle;
- release notes with irreversible first-flash warning and CLI fallback.

The current `firmware/frogalert-count/` observer/count/display prototype does
not satisfy this gate. It builds and passes a static QingKe instruction audit,
but it has not run on a positively identified physical badge, does not expose
the BadgeMagic GATT service, and is not approved for either local or browser
flashing.

The USB-C `B1144C_250901_USB_C` target is display-only. Do not publish a count
or scanning artifact for it until the BLE stack uses and calibrates internal
LSI instead of the current external-LSE configuration.

## Manifest entry

The manifest is `firmware/releases/manifest.json`. It separates physically
approved FrogAlert firmware in `releases`, hosted but unapproved FrogAlert
builds in `lab_images`, and attributed third-party substitutes in
`recovery_images`. A future FrogAlert release entry has this shape:

```json
{
  "version": "0.1.0-alpha.1",
  "channel": "alpha",
  "target": "ch582m-badgemagic-11x44",
  "hardware_revisions": ["verified-revision"],
  "source_commit": "full-40-character-commit",
  "file": "frogalert-0.1.0-alpha.1-ch582m.bin",
  "bytes": 123456,
  "sha256": "64-lowercase-hex-characters",
  "hardware_verified": true,
  "release_url": "https://github.com/pierce403/frogalert/releases/tag/v0.1.0-alpha.1"
}
```

The site must reject unknown targets, false `hardware_verified`, invalid hashes,
oversize images, and unsupported hardware revisions for destructive use.

A `lab_images` entry carries the same immutable identity fields—file, source
commit, exact profile, physical-marking requirement, byte length, and SHA-256—
but starts with `hardware_verified: false`. It may be hosted and selected for
local inspection; that flag must keep it impossible to arm or program even on
`/flash/`. After a recorded physical program/verify/display/button/recovery
smoke, promote the same exact bytes rather than silently rebuilding them.
Hosting, downloading, and hash verification are not flash approval.

The current `releases` array is empty. `lab_images` contains one immutable
display-only USB-C pixel-walk build from source `f794974`, constrained to
profile `B1144C_250901_USB_C` and physical marking `B1144C_250901`, with
`hardware_verified: false`. It is published for inspection, download, and a
deliberate local developer test—not direct manifest-managed programming. The
one `recovery_images` entry is FOSSASIA's official open BadgeMagic firmware
v0.1 substitute, constrained to exact `HARDWARE_REV1` and recorded as
`hardware_verified_by_frogalert: false`. It is not a FrogAlert release and it is
not the original OEM firmware.

## Temporary lab-build evidence

The revision-gated build commands are:

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup HARDWARE_REV1
./scripts/build-display-bringup B1144C_250901_USB_C --check
./scripts/build-display-bringup B1144C_250901_USB_C
./scripts/build-count-firmware HARDWARE_REV1 --check
./scripts/build-count-firmware HARDWARE_REV1
```

Every invocation produces an ignored BIN under `tmp/firmware/`, prints its byte
length and SHA-256, and audits it before either returning check evidence or
making it available for a deliberate lab-hosting change. Packaging changes the
reserved raw word at offset `0x14` from the Rust runtime's zero to WCH's startup
sentinel `0xF5F9BDA9`; any other pre-existing value is rejected as layout
drift. This happens before hashing and manifest generation. The sentinel gives
startup-format parity with the WCH/FOSSASIA images; it is not evidence that the
word itself enables ISP entry.

Those values are local, temporary, hardware-unverified build evidence only.
They change with source or toolchain changes and must not be treated as release
or flash authorization. A deliberate lab-hosting change may copy one exact
audited BIN into `lab_images`, but only with immutable provenance and
`hardware_verified: false`; the write lock is mandatory.

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
