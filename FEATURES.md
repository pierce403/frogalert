# FrogAlert feature and readiness tracker

Last reviewed: 2026-07-17

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

Readiness applies per layer. For example, the host detection engine can be
**SHIPPED** while physical badge detection remains **PLANNED**.

## Product definition

FrogAlert is custom firmware for the FOSSASIA-supported CH582M 11×44 BadgeMagic
badge. It remains a user-programmable nametag and periodically performs a short,
passive BLE scan. When a conservative local rule matches, it temporarily shows
`COP DETECTED` or `HAX DETECTED`, then restores the user's nametag content.

### Product invariants

| Requirement | Status | Acceptance evidence | Notes |
| --- | --- | --- | --- |
| Normal operation remains useful as a nametag | **PLANNED** | Badge displays uploaded content before and after scan/alert cycles | Alert overlays must not overwrite user data. |
| Compatible with the BadgeMagic app legacy upload path | **PLANNED** | Real Android/iOS upload through `FEE0/FEE1` succeeds | App compatibility is a hardware acceptance test. |
| Detection is passive and local | **SHIPPED** at core layer | `frogalert-core` has no network/storage path | Firmware integration still pending. |
| Alert rules are explainable | **SHIPPED** at core layer | Each match returns kind and static label | Future configurable rules must retain provenance. |
| No device-tracking log | **SHIPPED** by design | No persistence API in detection core or site | Debug builds must not add raw observation retention by default. |
| Alerts do not assert identity as fact | **SHIPPED** in docs | Hardware and source docs describe OUIs as hints | Site copy must preserve this caveat. |

## Supported hardware

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Target WCH CH582M QFN48 | **BLOCKED** for hardware | Open badge and photograph readable package marking | Physical badge needed. |
| Exactly 11×44 LEDs | **BLOCKED** for hardware | Count rows/columns and record revision | Similar 11×55 products are incompatible. |
| Identify board revision and pin mapping | **PLANNED** | Photos plus display/button/USB smoke tests | Upstream contains multiple revision conditionals. |
| Factory ISP boot entry with KEY2 | **BLOCKED** | Enumerates as `4348:55e0` or `1a86:55e0` | Physical badge needed. |
| Long-press KEY2 entry after open firmware | **PLANNED** | Power-cycle and long-press test | Preserve upstream recovery affordance. |
| Battery-safe scan schedule | **PLANNED** | Current draw and runtime measurements | Default proposal: 57 s normal + 3 s scan. |
| Unsupported hardware refusal | **PROTOTYPE** on web | Browser refuses non-CH582/type `0x16` | Matrix/revision cannot be detected over USB; human gate remains. |

## Rust firmware foundation

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Rust for embedded application logic | **PLANNED** | CH582 firmware crate builds and boots | `ch58x-hal` proves feasibility but app firmware is not present. |
| `riscv32imac-unknown-none-elf` target | **PLANNED** | Pinned toolchain CI build | HAL examples currently need nightly features. |
| Pin Rust and HAL revisions | **PLANNED** | Committed toolchain file and locked git revision | Do before first firmware artifact. |
| Linker/runtime configuration | **PLANNED** | ELF map and boot smoke | Must preserve WCH BLE library memory requirements. |
| Reproducible release build | **PLANNED** | Two clean builds produce matching `.bin` SHA-256 | Record host/toolchain metadata. |
| Firmware size limit | **PLANNED** | CI rejects image beyond CH582 code flash | CH582 definition reports 448 KiB. |
| Panic/fault behavior | **PLANNED** | Visible safe fallback and recovery test | Never leave the matrix driven incorrectly. |
| Version embedded in firmware | **PLANNED** | Readable via Device Information and release manifest | Include source commit. |

