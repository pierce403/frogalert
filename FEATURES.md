# FrogAlert feature and readiness tracker

Last reviewed: 2026-07-28

This is the source of truth for requirements, implementation status, acceptance
evidence, and release gates. Update it in the same change that alters a feature.
Do not promote a row based only on plausible code or a successful API call.

## Status legend

| Status | Meaning |
| --- | --- |
| **SHIPPED** | Implemented, verified at the stated layer, and available on `main`. |
| **PROTOTYPE** | Implemented enough for controlled testing, but missing required hardware or compatibility evidence. |
| **IN PROGRESS** | Active implementation exists but the acceptance contract is incomplete. |
| **PLANNED** | Required and designed, with no complete implementation yet. |
| **BLOCKED** | Required, but a named external input or physical test prevents progress. |
| **DEFERRED** | Intentionally outside the current milestone. |
| **REJECTED** | Considered and explicitly excluded, with the reason recorded. |
| **VERIFIED** | Direct physical or protocol evidence confirms the narrowly stated behavior. |
| **AVAILABLE** | Present in an inherited upstream layer, with FrogAlert regression evidence still pending. |
| **QUARANTINED** | Retained for analysis or reusable logic but forbidden as a flashable artifact. |
| **FAILED** | Tested and did not satisfy its stated acceptance contract. |

Readiness applies per layer. For example, the host detection engine can be
**SHIPPED** while physical badge detection remains **PLANNED**.

## Product definition

FrogAlert is custom firmware for the FOSSASIA-supported CH582M 11×44 BadgeMagic
badge. It remains a user-programmable nametag and periodically performs a short,
passive BLE scan. When a conservative local rule matches, it temporarily shows
`COP DETECTED`, `FLIPPER DETECTED`, or `KARR DETECTED`, then restores the
user's nametag content.

The historical [`frogalert-count` source](firmware/frogalert-count/src/main.rs)
describes an observer-only bring-up loop, not that complete product. Its host
logic counts and renders nearby advertisers, but the embedded wrapper is
quarantined by the vector failure and never demonstrated useful operation. It
also lacks the BadgeMagic GATT service and nametag preservation.

### Product invariants

| Requirement | Status | Acceptance evidence | Notes |
| --- | --- | --- | --- |
| Normal operation remains useful as a nametag | **PROTOTYPE** in survey source, **BLOCKED** for hardware | The nearest-USB button rotates uploaded names with a separately rendered count view—KEY1 on `260404`, KEY2 on `250901`; passive scans and temporary alerts run in either view, then the selected view is restored | Prove exact uploaded content and selected-view behavior survive repeated windows, app uploads, and power cycles. |
| Compatible with the BadgeMagic app legacy upload path | **AVAILABLE** in inherited shell, **BLOCKED** for survey regression | Survey keeps FOSSASIA `FEE0/FEE1` code and skips connected states | A real Android/iOS upload before, during, and after survey scheduling is required. |
| Detection is passive and local | **SHIPPED** at core layer, **PROTOTYPE** in survey build | Survey calls passive WCH discovery, feeds a bounded C mirror of the documented rules, and has no network/storage path | The C mirror is an audited diagnostic boundary, not permission to skip the Rust ABI canary or hardware testing. |
| Alert rules are explainable | **SHIPPED** at core layer, **PROTOTYPE** for configured survey rules | Built-ins return a named kind; custom rules retain explicit match type/value/message in the local config block | Signals remain spoofable hints. Custom configuration is local and bounded, not an identity claim. |
| No device-tracking log | **SHIPPED** by design, **PROTOTYPE** in survey build | Fixed address RAM is explicitly zeroed; source tests reject address logging | Physical observation cannot prove zeroing, so retain source and disassembly audits. |
| Alerts do not assert identity as fact | **SHIPPED** in docs | Hardware and source docs describe OUIs as hints | Site copy must preserve this caveat. |

## Supported hardware

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Target WCH CH582M QFN48 | **VERIFIED** on the photographed badge | A 2026-07-22 macro photo clearly shows the WCH logo and `CH582M` marking on the 48-pin package | Chip identity passes; the USB-C `B1144C_250901` PCB mapping and flash profile remain separate blocked gates. |
| Exactly 11×44 LEDs | **BLOCKED** for hardware | Count rows/columns and record revision | Similar 11×55 products are incompatible. |
| Identify board revision and pin mapping | **PROTOTYPE** in source, **BLOCKED** for full physical proof | Exact `B1144C_260404_USB_C` and `B1144C_250901_USB_C` profiles share the pinned FOSSASIA `USBC_VERSION=1` 23-net display table; `260404` applies Nyx/FOSSASIA KEY1 pull-up, active-low, falling-wake semantics while legacy `250901` preserves pull-down, active-high, rising-wake behavior | `260404` is the build default, not detection. Keep printed markings separate from generic `BM1144-C`, color, and Rev2/Rev3 names; exact-board FrogAlert evidence remains missing. |
| Automatic USB-C profile detection | **REJECTED** for passive boot | Source/electrical review shows untouched KEY1 is open on both boards and PA1 follows the firmware-selected internal pull | A first press can reveal a transition only after boot/button/wake behavior has already been selected. Require the printed `260404` or `250901` marking and a profile-specific artifact. |
| ROM ISP bench entry | **VERIFIED** on `250901`, **IN PROGRESS** on `260404` | Holding the nearest-USB KEY2 while momentarily bridging both ends of `C3` enumerated `4348:55e0` twice on the photographed `B1144C_250901`. The photographed `260404` returned to OEM `0416:5020` when the nearer, wrong button was held; Nyx identifies its KEY2 as farther from USB | Capture `260404` CH582 identification with the correct button. KEY2+`RESET` was disproven only on `250901`. C3 rail collapse remains hazardous bench recovery, not routine web guidance. |
| FOSSASIA USB-C open-firmware boot | **VERIFIED** at application/descriptor layer | Linux enumerated `0416:5020` with manufacturer `FOSSASIA WAS HERE`, product `LED Badge Magic`, serial `BM1144-C fw: v0.1`, HID, CDC ACM, and `/dev/ttyACM0`; the downloaded file exactly matches upstream USB-C development artifact blob `18bffdb` | The local BIN is 177,704 bytes, SHA-256 `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`, source `9ce885d`. The missing `wchisp` transcript prevents proving that those exact bytes were the ones programmed. |
| Pinned FOSSASIA USB-C long-press KEY2 recovery | **VERIFIED** on the USB-C badge | From the running `9ce885d` development image, a KEY2-only long press displayed the dot cue and entered ISP without RESET or C3 | The image self-reports `BM1144-C fw: v0.1` but is not the Micro-USB v0.1 release asset. Exact elapsed timing and a fresh kernel transcript were not captured; this proves the application recovery affordance, not FrogAlert firmware. |
| FrogAlert long-press KEY2 recovery | **PROTOTYPE** at survey build layer, **BLOCKED** for hardware | The survey ELF retains the same KEY2/reset-jump and live vector symbols; the first standalone Rust image did not | Prove the visible dot and `4348:55e0`/`1a86:55e0` enumeration on the exact survey hash. The CH582 mask ROM remains the bootloader. |
| Battery-safe scan schedule | **PLANNED** | Current draw and runtime measurements | Current prototype uses about 17 s normal + 3 s scan for a roughly 20-second start-to-start cycle; battery suitability is unproven. |
| Unsupported hardware refusal | **PROTOTYPE** on web | Browser refuses non-CH582/type `0x16`, begins with no USB-C profile selected, and rejects an embedded profile mismatch | Matrix/revision cannot be detected over USB; printed-board human gate remains. |

