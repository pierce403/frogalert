# Local development

FrogAlert has three development layers: host Rust logic, a static browser app,
and experimental embedded CH582M firmware. Work from the repository root and
use repo-local `./tmp/` for scratch output.

## Host prerequisites

- Git
- a current stable Rust toolchain with `cargo`, `rustfmt`, and `clippy`
- Node.js 20 or newer for dependency-free browser protocol tests
- Python 3 for the local static server
- `xmllint` for an additional HTML syntax check

Run all currently available checks:

```sh
./scripts/verify
```

Run the detection simulator:

```sh
cargo run -p frogalert-simulator -- "00:25:DF:12:34:56" "Axon Body 4"
cargo run -p frogalert-simulator -- "C2:00:00:00:00:01" "Flipper Zero"
```

## Static site

Start the local server:

```sh
./scripts/serve-site
```

Open <http://127.0.0.1:4173>. Localhost counts as a trustworthy context for
browser device APIs, although browser and operating-system support still vary.
The site has no package install or build step.

Browser protocol tests run without a USB device:

```sh
node --test tests/*.test.mjs
```

These tests verify packet shapes and safety validation. They do not prove that
the WCH ROM bootloader, an OS driver, or a real badge accepts the flow.

## Embedded firmware

The supported replacement path is the pinned FOSSASIA USB-C hardware shell in
`firmware/fossasia-usbc/`. It preserves the startup assembly, linker layout,
clocks, USB HID+CDC, BadgeMagic BLE/TMOS stack, display, buttons, and KEY2 ISP
task that already work together on the photographed badge.

Prepare the exact source and toolchain, or let the build script prepare them:

```sh
./scripts/prepare-fossasia-usbc --source-only
./scripts/prepare-fossasia-usbc --with-toolchain
```

Build and audit the byte-identical known-good baseline:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
```

Build the first derived compatibility canary:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
```

Build the later private passive-survey candidate:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
```

The canary adds one retained C metadata string and owns no functions or
hardware. The survey lane keeps the same shell, uses WCH's combined
central/peripheral role pattern, and adds only a disconnected three-second
passive scan plus a persistent 100 ms aggregate-count scroll. Its suffix shows
`I` initializing, `R` ready/waiting, `S` scanning, `E` error, or `T` timeout;
the suffix disappears for a completed result. It updates live while scanning,
also consumes the final discovery list, and yields to app streaming and
non-normal modes. It never initiates a connection, zeroes its fixed address
table, restores prior advertising state, and cancels a stuck scan after five
seconds. All lanes use `USBC_VERSION=1`, validate pinned archive/tool hashes
and critical sources, audit required runtime symbols and linked instructions,
keep at least 8 KiB of stack/runtime RAM headroom, and keep everything under
ignored `tmp/fossasia-usbc/`. The baseline must match the known-good
177,704-byte image exactly. No build command flashes, publishes, or authorizes
a physical test.

Set `FROGALERT_FOSSASIA_OFFLINE=1` to prohibit downloads and require an already
populated verified cache. See `firmware/fossasia-usbc/upstream-lock.json` for
the exact archive, compiler, tool, source, ELF/BIN, and runtime-file pins.

### Quarantined standalone Rust runtime

The `firmware/` Rust workspace still contains the historical pixel-walk and
passive count wrappers. They are retained to test reusable logic and the vector
regression guard, not to produce flashable images. The first physical
pixel-walk test exposed an incompatible PAC/runtime vector layout: Timer 0's
live vector points to `DefaultInterruptHandler`, so the image wedges before
display refresh or KEY2 polling. The count ELF has the same defect.

The embedded build contract is pinned to:

- Rust `nightly-2026-07-17`;
- target `riscv32imc-unknown-none-elf`;
- `rustfmt` and `llvm-tools-preview`;
- a build-relevant vendored subset of `ch58x-hal` commit
  `611954e40cc4a562f0c4756ab4c0a935af6158df`;
- four recorded HAL patches: replacing the unavailable `ch58x` `0.4.0`
  dependency with published `0.3.0`; forming the writable BLE heap pointer
  without an aliasing shared reference to `static mut`; gating async GPIO
  machinery behind the `embassy` feature; and adding the missing synchronous
  SysTick `delay_ns` implementation.

The `imc` target is intentional even though the CH582M advertises the RISC-V
atomic extension. QingKe V4 atomic read/modify/write operations are not trusted.
The build therefore uses critical sections for callback/interrupt shared state,
and the build script rejects an ELF containing AMO, LR, or SC instructions.
Never change this target to `riscv32imac-unknown-none-elf` or enable
`unsafe-trust-wch-atomics` merely to make a build pass.

Install the exact toolchain if rustup has not already done so:

```sh
rustup toolchain install nightly-2026-07-17 \
  --profile minimal \
  --component rustfmt \
  --component llvm-tools-preview \
  --target riscv32imc-unknown-none-elf
