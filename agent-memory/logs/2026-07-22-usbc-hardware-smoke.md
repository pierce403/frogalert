# 2026-07-22 USB-C hardware smoke

## Physical target

- PCB silkscreen: `B1144C_250901`
- Connector: USB-C
- MCU: WCH `CH582M`, 48-pin package, confirmed by readable macro photo
- Battery: pouch cell soldered to PCB tabs; no user-removable connector
- `Y2`: populated metal-can component; frequency and connection unverified

## ISP entry results

- OEM application enumerated as `0416:5020`, manufacturer `wch.cn`, product
  `CH583`.
- Holding KEY2 while pressing the populated `RESET` switch caused no USB
  re-enumeration.
- With USB attached, holding KEY2 while momentarily bridging both ends of `C3`
  enumerated WCH ROM ISP as `4348:55e0`, `bcdDevice=24.00`, at 11:40:51 and
  again at 11:41:20 in the Linux kernel journal.
- C3 entry is a hazardous power-rail collapse and remains bench-only recovery,
  not ordinary public web-flasher guidance.

## Open application boot

After a user-run flash, the badge rebooted at 11:41:29 with:

- USB id `0416:5020`
- manufacturer `FOSSASIA WAS HERE`
- product `LED Badge Magic`
- serial `BM1144-C fw: v0.1`
- HID interface plus CDC ACM at `/dev/ttyACM0`

The downloaded file was subsequently found at
`/home/pierce/Downloads/badgemagic-ch582.bin`. It is 177,704 bytes, has SHA-256
`2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`,
and exactly matches FOSSASIA's pinned USB-C development blob `18bffdb` from
source `9ce885d` with embedded string `(C) v0.1-42-g9ce885d`. The `wchisp info`,
program, and verify transcript was not captured, so this establishes exact
download provenance but not definitive proof that the same pathname was
programmed. It does not verify the FrogAlert browser transport, FrogAlert Rust
firmware, all 484 matrix positions, BLE, or interrupted-write recovery.

## Application recovery

From the running FOSSASIA `BM1144-C fw: v0.1` image, a KEY2-only long press
displayed the documented dot cue and entered ISP without pressing RESET or
bridging C3. Exact elapsed timing and a fresh kernel enumeration transcript were
not captured. This verifies the FOSSASIA application recovery affordance on
this badge. FrogAlert now has a shared source-level 2.2-second KEY2 recovery
hook, but each Rust image still needs to independently pass the physical test.

## Next hardware gates

1. Capture precise FOSSASIA KEY2 hold timing and a kernel enumeration
   transcript.
2. Confirm BadgeMagic app upload and the displayed 11x44 orientation.
3. Build and audit `B1144C_250901_USB_C`, then decide explicitly whether to
   risk the display-only pixel walk.
4. If flashed, record program/verify, all 484 pixels, current, power-cycle, and
   KEY2 short/long-press recovery before promoting the exact BIN.
5. Implement calibrated internal-LSI BLE support before offering a USB-C count
   image.

## Repository recording validation

- `git diff --check`: passed
- Node browser/site tests: 6 files passed
- assembled static site, HTML validation, and all three repo-local skill
  validations: passed
- `./scripts/verify`: blocked before Rust checks because both `cargo` and
  `rustup` resolve through `/snap/bin` and this host currently refuses Snap
  applications for user `pierce`; no Rust source changed in this recording pass
