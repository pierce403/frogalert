# Architecture

## Feasibility

Rust is feasible for FrogAlert's portable logic, but the next badge images will
not use a Rust-owned CH582 runtime. The first standalone Rust pixel-walk image
booted blank because an incompatible PAC/runtime pair placed its external
interrupt table outside the live RAM vector area. Timer 0 entered the default
infinite-loop handler before display refresh or KEY2 polling could run.

The exact FOSSASIA USB-C firmware at source `9ce885d` has now booted on the
photographed badge and physically demonstrated its normal KEY2 ISP affordance.
FrogAlert therefore uses that firmware as its initial hardware shell and keeps
these systems intact:

- WCH startup assembly, linker script, reset and interrupt vectors;
- 60 MHz clock initialization and calibrated internal-LSI BLE clock;
- USB HID+CDC application stack;
- WCH BLE/TMOS stack and BadgeMagic `FEE0/FEE1` service;
- persistent nametag parser/framebuffer, display timer, and button behavior;
- the roughly 2.2-second KEY2 task that transfers to mask-ROM ISP.

Rust remains `no_std` and allocation-free behind a primitive C ABI for
advertisement parsing, classification, and counting. C continues to own reset,
vectors, interrupts, clocks, USB, BLE role setup, scheduling, and display
refresh. The WCH GCC/linker path performs the final link. This preserves known
working behavior while still allowing most FrogAlert policy to be written and
tested in Rust.

## USB-C profile boundary

The FOSSASIA shell is compiled into one of two exact board profiles:

| Profile | KEY1 pull and pressed level | Shutdown wake |
| --- | --- | --- |
| `B1144C_260404_USB_C` (default) | pull-up, active low | falling edge |
| `B1144C_250901_USB_C` | pull-down, active high | rising edge |

Both profiles retain the same `USBC_VERSION=1` 23-net LED matrix and
KEY2/PB22 active-low path. The newer profile applies only the three pinned
KEY1 source transformations before compilation.

There is no safe runtime profile probe. An untouched KEY1 switch is open on
both boards, and PA1 follows whichever internal pull the firmware chooses. A
held-KEY1 weak-pull experiment was removed after a physical `250901` test
falsely selected `260404` and swapped the short-button roles. The survey lane
therefore keeps the compiled exact profile for KEY1 polarity and short-button
routing without modifying the KEY2 long-press ISP path.
Separate artifacts and exact printed markings remain mandatory.

## Replacement-image progression

The old `frogalert-pixel-walk` and `frogalert-count` standalone runtime images
are retained only as source/forensic history and must not be flashed. Both link
the defective external-vector layout.

The lowest-risk first derived test image remains a **C-only compatibility canary** derived from
the exact FOSSASIA USB-C shell. It changes only self-identifying metadata, not
display, USB, BLE, button, or recovery behavior. After its complete physical
smoke passes, an **ABI-only Rust canary** links a tiny Rust static library and
calls a version function without changing radio or panel behavior.

A later **C-only passive-survey candidate** is now implemented so the radio
experiment is reviewable and reproducible before its turn in that sequence. It
does not supersede the canary gates. It initializes WCH Central beside the
existing Peripheral role using WCH's official combined-role pattern, but only
starts passive discovery while the app is disconnected and the badge is in
normal, non-streaming mode. It does not rely solely on the Central initialization
callback: FOSSASIA starts Peripheral first, so that combined-role event may
precede registration of the survey callback. A successful Central start also
arms the first scan.

The physical bottom button gains a virtual counter view:
`Name 1 → Bluetooth counter → Name 2 → Bluetooth counter → …`. This is KEY1 on
`260404` and KEY2 on `250901`. The physical top button is the other key and
cycles normal → download → recoverable application screen off → normal. Screen
off disables advertising and passive discovery, stops TMR0, and releases the
matrix while retaining TMR3, TMOS, USB, and the ordinary 200 ms held-KEY2 ISP
task. Beta.14 restores this beta.11 boundary because beta.12's hardware-shutdown
experiment regressed Android BadgeMagic name uploads. A
physical-bottom hold changes brightness on either profile. The
`250901` classifier emits KEY2 brightness only when the button is released
between about 0.5 and 2 seconds; a continued hold therefore reaches ISP without
first dispatching brightness. The view choice is
presentation state rather than radio state, so disconnected passive surveys
continue while either the nametag or counter is visible. The profile-mapped
bottom/view transition never enables advertising or starts the Bluetooth
animation; only the physical top/system transition does.

