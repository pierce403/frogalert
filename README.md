# FrogAlert

FrogAlert is an experimental Rust-powered firmware project for the
FOSSASIA-supported BadgeMagic CH582M 11×44 LED badge. The goal is to keep the badge useful as a
normal app-programmable nametag while briefly scanning nearby BLE advertisements
and temporarily showing an explainable local alert such as `COP DETECTED`,
`FLIPPER DETECTED`, or `KARR DETECTED`.

Project site: **<https://frogalert.org>**

Guided browser flasher and recovery instructions: **<https://frogalert.org/flash/>**

Source and issues: **<https://github.com/pierce403/frogalert>**

## Current state

- Rust `no_std` detection core: tested
- host observation/count simulator: tested
- standalone Rust display/count images: quarantined; the PAC/runtime vector
  mismatch makes both interrupt-driven builds unsafe to flash
- replacement firmware base: pinned FOSSASIA USB-C C hardware shell reproduces
  the known-good image byte-for-byte; the 177,788-byte metadata-only canary
  builds and audits but remains local and hardware-unverified
- private survey candidate: a locked 201,788-byte local BIN adds passive
  counting, normal-nametag/count view rotation, the bounded detection table
  below, three-second overlays on a roughly 20-second survey cadence, and a
  BadgeMagic frog animation; it remains
  hardware-unverified and is neither published nor flash-approved
- static project site: implemented
- Web Bluetooth BadgeMagic compatibility probe: experimental
- guarded WebUSB CH582 ISP flow: implemented, not hardware-verified
- full BadgeMagic-compatible FrogAlert firmware: not implemented
- downloadable FrogAlert release or lab BIN: none; the first USB-C pixel-walk
  image was withdrawn after it booted blank and failed KEY2 recovery
- public artifact safety: failed SHA permanently quarantined; site assembly
  rejects every FrogAlert BIN without hash-bound physical smoke evidence, and
  the browser refuses the failed SHA even if it is manually reselected
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

## Detection rules

The Rust detection core currently contains these rules:

| Signal | Match | Rule label | Badge alert |
| --- | --- | --- | --- |
| Public-address OUI | `00:25:DF` | Axon OUI | `COP DETECTED` |
| Public-address OUI | `B4:1E:52` | Flock Safety OUI | `COP DETECTED` |
| Advertised name contains | `Axon Body` | Axon name | `COP DETECTED` |
| Advertised name contains | `TASER` | TASER name | `COP DETECTED` |
| Advertised name contains | `Flipper` | Flipper name | `FLIPPER DETECTED` |
| Advertised name starts with a non-empty serial prefix | `QT ` | KARR QT serial name | `KARR DETECTED` |
| Advertised name contains | `Ray-Ban` | Ray-Ban name | `COP DETECTED` |
| Advertised name contains | `Ray Ban` | Ray Ban name | `COP DETECTED` |
| Exact advertised name | `LED Badge Magic` | BadgeMagic name | two-frame three-frog animation for three seconds |
| Advertised 16-bit service | `0xFEE0` | BadgeMagic-compatible service | two-frame three-frog animation for three seconds |

Detection names use case-insensitive substring matching except for two narrow
rules: KARR requires `QT ` at the beginning plus a non-empty serial value, and
the `LED Badge Magic` frog trigger requires an exact name. OUI rules run only
when the Bluetooth controller reports a public address; FrogAlert deliberately
does not apply them to randomized or locally administered addresses. These are
explainable hints rather than proof of device identity: names can be changed or
spoofed, and vendor prefixes can cover unrelated products.

The current private hardware survey candidate mirrors every row in this table
in a bounded C classifier. That lets the behavior be built and inspected while
the separately gated Rust ABI canary remains pending; it does not waive that
gate or make the BIN hardware-verified. Passive discovery does not guarantee
that a scan-response-only local name will be delivered, so the advertised
`0xFEE0` service is a deliberately broad BadgeMagic fallback and can animate
for compatible non-BadgeMagic devices that reuse that UUID.

