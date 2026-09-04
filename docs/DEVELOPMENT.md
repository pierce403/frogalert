# Local development

FrogAlert has three development layers: host Rust logic, a static browser app,
and experimental embedded CH582M firmware. Work from the repository root and
use repo-local `./tmp/` for scratch output.

## Host prerequisites

- Git
- a current stable Rust toolchain with `cargo`, `rustfmt`, and `clippy`
- Node.js 20 or newer for dependency-free browser protocol tests
- Python 3 for the local static server
- `xmllint` for an additional HTML syntax check

Run all currently available checks:

```sh
./scripts/verify
```

Run the detection simulator:

```sh
cargo run -p frogalert-simulator -- "00:25:DF:12:34:56" "Axon Body 4"
cargo run -p frogalert-simulator -- "C2:00:00:00:00:01" "Flipper Zero"
```

Compare the host's BLE discovery paths:

```sh
# BlueZ-managed active discovery; normally does not require root.
python3 tools/ble-probe.py bluez --adapter hci0 --seconds 30
python3 tools/ble-probe.py bluez --seconds 300 --candidates-only --stop-on-candidate

# Release a scan owned by bluetoothctl before taking direct controller access.
bluetoothctl scan off

# One passive window followed by one active window; requires raw-HCI access.
sudo python3 tools/ble-probe.py compare --adapter hci0 --seconds 30
```

Raw mode first tries extended LE scanning, then falls back to legacy scanning
when the controller does not support it. It does not stop `bluetoothd`, change
adapter power, print Bluetooth addresses, or write scan results to disk. Use
`--candidates-only` to show only Ray-Ban/Meta/Luxottica indicators. A
controller already owned by another scanner may return `Command Disallowed`;
stop that discovery session and retry. The assigned company/service
identifiers are discovery hints only, not proof that an observation is a pair
of glasses. Manufacturer IDs are little-endian on the wire, so Luxottica
`0x0D53` appears as the leading bytes `53 0D` in manufacturer data.
`--stop-on-candidate` exits the current BlueZ or raw-HCI window immediately
after printing the first configured research indicator. In `compare` mode, a
passive match also skips the active window because the requested result has
already been observed.

On Python 3.14 and newer, raw HCI binds with the direct integer `device_id`;
older Python falls back to the historical one-element tuple. Each raw socket,
filter, and command-send failure names its exact stage. A bare one-element HCI
tuple produced `EINVAL` on the first Python 3.14 physical comparison attempt.
The next attempt reached `HCI_FILTER` and exposed a separate ABI issue: Linux's
14 bytes of filter fields have a 16-byte `sizeof(struct hci_filter)`. The packed
filter therefore includes the required two trailing padding bytes.

## Static site

Start the local server:

```sh
./scripts/serve-site
```

Open <http://127.0.0.1:4173>. Localhost counts as a trustworthy context for
browser device APIs, although browser and operating-system support still vary.
The site has no package install or build step.

Browser protocol tests run without a USB device:

```sh
node --test tests/*.test.mjs
```

These tests verify packet shapes and safety validation. They do not prove that
the WCH ROM bootloader, an OS driver, or a real badge accepts the flow.

The `/flash/` page can configure a locally loaded survey BIN entirely in the
browser. Select the exact printed `260404` or `250901` profile first. The page
requires the embedded configuration profile to match, preserves the immutable
base bytes in memory, patches a copy, computes a new SHA-256, resets all
prepared-flash bindings, and offers the configured BIN for download.
Changing a checkbox or custom rule makes the current artifact dirty and blocks
flashing until **Apply monitoring options** succeeds. Node tests cover the
binary codec, CRC, exact-one-block rule, canonical values, profile mismatch,
and source-buffer immutability.

Prepare the same network-free firmware publication bundle used after CI:

```sh
FROGALERT_PUBLISH_COMMIT="$(git rev-parse HEAD)" \
  node scripts/firmware-release-plan.mjs tmp/release-publication
```

