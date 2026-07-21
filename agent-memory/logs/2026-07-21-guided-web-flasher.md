# 2026-07-21 — guided WebUSB flasher and recovery surface

## Completed

- Added a dedicated mobile-first `/flash/` route with browser preflight,
  separate read-only Bluetooth and USB modes, an explicit detected/confirmed/
  unavailable facts table, KEY2 recovery steps, artifact provenance, typed
  destructive consent, stage progress, and a redacted session log.
- Restricted the old landing lab to read-only inspection: its legacy program
  controls are absent, it has no event binding, fails the program-page mode gate,
  and both pages now carry same-origin CSP/referrer metadata.
- Added Android Chrome plus data-capable USB OTG guidance while explicitly
  rejecting iPhone/iPad WebUSB claims. Desktop Chromium and `wchisp` remain the
  recovery fallbacks.
- Added optional sanitized Device Information reads for a running badge. These
  self-reported strings are not treated as installed-flash proof; arbitrary
  application version and physical PCB revision remain unavailable.
- Hardened WebUSB target validation with configuration 1, interface 0, and
  bulk endpoint 2 IN/OUT checks, conservative config reporting, serial/UID
  redaction, UID-buffer clearing, captured-device binding, Web Lock exclusion,
  a screen wake lock, timeout uncertainty, and a detailed final summary.
- Extracted the destructive sequence into an injected, tested module. It
  independently validates alignment and erase size, requires `0xA8` reset plus
  exact `0xA7` readback before erase, writes 56-byte chunks plus the final
  empty packet, verifies every chunk, distinguishes reset acknowledgement, and
  zeroes the derived key on every exit.
- Kept the bundled open BadgeMagic v0.1 substitute preparation-only. Its false
  hardware-verification flag still prevents the destructive button from
  arming, and no FrogAlert release was added to the manifest.

## Local verification

`./scripts/verify` passed after the sandboxed snap launcher was replaced by the
approved host run:

- 17 Rust core tests passed;
- both exact-Rev1 embedded link/instruction audits passed with no AMO/LR/SC;
- 34 Node protocol, session, state, site, manifest, and skill tests passed;
- the assembled static output included `/flash/` and only the one
  manifest-listed recovery artifact; and
- all three repo-local skills validated.

The local `/flash/` browser smoke passed at a 375 CSS-pixel phone viewport:

- no document-level horizontal overflow;
- the wide capability table scrolls inside its labeled region;
- navigation and the destructive button fit the viewport;
- the same-origin 155,672-byte recovery image produced SHA-256
  `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`;
- the UI labeled it hardware-unverified and kept flashing disabled; and
- no site error appeared. The development Electron shell emitted its usual
  packaging-only CSP warning.

## Remaining physical gates

No badge was attached during this work. There is still no evidence for a real
USB identify/config transcript, erase/program/verify timing, display boot,
BadgeMagic upload, interruption recovery, Android OTG power stability, or a
hardware-safe FrogAlert release. The website is a complete guided experimental
software path, not a production-ready hardware promise.
