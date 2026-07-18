# 2026-07-18 — open recovery and BLE count prototype

## Completed

- Added a same-origin, hash-pinned copy of FOSSASIA's v0.1 open BadgeMagic
  firmware and a manifest schema that keeps recovery images separate from
  hardware-verified FrogAlert releases.
- Added a recovery preparation UI with an exact `HARDWARE_REV1` gate. It sends
  no USB command, requires the opened-board/photo checklist, and refuses to arm
  destructive use while FrogAlert hardware verification is false.
- Added allocation-free BLE advertisement parsing, ephemeral unique-advertiser
  counting, a 44x11 framebuffer/font renderer, and simulator count previews.
- Added a shared Rev1 display crate, a no-BLE/LSE single-pixel walk for first
  physical bring-up, and a separate observer that passively scans for three
  seconds and displays the approximate count.
- Vendored `ch58x-hal` `611954e`, applied four documented PAC, BLE-heap,
  async-GPIO-gating, and synchronous-delay patches, and changed the target from
  unsafe IMAC atomics to atomic-free IMC.
- Hardened both build scripts against environment target/Rust-flag overrides,
  pinned their exact toolchain/target/bin/lockfile/output, and enabled
  A-extension decoding before rejecting AMO, LR, or SC instructions.

## Verified build evidence

Commands:

```bash
./scripts/build-display-bringup HARDWARE_REV1
./scripts/build-count-firmware HARDWARE_REV1
```

Results on the pinned nightly toolchain:

- pixel-walk ELF: text 4,542; data 4; BSS 116 bytes
- pixel-walk BIN: 4,548 bytes; SHA-256
  `9b5ffbaaf8d99cf459dd324904e9add0973a0b663d2e2abf271bf4dbb4c0d848`
- count ELF: text 131,022; data 340; BSS 8,554 bytes
- count BIN: 131,364 bytes; SHA-256
  `31517e3e0837940f3802c97b638087a94e4de7d296be97473a45e4e23db6789a`
- both ELFs report atomic-free `rv32imc` attributes and contain no decoded AMO,
  LR, or SC instructions

The BINs remain under `./tmp/firmware/`; they are not releases and are not
approved for flashing. No physical badge boot, pixel, BLE, current, or recovery
test has been performed.

## Durable lessons

The pinned HAL needed explicit local patches for its unavailable PAC version,
writable BLE heap pointer, no-Embassy GPIO configuration, and synchronous
SysTick delay. A successful link is useful evidence but not hardware readiness;
the external LSE, exact display map, and radio/display timing remain physical
gates.
