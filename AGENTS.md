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

FrogAlert is a Rust-powered firmware experiment for the FOSSASIA-supported
BadgeMagic badge. Its first images retain FOSSASIA's C hardware/runtime shell
and call Rust only for pure policy logic. It should remain a normal programmable LED nametag, briefly scan nearby
BLE advertisements, and temporarily show `COP DETECTED` or
`FLIPPER DETECTED` for configured signatures.

The public site is a dependency-free static application. It separates:

- Web Bluetooth for talking to running BadgeMagic-compatible firmware; and
- WebUSB for replacing firmware through the WCH ISP bootloader.

## Source map

- `crates/frogalert-core/` — tested, allocation-free detection logic
- `firmware/fossasia-usbc/` — pinned known-good USB-C hardware shell,
  metadata-only compatibility canary, and private passive-survey candidate
- `firmware/frogalert-display/` — quarantined standalone Rust display research
- `firmware/frogalert-pixel-walk/` — failed image retained for vector forensics
- `firmware/frogalert-count/` — quarantined wrapper around reusable count logic
- `firmware/frogalert-recovery/` — historical Rust KEY2 experiment, not the
  recovery implementation used by replacement images
- `firmware/vendor/ch58x-hal/` — pinned HAL `611954e` with documented local
  patches in `FROGALERT-VENDORING.md`
- `firmware/quarantine.json` — permanent failed-artifact SHA denylist
- `scripts/build-fossasia-usbc` — pinned baseline/canary/survey build path
- `scripts/audit-ch58x-vectors.mjs` — post-link standalone Rust regression gate
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
  safely isolate battery power, hold the button nearest USB while connecting,
  release after one pixel lights, then choose promptly. If the battery is
  soldered, tell ordinary users to stop; isolation is qualified Li-ion bench
  work. Timers and USB attach events must never call `requestDevice()`; only an
  explicit final user action may.
- Keep every destructive browser action restricted to `/flash/`; the landing
  lab may inspect a badge or artifact but contains no program control.
- Bind an active flash to the captured USB device and prohibit reconnecting a
  replacement device until that session exits.
- Always verify the programmed bytes before reporting success.
- Unverified FrogAlert BINs stay only under ignored `tmp/`; never copy them to
  `firmware/releases/`. Public release and lab collections both require
  `hardware_verified: true` plus hash/profile/PCB-bound physical evidence.
  One descriptor covers exactly one profile and one physical PCB marking. Its
  structured `firmware/evidence/*.json` record must repeat the exact hash,
  source, board, application USB, display, BadgeMagic upload, and KEY2-only
  dot-to-ISP results, separate KEY1/short-KEY2 behavior, and known-good reflash.
  Bind a dated transcript with exact identifiers and captured CLI, WebUSB,
  kernel, app, and visual evidence; C3 entry does not satisfy the KEY2 gate.
  `firmware/quarantine.json` is a permanent SHA denylist checked during site
  assembly and after hashing any browser-selected local file. If the browser
  cannot load that registry, artifact preparation must fail closed.
- Every FrogAlert image must preserve FOSSASIA's application-level KEY2 task
  before it is flash-approved. The bootloader remains the CH582 mask-ROM ISP;
  do not bundle or replace it. Keep the proven 200 ms TMOS poll, more-than-ten
  held samples (about 2.2 seconds), dot cue, and address-zero transfer intact.
  Prove enumeration as `4348:55e0`/`1a86:55e0` and short-press safety on the
  exact physical artifact.
