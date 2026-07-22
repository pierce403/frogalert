# AGENTS.md — FrogAlert operating guide

## Self-improvement directive

Update this file whenever work reveals a durable fact about FrogAlert. Record
verified commands, useful conventions, failed approaches, hardware risks, and
collaboration preferences while they are fresh. Keep it compact enough to read
at the start of every important task; put dated detail in `agent-memory/` and
reusable procedures in `skills/`.

## Responsibilities

Agents working here are responsible for:

- keeping the CH582M hardware gate and irreversible-flash warnings accurate;
- preserving BadgeMagic app compatibility while implementing FrogAlert;
- keeping detection local, passive, explainable, and conservative;
- maintaining an honest `FEATURES.md` shipped-versus-planned tracker;
- verifying Rust, site, flasher, and documentation changes proportionally;
- updating repo-local memory and skills when a lesson will help future work;
- committing cohesive completed work and pushing `main` when requested.

Do not imply that firmware or browser flashing is production-ready until it has
been tested on a physically verified CH582M 11×44 badge.

## Project overview

FrogAlert is a Rust firmware experiment for the FOSSASIA-supported BadgeMagic
badge. It should remain a normal programmable LED nametag, briefly scan nearby
BLE advertisements, and temporarily show `COP DETECTED` or `HAX DETECTED` for
configured signatures.

The public site is a dependency-free static application. It separates:

- Web Bluetooth for talking to running BadgeMagic-compatible firmware; and
- WebUSB for replacing firmware through the WCH ISP bootloader.

## Source map

- `crates/frogalert-core/` — tested, allocation-free detection logic
- `firmware/frogalert-display/` — shared revision-gated charlieplex driver
- `firmware/frogalert-pixel-walk/` — single-pixel physical bring-up firmware
- `firmware/frogalert-count/` — hardware-gated BLE count lab firmware
- `firmware/frogalert-recovery/` — shared KEY2 hold and ROM-ISP transfer logic
- `firmware/vendor/ch58x-hal/` — pinned HAL `611954e` with documented local
  patches in `FROGALERT-VENDORING.md`
- `tools/simulator/` — host-side observation simulator
- `site/` — static site assets and browser device logic
- `site/isp-entry-guide.js` — pure KEY2 guide transitions and advisory timer
- `tests/` — browser-protocol and static-site tests
- `docs/` — hardware, protocol, development, flashing, and release contracts
- `skills/` — focused repo-local procedures
- `agent-memory/` — dated technical notes and work logs
- `FEATURES.md` — authoritative requirements and readiness tracker
- `index.html` — public landing page and read-only browser inspection lab
- `flash/index.html` — dedicated mobile-first flashing and KEY2 recovery surface

## Safety invariants

- Target only a badge whose opened PCB is confirmed as CH582M with an 11×44
  matrix and recorded exact PCB revision. `LSLED` naming and enclosure
  appearance are not proof.
- The OEM firmware is read-protected, unavailable, and cannot be backed up. A
  first flash is irreversible unless the owner already has a recoverable image.
- The bundled FOSSASIA v0.1 image is an open BadgeMagic-compatible substitute,
  not a factory reset. It is restricted to `HARDWARE_REV1` and remains
  hardware-unverified by FrogAlert; preparation may work, but the public site
  must not arm destructive use until its manifest verification flag is backed
  by a recorded physical smoke test.
- Browser flashing must identify chip id `0x82`, family/type `0x16`, record the
  observed physical PCB marking separately, and bind the selected artifact to
  the entered firmware profile before any write.
- The first destructive step must reset CH58x protection/configuration with
  command `0xA8` and require an exact `0xA7` readback before erase.
- Never erase or write on connect. Require a user-selected firmware file,
  explicit confirmations, and a separate final action.
- Keep the OEM/unknown KEY2 cold-entry guide adjacent to the WebUSB chooser:
  battery disconnected, hold the button nearest USB while connecting, release
  after one pixel lights, then choose promptly. Timers and USB attach events
  must never call `requestDevice()`; only an explicit final user action may.
- Keep every destructive browser action restricted to `/flash/`; the landing
  lab may inspect a badge or artifact but contains no program control.
- Bind an active flash to the captured USB device and prohibit reconnecting a
  replacement device until that session exits.