With the current catalog this prepares the published release bundles under
`tmp/`. It never builds, flashes, uploads, tags, or publishes firmware. GitHub
writes occur only in the post-CI workflow after the same bundle has passed
validation.

## Phone and cloud firmware workflow

Firmware development does not require a local MRS installation. Edit the
source and `firmware/fossasia-usbc/version.json`, then push the commit to
`main` from Codex cloud or GitHub. The **CI** workflow builds both board
profiles and both visible-view lanes, performs the embedded audits, attests the
outputs, and uploads `frogalert-candidate-<commit>` for 90 days. The same
workflow can be started manually from the GitHub Actions page when a rebuild is
needed without another source change. Active firmware changes must strictly
advance the semantic version; `scripts/require-firmware-version-bump.mjs`
enforces that invariant before immutable release identities can collide.
`workflow_dispatch` skips the expensive rebuild when that version's complete
counter pair is already published and reconciles it instead; a missing pair
causes the normal build-and-publish path to run. An ordinary later `main` push
also rebuilds a still-missing current version after an earlier publication race,
without treating that catch-up build as an active-source version change.

The first publication requires the exact candidate artifact and its GitHub
attestations. Once published, the complete GitHub Release asset set is the
durable, hash-checked source for future site rebuilds after the Actions artifact
expires; candidate integrity failures are never eligible for that fallback.

The Actions summary identifies the declared version, top and bottom files,
their SHA-256 values, artifact id, archive digest, and download link. After the
canonical build, audits, attestations, and quarantine checks succeed, the
post-CI workflow generates the standard counter descriptor pair, publishes the
GitHub Release, and places the identical BINs on the site. It records
`hardware_verified: false`, `verification_basis: "ci-audited"`, and
`flash_approved: true`, so the new version is phone-flashable immediately
without pretending it passed a badge smoke. Do not build or commit a replacement
BIN from another machine during publication.

Physical testing still matters: flash and test those exact published bytes,
then add hash/profile/PCB-bound evidence before changing their hardware status.
Changing the version creates an automatic release only after all CI publication
gates pass; it never creates an automatic hardware claim. Lab images, the frog
lane, local configured derivatives, and recovery firmware retain their separate
approval rules.

## Embedded firmware

The supported replacement path is the pinned FOSSASIA USB-C hardware shell in
`firmware/fossasia-usbc/`. It preserves the startup assembly, linker layout,
clocks, USB HID+CDC, BadgeMagic BLE/TMOS stack, display, buttons, and KEY2 ISP
task that already work together on the photographed badge.

Prepare the exact source and toolchain, or let the build script prepare them:

```sh
./scripts/prepare-fossasia-usbc --source-only
./scripts/prepare-fossasia-usbc --with-toolchain
```

The Rust application requires the pinned compiler and target:

```sh
rustup toolchain install 1.98.1 --profile minimal \
  --component llvm-tools-preview --target riscv32imc-unknown-none-elf
./scripts/run-rust-toolchain stable cargo test -p frogalert-emulator
./scripts/run-rust-toolchain stable cargo run --release -p frogalert-emulator -- --soak-hours 24
bash scripts/verify-rust-abi
```

The emulator uses the shipping application with a fake clock and injected SDK
failures. It does not emulate physical RF, USB, or electrical behavior. Local
reproduction remains available but is optional. The default profile is
the newer Nyx `B1144C_260404_USB_C` board:

```sh
./scripts/build-fossasia-usbc baseline --check
./scripts/build-fossasia-usbc canary --check
./scripts/build-fossasia-usbc survey --candidate
./scripts/build-fossasia-usbc frogs --candidate
```

Build the legacy board by naming it explicitly:

```sh
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --candidate
./scripts/build-fossasia-usbc B1144C_250901_USB_C frogs --candidate
```

