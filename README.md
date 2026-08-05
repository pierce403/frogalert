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
- replacement firmware base: pinned FOSSASIA USB-C C hardware shell supports
  exact `B1144C_260404_USB_C` and `B1144C_250901_USB_C` build profiles; the
  Nyx `260404` KEY1 wiring is the build default; exact `260404` SHA
  `c6d06c59…face0d9` and `250901` SHA `f9367fe…73d5c9` have user-confirmed
  runtime, display, BadgeMagic upload, button, and KEY2 recovery behavior
- survey firmware: CI builds and audits one profile-bound BIN/ELF
  pair for each USB-C board profile, with passive counting, configurable
  built-in/custom monitoring, deterministic
  `frogs → KARR → COP → Flipper → custom` priority, one second per alert frame
  on a roughly 20-second survey cadence, and a three-second BadgeMagic frog
  animation; an entirely blank nametag falls back to scrolling `503.PARTY`
  without modifying data flash; the current beta bundle predates this candidate and remains
  published together as `0.1.0-beta.1` and available to the flasher
- boot status: current source always credits FOSSASIA, then shows the compact
  FrogAlert version, a top/up or bottom/down build marker, and calibrated
  battery voltage plus an approximate bounded percentage; this `0.2.0-beta.9`
  source is published automatically after its cloud build and remains clearly
  labeled hardware-unverified until its exact bytes are physically tested
- dancing-frog firmware: a separate hardware-unverified lane retains the same
  passive surveys, alerts, upstream button roles, profile-bound buttons, and KEY2
  recovery, but replaces the visible Bluetooth counter with three frogs
  alternating poses every half-second
- static project site: implemented
- Web Bluetooth BadgeMagic compatibility probe: experimental
- guarded WebUSB CH582 ISP flow: implemented, not hardware-verified
- BadgeMagic-compatible FrogAlert firmware: implemented in the retained
  FOSSASIA USB/BLE shell and user-confirmed on both published beta profiles;
  new CI-audited releases are phone-flashable immediately while exact-board
  hardware-test status remains visible in the catalog
- downloadable FrogAlert beta BINs: same-origin top-button (`260404`) and
  bottom-button (`250901`) artifacts are linked on the front page and selected
  automatically by `/flash/`
- public artifact safety: failed SHA permanently quarantined; site assembly
  accepts an untested standard release only with exact source-bound CI
  provenance and an explicit audited/flash-approved status, while the browser
  refuses the failed SHA even if it is manually reselected
- phone/cloud release path: GitHub Actions builds, audits, and attests declared
  firmware versions without a local toolchain; the post-CI publication flow
  records the standard top/bottom pair, publishes the GitHub Release, and
  deploys the identical same-origin website bytes without a separate laptop or
  physical-evidence approval step
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

The Rust detection core contains these rules. The survey firmware enables the
same built-in target groups by default. The tested configuration codec can
derive a profile-bound BIN with selected groups or bounded custom name,
public-OUI, and 16-bit-service rules, but the public flasher intentionally does
not expose unverified derivatives:

| Signal | Match | Rule label | Badge alert |
| --- | --- | --- | --- |
| Public-address OUI | `00:25:DF` | Axon OUI | `COP DETECTED` |
| Public-address OUI | `B4:1E:52` | Flock Safety OUI | `COP DETECTED` |
| Advertised name contains | `Axon Body` | Axon name | `COP DETECTED` |
| Advertised name contains | `TASER` | TASER name | `COP DETECTED` |
| Advertised name contains | `Flipper` | Flipper name | `FLIPPER DETECTED` |
| Advertised 16-bit service | `0x3081`, `0x3082`, or `0x3083` | Flipper hardware-color service | `FLIPPER DETECTED` |
| Advertised name starts with a non-empty serial prefix | `QT ` | KARR QT serial name | `KARR DETECTED` |
| Advertised name contains | `Ray-Ban` | Ray-Ban name | `COP DETECTED` |
| Advertised name contains | `Ray Ban` | Ray Ban name | `COP DETECTED` |
| Manufacturer ID and advertised 16-bit service in the same packet | `0x01AB` + `0xFD5F` | Meta passive pair | `COP DETECTED` |
| Exact advertised name | `LED Badge Magic` | BadgeMagic name | three-frame frog animation, one second per frame |
| Advertised 16-bit service | `0xFEE0` | BadgeMagic-compatible service | three-frame frog animation, one second per frame |