## Rust firmware foundation

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Pinned FOSSASIA USB-C hardware shell | **SHIPPED** at build layer | Exact `9ce885d` source and MRS V1.92 provide separate locked `260404` default and `250901` legacy build profiles; the legacy baseline reproduces known-good 177,704-byte SHA-256 `2049eb58…f670a2` | C owns startup, vectors, clocks, USB, BLE/TMOS, common display mapping, profile-specific KEY1, and KEY2 recovery. Physical evidence for the upstream `250901` image does not transfer to either FrogAlert derivative. |
| C-only compatibility canary | **SHIPPED** as profile-specific local build evidence, **BLOCKED** for hardware | Each profile's canary retains all runtime audits and adds only an inert identity string | Stays under ignored `tmp/`; each exact hash/profile must pass program/verify, USB, app, profile-appropriate KEY1, KEY2 recovery, known-good reflash, and power cycle before publication. |
| FOSSASIA-shell passive survey candidates | **PROTOTYPE** at local build layer, **PARTIAL** only for historical `250901` observations | Both profiles build separately with embedded profile/config ids, passive start/cancel/suspend symbols, bounded configurable OUI/name/service classifier, exact view rotation, fixed count/page alert renderers, queued-animation ownership guards, qualified 48-column frame cropping, live-result and completion-list paths, live vectors, retained USB/BLE/display/KEY2 symbols, no AMO/LR/SC, ELF/BIN identity, and RAM headroom audit | Private `tmp/` diagnostics only. Alert lifetime is derived from the generated frame count at one second per frame, then the selected view returns; a continuously present match can retrigger in each roughly 20-second survey window. CI bundles both profiles as hardware-unverified Actions evidence; neither has release approval. |
| Rust for embedded application logic | **IN PROGRESS**, restricted to portable logic | The allocation-free core and host tests remain reusable | The standalone Rust runtime image booted blank. Replacement images will keep FOSSASIA's C startup/hardware shell and expose only narrow C ABI calls into Rust logic. |
| Atomic-free Rust archive | **IN PROGRESS** | Final linked image contains no AMO/LR/SC instructions and passes the FOSSASIA linker | Rust is a static library only; current Rust object attributes may need compatibility work with the pinned MRS linker. Do not replace the known-good final linker to make the archive fit. |
| Pin Rust and HAL revisions | **PROTOTYPE** | [`rust-toolchain.toml`](firmware/rust-toolchain.toml), firmware lockfile, and local HAL source are present and locked | Pinned nightly and dependency set build; upstream HAL warnings remain and hardware behavior is unverified. |
| Linker/runtime configuration | **FAILED** for standalone Rust; FOSSASIA replacement **IN PROGRESS** | Linked ELF proves Timer 0 vector 16 contained `DefaultInterruptHandler` because PAC 0.3 put `__EXTERNAL_INTERRUPTS` in flash instead of the runtime's RAM vector section | Replacement images inherit FOSSASIA startup/linker/runtime unchanged; a post-link vector audit now guards any future runtime work. |
| Reproducible release build | **PROTOTYPE** for both profile baseline/canary/survey lanes | Clean builds are checked against independent profile/lane size and SHA-256 locks; final BIN must equal the audited ELF's loadable bytes | A release build still needs a source commit, clean CI receipt, and exact-profile physical evidence. |
| Firmware size limit | **SHIPPED** at build layer | Binary audit rejects images over 448 KiB for either profile | Keep the exact limit in the pinned profile and release checks. |
| Panic/fault behavior | **PLANNED** for Rust ABI | Rust uses abort semantics and returns only through validated primitive C calls | The FOSSASIA shell owns hardware recovery; force and observe faults before adding radio behavior. |
| Version embedded in firmware | **PLANNED** | Readable via Device Information and release manifest | Include source commit. |

