# Nyx profiles and configurable monitoring

Date: 2026-07-28

Nyx documents a newer USB-C BadgeMagic PCB marked `B1144C_260404`, contrasted
with the earlier `B1144C_250901`:

- <https://badge.nyx.ms/>
- <https://github.com/fossasia/badgemagic-firmware/commit/696bbd71b608a3f0db585cd0d8d828ce1f5dc0a3>

The boards do not have different LED matrix pin orders. Both use the pinned
`USBC_VERSION=1` table:

```text
PA15 PB18 PB0 PB7 PA12 PA10 PA11 PB9 PB8 PB15 PB14 PB13
PB12 PB5 PA4 PB3 PB4 PB2 PB1 PB6 PB21 PB20 PB19
```

KEY2 remains PB22/pull-up/active-low. The relevant delta is KEY1 on PA1:

- `B1144C_250901_USB_C`: pull-down, active-high press, rising-edge shutdown
  wake;
- `B1144C_260404_USB_C`: pull-up, active-low press, falling-edge shutdown wake.

The `260404` profile is the firmware build default. Safe passive boot-time
auto-detection is not possible: before KEY1 is pressed, its switch is open on
both boards, so PA1 only follows the internal pull selected by firmware. A
first press can provide a polarity clue only after boot, first-button
semantics, and shutdown wake have already been configured. Keep separate
profile artifacts and require the printed PCB marking; color and generic
`BM1144-C` text are insufficient.

The survey candidate now has a fixed 384-byte CRC-protected
`FROGALERTCFGv1` block. It carries the compiled profile id, five built-in
target bits, and up to eight custom name/public-OUI/16-bit-service rules. The
web flasher validates exactly one block and its profile, patches an immutable
copy, calculates a new SHA-256, and marks that local derivative unverified.
Configuration never changes the hardware profile.

Survey starts remain roughly 20 seconds apart. A continuously present match can
therefore produce its message once per window, and each alert owns the display
for three seconds. The observed scrolling fight came from original animation
events queued before display ownership changed. Their marquee, flash, fixed,
and Bluetooth handlers now consume queued steps without rescheduling while an
overlay is active; the selected nametag/count view resumes after release.

CI candidates contain both profile-specific survey BIN/ELF pairs. They remain
expiring Actions build evidence with every approval/publication flag false.
Without exact-board, exact-hash physical evidence, neither candidate nor a
customized derivative may enter GitHub Releases, Pages, or the public firmware
manifest.
