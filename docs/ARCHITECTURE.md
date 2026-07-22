# Architecture

## Feasibility

Rust is feasible on the BadgeMagic CH582M, but this is not a conventional
Bluetooth stack. `ch58x-hal` wraps WCH's proprietary precompiled BLE library and
provides working Rust examples for both observer (scanner) and peripheral roles.
FrogAlert now has a cross-linked observer/count lab firmware, but no embedded
behavior has been verified on a physical BadgeMagic badge. The missing
engineering steps include validating the matrix wiring and clocks, receiving
real advertisements, and proving that observer and peripheral roles can switch
safely while display refresh continues.

## Safe display bring-up firmware

`firmware/frogalert-pixel-walk/` is the first physical display gate. It shares
the revision-gated display driver with the count firmware and can be built for
either `HARDWARE_REV1` or the exact photographed
`B1144C_250901_USB_C` profile. It does not enable the HAL BLE feature,
initialize Embassy, or select a 32.768 kHz radio clock. Timer0 refreshes the
matrix while the foreground advances exactly one logical pixel left-to-right,
top-to-bottom every 750 ms and writes its `(x, y)` coordinate on UART1/PA9.
Display GPIO stays at the lower 5 mA drive setting, and all controlled lines
are floated between phases and on panic.

Both builds also link the shared application-level KEY2 recovery hook. Its
roughly 2.2-second PB22 hold detector and transfer to the CH582 mask-ROM ISP
are implemented and host-tested, but neither profile is flash-approved until
that path has been proven on the corresponding physical badge.

This separation makes matrix polarity/orientation testing independent of the
radio and low-speed-clock assumptions. It still requires an opened badge whose
marking and matrix match the selected profile, plus explicit approval for the
irreversible first flash.

## Current count lab firmware

`firmware/frogalert-count/` is deliberately narrower than the eventual
product. Its data path is:

```text
passive LE 1M advertisement callback
  -> fixed-capacity ScanCounter<64>
  -> 11x44 numeric framebuffer (`0` through `64+`)
  -> revision-gated timer-driven matrix refresh
```

It passively scans for three seconds, holds the resulting count for seven
seconds, then starts another scan. Duplicate addresses within a window count
once. At capacity, later unique addresses set a saturation flag and the panel
shows `64+`. On completion, the address table is explicitly zeroed. The badge
does not write a scan history or transmit observations.

This is an approximate count of advertiser addresses, not physical devices.
BLE address randomization can split one physical device across windows, and a
device that does not advertise during the three-second window is absent.

Callback and display-interrupt state is protected by critical sections on the
atomic-free `riscv32imc-unknown-none-elf` target. The build audits the linked
ELF and refuses any AMO, LR, or SC instruction. The toolchain, target, vendored
HAL revision, and four local source patches are documented in
[DEVELOPMENT.md](DEVELOPMENT.md) and the vendoring note.

The lab build is observer-only and currently builds only for
`HARDWARE_REV1`: it has no BadgeMagic `FEE0/FEE1` GATT service,
does not advertise as `LED Badge Magic` or `LSLED`, and cannot receive nametag
content from the BadgeMagic app. Its successful cross-build and instruction
audit do not verify the provisional PCB pin map, panel orientation or
brightness, the assumed external 32.768 kHz LSE, radio behavior, or battery
draw. It must remain labeled unverified until those checks happen on an opened,
confirmed CH582M 11x44 badge.

The exact `B1144C_250901_USB_C` profile is intentionally unavailable for the
count image. FOSSASIA's working source for that board selects the CH582 internal
low-speed oscillator and enables calibration, while the current vendored Rust
BLE initialization hardcodes an external LSE. Supporting the USB-C profile
therefore requires an explicit LSI/calibration implementation and physical
radio validation; it is not a display-pin-only variant.

## Target combined firmware

The conservative combined firmware will switch roles rather than attempt
simultaneous scanning and advertising:

```text
Peripheral/nametag (about 57 s)
  -> only if no app connection is active
Observer/passive scan (3 s)
  -> classify public address OUI + advertised local name
Alert display (about 5 s, if matched)
  -> restore the user's framebuffer
Peripheral/nametag
```

If WCH's library cannot reinitialize roles without a reset, the fallback is a
short scheduled reboot into observer mode with retained framebuffer/config in
data flash, followed by a reboot back into peripheral mode. That costs power
and creates a short app-discovery gap, but keeps the behaviors isolated.

## Compatibility contract

The BadgeMagic app's legacy path expects:

- advertised device name recognized by the app (`LED Badge Magic` / `LSLED`);
- service UUID `0xFEE0`;
- write characteristic UUID `0xFEE1`;
- a stream of 16-byte chunks beginning with the `wang\0\0` header;
- up to eight 11-row bitmaps plus mode/speed metadata.

FrogAlert must store and render that content unchanged. Detection alerts are a
temporary overlay; they must never overwrite the uploaded nametag payload.
This contract describes the target combined firmware and is not implemented by
the current observer-only count lab build.

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

1. Cross-build the atomic-free single-pixel bring-up and passive observer/count
   images with exact-revision gates and final-ELF instruction audits.
   Implemented in source; physical behavior remains unverified.
2. Run the no-BLE/32-kHz-clock pixel walk to validate each exact GPIO matrix
   map, orientation, first-pair swap, refresh, panic-safe release, and KEY2 ISP
   recovery.
3. Validate the profile-appropriate low-speed clock, numeric output, passive
   reception, and radio/display coexistence on a verified badge. For
   `B1144C_250901_USB_C`, implement and validate internal-LSI calibration
   before enabling the observer/count build.
4. Render a fixed nametag and alert overlay on that physical badge.
5. Port the `FEE0/FEE1` GATT service and legacy frame assembler.
6. Confirm the official app uploads and the original nametag resumes after an
   overlay.
7. Prove observer/peripheral role switching and restore the target 60-second
   cadence.
8. Measure current draw and tune scan, display, and sleep timing.
