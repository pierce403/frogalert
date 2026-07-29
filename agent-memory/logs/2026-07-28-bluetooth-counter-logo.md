# Bluetooth counter logo

Date: 2026-07-28

The survey counter no longer spells `BT`. Its fixed display frame copies the
six-column, full-height Bluetooth rune from the first frame of the pinned
FOSSASIA `src/res/bluetooth.xbm`, then draws the count with the corrected
five-column font slice. Saturation still appends `+`; initialization, ready,
scanning, error, and timeout phases still append their diagnostic glyph.

The normal result occupies 19 of 44 columns. The widest saturated diagnostic
form occupies 32, so every form is centered without scrolling or clipping.
The implementation retains the survey display's inactive-buffer write and
atomic ownership swap.

Locked private survey candidates:

- `B1144C_260404_USB_C`: 205,152 bytes, SHA-256
  `c6d06c59396aa6ffd6d1d9314cc4baf051c0205391c19a88bd749a31bface0d9`
- `B1144C_250901_USB_C`: 205,128 bytes, SHA-256
  `f9367fe16952f9f23758fd401f25ae6b0c22ec6cdab6f3893b1650d79173d5c9`

These are reproducible build evidence only. Confirm the rune's orientation,
centering, digits, phase suffixes, display refresh, BadgeMagic compatibility,
BLE survey behavior, and KEY2-only recovery on each exact PCB profile before
promotion.
