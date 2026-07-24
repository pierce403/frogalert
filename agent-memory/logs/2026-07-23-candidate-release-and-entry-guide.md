# Commit-bound candidate builds and exact-board entry guidance

Date: 2026-07-23

## Outcome

Active firmware changes on `main` now extend CI with a locked USB-C survey
build. After the ordinary repository contract passes, CI packages an expiring
`frogalert-candidate-<full-commit>` Actions artifact containing the exact BIN,
symbol-bearing ELF, checksums, README, and machine-readable metadata. Its
deterministic version is `0.0.0-candidate.<12-char-commit>`.

The candidate lane has read-only repository permission and fixes
`hardware_verified`, `flash_approved`, `publishable`, and `hosted_on_site` to
false. It cannot edit the public manifest, create a GitHub Release, or reach
Pages. Existing post-CI publication still reconciles only exact, physically
approved manifest entries. `/flash/` sorts those approved descriptors by
semantic version, labels the newest approved version, and never selects,
downloads, arms, or flashes it automatically.

The current KARR-capable survey lane rebuilt as 201,788 bytes at SHA-256
`9d35de6a3bf7cdf90b2a4fe05fa25d0a85a3f9b18da42228b5e25908a92c51a7`.
Its Make BIN is byte-identical to the audited ELF-derived BIN. It remains a
candidate rather than a release because the positive badge report is not bound
to those exact bytes and the required CLI/WebUSB/recovery transcript is absent.

## First-entry guidance

The site, README, and hardware/flashing docs now identify the physically
confirmed USB-C board as PCB `B1144C_250901`, WCH `CH582M`, 11×44. Compatible
FOSSASIA or exact hardware-approved FrogAlert firmware provides the routine
KEY2 hook: hold about 2.2 seconds, release when one dot lights near the middle,
then choose `4348:55e0` or `1a86:55e0` during the observed 9–13 second window.

Original or unknown firmware reaches an ordinary-user stop boundary. On this
board RESET plus KEY2 did not work; the documented first entry held KEY2 while
a qualified operator momentarily bridged both ends of PCB capacitor C3. The
site records that hazardous expert-only rail-collapse evidence without turning
it or the soldered battery into a routine browser checklist.

## Browser lesson

The first local browser run loaded the new `app.js` against a cached older
`wchisp-protocol.js`, producing a missing-export syntax error before preflight.
Both HTML entry points now request `app.js?v=5`, and `site/app.js` requests the
changed protocol and ISP-guide modules with `?v=5`. Tests assert those bindings.
A warm-browser reload then initialized successfully, loaded the manifest and
quarantine registry, completed all five guide states through the read-only
chooser handoff, and showed no horizontal overflow at 1265 px or a 360 px
content viewport.

## Verification

- `./scripts/verify`: passed
- offline pinned survey build/audit: passed
- candidate BIN and ELF checksum verification: passed
- GitHub workflow YAML parse: passed
- local desktop/mobile browser and KEY2 guide interaction: passed
- physical WebUSB program/verify of the exact current candidate: still pending
