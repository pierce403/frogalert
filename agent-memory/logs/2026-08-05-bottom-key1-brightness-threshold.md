# Bottom KEY1 polarity and brightness threshold

The owner asked to make the bottom badge's brightness gesture substantially
harder to trigger accidentally. Upstream classifies a long press after 25
samples at 50 Hz, roughly 0.5 seconds. FrogAlert `0.2.0-beta.10` keeps that
timing for top/`260404`, but uses 125 samples, roughly 2.5 seconds, for
bottom/`250901` KEY1. KEY1 is the physical top/system button on that board.
Releasing it before the threshold remains an upstream-style short press.

While verifying the generated machine code, the first bottom build still
contained a 25-sample comparison and active-low KEY1 read. The cause was that
`button.c` used symbolic profile constants without including
`frogalert-monitor-config.h`; undefined preprocessor identifiers silently
selected the top branch. Main already saw the constants through
`frogalert-survey.h`, which hid the split. The generated button header now
includes the shared profile definitions and rejects missing or unsupported
profile IDs at compile time. Source tests cover the include, fail-closed gate,
both threshold comparisons, and unchanged top fallback. Every survey/frog
candidate build also audits the linked disassembly and rejects a mismatched
KEY1 polarity or threshold before accepting the BIN.

Pinned local candidate audits passed with these calculated receipts:

- counter top/`260404`: 200,340 bytes,
  `22806e43c0319602367d91bb4e1a194733f7362f7beb342cddc5a1fd4525c136`
- counter bottom/`250901`: 200,348 bytes,
  `441495ed8cfea9158f2f2ba0d706e8f37035e7d6ce40f72328248c9e4ad00b3a`
- frogs top/`260404`: 200,412 bytes,
  `89839dea4ff667664b6b300cb77c0462c1d7ac27435868db663b51f940ccf696`
- frogs bottom/`250901`: 200,420 bytes,
  `9bcf2013de2a5ba8205b30339473714cfc69a03151614fa9dd370087a265f7b0`

The bottom disassembly contains `li ...,125` on both long-activation and
short-release paths, selects 25 only for KEY2, and reads PA1 without the
active-low inversion. These are source/build facts, not physical verification.
Retest both exact boards, especially short top presses, a completed 2.5-second
bottom KEY1 brightness hold, view selection, screen off/wake, and KEY2 ISP.