FrogAlert renders fixed counts, alert pages, and frog frames into the inactive
one of two private 44-column buffers, then switches buffers only after the
frame is complete. The final timer interrupt selects that committed overlay
instead of FOSSASIA's shared animation framebuffer while FrogAlert owns the
panel. This output-stage boundary protects alerts from blink, marquee, every
base animation mode, and queued Bluetooth animation work even if one of those
tasks writes the shared framebuffer. App streaming and non-normal system modes
still deliberately suspend FrogAlert and return the panel to FOSSASIA.

The counter's final character shows `I` for initialization, `R` for
ready/waiting, `S` for active scan, `E` for error, or `T` for watchdog timeout.
The suffix disappears for a completed Bluetooth-rune `00` to `64+` result. Live report
events update the count during `S`, and the final discovery list is consumed as
a fallback. Each survey temporarily stops advertising, scans for three
seconds, restores the prior advertising state, and waits about 17 seconds.
That produces a roughly 20-second start-to-start cycle. The fixed address table
is explicitly zeroed, and the code never establishes a central connection.

The candidate mirrors every README OUI and name rule in a bounded C classifier.
OUI rules run only for controller-reported public addresses. Complete and
shortened local names are matched case-insensitively for `Axon Body`, `TASER`,
`Flipper`, `Ray-Ban`, and `Ray Ban`. Advertised 16-bit service `0x3081`,
`0x3082`, or `0x3083` is an additional passive Flipper signal. A name beginning with case-insensitive
`QT ` and a non-empty serial value produces `KARR DETECTED`. The Ray-Ban target
also produces `COP DETECTED` when manufacturer ID `0x01AB` and service `0xFD5F`
occur together in the same passive report; neither field matches alone. The resulting
text overlay shows each generated fixed page exactly once for one second and
then restores the selected nametag/count view. An exact case-insensitive
`LED Badge Magic` name or an advertised `0xFEE0` service triggers two
one-second alternating frames of three frogs. Passive scans may omit a name
carried only in scan response, so
the service match is an intentional fallback and may false-positive another
compatible device that advertises `0xFEE0`.

This bounded C mirror makes the full policy inspectable in the current hardware
shell; it does not skip the separate Rust ABI-canary gate. The display hook
stops the original animation only when an overlay or selected counter takes
ownership. The original animation tasks may already have queued their next
events, so the patched handlers also consume marquee, flash, fixed-animation,
and Bluetooth animation steps while FrogAlert owns the panel. They do not
reschedule until the frame-count-derived overlay releases ownership and
restores the selected nametag/count view.

The survey lane also carries the narrow display timing change from
`bkero/badgemagic-firmware` commit `074c448`. Timer 0 now ticks at 16 kHz.
Because the ISR walks 22 column pairs over four PWM ticks, that produces about
182 complete frames per second instead of about 45. The off-period releases
the matrix pins only on its first tick rather than repeating the same 23-pin
operation on every later off tick. Baseline and metadata-only canary lanes
remain byte-locked to their previous behavior; the higher-rate survey image
needs physical BLE, brightness, current, USB/app, and recovery testing on both
exact profiles.

Each profile/lane combination has an independent audited size and SHA-256. The
canonical standard counter pair is published automatically after its source-
bound CI build, linked-image audits, attestations, quarantine check, and atomic
profile validation. The frog lane, canaries, and local configured derivatives
remain outside that auto-publication path.

Every published descriptor states whether USB `0416:5020` HID+CDC enumeration,
BadgeMagic app uploads, ordinary buttons, the visible KEY2 dot cue, and ISP
enumeration as `4348:55e0`/`1a86:55e0` have actually been observed for that
hash. The standard auto-release starts with `hardware_verified: false`; only
hash/profile-bound evidence may change that status.

## Monitoring configuration boundary

The survey image retains one 384-byte, fixed-layout configuration block in
read-only image data. It contains:

