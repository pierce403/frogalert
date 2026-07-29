# 2026-07-28 display refresh

## Source and scope

The user pointed to `bkero/badgemagic-firmware` for less-flickery display
timing. The relevant work is commit
`074c448066573be2990fe83fd718a22c01b7c283` on branch
`b1144c-support`, not that fork's default branch.

FrogAlert ports the two narrow `src/main.c` changes only into the private
survey lane:

- Timer 0 ticks at 16 kHz rather than 4 kHz.
- The PWM off-period calls `leds_releaseall()` only on its first tick rather
  than repeating an identical 23-pin release on every later off tick.

The ISR uses four ticks for each of 22 column pairs, so the calculated
complete-frame rate rises from about 45.45 Hz to about 181.82 Hz. Baseline and
metadata-only canary images remain unchanged.

## Build evidence

Both profile builds retain the pinned FOSSASIA runtime and pass the vector,
ELF/BIN identity, no-atomic-instruction, and RAM-headroom audits:

- `B1144C_260404_USB_C`: 204,760 bytes, SHA-256
  `87d11900921cc33e20463ff2ce828cc4a4a2e3a967e33593518f074abd0eeeeb`
- `B1144C_250901_USB_C`: 204,736 bytes, SHA-256
  `d9ce4edb5093058fecbad09eb3e594ee8c4a7c1d113f99bb4764043ae02c5b9d`

These are private hardware-unverified candidates. The higher interrupt rate
must be tested at every brightness level while passive surveys, BadgeMagic
uploads, USB traffic, alerts, and ordinary animations run. Record visible
flicker, current draw/battery behavior, USB/BLE stability, power cycles, and
normal KEY2 recovery before promotion.
