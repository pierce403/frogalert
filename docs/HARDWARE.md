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
| Firmware profiles | exact USB-C `B1144C_260404_USB_C` or `B1144C_250901_USB_C`; Micro-USB recovery-only `HARDWARE_REV1` |

Badges sold under similar names can contain different controllers or 11x55
matrices. The enclosure and the OEM BLE name `LSLED` are not sufficient proof.

## USB-C hardware profiles

FrogAlert keeps two explicit USB-C profiles. The newer Nyx board is the build
default, not an automatically detected target:

| Profile | Printed PCB marking | Physical KEY2 | KEY1/PA1 input | Pressed level | Shutdown wake |
| --- | --- | --- | --- | --- | --- |
| `B1144C_260404_USB_C` (default) | `B1144C_260404` | farther from USB | pull-up | low | falling edge |
| `B1144C_250901_USB_C` (legacy) | `B1144C_250901` | nearest USB | pull-down | high | rising edge |

The 23 display nets are identical between these two USB-C profiles:

```text
PA15 PB18 PB0 PB7 PA12 PA10 PA11 PB9 PB8 PB15 PB14 PB13
PB12 PB5 PA4 PB3 PB4 PB2 PB1 PB6 PB21 PB20 PB19
```

KEY2 remains PB22 with a pull-up and active-low press on both profiles, but the
board layouts put that switch in different physical positions. The profile
change is otherwise a KEY1 electrical-polarity and wake-edge change, not a
shifted LED matrix. The `260404` values and KEY2 position come from Nyx's board
notes and FOSSASIA commit `696bbd71`; they still require an exact-board
FrogAlert smoke test.

Safe passive boot-time auto-detection is not available. Before KEY1 has been
pressed, its switch is open on both boards, so PA1 only reflects the internal
pull selected by the running firmware. Reconfiguring that pull merely changes
the reading the firmware created; it does not reveal which rail the untouched
switch will connect when pressed. A first press could provide a clue, but by
then boot behavior, the first button action, and shutdown-wake configuration
have already depended on the profile. FrogAlert consequently requires the
printed board marking and emits separate artifacts.

## Current physical badge evidence

The opened 11×44 USB-C badge photographed on 2026-07-22 is marked
`B1144C_250901`. A readable macro photo confirms a WCH `CH582M` in the 48-pin
package. Its pouch battery is soldered to PCB tabs and has no user-removable
connector. Leave the cell and its leads alone. The board also has a populated
metal-can component at `Y2`, but its frequency and connection have not been
established. The exact
downloaded FOSSASIA USB-C development BIN is 177,704 bytes, has SHA-256
`2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`,
and matches upstream git blob `18bffdb8f766ddfd818aecf102ac0df284ad1c07`
from source `9ce885d`. That source's `USBC_VERSION=1` display map differs from
the Micro-USB map only at T: PB6 instead of PB23. FrogAlert records that
candidate explicitly as `B1144C_250901_USB_C`; generic `BM1144-C` and upstream
Rev2/Rev3 labels are not accepted substitutes. The newer
`B1144C_260404_USB_C` profile retains this exact display map and changes only
KEY1 pull/polarity plus its shutdown wake edge. Holding KEY2 while pressing the
board's populated `RESET` switch did not re-enumerate the OEM `0416:5020` USB
device. In the documented expert bench recovery, a qualified operator held
KEY2 while momentarily bridging both ends of PCB capacitor `C3`; that
enumerated the WCH ROM ISP device as `4348:55e0` twice. This hazardous
rail-collapse maneuver is not routine first-flash guidance and is not a
battery operation. After a user-run flash, Linux reported
manufacturer `FOSSASIA WAS HERE`, product `LED Badge Magic`, serial
`BM1144-C fw: v0.1`, HID and CDC ACM interfaces, and `/dev/ttyACM0`.
From that running FOSSASIA image, a KEY2-only long press displayed one dot near
the middle of the panel and entered ISP without RESET or C3. Exact elapsed
timing for the press and a fresh kernel transcript were not captured.

