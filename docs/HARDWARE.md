# Hardware and flashing safety

FrogAlert targets only the FOSSASIA-supported BadgeMagic variant:

| Property | Required value |
| --- | --- |
| MCU | WCH CH582M, QFN48 |
| CPU | QingKe RISC-V |
| Display | 11x44 charlieplexed LED matrix |
| Battery | nominal 3.7 V Li-ion |
| BLE low-speed clock | populated and connected 32.768 kHz LSE crystal |
| Bootloader USB ID | `4348:55e0` or `1a86:55e0` |
| Supported prototype selector | upstream Micro-USB build profile `HARDWARE_REV1` |

Badges sold under similar names can contain different controllers or 11x55
matrices. The enclosure and the OEM BLE name `LSLED` are not sufficient proof.

## Before the first flash

1. Open the badge and photograph the PCB and MCU marking.
2. Confirm exactly 44 LED columns.
3. Disconnect the battery, hold KEY2 (near USB), connect USB, and confirm the
   ISP device appears as `4348:55e0` or `1a86:55e0`.
4. Compare both sides of the opened board with FOSSASIA's pinned
   [CH582 reference photos](https://github.com/fossasia/badgemagic-firmware/blob/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8/CH582.md#hardware-details),
   and confirm the Micro-USB layout. Port shape by itself is not proof.
5. Trace or otherwise confirm the populated 32.768 kHz crystal used by the WCH
   BLE library. The current count image enables LSE unconditionally and has no
   hardware-tested fallback clock.
6. Record the software profile `HARDWARE_REV1` only after all those checks.
   This token is an upstream build selector, not a silkscreen value. USB chip
   identification cannot prove the PCB layout or matrix wiring.
7. Separately record the exact physical silkscreen/revision. If the PCB has no
   revision marking, record that fact and retain front/back photos. Do not
   substitute the `HARDWARE_REV1` software token for this physical record.
8. Do not flash until the specific image has completed the release gates for
   that recorded hardware revision.

## No factory/OEM restore

The manufacturer firmware is closed and read protection prevents dumping it.
No official factory/OEM image is available, and there is no route back to the
original bytes after replacement. Do not describe any FrogAlert control or
artifact as a factory reset.

FOSSASIA does publish an **open BadgeMagic-compatible substitute**, version
`v0.1`, for its Micro-USB board. FrogAlert exposes that exact upstream image as
`firmware/releases/badgemagic-open-v0.1-hardware-rev1.bin`, but only when the
user completes the opened-board/photo checklist and enters `HARDWARE_REV1`
exactly. It is not the OEM image, does not restore
factory defaults, and remains hardware-unverified by FrogAlert.

The reviewed substitute metadata is:

- upstream release: <https://github.com/fossasia/badgemagic-firmware/releases/tag/v0.1>;
- source commit: `68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8`;
- byte length: `155672`;
- SHA-256: `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`.

The website's **Prepare open BadgeMagic firmware** button only
loads and validates those bytes. It sends no USB write. Unknown revisions,
`HARDWARE_REV2`, and `HARDWARE_REV3` remain disabled. Because the manifest still
records `hardware_verified_by_frogalert: false`, the site also refuses to arm
the destructive program action for this bundled image. One confirmed Rev1
identify/program/verify/boot/app/recovery smoke is the minimum gate before that
flag and browser path can be enabled.

## First display bring-up image

`firmware/frogalert-pixel-walk/` is the only intended first Rust display test.
It is compiled only for exact `HARDWARE_REV1`, keeps one logical LED selected,
advances every 750 ms, and reports `x`/`y` coordinates on UART1/PA9 at 115200
baud. Display GPIO uses the lower 5 mA drive setting. It does not initialize BLE
or the external LSE, which keeps matrix validation separate from radio/clock
bring-up.

Build and instruction-audit it with:

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
```

Even this minimal image replaces the unrecoverable OEM bytes when flashed. The
opened-board, read-only ISP, and explicit approval gates still apply. During the
physical test, stop immediately if more than one pixel lights, coordinates do
not follow a left-to-right/top-to-bottom 44×11 walk, the badge becomes warm, or
current draw is unexpected. Record all 484 positions, the first-pair behavior,
orientation, visual flicker, and panic/power-cycle release before trying the BLE
count image.

## Current Rust count prototype

`firmware/frogalert-count/` now links a Rust observer-only prototype for exact
`HARDWARE_REV1`. It performs passive BLE discovery, counts nearby unique
addresses, and drives a numeric framebuffer through the revision-1 11×44 pin
map. It deliberately does not provide the BadgeMagic GATT service.

Build and instruction-audit it from the repository root with:

```sh
./scripts/build-count-firmware HARDWARE_REV1 --check
```

Generating a raw BIN with the same command without `--check` places only
temporary evidence under `tmp/firmware/`. Successful compilation, a plausible
size, and a clean instruction audit do not make that image flash-approved. The
display polarity, refresh timing, BLE callback behavior, current draw, battery
impact, and recovery path all still require physical validation.

## Manual flashing boundary

The eventual flash flow uses `wchisp`:

```sh
wchisp config reset
wchisp flash frogalert-ch582.bin
```

This command is documentation only today; no FrogAlert release image is
provided yet. Do not substitute the temporary count BIN merely because it
builds, and do not mistake the upstream open v0.1 substitute for the original
OEM firmware.