## Display and nametag behavior

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Rust 11×44 charlieplexed display driver | **QUARANTINED** with standalone runtime | Source contains candidate maps, but its interrupt-driven image is unsafe | Replacement firmware keeps FOSSASIA's proven C display driver and timer; Rust supplies framebuffer/policy data only. |
| Safe single-pixel bring-up image | **BLOCKED** after failed physical test | The first USB-C Rust BIN produced no moving pixel or other panel output and failed KEY2 recovery | It has been withdrawn. The next smoke image must be a minimal modification of the known-good FOSSASIA USB-C firmware shell. |
| Hardware revision pin maps and orientation | **BLOCKED** for physical proof | Exact-board pixel walk proves every row, column, direction, first-pair swap, and recovery path | `260404` and `250901` encode the same USB-C display table but differ in KEY1 semantics; neither has completed profile-specific FrogAlert evidence. Never substitute generic `BM1144-C`, color, or Rev2/Rev3 naming. |
| Stable refresh and display ownership | **PROTOTYPE** in survey source, **BLOCKED** after FrogAlert changes | Alert/count pages render into an inactive overlay buffer, atomically switch buffers, and make the display ISR select that overlay while owned. Event guards also consume queued base, marquee, blink, and Bluetooth animation work | Physical testing showed blink could still stomp the earlier shared framebuffer. The output mux now covers all nine base modes plus marquee/blink/BLE animation regardless of scheduler ordering; streaming/non-normal modes explicitly suspend ownership. Repeat visual/current checks on each exact profile/hash. |
| Hardware-independent 5×7 text rendering | **SHIPPED** at host layer | `cargo test --workspace` covers scrolling alert text and clipping | [`display.rs`](crates/frogalert-core/src/display.rs) solves rasterization; phrase readability on the panel remains blocked by display bring-up. |
| Nearby-device count rendering | **SHIPPED** at host layer, **PARTIAL** on hardware | Rust host renderer tests count/saturation; physical testing exposed that the first fixed renderer copied FOSSASIA font columns 0–4, retaining its blank lead-in and losing the final glyph column. The replacement copies real glyph columns 1–5 and keeps `BT 00` through `BT 64+` as one centered frame | Reflash the corrected exact hash and confirm every digit, saturation, and phase suffix. Nametag view remains selected between alerts instead of being permanently masked. |
| Flipper alert text | **SHIPPED** at host layer, **PARTIAL** on hardware | Rust policy returns `FLIPPER DETECTED`; the C-shell diagnostic safely parses legacy/extended complete and shortened local-name fields and renders `FLIPPER`, then `DETECTED`. Physical testing of the preceding timer showed an unwanted third `FLIPPER` frame; the replacement gives each page one second exactly once | Unagi uses a name rule, not an OUI. Official firmware advertises `xFlipper <name>`; renamed/custom devices can evade it and other devices can spoof it. Reflash the corrected exact hash and confirm the two-second sequence. |
| Cop alert text | **SHIPPED** at host layer, **PROTOTYPE** in survey build | The bounded C mirror maps both documented public-address OUIs plus `Axon Body`, `TASER`, `Ray-Ban`, and `Ray Ban` name hints to fixed `COP`, then `DETECTED`, pages held for one second each | OUI matching is restricted to controller-reported public addresses. Names and vendor prefixes remain spoofable hints, not identity proof. |
| KARR alert text | **SHIPPED** at host layer, **PROTOTYPE** in survey build | Rust and the bounded C mirror require case-insensitive `QT ` at the start of the advertised name plus a non-empty serial value, then render fixed `KARR`, then `DETECTED`, pages held for one second each | This user-observed name prefix is spoofable and can miss devices whose name appears only in a scan response. Hardware behavior remains unverified. |
| BadgeMagic frog animation | **PROTOTYPE** in survey build, **BLOCKED** for hardware | An exact case-insensitive `LED Badge Magic` local name or advertised `0xFEE0` service renders three frogs in two alternating one-second frames | Passive reports may omit a scan-response-only name. The `0xFEE0` fallback can false-positive compatible devices that reuse the service UUID. |
| User framebuffer storage | **PLANNED** | Upload survives alert and reboot | Define data-flash ownership/versioning. |
| Temporary alert overlay | **PROTOTYPE** in survey build, **BLOCKED** for corrected-hash hardware test | Built-in/custom text uses no more than two fixed pages; frog overlays retain two deliberate poses. A one-shot timer starts with the alert, shows every generated frame exactly once for one second, derives the lifetime from frame count, and restores the selected nametag/count view without writing the uploaded payload | The previous free-running pager could wrap to frame zero at the three-second boundary. Prove exact one-second framing and restoration after each rule, view transition, streaming session, and power cycle. |
| Alert cooldown/deduplication | **PROTOTYPE** in survey build, **BLOCKED** for hardware | Repeated reports of the selected alert class cannot restart its timer inside one scan; the detector is reset for the next roughly 20-second survey window | Prove the effective recurrence interval over the air and decide whether per-rule cooldown state is needed. |
| Profile-specific button behavior | **PROTOTYPE** at build layer, **BLOCKED** for hardware | `260404` uses near-USB KEY1 for view rotation and farther KEY2 for the normal short system action plus long ISP; `250901` retains KEY1 system and near-USB KEY2 view rotation. KEY1 long brightness remains inherited on both profiles | Run profile-appropriate short/long presses, the complete rotation, download/power/brightness/wake, and long-KEY2 dot-to-ISP checks on each exact hash. |
| Brightness and power controls | **PLANNED** | Next-gen/app settings survive alerts | Follow existing BadgeMagic behavior where possible. |

## BadgeMagic compatibility

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Advertise recognized badge identity | **AVAILABLE in pinned FOSSASIA shell**, FrogAlert canary pending | Working image enumerates as `LED Badge Magic`; official-app regression still needs a captured run | Preserve, do not reimplement first. |
| Legacy service `0xFEE0` | **AVAILABLE in pinned FOSSASIA shell**, FrogAlert canary pending | Exact source includes the working service | Repeat GATT discovery on every canary. |
| Legacy write characteristic `0xFEE1` | **AVAILABLE in pinned FOSSASIA shell**, FrogAlert canary pending | Exact source includes 16-byte writable characteristic | Repeat official-app upload on every canary. |
| Parse `wang\0\0` frame header | **AVAILABLE in pinned FOSSASIA shell**, hardening planned | Preserve upstream parser and add golden/malformed packet tests before modifying it | Reject malformed/incomplete frames safely. |
| Eight bitmap slots and modes | **AVAILABLE in pinned FOSSASIA shell**, regression pending | Preserve upstream data path | Capture app-generated fixtures and confirm power-cycle behavior. |
| Legacy 48-column wire frames on the 44-column panel | **PROTOTYPE** in survey build, **BLOCKED** for hardware | A physical animation was reported with two blank left columns. The survey build now recognizes only 48-column blocks whose outer two columns on both sides are blank, uses a 48-column frame stride, and copies inner columns 2 through 45. Host tests prove one- and two-frame cropping plus unchanged 44-column fallback | Flash the exact candidate and repeat official-app fixed and animation uploads. Capture golden drawn, GIF, fixed-text, and special-animation payloads; other transition modes remain on the pinned shell's original path. |
| Preserve upload across scan windows | **PROTOTYPE** in source, **BLOCKED** for hardware | Survey checks connection/streaming state twice and does not modify persisted badge content | Upload before/after a scan and race connection attempts against the schedule. |
| Device Information version | **PLANNED** | `0x180A/0x2A26` read succeeds | Include FrogAlert version. |
| Next-gen `F055/F056/F057` | **DEFERRED** | Separate acceptance plan | Legacy compatibility is the first milestone. |
| BLE firmware OTA | **REJECTED** for MVP | Architecture decision | Upstream says BLE update is deactivated; ISP remains authoritative. |