Detection names use case-insensitive substring matching except for two narrow
rules: KARR requires `QT ` at the beginning plus a non-empty serial value, and
the `LED Badge Magic` frog trigger requires an exact name. OUI rules run only
when the Bluetooth controller reports a public address; FrogAlert deliberately
does not apply them to randomized or locally administered addresses. The Meta
rule requires both `0x01AB` manufacturer data and service `0xFD5F` in one
passive report; either marker alone is ignored. These are explainable hints
rather than proof of device identity: names and fields can be spoofed, and
company assignments can cover unrelated products.

The current survey source mirrors every row in this table in a bounded C
classifier. The downloadable 0.1.0-beta.1 images predate the Meta pair and
Flipper service rule. New standard counter builds enter the public catalog
automatically after the pinned CI build, audit, provenance attestation, and
publication checks pass; hardware-test status remains distinct and visible.
The bounded mirror lets the behavior be built and inspected while the
separately gated Rust ABI canary remains pending; it does not waive that gate.
Passive discovery does not guarantee
that a scan-response-only local name will be delivered, so the advertised
`0xFEE0` service is a deliberately broad BadgeMagic fallback and can animate
for compatible non-BadgeMagic devices that reuse that UUID.

Each survey BIN contains one CRC-protected configuration block bound to its
compiled hardware profile. The browser will not rewrite a `250901` image as a
`260404` image or vice versa. A customized download is a newly derived,
hardware-unverified local artifact even when its base BIN came from CI.

In these beta images, the physical button nearest USB rotates the visible
content as `Name 1 → Bluetooth counter → Name 2 → Bluetooth counter → …`: that is KEY2 on
`250901`, but KEY1 on the reversed `260404` layout. The other short press keeps
the physical top/system role and cycles normal → Bluetooth download →
recoverable screen off → normal. Screen off disables the display refresh,
matrix drive, advertising, and surveys without stopping the button or ISP
tasks. KEY1 long press still changes brightness,
and the independent farther-button long-KEY2 ISP path remains in the inherited
shell on `260404`. Passive
surveys continue in both nametag and counter views. `COP DETECTED`,
`FLIPPER DETECTED`, and `KARR DETECTED` temporarily overlay either view for
one second per generated frame, then the selected view resumes without
changing the uploaded nametag data. The current built-ins use two frames and
therefore last two seconds. The counter is one centered, fixed frame: the
Bluetooth rune followed by a completed result such as `04`. It holds that
result throughout the next scan and switches only when a new survey completes,
so internal scan state cannot look like a third digit. Text alerts use at
most two fixed pages held for one second each—such as `COP` followed by
`DETECTED`—rather than scrolling pixel by pixel. Survey
windows start roughly every 20 seconds, so a continuously present match can
retrigger once in each new window. While an overlay owns the panel, already
queued marquee, flash, fixed-animation, and Bluetooth-stream animation events
are consumed instead of being allowed to restart the normal scroll underneath
it. The LED refresh ISR also selects a separate double-buffered FrogAlert
framebuffer while the overlay is active, so even an unexpected base-animation
write cannot reach the panel. Normal content resumes only when the overlay
releases display ownership. The survey lane also ports bkero's
16 kHz Timer 0 change, raising calculated complete-frame refresh from roughly
45 Hz to 182 Hz and blanking each column pair only once per off-period. That
should reduce visible strobing, but the higher interrupt rate and current/BLE
behavior remain hardware-unverified.

The optional `frogs` build lane uses the same view button and survey/alert
logic, but its rotation is
`Name 1 → dancing frogs → Name 2 → dancing frogs → …`. The three-frog view is
fixed in place and alternates between its two poses every 500 ms. Temporary
detector overlays preempt the frogs, then the frogs resume. This variant is
separate from the published counter beta and remains hardware-unverified.

Current FrogAlert candidates preserve the separation between the two physical
short-button actions on both exact boards. The bottom button changes only the
selected name/count or name/frog view; it never enables advertising or starts
the Bluetooth animation. The top button enters persistent BadgeMagic download
mode, then recoverable screen off, and wakes to normal on the next short press.
This is compile-time routing (`260404`: KEY1 view/KEY2 system; `250901`: KEY2
view/KEY1 system), never runtime profile guessing. Unattended badges do not
advertise continuously, avoiding a room full of identical `FEE0` candidates.
A successful app connection suspends surveys for the entire upload.

## Hardware warning

The photographed USB-C reference is PCB `B1144C_250901`, confirmed as a WCH
`CH582M` with an 11×44 display. Nyx documents the newer
`B1144C_260404` USB-C board. Both use the same 23-net LED matrix mapping and
KEY2/PB22 electrical behavior, but KEY2 is physically nearest USB on `250901`
and farther from USB on `260404`. The other relevant difference is KEY1/PA1:
`250901` uses an
internal pull-down with active-high presses and rising-edge shutdown wake;
`260404` connects the switch to ground and needs an internal pull-up,
active-low presses, and falling-edge wake.

