# 2026-08-05 no-shutdown button recovery

## Physical report

On the exact bottom `0.2.0-beta.6` image, two short presses of the top/KEY1
button turned the panel off permanently. Neither button woke it and a long
bottom/KEY2 hold could not enter ISP. USB attachment immediately rebooted it.

## Root cause

This was the upstream system-mode cycle, not the 16 kHz LED refresh or a
debounce failure. KEY1 short advanced `NORMAL -> DOWNLOAD -> POWER_OFF`.
`poweroff()` stopped the running application and configured only the
profile-specific KEY1 GPIO wake edge. Once stopped, the independent
application-level `SCAN_BOOTLD_BTN` task could no longer sample KEY2 every
200 ms or call `reset_jump()` after more than ten held samples. USB caused a
new boot, which explains the otherwise unrecoverable state.

## Fix

FrogAlert survey and frog builds now route KEY1 short through
`frogalert_change_mode()`. The first short press still enters upstream download
mode. When already in `DOWNLOAD`, the next short press explicitly sets
`NORMAL`, disables persistent advertising, and calls `mode_setup_normal()`.
No FrogAlert button path can now advance to `POWER_OFF`. KEY1 long brightness,
KEY2 short display/count selection, and the original long-KEY2 ISP task remain
unchanged.

The always-on-BLE early return also uses the safe wrapper so it cannot skip
from download into shutdown.

## Local verification

- Focused source-transform tests require the safe wrapper, explicit
  advertising shutdown, normal-mode setup, and unchanged KEY2 ISP poll.
- Both counter and both optional frog candidates pass the pinned source,
  toolchain, profile, ELF/BIN identity, startup/vector, USB/BLE/display/KEY2,
  RAM, and candidate receipt gates.
- Rust formatting, Clippy with warnings denied, 31 workspace tests, 20 direct
  Node test files, HTML validation, and `git diff --check` pass. The aggregate
  `./scripts/verify` advanced through its 158 Node checks and stopped only when
  local site assembly could not find the intentionally unmaterialized
  historical `0.2.0-beta.3` release BIN; canonical CI owns release-byte
  materialization.
- Counter top: 200,468 bytes,
  `d60fc693ba598082c8703699c2f9e25dcfcae56d968d177ecc3385525dcb9f9d`.
- Counter bottom: 200,468 bytes,
  `c8af928aeaad52bd467ddb07c9c3dc802d2023d639c61b5992ab2619d950f65d`.
- Frogs top: 200,552 bytes,
  `55b5cb13f36414c8776b13e4820dd079a98e8f5420e19c7c2c7e8a13c81345a0`.
- Frogs bottom: 200,552 bytes,
  `4380b3a2f5372240dead33bc67d834c2d1b1261d3f72f0ff43ab644f62419203`.

These are source/build results, not physical proof. The exact cloud-built
bottom image still needs repeated KEY1 short presses followed by a continuous
roughly 2.2-second KEY2 ISP hold on the matching `250901` badge.
