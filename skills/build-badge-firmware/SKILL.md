---
name: build-badge-firmware
description: Build, inspect, test, package, or release FrogAlert firmware for the WCH CH582M BadgeMagic 11x44 badge. Use for embedded Rust toolchain work, HAL integration, firmware binaries, hardware flashing, BadgeMagic compatibility checks, or release artifacts.
---

# Build Badge Firmware

Apply hardware gates before build convenience. A successful cross-compile is
not evidence that a badge is safe to flash.

## Workflow

1. Read `docs/HARDWARE.md`, `docs/ARCHITECTURE.md`, `FEATURES.md`, and current
   firmware source before changing the target.
2. Confirm the intended board revision is CH582M with an 11×44 matrix. If the
   physical board is unavailable, stop at build/test and label hardware status
   unverified.
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
9. Keep every first-test BIN only under ignored `tmp/`. For a release or public
   lab image, produce a `.bin`, SHA-256 checksum, release manifest, source
   commit, provenance, recovery instructions, and structured hash/source/one-
   profile/one-PCB physical verification record. It must prove application USB,
   display, BadgeMagic upload, KEY1/short-KEY2 behavior, KEY2-only dot-to-ISP
   recovery, and known-good reflash, with a bound dated transcript. A
   quarantined SHA may never be republished.
   Promotion happens only by adding the exact approved bytes, schema-v4
   descriptor, structured evidence, transcript, and release notes to the
   committed manifest. The post-CI workflow reconciles that reviewed entry; it
   must never publish the current build merely because a commit passed.
10. Update `FEATURES.md` and `agent-memory/logs/` with evidence, not optimism.

## Required hardware checks

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

Run `./scripts/verify`. Once firmware exists, also require a release build,
binary-size and vector-table checks, local `wchisp info`, captured program plus
byte verify, a separate WebUSB program plus byte verify, USB HID+CDC
enumeration, display smoke, BadgeMagic app upload, short-button behavior, KEY2
entry as `4348:55e0`/`1a86:55e0`, known-good reflash, and power-cycle
repetition.
