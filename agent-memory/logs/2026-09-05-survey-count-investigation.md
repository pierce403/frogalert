# Survey-count investigation

The initial report was roughly 1–2 devices instead of the previous 20–30,
without a side-by-side comparison or exact onset version. Subsequent evidence
and a newly identified SDK adapter defect are recorded below. Neither source
inspection nor host replay establishes the RF cause on the physical badge.

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

## Follow-up: side-by-side evidence and five theories

The owner subsequently reports that, even after several minutes, two badges
with today's firmware show 3 devices beside a badge with older C firmware
showing 12. This makes startup delay or a generally quiet environment poor
explanations. The exact older image remains unidentified, and a same-badge
firmware swap has not been captured.

Deeper inspection of the adapter added by `74fb0c0` found a **confirmed return
convention bug**, still present in stable `166fc4a`:
`tmos_start_task(...) != SUCCESS` tests a Boolean timer result as a zero-success
status. The pinned header declares `BOOL`; its `TRUE` is 1 and `SUCCESS` is 0.
Disassembling the actual pinned `LIBCH58xBLE.a` member `tmos.o` confirms that
both the timer update and successful allocation paths return 1, while invalid
task/allocation failure paths return 0. Thus a successful timer start queues
an immediate `WAKE_EVENT`, and failure does not take the intended fallback.
The wake handler calls the same dispatcher and can repeat this until the
actual deadline. Rust's absolute deadlines prevent an early logical scan,
but they do not prevent excessive foreground work between those deadlines.
Whether this accounts for the observed RF loss is still a hypothesis.

The header also explicitly disallows `tmos_clear_event` inside the event's own
handler; the new dispatcher calls it on that path. Disassembly shows that
`tmos_stop_task` already clears pending events and handles the scheduler's
separate returned-event mask. This is a second contract issue to remove and
test, not independent proof of missed radio packets.

Ranked investigations (the mechanisms can interact):

1. **Immediate wake loop from the Boolean/status mismatch.** Confirmed code
   defect; strongest new lead. Test the production adapter with successful
   TRUE and failed FALSE timer returns and count dispatches before deadlines.
   Then compare RF counts after correcting this boundary.
2. **False connection/unavailable-state gating.** The new state whitelist can
   suppress starts or cancel an active scan on INIT/ERROR; old C accepted those
   successful state reads. Record aggregate state/rejection/cancel reasons and
   last successful scan age before considering any change to safety guards.
3. **Extra per-report work delays BLE servicing.** Every advertisement now
   runs full dispatch: three GAP getters, Rust policy/frame construction, and
   timer replacement. Old C had a narrower observation path. Measure callback
   duration and compare a version that defers unnecessary display/timer work.
   Keep this separate from the immediate-loop defect in the comparison.
4. **Timer allocation pressure loses reports or future scans.** Pinned
   `tmos_start_task` allocates a 16-byte timer when no matching timer exists;
   `tmos_stop_task` marks it cancelled for later cleanup. Replacing the timer
   per report adds churn absent from old C. The SDK has a fixed 6 KiB heap.
   Measure its free/high-water memory and allocation/start failures during
   report bursts; actual exhaustion has not been demonstrated.
5. **Requested scan settings differ from effective controller settings.**
   Setter results are unchecked, and Rust added role-start retry behavior.
   A reset or failed setting could leave different timing/filtering in force;
   for example, a longer SDK default scan would hit our five-second watchdog.
   This is a lower-confidence hypothesis, not an observed settings change.
   Read back scan duration/window/interval, RSSI/PHY/filter settings and record
   actual start-to-completion times after initialization and any retry.

No new normal-operation Bluetooth sleep mode, lower transmit power, shorter
scan, or narrower scan window was intentionally introduced. ADC power gating
and shutdown hardening are not evidence of weaker receiver sensitivity. The
identified scheduler defect warrants priority over speculative RF tuning.

The existing ABI replay calls the production Rust entry point directly, and
the virtual badge implements SDK effects separately. Neither executes
`frogalert-survey.c` against TMOS's actual return conventions. Earlier passing
tests therefore did not cover the defective boundary. Canonical CI for the
earlier test commit `29987f0` completed successfully (run `33940119589`), which
does not resolve that coverage gap.

Verification for this follow-up: compared old/new adapter source and the exact
pinned SDK header; inspected `tmos.o` with Rust 1.98.1's LLVM objdump. Extract
the member first and disassemble whole sections: `--disassemble-symbols`
stops at internal labels and can omit the success return. No physical RF
measurement, firmware correction, or new release was made for this request
for five theories. The next implementation should add a real adapter fixture
and fix the timer contract before any hardware comparison or power tuning.
