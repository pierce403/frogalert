# Survey-count investigation

The owner reports roughly 1–2 devices instead of the previous 20–30. No
same-location A/B capture or exact onset version has been supplied yet. This
investigation does not establish a hardware/RF root cause.

## Source comparison

Compared shipping 0.3.0 (`166fc4a`) with the Rust rewrite (`74fb0c0`) and its
immediate C predecessor, and reviewed older survey history.

- Three-second passive scans remain 4800 × 625 us. Scan interval/window are
  both 16 × 625 us, i.e. 10 ms; successful scans start about 20 seconds apart.
- The SDK result capacity and application address capacity remain 64.
- Duplicate-report filtering was already enabled in the C version, including
  the initial passive-survey implementation. It was not introduced by Rust.
- Counting precedes advertisement classification; malformed/unrecognized AD
  payloads do not remove an otherwise observed address from the count.
- Rust adds address type to deduplication, which cannot merge distinct byte
  addresses that the C version counted separately.
- Live reports and the discovery completion list both feed the address table.
  Count glyph placement retains both decimal digits and the Bluetooth symbol.
- 0.3.0's radio-adapter changes are shutdown fallback/ABI checks, not scan
  timing, PHY, filtering, RSSI threshold, or capacity changes.
- The rewrite conservatively treats unreadable, INIT, or ERROR peripheral
  state as unavailable/connected; the old C version only treated explicit
  connected states as connected after a successful state read. There is no
  evidence yet that this guard is firing on the badge. Do not weaken it
  speculatively: it also protects shutdown and upload coexistence.

The pinned WCH header explicitly documents `TGAP_DISC_SCAN` and
`TMOS_GetSystemClock` in 625 us units, duplicate-report filtering, and the
uint8_t peripheral state. Source:
https://github.com/fossasia/badgemagic-firmware/blob/9ce885d682b5c56c3ac7595c09e009a210885221/CH5xx_ble_firmware_library/BLE/CH58xBLE_LIB.h

## Verified and unresolved

Added a shipping Rust/C ABI replay for ten alternating 20/30-device survey
windows, repeated across clock wrap and on both hardware profiles. It feeds
duplicate observations, malformed AD, and address-only completion-list-style
observations, then checks the actual emitted tens/units glyphs and cadence.
The ABI replay and existing core/emulator tests pass. This checks application
accounting, not the physical receiver or the SDK's radio implementation.

A diagnostic limitation remains: unsuccessful/cancelled scans preserve the
last successful display count, without a visible freshness/error indicator.
Thus a low displayed number alone cannot distinguish weak reception from a
stalled or repeatedly interrupted survey. This behavior predates Rust.

Next useful evidence: whether the drop first appeared in 0.3.0-beta.1 or only
in 0.3.0, followed by a same-location comparison with the last good version.
If reproducible, add aggregate scan start/result/duration/state diagnostics;
never retain or expose advertiser addresses. No speculative firmware changes
or new firmware release were made during this investigation.
