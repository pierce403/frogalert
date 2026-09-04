# Architecture

## Rust application and hardware boundary

Version `0.3.0-beta.1` runs FrogAlert's application in allocation-free,
`no_std` Rust. The emulator and firmware use the same core.

| Code | Responsibility |
| --- | --- |
| `crates/frogalert-core/src/runtime.rs` | Scan lifecycle, cancellation, shutdown handoff, alert priority, wrapping deadlines |
| `config.rs`, `advertisement.rs`, `scan.rs` | CRC/profile validation, conservative detection, ephemeral typed-address counting |
| `render.rs`, `boot.rs` | Complete 44×11 frames, text pages, frogs, animation cropping, boot and battery cards |
| `transfer.rs` | BadgeMagic upload bounds, padding, restart/reset, calendar validation |
| `crates/frogalert-ffi/` | Primitive C ABI; one TMOS-thread-owned session |
| `firmware/fossasia-usbc/frogalert-survey.c` | WCH event translation and execution of returned commands |
| Pinned FOSSASIA/WCH C shell | Startup, vectors, clocks, USB, BLE/TMOS, display ISR, allocation/flash, nametag storage, buttons and ROM ISP |

Rust never owns an interrupt vector or initiates a central connection. The C
adapter finishes each Rust call before executing SDK commands, so synchronous
SDK callbacks cannot alias Rust state. It replaces display ownership and the
one pending wake before those commands. The display ISR never enters Rust: C
copies a complete frame into an inactive buffer and commits a one-byte index.
Queued upstream animations cannot replace the committed overlay.

Rust `1.98.1` builds an `riscv32imc-unknown-none-elf` static library, with
atomics disabled, abort semantics, and a reset-on-panic handler. The pinned MRS
V1.92 GCC performs the final link. LLVM objcopy removes only the archive's
non-loadable `.riscv.attributes` section because the old linker cannot parse
modern attribute names. Final linked instruction, vector, RAM, recovery-symbol,
and exact ELF-to-BIN audits remain mandatory. Candidate receipts record the
actual Rust compiler commit and linked library hash.

## Exact board profiles

| Profile | ID | KEY1/PA1 | Physical KEY2 |
| --- | --- | --- | --- |
| `B1144C_260404_USB_C` (default) | 2 | Pull-up, active low | Top, away from USB |
| `B1144C_250901_USB_C` | 1 | Pull-down, active high | Bottom, near USB |

Both use `USBC_VERSION=1`, the same 23 display nets, and active-low KEY2/PB22.
The physical bottom button rotates names/count and controls brightness; the
physical top button cycles normal → download → shutdown. A continuous KEY2
hold retains the roughly 2.2-second ROM-ISP path, regardless of its position.
An untouched KEY1 cannot identify the board: it merely follows the configured
pull. Profile guessing is forbidden; the image and configuration are bound to
the printed PCB marking.

Shutdown waits for discovery cancellation, advertising to stop, and an app
connection to end. Only qualified profile-specific buttons can wake; charger
status is not a wake source. Early held-KEY2 qualification precedes BLE, USB,
and display startup. These hardware paths remain in the established C shell.

## Scan and display behavior

The first survey waits 15 seconds after role readiness. Each attempt confirms
that normal mode allows scanning, no app connection exists, and advertising
state is readable. Advertising stops, followed by a 250 ms quiet period and a
second check. Discovery is passive for three seconds. Successful completion
schedules the next attempt 16.75 seconds later: about 20 seconds start to start.

One reducer owns all deadlines on the wrapping 625 µs TMOS clock. Stale wake
bits cannot advance a future deadline. A five-second watchdog requests cancel;
if completion is lost, cancellation retries every ten seconds. Neither a new
scan, advertising, nor shutdown is allowed until completion or the SDK's
explicit already-idle result confirms that discovery ended.

The count displays only the last successful completed result. Reports and the
completion list feed a 64-entry address-and-type table. Cancellation, timeout,
and completion explicitly wipe its bytes. Counts represent advertiser
addresses, not physical devices; no identifiers are logged or persisted.

Detection priority is frogs → KARR → COP → Flipper → custom. Only a strictly
higher-priority match can replace an alert in the same scan. Text has at most
two one-second pages. BadgeMagic triggers three one-second frog frames; the
separate frog-view build animates every half-second. Elapsed time from one
start instant controls paging. Frames redraw only when changed, and completion
restores the selected nametag/count view. Scans continue in either view.
App streaming and download mode relinquish the panel to FOSSASIA.

## Parsing and storage

The complete advertisement is validated before any rule may match, including
malformed suffixes and odd-length 16-bit service lists. WCH addresses are
reversed exactly once into canonical byte order. OUI rules require a public,
globally administered address. Names are ASCII case-insensitive. The Meta
rule requires manufacturer `0x01AB` and service `0xFD5F` in the same report.
These fields are spoofable hints; the exact rule table is in the root README.

Each image contains exactly one 384-byte read-only `FROGALERTCFGv1` block.
Rust reads its bytes volatile at boot so LTO cannot substitute the unpatched
default. CRC, schema, profile, enabled bits, lengths, types, ASCII, and zero
padding are checked. Invalid configuration disables alerts while counting
continues. Enabled built-ins precede up to eight ordered custom rules. A
browser-patched copy receives a new hash and no inherited hardware status.

BadgeMagic's `FEE0/FEE1` service receives 16-byte chunks beginning with the
six-byte `wang\0\0` header. Eight big-endian bitmap widths determine the
exact length: `64 + 11 × sum(widths)`. Rust bounds that length below the
persistent configuration at the end of 32 KiB DataFlash, and includes transport
padding in allocation capacity. C owns the buffer and commits only a complete
transfer. Disconnect, malformed input, allocation failure, and flash failure
reset the receiver; failure cannot trigger a successful reload. Validated
calendar fields alone reach the SDK RTC routine.

Uploaded data remains separate from alerts. An entirely blank nametag gets
the RAM-only scrolling `503.PARTY` fallback, without modifying DataFlash.

## Emulation and release evidence

`tools/emulator/` executes the shipping reducer against a deterministic clock,
radio outcomes, and a virtual panel. It covers both profiles and views, clock
wrap, lost callbacks, busy/failed operations, connection races, stale events,
priority, malformed advertisements/configuration, and upload boundaries. A
24-hour-per-configuration soak exercises 17,280 scan cycles. C executables
also link the real Rust library for ABI, original config/render golden vectors,
and the actual generated upload adapter with allocator/flash fault injection.

This is application/SDK emulation, not CH582 instruction or radio emulation.
Physical RF behavior, battery/current, USB enumeration, button timing, and
recovery need exact-image hardware evidence.

Canonical main CI builds and audits all four profile/view combinations. The
publication workflow verifies candidate provenance, hashes, attestations, and
quarantine status; records the atomic standard counter pair; publishes immutable
GitHub Release assets; then serves identical bytes through the same-origin
website manifest. Frog-view builds and configured derivatives are not promoted
automatically. New standard releases retain `hardware_verified: false`.

The historical standalone Rust pixel-walk/count wrappers remain quarantined.
Their PAC/runtime mismatch places external vectors outside the live RAM table;
the regression gate must continue rejecting them and removing flashable BINs.