## Display and nametag behavior

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Rust 11×44 charlieplexed display driver | **PLANNED** | All pixels and rows pass visual test | Port hardware facts; preserve upstream attribution. |
| Hardware revision pin maps | **PLANNED** | Test each supported revision | Never guess revision-specific pins. |
| Stable refresh without flicker | **PLANNED** | Camera/visual check during BLE activity | Refresh timing must coexist with WCH BLE processing. |
| Text rendering for alert phrases | **PLANNED** | Both phrases readable across the matrix | Scrolling is likely required. |
| User framebuffer storage | **PLANNED** | Upload survives alert and reboot | Define data-flash ownership/versioning. |
| Temporary alert overlay | **PLANNED** | Alert displays, then exact prior content resumes | Do not persist overlay as nametag content. |
| Alert cooldown/deduplication | **PLANNED** | Repeated advertisements do not strobe indefinitely | Define per-rule and global cooldowns. |
| Button behavior preserved | **PLANNED** | Short/long press regression checklist | Include bootloader entry. |
| Brightness and power controls | **PLANNED** | Next-gen/app settings survive alerts | Follow existing BadgeMagic behavior where possible. |

## BadgeMagic compatibility

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Advertise recognized badge identity | **PLANNED** | Badge appears in official app | Default expected name: `LED Badge Magic`. |
| Legacy service `0xFEE0` | **PLANNED** | GATT discovery on real hardware | Required for current app path. |
| Legacy write characteristic `0xFEE1` | **PLANNED** | 16-byte writes accepted in order | Write-only behavior is sufficient for open firmware. |
| Parse `wang\0\0` frame header | **PLANNED** | Golden packet tests | Reject malformed/incomplete frames safely. |
| Eight bitmap slots and modes | **PLANNED** | App-generated fixtures round-trip | Include flash, marquee, speed, sizes, and modes. |
| Preserve upload across scan windows | **PLANNED** | Upload before/after scan succeeds | Never enter observer mode while connected. |
| Device Information version | **PLANNED** | `0x180A/0x2A26` read succeeds | Include FrogAlert version. |
| Next-gen `F055/F056/F057` | **DEFERRED** | Separate acceptance plan | Legacy compatibility is the first milestone. |
| BLE firmware OTA | **REJECTED** for MVP | Architecture decision | Upstream says BLE update is deactivated; ISP remains authoritative. |

## Passive BLE scanning

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Allocation-free classification core | **SHIPPED** | `cargo test --workspace`: six tests | `frogalert-core` is `no_std`. |
| Public-address OUI matching | **SHIPPED** at core layer | Axon/Flock unit tests and simulator | Hardware controller address-type mapping pending. |
| Ignore OUIs on random/local addresses | **SHIPPED** at core layer | Regression test rejects random-address OUI | Names may still match. |
| Case-insensitive advertised-name matching | **SHIPPED** at core layer | Flipper/Axon tests | Parse complete and shortened local-name fields in firmware. |
| Axon `00:25:DF` seed | **SHIPPED** at core layer | Test and OUI-Spy provenance | Hint, not identity proof. |
| Flock `B4:1E:52` seed | **SHIPPED** at core layer | Rule and OUI-Spy provenance | Must confirm it appears in BLE field data. |
| Unagi name seeds | **SHIPPED** at core layer | Flipper, Axon Body, TASER, Ray-Ban variants | Mirrored from current Unagi defaults. |
| Parse BLE advertisement fields | **PLANNED** | Golden advertisement tests | Handle malformed lengths without panic. |
| Observer scan for about 3 seconds | **PLANNED** | Hardware scan sees known test beacon | Passive scan; active scan off initially. |
| Peripheral/observer role switching | **BLOCKED** | Repeated 24-hour hardware run | WCH BLE stack behavior must be proven. |
| Do not scan while app connected | **PLANNED** | Connection suppresses scheduled scan | Resume schedule after disconnect. |
| Restore peripheral advertising | **PLANNED** | App rediscovers after every scan window | Failure must recover automatically. |
| Configurable scan interval | **DEFERRED** | App/site settings design | Ship a safe fixed cadence first. |
| Full OUI database on badge | **REJECTED** | Architecture decision | Too broad, stale, and misleading for a small BLE detector. |
| Wi-Fi promiscuous Flock signatures | **REJECTED** | Hardware capability decision | CH582M has BLE, not 802.11. |

