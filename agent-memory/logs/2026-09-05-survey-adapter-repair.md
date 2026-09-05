# Survey adapter repair — 0.3.1

The owner authorized fixing the likely causes identified in the survey-count
investigation after two updated badges showed 3 devices beside an older C
badge showing 12 after several minutes.

The new fixture executes unmodified `frogalert-survey.c` and the real Rust
archive with WCH declarations extracted from the hash-checked pinned source
archive. Old code first fails the SDK prohibition on clearing an event inside
its own handler. Allowing that operation in a temporary diagnostic fixture
then exposes the repeated immediate-wake loop (64 dispatches without advancing
time). This directly reproduces both scheduler defects missed by core-only
emulation. It does not prove their RF impact.

The fix treats `tmos_start_task` as Boolean, updates the existing timer only
when the absolute deadline changes, and removes self-clear/stop operations
from the normal scheduling path. The existing 200 ms KEY2 recovery task retries
failed allocation, avoiding a tight failure loop and preserving the 30-second
off reset deadline. Radio commands still run only after C wake/display state
is committed and Rust's mutable borrow has ended.

Per-report dispatch reads GAP state once. INIT/ERROR are recognized as
unavailable rather than connected: active reports/completion remain usable,
while unknown advertising state blocks fresh scans and power handoff. Actual
connections, unknown enumerants and failed reads still cancel. Rust reuses
cached frames/deadlines for ordinary reports while preserving new alerts,
expired pages, view changes and cancellation. Original scan timing/filter
parameters and result capacity are reapplied and verified before each scan.
No RF power, PHY, sensitivity, ADC or shutdown-register changes are introduced.

The pinned `role.o` confirms `GAPRole_GetParameter(GAPROLE_STATE)` stores one
byte even though its internal state is a word. MAX_SCAN_RES setter/getter also
use one byte and permit updating the capacity. Do not infer a word-sized ABI
from the internal SDK representation.

Adapter coverage includes 48 windows across profiles and wrapping clocks,
12/30-device bursts, all three report event types, completion-only addresses,
duplicates/malformed AD, unchanged-deadline timer reuse, transient/unknown/
unreadable states, both scan boundaries, cancellation/late completion,
advertising restoration, synchronous init/completion callbacks, failed starts,
failed/ignored configuration writes, bounded timer retry, and a missing cancel
acknowledgement plus timer failure during shutdown. A Rust test delivers
reports before queued page timers and changes view without an intervening tick.

Local validation passed with `FROGALERT_SKIP_PUBLICATION_ASSETS=1 ./scripts/verify`:
Rust format/clippy/workspace tests (including the 24-hour-per-configuration
soak), both profile C ABI/adapter fixtures, Python tests, 164 Node tests,
standalone-image quarantine tests and skill validation. The initial unskipped
run passed tests but site assembly could not find archived release BINs in this
fresh checkout; exact historical release-byte checks remain assigned to the
trusted publication-assets job. `xmllint` is not installed; site structure
tests passed and this repair changes no page markup.

All four embedded candidates passed the pinned vector/instruction/RAM gate
and exact ELF-to-BIN audit. Each image grew by 476 bytes over 0.3.0:

| Profile / view | BIN bytes | SHA-256 |
| --- | ---: | --- |
| Top counter | 213824 | `2ab02a01399a6870b40965c38a4f01d5dab22fbe4a9bb0989745663dd07636d4` |
| Bottom counter | 214032 | `a9a06ce1c2dfcdee349bf46ada6f24502dd1891339149f1318864befbfb1a7ff` |
| Top frogs | 213864 | `e6eb6cdef74680c67f5b6fed1f3043392f6aa087a4582186a4a1ce90f7cc46b9` |
| Bottom frogs | 214072 | `035e2f99c8ccc74c8a0876490aebfe0eca5418472ee269431e28d71b7a0b069b` |

Hardware follow-up remains a same-location comparison with the older badge:
confirm repeated fresh counts, then app upload and off/wake/KEY2 recovery.
Host and build evidence must not be presented as a measured RF improvement.
