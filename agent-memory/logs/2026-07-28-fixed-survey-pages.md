# 2026-07-28 fixed survey pages

## Display behavior

The FOSSASIA-shell survey renderer no longer scrolls FrogAlert counts or text
alerts. The counter is one centered frame: `BT 04` after a completed survey,
with `I`, `R`, `S`, `E`, or `T` appended while that phase is active. Saturated
counts render as `BT 64+`.

Text messages are limited to 16 characters and rendered as no more than two
fixed pages. A space is used as the split point when both halves fit; otherwise
the renderer splits after eight characters. Each page is held for 1.5 seconds,
so the existing three-second alert lifetime shows both pages exactly once.
Built-in alerts therefore appear as:

- `COP`, then `DETECTED`
- `FLIPPER`, then `DETECTED`
- `KARR`, then `DETECTED`

The frog alert keeps its intentional two-pose animation, with each pose held
for 1.5 seconds.

## Locked build evidence

Both profiles passed the FOSSASIA runtime, vector, ELF/BIN identity, radio
survey, and minimum-RAM-headroom gates. They are local/CI candidates only:

- `B1144C_260404_USB_C`: 204,532 bytes, SHA-256
  `ef144ee07f5138277ccc217541834a20c4a8660a36cfa7ab468db4d90b4fff20`
- `B1144C_250901_USB_C`: 204,508 bytes, SHA-256
  `36cca2721c2535df9eefd950e178c5f39d192a6f7f3f07c4683a03f2edb55af8`

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