## Passive BLE scanning

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Allocation-free classification core | **SHIPPED** | `cargo test --workspace`: 21 core tests | `frogalert-core` is `no_std`. |
| Public-address OUI matching | **SHIPPED** at core layer, **PROTOTYPE** in survey build | Axon/Flock unit tests and bounded C mirror use controller-reported address type | Physical reports must confirm WCH byte order and address-type mapping on the exact image. |
| Ignore OUIs on random/local addresses | **SHIPPED** at core layer, **PROTOTYPE** in survey build | Regression tests and the C mirror reject OUI rules for non-public addresses | Names may still match. |
| Case-insensitive advertised-name matching | **SHIPPED** at core layer, **PROTOTYPE** in survey build | Complete/shortened-name, malformed-length, and embedded-rule tests pass | Passive discovery may not deliver a name carried only in scan response. |
| Axon `00:25:DF` seed | **SHIPPED** at core layer | Test and OUI-Spy provenance | Hint, not identity proof. |
| Flock `B4:1E:52` seed | **SHIPPED** at core layer | Rule and OUI-Spy provenance | Must confirm it appears in BLE field data. |
| Unagi name seeds | **SHIPPED** at core layer, **PROTOTYPE** in survey build | Flipper, Axon Body, TASER, and Ray-Ban variants are mirrored in bounded C | The Rust ABI remains a separate gate despite matching behavior. |
| KARR `QT ` name prefix | **SHIPPED** at core layer, **PROTOTYPE** in survey build | Rust and C tests cover complete and shortened names, case folding, required serial suffix, and refusal when the token is not at the start | User-observed and spoofable; not an OUI or authenticated identifier. |
| Configurable monitoring targets | **PROTOTYPE** in survey/web source, **BLOCKED** for hardware | CRC-protected 384-byte block enables five built-in groups plus up to eight ordered custom name contains/prefix/exact, public-OUI, or 16-bit-service rules; browser patches a copy and recomputes SHA-256 | Embedded profile id must match the compiled/selected board. Invalid config disables alerts; every configured hash remains a new hardware-unverified local artifact. |
| Parse BLE advertisement fields | **SHIPPED** at host layer, **PROTOTYPE** in survey build | Complete/shortened-name and malformed-length tests pass in Rust and the bounded C mirror | [`advertisement.rs`](crates/frogalert-core/src/advertisement.rs) is allocation-free; replacing the diagnostic C parser with the Rust ABI remains pending. |
| Count distinct advertisers ephemerally | **SHIPPED** at host layer | Duplicate, saturation, and clear-window tests pass | [`scan.rs`](crates/frogalert-core/src/scan.rs) uses fixed capacity and zeroes each completed window rather than retaining a history. |
| Observer scan for about 3 seconds | **PROTOTYPE** in FOSSASIA shell, **BLOCKED** for hardware | Private survey build calls passive `GAPRole_CentralStartDiscovery(..., FALSE, FALSE)` with a three-second WCH duration and five-second cancel watchdog | The old standalone Rust image remains quarantined. Prove real scan completion, repeat cadence, current draw, and radio/display coexistence. |
| Peripheral/observer role switching | **PROTOTYPE** in source, **BLOCKED** for hardware | WCH Central and Peripheral roles initialize together; advertising is paused before discovery rather than scanning concurrently | Repeated 24-hour run and app reconnect are required. |
| Do not scan while app connected | **PROTOTYPE** in source, **BLOCKED** for hardware | Both survey preparation and start re-check the peripheral connection plus idle/streaming display state | Prove a connection race cannot interrupt uploads. |
| Restore peripheral advertising | **PROTOTYPE** in source, **BLOCKED** for hardware | Prior advertising state is captured and restored on success, start failure, or watchdog timeout | App must rediscover after every scan window and every injected failure. |
| Configurable scan interval | **DEFERRED** | App/site settings design | Ship a safe fixed cadence first. |
| Full OUI database on badge | **REJECTED** | Architecture decision | Too broad, stale, and misleading for a small BLE detector. |
| Wi-Fi promiscuous Flock signatures | **REJECTED** | Hardware capability decision | CH582M has BLE, not 802.11. |