- Always verify the programmed bytes before reporting success.
- Hosted lab images are not releases. They belong in a separate `lab_images`
  manifest collection, may be selected for local size/hash/profile inspection,
  and must remain write-disabled while `hardware_verified` is false. An empty
  collection is preferable to publishing a plausible but untested binary.
- Every FrogAlert image must preserve application-level KEY2 recovery before it
  is flash-approved. The bootloader remains the CH582 mask-ROM ISP; do not
  bundle or replace it. Match FOSSASIA v0.1's deliberate hold semantics as the
  reference: poll KEY2/PB22 every 200 ms, require more than ten held samples
  (about 2.2 seconds), quiesce application peripherals, and transfer to address
  zero while KEY2 remains low. Prove the result enumerates `4348:55e0` on the
  physical target and that short presses do not enter ISP.
- Every packaged CH58x BIN must contain WCH's startup sentinel `0xF5F9BDA9`
  in the reserved core-vector word at raw offset `0x14`. The Rust linker emits
  zero there, so the build scripts must run `scripts/finalize-firmware.mjs`
  before hashing or publication, and site assembly must reject a missing word.
  This is WCH startup compatibility parity, not proof that the sentinel itself
  causes application-to-ISP entry.
- Do not log, persist, or transmit scanned device identifiers. Retain only the
  ephemeral per-window addresses needed for deduplication, then zero them.
- Treat BLE OUI matches as hints only, and never use OUIs for randomized/local
  addresses.

## Verified commands

Run the complete local contract:

```bash
./scripts/verify
```

