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

- `B1144C_260404_USB_C`: 204,364 bytes, SHA-256
  `07b32a578d308b6db52e620130d5c4a700fb6fa77d0d9ca0c3ce29cc3ca91995`
- `B1144C_250901_USB_C`: 204,332 bytes, SHA-256
  `ca5140869aeeebf291dffbfb448142ac9a3e7bb66bf88509f507329a01a97f65`

Neither exact artifact has a hash-bound physical flash, display, radio,
BadgeMagic upload, or KEY2 recovery transcript. Keep both
hardware-unverified and outside the public release manifest.

The `260404` application maps the short view-rotation action to physical KEY1,
nearest USB, so it matches the `250901` user's physical muscle memory. Its
farther KEY2 keeps short system-mode control and the independent long-press ISP
hook. The `250901` application retains its existing KEY1 system and KEY2 view
actions.
