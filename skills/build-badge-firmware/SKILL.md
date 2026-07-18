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
3. Keep detection policy in `frogalert-core`; isolate HAL, BLE, display refresh,
   flash storage, and scheduling behind firmware-specific modules.
4. Preserve the BadgeMagic compatibility contract: advertised identity,
   `FEE0/FEE1`, 16-byte legacy chunks, uploaded framebuffer, and normal nametag
   behavior outside brief disconnected scan windows.
5. Build with the pinned toolchain and atomic-free
   `riscv32imc-unknown-none-elf` target through the repo scripts. QingKe V4 must
   not receive AMO/LR/SC instructions. Record the exact toolchain, HAL revision,
   linker configuration, binary size, and source commit.
6. Run host tests first, then embedded build checks, then hardware smoke checks.
7. Never perform the first irreversible flash without explicit human approval.
8. For a release, produce a `.bin`, SHA-256 checksum, release manifest, source
   commit, provenance, recovery instructions, and physical verification record.
9. Update `FEATURES.md` and `agent-memory/logs/` with evidence, not optimism.

## Required hardware checks

- opened PCB and readable `CH582M` package marking;
- exactly 44 LED columns and known hardware revision;
- a separate record of the physical PCB marking/photos and selected firmware
  profile;
- confirmed populated 32.768 kHz LSE before running the BLE count image;
- ISP enumerates as `4348:55e0` or `1a86:55e0`;
- stable USB power and a tested bootloader-entry procedure;
- owner understands that the read-protected OEM image cannot be backed up.

## Validation

Run `./scripts/verify`. Once firmware exists, also require a release build,
binary-size check, local `wchisp info`, program plus verify, display smoke,
BadgeMagic app upload, scan-window recovery, and power-cycle test.
