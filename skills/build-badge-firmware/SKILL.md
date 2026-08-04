---
name: build-badge-firmware
description: Build, inspect, test, package, or release FrogAlert firmware for the WCH CH582M BadgeMagic 11x44 badge. Use for embedded Rust toolchain work, HAL integration, firmware binaries, hardware flashing, BadgeMagic compatibility checks, or release artifacts.
---

# Build Badge Firmware

Keep build evidence and hardware evidence distinct. A successful cross-compile
is not physical proof, but the owner has chosen to publish the standard
counter release pair automatically after the pinned CI build, structural
audits, provenance attestation, and quarantine checks pass.

## Workflow

1. Read `docs/HARDWARE.md`, `docs/ARCHITECTURE.md`, `FEATURES.md`, and current
   firmware source before changing the target.
2. Bind every image to one supported CH582M 11×44 profile and physical PCB
   marking. If the physical board is unavailable, keep `hardware_verified`
   false and label that status prominently; this no longer blocks a
   CI-audited beta release.
3. Base CH582M badge images on the pinned FOSSASIA hardware shell. Preserve its
   startup assembly, linker layout, clocks, USB HID+CDC, BLE/TMOS service,
   display refresh, buttons, and KEY2 recovery. Keep detection policy in
   `frogalert-core` behind a narrow primitive C ABI; Rust must not own reset,
   vectors, interrupts, clocks, USB, BLE setup, or display scanning until a
   separately audited runtime passes physical recovery tests.
4. Preserve the BadgeMagic compatibility contract: advertised identity,
   `FEE0/FEE1`, 16-byte legacy chunks, uploaded framebuffer, and normal nametag
   behavior outside brief disconnected scan windows.
5. For a survey candidate, use passive discovery only and never establish a
   central connection. Gate both preparation and scan start on a disconnected,
   idle BadgeMagic state; remember and restore prior advertising on every exit;
   add a bounded cancellation watchdog; keep a fixed address cap; explicitly
   zero observations; log only aggregates; and enforce at least 8 KiB between
   static RAM and the stack top.
6. Build through the repo's pinned FOSSASIA preparation/build scripts. Audit
   the final linked vector targets and reject AMO/LR/SC instructions. Record
   the exact C and Rust toolchains, upstream source/archive hashes, linker
   configuration, binary size, and source commit. Reconstruct the BIN from the
   audited ELF and require byte identity with the Make output plus the locked
   size/SHA. Never treat one copied WCH marker, metadata string, or handler
   symbol as proof that the vector table reaches it.
7. Run host tests first, then embedded build checks, then hardware smoke checks.
8. Never perform the first irreversible flash without explicit human approval.
9. Keep local build outputs under ignored `tmp/`. The trusted main-CI workflow
   may automatically publish the standard counter top/bottom pair when it has
   exact BIN/ELF hashes, one-profile/one-PCB binding, a commit-bound candidate
   receipt, canonical workflow/run/artifact metadata, successful structural
   audits, provenance attestations, and no quarantine hit. Record these as
   `hardware_verified: false`, `verification_basis: ci-audited`, and
   `flash_approved: true`; never fabricate physical evidence. Experimental lab
   images and third-party recovery images keep their separate gates. A
   quarantined SHA may never be republished.
10. Update `FEATURES.md` and `agent-memory/logs/` with evidence, not optimism.

## Required checks before claiming hardware verification

- opened PCB and readable `CH582M` package marking;
- exactly 44 LED columns and known hardware revision;
- a separate record of the physical PCB marking/photos and selected firmware
  profile;
- profile-appropriate low-speed clock proven; the USB-C FOSSASIA baseline uses
  calibrated internal LSI, not the old Rust HAL's external-LSE path;
- ISP enumerates as `4348:55e0` or `1a86:55e0`;
- stable USB power and a tested bootloader-entry procedure;
- owner understands that the read-protected OEM image cannot be backed up.

## Validation

Run `./scripts/verify`. Before automatic publication, require the pinned release
build, binary-size/vector/RAM/instruction checks, ELF-to-BIN identity, exact
profile pair, candidate receipt, quarantine check, and GitHub provenance
attestations. Keep local `wchisp` and WebUSB program/byte verification, USB
HID+CDC enumeration, display smoke, BadgeMagic upload, button behavior, KEY2
entry, known-good reflash, and power-cycle repetition as the evidence required
to change the truthful hardware status from unverified to verified.