`B1144C_260404_USB_C` and `B1144C_250901_USB_C` use the same 23 display nets
and KEY2/PB22 behavior. Their KEY1/PA1 profiles differ: the default uses
pull-up/active-low; the legacy build uses pull-down/active-high. For survey
screen off, `260404` arms top KEY2/PB22 only, while `250901` arms top KEY1/PA1
rising plus KEY2/PB22 falling for held recovery. The build output is
`tmp/fossasia-usbc/build/<PROFILE>/<LANE>/`. Do not collapse these artifacts
into one hash or infer the profile from an untouched KEY1 input.

The canary adds one retained C metadata string and owns no functions or
hardware. The survey lane keeps the same shell, uses WCH's combined
central/peripheral role pattern, and adds only a disconnected three-second
passive scan plus a button-selectable fixed aggregate-count frame. The physical
bottom button rotates
`Name 1 → Bluetooth counter → Name 2 → Bluetooth counter`; it is KEY1 on
`260404` and KEY2 on `250901`. The physical top button is the other key and
cycles normal → download → hardware shutdown; wake cold-boots normal. Long physical-
bottom presses change brightness on both profiles. Top/`260404` retains the
upstream 25-sample KEY1 action. Bottom/`250901` classifies a 25-through-99-
sample KEY2 hold as brightness only on release; holding through that window
leaves the separate roughly 2.2-second KEY2 ISP poll unchanged. The
bottom/view transition does not advertise or start the Bluetooth
animation; the top/system transition owns that behavior. Screen off disables
advertising and discovery, waits for Central idle, then stops TMR0/TMR3 and
enters CH582 shutdown. Exact-profile early wake retains the existing 200 ms
held-KEY2 ISP task before BLE/USB/display startup. Beta.15 restores beta.12's
low-power boundary after the owner clarified the suspected upload failure was
likely environmental Bluetooth noise. Beta.16 disables `CHARGE_STT` as a
shutdown wake source and requires a valid profile-bound button to remain
asserted at early boot; charger cycling or a GPIO glitch therefore returns to
shutdown rather than lighting the badge.
Scanning continues in either
visible view. The counter retains the last completed result while a new scan is
running, then changes once when that scan completes. It consumes the final
discovery list and feeds
live public-address/name/service data into the shared Rust classifier for every
README detection row. The selected result has fixed priority: BadgeMagic frogs, then
KARR, COP, Flipper, and finally custom rules. A later report replaces the
visible overlay only when its result has strictly higher priority. Cop,
Flipper, KARR, and custom alerts use no more than two fixed pages, show each
page exactly once for one second, and restore the selected view after the last
page.
KARR requires a case-insensitive `QT ` prefix at the start plus
a non-empty serial value. An exact case-insensitive `LED Badge Magic` name or
advertised `0xFEE0` service shows three frogs in alternating poses for three
one-second frames. Passive scans may omit scan-response-only names, so the service
fallback is deliberately broad and may false-positive.

After each three-second discovery, the next attempt waits about 17 seconds.
That gives a roughly 20-second start-to-start cadence, and a continuously
present match can retrigger once in each new window.

The FOSSASIA shell always allocates an initial bitmap even when data flash has
no valid or visible nametag content. After boot and each BadgeMagic list reload,
the survey patch scans every loaded bitmap. If all pixels are zero, it collapses
the empty list to one RAM-only scrolling `503.PARTY` bitmap. Any nonzero
uploaded bitmap bypasses the fallback, and the fallback never writes data
flash.

Each survey contains one 384-byte `FROGALERTCFGv1` block. Its default enables
the police, Flipper, KARR, Ray-Ban/Meta, and BadgeMagic target groups with no
custom rules. The Ray-Ban/Meta bit covers both name hints and the conservative
same-report `0x01AB` + `0xFD5F` pair. The browser codec can encode at most eight custom rules using
case-insensitive name contains/prefix/exact, canonical public OUI, or 16-bit
service matching, with a 24-character value and 16-character badge message.
The block includes the compiled profile id and CRC32. Firmware validates its
schema, lengths, reserved bytes, padding, profile, and CRC before enabling
alerts.

