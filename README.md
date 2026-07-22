# FrogAlert

FrogAlert is an experimental Rust firmware project for the FOSSASIA-supported
BadgeMagic CH582M 11×44 LED badge. The goal is to keep the badge useful as a
normal app-programmable nametag while briefly scanning nearby BLE advertisements
and temporarily showing an explainable local alert such as `COP DETECTED` or
`HAX DETECTED`.

Project site: **<https://frogalert.org>**

Guided browser flasher and recovery instructions: **<https://frogalert.org/flash/>**

Source and issues: **<https://github.com/pierce403/frogalert>**

## Current state

- Rust `no_std` detection core: tested
- host observation/count simulator: tested
- CH582M single-pixel display bring-up: separate `HARDWARE_REV1` and
  `B1144C_250901_USB_C` builds with KEY2 recovery; neither is hardware-tested
  or approved to flash
- CH582M passive BLE count/display prototype: builds for `HARDWARE_REV1`, not
  hardware-tested or approved to flash; USB-C is blocked by the HAL's external
  LSE assumption
- static project site: implemented
- Web Bluetooth BadgeMagic compatibility probe: experimental
- guarded WebUSB CH582 ISP flow: implemented, not hardware-verified
- full BadgeMagic-compatible FrogAlert firmware: not implemented
- downloadable FrogAlert release or lab BIN: none; the first USB-C pixel-walk
  image was withdrawn after it booted blank and failed KEY2 recovery
- official FOSSASIA open v0.1 substitute: available only for exact
  `HARDWARE_REV1`; preparation works, but destructive browser programming stays
  locked until FrogAlert completes a physical Rev1 smoke test
- FOSSASIA USB-C development build: the downloaded 177,704-byte BIN is pinned
  to source `9ce885d` and SHA-256
  `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`;
  it boots on the photographed USB-C badge and KEY2-only long press visibly
  enters ROM ISP with the dot cue

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
original firmware. A separate FOSSASIA USB-C development image has now booted
and provided KEY2 long-press recovery on the photographed `B1144C_250901`
badge, but its generic `BM1144-C` descriptor does not identify a unique pin
map. FrogAlert therefore uses the exact lab token `B1144C_250901_USB_C`, and
neither that candidate map nor the bundled Micro-USB image is flash-approved.
Similar-looking badges can use different controllers or matrix sizes and may
be permanently damaged by an incompatible image. Read
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
./scripts/build-display-bringup B1144C_250901_USB_C --check
./scripts/build-display-bringup B1144C_250901_USB_C
```

Each command creates only ignored, finalized local evidence under `tmp/` and
prints its size and SHA-256; `--check` still packages the BIN so the WCH startup
sentinel can be audited. These images include the application-level KEY2 hold
and ROM-ISP transfer, but that path has not run on FrogAlert hardware. A
successful build is still not permission to flash. Read the opened-board and
first-write gates in [docs/HARDWARE.md](docs/HARDWARE.md).

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

Both commands print the temporary BIN's current size and SHA-256. The ignored
output is hardware-unverified evidence only; it is not a release checksum. Do
not substitute the USB-C display profile here: the working
FOSSASIA source uses the internal LSI, while the current Rust BLE/HAL path
selects external LSE, so no `B1144C_250901_USB_C` count image is offered.

## Run the website locally

```sh
./scripts/serve-site
```

Open <http://127.0.0.1:4173>. The site is dependency-free static HTML, CSS, and
JavaScript. Open <http://127.0.0.1:4173/flash/> for the full phone-first guided
flasher and recovery flow. It provides two distinct device surfaces:

- **Web Bluetooth** verifies the running badge's BadgeMagic `FEE0/FEE1` GATT
  path. That is normal nametag communication, not firmware flashing.
- **WebUSB** communicates with the WCH factory ISP bootloader. It identifies the
  exact CH582 target before enabling a separately confirmed erase/program/verify
  flow.

The landing-page lab permits only inspection and artifact preparation. Its
legacy program controls are absent, and the controller also requires explicit
program-page mode; all destructive browser actions exist only on `/flash/`.

The manifest keeps FrogAlert `releases`, FrogAlert `lab_images`, and third-party
`recovery_images` separate. Both FrogAlert collections are empty. The former
USB-C pixel-walk artifact was removed after a physical flash produced no panel
output and its KEY2 recovery path did not enumerate ISP. The recovery collection
contains the official FOSSASIA open v0.1 Micro-USB substitute, still
write-disabled.

## Verify everything currently available

```sh
./scripts/verify
```

That runs formatting, linting, Rust tests, browser-protocol/site tests, HTML
sanity checks when available, repo-local skill validation, and whitespace
checks. A passing local suite does not replace a physical badge test.

## Repository map

- [`crates/frogalert-core/`](crates/frogalert-core/) — allocation-free matching
- [`firmware/frogalert-display/`](firmware/frogalert-display/) — shared
  revision-gated matrix driver
- [`firmware/frogalert-pixel-walk/`](firmware/frogalert-pixel-walk/) — minimal
  no-BLE/32-kHz-clock single-pixel bring-up for the two explicit display
  profiles
- [`firmware/frogalert-count/`](firmware/frogalert-count/) — board-gated Rust
  observer/count/display prototype; not a released image
- [`firmware/frogalert-recovery/`](firmware/frogalert-recovery/) — shared KEY2
  hold and CH582 ROM-ISP transfer logic
- [`firmware/vendor/ch58x-hal/`](firmware/vendor/ch58x-hal/) — pinned,
  provenance-documented HAL subset used by the prototype
- [`tools/simulator/`](tools/simulator/) — desktop observation simulator
- [`scripts/build-count-firmware`](scripts/build-count-firmware) — exact-revision
  cross-build, disassembly audit, and temporary BIN extraction
- [`scripts/build-display-bringup`](scripts/build-display-bringup) — explicit
  Rev1/USB-C pixel-walk build and instruction audit
- [`site/`](site/) — static website and browser device implementation
- [`flash/index.html`](flash/index.html) — dedicated guided WebUSB flashing and
  KEY2 recovery surface
- [`tests/`](tests/) — protocol and site contract tests
- [`firmware/releases/manifest.json`](firmware/releases/manifest.json) — public
  release, unverified-lab, and separately labeled upstream recovery indexes
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

## References

- [BadgeMagic project and app documentation](https://badgemagic.fossasia.org/)
- [FOSSASIA BadgeMagic firmware](https://github.com/fossasia/badgemagic-firmware)
- [CH582 hardware notes and reference photos](https://github.com/fossasia/badgemagic-firmware/blob/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8/CH582.md)
- [Pinned FOSSASIA USB-C development artifact](https://github.com/fossasia/badgemagic-firmware/blob/b56cd9495738e8e3170bf723e70b445de936a5d2/usb-c/badgemagic-ch582.bin)
- [Its embedded source commit `9ce885d`](https://github.com/fossasia/badgemagic-firmware/commit/9ce885d682b5c56c3ac7595c09e009a210885221)
- [“How to Burn Your LED Badge: Flash & Develop Custom Animation” — Dien-Nhung Nguyen, FOSSASIA Summit 2025](https://www.youtube.com/watch?v=X84YQFNjkmw)
  — practical teardown and WCH ISP demonstration; treat the shown board-short
  recovery technique as a hazardous bench method

## License and upstream work

FrogAlert is Apache-2.0 unless a file says otherwise. Upstream projects keep
their own licenses; see [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) and
[docs/UPSTREAM.md](docs/UPSTREAM.md).