## Local development tools

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| One verification entry point | **SHIPPED** | `./scripts/verify` runs local contract | Includes host Rust, FOSSASIA pin/scaffold checks, quarantine/vector regression tests, JS, HTML, skill, and whitespace checks. |
| Host Rust tests | **SHIPPED** | `cargo test --workspace`: 21 core tests | Includes classification, AD parsing, ephemeral distinct-address counting, 11×44 count rendering, and alert text windows. |
| Host scan/display simulator | **SHIPPED** | Axon/Flipper/KARR classification plus `--count NUMBER [--saturated]` preview | Useful before embedded integration; terminal pixels do not prove panel orientation. |
| Rust formatting and clippy | **SHIPPED** | Included in verify and CI | Warnings are errors. |
| JavaScript protocol tests | **PROTOTYPE** | Node packet/validation tests | Hardware transcript fixtures still needed. |
| Static site preview | **SHIPPED** | `./scripts/serve-site` | Serves repository root on localhost. |
| HTML sanity check | **SHIPPED** | `xmllint --html --noout index.html` | Accessibility still needs browser review. |
| Pinned FOSSASIA USB-C build helper | **SHIPPED** at local build layer | Exact source/toolchain/tree hashes, default `260404` and explicit legacy `250901` profiles, common `USBC_VERSION=1` matrix, exact KEY1 patch, profile/lane locks, ELF-to-BIN identity, runtime/USB/vector/symbol/instruction/RAM audits, fail-closed cleanup, and separated ignored output | First run downloads about 345 MB. It never flashes, publishes, auto-detects a board, or authorizes a test. |
| Commit-bound CI candidate bundle | **PROTOTYPE** for dual-profile schema v2; earlier single-profile lane live-CI verified | After the repository contract passes, active firmware changes build both locked survey profiles and package deterministic `0.0.0-candidate.<12-char-commit>` BIN/ELF pairs, checksums, and JSON as `frogalert-candidate-<full-commit>` | The Actions artifact expires after 30 days, declares every publish/approval flag false, has read-only repository permission, and stays outside the manifest/GitHub Release/Pages pipeline. The new dual-profile run still needs CI confirmation. |
| Local `wchisp` fallback | **PLANNED** docs | Verified `wchisp info/flash` on badge | Physical badge needed. |
| Linux udev guidance | **PLANNED** docs | Tested rule on supported distro | Include both accepted vendor ids. |
| Windows WinUSB guidance | **PLANNED** docs | Tested clean-machine flow | May require Zadig/INF. |
| macOS flashing guidance | **PLANNED** docs | Tested physical flow | Confirm no driver conflict. |

## Firmware artifacts and releases

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Versioned FrogAlert raw `.bin` | **BLOCKED** | The former USB-C pixel-walk BIN was withdrawn after blank boot and failed recovery | No FrogAlert BIN is currently published. |
| ELF with symbols | **PROTOTYPE** at publication layer | Schema-v4 release descriptors require exact ELF filename/size/SHA; site assembly and the release planner validate ELF magic and bytes, and the GitHub workflow attaches it without copying it into Pages | No hardware-approved release ELF exists yet. For debugging, not browser users. |
| FrogAlert release SHA-256 checksum | **PLANNED** | The failed pixel-walk hash is retained only in the failure record | A matching checksum proved byte identity, not bootability. |
| Machine-readable manifest | **PROTOTYPE** | Schema v4 separates `releases`, `lab_images`, and `recovery_images`, pins the GitHub repository, and adds canonical release id/version/channel/tag/notes metadata | Includes exact target, revision, size, hash, provenance, and hardware-verification status. First real release still pending. |
| Hosted FrogAlert lab images | **BLOCKED**, catalog empty | The failed USB-C pixel-walk image was removed from the manifest and public assembly | Future first-test images stay under ignored `tmp/`; public FrogAlert bytes require hash-bound physical boot and recovery evidence. |
| Official open BadgeMagic v0.1 recovery image | **PROTOTYPE** for exact `HARDWARE_REV1` | The [155,672-byte artifact](firmware/releases/badgemagic-open-v0.1-hardware-rev1.bin) and SHA-256 match the [pinned manifest entry](firmware/releases/manifest.json) | This is FOSSASIA's open Micro-USB replacement, not factory/OEM firmware. Preparation is available, but destructive use stays locked while FrogAlert hardware verification is false. |
| Build provenance | **IN PROGRESS** | Pinned FOSSASIA source, known-good ELF/BIN hashes, toolchain version, and USB-C selector are recorded | A derived canary still needs a clean-build hash and physical transcript. |
| Firmware signing | **DEFERRED** | Threat model and key custody design | Hash/provenance first; do not invent security theater. |
| Hardware compatibility matrix | **PLANNED** | Tested revision table | Default-deny unknown revisions. |
| Release rollback/recovery documentation | **PROTOTYPE** | [`WEB_FLASHING.md`](docs/WEB_FLASHING.md) separates the open replacement from unavailable OEM bytes | Browser preparation is documented; destructive recovery and failed-flash handling remain hardware-unverified. |
| Commit-driven GitHub release automation | **PROTOTYPE** | After successful same-repository `main` CI, a least-privilege workflow revalidates approved manifest entries, checks source ancestry, creates a draft, uploads and re-download-hashes the exact BIN/ELF/checksum/descriptor/evidence assets, publishes, then permits Pages deployment; empty catalogs no-op and published byte drift fails | Unit-tested locally; first real GitHub firmware release run remains blocked on exact-image physical evidence. The separate expiring candidate artifact is never promoted automatically. |

## Static website

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Project explanation and architecture | **SHIPPED** | Static `index.html` sections | Copy distinguishes current and planned work. |
| Clear firmware readiness state | **SHIPPED** | Hero and flasher show experimental/no release | Must update with every release. |
| Responsive design | **SHIPPED** | Desktop/mobile browser inspection | No framework required. |
| Keyboard navigation and focus | **SHIPPED** | Browser interaction smoke | Destructive action remains reachable but gated. |
| Reduced-motion behavior | **SHIPPED** | CSS media query | LED animation becomes static. |
| Accessible status announcements | **SHIPPED** | ARIA live status/log | Perform screen-reader pass before stable launch. |
| No analytics or telemetry | **SHIPPED** | Static source inspection | Device data never leaves browser. |
| Link to source and feature tracker | **SHIPPED** | Public navigation | Keep GitHub URLs current. |
| Open BadgeMagic recovery explanation | **PROTOTYPE** | Local and live browser smokes confirm exact-Rev1 refusal/preparation states, pinned metadata, hash verification, and a locked destructive button | Physical-device usability remains pending. |
| Social preview image | **SHIPPED** at static-site layer | Both routes expose complete Open Graph and large-card metadata for a cache-busting 1200×630 JPEG; tests require a horizontal shell and an edge-to-edge exact 4:1 44×11 matrix without a dimension label on the badge face | Confirm a real link unfurl after deployment. |