- Every packaged CH58x BIN must contain WCH's startup sentinel `0xF5F9BDA9`
  in the reserved core-vector word at raw offset `0x14`. The FOSSASIA shell
  emits it directly and its audit must observe it without post-build mutation.
  The historical standalone Rust path used `scripts/finalize-firmware.mjs` to
  replace a zero, but that did not make its runtime valid. Site assembly still
  rejects a missing word. The sentinel is not proof of recovery; post-link
  audits must also verify vector placement and actual handler targets.
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
node --test tests/*.test.mjs
xmllint --html --noout index.html flash/index.html
git diff --check
```

The pinned firmware lanes are heavier, explicit checks rather than ordinary
host verification:

```bash
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
```

Preview the site locally:

```bash
./scripts/serve-site
```

Then open `http://127.0.0.1:4173`. Device APIs are available on localhost, but
real public use requires HTTPS and a compatible Chromium-family browser.

## Coding conventions

- Keep `frogalert-core` `no_std`, allocation-free, HAL-independent, and exposed
  to the C shell only through primitive C ABI types.
- Keep FOSSASIA's WCH GCC linker as the final linker. Rust must not own reset,
  vectors, interrupts, clocks, USB, BLE setup, or display scanning. Never use
  `unsafe-trust-wch-atomics`; every final image must pass the AMO/LR/SC audit.
- Reconstruct the final BIN from the audited ELF with the pinned `objcopy` and
  require byte identity with the Make-produced BIN. Lock baseline, canary, and
  survey size/SHA-256 values; marker strings alone are not an image audit.
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

- The USB-C pixel-walk image from source `f794974` booted blank and failed its
  KEY2 recovery acceptance test. It is withdrawn from the manifest and must not
  be hosted, recommended, or flashed. Its SHA is permanently quarantined.
- Root cause is confirmed in the linked ELF: PAC 0.3 put
  `__EXTERNAL_INTERRUPTS` in flash `.rodata`, while `qingke-rt` 0.5 expected it
  in the RAM vector table. IRQ16/TMR0 pointed to `DefaultInterruptHandler`, so
  the first display interrupt looped forever before refresh or KEY2 polling.
  The count ELF has the same defect.
- The Rust build helpers are quarantine diagnostics. They delete stale BINs,
  retain ELF/vector reports, demonstrate the vector failure, and exit before
  `objcopy`. `./scripts/verify` expects this failure. Do not bypass it.
- The replacement base is exact FOSSASIA USB-C source `9ce885d`, pinned MRS
  V1.92, and `USBC_VERSION=1`. The first C-only canary adds an inert identity
  string and changes no runtime behavior. Its local BIN is 177,788 bytes with
  SHA-256 `6591f55f6035721384dd2780cb66c03d58e5e08817a1b4e5808a9d2821503e87`.
  It is build evidence only. Rust ABI integration comes only after that canary
  passes USB/app/button/recovery/power-cycle testing.
- The old count lab's intended passive three-second window counts up to 64
  unique advertiser addresses in ephemeral RAM, then displays the approximate
  result for seven seconds. That firmware is quarantined and does not implement
  the BadgeMagic GATT service.
- The preceding 199,076-byte FOSSASIA-shell survey candidate visibly displayed
  `BT 00` on the photographed badge, proving the injected display hook ran, but
  the user saw no nonzero result. There is no hash-bound flash transcript, so
  do not treat that report as proof of the exact bytes or of radio behavior.
  The likely software failure was startup ordering: FOSSASIA started Peripheral
  before the survey registered its Central callback, so a combined-role
  `GAP_DEVICE_INIT_DONE_EVENT` could be missed and no scan scheduled.
- The replacement private survey candidate is a locked 201,412-byte BIN at
  SHA-256 `42a42f4a1aeedafeafc4e2d14c95c467f2eb4e3397f8712be555b1b99330e650`.
  It treats a successful Central start as ready instead of depending only on
  that callback, consumes both live reports and the discovery completion list,
  and displays scan phases: `I` initializing, `R` ready/waiting, `S` scanning,
  no suffix for a completed result, `E` error, and `T` timeout. Short KEY2
  rotates `Name 1 → BT counter → Name 2 → BT counter`; KEY1 system/brightness
  behavior and the independent long-KEY2 ISP task remain inherited. Surveys
  continue in either visible view. The bounded C mirror implements every
  README OUI/name row; `COP DETECTED` and `FLIPPER DETECTED` overlay either view
  for five seconds, then the selected view resumes. There is no unique Flipper
  OUI: official firmware derives a public MAC from STM32 identifiers, so an ST
  OUI would overmatch, and custom firmware can rename or spoof the device.
  Exact case-insensitive `LED Badge Magic` or advertised `0xFEE0` triggers
  three frogs in two alternating frames for two seconds. Passive scans may miss
  scan-response-only names, so the service fallback can false-positive another
  compatible `0xFEE0` advertiser. The C mirror remains temporary until the Rust
  ABI canary. The image still uses a passive three-second window only while
  disconnected, caps and zeroes 64 addresses, restores advertising, cancels a
  stuck scan after five seconds, and leaves 9,788 bytes of measured
  stack/runtime headroom. Audited text/data/BSS sizes are
  192,920/8,492/4,588 bytes. It preserves audited FOSSASIA
  USB/BLE/display/KEY2 symbols but remains private under `tmp/`,
  hardware-unverified, and not flash-approved or published.
- WCH discovery cancellation is asynchronous. Keep `scan_active` true until
  `GAP_DEVICE_DISCOVERY_EVENT` (or `bleIncorrectMode`) confirms the radio is
  idle; streaming, a peripheral connection, and download mode must request
  cancellation and defer advertising until that completion. Restore the last
  completed count after suspension so a cancelled `S` phase is never shown as
  a measurement. Clear an interrupted BadgeMagic streaming session on
  disconnect before resuming survey scheduling and advertising.
- The user observed survey-display flicker. FOSSASIA scans 22 Charlieplex
  source phases at roughly 45 Hz, which can be visible. The survey hook also
  called `stop_all_animation()` every 100 ms, clearing the live framebuffer and
  adding periodic blank/partial frames. The replacement stops animation only
  on display-ownership transition; it does not change the base refresh rate.
- The quarantined Rust display driver encodes both Micro-USB `HARDWARE_REV1`
  and the candidate `B1144C_250901_USB_C` map. Pixel mapping, orientation,
  flicker, current draw, and radio/display coexistence still require a physical
  test in a future FOSSASIA-shell derivative.
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
  crystal. Keep that C clock path. Do not reuse the old Rust HAL initializer,
  which selects external LSE, in the replacement USB-C image.
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