In this candidate, a short KEY2 press rotates the visible content as
`Name 1 → BT counter → Name 2 → BT counter → …`. KEY1 retains FOSSASIA's
normal download/power behavior, KEY1 long press still changes brightness, and
the independent long-KEY2 ISP path remains in the inherited shell. Passive
surveys continue in both nametag and counter views. `COP DETECTED`,
`FLIPPER DETECTED`, and `KARR DETECTED` temporarily overlay either view for
three seconds, then the selected view resumes without changing the uploaded
nametag data. Survey
windows start roughly every 20 seconds, so a continuously present match can
retrigger once in each new window.

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
cargo run -p frogalert-simulator -- "C2:00:00:00:00:02" "QT 123456"
cargo run -p frogalert-simulator -- --count 23
```

Expected classifier output; count mode then prints an 11×44 text framebuffer:

```text
COP DETECTED (Axon OUI)
FLIPPER DETECTED (Flipper name)
KARR DETECTED (KARR QT serial name)
nearby BLE devices: 23
```

The count mode renders the same compact numeric framebuffer used by the
embedded prototype, without touching hardware.

## Build the pinned USB-C firmware base

The next physical images retain the exact FOSSASIA USB-C hardware shell that
already boots on the photographed badge. C continues to own startup, vectors,
clocks, USB HID+CDC, BadgeMagic BLE/TMOS, display refresh, buttons, and KEY2 ISP
entry. Rust will be linked later only for pure detection logic behind a small C
ABI.

The first build downloads and verifies the pinned source and MRS V1.92
toolchain (about 345 MB), then reproduces the known-good baseline:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
```

The first derived canary adds only an inert identifying string—no new function,
radio, display, USB, button, or recovery behavior:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
```

The later private survey candidate is built and audited separately:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
```

Its locked local BIN is 201,788 bytes with SHA-256
`9d35de6a3bf7cdf90b2a4fe05fa25d0a85a3f9b18da42228b5e25908a92c51a7`.
Those are reproducible build facts, not physical-test or release evidence.

All downloads and outputs stay under ignored `tmp/fossasia-usbc/`. The scripts
never invoke `wchisp`, copy a BIN into `firmware/releases/`, or update the site
manifest. A passing build is not permission for public or end-user flashing.
The only next step is an explicitly authorized one-badge bench smoke whose
initial program/verify starts the physical checklist in
[docs/HARDWARE.md](docs/HARDWARE.md).

## Quarantined standalone Rust prototypes

The old pixel-walk and count sources remain for forensic and host-logic work,
but their standalone badge runtime is unsafe. The post-link audit proves that
Timer 0 points to `DefaultInterruptHandler` rather than its Rust wrapper. Their
build helpers intentionally fail before `objcopy` and remove stale BINs:

```sh
./scripts/build-display-bringup B1144C_250901_USB_C --check
./scripts/build-count-firmware HARDWARE_REV1 --check
```

Do not bypass that failure or flash an older temporary output. See the
[lessons-learned record](agent-memory/logs/2026-07-22-blank-rust-image-lessons.md)
for the exact linked-image cause.

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
- [`firmware/fossasia-usbc/`](firmware/fossasia-usbc/) — pinned known-good
  USB-C hardware shell and metadata-only compatibility canary
- [`firmware/frogalert-display/`](firmware/frogalert-display/) — quarantined
  standalone Rust matrix-driver research
- [`firmware/frogalert-pixel-walk/`](firmware/frogalert-pixel-walk/) — failed
  standalone runtime retained for vector-forensics regression tests
- [`firmware/frogalert-count/`](firmware/frogalert-count/) — quarantined Rust
  wrapper around otherwise reusable observer/count logic
- [`firmware/frogalert-recovery/`](firmware/frogalert-recovery/) — historical
  standalone-Rust KEY2 experiment retained for tests and forensics; replacement
  images use FOSSASIA's application recovery task
- [`firmware/vendor/ch58x-hal/`](firmware/vendor/ch58x-hal/) — pinned,
  provenance-documented HAL subset used by the prototype
- [`tools/simulator/`](tools/simulator/) — desktop observation simulator
- [`scripts/build-fossasia-usbc`](scripts/build-fossasia-usbc) — pinned baseline
  and metadata-canary build/audit path with ignored output only
- [`scripts/audit-ch58x-vectors.mjs`](scripts/audit-ch58x-vectors.mjs) —
  post-link regression guard for the failed standalone Rust layout
- [`site/`](site/) — static website and browser device implementation
- [`flash/index.html`](flash/index.html) — dedicated guided WebUSB flashing and
  KEY2 recovery surface
- [`tests/`](tests/) — protocol and site contract tests
- [`firmware/releases/manifest.json`](firmware/releases/manifest.json) — public
  verified release/lab and separately labeled upstream recovery indexes
- [`firmware/quarantine.json`](firmware/quarantine.json) — permanent denylist
  for failed firmware hashes
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
2. Let short KEY2 presses rotate uploaded names with the latest nearby-device
   count while preserving KEY1's system behavior and long-KEY2 recovery.
3. When no app is connected, briefly pause advertising and passively scan BLE
   in either visible view.
4. Match public-address OUIs, advertised names, and the narrow BadgeMagic
   service hint locally.
5. Temporarily show an alert or frog animation, then restore the selected view
   and resume advertising without changing saved nametag content.

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