## Browser BadgeMagic connection

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Web Bluetooth capability detection | **SHIPPED** | UI reports API availability | Availability varies by browser/OS. |
| Request badge with `FEE0` filter | **PROTOTYPE** | Site connects and discovers `FEE1` in code | Physical badge test pending. |
| Read-only compatibility probe | **PROTOTYPE** | GATT service/characteristic discovery | Does not alter badge content. |
| Browser nametag editor | **PLANNED** | Text renders and uploads on real badge | Needs font/frame encoder. |
| Legacy 16-byte write pacing | **PLANNED** | Full image uploads without dropped chunks | Derive from app behavior and hardware tests. |
| FrogAlert settings service | **DEFERRED** | GATT security/config design | Preserve official app compatibility first. |

## Browser firmware flashing

The browser flasher uses WebUSB. Web Bluetooth cannot install MCU firmware.

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Secure-context requirement | **SHIPPED** | UI blocks non-local insecure origins | Public site must use HTTPS. |
| WebUSB capability detection | **SHIPPED** | UI reports unsupported browsers | Firefox/Safari currently unsupported. |
| Dedicated mobile-first `/flash/` workflow | **SHIPPED** at static UI/test layer | Separate preflight, facts table, KEY2 recovery, artifact, consent, progress, and redacted-log surfaces pass structure tests | Hardware access remains experimental. |
| Point-of-action KEY2 entry guide | **SHIPPED** at UI/state-test layer | Inline compatible-firmware-only five-step flow names profile-specific KEY2 positions (`260404` farther from USB, `250901` nearest), plus back/retry states, center-dot acknowledgement, observed 9–13 second window, and original/unknown-firmware stop boundary beside the chooser | Confirmed on the FOSSASIA image for PCB `B1144C_250901`; every FrogAlert release still needs exact-artifact recovery evidence, and expert-only C3 entry is not a browser checklist. |
| Single destructive browser surface | **SHIPPED** invariant | Landing program controls are absent and fail the program-page mode gate; only `/flash/` carries the exact typed consent | Both routes carry same-origin CSP/referrer policies. |
| Explicit permission request | **PROTOTYPE** | Direct or guided final user click is the only `requestDevice()` path; timers and USB attach events never open the chooser | Physical device test pending. |
| Filter WCH ISP ids | **PROTOTYPE** | `4348/1a86:55e0` filters and tests | VID/PID alone is not sufficient. |
| Validate config 1/interface 0/bulk endpoint 2 | **PROTOTYPE** | Pure descriptor tests plus transport gate | OS driver binding may block claims. |
| Read-only CH582 identity gate | **PROTOTYPE** | Rejects chip id other than `0x82/0x16` | Physical transcript needed. |
| Detect bootloader/configuration facts without identifiers | **PROTOTYPE** | UI reports bootloader, UID integrity, and conservative configuration summary while omitting serial/raw UID | Physical transcript needed; application version and PCB are unavailable. |
| Optional running-firmware metadata probe | **PROTOTYPE** | Sanitized Device Information `2A26/2A29/2A24` reads are optional after `FEE0/FEE1` discovery | Self-reported text is not proof of installed bytes. |
| Arbitrary current-firmware detection | **REJECTED** as impossible through ISP | UI and docs explicitly keep it unknown unless an application self-reports | Protected application bytes cannot be read; no guessing by BLE/USB name. |
| Automatic USB-C KEY1 wiring/polarity profile detection | **REJECTED** for safe flashing | UI starts unselected and docs explain why an untouched open KEY1 cannot distinguish pull-up/active-low `260404` from pull-down/active-high `250901` | Select the exact printed marking; CHIP ID, connector, case color, and generic descriptors are insufficient. |
| Require CH582M/11×44 confirmation | **SHIPPED** in UI | Explicit hardware safety checkboxes | Human confirmation cannot be automated. |
| Bind artifact to selected PCB profile | **PROTOTYPE** | Exact `260404`, `250901`, and recovery-only Rev1 choices replace free text; configurable images must embed the matching profile id | Changing profile clears the artifact. Physical marking still requires human inspection. |
| Local `.bin` file selection | **PROTOTYPE** | File never uploads; base hash, final hash, and bound profile are shown locally | Developer path remains unverified. |
| Local monitoring configurator | **PROTOTYPE** at code/test layer | Five built-in groups, up to eight custom match rules, exact-one-block validation, CRC/profile checks, dirty-state flash block, immutable-base reset, derived SHA-256, and configured download are implemented | Every configured hash is a new local-developer artifact with no inherited hardware verification. Browser interaction and exact-BIN hardware smoke remain pending. |
| Same-origin release manifest | **PROTOTYPE** | Schema v4 has empty FrogAlert `releases` and `lab_images` plus one exact-revision open `recovery_images` descriptor; release options use stable ids and expose separate same-origin BIN and GitHub-notes links | Site assembly requires one profile/PCB pair, a structured hash/source-bound record, and an identifier-bound dated transcript proving CLI/WebUSB verification, application USB, display, BadgeMagic upload, KEY1/short-KEY2, KEY2-only recovery, and known-good reflash; it rejects the failed-hash quarantine. Remaining prototype status is physical browser/ISP validation. |
| Firmware plausibility, size, and padded-limit validation | **PROTOTYPE** | Unit tests reject tiny, uniform, wrong-extension, and oversized images and derive an exact aligned erase plan | Confirm exact release image layout. |
| SHA-256 calculation | **PROTOTYPE** | Web Crypto digest displayed | Manifest comparison pending release. |
| No erase on connect | **SHIPPED** invariant | Separate gated flash action | Regression-test UI state. |
| CH58x protection/config reset + readback | **PROTOTYPE** | `0xA8` encoder and exact `0xA7` readback tests | Must match a physical stock badge transcript. |
| UID-derived ISP key | **PROTOTYPE** | Protocol unit tests | Compare against hardware transcript. |
| Erase required sectors | **PROTOTYPE** | Packet encoder and staged flow | Physical timing/retry behavior pending. |
| Program in 56-byte chunks | **PROTOTYPE** | Packet encoder and progress UI | Physical test pending. |
| Required final empty write | **PROTOTYPE** | Implemented in flash sequence | Physical test pending. |
| Bootloader verify every chunk | **PROTOTYPE** | Verify sequence and mismatch handling | This is compare, not readback backup. |
| Bounded USB operations | **PROTOTYPE** | Transport timeouts force explicit recovery | Physical slow-path timings pending. |
| Timeout uncertainty handling | **SHIPPED** in UI | Timed-out command is reported as potentially completed and badge state unknown | Requires a fresh full identify/program/verify cycle. |
| Single-device flash session | **PROTOTYPE** | Every destructive transfer checks the captured device identity; reconnect stays locked until exit | Add fake-device disconnect/reconnect regression tests. |
| Cross-tab destructive lock | **PROTOTYPE** | Exclusive Web Lock when supported; explicit close-other-tabs warning otherwise | Multi-tab browser test pending. |
| Screen wake lock during writes | **PROTOTYPE** | Requested only for active flash and released on every exit | Android physical flash/power test pending. |
| Reset after verified success | **PROTOTYPE** | Sent-vs-acknowledged reset states are distinct | Disconnect may hide the response. |
| Recovery UX after failure | **PROTOTYPE** | Point-of-action KEY2 wizard plus durable recovery reference, no-enumeration boundary, and retry log | Deliberate interruption test pending. |
| Destructive-session integration tests | **PROTOTYPE** | Fake transport covers exact reset/readback-before-erase order, 56-byte program/finalize/verify, mismatches, invalid plans, and UI callback isolation | It does not replace fake WebUSB DOM/device-event coverage. |
| Browser state-machine integration tests | **PLANNED** | Fake WebUSB covers disconnect, delayed manifest, timeout, and artifact races | Transport-independent full-session tests exist today. |
| Open BadgeMagic recovery preparation | **PROTOTYPE** | Node tests pin v0.1 bytes, SHA-256, source provenance, `HARDWARE_REV1`, and hardware-unverified status | [`site/app.js`](site/app.js) only fetches and verifies locally; the false hardware-verification flag blocks destructive arming until a physical Rev1 smoke passes. |
| Hosted lab-image inspection | **BLOCKED**, catalog empty | The failed USB-C pixel walk was removed after physical testing | Do not publish first-test bytes as a downloadable workaround around manifest write locks. |
| Released FrogAlert firmware one-click selection | **BLOCKED** | Requires first hardware-tested FrogAlert release | Local developer BIN and open-recovery preparation do not satisfy this gate. |
| Stable browser flashing | **BLOCKED** | Full matrix across Chrome/Edge and two desktop OSes | Requires physical badge and release artifact. |