## Local development tools

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| One verification entry point | **SHIPPED** | `./scripts/verify` runs local contract | Includes Rust, JS, HTML, skill, and whitespace checks. |
| Host Rust tests | **SHIPPED** | `cargo test --workspace` | No network or badge required. |
| Host scan simulator | **SHIPPED** | Documented Axon/Flipper examples | Useful before embedded integration. |
| Rust formatting and clippy | **SHIPPED** | Included in verify and CI | Warnings are errors. |
| JavaScript protocol tests | **PROTOTYPE** | Node packet/validation tests | Hardware transcript fixtures still needed. |
| Static site preview | **SHIPPED** | `./scripts/serve-site` | Serves repository root on localhost. |
| HTML sanity check | **SHIPPED** | `xmllint --html --noout index.html` | Accessibility still needs browser review. |
| Firmware bootstrap helper | **PLANNED** | Checks/installs pinned embedded target and tools | Do not pin until firmware crate lands. |
| Local `wchisp` fallback | **PLANNED** docs | Verified `wchisp info/flash` on badge | Physical badge needed. |
| Linux udev guidance | **PLANNED** docs | Tested rule on supported distro | Include both accepted vendor ids. |
| Windows WinUSB guidance | **PLANNED** docs | Tested clean-machine flow | May require Zadig/INF. |
| macOS flashing guidance | **PLANNED** docs | Tested physical flow | Confirm no driver conflict. |

## Firmware artifacts and releases

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Versioned raw `.bin` | **BLOCKED** | Hardware-tested firmware build | Website intentionally has no bundled image today. |
| ELF with symbols | **PLANNED** | Attached to GitHub release | For debugging, not browser users. |
| SHA-256 checksum | **PLANNED** | Manifest and release asset agree | Browser recomputes locally. |
| Machine-readable manifest | **PROTOTYPE** | Schema tracked with no current release | Include target, revision, size, hash, commit, version. |
| Build provenance | **PLANNED** | Toolchain/HAL/source recorded | Prefer reproducible CI artifact. |
| Firmware signing | **DEFERRED** | Threat model and key custody design | Hash/provenance first; do not invent security theater. |
| Hardware compatibility matrix | **PLANNED** | Tested revision table | Default-deny unknown revisions. |
| Release rollback/recovery doc | **PLANNED** | Deliberate failed-flash test | OEM rollback is impossible without an image. |
| GitHub release automation | **PLANNED** | Tag creates draft with verified assets | Never auto-promote untested firmware. |

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
| Social preview image | **PLANNED** | Real link-unfurl smoke | Do not ship generic placeholder art. |

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
| Explicit permission request | **PROTOTYPE** | User-click `requestDevice()` path | Physical device test pending. |
| Filter WCH ISP ids | **PROTOTYPE** | `4348/1a86:55e0` filters and tests | VID/PID alone is not sufficient. |
| Claim config 1/interface 0 | **PROTOTYPE** | Transport implementation | OS driver binding may block claims. |
| Read-only CH582 identity gate | **PROTOTYPE** | Rejects chip id other than `0x82/0x16` | Physical transcript needed. |
| Require CH582M/11×44 confirmation | **SHIPPED** in UI | Explicit hardware safety checkboxes | Human confirmation cannot be automated. |
| Bind artifact to entered PCB revision | **PROTOTYPE** | Release descriptor and local selection enforce an exact value | Physical label/revision catalog pending. |
| Local `.bin` file selection | **PROTOTYPE** | File never uploads; hash and bound revision shown locally | Developer path remains unverified. |
| Same-origin release manifest | **PROTOTYPE** | Empty manifest schema present | No release exists yet. |
| Firmware size and padded-limit validation | **PROTOTYPE** | Unit-tested pure validation | Confirm exact release image layout. |
| SHA-256 calculation | **PROTOTYPE** | Web Crypto digest displayed | Manifest comparison pending release. |
| No erase on connect | **SHIPPED** invariant | Separate gated flash action | Regression-test UI state. |
| CH58x protection/config reset + readback | **PROTOTYPE** | `0xA8` encoder and exact `0xA7` readback tests | Must match a physical stock badge transcript. |
| UID-derived ISP key | **PROTOTYPE** | Protocol unit tests | Compare against hardware transcript. |
| Erase required sectors | **PROTOTYPE** | Packet encoder and staged flow | Physical timing/retry behavior pending. |
| Program in 56-byte chunks | **PROTOTYPE** | Packet encoder and progress UI | Physical test pending. |
| Required final empty write | **PROTOTYPE** | Implemented in flash sequence | Physical test pending. |
| Bootloader verify every chunk | **PROTOTYPE** | Verify sequence and mismatch handling | This is compare, not readback backup. |
| Bounded USB operations | **PROTOTYPE** | Transport timeouts force explicit recovery | Physical slow-path timings pending. |
| Single-device flash session | **PROTOTYPE** | Every destructive transfer checks the captured device identity; reconnect stays locked until exit | Add fake-device disconnect/reconnect regression tests. |
| Reset after verified success | **PROTOTYPE** | Sent-vs-acknowledged reset states are distinct | Disconnect may hide the response. |
| Recovery UX after failure | **PROTOTYPE** | Log retains retry instructions | Deliberate interruption test pending. |
| Browser state-machine integration tests | **PLANNED** | Fake WebUSB covers disconnect, delayed manifest, timeout, and artifact races | Pure packet tests exist today. |
| Released firmware one-click selection | **BLOCKED** | Requires first hardware-tested release | Local file mode is available for developers. |
| Stable browser flashing | **BLOCKED** | Full matrix across Chrome/Edge and two desktop OSes | Requires physical badge and release artifact. |

