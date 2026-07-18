# FrogAlert

FrogAlert is an experimental Rust firmware project for the FOSSASIA-supported
BadgeMagic CH582M 11×44 LED badge. The goal is to keep the badge useful as a
normal app-programmable nametag while briefly scanning nearby BLE advertisements
and temporarily showing an explainable local alert such as `COP DETECTED` or
`HAX DETECTED`.

Project site: **<https://frogalert.org>**

Source and issues: **<https://github.com/pierce403/frogalert>**

## Current state

- Rust `no_std` detection core: tested
- host observation/count simulator: tested
- CH582M single-pixel display bring-up: builds for `HARDWARE_REV1`, not
  hardware-tested or approved to flash
- CH582M passive BLE count/display prototype: builds for `HARDWARE_REV1`, not
  hardware-tested or approved to flash
- static project site: implemented
- Web Bluetooth BadgeMagic compatibility probe: experimental
- guarded WebUSB CH582 ISP flow: implemented, not hardware-verified
- full BadgeMagic-compatible FrogAlert firmware: not implemented
- downloadable FrogAlert firmware release: none yet
- official FOSSASIA open v0.1 substitute: available only for exact
  `HARDWARE_REV1`; preparation works, but destructive browser programming stays
  locked until FrogAlert completes a physical Rev1 smoke test

See [FEATURES.md](FEATURES.md) for the authoritative requirement-by-requirement
status and acceptance evidence.

## Hardware warning

Do not flash a badge based on appearance or the BLE name `LSLED`. Open it and
verify all of the following:

- MCU package marking: **CH582M**
- matrix: **11 rows × 44 columns**
- exact PCB revision or board identifier recorded from the opened board
- WCH factory ISP can be entered and identified read-only

The OEM firmware is read-protected, unavailable, and unrecoverable. There is no
factory/OEM restore image. FOSSASIA publishes an open BadgeMagic-compatible v0.1
substitute for its Micro-USB `HARDWARE_REV1` target, but that is not the
original firmware and FrogAlert has not hardware-tested it. Similar-looking
badges can use different controllers or matrix sizes and may be permanently
damaged by an incompatible image. Read
[docs/HARDWARE.md](docs/HARDWARE.md) before device work.

## Try the detection logic

```sh
cargo test --workspace
cargo run -p frogalert-simulator -- "00:25:DF:12:34:56" "Axon Body 4"
cargo run -p frogalert-simulator -- "C2:00:00:00:00:01" "Flipper Zero"
cargo run -p frogalert-simulator -- --count 23
```

Expected classifier output; count mode then prints an 11×44 text framebuffer:

```text
COP DETECTED (Axon OUI)
HAX DETECTED (Flipper name)
nearby BLE devices: 23
```

The count mode renders the same compact numeric framebuffer used by the
embedded prototype, without touching hardware.

## Build the safe display bring-up