Later kernel captures recorded four ordinary ISP entries as `4348:55e0`.
Without a useful command keeping the session active, the device disconnected
after about 9–13 seconds and re-enumerated the `0416:5020` application. That is
the ROM ISP opportunity expiring, not by itself a cable failure. Browser flows
must finish permission, claim, identify, and config reads promptly. For CLI
testing, `wchisp -r 30 ...` can be started before the KEY2 long press so the
tool is already polling when the dot cue appears.

That result verifies the expert C3/KEY2 entry and an open USB-C application
boot with application-provided long-press recovery. The downloaded file's
provenance is exact, but the retained evidence lacks the `wchisp` command and
verify transcript needed to prove that those were the precise bytes programmed.
It does not verify the website WebUSB implementation, FrogAlert firmware, all
484 LED positions, or radio operation. Bridging C3 collapses the board's power
rail and remains hazardous, qualified bench recovery rather than an end-user
procedure.

On 2026-07-28, a second opened badge was photographed with PCB marking
`B1144C_260404` and a readable CH582M package. Its C3 and RESET placement
visually matches the older layout. Repeated attempts that held the side button
nearest USB while bridging C3 only disconnected and re-enumerated the OEM
`0416:5020` application. Nyx's revision-specific instructions identify KEY2 on
this board as the other side button, farther from USB. Holding that button while
bridging C3 enumerated the ROM ISP as `4348:55e0` twice on 2026-07-28. A later
application boot enumerated as FOSSASIA's `LED Badge Magic` with HID and CDC
ACM interfaces. The kernel record proves the revision-specific entry method
and open-firmware boot, but no captured `wchisp` program/verify transcript
binds an exact BIN hash to that flash.

## Before the first flash

1. Open the badge and photograph the PCB and MCU marking.
2. Confirm exactly 44 LED columns.
3. If the badge runs the pinned FOSSASIA USB-C application or an exact
   hardware-approved FrogAlert image, use its application-provided KEY2-only
   long press. Hold about 2.2 seconds, release when one dot lights near the
   middle, and confirm ISP appears as `4348:55e0` or `1a86:55e0` during the
   observed 9–13 second window.
4. If the photographed board still runs original or unknown firmware, stop:
   ordinary KEY2 entry is not available, and RESET plus KEY2 was tested without
   success. Its first documented ISP entry used the expert-only C3 maneuver
   described above. The public browser tool does not turn that hazardous bench
   recovery into a checklist.