## Browser and operating-system support target

| Platform | Target status | Required proof |
| --- | --- | --- |
| Chrome desktop, Linux | **PLANNED** | udev + identify/program/verify/reset test |
| Chromium Edge, Windows | **PLANNED** | WinUSB driver setup + full flash test |
| Chrome desktop, macOS | **PLANNED** | Full flash test without driver conflict |
| Chrome Android + USB OTG | **DEFERRED** | Power and full flash/recovery test |
| ChromeOS | **DEFERRED** | Full flash/recovery test |
| Firefox | **REJECTED** currently | No WebUSB implementation |
| Safari/iOS | **REJECTED** currently | No WebUSB implementation |

## Hosting and domain

| Requirement | Status | Acceptance evidence | Dependency / notes |
| --- | --- | --- | --- |
| Static GitHub Pages deployment | **PLANNED** | Pages workflow succeeds from `main` | Workflow included in repo. |
| Custom domain `frogalert.org` | **PLANNED** | DNS and Pages domain check pass | `CNAME` included; external DNS still required. |
| HTTPS enforced | **PLANNED** | Public request redirects to HTTPS | Required for WebUSB/Web Bluetooth. |
| Correct MIME types for modules/JSON/bin | **PLANNED** | Public network inspection | `.bin` should be octet-stream. |
| Deployment smoke test | **PLANNED** | Public page and manifest load | API existence alone is insufficient. |
| Cache policy for firmware manifests | **PLANNED** | New release appears without stale shell | Avoid service-worker complexity initially. |

## Security, privacy, and abuse boundaries

