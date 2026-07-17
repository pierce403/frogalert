# Architecture

## Feasibility

Rust is feasible on the BadgeMagic CH582M, but this is not a conventional
Bluetooth stack. `ch58x-hal` wraps WCH's proprietary precompiled BLE library and
provides working Rust examples for both observer (scanner) and peripheral roles.
The missing engineering step is proving that this stack can switch roles safely
while the display refresh task continues.

The conservative prototype will switch roles rather than attempt simultaneous
scanning and advertising:

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

1. Port the upstream charlieplexed 11x44 LED refresh driver and font renderer.
2. Render a fixed nametag and alert overlay on a physical, verified badge.
3. Port the `FEE0/FEE1` GATT service and legacy frame assembler.
4. Confirm the official app uploads and the original nametag resumes after an
   overlay.
5. Add a 3-second observer window using `ch58x-hal`'s BLE scanner example.
6. Measure current draw and tune the default 60-second cadence.

