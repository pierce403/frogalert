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
- `scripts/record-firmware-release.mjs` — turns a successful canonical main-CI
  counter candidate into the exact public top/bottom release descriptor pair
- `scripts/require-firmware-version-bump.mjs` — requires active firmware
  changes to advance the immutable release version
- `firmware/fossasia-usbc/version.json` — semantic and compact firmware
  versions embedded before the cloud candidate build
- `scripts/materialize-firmware-artifacts.mjs` — retrieves one exact attested
  Actions candidate, or after artifact expiry verifies the immutable published
  GitHub Release assets, before materializing bytes under `tmp/`
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
- `index.html` — public landing page and manifest-driven latest release card
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
- Start downloading and validating the atomic published top/bottom pair as soon
  as `/flash/` loads. Show both artifacts' profile, hash, provenance, and
  hardware status, including the hardware-unverified disclosure, but never gate
  preparation or ISP entry on checkboxes, a typed phrase, or a separate review
  step. After ISP identification, the user's explicit top/bottom answer binds
  the corresponding profile and PCB marking.
- The first destructive step must reset CH58x protection/configuration with
  command `0xA8` and require an accepted `0xA7` readback before erase. The
  allowlist is deliberately narrow: either the exact 12 requested bytes
  `ff ff ff ff ff ff ff ff 4f ff 0f d5`, or the physically documented
  CH582/BTVER 02.40 canonical readback
  `ff ff ff ff ff ff ff ff 4f 3f 0f 45`. The latter is the CH582
  normalization recorded before a successful BadgeMagic flash in
  [FOSSASIA issue #110](https://github.com/fossasia/badgemagic-firmware/issues/110).
  Every other value must stop before `0xA4` erase. This remains stricter than
  pinned upstream `wchisp` commit
  [`cefd870`](https://github.com/ch32-rs/wchisp/commit/cefd8707df345f1fbd7795e15367281f440bbf05),
  which validates the `0xA8`/`0xA7` command responses but does not compare the
  returned register bytes.
- Never erase or write merely because a device connected. Once an authorized
  WCH ISP device is available, claim it and immediately run the read-only
  `0xA1` Identify plus `0xA7` Read Config exchange equivalent to the useful
  portion of `wchisp info`; do not put a manifest fetch or UI question ahead of
  those commands. The post-info **Top button** or **Bottom button** answer is
  the sole in-page destructive consent and must immediately start only the
  already validated matching image. Do not require any earlier acknowledgement
  or any later confirmation.
- Make the routine KEY2 guide the first visible instruction while background
  preparation runs: with the display upright, hold either **Top** or **Bottom**
  for about 2.2 seconds, remember which one worked, and release when one dot
  lights near the middle. For first-time WebUSB permission, wait until the pair
  is ready, tap **Start watching for ISP** to open the WCH-only chooser, then
  perform that hold and select the WCH ISP device promptly. A remembered WCH
  permission may auto-detect the attach. Top maps to `260404` (KEY2 farther
  from USB) and Bottom maps to `250901` (KEY2 nearest USB). Offer this only for
  compatible FOSSASIA or FrogAlert firmware. State plainly that an
  automatically published CI-audited
  release may not have a physical recovery smoke. Original or unknown firmware on the
  confirmed USB-C board must reach an ordinary-user stop boundary; its
  documented C3 entry is hazardous expert recovery, not a browser checklist.
  Timers and USB attach events must never call `requestDevice()`; only an
  explicit chooser action may request new permission. An already authorized
  ISP attach may run the read-only info exchange automatically, but never a
  configuration write, erase, or program command.
- Keep every destructive browser action restricted to `/flash/`; the landing
  lab may inspect a badge or artifact but contains no program control.
- Bind an active flash to the captured USB device and prohibit reconnecting a
  replacement device until that session exits. Require an exclusive Web Lock
  before `0xA8`; a missing or denied lock must fail closed.
- Always verify the programmed bytes before reporting success.
- Local build outputs stay under ignored `tmp/`; never commit generated BIN/ELF
  bytes for a new version. The standard counter top/bottom pair publishes
  automatically after canonical main CI builds and audits both profiles,
  records exact BIN/ELF hashes and candidate metadata, passes the quarantine
  check, and receives GitHub provenance attestations. Such descriptors must
  remain truthful: `hardware_verified: false`, `verification_basis:
  ci-audited`, and `flash_approved: true`. One descriptor covers exactly one
  profile and one physical PCB marking. Physically tested releases may retain
  their hash-bound `firmware/evidence/*.json` record; labs and the third-party
  recovery image keep their existing physical gates. Never fabricate hardware
  evidence to make a release flashable.
  `firmware/quarantine.json` is a permanent SHA denylist checked during site
  assembly and after hashing any browser-selected local file. If the browser
  cannot load that registry, artifact preparation must fail closed.
- Every FrogAlert image must preserve FOSSASIA's application-level KEY2 task
  during normal runtime and recoverable screen off. The bootloader remains the CH582 mask-ROM ISP;
  do not bundle or replace it. Keep the proven 200 ms cadence, more-than-ten
  held samples (about 2.2 seconds), dot cue, and address-zero transfer intact.
  Record enumeration as `4348:55e0`/`1a86:55e0` and short-press safety when the
  exact physical artifact is tested; until then keep hardware status false.
- Every packaged CH58x BIN must contain WCH's startup sentinel `0xF5F9BDA9`
  in the reserved core-vector word at raw offset `0x14`. The FOSSASIA shell
  emits it directly and its audit must observe it without post-build mutation.
  The historical standalone Rust path used `scripts/finalize-firmware.mjs` to
  replace a zero, but that did not make its runtime valid. Site assembly still
  rejects a missing word. The sentinel is not proof of recovery; post-link
  audits must also verify vector placement and actual handler targets.
- Do not log, persist, or transmit scanned device identifiers. Retain only the
  ephemeral per-window addresses needed for deduplication, then zero them.
- `tools/ble-probe.py` compares BlueZ discovery with raw-HCI passive and active
  windows. Keep its output anonymous and RAM-only; Meta/Luxottica company IDs
  and Meta service IDs remain research hints until physical field evidence
  supports a narrow firmware rule. Luxottica `0x0D53` is `53 0D` on the wire.
  Never print BlueZ `Alias`: it defaults to a formatted device address when no
  advertised name exists. Suppress address-shaped `Name` values as defense in
  depth. `--stop-on-candidate` must exit the current window after printing the
  first configured indicator; a passive `compare` match must skip active scan.
  Python 3.14 Linux raw HCI should bind the integer `device_id` directly; its
  one-element tuple returned `EINVAL` on the first physical comparison attempt.
  Linux `struct hci_filter` has 14 bytes of fields but a 16-byte ABI size, so
  `hci_event_filter()` must retain two trailing padding bytes. Retain
  operation-specific socket/filter/command errors until root raw mode is
  physically verified.
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

Canonical CI currently uses Rust 1.98 even when an older local stable toolchain
is selected. Keep constant-width advertisement parsing on slice
`as_chunks::<N>()`; CI denies the Rust 1.98 `chunks_exact_to_as_chunks` lint.

The pinned firmware lanes are heavier, explicit checks rather than ordinary
host verification:

```bash
./scripts/build-fossasia-usbc baseline --check
./scripts/build-fossasia-usbc canary --check
./scripts/build-fossasia-usbc survey --candidate
./scripts/build-fossasia-usbc frogs --candidate
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --candidate
./scripts/build-fossasia-usbc B1144C_250901_USB_C frogs --candidate
```

The omitted profile selects default `B1144C_260404_USB_C`. An active-firmware
`main` commit runs both survey variants for both profiles after the ordinary CI
contract and uploads one expiring `frogalert-candidate-<commit>` Actions
artifact with separate counter and `frogs` directories. Candidate metadata
remains raw build evidence with `hardware_verified`, `flash_approved`,
`publishable`, and `hosted_on_site` false. After the build and attestation jobs
succeed, the post-CI publication workflow generates a separate CI-audited,
flash-approved release descriptor for the standard counter pair and publishes
those exact candidate bytes.
The GitHub candidate job uses `--candidate`, so new survey/frog outputs are
calculated receipts rather than pre-build lock inputs. It retains every
source/toolchain/vector/ELF/BIN/profile audit, records GitHub run provenance,
attests the output, and keeps the archive for 90 days. Published releases remain
rebuildable after that window from their exact hash-checked GitHub Release
assets. `workflow_dispatch`
builds a missing current version or reconciles an already published pair.
Local `--check` remains the exact current
baseline/canary lock regression command; active survey/frog source uses
`--candidate` and records calculated receipts.
Successful local builds also copy the audited bytes to
`frogalert-top-b1144c-260404.{bin,elf}` or
`frogalert-bottom-b1144c-250901.{bin,elf}` in the matching profile directory.
Candidate-bundle filenames include the same `top` or `bottom` token.

The first single-profile live candidate run, Actions run `30069161224` for
commit `af83fbb`, passed on 2026-07-23. Downstream run `30069244999` correctly
published no firmware release and deployed byte-exact site assets. This
verifies the automation boundary, not the current dual-profile candidate or
physical firmware.

The first dual-profile, dual-lane schema-3 run, Actions run `30827723476` for
commit `87f2d47`, passed on 2026-08-03, including `publication-assets` and
`attest-candidate`. Artifact `8861601465` has archive digest
`sha256:d51899a5…6d245e`, expires 2026-11-01, and its four cloud BIN hashes
exactly match the local receipts recorded below. Release/Pages run
`30827863178` passed and deployed the cleaned site while correctly retaining
`0.1.0-beta.1` as latest. This verifies the candidate/archive/attestation and
deployment paths, not the new bytes on physical hardware or schema-5
promotion.

The first public beta shipped from commit `8f1aeca` on 2026-07-29. CI run
`30427180021` passed; release/Pages run `30427231242` published
`v0.1.0-beta.1` and deployed both same-origin BINs. Post-deploy downloads
matched the locked `260404` SHA `c6d06c59…face0d9` and `250901` SHA
`f9367fe1…73d5c9`; the live flasher loaded both descriptors without console
errors or a file input. This proves release/catalog delivery, not a physical
WebUSB program/verify run.

The beta.14 BadgeMagic-upload repair shipped from source commit `def237a` on
2026-08-25. CI run `32920470321` passed all four candidate builds and
attestation; artifact `9589689389` has digest
`sha256:a65c7631…01b4`. Publication/Pages run `32920695348` created metadata
commit `83384c6`, published `v0.2.0-beta.14`, and deployed the atomic pair.
Post-deploy same-origin downloads matched top SHA `c46504ff…696f` and bottom
SHA `e4ff5103…fcda`, and `/flash/` returned HTTPS 200 with the CI-audited
hardware disclaimer. This proves delivery of the repair bytes, not Android
upload behavior or physical recovery on either board.

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
  SHA-256, clear any prepared-flash binding, and mark every configured derivative
  hardware-unverified. Never use configuration to change hardware profile.
- When a FrogAlert overlay owns the display, consume already queued original
  animation events without rescheduling them; release the selected base view
  only after the final one-second alert frame expires.
- Survey builds treat a nametag list as blank only when every loaded bitmap
  pixel is zero. At boot and after BadgeMagic reloads, replace that empty list
  in RAM with scrolling `503.PARTY`; never persist the fallback or override any
  nonblank uploaded bitmap.
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
- Keep `/flash/` as a one-pane wizard: validate and retain both published
  profile images in the background without an acknowledgement gate, first
  instruct the user to hold Top or Bottom to enter ISP, connect and immediately
  run read-only ISP info, ask which button produced ISP, then flash/verify the
  matching image and show a terminal result. The top/bottom answer itself is
  the sole in-page consent and final destructive activation; do not add
  checkboxes, a typed phrase, a review step, another Continue, or another
  confirmation prompt.
  `getDevices()` may automatically identify one
  previously authorized WCH ISP badge; a new badge still needs an explicit
  chooser tap, and USB attach must never synthesize `requestDevice()`. Keep
  unrelated Bluetooth, catalog, and diagnostic surfaces out of the visible
  flasher. Do not include a file input anywhere in `/flash/`, even hidden;
  profile and marking controls must not be visible in the public wizard. If
  the complete published pair cannot be downloaded and verified before entry,
  or the user cannot say which top/bottom button produced ISP, stop without
  offering a developer BIN. Do not infer the profile from the guide state or
  silently reuse a previous answer.
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
  source commit, exact profile/PCB binding, build provenance, and release notes.
  Hardware smoke evidence is required to claim `hardware_verified: true`, not
  to publish a CI-audited beta.
- Manifest schema 5 lists `v0.1.0-beta.1` as the only legacy
  repository-backed tag. Every new release descriptor must bind the exact
  GitHub Actions run id/attempt/workflow path, artifact id/name/digest,
  candidate-metadata digest, firmware variant, and lane. Publication accepts
  only a successful canonical `main` CI run, verifies attestations, and
  materializes those bytes under `tmp/`; never commit a freshly built
  FrogAlert BIN/ELF for a new version.
  `workflow_run_attempt` records the attempt that produced the candidate
  artifact. If GitHub retries only a failed downstream attestation job, accept
  a successful latest attempt of the same run only when it is not older than
  that artifact attempt; do not claim the artifact was rebuilt by the retry.
- Each published firmware version is an atomic pair: one top/`260404` image
  and one bottom/`250901` image. Site assembly and the browser catalog must
  fail closed on a partial or duplicate pair so “latest” cannot silently mean
  different versions on different boards.
- Ordinary CI runs source/unit checks without remote release bytes, then a
  separate non-PR `publication-assets` job with scoped Actions/attestation read
  access materializes and verifies them. Pages additionally requires its
  triggering workflow path to be exactly `.github/workflows/ci.yml`; a display
  name of `CI` is not a trust identity. Before checkout, a read-only ref gate
  must also prove that the triggering SHA is still `refs/heads/main`, so an
  older CI run that finishes late cannot redeploy stale source.
- Successful firmware-changing `main` commits automatically turn the exact
  canonical CI counter candidate into an atomic schema-v5 descriptor pair.
  The publication workflow revalidates the run, artifact digest, receipt,
  hashes, quarantine status, and attestations, creates a CAS-safe metadata
  commit, publishes through a verified draft, and finishes GitHub Release
  reconciliation before Pages exposes the same bytes. A website-only run is a
  successful firmware no-op when the current version's pair already exists; if
  an earlier publication race left that pair missing, the newer `main` run
  rebuilds it without requiring a false version bump.
- Active firmware changes produce a commit-bound Actions candidate only after
  the locked embedded build audits pass. The raw candidate remains build
  evidence; separate release descriptors explicitly authorize its standard
  counter pair for public phone flashing while keeping hardware status false.
- Keep the same-origin manifest and BIN as the browser's sole executable
  release source. GitHub Releases are provenance and alternate downloads; do
  not add a GitHub API or runtime asset dependency to the flasher.
- Phone/cloud edits and candidate builds use `workflow_dispatch` when needed.
  The standard counter pair becomes same-origin and phone-flashable after the
  successful post-CI publication flow; the browser must show that a CI-audited
  release is not the same as a physical hardware smoke.
- FrogAlert survey candidates keep unattended normal-mode GATT advertising off
  because BadgeMagic app commit `42c98bc` defaults to “any” and connects to the
  first matching `FEE0` advertiser without a chooser. Preserve the user's
  physical-position roles with compile-time profile routing: the bottom button
  changes only the name/count or name/frog view and must never advertise; the
  top button cycles normal → persistent download → recoverable application
  screen off → normal. That means KEY1 view/KEY2 system on `260404`, and KEY2 view/KEY1
  system on `250901`. A physical-bottom hold changes brightness on both: KEY1
  uses the upstream 25-sample action on `260404`; KEY2 on `250901` queues
  brightness only when released after 25 through 99 samples, preserving a
  continuous roughly 2.2-second hold for ISP. Never infer or adapt the profile
  at runtime. A connection suspends surveys until disconnect. Screen off must
  disable advertising and discovery, stop display refresh, release matrix
  drive, and retain the button/TMOS/USB/KEY2 recovery tasks. Do not restore
  beta.12's hardware-shutdown/early-wake integration: the owner A/B-tested an
  Android BadgeMagic name-upload regression against working beta.11.
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
- The replacement survey is built as independently locked `260404`
  and `250901` candidates. It treats a successful Central start as ready
  instead of depending only on that callback, consumes both live reports and
  the discovery completion list. The counter displays only the last completed
  result, holds it throughout the next scan, and keeps initialization, scan,
  error, and timeout state in debug output. The physical bottom button rotates
  `Name 1 → Bluetooth counter → Name 2 → Bluetooth counter` on both profiles;
  this compiles as KEY1 on `260404` and KEY2 on `250901`. The physical top
  button compiles as the other key and cycles normal, download, recoverable
  screen off, and normal. Physical-bottom brightness is likewise consistent:
  `260404` keeps the upstream KEY1 action after 25 samples, while `250901`
  defers KEY2 brightness until release after 25 through 99 samples. A
  continued KEY2 hold remains reserved for the independent unchanged ISP task.
  Surveys
  continue in either visible view. A CRC/profile-bound configuration enables
  built-in groups and up to eight custom rules. The bounded C mirror implements
  every README OUI/name row. The counter is one centered fixed frame; built-in
  and custom text alerts use at most two fixed pages held for one second each,
  then the selected view resumes after the last generated page. KARR
  requires a case-insensitive `QT ` prefix at the start plus a non-empty serial
  value. There is no unique Flipper
  OUI: official firmware derives a public MAC from STM32 identifiers, so an ST
  OUI would overmatch. BLESPloit commit `6d940b5` instead matches official
  serial-profile services `0x3081`, `0x3082`, and `0x3083`; Flipper firmware
  commit `11c1012` derives those by ORing hardware color 1/2/3 into `0x3080`
  and places the UUID in the primary advertisement. FrogAlert mirrors that
  passive signal and retains the case-insensitive name fallback.
  A physical Linux raw-passive run on 2026-08-01 observed Meta company ID
  `0x01AB` and service `0xFD5F` together in one report at RSSI -69 with AD
  types `01,03,FF`. The Ray-Ban target now requires that exact same-report pair
  when no name is present; either marker alone is ignored. This is a
  product-family hint that works with randomized addresses, not identity proof.
  Exact case-insensitive `LED Badge Magic` or advertised `0xFEE0` triggers
  three frogs in three one-second frames using two alternating poses. Detector
  priority is fixed per survey window: frogs, KARR, COP, Flipper, then custom;
  only a strictly higher-priority later result may replace the active overlay.
  Passive scans may miss
  scan-response-only names, so the service fallback can false-positive another
  compatible `0xFEE0` advertiser. The C mirror remains temporary until the Rust
  ABI canary. The image starts a three-second passive window roughly every
  20 seconds while disconnected; a continuously present match can retrigger
  once in each new window. It caps and zeroes 64 addresses, restores
  advertising, cancels a stuck scan after five seconds, and preserves audited
  FOSSASIA USB/BLE/display/KEY2 symbols. Current source binds physical button
  roles to the compiled exact artifact and does not attempt cross-profile
  compatibility. The published beta `260404` image is 205,152 bytes at SHA-256
  `c6d06c59396aa6ffd6d1d9314cc4baf051c0205391c19a88bd749a31bface0d9`;
  the published beta `250901` image is 205,128 bytes at SHA-256
  `f9367fe16952f9f23758fd401f25ae6b0c22ec6cdab6f3893b1650d79173d5c9`.
  The fixed count frame uses the six-column, full-height Bluetooth rune from
  the first frame of FOSSASIA's pinned `src/res/bluetooth.xbm`, followed by the
  count with no diagnostic suffix.
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
  alternate poses every 500 ms. Alerts stop that one-shot frame event and the
  selected frog view resumes afterward. The profile-mapped physical bottom
  button selects the frog view with no advertising or Bluetooth-animation side
  effect; the physical top button owns download and screen-off modes. The
  preceding pre-boot-status reference images were 206,304 bytes:
  top/`260404` `5c69637a…00ea8ce`, bottom/`250901`
  `5634194f…7964bd`. Keep the entire
  frog-only event branch inside `FROGALERT_DANCING_FROG_MODE`; an empty
  runtime branch still changed the counter BIN by eight bytes and broke its
  locked CI hash.
- The held-KEY1 mismatch probe is rejected. A physical `0.2.0-beta.4` bottom
  test showed that open PA1 on `250901` could be classified as `260404`, which
  swapped the short-button roles and made bottom/near-USB KEY2 enter persistent
  BadgeMagic download mode instead of selecting the counter. Current source
  always uses the artifact's compiled KEY1 polarity and fixed physical roles;
  it performs no runtime probing or cross-profile correction. Exact
  printed-marking/profile selection is mandatory and
  cross-profile flashing is not repaired at runtime. The preceding
  blank-fallback, Meta-pair, and stable-counter 206,216-byte candidates were `260404`
  `a3cb748194965c2f2aa54ec541df02e66c3f38f8e375179f620a2cae9bcc444e`
  and `250901`
  `cb2780b1f11818f4560fd14d01dfa1e32ab7317766cb9dc876d428fc7df0706a`.
  They pass locked ELF/BIN/vector/USB/BLE/display/KEY2 audits but are
  hardware-unverified. Test each corrected image on its matching board,
  including brightness, both short-button roles, download/power/wake, and
  KEY2-only ISP, before claiming hardware verification.
  The `0.2.0-beta.5` local calculated receipts are counter top
  `005525cd…6f62a45`, counter bottom `5c465e59…18f4cce` (both 200,576 bytes),
  frogs top `92bd6ea0…18c93989`, and frogs bottom `c6b0a008…e54f0e4d`
  (both 200,660 bytes). Canonical CI must independently reproduce and attest
  the standard counter pair before website publication.
  The simplified upstream-role `0.2.0-beta.6` local calculated receipts are
  counter top `4388b70f…548db2be`, counter bottom
  `dafaba93…f78cd7ad` (both 200,420 bytes), frogs top
  `889306ca…40d238a`, and frogs bottom `90c28cc4…1ba3430` (both 200,508 bytes).
  These are build evidence only until physical retest; canonical CI must
  independently reproduce and attest the standard counter pair.
  The no-shutdown `0.2.0-beta.7` local calculated receipts are counter top
  `d60fc693…dcb9f9d`, counter bottom `c8af928a…950f65d` (both 200,468 bytes),
  frogs top `55b5cb13…c81345a0`, and frogs bottom `4380b3a2…62419203` (both
  200,552 bytes). These are build evidence only until physical retest;
  canonical CI must independently reproduce and attest the standard pair.
  The strict upstream-role `0.2.0-beta.8` local calculated receipts are counter
  top `f679dafd…35df88c`, counter bottom `7974b245…f6d28ae1` (both 200,148
  bytes), frogs top `61d8f495…75fb57fe`, and frogs bottom
  `33ace6e6…022c0fba` (both 200,220 bytes). These are build evidence only until
  physical retest; canonical CI must independently reproduce and attest the
  standard pair.
  The physical-position/recoverable-off `0.2.0-beta.9` local calculated
  receipts are counter top `bb6d3f15…5a29259`, counter bottom
  `f0e40355…343f059` (both 200,340 bytes), frogs top
  `f486da88…040c9346`, and frogs bottom `88fcea61…f427b42` (both 200,412
  bytes). Main compiled the intended physical-position role mapping, but the
  button module did not include the header defining the symbolic profile
  constants. In the bottom build its `#if` therefore silently selected top
  active-low KEY1 polarity and top shutdown-wake configuration. Do not use
  beta.9 as evidence of corrected bottom buttons.
  The bottom-brightness `0.2.0-beta.10` local calculated receipts are counter
  top `22806e43…525c136` (200,340 bytes), counter bottom
  `441495ed…4ad00b3a` (200,348 bytes), frogs top
  `89839dea…0ccf696` (200,412 bytes), and frogs bottom
  `9bcf2013…265f7b0` (200,420 bytes). The button header now imports the profile
  constants and fails compilation for a missing or unsupported profile. The
  bottom disassembly reads KEY1 active-high and compares KEY1 holds against
  125 samples while leaving KEY2 at 25; top keeps the upstream 25-sample
  comparison. Factory-firmware testing then proved brightness belongs on the
  physical bottom button on both boards, so beta.10 publication run
  `31054218095` was cancelled before release, manifest commit, or Pages deploy.
  Do not publish or recommend beta.10.
  The factory-position `0.2.0-beta.11` local calculated receipts are counter
  top `34f80b9b…bd68a` (200,344 bytes), counter bottom
  `97923b1f…9e33` (200,376 bytes), frogs top
  `ca33c4a9…4b1bc7` (200,416 bytes), and frogs bottom
  `48a48978…877d4c` (200,448 bytes). Linked disassembly proves top brightness
  maps to KEY1, bottom brightness maps to KEY2, and only the bottom image
  contains the 25-through-99-sample release window. These remain
  hardware-unverified until physical retest; canonical CI must independently
  reproduce and attest the standard pair.
- Current source version is declared in `firmware/fossasia-usbc/version.json`.
  Survey/frog boot now renders an unconditional compact `FOSSASIA` credit,
  compact FrogAlert version, and compile-time top/up or bottom/down marker;
  the full semantic version is exposed through BLE Device Information. The
  boot battery frame uses a first-sample discard, WCH rough ADC calibration,
  clamped fixed-point millivolts, and bounded approximate percentage shared
  with Battery GATT. The pre-CI `0.2.0-beta.1` receipts are counter top
  `cd546bc16b4c310d60f46ada0a5ab57cace3b95231242d14c6b934f6e4700022`,
  counter bottom
  `054c6ebd158f982f1045e9293041181fbc97c14f7f04e37ef97636fc2d220621`,
  frogs top
  `76a43c8320325f2b3ccf56e3a9022914d59c4e88088db60804f1217d95b23bda`,
  and frogs bottom
  `ef6da5d1eeaa889922d80441ca9e0aceb8a40d0ba0b8b8eb5ac147ef6619bdd2`.
  GitHub must reproduce/attest the exact commit-bound bytes. Those receipts
  remain hardware-unverified until both
  boards confirm voltage, percentage, text, arrow orientation, app upload,
  and KEY2 recovery.
- Current source declares `0.2.0-beta.14` / `v0.2.0b14`. The owner reported
  that Android BadgeMagic name upload works on beta.11 and fails on beta.12.
  The GATT service, `FEE1` write handler, and legacy parser did not change in
  that interval; beta.12's only firmware runtime delta was its unverified
  hardware-shutdown/early-wake integration. Beta.14 removes that delta and
  restores beta.11's recoverable application screen off: disable advertising
  and discovery, stop TMR0/matrix drive, retain TMR3/TMOS/USB and the unchanged
  200 ms KEY2 recovery task. Treat the causal boundary as established by the
  physical A/B report, but keep the exact beta.14 fix hardware-unverified until
  an Android upload succeeds on the reporting board. Per the owner's 2026-08-03 policy
  decision, a successful canonical CI build automatically publishes the
  standard top/bottom counter pair for phone flashing with
  `hardware_verified: false`, `verification_basis: ci-audited`, and
  `flash_approved: true`; physical evidence remains a separate status upgrade.
  Local beta.14 receipts are counter top
  `c46504ff4cdebdeaadb067b3248bf4c354426666de24566b4a641062c718696f`
  (200,344 bytes), counter bottom
  `e4ff5103de8c3823e0e992f010cf14f387e5b66babd14076f6c0a1c48a4cfcda`
  (200,376 bytes), frogs top
  `7ec823232c94fa8f3e65ba7f5614a332df7c0e5f572312905d9dde52c9ce4f2c`
  (200,416 bytes), and frogs bottom
  `869ca9990a7622deca75c2da83ad9a11cdc1821311de01ef76cd068dec5acb65`
  (200,448 bytes). Canonical CI must independently reproduce and attest the
  standard pair before publication.
- On 2026-08-01 the user physically observed a bottom-profile counter appear
  blank for about ten seconds, then alternate between `11` and an apparent
  three-digit value before a Flipper overlay restored `11`. The counter caps at
  64; the apparent `115` was the live `11 S` scan-phase suffix. Current source
  removes all on-panel phase letters, retains the last completed count during a
  scan, commits only the completed result, and applies the existing one-second
  visible app cue to both counter and frog lanes while leaving the radio window
  open for ten seconds. This replacement remains hardware-unverified.
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
  Current source retains persistent download mode only on the profile-mapped
  physical top/system button and removes the rejected bounded app-attention
  window from the physical bottom/view button. Only the top button shows the
  Bluetooth cue; connection-suspension rules remain.
- On 2026-08-05 the user reported that exact `0.2.0-beta.5` on the bottom badge
  produced download then power-off from the near-USB button, while repeated
  short presses on the other button inconsistently changed brightness before
  eventually selecting the counter. This behavior contradicts the intended
  profile-position wrappers. The beta.6 response removed those wrappers and
  kept logical KEY roles identical, but beta.8 testing later proved that choice
  broke physical-position consistency on the top badge. Do not restore the
  unsafe runtime probe; use the beta.11 compile-time mapping and fail-closed
  profile include instead.
- On 2026-08-05 exact bottom `0.2.0-beta.6` showed that two KEY1 short presses
  deliberately followed FOSSASIA's `NORMAL → DOWNLOAD → POWER_OFF` cycle, but
  the profile-specific KEY1 shutdown edge did not wake the badge. Once shut
  down, the application-level 200 ms KEY2 poll was no longer running, so KEY2
  could not enter ISP; attaching USB caused a full reboot. Beta.7 avoided all
  off behavior; beta.9 instead implements a recoverable application-level
  screen-off state that stops the LED timer and drive but not button/TMOS/ISP
  tasks. Beta.12 supersedes that workaround: route shutdown only through the
  radio-idle/common-task gate and preserve recovery through the marked early
  more-than-ten-sample KEY2-to-address-zero qualifier.
- On 2026-08-05 exact bottom `0.2.0-beta.7` showed the Bluetooth animation and
  enabled advertising on a KEY2 display/count press. The electrical mapping was
  correct; `frogalert_key2_transition()` still called the cross-image
  compatibility `frogalert_survey_open_app_window()`. The owner rejected that
  compatibility behavior. Beta.8 removed the app-window API, timers, and
  display callbacks, but incorrectly standardized logical KEY roles. Current
  tests must reject advertising and Bluetooth-animation calls from either
  profile's physical-bottom view transition.
- On 2026-08-05 exact top `0.2.0-beta.8` showed the physical top button changing
  the name/count view, and the owner also confirmed that losing screen off was
  unacceptable. Root cause was the logical KEY1/KEY2 standardization: physical
  positions differ between the exact board profiles. Beta.9 restores only fixed
  compile-time position mapping (`260404`: KEY1 view, KEY2 system; `250901`:
  KEY2 view, KEY1 system), with no runtime probe or cross-image compatibility.
  Beta.9 and beta.11 used application screen off. Beta.12 replaced it with
  hardware shutdown and early KEY2 qualification, then regressed Android
  BadgeMagic name upload in the owner's beta.11/beta.12 A/B test. Beta.14
  restores the beta.11 runtime boundary; do not reintroduce hardware shutdown
  without a staged app-upload and recovery smoke on both profiles.
- On 2026-08-05 the owner tested factory firmware on both exact boards and
  confirmed identical physical roles: bottom controls brightness, while top
  enters Bluetooth listening and then turns the screen off. This supersedes
  the beta.10 assumption that bottom/`250901` physical-top KEY1 should own
  brightness. Beta.11 routes brightness to physical bottom on both profiles;
  because `250901` physical bottom is also KEY2 recovery, it classifies a
  released roughly 0.5-to-2-second hold as brightness and leaves a continuous
  roughly 2.2-second hold for ISP.
- On 2026-08-05 the user reported that `0.2.0-beta.3` top firmware sometimes
  remains on the Bluetooth readiness animation after a bottom-button counter
  selection. The one-second `SURVEY_APP_CUE_END_EVENT` restores the selected
  view only when `peripheral_is_connected()` is false; a fast BadgeMagic
  connection, or a fail-closed GAP state read, consumes the one-shot timeout
  without clearing `app_cue_active`. Disconnect normally restores the view,
  but an enduring connection can therefore look stuck. Existing tests check
  only that the timeout and restoration call exist, not the connected-timeout
  transition. Reproduce with the app/nearby phones disconnected before changing
  the display-versus-radio ownership contract.
- The `0.2.0-beta.4` source fix makes cue expiry independent of peripheral
  connection state: both the one-second cue event and ten-second window fallback
  restore the selected view, while `frogalert_display_app_attention_end()` still
  leaves active bitmap streaming alone. Focused tests isolate both event blocks
  and reject a reintroduced connection gate in the one-shot cue timeout. This
  is source/build evidence until the top badge reproduces the former fast-client
  timing and confirms restoration during a live BadgeMagic connection.
  Local calculated receipts are counter top `b65e3aeb…d3df21`, counter bottom
  `ca1b08f7…11de21` (both 200,876 bytes), frogs top `9aa37412…9f8c1`, and
  frogs bottom `da185980…1715fc` (both 200,960 bytes). Canonical CI must
  independently reproduce and attest the standard counter pair before the
  website publishes it.
- The user observed survey-display flicker. Pinned FOSSASIA scanned 22
  Charlieplex source phases at roughly 45 Hz, which can be visible. The survey hook also
  called `stop_all_animation()` every 100 ms, clearing the live framebuffer and
  adding periodic blank/partial frames. The replacement stops animation only
  on display-ownership transition. Because original animation events may
  already be queued, patched handlers also consume their events without
  rescheduling while an overlay owns the panel. This addresses the competing
  scroll. The survey lane now also ports
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
  path. The survey build now changes only `ani_fixed` and
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
  badge. Browser permission plus the `0xA1` Identify and `0xA7` Read Config
  exchange must complete immediately after the interface is claimed; that is
  the browser's `wchisp info` equivalent and buys time for the already prepared
  image rather than spending the window on network fetches or profile UI.
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
  tooling. Ask for this answer only after the read-only ISP info exchange. Its
  clearly destructive Top/Bottom control is the user's final action and must
  immediately promote the matching prevalidated bytes into the captured-device
  flash/verify session. If neither button worked or the user is unsure, stop;
  do not turn C3 into a public step.
- Lead with the Top/Bottom hold instruction, but for first-time permission wait
  for pair-ready, then open the WCH-only chooser from one explicit **Start
  watching for ISP** tap before the physical hold. Keep it open while the user
  holds a button, releases at the dot, and selects WCH promptly. An authorized
  attach proceeds automatically. Only the post-info Top/Bottom answer binds the
  profile. Timers and attach events still
  must not call `requestDevice()`, although an authorized attach may run the
  read-only info exchange. Treat native chooser hot-plug behavior as unverified
  until a physical browser test.
- WebUSB and Web Bluetooth support varies by browser and operating system.
- USB permission or driver binding can block WebUSB even when the browser API
  exists; do not describe that as a firmware failure.

## Memory and skills

- Read `MEMORY.md` and `SKILLS.md` before important work.
- Put durable observations in `agent-memory/notes/` and dated outcomes in
  `agent-memory/logs/`.
- Use `skills/curator/` to decide when a repeated workflow belongs in a skill.
- Keep `AGENTS.md` canonical. `CLAUDE.md` and `GEMINI.md` are symlinks here.
