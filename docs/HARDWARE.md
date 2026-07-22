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
3. If the badge runs the pinned FOSSASIA USB-C application, use its normal
   KEY2-only long press and confirm ISP appears as `4348:55e0` or `1a86:55e0`.
   For an unknown, blank, or broken application, cold entry instead requires
   the battery to be safely electrically isolated before holding KEY2 and
   connecting USB. The photographed board's battery is soldered: stop unless a
   qualified person can isolate Li-ion power safely. Do not cut, pry, or short
   the cell. Cold entry remains untested on that board.
4. For `HARDWARE_REV1`, compare both sides with FOSSASIA's pinned
   [CH582 reference photos](https://github.com/fossasia/badgemagic-firmware/blob/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8/CH582.md#hardware-details),
   and confirm the Micro-USB layout. For the photographed USB-C board, record
   physical marking `B1144C_250901` and select only
   `B1144C_250901_USB_C`. Port shape by itself is not proof.
5. Do not run the historical standalone Rust count image. Pinned FOSSASIA USB-C source disables
   external 32 kHz selection, powers/calibrates internal LSI, and a later
   upstream commit explicitly says the board cannot use LSE. The quarantined
   Rust count image and its HAL BLE initializer select external LSE. The newer
   private survey candidate instead inherits FOSSASIA's internal-LSI setup, but
   remains a separate hardware-unverified bench image.
6. Record the exact software profile only after all those checks. Build-profile
   tokens are not values discovered over USB, and chip identification cannot
   prove the PCB layout or matrix wiring.
7. Separately record the exact physical silkscreen/revision. If the PCB has no
   revision marking, record that fact and retain front/back photos. Do not
   substitute the `HARDWARE_REV1` software token for this physical record.
8. Do not publish or offer end-user flashing until the specific image has
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

The next image must derive from the exact FOSSASIA USB-C source at `9ce885d` and
preserve its startup, linker layout, clocks, USB HID+CDC stack, BLE/TMOS stack,
BadgeMagic service, display refresh, buttons, and KEY2 recovery task. The first
canary changes only self-identifying metadata. It does not add Rust, scanning,
or display behavior.

The current local canary is 177,788 bytes with SHA-256
`6591f55f6035721384dd2780cb66c03d58e5e08817a1b4e5808a9d2821503e87`.
That identity is build evidence only: it remains under ignored `tmp/` and is
not approved for public or end-user flashing. Its only permitted next use is an
explicitly authorized, one-badge bench smoke by a qualified operator; that
initial program/verify action begins the checklist below and must be captured.

A later private survey candidate is also reproducibly built under
`tmp/fossasia-usbc/build/survey/`. It is 198,988 bytes with SHA-256
`38be81f17dabaf81dfbb4f72cff4ea3841927d495edc1ff0794722c77f4b0df2`.
It retains the audited FOSSASIA reset/vector, USB, BLE, display, BadgeMagic, and
KEY2 symbols; leaves 9,924 bytes between static RAM and the stack top; performs
only a bounded three-second passive discovery; skips connected/streaming
states; and has a five-second cancellation watchdog. Those are build
properties, not evidence that the badge tolerates repeated surveys. The image
does not replace the metadata canary as the lower-risk first derived smoke and
must not be published before the full checklist passes.

Before any derived bytes leave ignored `tmp/`, the exact artifact must pass:

1. captured `wchisp` program and byte verification;
2. captured WebUSB program and byte verification after the CLI smoke proves
   normal KEY2 recovery;
3. cold boot and power-cycle repetition;
4. USB `0416:5020` HID and CDC enumeration;
5. a BadgeMagic app nametag upload and visible display;
6. KEY1 and short KEY2 behavior;
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
