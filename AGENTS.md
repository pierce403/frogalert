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
- `tools/simulator/` — host-side observation simulator
- `site/` — static site assets and browser device logic
- `tests/` — browser-protocol and static-site tests
- `docs/` — hardware, protocol, development, flashing, and release contracts
- `skills/` — focused repo-local procedures
- `agent-memory/` — dated technical notes and work logs
- `FEATURES.md` — authoritative requirements and readiness tracker
- `index.html` — public landing page and browser flashing surface

## Safety invariants

- Target only a badge whose opened PCB is confirmed as CH582M with an 11×44
  matrix and recorded exact PCB revision. `LSLED` naming and enclosure
  appearance are not proof.
- The OEM firmware is read-protected and cannot be backed up. A first flash is
  irreversible unless the owner already has a recoverable image.
- Browser flashing must identify chip id `0x82`, family/type `0x16`, and bind
  the selected artifact to the entered PCB revision before any write.
- The first destructive step must reset CH58x protection/configuration with
  command `0xA8` and require an exact `0xA7` readback before erase.
- Never erase or write on connect. Require a user-selected firmware file,
  explicit confirmations, and a separate final action.
- Bind an active flash to the captured USB device and prohibit reconnecting a
  replacement device until that session exits.
- Always verify the programmed bytes before reporting success.
- Do not collect, persist, or transmit scanned device identifiers.
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

- There is not yet a flashable FrogAlert firmware image.
- The Rust display driver and BadgeMagic GATT service are not yet implemented.
- Browser ISP code follows the documented behavior of `ch32-rs/wchisp` and
  remains experimental until exercised on physical hardware.
- WebUSB and Web Bluetooth support varies by browser and operating system.
- USB permission or driver binding can block WebUSB even when the browser API
  exists; do not describe that as a firmware failure.

## Memory and skills

- Read `MEMORY.md` and `SKILLS.md` before important work.
- Put durable observations in `agent-memory/notes/` and dated outcomes in
  `agent-memory/logs/`.
- Use `skills/curator/` to decide when a repeated workflow belongs in a skill.
- Keep `AGENTS.md` canonical. `CLAUDE.md` and `GEMINI.md` are symlinks here.