## Browser and operating-system support target

| Platform | Target status | Required proof |
| --- | --- | --- |
| Chrome desktop, Linux | **PLANNED** | udev + identify/program/verify/reset test |
| Chromium Edge, Windows | **PLANNED** | WinUSB driver setup + full flash test |
| Chrome desktop, macOS | **PLANNED** | Full flash test without driver conflict |
| Chrome Android + USB OTG | **PROTOTYPE** UI / **BLOCKED** physical support | USB-host phone, data OTG adapter, permission, wake lock, power, full flash, interruption, and recovery test |
| ChromeOS | **DEFERRED** | Full flash/recovery test |
| Firefox | **REJECTED** currently | No WebUSB implementation |
| Safari/iOS | **REJECTED** currently | No WebUSB implementation |

## Hosting and domain

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Static GitHub Pages deployment | **SHIPPED** | CI run `29873151751` passed and gated Pages run `29873200005` deployed exact commit `d35656f` from `main` | Publishes the assembled static artifact only after CI succeeds. |
| Custom domain `frogalert.org` | **SHIPPED** | DNS resolves to GitHub Pages and the live page returns 200 | Pages custom-domain setting is authoritative; workflow `CNAME` is only a repo record. |
| HTTPS enforced | **SHIPPED** | HTTP returns 301 to HTTPS; GitHub certificate approved | Secure context confirmed in a live browser. |
| Correct MIME types for modules/JSON/bin | **SHIPPED** | Live JS is `application/javascript`, manifest is `application/json`, and the recovery BIN is `application/octet-stream` | Re-check when hosting or artifact paths change. |
| Deployment smoke test | **SHIPPED** | Live `/flash/` loaded eight confirmations plus the exact phrase, verified the pinned 155,672-byte SHA-256, kept programming locked, showed no document overflow or app errors; `/` exposed no program control | Electron's development-shell CSP warning is outside the site. |
| Cache policy for firmware manifests | **PROTOTYPE** | App requests `no-store`; Pages currently advertises a 10-minute CDN maximum | Test a real manifest promotion before first release. |

## Security, privacy, and abuse boundaries

| Requirement | Status | Acceptance evidence | Notes |
| --- | --- | --- | --- |
| No telemetry | **SHIPPED** | Static source has no collection endpoint | Hosting access logs are outside app behavior. |
| No remote firmware upload | **SHIPPED** | Files processed through browser APIs only | Explain this in UI. |
| Explicit destructive consent | **SHIPPED** in UI | Hardware, irreversibility, and power checks | Final physical usability test pending. |
| Exact typed and native final confirmation | **SHIPPED** in UI | `ERASE THIS BADGE` plus final target/profile/name/size/hash/erase summary | Physical usability test pending. |
| Redacted device/session reporting | **SHIPPED** at code/test layer | USB serial/raw UID omitted; UID copy is zeroed on close; copied log contains only summarized facts | Inspect physical browser descriptors before stable promotion. |
| Static flasher CSP/referrer policy | **SHIPPED** | `/flash/` restricts executable, style, fetch, object, base, and form sources to same origin | Re-check browser console on deployment. |
| Exact target identity gate | **PROTOTYPE** | Protocol rejects non-CH582 | PCB/display still require human confirmation. |
| Verified-before-success | **PROTOTYPE** | State machine never marks success before verify | Hardware fault-injection pending. |
| Conservative detection language | **SHIPPED** | Site/docs say signal/hint, not proof | Keep alert jokes distinct from factual claims. |
| No active interrogation by default | **PROTOTYPE** firmware | Count lab build requests passive observer discovery | Active scan remains off; verify controller behavior over the air. |
| No Wi-Fi scanning | **REJECTED** | Hardware/product boundary | Not supported by CH582M. |

## Documentation and project operations

