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
normal, non-streaming mode. As a deliberately obvious diagnostic, it begins a
continuous `BT 00` scroll before the first scan and replaces the normal nametag
view with the latest `BT 00` to `BT 64+` count between surveys. It yields the
panel to app streaming and non-normal modes. Each survey temporarily stops
advertising, scans for three seconds, restores the prior advertising state,
and waits about 57 seconds. A five-second watchdog cancels a stuck discovery.
The fixed address table is explicitly zeroed, and the code never establishes a
central connection. The eventual product still needs temporary alerts that
restore the user's nametag; this persistent view exists only to make the first
radio/display test unmistakable.

The C-only canary now builds as 177,788 bytes at SHA-256
`6591f55f6035721384dd2780cb66c03d58e5e08817a1b4e5808a9d2821503e87`.
It is intentionally absent from the public manifest pending physical evidence.
The survey candidate builds as 199,076 bytes at SHA-256
`d9bb8465e5784c77e06304e555577ffedd56eb229dcc7de5ae9ac0ab5044e193`
with 9,820 bytes of measured stack/runtime headroom. It is likewise private and
hardware-unverified.

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
Persistent latest-count scroll (starts at diagnostic BT 00)
  -> yield while app streaming or badge is outside normal mode
Peripheral advertising (about 57 s)
  -> only scan if no app connection is active
Observer/passive scan (3 s)
  -> update bounded unique-address count
Persistent latest-count scroll
  -> restore prior advertising state
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
The persistent-count survey candidate does not write the uploaded payload, but
it intentionally masks the normal nametag view outside app streaming. It is a
diagnostic exception, not proof of the target overlay UX, and still needs app,
button, recovery, and power-cycle regression evidence on hardware.

## Detection policy

`frogalert-core` is allocation-free and `no_std`. Matching is deliberately
small and explainable:

- OUI rules run only for controller-reported public addresses. Random BLE
  addresses make the first three bytes unsuitable as vendor evidence.
- name rules are ASCII case-insensitive substring matches against Complete or
  Shortened Local Name advertisement fields.
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
   disconnected, first showing only the approximate count and proving that
   ephemeral addresses are cleared afterward.
6. Add temporary `COP DETECTED` / `HAX DETECTED` overlays and restore the
   uploaded nametag framebuffer unchanged.
7. Prove observer/peripheral role switching and the target roughly 60-second
   cadence without breaking USB, app uploads, or recovery.
8. Measure current draw and tune scan, display, and sleep timing.