The display hook stops the original animation only on ownership transition.
It redraws the counter once per completed survey and holds that frame during
the next scan. Internal phases are explicit Rust state and never share the count display. Alert text redraws only at the one-second page boundary.
Each FrogAlert frame is completed in an inactive
private buffer before an atomic index switch. The timer interrupt uses that
committed buffer as the final LED source while FrogAlert owns the panel, so a
blink, marquee, base animation, or queued Bluetooth animation cannot overwrite
the visible alert through FOSSASIA's shared framebuffer. Patched original event
handlers also consume queued work without rescheduling it while the overlay is
active. A one-shot timer is anchored to alert start, never wraps the pager, and
releases the selected view after `frame count × one second`. The survey
yields to app streaming and non-normal modes, never initiates a connection,
zeroes its fixed address table, restores prior advertising state, and cancels a
stuck scan after five seconds.

The allocation-free Rust application owns deadlines, detection, rendering,
configuration, and upload validation behind the tested primitive C ABI. The
pinned MRS linker consumes its static library after LLVM objcopy removes only
unsupported non-loadable RISC-V attribute metadata. Candidate receipts record
the Rust compiler commit and library hash. All lanes use `USBC_VERSION=1`, validate pinned archive/tool
hashes and critical sources, audit required runtime symbols and linked
instructions, keep at least 8 KiB of stack/runtime RAM headroom, and keep
everything under ignored `tmp/fossasia-usbc/`. Profile-specific size/SHA-256
locks are in `firmware/fossasia-usbc/upstream-lock.json`. No local build command
flashes or publishes. Canonical CI alone may auto-publish the audited standard
counter pair, and a successful build is never an automatic hardware-test claim.

Set `FROGALERT_FOSSASIA_OFFLINE=1` to prohibit downloads and require an already
populated verified cache. See `firmware/fossasia-usbc/upstream-lock.json` for
the exact archive, compiler, tool, source, ELF/BIN, and runtime-file pins.

### Quarantined standalone Rust runtime

The `firmware/` Rust workspace still contains the historical pixel-walk and
passive count wrappers. They are retained to test reusable logic and the vector
regression guard, not to produce flashable images. The first physical
pixel-walk test exposed an incompatible PAC/runtime vector layout: Timer 0's
live vector points to `DefaultInterruptHandler`, so the image wedges before
display refresh or KEY2 polling. The count ELF has the same defect.

The embedded build contract is pinned to:

- Rust `nightly-2026-07-17`;
- target `riscv32imc-unknown-none-elf`;
- `rustfmt` and `llvm-tools-preview`;
- a build-relevant vendored subset of `ch58x-hal` commit
  `611954e40cc4a562f0c4756ab4c0a935af6158df`;
- four recorded HAL patches: replacing the unavailable `ch58x` `0.4.0`
  dependency with published `0.3.0`; forming the writable BLE heap pointer
  without an aliasing shared reference to `static mut`; gating async GPIO
  machinery behind the `embassy` feature; and adding the missing synchronous
  SysTick `delay_ns` implementation.

The `imc` target is intentional even though the CH582M advertises the RISC-V
atomic extension. QingKe V4 atomic read/modify/write operations are not trusted.
The build therefore uses critical sections for callback/interrupt shared state,
and the build script rejects an ELF containing AMO, LR, or SC instructions.
Never change this target to `riscv32imac-unknown-none-elf` or enable
`unsafe-trust-wch-atomics` merely to make a build pass.

Install the exact toolchain if rustup has not already done so:

```sh
rustup toolchain install nightly-2026-07-17 \
  --profile minimal \
  --component rustfmt \
  --component llvm-tools-preview \
  --target riscv32imc-unknown-none-elf
```

Both diagnostic build helpers explicitly select that toolchain and target, use
the locked firmware dependency graph, ignore environment target-directory and
Rust-flag overrides, and select only the intended binary. They validate the
exact final ELF as 32-bit RISC-V IMC, reject AMO/LR/SC instructions, and then
run `scripts/audit-ch58x-vectors.mjs`. The audit intentionally fails on the
known misplaced external table before `objcopy`; any stale BIN is removed.

