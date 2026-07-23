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

Short KEY2 presses extend FOSSASIA's existing display-selection behavior with a
virtual counter view: `Name 1 → BT counter → Name 2 → BT counter → …`. KEY1
keeps its upstream system-mode behavior and long-press brightness action. The
separate roughly 2.2-second KEY2-to-ISP poll is unchanged. The view choice is
presentation state rather than radio state, so disconnected passive surveys
continue while either the nametag or counter is visible.

The counter's final character shows `I` for initialization, `R` for
ready/waiting, `S` for active scan, `E` for error, or `T` for watchdog timeout.
The suffix disappears for a completed `BT 00` to `BT 64+` result. Live report
events update the count during `S`, and the final discovery list is consumed as
a fallback. Each survey temporarily stops advertising, scans for three
seconds, restores the prior advertising state, and waits about 57 seconds. The
fixed address table is explicitly zeroed, and the code never establishes a
central connection.

The candidate mirrors every README OUI and name rule in a bounded C classifier.
OUI rules run only for controller-reported public addresses. Complete and
shortened local names are matched case-insensitively for `Axon Body`, `TASER`,
`Flipper`, `Ray-Ban`, and `Ray Ban`; the resulting `COP DETECTED` or
`FLIPPER DETECTED` overlay lasts five seconds and then restores the selected
nametag/count view. An exact case-insensitive `LED Badge Magic` name or an
advertised `0xFEE0` service triggers two alternating frames of three frogs for
two seconds. Passive scans may omit a name carried only in scan response, so
the service match is an intentional fallback and may false-positive another
compatible device that advertises `0xFEE0`.

This bounded C mirror makes the full policy inspectable in the current hardware
shell; it does not skip the separate Rust ABI-canary gate. The display hook
stops the original animation only when an overlay or selected counter takes
ownership, then resumes the uploaded nametag without modifying it. FOSSASIA's
underlying roughly 45 Hz matrix refresh is unchanged.

The C-only canary now builds as 177,788 bytes at SHA-256
`6591f55f6035721384dd2780cb66c03d58e5e08817a1b4e5808a9d2821503e87`.
It is intentionally absent from the public manifest pending physical evidence.
The survey candidate builds as 201,412 bytes at SHA-256
`42a42f4a1aeedafeafc4e2d14c95c467f2eb4e3397f8712be555b1b99330e650`.
Its audited section sizes are 192,920 bytes of text, 8,492 bytes of data, and
4,588 bytes of BSS, with 9,788 bytes of measured stack/runtime headroom. It is
likewise private, hardware-unverified, and not flash-approved.

Each stage must retain USB `0416:5020` HID+CDC enumeration, BadgeMagic app
uploads, ordinary buttons, the visible KEY2 dot cue, and ISP enumeration as
`4348:55e0`/`1a86:55e0` after a power cycle. No stage is copied from `tmp/` to
the public site before that exact artifact has hash-bound evidence.

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

The exact `B1144C_250901_USB_C` profile remains unavailable for this old
wrapper. Its vendored Rust BLE initializer hardcodes external LSE. Replacement
scan work instead stays inside the FOSSASIA C BLE/TMOS shell, which already
selects and calibrates the CH582 internal low-speed oscillator; role switching
and radio behavior still require physical validation.

## Survey candidate and target combined firmware

The survey candidate initializes both WCH roles but never scans and advertises
at the same time. Its conservative radio schedule is:

```text
Selected view: uploaded name or latest count
  -> passive survey remains scheduled in either view
Peripheral advertising (about 57 s)
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
- detection-name rules are ASCII case-insensitive substring matches against
  Complete or Shortened Local Name advertisement fields; the friendly
  `LED Badge Magic` frog trigger requires an exact case-insensitive name.
- observations are discarded after classification. The badge has no scan log,
  network client, or telemetry.
- the first match wins. A future rule table stored in data flash can add
  priorities and app-side configuration.

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
7. Prove observer/peripheral role switching and the target roughly 60-second
   cadence without breaking USB, app uploads, or recovery.
8. Measure current draw and tune scan, display, and sleep timing.
