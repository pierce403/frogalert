# 2026-08-05 strict upstream button separation

## Physical report

On the exact bottom `0.2.0-beta.7` release, pressing the bottom/KEY2 button
still showed the Bluetooth animation and enabled pairing. The required behavior
is strict upstream role separation: bottom/KEY2 changes between scrolling names
and the Bluetooth counter; top/KEY1 turns Bluetooth download mode on, then the
next top/KEY1 press turns that mode off and returns to normal.

## Root cause

The profile mapping and button callback were correct. The remaining
cross-image compatibility feature was inside `frogalert_key2_transition()`:
after changing the view it called `frogalert_survey_open_app_window()`. That
enabled advertising for ten seconds and started a one-second Bluetooth cue, so
the view button visibly behaved like pairing.

## Fix

Version `0.2.0-beta.8` removes the app-window API, its two TMOS events and
timers, its state, and its display-attention callbacks. KEY2 short now calls
only `frogalert_view_transition()`. KEY1 remains the sole download-mode button;
its first press suspends surveying before advertising and its next press
disables advertising and returns to normal without entering shutdown.

Streaming/disconnect display restoration remains explicit. The independent
200 ms KEY2 polling task, more-than-ten-sample hold, and address-zero
`reset_jump()` ISP path are unchanged.

## Local build receipts

All four candidates pass the pinned source/toolchain, profile, ELF/BIN identity,
startup/vector, USB/BLE/display/KEY2, RAM, and candidate gates:

- counter top, 200,148 bytes:
  `f679dafd3be79e3bec448589b4e8a60149b2945bc5061435b96df4eef35df88c`;
- counter bottom, 200,148 bytes:
  `7974b2455ee7f1ffa4730f76fa56e44926a83cd1dd2d15e5f2a40bc2f6d28ae1`;
- frogs top, 200,220 bytes:
  `61d8f495b3f4b3ce6b7922da2c81a6a5fa9793782d14ede9b701261e75fb57fe`;
- frogs bottom, 200,220 bytes:
  `33ace6e6ee718d19ac18566811c838f913b719064d63207984ab878d022c0fba`.

Rust formatting, Clippy with warnings denied, 31 workspace tests, 20 direct
Node test files, HTML validation, and `git diff --check` pass. The aggregate
verifier passed all 158 Node checks and stopped only at local site assembly
because historical beta.3 release bytes are intentionally not materialized in
the checkout; canonical CI owns that release-byte step.

These are build evidence only. Physical acceptance must prove repeated KEY2
short presses never advertise or show the Bluetooth animation, two KEY1 short
presses enter then exit download mode, and continuous KEY2 long press still
enters ISP.