### Failed pixel-walk diagnostic

Run only to reproduce the vector failure and retain a diagnostic ELF/report:

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup B1144C_250901_USB_C --check
```

The source intended to keep exactly one logical framebuffer bit set and advance from
`(0, 0)` left-to-right across 44 columns, then down through 11 rows, every
750 ms. UART1/PA9 reports each coordinate at 115200 baud. The display pins use
the lower 5 mA drive setting and a 250 us drive/release cadence. The build does
not enable the HAL BLE feature, initialize Embassy, or select a 32 kHz radio
clock. Its KEY2 source is never reached after the first Timer 0 interrupt on the
linked image. The build exits nonzero with `[external-section]` and
`[tmr0-vector-target]` findings and emits no BIN.

Its temporary paths are:

- ELF:
  `tmp/build/frogalert-pixel-walk-<PROFILE>/riscv32imc-unknown-none-elf/release/frogalert-pixel-walk`
- audited disassembly: `tmp/firmware/frogalert-pixel-walk-<PROFILE>.disassembly.txt`
- vector report: `tmp/firmware/frogalert-pixel-walk-<PROFILE>.vectors.txt`

`<PROFILE>` is exactly `HARDWARE_REV1` or `B1144C_250901_USB_C`. The USB-C
candidate map is pinned to FOSSASIA source `9ce885d` and physical marking
`B1144C_250901`; generic `BM1144-C`, Rev2, and Rev3 names are not aliases. Do
not bypass the audit or recover an older temporary BIN for flashing.

### Failed passive-count diagnostic

Run a formatting, cross-link, instruction, recovery-symbol, and vector audit:

```sh
./scripts/build-count-firmware HARDWARE_REV1 --check
```

The diagnostic keeps generated material out of release directories:

- ELF:
  `tmp/build/frogalert-count/riscv32imc-unknown-none-elf/release/frogalert-count-firmware`
- audited disassembly:
  `tmp/firmware/frogalert-count-HARDWARE_REV1.disassembly.txt`
- vector report: `tmp/firmware/frogalert-count-HARDWARE_REV1.vectors.txt`

The audit fails before BIN extraction because this ELF has the same misplaced
external table and Timer 0 target. No form of this wrapper is approved for a
hardware test or website manifest.

The historical lab source schedules a three-second LE 1M passive scan, counts
distinct advertiser addresses in a fixed 64-entry table, shows the result for
seven seconds, and repeats. That behavior is host-tested but never ran usefully
on the badge because the embedded wrapper is quarantined. A saturated window
would render `64+`. The table is zeroed after each window; no address is logged,
persisted, or transmitted.
Because BLE addresses can be randomized, the result is an approximate count of
advertisers seen, not a count of people or physical devices.

This historical lab source is observer-only. It does not advertise the BadgeMagic
`FEE0/FEE1` service and cannot be configured by the BadgeMagic app. The exact
PCB matrix mapping and orientation, radio reception, display refresh, and
current draw all remain physical-hardware questions. Replacement scanning must
be scheduled inside the FOSSASIA shell so it retains the proven calibrated
internal-LSI setup and BadgeMagic peripheral behavior.

## Physical development gate

Before the first device write:

1. Open the badge.
2. Confirm the package marking is `CH582M`.
3. Confirm an 11×44 LED matrix and record the PCB revision.
4. Select the exact `B1144C_260404_USB_C` or
   `B1144C_250901_USB_C` profile from that marking; do not infer it from
   an untouched button input.
5. Enter ISP read-only and run `wchisp info`.
6. Compare the result to the expected CH582/type `0x16` target.
7. Ask explicitly before performing the irreversible first flash.

See [HARDWARE.md](HARDWARE.md) and [RELEASE.md](RELEASE.md).