| Requirement | Status | Acceptance evidence | Notes |
| --- | --- | --- | --- |
| No telemetry | **SHIPPED** | Static source has no collection endpoint | Hosting access logs are outside app behavior. |
| No remote firmware upload | **SHIPPED** | Files processed through browser APIs only | Explain this in UI. |
| Explicit destructive consent | **SHIPPED** in UI | Hardware, irreversibility, and power checks | Final physical usability test pending. |
| Exact target identity gate | **PROTOTYPE** | Protocol rejects non-CH582 | PCB/display still require human confirmation. |
| Verified-before-success | **PROTOTYPE** | State machine never marks success before verify | Hardware fault-injection pending. |
| Conservative detection language | **SHIPPED** | Site/docs say signal/hint, not proof | Keep alert jokes distinct from factual claims. |
| No active interrogation by default | **PLANNED** firmware | Passive observer configuration | Active scan remains off. |
| No Wi-Fi scanning | **REJECTED** | Hardware/product boundary | Not supported by CH582M. |

## Documentation and project operations

| Requirement | Status | Acceptance evidence | Notes |
| --- | --- | --- | --- |
| Canonical `AGENTS.md` | **SHIPPED** | Root operating guide | Update with durable lessons. |
| Harness symlinks | **SHIPPED** | `CLAUDE.md`/`GEMINI.md` point to `AGENTS.md` | Avoid diverging copies. |
| Memory index and shelves | **SHIPPED** | `MEMORY.md` + `agent-memory/` | Public-safe content only. |
| Skill catalog | **SHIPPED** | `SKILLS.md` + three validated skills | Keep library small. |
| Extensive readiness tracker | **SHIPPED** | This file | Preserve status/evidence distinction. |
| Development guide | **SHIPPED** | `docs/DEVELOPMENT.md` | Firmware-specific bootstrap pending crate. |
| Browser flashing guide | **SHIPPED** | `docs/WEB_FLASHING.md` | Hardware commands labeled unverified where needed. |
| Protocol guide | **SHIPPED** | `docs/PROTOCOL.md` | Includes BadgeMagic and ISP separation. |
| Release guide | **SHIPPED** | `docs/RELEASE.md` | Blocks untested firmware promotion. |
| Upstream attribution | **SHIPPED** | `docs/UPSTREAM.md` | Re-check licenses at release time. |
| Weekly recurse.bot review | **PLANNED** operational habit | Dated log when advice is checked | Adopt only useful changes. |

## Milestones

### M0 — Research and host logic

- **SHIPPED:** hardware/protocol research, Rust feasibility, detection core,
  tests, simulator, repository, and safety documentation.

### M1 — Static site and experimental browser transport

- **PROTOTYPE:** public project experience, Web Bluetooth compatibility probe,
  guarded WebUSB protocol, release manifest schema, CI, and Pages workflow.
- Exit gate: deployed HTTPS site verified; no claim of hardware success.

### M2 — Display bring-up

- **PLANNED:** Rust runtime, charlieplex driver, fonts, fixed nametag, alert
  overlay, button recovery, and binary artifact on a confirmed badge.
- Exit gate: repeatable display and recovery smoke with recorded board revision.

### M3 — BadgeMagic compatibility

- **PLANNED:** legacy GATT profile, frame parser, persistent content, official
  app uploads, and scan suppression while connected.
- Exit gate: multiple upload modes survive alert cycles and power cycles.

### M4 — BLE detection integration

- **PLANNED:** passive observer windows, advertisement parser, role recovery,
  alert cooldown, and battery measurements.
- Exit gate: 24-hour run with app reconnect, no lost content, and measured power.

### M5 — Tested release and browser flash

- **BLOCKED:** release artifact, manifest, checksums, hardware matrix, full
  WebUSB program/verify/recovery tests, and one-click selection.
- Exit gate: two supported desktop OSes and a documented CLI fallback.

## Explicit non-goals for the first release

- Wi-Fi or promiscuous 802.11 surveillance detection
- cloud device history, maps, accounts, analytics, or telemetry
- claims that a BLE signal proves a specific person or agency is nearby
- BLE OTA firmware updates
- universal support for visually similar LED badges
- silently flashing or changing configuration merely because a device connected
- shipping a binary that has only been emulated or compiled, not badge-tested