The first physical Rust image is a separate pixel walk with no BLE or external
LSE initialization. It keeps one logical pixel selected, moves left-to-right
through all 44×11 positions every 750 ms, reports coordinates on UART1/PA9, and
uses the display GPIO's lower 5 mA drive setting.

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup HARDWARE_REV1
```

The second command creates only ignored local evidence under `tmp/`. It is
still an irreversible, hardware-unverified image—not permission to flash. Read
the opened-board and first-write gates in [docs/HARDWARE.md](docs/HARDWARE.md).

## Build the hardware-gated count prototype

The current Rust prototype passively observes BLE advertisements, counts unique
addresses during a short scan, and renders the count on the revision-1 11×44
matrix. It is an observer-only lab image: it does not expose the BadgeMagic GATT
service and is neither a release nor flash-approved.

From the repository root, first run the link/instruction audit or generate the
temporary raw BIN explicitly for the opened `HARDWARE_REV1` target:

```sh
./scripts/build-count-firmware HARDWARE_REV1 --check
./scripts/build-count-firmware HARDWARE_REV1
```

The non-check command prints the temporary BIN's current size and SHA-256. The
ignored output is hardware-unverified evidence only; it is not a release
checksum, and the website must not offer that BIN.

## Run the website locally

```sh
./scripts/serve-site
```

Open <http://127.0.0.1:4173>. The site is dependency-free static HTML, CSS, and
JavaScript. It provides two distinct device surfaces:

- **Web Bluetooth** verifies the running badge's BadgeMagic `FEE0/FEE1` GATT
  path. That is normal nametag communication, not firmware flashing.
- **WebUSB** communicates with the WCH factory ISP bootloader. It identifies the
  exact CH582 target before enabling a separately confirmed erase/program/verify
  flow.

The manifest's FrogAlert `releases` list remains empty until a FrogAlert image
passes physical badge testing. Its separate `recovery_images` list contains the
official FOSSASIA open v0.1 substitute for exact `HARDWARE_REV1`; preparing it
does not write, it remains labeled hardware-unverified and write-disabled, and
it is never described as a factory restore. Developers can also select a local
raw BIN for experimental work, with explicit hardware and irreversibility
gates.

## Verify everything currently available

```sh
./scripts/verify
```

That runs formatting, linting, Rust tests, browser-protocol/site tests, HTML
sanity checks when available, repo-local skill validation, and whitespace
checks. A passing local suite does not replace a physical badge test.

## Repository map

- [`crates/frogalert-core/`](crates/frogalert-core/) — allocation-free matching
- [`firmware/frogalert-display/`](firmware/frogalert-display/) — shared exact-
  Rev1 matrix driver
- [`firmware/frogalert-pixel-walk/`](firmware/frogalert-pixel-walk/) — minimal
  no-BLE/LSE single-pixel bring-up
- [`firmware/frogalert-count/`](firmware/frogalert-count/) — board-gated Rust
  observer/count/display prototype; not a released image
- [`firmware/vendor/ch58x-hal/`](firmware/vendor/ch58x-hal/) — pinned,
  provenance-documented HAL subset used by the prototype
- [`tools/simulator/`](tools/simulator/) — desktop observation simulator
- [`scripts/build-count-firmware`](scripts/build-count-firmware) — exact-revision
  cross-build, disassembly audit, and temporary BIN extraction
- [`scripts/build-display-bringup`](scripts/build-display-bringup) — minimal
  exact-Rev1 pixel-walk build and instruction audit
- [`site/`](site/) — static website and browser device implementation
- [`tests/`](tests/) — protocol and site contract tests
- [`firmware/releases/manifest.json`](firmware/releases/manifest.json) — public
  FrogAlert release index plus separately labeled upstream open recovery image
- [`docs/HARDWARE.md`](docs/HARDWARE.md) — target identity, irreversible OEM
  boundary, and open substitute constraints
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local tools and future embedded
  toolchain
- [`docs/WEB_FLASHING.md`](docs/WEB_FLASHING.md) — browser/OS/safety architecture
- [`docs/PROTOCOL.md`](docs/PROTOCOL.md) — BadgeMagic GATT vs WCH ISP contracts
- [`docs/RELEASE.md`](docs/RELEASE.md) — artifact and hardware release gates
- [`AGENTS.md`](AGENTS.md), [`MEMORY.md`](MEMORY.md), and [`SKILLS.md`](SKILLS.md)
  — recurse.bot-inspired repo operating system

## Intended firmware cycle

1. Advertise as a BadgeMagic-compatible nametag and render uploaded content.
2. When no app is connected, briefly pause advertising and passively scan BLE.
3. Match public-address OUIs and advertised names locally.
4. Temporarily show an alert when a conservative rule matches.
5. Restore the exact user framebuffer and resume advertising.

If the WCH BLE library cannot safely switch peripheral/observer roles in place,
the fallback design is an explicit retained-state reboot cycle. Hardware testing
will choose the implementation; the repository does not pretend that question
is already settled.

## Project operation

The repo follows the useful parts of [recurse.bot](https://recurse.bot):
canonical agent instructions, compact memory and skill indexes, focused
reusable procedures, evidence-backed feature states, CLI-first verification,
and dated lessons that survive individual sessions.

## License and upstream work

FrogAlert is Apache-2.0 unless a file says otherwise. Upstream projects keep
their own licenses; see [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) and
[docs/UPSTREAM.md](docs/UPSTREAM.md).
