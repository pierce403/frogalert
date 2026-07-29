# 2026-07-28 fixed survey pages

## Display behavior

The FOSSASIA-shell survey renderer no longer scrolls FrogAlert counts or text
alerts. The counter is one centered frame: `BT 04` after a completed survey,
with `I`, `R`, `S`, `E`, or `T` appended while that phase is active. Saturated
counts render as `BT 64+`.

Text messages are limited to 16 characters and rendered as no more than two
fixed pages. A space is used as the split point when both halves fit; otherwise
the renderer splits after eight characters. The replacement timing holds every
generated page for one second exactly once.
Built-in alerts therefore appear as:

- `COP`, then `DETECTED`
- `FLIPPER`, then `DETECTED`
- `KARR`, then `DETECTED`

The frog alert keeps its intentional two-pose animation, with each pose held
for one second.

## Locked build evidence

Both profiles passed the FOSSASIA runtime, vector, ELF/BIN identity, radio
survey, and minimum-RAM-headroom gates. They are local/CI candidates only:

- `B1144C_260404_USB_C`: 204,748 bytes, SHA-256
  `8e602591ce0d87c98c97d9147cfbc023d697a87c4a4797c020b85ba4d9b3ae9c`
- `B1144C_250901_USB_C`: 204,724 bytes, SHA-256
  `0e92b9b778398c59e7d1b07944c270c80d4d27b45d8d1f8094f7a0a204084b30`

Neither exact artifact has a hash-bound physical flash, display, radio,
BadgeMagic upload, or KEY2 recovery transcript. Keep both
hardware-unverified and outside the public release manifest.

The `260404` application maps the short view-rotation action to physical KEY1,
nearest USB, so it matches the `250901` user's physical muscle memory. Its
farther KEY2 keeps short system-mode control and the independent long-press ISP
hook. The `250901` application retains its existing KEY1 system and KEY2 view
actions.

## Physical glyph failure and correction

The first flashed fixed-page image showed `FLIPPER` as `FLIFFER`-like text and
made the count digits look malformed. Inspection confirmed that FOSSASIA's
`font5x7[][6]` stores a blank lead-in column at index 0 followed by five real
glyph columns. The static renderer copied indices 0–4, retaining the blank and
dropping the right edge of every glyph. The replacement copies indices 1–5.
This source-level cause exactly fits the observed P/F and digit failures, but
the corrected replacement hashes still require physical confirmation.

## Blink conflict and output-stage ownership

The user then physically observed that a nametag configured for blink could
still stomp on `FLIPPER DETECTED`. Guarding the animation task events was not a
sufficient final boundary because all FOSSASIA modes share `fb`.

The replacement renderer uses two private 44-column buffers. It draws a
complete frame into the inactive buffer, switches the selected index, and only
then claims display ownership. `TMR0_IRQHandler`, the final LED refresh path,
uses the committed private buffer whenever FrogAlert owns the panel and uses
FOSSASIA's `fb` otherwise. Blink, marquee, all nine base animation modes, and
queued BLE animations can therefore continue writing shared state without
changing the visible FrogAlert alert. Streaming and non-normal system modes
still deliberately suspend FrogAlert and return the display to FOSSASIA.

## Alert-relative frame timing

Physical testing of the preceding image showed `FLIPPER`, `DETECTED`, then
`FLIPPER` again. Its page change came from a free-running 1.5-second reload
event that was not anchored to alert start, while the alert itself ended on a
separate fixed three-second event. The page step also wrapped modulo page
count, allowing a boundary event to redraw page zero.

The replacement renders frame zero immediately, starts a one-shot page event
relative to that alert, advances without wrap, and schedules another event only
when an unshown frame remains. The end event is
`one second × generated frame count`. Thus a one-page custom alert lasts one
second; built-in two-page alerts and the two-pose frog animation last two
seconds, with no repeated filler frame.
