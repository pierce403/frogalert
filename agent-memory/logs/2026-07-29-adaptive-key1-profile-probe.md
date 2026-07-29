# Adaptive KEY1 profile probe

The two known USB-C boards share the CH582M, USB identities, 23-net display
map, and KEY2/PB22 active-low path. Their meaningful firmware difference is
KEY1/PA1:

- `B1144C_250901`: switch drives VDD; pull-down, active high, rising wake.
- `B1144C_260404`: switch drives ground; pull-up, active low, falling wake.

This explains why a cross-flashed image can display, scan, upload, and enter
KEY2 ISP but lose or misroute ordinary button and shutdown-wake behavior.

Passive detection remains impossible because an untouched switch is open.
The post-beta survey candidate instead samples PA1 under weak pull-down and
pull-up configurations during the 50 Hz button scan. After a 2 us settle:

- open reads low/high;
- a held `250901` KEY1 reads high/high;
- a held `260404` KEY1 reads low/low.

Four consistent held samples confirm the runtime profile. The firmware then
uses the detected KEY1 polarity, routes the two short-button actions for the
physical board, and chooses its shutdown wake edge. It leaves KEY2 sampling
and the independent long-press ISP task unchanged. Before detection, short
KEY2 may select the counter but cannot advance toward shutdown. Detection is
volatile and the compiled profile remains the boot fallback.

Locked build evidence:

- `260404`: 205,612 bytes,
  `9ecb7763ce9931323683192dd4d85b28972949a503667462b7ab5db7e6cbbe91`
- `250901`: 205,612 bytes,
  `6c66fe90cc71da5a9fc5fa21ba61c4f0ca610ae354d1211a33645b836b8c9ea9`

Both embedded audits pass. Neither candidate is hardware-verified or approved
for public release. Required smoke coverage includes both correct-profile and
cross-profile flashes, KEY2 before KEY1 detection, short and long presses,
brightness, download, shutdown/wake, BadgeMagic upload, BLE survey, and
KEY2-only dot-to-ISP recovery.