There is no safe passive boot-time auto-detection for that distinction. With
KEY1 untouched, the switch is open on both boards and the input simply follows
whichever internal pull the firmware selected. An experimental held-KEY1 probe
was removed after a `250901` test showed that an open PA1 could be falsely
classified as `260404`, swapping the short-button roles. Each image now keeps
its compiled profile for KEY1 polarity, button routing, and shutdown wake.
Select the exact printed PCB marking for every flash; cross-profile flashing is
not repaired at runtime.

Once compatible FOSSASIA firmware is installed, holding KEY2 for about
2.2 seconds shows one dot near the middle and exposes WCH ISP as `4348:55e0`
or `1a86:55e0` for roughly 9–13 seconds. That convenient entry is an
application hook, so it is not available on original or unknown firmware. The
first documented entry on the soldered-battery `250901` board required a
qualified operator to hold KEY2 while momentarily bridging both ends of PCB
capacitor `C3`; RESET plus KEY2 did not work. C3 rail-collapse recovery is
hazardous expert bench work, not a routine website step. Leave the cell and its
leads alone. Nyx documents the `260404` first-entry attempt with the same C3
operation but its revision's KEY2 is the button farther from USB; FrogAlert has
not yet captured successful ISP enumeration on that revision.

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
map. FrogAlert therefore uses the exact tokens `B1144C_250901_USB_C` and
`B1144C_260404_USB_C`. Canonical standard counter releases for those two
profiles are flash-approved after the audited cloud publication gate, even
while they remain clearly hardware-unverified. The bundled Micro-USB recovery
image is not flash-approved.
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

## Compare Linux BLE discovery methods

Use the host probe to see whether a nearby device is visible through ordinary
BlueZ discovery, passive raw HCI scanning like the badge uses, or only through
an active scan that requests scan responses:

```sh
python3 tools/ble-probe.py bluez --seconds 30
python3 tools/ble-probe.py bluez --seconds 300 --candidates-only --stop-on-candidate
bluetoothctl scan off
sudo python3 tools/ble-probe.py compare --seconds 30
```

Keep the glasses awake, and repeat once with them in pairing mode if needed.
The probe assigns run-local labels such as `D01`; it never prints Bluetooth
addresses or writes observations to disk. Meta/Luxottica company IDs and
Meta-assigned service UUIDs are reported as research leads, not accepted as
FrogAlert detection rules without field evidence. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for adapter and filtering options.

## Build the pinned USB-C firmware base

The next physical images retain the exact FOSSASIA USB-C hardware shell that
already boots on the photographed badge. C continues to own startup, vectors,
clocks, USB HID+CDC, BadgeMagic BLE/TMOS, display refresh, buttons, and KEY2 ISP
entry. Rust will be linked later only for pure detection logic behind a small C
ABI.

The first build downloads and verifies the pinned source and MRS V1.92
toolchain (about 345 MB). Omitting a profile selects the newer Nyx
`B1144C_260404_USB_C` default:

```sh
./scripts/build-fossasia-usbc baseline --check
./scripts/build-fossasia-usbc canary --check
./scripts/build-fossasia-usbc survey --candidate
./scripts/build-fossasia-usbc frogs --candidate
```

Pass the legacy profile explicitly when building for the older board:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --candidate
./scripts/build-fossasia-usbc B1144C_250901_USB_C frogs --candidate
```

The default may also be named explicitly:

```sh
./scripts/build-fossasia-usbc B1144C_260404_USB_C survey --candidate
```

The resulting test images are named
`frogalert-top-b1144c-260404.bin` and
`frogalert-bottom-b1144c-250901.bin` inside their respective profile build
directories. The new variant is named
`frogalert-frogs-top-b1144c-260404.bin` or
`frogalert-frogs-bottom-b1144c-250901.bin` under the `frogs/` lane. To have
`wchisp` wait for a bottom-button badge to enter ISP with the frog variant:

```bash
wchisp -r 30 flash \
  ./tmp/fossasia-usbc/build/B1144C_250901_USB_C/frogs/frogalert-frogs-bottom-b1144c-250901.bin
