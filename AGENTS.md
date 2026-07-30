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
- committing cohesive completed work and pushing `main` after every task.

Do not imply that firmware or browser flashing is production-ready until it has
been tested on a physically verified CH582M 11×44 badge.

## Project overview

FrogAlert is a Rust-powered firmware experiment for the FOSSASIA-supported
BadgeMagic badge. Its first images retain FOSSASIA's C hardware/runtime shell
and call Rust only for pure policy logic. It should remain a normal programmable LED nametag, briefly scan nearby
BLE advertisements, and temporarily show configured messages such as
`COP DETECTED`, `FLIPPER DETECTED`, or `KARR DETECTED`.

The public site is a dependency-free static application. It separates:

- Web Bluetooth for talking to running BadgeMagic-compatible firmware; and
- WebUSB for replacing firmware through the WCH ISP bootloader.

## Source map

- `crates/frogalert-core/` — tested, allocation-free detection logic
- `firmware/fossasia-usbc/` — pinned USB-C hardware shell, exact `260404`
  default and `250901` legacy profiles, monitor configuration, canary, and
  private passive-survey candidates
- `firmware/frogalert-display/` — quarantined standalone Rust display research
- `firmware/frogalert-pixel-walk/` — failed image retained for vector forensics
- `firmware/frogalert-count/` — quarantined wrapper around reusable count logic
- `firmware/frogalert-recovery/` — historical Rust KEY2 experiment, not the
  recovery implementation used by replacement images
- `firmware/vendor/ch58x-hal/` — pinned HAL `611954e` with documented local
  patches in `FROGALERT-VENDORING.md`
- `firmware/quarantine.json` — permanent failed-artifact SHA denylist
- `scripts/build-fossasia-usbc` — pinned profile-specific
  baseline/canary/survey build path
- `scripts/apply-fossasia-hardware-profile.mjs` — exact KEY1 pull,
  polarity, and shutdown-wake patch for the selected USB-C board
- `scripts/firmware-candidate.mjs` — packages an audited, commit-bound,
  explicitly unverified CI candidate under ignored `tmp/`