- magic/schema/size and a CRC32;
- the compiled hardware-profile id;
- a bit mask for police, Flipper, KARR, Ray-Ban/Meta, and BadgeMagic built-ins; and
- up to eight custom name-contains, name-prefix, name-exact, public-OUI, or
  16-bit-service rules with bounded ASCII values and display messages.

Enabled built-ins run before custom rules. A malformed
block, unknown bit/type, nonzero padding, CRC failure, or profile mismatch
disables alerts while leaving the scan/count path available. The static web
flasher finds exactly one block, validates it, and patches a copy without
changing the embedded profile. The configured copy receives a new SHA-256,
loses any inherited verification status, and remains a local developer
artifact.

## Release and website publication

The generated schema-v5 manifest metadata is the single source for both
publication surfaces:

```text
successful main CI commit
  -> retrieve the exact source-bound main-CI Actions artifact
  -> verify archive metadata, candidate receipt, BIN/ELF hashes, and attestations
  -> reject quarantined bytes and validate the atomic counter profile pair
  -> generate CI-audited, hardware-unverified release descriptors
  -> create a compare-and-swap metadata commit on main
  -> prepare immutable release bundle
  -> draft GitHub Release
  -> upload and download-hash every asset
  -> publish GitHub Release
  -> deploy the already validated Pages artifact
  -> /flash lists the same-origin manifest entry
```

GitHub Releases are archival and human-facing. The browser does not query the
GitHub API or flash its assets; it downloads the manifest-listed same-origin
BIN and hashes it again locally. A website-only run creates no firmware release
when the current version's complete pair already exists. If that pair is still
missing after a publication race, current `main` rebuilds it as a recovery
candidate. Published tags and assets are immutable under the reconciler:
metadata or byte drift fails the workflow rather than overwriting a release.

The phone flasher deliberately performs expensive work before the short
ROM-ISP window. It automatically validates and retains both members of the
latest atomic release pair and displays their provenance, hardware status, and
concise target/risk disclosure without an acknowledgement gate. Its first
instruction is to hold either Top or Bottom, with the display upright, to enter
ISP and remember which button worked. When an authorized WCH ISP device
appears, the
captured interface has priority over all remaining UI work: configuration and
endpoint validation are followed immediately by `0xA1` Identify and `0xA7`
Read Config. This is the browser equivalent of the useful read-only portion of
`wchisp info` and keeps the session active for the destructive transfer.

Only after that exchange proves CH582 `0x82/0x16` does the wizard ask which
physical button produced ISP. **Top button** selects the prevalidated
`B1144C_260404` artifact and **Bottom button** selects the prevalidated
`B1144C_250901` artifact. The answer control is also the sole in-page consent
and final destructive activation: it atomically binds the chosen bytes and
captured device, acquires
the cross-tab/session locks, revalidates every gate, and begins config reset,
flash, and verify without another Continue dialog. Connection and read-only
info can never trigger that transition, a suggested guide path cannot answer
it automatically, and an unknown answer fails closed.

The separate Actions candidate is schema-v3 build evidence containing both
profile-specific counter or frog BIN/ELF pairs, their checksums, declared
semantic version, and GitHub run provenance. Its raw metadata fixes every
approval and publication flag to false. It is not itself a GitHub Release. The
post-CI workflow may derive and publish only the standard counter pair from it,
with exact cloud provenance, `verification_basis: "ci-audited"`,
`flash_approved: true`, and `hardware_verified: false`. Physical evidence is an
optional later status upgrade, not a prerequisite for that publication.

## Quarantined standalone count prototype

`firmware/frogalert-count/` was designed as a deliberately narrower experiment
than the eventual product. Its intended data path is:

```text
passive LE 1M advertisement callback
  -> fixed-capacity ScanCounter<64>
  -> 11x44 numeric framebuffer (`0` through `64+`)
  -> revision-gated timer-driven matrix refresh
```

The source schedules a three-second passive scan, holds the resulting count for
seven seconds, then starts another scan. Duplicate addresses within a window count
once. At capacity, later unique addresses set a saturation flag and the panel
shows `64+`. On completion, the address table is explicitly zeroed. The badge
does not write a scan history or transmit observations.

This is an approximate count of advertiser addresses, not physical devices.
BLE address randomization can split one physical device across windows, and a
device that does not advertise during the three-second window is absent.