```

The first derived canary adds only an inert identifying string. The survey and
frog lanes add the passive detector and embed the compiled profile id.
Baseline and canary outputs have immutable size/SHA-256 locks in
`firmware/fossasia-usbc/upstream-lock.json`. GitHub's `--candidate` mode keeps all
structural audits while calculating new output hashes as a build receipt, so a
phone/cloud source change does not need a laptop-built hash update first. A
hash for one profile is never evidence for the other.

All downloads and outputs stay under ignored `tmp/fossasia-usbc/`. The scripts
never invoke `wchisp`, copy a BIN into `firmware/releases/`, or update the site
manifest. Local output is never publication permission; only canonical CI may
turn the standard top/bottom pair into a provenance-bound release. After those
automated gates pass, the pair is phone-flashable immediately with
`hardware_verified: false`. An explicitly authorized one-badge smoke then
starts the physical checklist in [docs/HARDWARE.md](docs/HARDWARE.md) and can
upgrade that status for the exact hash.

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
  exact CH582 target with an immediate read-only info exchange before the
  separately authorized erase/program/verify flow.

The landing page is project and release information only. All destructive
browser actions exist only on `/flash/`.

On `/flash/`, both same-origin profile images download and verify automatically;
there are no acknowledgement checkboxes, typed phrase, or review gate. The
first instruction is to hold either **Top** or **Bottom**, with the display
upright, until the badge enters ISP and to remember which button worked. For a
first-time WebUSB permission, the single **Start watching for ISP** action opens
the chooser before that physical hold; remembered permission can auto-detect
the attach. The
moment an authorized ISP device connects, the page immediately sends the
read-only `0xA1` Identify and `0xA7` Read Config exchange equivalent to the
useful portion of `wchisp info`. It then asks which button produced flashing
mode. That clearly destructive **Top button** or **Bottom button** choice is the
sole in-page consent: it binds the exact `260404` or `250901` image and
immediately starts flashing and byte-verifying without another prompt. There is
no profile selector or local file chooser in the public flasher. Developer
inspection and experimental configuration code remains host-tested but is not
exposed by either public page.

The schema-5 manifest keeps FrogAlert `releases`, FrogAlert `lab_images`, and
third-party `recovery_images` separate. Standard versions are atomic exact USB-C
profile pairs; the legacy `0.1.0-beta.1` pair remains immutable and new pairs
are generated automatically from successful audited CI. The lab collection
remains empty. The former
USB-C pixel-walk artifact was removed after a physical flash produced no panel
output and its KEY2 recovery path did not enumerate ISP. The recovery collection
contains the official FOSSASIA open v0.1 Micro-USB substitute, still
write-disabled.

After a successful CI run on `main`, the publication workflow revalidates that
manifest. For new versions it downloads the exact recorded Actions artifact,
checks its run/id/name/archive digest/candidate receipt and every BIN/ELF hash,
creates any missing approved GitHub Release as a draft, uploads and
re-downloads its assets for SHA-256 comparison, publishes the release, and only
then deploys Pages. The browser still fetches
the same-origin manifest and BIN from `frogalert.org`; GitHub is the release
record and alternate download, not a second trust source. See
[docs/RELEASE.md](docs/RELEASE.md).

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
- [`scripts/build-fossasia-usbc`](scripts/build-fossasia-usbc) — pinned,
  profile-specific baseline/canary/survey build and audit path with ignored
  output only
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
- [`docs/RELEASE.md`](docs/RELEASE.md) — automatic publication and truthful
  hardware-status gates
- [`AGENTS.md`](AGENTS.md), [`MEMORY.md`](MEMORY.md), and [`SKILLS.md`](SKILLS.md)
  — recurse.bot-inspired repo operating system

## Intended firmware cycle

1. Advertise as a BadgeMagic-compatible nametag and render uploaded content.
2. Let short view-button presses—nearest USB on either known board—rotate
   uploaded names with the latest nearby-device count while preserving the
   other system action and long-KEY2 recovery.
3. When no app is connected, briefly pause advertising and passively scan BLE
   in either visible view.
4. Match the enabled built-in groups and bounded custom public-address OUI,
   advertised-name, and 16-bit-service rules locally.
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
- [Nyx `260404` badge notes](https://badge.nyx.ms/)
- [FOSSASIA `260404` KEY1 wiring change](https://github.com/fossasia/badgemagic-firmware/commit/696bbd71b608a3f0db585cd0d8d828ce1f5dc0a3)
- [bkero 16 kHz display-refresh change](https://github.com/bkero/badgemagic-firmware/commit/074c448066573be2990fe83fd718a22c01b7c283)
- [“How to Burn Your LED Badge: Flash & Develop Custom Animation” — Dien-Nhung Nguyen, FOSSASIA Summit 2025](https://www.youtube.com/watch?v=X84YQFNjkmw)
  — practical teardown and WCH ISP demonstration; treat the shown board-short
  recovery technique as a hazardous bench method

## License and upstream work

FrogAlert is Apache-2.0 unless a file says otherwise. Upstream projects keep
their own licenses; see [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) and
[docs/UPSTREAM.md](docs/UPSTREAM.md).