- `scripts/audit-ch58x-vectors.mjs` — post-link standalone Rust regression gate
- `tools/simulator/` — host-side observation simulator
- `site/` — static site assets and browser device logic
- `site/firmware-config.js` — profile-bound survey configuration codec
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
- Treat `B1144C_260404_USB_C` and `B1144C_250901_USB_C` as separate exact
  artifacts. They share the LED matrix and KEY2 mapping, but KEY1/PA1 uses
  pull-up/active-low/falling wake on `260404` and
  pull-down/active-high/rising wake on `250901`. An untouched open KEY1 cannot
  auto-detect this; require the printed marking.
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
- Keep the routine KEY2 guide adjacent to the WebUSB chooser, but offer it only
  for compatible FOSSASIA or exact hardware-approved FrogAlert firmware: hold
  the profile-specific KEY2 for about 2.2 seconds (`260404`: farther from USB;
  `250901`: nearest USB), release when one dot lights near the middle, then
  choose promptly. Original or unknown firmware on the
  confirmed USB-C board must reach an ordinary-user stop boundary; its
  documented C3 entry is hazardous expert recovery, not a browser checklist.
  Timers and USB attach events must never call `requestDevice()`; only an
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
  source, and board. Stable schema-1 evidence additionally requires captured
  CLI, WebUSB, application USB, display, BadgeMagic upload, KEY2-only
  dot-to-ISP, button, and known-good-reflash results. A beta release may use
  schema-2 `user-confirmed-beta` evidence for an exact image the owner confirms
  working; it must disclose uncaptured transport logs and cannot satisfy stable
  promotion. C3 entry does not satisfy the KEY2 gate.
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
./scripts/build-fossasia-usbc baseline --check
./scripts/build-fossasia-usbc canary --check
./scripts/build-fossasia-usbc survey --check
./scripts/build-fossasia-usbc frogs --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C frogs --check
```

The omitted profile selects default `B1144C_260404_USB_C`. An active-firmware
`main` commit runs both survey variants for both profiles after the ordinary CI
contract and uploads one expiring `frogalert-candidate-<commit>` Actions
artifact with separate counter and `frogs` directories. Candidate metadata
must keep `hardware_verified`,
`flash_approved`, `publishable`, and `hosted_on_site` false; this build lane
never edits the public manifest or creates a GitHub Release.
Successful local builds also copy the audited bytes to
`frogalert-top-b1144c-260404.{bin,elf}` or
`frogalert-bottom-b1144c-250901.{bin,elf}` in the matching profile directory.
Candidate-bundle filenames include the same `top` or `bottom` token.

The first single-profile live candidate run, Actions run `30069161224` for
commit `af83fbb`, passed on 2026-07-23. Downstream run `30069244999` correctly
published no firmware release and deployed byte-exact site assets. This
verifies the automation boundary, not the current dual-profile candidate or
physical firmware.

The first public beta shipped from commit `8f1aeca` on 2026-07-29. CI run
`30427180021` passed; release/Pages run `30427231242` published
`v0.1.0-beta.1` and deployed both same-origin BINs. Post-deploy downloads
matched the locked `260404` SHA `c6d06c59…face0d9` and `250901` SHA
`f9367fe1…73d5c9`; the live flasher loaded both descriptors without console
errors or a file input. This proves release/catalog delivery, not a physical
WebUSB program/verify run.

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
- Keep the survey configuration fixed-size, CRC-protected, and bound to the
  compiled profile. The browser must patch an immutable copy, recompute
  SHA-256, clear flash confirmations, and mark every configured derivative
  hardware-unverified. Never use configuration to change hardware profile.
- When a FrogAlert overlay owns the display, consume already queued original
  animation events without rescheduling them; release the selected base view
  only after the final one-second alert frame expires.
- Prefer explicit state transitions and visible logs for destructive flows.
- Keep the site dependency-free unless a real capability requires otherwise.
- Keep `site/og-card.svg` as the editable social-card source and render the
  current versioned JPEG with `./scripts/render-og-card`. Both pages must use
  the same absolute 1200×630 URL. When artwork changes materially, advance the
  JPEG filename to invalidate unfurl caches while retaining the prior file for
  existing links. Tests must verify encoded dimensions, a long horizontal
  shell, and the exact 4:1 geometry of the illustrated 44×11 matrix. The
  physical badge face is almost entirely LEDs: keep the matrix near the bezel,
  without a fake side control rail or a visible `11×44` dimension label.
- This dependency-free site relies on explicit module query versions for cache
  invalidation. When an app dependency changes exports or state contracts, bump
  both pages' `app.js` query and the changed dependency query in `site/app.js`;
  reload a browser that previously opened the old site and check console errors.
- Keep `/flash/` as a one-pane wizard: connect/read-only identify, automatically
  prepare the approved button-matched image, confirmations, flash/verify,
  terminal result. Never reveal a later pane before its gate passes.
  `getDevices()` may automatically identify one
  previously authorized WCH ISP badge; a new badge still needs an explicit
  chooser tap, and USB attach must never synthesize `requestDevice()`. Keep
  unrelated Bluetooth, catalog, and diagnostic surfaces out of the visible
  flasher. Do not include a file input anywhere in `/flash/`, even hidden;
  profile and marking controls must not be visible in the public wizard.
  If no approved image matches, or ISP was entered before the wizard observed
  a bottom/top button path, stop without offering a developer BIN.
- After a successful CH582 ISP identification, store only a coarse local
  permission hint. Chrome remains authoritative through `getDevices()` and USB
  attach events; never store a serial or device identifier. Reuse authorized
  devices automatically, hide the redundant Connect control in recognized
  application mode, and retain an explicit chooser fallback for revoked access.
- Use semantic HTML, visible focus states, reduced-motion support, and readable
  status messages announced through ARIA live regions.
- Use repo-local `./tmp/` for scratch files and ignore it.
- Update `FEATURES.md` in the same change whenever readiness changes.

## Git and release discipline

- Inspect `git status` before editing and preserve unrelated changes.
- Keep changes focused; do not mix generated firmware binaries into ordinary
  source commits.
- A task is not complete until its cohesive verified commit is pushed to
  `origin/main` and local `main` matches the remote. The only exceptions are an
  explicit local-only request or a reported remote/authentication blocker.
- A firmware release requires a versioned `.bin`, SHA-256 checksum, manifest,
  source commit, build provenance, hardware smoke evidence, and release notes.
- Successful `main` commits reconcile only already-approved schema-v4 manifest
  release entries into GitHub Releases. Revalidate exact bytes and evidence,
  publish through a verified draft, and finish release reconciliation before
  Pages exposes the catalog. Empty catalogs are a no-op; never turn an ordinary
  build or commit into firmware promotion.
- Active firmware changes may produce a commit-bound Actions candidate only
  after the locked embedded build audits pass. The candidate is build evidence,
  expires, and remains outside GitHub Releases and Pages until a later manifest
  commit supplies the exact physical evidence required above.
- Keep the same-origin manifest and BIN as the browser's sole executable
  release source. GitHub Releases are provenance and alternate downloads; do
  not add a GitHub API or runtime asset dependency to the flasher.
- FrogAlert survey candidates keep unattended normal-mode GATT advertising off
  because BadgeMagic app commit `42c98bc` defaults to “any” and connects to the
  first matching `FEE0` advertiser without a chooser. Either short button must
  show the same Bluetooth animation, open an app-attention window, and pause
  surveying, so an accidental top-image/bottom-image mismatch cannot make
  uploads depend on the correctly routed download button. The view-button
  window expires back to its selected view; the system button retains ordinary
  download mode. A connection suspends surveys until disconnect; KEY2
  long-press ISP remains independent.
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
  V1.92, and `USBC_VERSION=1`. The `260404` default and `250901` legacy builds
  have the same 23 display nets and KEY2 path; only KEY1 pull, pressed polarity,
  and shutdown-wake edge differ. Their baseline/canary/survey sizes and hashes
  are locked independently. All are build evidence only. Rust ABI integration
  comes only after the profile-specific canary passes
  USB/app/button/recovery/power-cycle testing.
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
- The replacement private survey is built as independently locked `260404`
  and `250901` candidates. It treats a successful Central start as ready
  instead of depending only on that callback, consumes both live reports and
  the discovery completion list,
  and displays scan phases: `I` initializing, `R` ready/waiting, `S` scanning,
  no suffix for a completed result, `E` error, and `T` timeout. The nearest-USB
  view button rotates `Name 1 → Bluetooth counter → Name 2 → Bluetooth counter`: KEY1 on
  `260404`, KEY2 on `250901`. The other short press retains the system action;
  KEY1 long brightness and the independent long-KEY2 ISP task remain inherited. Surveys
  continue in either visible view. A CRC/profile-bound configuration enables
  built-in groups and up to eight custom rules. The bounded C mirror implements
  every README OUI/name row. The counter is one centered fixed frame; built-in
  and custom text alerts use at most two fixed pages held for one second each,
  then the selected view resumes after the last generated page. KARR
  requires a case-insensitive `QT ` prefix at the start plus a non-empty serial
  value. There is no unique Flipper
  OUI: official firmware derives a public MAC from STM32 identifiers, so an ST
  OUI would overmatch, and custom firmware can rename or spoof the device.
  Exact case-insensitive `LED Badge Magic` or advertised `0xFEE0` triggers
  three frogs in two alternating one-second frames. Passive scans may miss
  scan-response-only names, so the service fallback can false-positive another
  compatible `0xFEE0` advertiser. The C mirror remains temporary until the Rust
  ABI canary. The image starts a three-second passive window roughly every
  20 seconds while disconnected; a continuously present match can retrigger
  once in each new window. It caps and zeroes 64 addresses, restores
  advertising, cancels a stuck scan after five seconds, and preserves audited
  FOSSASIA USB/BLE/display/KEY2 symbols. Profile-specific view control keeps
  the physical button nearest USB as the
  counter selector: KEY1 on `260404`, KEY2 on `250901`. On `260404`, KEY2
  short press retains the normal system action and KEY2 long press retains ISP
  entry. The published beta `260404` image is 205,152 bytes at SHA-256
  `c6d06c59396aa6ffd6d1d9314cc4baf051c0205391c19a88bd749a31bface0d9`;
  the published beta `250901` image is 205,128 bytes at SHA-256
  `f9367fe16952f9f23758fd401f25ae6b0c22ec6cdab6f3893b1650d79173d5c9`.
  The fixed count frame uses the six-column, full-height Bluetooth rune from
  the first frame of FOSSASIA's pinned `src/res/bluetooth.xbm`, followed by the
  count and optional diagnostic phase.
  The user explicitly confirmed runtime, display, BadgeMagic upload, button
  behavior, and KEY2-only dot-to-ISP acceptance for the exact `260404` hash on
  2026-07-28, then confirmed both exact profile images working and directed
  their beta publication. Exact-hash CLI and WebUSB program/byte-verify
  transcripts remain missing and prevent stable promotion.
  FrogAlert completes frames in one of two private buffers and the final TMR0
  refresh selects the committed buffer while an overlay owns the panel.
  Marquee/flash/fixed/Bluetooth event handlers also consume queued work without
  rescheduling. The user confirmed both exact images working. They are
  published as `0.1.0-beta.1` top-button (`260404`) and bottom-button (`250901`)
  releases with explicit schema-2 user-confirmed evidence. Missing exact-hash
  CLI and WebUSB transcripts remain a stable-release limitation, not a beta
  blocker.
- The optional `frogs` lane retains the entire private survey/alert/app/recovery
  shell and changes only the alternate visible view: three fixed frogs
  alternate poses every 500 ms. Alerts and the BadgeMagic readiness cue stop
  that one-shot frame event and the selected frog view resumes afterward. Its
  visible app-readiness cue lasts one second while advertising remains open
  for ten, preventing repeated mode presses from indefinitely hiding the frog
  view. Its hardware-unverified locked images are 206,076 bytes:
  top/`260404` `61989dbf…e08c2fc`, bottom/`250901`
  `506c26e9…2cc9249`. Keep the entire
  frog-only event branch inside `FROGALERT_DANCING_FROG_MODE`; an empty
  runtime branch still changed the counter BIN by eight bytes and broke its
  locked CI hash.
- Current post-beta survey source adds mismatch recovery without changing the
  common LED map or KEY2/PB22 path. Until KEY1 is held, each image uses its
  compiled profile. The 50 Hz button scan then samples PA1 after a 2 us settle
  under pull-down and pull-up; four consistent `high/high` samples select
  `250901`, four `low/low` samples select `260404`, and the ordinary open
  `low/high` state selects nothing. A confirmed result corrects KEY1 polarity,
  both short-button roles, and shutdown wake for the current boot. The new
  consistent-cue either-button-attention 205,892-byte candidates are `260404`
  `dc2e7123d4882129abad2798773b93a2b3914fa8038c1527ffc5469258e4bacc`
  and `250901`
  `c98fc0f4c30793cce6bda998f7bbfb8b1428fa23804bb3bbd0d70308bacc19c5`.
  They pass locked ELF/BIN/vector/USB/BLE/display/KEY2 audits but are
  hardware-unverified. Test each on its matching board and deliberately
  cross-flashed board, including KEY2-before-detection, brightness,
  download/power/wake, and KEY2-only ISP, before release promotion.
- On 2026-07-23 the user reported that the latest image they had flashed was
  working well. Treat this as encouraging physical feedback, not release
  evidence: the last explicitly requested-and-observed flash was likely the
  preceding 201,628-byte animation-fix image (`8dff996d…19ebf7`), while the
  later KARR-capable `9d35de6a…c51a7` image has no recorded flash action. No
  exact candidate has a hash-bound CLI/WebUSB verify and recovery transcript.
- WCH discovery cancellation is asynchronous. Keep `scan_active` true until
  `GAP_DEVICE_DISCOVERY_EVENT` (or `bleIncorrectMode`) confirms the radio is
  idle; streaming, a peripheral connection, and download mode must request
  cancellation and defer advertising until that completion. Restore the last
  completed count after suspension so a cancelled `S` phase is never shown as
  a measurement. Clear an interrupted BadgeMagic streaming session on
  disconnect before resuming survey scheduling and advertising.
- On 2026-07-29 the user reported that Android BadgeMagic initially failed to
  connect to the adaptive bottom candidate and then began working after a
  delay. The GATT path was therefore not permanently broken. Treat this as an
  advertising/mode race until exact radio logs prove otherwise. A briefly
  tested always-on response was rejected because the Android app connects to
  the first matching `FEE0` advertiser, which is unsafe in a room of badges.
  Current source instead opens an app-attention window from either short button
  while retaining connection-suspension rules.
- The user observed survey-display flicker. Pinned FOSSASIA scanned 22
  Charlieplex source phases at roughly 45 Hz, which can be visible. The survey hook also
  called `stop_all_animation()` every 100 ms, clearing the live framebuffer and
  adding periodic blank/partial frames. The replacement stops animation only
  on display-ownership transition. Because original animation events may
  already be queued, patched handlers also consume their events without
  rescheduling while an overlay owns the panel. This addresses the competing
  scroll. The private survey lane now also ports
  `bkero/badgemagic-firmware` commit `074c448`: Timer 0 ticks at 16 kHz for
  about 182 complete frames per second and releases the matrix only on the
  first off-period tick. Baseline/canary timing remains unchanged. Treat the
  higher-rate image as hardware-unverified until BLE coexistence, brightness,
  current draw, USB/app uploads, display behavior, and KEY2 recovery pass on
  each exact profile.
- The user physically observed that FOSSASIA blink mode could still overwrite a
  `FLIPPER DETECTED` overlay despite the per-event scheduler guards. The
  replacement double-buffers FrogAlert's 44-column frames and switches the
  final `TMR0_IRQHandler` output away from the shared `fb` while FrogAlert owns
  the panel. This covers all `ANI_NEXT_STEP` base modes, marquee, flash/blink,
  and queued BLE animation writes. Streaming and non-normal system modes still
  deliberately relinquish display ownership.
- The user physically observed `FLIPPER`, `DETECTED`, then `FLIPPER` again.
  The preceding pager used a free-running 1.5-second reload event alongside a
  fixed three-second alert timer and wrapped its page index modulo page count,
  so a boundary event could redraw page zero. Alert timing must be relative to
  alert start: render frame zero immediately, schedule each later frame once at
  one-second intervals, never wrap, and end at `frame_count * one second`.
- The first fixed-page candidate physically rendered `FLIPPER` as
  `FLIFFER`-like text and produced malformed digits. FOSSASIA's `font5x7`
  table stores six columns: a blank lead-in at index 0 followed by five actual
  glyph columns. The initial static renderer copied indices 0–4 and therefore
  dropped the right edge of every glyph. The replacement copies indices 1–5;
  keep the regression assertion and re-prove text/count readability on the
  exact replacement hash.
- The user observed an app-sent animation shifted two columns right with the
  first two columns blank. This is not evidence of a pin-map error. BadgeMagic
  stable `v1.18.15` and development `42c98bc` encode an untrimmed 44-column
  bitmap as a 48-column wire frame with two blank columns at each side, while
  pinned FOSSASIA `9ce885d` advances `still()` frames by `LED_COLS` (44).
  Its first slice is therefore two blanks plus only 42 content columns, and
  later slices lose frame alignment. Normal text uses a different encoder
  path. The private survey build now changes only `ani_fixed` and
  `ani_animation`: every 48-column block must have blank columns 0, 1, 46, and
  47 before the helper uses a 48-column stride and copies inner columns 2
  through 45. Otherwise it preserves the original 44-column path. Host tests
  cover one and two padded frames plus fallback. This is still
  hardware-unverified; capture golden drawn, GIF, fixed-text, and
  special-animation payloads before extending other transition modes. Never
  apply a global framebuffer offset.
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
- Nyx documents newer marking `B1144C_260404`; FOSSASIA commit `696bbd71`
  changes KEY1/PA1 to pull-up, active-low, and falling-edge shutdown wake while
  retaining the exact `250901` USB-C display table and KEY2/PB22 behavior. An
  untouched switch is open on both boards and cannot passively identify the
  profile. The same electrical KEY2 is physically farther from USB on `260404`
  and nearest USB on `250901`. Case color is only a heuristic; require the
  printed marking.
- That board's pouch battery is soldered to PCB tabs; it has no removable
  connector. Leave the cell and its leads alone. The only documented first ISP
  entry from original/unknown firmware held KEY2 while a qualified operator
  momentarily bridged both ends of PCB capacitor C3; it is a hazardous
  rail-collapse maneuver, not battery handling or routine guidance. Never tell
  a user to pull, cut, or short the cell or imply that opening the case reveals
  a battery plug.
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
- A 2026-07-28 full-board photo confirms a second badge marked
  `B1144C_260404` with a readable CH582M package and soldered battery. Holding
  the nearer-to-USB button while bridging C3 repeatedly returned the OEM
  `0416:5020` application. Nyx's revision-specific instructions identify KEY2
  as the button farther from USB, explaining those resets. Do not transfer the
  `250901` physical position to `260404`. Holding the farther button while
  bridging C3 subsequently enumerated `4348:55e0` twice, and the board later
  booted FOSSASIA `LED Badge Magic` with HID and CDC ACM. This verifies the
  revision-specific ISP entry and an open-firmware boot, but no captured
  `wchisp` program/verify transcript binds the exact programmed BIN.
- FOSSASIA `BM1144-C fw: v0.1` has physically demonstrated KEY2-only long-press
  ISP entry with a visible dot cue on the photographed USB-C badge. Exact timing
  and a fresh kernel transcript were not recorded. Do not transfer that claim
  to unknown firmware or an unverified FrogAlert build; ordinary users must
  stop when the application hook is absent or broken, while qualified recovery
  follows the separately documented exact-board C3 boundary.
- Four 2026-07-22 kernel captures show `4348:55e0` ROM ISP disconnecting after
  about 9–13 seconds and the `0416:5020` application re-enumerating when no
  useful ISP operation kept the session active. Treat that transition as the
  normal ISP-entry window expiring, not as proof of a bad cable or bricked
  badge. Browser permission plus identify/config reads must complete promptly.
  For CLI testing, start `wchisp -r 30 ...` before the KEY2 long press so the
  tool is already polling when the dot cue appears.
- Android Chrome may expose WebUSB through a data-capable USB OTG connection;
  iPhone/iPad browsers do not. The Android path remains hardware-unverified.
- ISP can identify CH582, bootloader/configuration facts, and UID integrity. It
  cannot identify arbitrary installed firmware, PCB revision, matrix wiring,
  or board health. Optional Bluetooth Device Information strings are
  self-reported hints, not flash-content proof.
- The one-pane flasher recognizes a previously authorized `0416:5020`
  application descriptor as normal nametag mode, leaves its HID/CDC interfaces
  unopened, and shows the compatible-firmware KEY2/dot path. Treat that USB id
  only as a mode hint; exact target gating still begins after WCH ISP
  `4348/1a86:55e0` and the `0x82/0x16` Identify response. A never-authorized
  application still requires an explicit chooser tap.
- In public wizard copy, call `B1144C_250901` the **bottom-button image** and
  `B1144C_260404` the **top-button image**, with the badge display upright.
  Keep exact PCB identifiers canonical in manifests, evidence, and build
  tooling. If neither button works, stop; do not turn C3 into a public step.
- Open the application-mode WCH-only chooser from an explicit user tap before
  the button hold, then ask the user to select ISP as soon as it appears.
  Timers and attach events still must not call `requestDevice()`. Treat native
  chooser hot-plug behavior as unverified until a physical browser test.
- WebUSB and Web Bluetooth support varies by browser and operating system.
- USB permission or driver binding can block WebUSB even when the browser API
  exists; do not describe that as a firmware failure.

## Memory and skills

- Read `MEMORY.md` and `SKILLS.md` before important work.
- Put durable observations in `agent-memory/notes/` and dated outcomes in
  `agent-memory/logs/`.
- Use `skills/curator/` to decide when a repeated workflow belongs in a skill.
- Keep `AGENTS.md` canonical. `CLAUDE.md` and `GEMINI.md` are symlinks here.