5. For `HARDWARE_REV1`, compare both sides with FOSSASIA's pinned
   [CH582 reference photos](https://github.com/fossasia/badgemagic-firmware/blob/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8/CH582.md#hardware-details),
   and confirm the Micro-USB layout. For USB-C, record physical marking
   `B1144C_260404` or `B1144C_250901` and select only its corresponding exact
   profile. Port shape, case color, and generic `BM1144-C` text are not proof.
6. Do not run the historical standalone Rust count image. Pinned FOSSASIA
   USB-C source disables external 32 kHz selection, powers/calibrates internal
   LSI, and a later upstream commit explicitly says the board cannot use LSE.
   The quarantined Rust count image and its HAL BLE initializer select external
   LSE. The newer profile-specific survey candidates instead inherit
   FOSSASIA's internal-LSI setup, but remain separate hardware-unverified bench
   images.
7. Record the exact software profile only after all those checks. Build-profile
   tokens are not values discovered over USB, and chip identification cannot
   prove the PCB layout or matrix wiring. Do not treat the build default as
   detection: an untouched KEY1 cannot distinguish the two USB-C profiles.
8. Separately record the exact physical silkscreen/revision. If the PCB has no
   revision marking, record that fact and retain front/back photos. Do not
   substitute the `HARDWARE_REV1` software token for this physical record.
9. Do not publish or offer end-user flashing until the specific image has
   completed the release gates for that recorded hardware revision. An
   explicitly authorized one-badge bench smoke is how a new image begins those
   gates; keep its bytes under ignored `tmp/` and capture every result.

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

## Failed standalone Rust image

Do not flash the historical `frogalert-pixel-walk` or `frogalert-count`
standalone Rust images. The first USB-C pixel-walk build produced no visible
output and its application KEY2 recovery never ran. The exact failed SHA-256
is permanently listed in `firmware/quarantine.json`.

Post-link inspection found a deterministic vector-table defect. The substituted
`ch58x` PAC 0.3.0 emitted `__EXTERNAL_INTERRUPTS` in flash `.rodata`, while
`qingke-rt` 0.5.0 expected it in the RAM `.highcode` vector table. The CH582
Timer 0 vector at `0x20000040` consequently contained the address of
`DefaultInterruptHandler`, an infinite self-loop, rather than the TMR0 wrapper.
The application enabled Timer 0 before its foreground loop; the first interrupt
therefore stopped both display refresh and KEY2 polling. The count image has
the same linked defect.

The WCH marker at raw offset `0x14`, an atomic-free disassembly, and a recovery
function ending in `jr zero` all passed. Those facts did not prove the live
vector table reached the expected handlers. The new post-link regression audit
checks actual vector placement/targets, and the old builders no longer emit a
flashable BIN.

## Next physical image

Every next image derives from exact FOSSASIA USB-C source `9ce885d` and keeps
its startup, linker layout, clocks, USB HID+CDC stack, BLE/TMOS stack,
BadgeMagic service, display refresh, and KEY2 recovery task. Before
compilation, the profile patch either preserves the legacy `250901` KEY1
behavior or applies the `260404` pull-up, active-low test, and falling-edge
shutdown wake. It does not change the common LED matrix table or KEY2.

The canary changes only self-identifying metadata. The survey lane adds a
three-second passive discovery on a roughly 20-second start-to-start cadence,
the name/count view, built-in and custom rules, and temporary three-second
alerts. A continuously present match can therefore retrigger once in each new
survey window. The embedded configuration is CRC-protected and contains the
compiled profile id; a mismatch or malformed block disables alerts rather than
silently selecting another board profile.

The overlay is the sole display owner for its three-second lifetime. Text
alerts use at most two fixed pages held for 1.5 seconds each; the count is one
centered fixed frame. Original
marquee, flash, fixed-animation, and Bluetooth-stream events that were already
queued are consumed while that ownership flag is active, so they cannot
restart scrolling underneath an alert. Releasing the overlay restarts only the
selected nametag/count view. This fixes a source-level scheduling conflict but
still needs exact-artifact visual testing on each board.

Each profile/lane pair has a separate locked BIN size and SHA-256 and lives
under `tmp/fossasia-usbc/build/<PROFILE>/<LANE>/`. CI's candidate bundle
contains both survey profiles and labels both hardware-unverified. Neither an
Actions candidate nor a locally configured derivative is a public firmware
release, flash approval, or evidence that either board tolerates repeated
surveys.

Before any derived bytes leave ignored `tmp/`, the exact artifact must pass:

1. captured `wchisp` program and byte verification;
2. captured WebUSB program and byte verification after the CLI smoke proves
   normal KEY2 recovery;
3. cold boot and power-cycle repetition;
4. USB `0416:5020` HID and CDC enumeration;
5. a BadgeMagic app nametag upload and visible display;
6. the profile-appropriate short system/view actions and
   KEY1 brightness/power/wake behavior, plus complete name/count/name rotation
   and restoration after every text/frog/custom overlay;
7. long KEY2 with the dot cue and ISP `4348:55e0`/`1a86:55e0` enumeration;
8. reflash of the known-good FOSSASIA image through that normal path.

Only after the C-only compatibility canary passes may a Rust ABI-only canary be
tested. Passive scanning and count display are later stages. The Rust library
may contain pure parsing/classification/counting logic, but it must not replace
the FOSSASIA reset, vectors, clocks, USB, BLE setup, or display timer.

## Manual flashing boundary

The eventual flash flow uses `wchisp`:

```sh
wchisp config reset
wchisp flash frogalert-ch582.bin
```

This command is documentation only today; no FrogAlert release image is
provided yet. Do not substitute either quarantined standalone Rust image or a
temporary canary merely because it builds, and do not mistake the upstream
open v0.1 substitute for the original OEM firmware.
