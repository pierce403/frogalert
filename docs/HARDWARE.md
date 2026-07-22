# Hardware and flashing safety

FrogAlert targets only the FOSSASIA-supported BadgeMagic variant:

| Property | Required value |
| --- | --- |
| MCU | WCH CH582M, QFN48 |
| CPU | QingKe RISC-V |
| Display | 11x44 charlieplexed LED matrix |
| Battery | nominal 3.7 V Li-ion |
| BLE low-speed clock | exact-profile clock source proven before radio use |
| Bootloader USB ID | `4348:55e0` or `1a86:55e0` |
| Display-lab selectors | `HARDWARE_REV1` or exact USB-C `B1144C_250901_USB_C` |

Badges sold under similar names can contain different controllers or 11x55
matrices. The enclosure and the OEM BLE name `LSLED` are not sufficient proof.

## Current physical badge evidence

The opened USB-C badge photographed on 2026-07-22 is marked
`B1144C_250901`. A readable macro photo confirms a WCH `CH582M` in the 48-pin
package. Its pouch battery is soldered to PCB tabs, not attached through a
user-removable connector. The board also has a populated metal-can component
at `Y2`, but its frequency and connection have not been established. The exact
downloaded FOSSASIA USB-C development BIN is 177,704 bytes, has SHA-256
`2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`,
and matches upstream git blob `18bffdb8f766ddfd818aecf102ac0df284ad1c07`
from source `9ce885d`. That source's `USBC_VERSION=1` display map differs from
the Micro-USB map only at T: PB6 instead of PB23. FrogAlert records that
candidate explicitly as `B1144C_250901_USB_C`; generic `BM1144-C` and upstream
Rev2/Rev3 labels are not accepted substitutes. Holding KEY2 while pressing the
board's populated `RESET` switch did not re-enumerate the OEM `0416:5020` USB
device. Holding KEY2 while momentarily bridging `C3` did enumerate the WCH ROM
ISP device as `4348:55e0` twice. After a user-run flash, Linux reported
manufacturer `FOSSASIA WAS HERE`, product `LED Badge Magic`, serial
`BM1144-C fw: v0.1`, HID and CDC ACM interfaces, and `/dev/ttyACM0`.
From that running FOSSASIA image, a KEY2-only long press displayed the dot cue
and entered ISP without RESET or C3. Exact elapsed timing and a fresh kernel
transcript were not captured.

That result verifies the physical C3/KEY2 entry and an open USB-C application
boot with application-provided long-press recovery. The downloaded file's
provenance is exact, but the retained evidence lacks the `wchisp` command and
verify transcript needed to prove that those were the precise bytes programmed.
It does not verify the website WebUSB implementation, FrogAlert firmware, all
484 LED positions, or radio operation. C3 entry deliberately shorts a
supply-rail capacitor and remains hazardous bench recovery rather than routine
end-user guidance.

## Before the first flash

1. Open the badge and photograph the PCB and MCU marking.
2. Confirm exactly 44 LED columns.
3. Electrically isolate the battery, hold KEY2 (near USB), connect USB, and
   confirm the ISP device appears as `4348:55e0` or `1a86:55e0`. On the
   photographed USB-C board the battery is soldered, so this is skilled bench
   work rather than an ordinary unplug step; do not cut, pry, or short the
   cell. This cold-entry sequence remains untested on that board.
4. For `HARDWARE_REV1`, compare both sides with FOSSASIA's pinned
   [CH582 reference photos](https://github.com/fossasia/badgemagic-firmware/blob/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8/CH582.md#hardware-details),
   and confirm the Micro-USB layout. For the photographed USB-C board, record
   physical marking `B1144C_250901` and select only
   `B1144C_250901_USB_C`. Port shape by itself is not proof.
5. Do not run the USB-C BLE count image. Pinned FOSSASIA USB-C source disables
   external 32 kHz selection, powers/calibrates internal LSI, and a later
   upstream commit explicitly says the board cannot use LSE. The current Rust
   count image and HAL BLE initializer still select external LSE.
6. Record the exact software profile only after all those checks. Build-profile
   tokens are not values discovered over USB, and chip identification cannot
   prove the PCB layout or matrix wiring.
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

FOSSASIA's published **v0.1 release is Micro-USB only**. It also publishes a
separate USB-C development artifact on its `bin` branch; that image has now
booted on the physical badge, but it is not a v0.1 release asset. FrogAlert
exposes only the separately pinned Micro-USB image as
`firmware/releases/badgemagic-open-v0.1-hardware-rev1.bin`, and only when the
user completes the opened-board/photo checklist and enters `HARDWARE_REV1`
exactly. Neither image is OEM firmware or restores factory defaults.
FrogAlert's bundled Micro-USB artifact remains hardware-unverified.

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

The inspected USB-C development artifact is:

- upstream file: `usb-c/badgemagic-ch582.bin` at bin commit `b56cd949`;
- embedded source: `9ce885d682b5c56c3ac7595c09e009a210885221`;
- byte length: `177704`;
- SHA-256: `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`.

It is provenance evidence and a fallback research reference, not a factory
image or FrogAlert release.

## First display bring-up image

`firmware/frogalert-pixel-walk/` is the only intended first Rust display test.
It compiles separately for exact `HARDWARE_REV1` and candidate
`B1144C_250901_USB_C`, keeps one logical LED selected, advances every 750 ms,
and reports `x`/`y` coordinates on UART1/PA9 at 115200 baud. Display GPIO uses
the lower 5 mA drive setting. It initializes neither BLE nor a 32 kHz radio
clock, which keeps matrix validation separate from radio/clock bring-up. It
also includes the shared 2.2-second KEY2 application recovery hook, but that
hook remains physically unverified in FrogAlert firmware.

Build and instruction-audit it with:

```sh
./scripts/build-display-bringup HARDWARE_REV1 --check
./scripts/build-display-bringup B1144C_250901_USB_C --check
```

Even this minimal image replaces the unrecoverable OEM bytes when flashed. The
opened-board, read-only ISP, and explicit approval gates still apply. During the
physical test, stop immediately if more than one pixel lights, coordinates do
not follow a left-to-right/top-to-bottom 44×11 walk, the badge becomes warm, or
current draw is unexpected. Record all 484 positions, the first-pair behavior,
orientation, visual flicker, and panic/power-cycle release before trying the BLE
count image.

## Current Rust count prototype

`firmware/frogalert-count/` links a Rust observer-only prototype only for exact
`HARDWARE_REV1`. It performs passive BLE discovery, counts nearby unique
addresses, and drives a numeric framebuffer through the revision-1 11×44 pin
map. It deliberately does not provide the BadgeMagic GATT service.

Build and instruction-audit it from the repository root with:

```sh
./scripts/build-count-firmware HARDWARE_REV1 --check
```

The check also generates and audits a finalized raw BIN under `tmp/firmware/`;
the non-check form is reserved for a deliberate local test. Successful
compilation, a plausible size, and clean instruction/package audits do not make
that image flash-approved. The
display polarity, refresh timing, BLE callback behavior, current draw, battery
impact, and recovery path all still require physical validation.

There is intentionally no `B1144C_250901_USB_C` count build. The exact
FOSSASIA USB-C source operates from calibrated internal LSI, while the vendored
HAL's BLE initializer hardcodes external LSE and no calibration callback.
Resolve and test that clock path before enabling a USB-C radio artifact.

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