Individual checks:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup B1144C_250901_USB_C --check
./scripts/build-count-firmware HARDWARE_REV1 --check
node --test tests/*.test.mjs
xmllint --html --noout index.html
git diff --check
```

Preview the site locally:

```bash
./scripts/serve-site
```

Then open `http://127.0.0.1:4173`. Device APIs are available on localhost, but
real public use requires HTTPS and a compatible Chromium-family browser.

## Coding conventions

- Keep `frogalert-core` `no_std`, allocation-free, and independent of the HAL.
- Target QingKe V4 with `riscv32imc-unknown-none-elf`. Do not enable
  `unsafe-trust-wch-atomics`; every firmware build must pass the AMO/LR/SC
  instruction audit.
- Keep protocol encoders pure and unit-tested separately from WebUSB transport.
- Prefer explicit state transitions and visible logs for destructive flows.
- Keep the site dependency-free unless a real capability requires otherwise.
- Use semantic HTML, visible focus states, reduced-motion support, and readable
  status messages announced through ARIA live regions.
- Use repo-local `./tmp/` for scratch files and ignore it.
- Update `FEATURES.md` in the same change whenever readiness changes.

## Git and release discipline

- Inspect `git status` before editing and preserve unrelated changes.
- Keep changes focused; do not mix generated firmware binaries into ordinary
  source commits.
- A firmware release requires a versioned `.bin`, SHA-256 checksum, manifest,
  source commit, build provenance, hardware smoke evidence, and release notes.
- A site deployment is not verified until the public HTTPS page loads and its
  device-capability messaging matches the deployed code.

## Known issues and boundaries

- The safe first display artifact is `frogalert-pixel-walk`: it selects exactly
  one logical pixel, advances left-to-right every 750 ms, reports `(x, y)` at
  115200 baud on UART1/PA9, uses 5 mA GPIO drive, and initializes neither BLE
  nor a 32 kHz radio clock. `HARDWARE_REV1` and the exact
  `B1144C_250901_USB_C` candidate profile build separately. Both remain
  hardware-unverified and are not flash-approved.
- The site hosts the finalized USB-C pixel-walk image from source `f794974` as
  lab version `0.1.0-dev.f794974`, bound to profile
  `B1144C_250901_USB_C` and physical marking `B1144C_250901`. Its manifest flag
  remains `hardware_verified: false`, so the hosted selector is inspect/download
  only; qualified first-test use goes through the separate local BIN route.
- The shared Rust recovery crate and both lab applications now implement a
  2.2-second KEY2 hold followed by peripheral-specific quiescing and a transfer
  to address zero. This is source/build evidence only until short-press and
  `4348:55e0` long-press behavior are observed on each physical image.
- Raw Rust packaging patches only the reserved vector word at offset `0x14`
  from zero to WCH's `0xF5F9BDA9` sentinel, then hashes the finalized bytes.
  Any other pre-existing value is rejected as linker-layout drift.
- The count prototype emits build evidence only under `./tmp/`; it is not a
  release and has not booted on a physical badge.
- Its passive three-second window counts up to 64 unique advertiser addresses
  in ephemeral RAM, then displays the approximate result for seven seconds.
- The shared Rust display driver encodes both Micro-USB `HARDWARE_REV1` and the
  candidate `B1144C_250901_USB_C` map. Pixel mapping, orientation, flicker,
  current draw, and radio/display coexistence still require a physical
  pixel-walk test.
- The count lab firmware does not implement the BadgeMagic GATT service.
- The vendored HAL is upstream `611954e` plus four recorded source patches: PAC
  `0.4` to `0.3`, raw BLE-heap pointer formation, Embassy-only GPIO async
  gating, and the missing synchronous SysTick nanosecond delay. Its BLE stack
  is WCH's precompiled `LIBCH58xBLE.a`, not an all-Rust radio stack.
- A 2026-07-22 macro photo of the USB-C `B1144C_250901` badge confirms a WCH
  `CH582M` in the expected 48-pin package. The exact downloaded FOSSASIA USB-C
  development BIN is 177,704 bytes with SHA-256
  `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`;
  its embedded source is `9ce885d` and its `USBC_VERSION=1` map differs from
  Rev1 only at T: PB6 rather than PB23. The missing flash transcript prevents
  treating that provenance as proof of the exact bytes programmed.
- That board's pouch battery is soldered to PCB tabs; it has no removable
  connector. Battery-disconnected cold entry means skilled electrical
  isolation, not an ordinary unplug step, and remains untested on this board.
  Never tell a user to pull, cut, or short the cell or imply that opening the
  case reveals a battery plug.
- Do not identify this board as `HARDWARE_REV2`, `HARDWARE_REV3`, or merely
  `BM1144-C`. Those upstream labels do not distinguish the exact working map.
  Do not port FOSSASIA head `eb6e9da`; it has duplicate I/K entries.
- FOSSASIA's working USB-C source selects and calibrates the internal LSI; a
  later upstream change explicitly says the board has no external 32 kHz
  crystal. The current Rust count image and vendored HAL BLE initializer select
  external LSE, so `B1144C_250901_USB_C` is display-only until LSI BLE support
  is implemented and tested.
- Browser ISP code follows the documented behavior of `ch32-rs/wchisp` and
  remains experimental until exercised on physical hardware.
- On the photographed USB-C `B1144C_250901` badge, holding KEY2 while pressing
  the populated `RESET` switch did not cause USB re-enumeration. Holding KEY2
  while momentarily bridging both ends of `C3` did enumerate `4348:55e0` twice;
  after a user-run flash, the application enumerated as `FOSSASIA WAS HERE`,
  `LED Badge Magic`, `BM1144-C fw: v0.1`, with HID and CDC ACM interfaces. The
  C3 rail-collapse method remains hazardous bench recovery and must not become
  routine web-flasher guidance.
- FOSSASIA `BM1144-C fw: v0.1` has physically demonstrated KEY2-only long-press
  ISP entry with a visible dot cue on the photographed USB-C badge. Exact timing
  and a fresh kernel transcript were not recorded. Do not transfer that claim
  to unknown firmware or an unverified FrogAlert build; use the cold-entry
  recovery path when the application hook is absent or broken.
- Android Chrome may expose WebUSB through a data-capable USB OTG connection;
  iPhone/iPad browsers do not. The Android path remains hardware-unverified.
- ISP can identify CH582, bootloader/configuration facts, and UID integrity. It
  cannot identify arbitrary installed firmware, PCB revision, matrix wiring,
  or board health. Optional Bluetooth Device Information strings are
  self-reported hints, not flash-content proof.
- WebUSB and Web Bluetooth support varies by browser and operating system.
- USB permission or driver binding can block WebUSB even when the browser API
  exists; do not describe that as a firmware failure.

## Memory and skills

- Read `MEMORY.md` and `SKILLS.md` before important work.
- Put durable observations in `agent-memory/notes/` and dated outcomes in
  `agent-memory/logs/`.
- Use `skills/curator/` to decide when a repeated workflow belongs in a skill.
- Keep `AGENTS.md` canonical. `CLAUDE.md` and `GEMINI.md` are symlinks here.
