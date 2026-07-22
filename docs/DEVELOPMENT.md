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

## Embedded Rust prototypes

The `firmware/` workspace contains two hardware-unverified binaries: a minimal
single-pixel display walk and a passive BLE count image. Shared crates provide
the revision-gated display map and KEY2 ROM-ISP recovery logic. These are lab
builds, not firmware releases and not yet safe to flash. Neither application
has produced light on a FrogAlert-tested BadgeMagic PCB, and the count image
has not received a real advertisement.

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

Both build helpers explicitly select that toolchain and target, use the locked
firmware dependency graph, ignore environment target-directory/Rust-flag
overrides, and select only the intended binary. They validate the exact final
ELF as 32-bit RISC-V IMC, disassemble with A-extension decoding enabled, and
reject AMO, LR, or SC instructions. Build products stay under ignored `tmp/`.

### Safe display bring-up

Run the minimal display check before the BLE count image:

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup B1144C_250901_USB_C --check
```

Run the same audited packaging path without `--check` only after the opened
board passes its exact identity gate and the owner explicitly accepts the
irreversible first flash:

```sh
./scripts/build-display-bringup HARDWARE_REV1
./scripts/build-display-bringup B1144C_250901_USB_C
```

The image keeps exactly one logical framebuffer bit set. It advances from
`(0, 0)` left-to-right across 44 columns, then down through 11 rows, every
750 ms. UART1/PA9 reports each coordinate at 115200 baud. The display pins use
the lower 5 mA drive setting and a 250 us drive/release cadence. The build does
not enable the HAL BLE feature, initialize Embassy, or select a 32 kHz radio
clock. It samples active-low KEY2/PB22 every 200 ms and, after a continuous
2.2-second hold, disables display refresh, floats the matrix, disables global
interrupts, and transfers to address zero. This matches the upstream recovery
mechanism at source level but remains physically unverified in FrogAlert.

Its temporary paths are:

- ELF:
  `tmp/build/frogalert-pixel-walk-<PROFILE>/riscv32imc-unknown-none-elf/release/frogalert-pixel-walk`
- audited disassembly: `tmp/firmware/frogalert-pixel-walk-<PROFILE>.disassembly.txt`
- finalized raw image: `tmp/firmware/frogalert-pixel-walk-<PROFILE>.bin`

`<PROFILE>` is exactly `HARDWARE_REV1` or `B1144C_250901_USB_C`. The USB-C
candidate map is pinned to FOSSASIA source `9ce885d` and physical marking
`B1144C_250901`; generic `BM1144-C`, Rev2, and Rev3 names are not aliases.

### Passive BLE count prototype

Run a formatting, cross-link, size, instruction, recovery, and package-format
audit. The ignored raw BIN is generated even in check mode so its final startup
sentinel, size, and hash are validated:

```sh
./scripts/build-count-firmware HARDWARE_REV1 --check
```

Run the non-check form for a deliberate local hardware test only after
selecting the explicit revision gate:

```sh
./scripts/build-count-firmware HARDWARE_REV1
```

The build keeps generated material out of release directories:

- ELF:
  `tmp/build/frogalert-count/riscv32imc-unknown-none-elf/release/frogalert-count-firmware`
- audited disassembly:
  `tmp/firmware/frogalert-count-HARDWARE_REV1.disassembly.txt`
- raw lab image: `tmp/firmware/frogalert-count-HARDWARE_REV1.bin`

Both forms print the finalized BIN's SHA-256 and exact byte count. These `tmp/`
outputs are not release artifacts and must not be added to the website manifest
without an intentional immutable lab descriptor. A release still requires the
provenance and physical evidence in [RELEASE.md](RELEASE.md).

The current lab loop passively scans the LE 1M PHY for three seconds, counts
distinct advertiser addresses in a fixed 64-entry table, shows the result for
seven seconds, and repeats. A saturated window renders `64+`. The table is
zeroed after each window; no address is logged, persisted, or transmitted.
Because BLE addresses can be randomized, the result is an approximate count of
advertisers seen, not a count of people or physical devices.

This lab firmware is observer-only. It does not advertise the BadgeMagic
`FEE0/FEE1` service and cannot be configured by the BadgeMagic app. The exact
PCB matrix mapping and orientation, radio reception, display refresh, and
current draw all remain physical-hardware questions. There is no USB-C count
profile: FOSSASIA's working USB-C source uses calibrated internal LSI, while
the current Rust application and HAL BLE initializer select external LSE. Patch
and verify that clock path before enabling `B1144C_250901_USB_C` for radio use.

## Physical development gate

Before the first device write:

1. Open the badge.
2. Confirm the package marking is `CH582M`.
3. Confirm an 11×44 LED matrix and record the PCB revision.
4. Enter ISP read-only and run `wchisp info`.
5. Compare the result to the expected CH582/type `0x16` target.
6. Ask explicitly before performing the irreversible first flash.

See [HARDWARE.md](HARDWARE.md) and [RELEASE.md](RELEASE.md).
