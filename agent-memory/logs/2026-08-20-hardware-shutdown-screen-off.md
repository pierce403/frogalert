# Hardware shutdown screen off

## Report and cause

The owner reported substantially higher screen-off draw than the standard
firmware. The then-current FrogAlert dark state stopped only TMR0/matrix drive
while deliberately retaining TMR3 button polling, TMOS, USB, BLE state, and the
200 ms KEY2 recovery task. Bluetooth discovery was requested to stop, but this
was not equivalent to the standard firmware's `LowPower_Shutdown(0)` path.

Pinned WCH/FOSSASIA evidence supports shutdown rather than retained sleep:

- FOSSASIA `9ce885d` implements power off with GPIO wake and
  `LowPower_Shutdown(0)`.
- WCH documents shutdown wake as a global reset and exposes reset status
  `RST_STATUS_GPWSM` plus the one-byte `R8_GLOB_RESET_KEEP` keeper.
- The configured BLE clock selection requires retained BLE sleep to remain
  disabled, so `LowPower_Sleep` is not a supported continuation strategy.

## Beta.12 design

Screen off now blanks the display and requests a dedicated survey shutdown.
If Central discovery is active, entry is deferred until its completion callback
confirms the radio is idle. The callback schedules a common-task event rather
than blocking inside the GAP callback. The event rechecks `mode == POWER_OFF`,
then stops TMR3 and enters hardware shutdown. Returning to normal mode clears
both survey intent and the queued event.

Wake pins are compile-time exact:

- `B1144C_260404`: KEY2/PB22 falling edge (physical top) plus PA0 charge.
- `B1144C_250901`: KEY1/PA1 rising edge (physical top), KEY2/PB22 falling edge
  for held recovery, plus PA0 charge.

A reset-keep marker distinguishes FrogAlert screen-off wake from unrelated
resets. Immediately after the 60 MHz clock is restored—and before debug, USB,
LED, button-task, or BLE initialization—the application consumes the marker.
A held KEY2 is sampled every 200 ms and jumps to mask-ROM ISP after more than
ten confirmed samples. A sampled-but-released KEY2 on `250901` re-enters
shutdown; a top wake cold-boots normally. Strong GPIO handlers prevent the
pinned startup weak-vector loop during the narrow pre-WFI window and convert
a consumed wake edge into a marked software reset.

## Evidence boundary

Transform and site tests cover async cancellation, race cancellation, exact
wake-pin selection, marker consumption, held-KEY2 qualification, GPIO handler
ownership, and the chart order. Local candidate size/hash receipts are:

- counter top: 201,112 bytes,
  `a75116b71c282ac459c7a9323638f973e7af22a9e473c3ba0555a2128eb65799`;
- counter bottom: 201,200 bytes,
  `fa8914111896b886b527bffa2da6665e485a455e664012d2bc9063e10babe5b4`;
- frogs top: 201,200 bytes,
  `6850041d1c1f9e35c3b20d37fee5bb43de110c8e23d0e38322bb3caa53947716`;
- frogs bottom: 201,284 bytes,
  `b8c74a3513295fa6830e09a9a4ef4eca08f9a77b38cf5ed298224f8b23e37a5a`.

This remains source/build evidence only; exact-board current, wake, charge,
ISP, USB/App, display, and survey-resume tests are still required.