Its core counting and framebuffer logic is host-tested and reusable. Its
embedded wrapper is not. The same PAC/runtime mismatch as the failed
pixel-walk places `__EXTERNAL_INTERRUPTS` in flash while the live table expects
it in RAM, so the timer-driven image is quarantined even though its atomic
instruction audit passed.

The historical lab source is observer-only and was enabled only for
`HARDWARE_REV1`: it has no BadgeMagic `FEE0/FEE1` GATT service,
does not advertise as `LED Badge Magic` or `LSLED`, and cannot receive nametag
content from the BadgeMagic app. It must not be packaged or flashed.

Neither exact USB-C profile is available for this old wrapper. Its vendored
Rust BLE initializer hardcodes external LSE. Replacement scan work instead
stays inside the FOSSASIA C BLE/TMOS shell, which already selects and
calibrates the CH582 internal low-speed oscillator; role switching and radio
behavior still require physical validation.

## Survey candidate and target combined firmware

The survey candidate initializes both WCH roles but never scans and advertises
at the same time. Its conservative radio schedule is:

```text
Selected view: uploaded name or latest count
  -> passive survey remains scheduled in either view
Peripheral advertising (about 17 s)
  -> only scan if no app connection is active
Observer/passive scan (3 s)
  -> update bounded unique-address count and local rule matches
Temporary alert/frog overlay, when matched
  -> restore selected name/count view and prior advertising state
```

The remaining hardware question is whether this combined-role initialization
and advertising pause behave reliably on the badge's WCH stack. If they do
not, the fallback is a short scheduled reboot into observer mode with retained
framebuffer/config in data flash, followed by a reboot back into peripheral
mode. That costs power and creates a short app-discovery gap, but keeps the
behaviors isolated.

## Compatibility contract

The BadgeMagic app's legacy path expects:

- advertised device name recognized by the app (`LED Badge Magic` / `LSLED`);
- service UUID `0xFEE0`;
- write characteristic UUID `0xFEE1`;
- a stream of 16-byte chunks beginning with the `wang\0\0` header;
- up to eight 11-row bitmaps plus mode/speed metadata.

FrogAlert must store and render that content unchanged. Detection alerts are a
temporary overlay; they must never overwrite the uploaded nametag payload.
The survey candidate keeps the count as a separate KEY2-selected view and
releases display ownership after each bounded alert. This is build-layer
behavior, not proof of the target UX; it still needs app, button, recovery,
view-restoration, and power-cycle regression evidence on hardware.

## Detection policy

`frogalert-core` is allocation-free and `no_std`. Matching is deliberately
small and explainable:

- OUI rules run only for controller-reported public addresses. Random BLE
  addresses make the first three bytes unsuitable as vendor evidence.
- detection-name rules examine Complete or Shortened Local Name advertisement
  fields. Most are ASCII case-insensitive substring matches; KARR requires
  case-insensitive `QT ` at the beginning plus a non-empty serial value, and
  the friendly `LED Badge Magic` frog trigger requires an exact
  case-insensitive name.
- observations are discarded after classification. The badge has no scan log,
  network client, or telemetry.
- custom rules are evaluated in their encoded order before enabled built-ins;
  the first match wins. The current browser customization rewrites a bounded
  block in a local firmware copy; it does not add runtime GATT configuration or
  writable data-flash ownership.

## Firmware milestones

1. Reproduce and audit the pinned FOSSASIA USB-C baseline and retain its full
   C hardware/runtime shell.
2. Flash a metadata-only C canary and pass USB, BadgeMagic, buttons, normal
   KEY2 recovery, known-good reflash, and power-cycle tests.
3. Link a primitive-ABI Rust canary with no behavior change and repeat the same
   acceptance test.
4. Call the Rust classifier with synthetic advertisements while preserving the
   normal nametag path.
5. Hardware-test the existing private passive-survey candidate while
   disconnected, exercise the name/count KEY2 rotation and bounded overlays,
   and prove that ephemeral addresses are cleared afterward.
6. Replace the bounded C policy mirror with the same behavior through the
   separately smoke-tested Rust ABI.
7. Prove observer/peripheral role switching and the target roughly 20-second
   cadence without breaking USB, app uploads, or recovery.
8. Measure current draw and tune scan, display, and sleep timing.