| Requirement | Status | Acceptance evidence | Notes |
| --- | --- | --- | --- |
| Canonical `AGENTS.md` | **SHIPPED** | Root operating guide | Update with durable lessons. |
| Harness symlinks | **SHIPPED** | `CLAUDE.md`/`GEMINI.md` point to `AGENTS.md` | Avoid diverging copies. |
| Memory index and shelves | **SHIPPED** | `MEMORY.md` + `agent-memory/` | Public-safe content only. |
| Skill catalog | **SHIPPED** | `SKILLS.md` + three validated skills | Keep library small. |
| Extensive readiness tracker | **SHIPPED** | This file | Preserve status/evidence distinction. |
| Development guide | **SHIPPED** | `docs/DEVELOPMENT.md` | Covers host work, pinned exact-revision firmware builds, atomic audit, temporary artifacts, and physical bring-up gates. |
| Browser flashing guide | **SHIPPED** | `docs/WEB_FLASHING.md` | Separates open BadgeMagic replacement from unavailable OEM bytes; hardware commands remain labeled unverified. |
| Protocol guide | **SHIPPED** | `docs/PROTOCOL.md` | Includes BadgeMagic and ISP separation. |
| Release guide | **SHIPPED** | `docs/RELEASE.md` | Blocks untested firmware promotion. |
| Upstream attribution | **SHIPPED** | `docs/UPSTREAM.md` | Re-check licenses at release time. |
| Weekly recurse.bot review | **PLANNED** operational habit | Dated log when advice is checked | Adopt only useful changes. |

## Milestones

### M0 — Research and host logic

- **SHIPPED:** hardware/protocol research, detection/classification core,
  allocation-free AD parsing, ephemeral distinct-address counting, 11×44 text
  and count rendering, simulator previews, tests, repository, and safety docs.

### M1 — Static site and experimental browser transport

- **PROTOTYPE:** public project experience, Web Bluetooth compatibility probe,
  guarded WebUSB protocol, schema-v4 release/lab/recovery manifest, and an
  exact-Rev1 open BadgeMagic v0.1 recovery-preparation UI.
- **SHIPPED infrastructure:** CI, exact-successful-commit Pages deployment,
  custom domain, HTTPS, and live recovery-artifact/browser smoke testing.
- Exit gate: current HTTPS site verified; no claim of hardware success or OEM
  factory restoration.

### M2 — Display bring-up

- **PROTOTYPE software:** pinned atomic-free IMC Rust runtime, separate
  `HARDWARE_REV1` and `B1144C_250901_USB_C` charlieplex profiles, single-pixel
  no-BLE/32 kHz walk, shared KEY2 recovery, 5×7 renderer, count display,
  observer loop, and panic pin release are implemented at source/build layers.
- **PROTOTYPE FOSSASIA-shell profiles:** default
  `B1144C_260404_USB_C` and legacy `B1144C_250901_USB_C` share the working
  USB-C LED table and differ only in KEY1 pull/polarity/wake behavior. Passive
  auto-detection is rejected; exact markings select separate artifacts.
- **BLOCKED on hardware:** exact PCB identity/pin proof, pixel orientation,
  refresh/flicker, Rust boot, and FrogAlert KEY2 recovery have not been
  observed. USB-C BLE coexistence is additionally blocked by the HAL's external
  LSE assumption.
- **PLANNED product work:** fixed/persistent nametag, alert overlay, buttons,
  and a hardware-tested FrogAlert binary.
- Exit gate: repeatable display and recovery smoke with recorded board revision.

### M3 — BadgeMagic compatibility

- **PLANNED:** legacy GATT profile, frame parser, persistent content, official
  app uploads, and scan suppression while connected.
- Exit gate: multiple upload modes survive alert cycles and power cycles.

### M4 — BLE detection integration

- **SHIPPED at host layer:** safe advertisement-name parsing and fixed-capacity,
  per-window unique-address counting.
- **QUARANTINED software:** the old standalone Rust observer/count image shares
  the failed external-vector layout and must not be flashed.
- **PROTOTYPE at build layer / PARTIAL on hardware:** the preceding private
  FOSSASIA-shell survey candidate visibly reached its diagnostic `BT 00` on the
  photographed badge but did not show a measured count. The replacement makes
  initialization, ready/waiting, active scan, completion, error, and timeout
  states visible in a profile-specific nearest-button counter view; scans in either visible
  view; consumes live reports and the completion list; mirrors every documented
  OUI/name rule in bounded C; accepts a CRC/profile-bound built-in/custom rule
  block; renders one-second-per-frame cop/Flipper/custom and BadgeMagic frog overlays
  on a roughly 20-second survey cadence; consumes queued original animation
  events while the overlay owns the panel; restores the selected view and
  advertising; zeroes addresses; and cancels a stuck scan. Both profile BINs
  are locked and bundled only as unverified Actions evidence, not published or
  flash-approved firmware releases.
- **PLANNED:** replace the diagnostic C rule mirror with the Rust ABI policy,
  refine per-rule cooldowns, measure battery impact, and physically validate the
  scan-response/FEE0 fallback tradeoff.
- Exit gate: 24-hour run with app reconnect, no lost content, and measured power.

### M5 — Tested release and browser flash

- **PROTOTYPE recovery preparation:** FOSSASIA's official open BadgeMagic v0.1
  image is bundled with exact Rev1, size, SHA-256, source, and license metadata;
  it is not OEM firmware and is not hardware-verified by FrogAlert.
- **BLOCKED lab path:** the first USB-C pixel-walk image booted blank, failed
  KEY2 recovery, and was withdrawn. No FrogAlert BIN is hosted.
- **BLOCKED:** hardware-tested FrogAlert release artifact, compatibility
  matrix, full WebUSB program/verify/recovery tests, and one-click FrogAlert
  selection.
- Exit gate: two supported desktop OSes and a documented CLI fallback.

## Explicit non-goals for the first release

- Wi-Fi or promiscuous 802.11 surveillance detection
- cloud device history, maps, accounts, analytics, or telemetry
- claims that a BLE signal proves a specific person or agency is nearby
- BLE OTA firmware updates
- universal support for visually similar LED badges
- silently flashing or changing configuration merely because a device connected
- shipping a binary that has only been emulated or compiled, not badge-tested