```

Both diagnostic build helpers explicitly select that toolchain and target, use
the locked firmware dependency graph, ignore environment target-directory and
Rust-flag overrides, and select only the intended binary. They validate the
exact final ELF as 32-bit RISC-V IMC, reject AMO/LR/SC instructions, and then
run `scripts/audit-ch58x-vectors.mjs`. The audit intentionally fails on the
known misplaced external table before `objcopy`; any stale BIN is removed.

### Failed pixel-walk diagnostic

Run only to reproduce the vector failure and retain a diagnostic ELF/report:

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup B1144C_250901_USB_C --check
```

The source intended to keep exactly one logical framebuffer bit set and advance from
`(0, 0)` left-to-right across 44 columns, then down through 11 rows, every
750 ms. UART1/PA9 reports each coordinate at 115200 baud. The display pins use
the lower 5 mA drive setting and a 250 us drive/release cadence. The build does
not enable the HAL BLE feature, initialize Embassy, or select a 32 kHz radio
clock. Its KEY2 source is never reached after the first Timer 0 interrupt on the
linked image. The build exits nonzero with `[external-section]` and
`[tmr0-vector-target]` findings and emits no BIN.

Its temporary paths are:

- ELF:
  `tmp/build/frogalert-pixel-walk-<PROFILE>/riscv32imc-unknown-none-elf/release/frogalert-pixel-walk`
- audited disassembly: `tmp/firmware/frogalert-pixel-walk-<PROFILE>.disassembly.txt`
- vector report: `tmp/firmware/frogalert-pixel-walk-<PROFILE>.vectors.txt`

`<PROFILE>` is exactly `HARDWARE_REV1` or `B1144C_250901_USB_C`. The USB-C
candidate map is pinned to FOSSASIA source `9ce885d` and physical marking
`B1144C_250901`; generic `BM1144-C`, Rev2, and Rev3 names are not aliases. Do
not bypass the audit or recover an older temporary BIN for flashing.

### Failed passive-count diagnostic

Run a formatting, cross-link, instruction, recovery-symbol, and vector audit:

```sh
./scripts/build-count-firmware HARDWARE_REV1 --check
```

The diagnostic keeps generated material out of release directories:

- ELF:
  `tmp/build/frogalert-count/riscv32imc-unknown-none-elf/release/frogalert-count-firmware`
- audited disassembly:
  `tmp/firmware/frogalert-count-HARDWARE_REV1.disassembly.txt`
- vector report: `tmp/firmware/frogalert-count-HARDWARE_REV1.vectors.txt`

The audit fails before BIN extraction because this ELF has the same misplaced
external table and Timer 0 target. No form of this wrapper is approved for a
hardware test or website manifest.

The historical lab source schedules a three-second LE 1M passive scan, counts
distinct advertiser addresses in a fixed 64-entry table, shows the result for
seven seconds, and repeats. That behavior is host-tested but never ran usefully
on the badge because the embedded wrapper is quarantined. A saturated window
would render `64+`. The table is zeroed after each window; no address is logged,
persisted, or transmitted.
Because BLE addresses can be randomized, the result is an approximate count of
advertisers seen, not a count of people or physical devices.

This historical lab source is observer-only. It does not advertise the BadgeMagic
`FEE0/FEE1` service and cannot be configured by the BadgeMagic app. The exact
PCB matrix mapping and orientation, radio reception, display refresh, and
current draw all remain physical-hardware questions. Replacement scanning must
be scheduled inside the FOSSASIA shell so it retains the proven calibrated
internal-LSI setup and BadgeMagic peripheral behavior.

## Physical development gate

Before the first device write:

1. Open the badge.
2. Confirm the package marking is `CH582M`.
3. Confirm an 11×44 LED matrix and record the PCB revision.
4. Enter ISP read-only and run `wchisp info`.
5. Compare the result to the expected CH582/type `0x16` target.
6. Ask explicitly before performing the irreversible first flash.

See [HARDWARE.md](HARDWARE.md) and [RELEASE.md](RELEASE.md).
