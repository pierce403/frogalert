# Local development

FrogAlert has three development layers: host Rust logic, a static browser app,
and (planned) embedded CH582M firmware. Work from the repository root and use
repo-local `./tmp/` for scratch output.

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

## Embedded Rust toolchain (planned)

The current workspace intentionally has no firmware crate, toolchain pin, or
release binary. Add them together when the display bring-up begins; do not pin
an arbitrary nightly just to make the repository look complete.

Expected components are:

- Rust nightly pinned by exact date once required features are known;
- target `riscv32imac-unknown-none-elf`;
- a pinned revision of <https://github.com/ch32-rs/ch58x-hal>;
- `llvm-objcopy` or equivalent to extract a raw `.bin` from the ELF;
- <https://github.com/ch32-rs/wchisp> for local USB ISP probing/flashing;
- linker/runtime configuration compatible with WCH's precompiled BLE library.

The future build sequence must produce both an ELF (symbols/debugging) and raw
BIN (browser/CLI flashing), reject images beyond the CH582 code-flash boundary,
and record the toolchain, source commit, HAL revision, size, and SHA-256.

## Physical development gate

Before the first device write:

1. Open the badge.
2. Confirm the package marking is `CH582M`.
3. Confirm an 11×44 LED matrix and record the PCB revision.
4. Enter ISP read-only and run `wchisp info`.
5. Compare the result to the expected CH582/type `0x16` target.
6. Ask explicitly before performing the irreversible first flash.

See [HARDWARE.md](HARDWARE.md) and [RELEASE.md](RELEASE.md).
