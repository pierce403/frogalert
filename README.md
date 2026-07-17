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
- host observation simulator: tested
- static project site: implemented
- Web Bluetooth BadgeMagic compatibility probe: experimental
- guarded WebUSB CH582 ISP flow: implemented, not hardware-verified
- embedded display/BLE firmware: not implemented
- downloadable firmware release: none yet

See [FEATURES.md](FEATURES.md) for the authoritative requirement-by-requirement
status and acceptance evidence.

## Hardware warning

Do not flash a badge based on appearance or the BLE name `LSLED`. Open it and
verify all of the following:

- MCU package marking: **CH582M**
- matrix: **11 rows × 44 columns**
- exact PCB revision or board identifier recorded from the opened board
- WCH factory ISP can be entered and identified read-only

The factory firmware is read-protected and cannot be backed up. Replacing it is
an irreversible first-install decision. Similar-looking badges can use different
controllers or matrix sizes and may be permanently damaged by incompatible
firmware. Read [docs/HARDWARE.md](docs/HARDWARE.md) before device work.

## Try the detection logic

```sh
cargo test --workspace
cargo run -p frogalert-simulator -- "00:25:DF:12:34:56" "Axon Body 4"
cargo run -p frogalert-simulator -- "C2:00:00:00:00:01" "Flipper Zero"
```

Expected simulator output:

```text
COP DETECTED (Axon OUI)
HAX DETECTED (Flipper name)
```

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

The release manifest is intentionally empty until a firmware image has passed
physical badge testing. Developers can select a local raw BIN for experimental
work, with explicit hardware and irreversibility gates.

## Verify everything currently available

```sh
./scripts/verify
```

That runs formatting, linting, Rust tests, browser-protocol/site tests, HTML
sanity checks when available, repo-local skill validation, and whitespace
checks. A passing local suite does not replace a physical badge test.

## Repository map

- [`crates/frogalert-core/`](crates/frogalert-core/) — allocation-free matching
- [`tools/simulator/`](tools/simulator/) — desktop observation simulator
- [`site/`](site/) — static website and browser device implementation
- [`tests/`](tests/) — protocol and site contract tests
- [`firmware/releases/manifest.json`](firmware/releases/manifest.json) — public
  hardware-verified release index (currently empty)
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
