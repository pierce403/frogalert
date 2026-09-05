# FrogAlert application emulator

The firmware and this deterministic host runner share the same allocation-free
Rust application. No badge, Bluetooth adapter, sleeps, or network are needed.

```sh
./scripts/run-rust-toolchain stable cargo test -p frogalert-emulator
./scripts/run-rust-toolchain stable cargo run --release -p frogalert-emulator -- --soak-hours 24
bash scripts/verify-rust-abi
```

The soak runs each USB-C profile with counter and frog views, crosses the
32-bit TMOS clock boundary, injects duplicate and overflowing observations,
and checks radio/display invariants. It prints aggregate counts only.

`tests/reliability.rs` injects SDK startup failure, lost completion/cancel
callbacks, connection races, unreadable advertising state, mode changes, late
events, malformed input, and transfer failures. `detection_golden.rs` preserves
the original C classifier fixtures. The C conformance runner links the real
Rust static library, tests both profile ABIs and rendering/configuration golden
vectors, and compiles the generated upload adapter with guarded allocations
and failed flash writes. It also executes the actual generated shutdown adapter
against simulated WCH registers: wrong PB22/PB8 mux, stale GPIO/RTC/USB sources,
spurious interrupts, retained reset markers, and bounded stuck-button handling.
`frogalert-core::power` tests press/release noise and continuous ISP holds; the
radio emulator tests the 30-second reset-to-off fallback across clock wrap and
its cancellation when the user resumes normal mode.

The survey adapter fixture compiles the production C bridge against WCH's
actual pinned headers and links the real Rust archive. It reproduces the old
Boolean/status timer bug and checks timer reuse, allocation failures, state
guards, verified settings, synchronous callbacks and repeated crowd scans.
Headers are extracted from the hash-checked upstream archive; a cold run
downloads that archive through the existing preparation script.

This emulates application behavior at the SDK boundary. It cannot certify
physical RF timing, WCH controller behavior, electrical button polarity, USB,
power consumption, flash endurance, or ROM-ISP recovery.
