# Pinned FOSSASIA USB-C hardware shell

This directory defines FrogAlert's replacement firmware base for exact
`B1144C_260404_USB_C` and `B1144C_250901_USB_C` profiles. It pins the
FOSSASIA source that has already booted on the physical `250901` badge and the
same MRS V1.92 compiler used upstream. The newer Nyx `260404` profile is the
build default; neither profile is hardware-verified for FrogAlert.

The architecture boundary is deliberate: FOSSASIA C continues to own reset,
vectors, the linker layout, clock setup, display refresh, USB HID plus CDC,
BadgeMagic-compatible BLE services, internal-LSI calibration, buttons, power,
and the KEY2-to-ROM-ISP hook. Rust may later enter only as a small C-ABI
library for portable FrogAlert policy. Rust must not own the hardware shell.

## Hardware profiles

Both USB-C profiles use the same `USBC_VERSION=1` 23-net display table and
KEY2/PB22 active-low input. The build-time difference is limited to KEY1/PA1:

| Profile | Input pull | Pressed | Shutdown wake |
| --- | --- | --- | --- |
| `B1144C_260404_USB_C` (default) | up | low | falling edge |
| `B1144C_250901_USB_C` | down | high | rising edge |

An untouched KEY1 is an open switch on both boards and only reflects the
firmware-selected pull, so it cannot safely auto-detect the board before first
use. The survey candidate retains the compiled profile as its fallback, then
uses four debounced two-pull samples while KEY1 is held to distinguish
open (`low/high`), `250901` (`high/high`), and `260404` (`low/low`). A confirmed
result corrects button routing and shutdown wake for the current boot. The
build and embedded monitor configuration still carry an explicit profile id,
and this mismatch recovery remains hardware-unverified.

## Build lanes

Omit the profile for the default `260404` board:

```bash
./scripts/build-fossasia-usbc baseline --check
./scripts/build-fossasia-usbc canary --check
./scripts/build-fossasia-usbc survey --check
./scripts/build-fossasia-usbc frogs --check
```

Name the legacy board explicitly:

```bash
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C frogs --check
```

Successful builds retain the audited upstream filenames internally and also
create position-labelled aliases:

- `frogalert-top-b1144c-260404.bin`
- `frogalert-bottom-b1144c-250901.bin`
- `frogalert-frogs-top-b1144c-260404.bin`
- `frogalert-frogs-bottom-b1144c-250901.bin`

CI candidate bundles likewise include `top` or `bottom` in both BIN and ELF
filenames.

The legacy baseline contains no FrogAlert source and must match the known-good
177,704-byte FOSSASIA image byte-for-byte. The lock also records FOSSASIA bin
commit `b56cd949`, its 250,072-byte
`usb-c/badgemagic-ch582.elf`, and the ELF's SHA-256. Running the pinned
toolchain's `objcopy -O binary -S` on that exact ELF has been verified to
produce the same 177,704-byte known-good BIN and SHA-256 as the local baseline.
The locally rebuilt ELF itself need not be byte-identical because ELF metadata
can carry build-path differences; the loadable raw image is the exact gate.

The first integration canary adds only `frogalert-canary.c`, a retained build
identity string with no functions or hardware references. The private survey
candidate keeps that same C hardware shell and adds a bounded passive counter
and classifier for the selected profile.

This diagnostic lane starts in normal nametag view. The physical button nearest
USB extends FOSSASIA's existing display selection with a virtual counter:
`Name 1 → Bluetooth counter → Name 2 → Bluetooth counter → …`. That is KEY1 on `260404`
and KEY2 on `250901`. The other short press retains normal system/power
behavior, KEY1 retains long-press brightness, and the separate long-KEY2 ISP
task remains unchanged. Passive surveys run in either visible
view; selecting the counter changes presentation, not whether the radio
schedule runs.

The separate `frogs` lane retains that complete survey and compatibility
shell, but renders the alternate view as three fixed frogs alternating between
two poses every 500 ms. Detection alerts and the BadgeMagic readiness cue
preempt the frogs through the same display-ownership path, then return to the
frog view. In both lanes, the cue lasts one second while advertising remains available for
the full ten-second app window. It does not change or replace the locked
`survey` artifacts.

Counter view shows only the most recent completed result. It starts at the
Bluetooth rune plus `00`, holds that frame while a passive scan is active, and
atomically switches to the new count when the scan completes. Initialization,
start, and watchdog errors keep the last completed result on screen and remain
available through the debug log; they are never rendered as count suffixes.

The first scan begins 15 seconds after readiness, so the first completed result
normally appears about 18 seconds after startup. The lane skips scan work while
BadgeMagic is connected or streaming, pauses advertising, and consumes both
live report events and the controller's completion list. A bounded
AD-structure classifier mirrors every README detector row:

- public `00:25:DF` and `B4:1E:52` OUIs produce `COP DETECTED`;
- case-insensitive `Axon Body`, `TASER`, `Ray-Ban`, and `Ray Ban` names produce
  `COP DETECTED`;
- manufacturer ID `0x01AB` together with advertised service `0xFD5F` in the
  same passive report produces `COP DETECTED`; either field alone is ignored;
- case-insensitive `Flipper` produces `FLIPPER DETECTED`;
- a case-insensitive `QT ` prefix followed by a non-empty serial value produces
  `KARR DETECTED`; and
- an exact case-insensitive `LED Badge Magic` name or advertised `0xFEE0`
  service runs a three-second, three-frog animation using two alternating
  poses.

At boot and after each BadgeMagic upload, the firmware examines the complete
loaded nametag list. If every bitmap is pixel-empty, it creates a scrolling
`503.PARTY` bitmap in RAM. It does not write that fallback to data flash, and
the next nonblank BadgeMagic upload replaces it through the normal list reload.

Within one survey window, detection priority is BadgeMagic frogs, then KARR,
COP, Flipper, and finally optional custom rules. A newly observed result replaces
the active overlay only when it has strictly higher priority. Repeated or
lower-priority reports never restart or stomp the current display.

The default 384-byte `FROGALERTCFGv1` block enables all five built-in groups
and no custom rules. Its CRC covers the schema, compiled hardware-profile id,
built-in mask, and eight bounded rule slots. The browser may derive a local BIN
with custom name contains/prefix/exact, public-OUI, or 16-bit-service rules.
Firmware rejects malformed, mismatched-profile, or bad-CRC configuration and
disables alerts rather than guessing. Scanning and the count view remain
available in that failure mode.

Cop, Flipper, and KARR overlays show each generated page exactly once for one
second. The frog overlay shows three one-second frames, alternating its two
poses. Each then restores the selected nametag or latest Bluetooth-rune
`00` through `64+` counter view without modifying uploaded content. Passive discovery
does not guarantee delivery of a local name carried only in scan response, so
the advertised-`0xFEE0` branch is a deliberately broad fallback and may animate
for another compatible device that reuses that service UUID. OUI rules run only
for controller-reported public addresses.

Later windows begin about 17 seconds after the previous result, producing a
roughly 20-second start-to-start survey cycle. A continuously present match can
therefore retrigger once in each new window. The display yields while the app
is streaming or the badge is outside normal mode.
Addresses exist only in a fixed 64-entry RAM table and are explicitly zeroed
after success, failure, or timeout. The watchdog cancels a stuck scan and
restores the prior advertising state. Entering download mode suspends any
active discovery before enabling advertising. The image never initiates a
central connection.

The hardware survey still uses the C shell for advertisement extraction and
the bounded rule mirror. Moving classification behind the Rust ABI remains
gated on the separate ABI-only canary even though the behavior now matches the
documented table. The display hook stops FOSSASIA's animation tasks only when
an overlay or selected counter first takes panel ownership. It completes each
FrogAlert frame in the inactive one of two private 44-column buffers before
switching the selected buffer. The final timer interrupt reads that buffer
instead of FOSSASIA's shared animation framebuffer while the overlay owns the
panel. This protects the visible alert from blink, marquee, all base animation
modes, and queued Bluetooth animation writes. The patched handlers still
consume already-queued work without rescheduling it. The selected uploaded
name/count view resumes after the final one-second frame releases ownership.
The count is a single centered fixed frame. Text alerts split into no more than
two fixed pages held for one second each; only the frog alert deliberately
changes pose. This removes both the diagnostic's added blank-frame flicker and
the competing-animation overwrite. The survey lane additionally ports
`bkero/badgemagic-firmware` commit `074c448`: Timer 0 ticks at 16 kHz for about
182 complete matrix frames per second instead of about 45, and the PWM
off-period releases the pins only once per column pair. This should reduce
visible strobing but remains hardware-unverified alongside BLE load, current
draw, all brightness levels, app uploads, and recovery. For fixed and
frame-animation modes only, a compatibility
helper recognizes 48-column
blocks with two blank columns at both edges and copies their inner 44 columns
using the correct 48-column stride. Unqualified payloads retain the original
44-column path.

The selected nametag remains the base view unless the user chooses the counter;
overlays are temporary. These are build properties and remain
unverified on hardware.

The first run downloads about 345 MB of pinned archives. Source, toolchain,
objects, ELF, map, disassembly, and BIN files stay under ignored
`tmp/fossasia-usbc/`; build artifacts are separated as
`build/<PROFILE>/<LANE>/`. Nothing here copies a BIN into
`firmware/releases/`, updates the website manifest, invokes `wchisp`, or
authorizes a flash.

`scripts/prepare-fossasia-usbc` can prepare only the verified source archive
or both source and compiler:

```bash
./scripts/prepare-fossasia-usbc --source-only
./scripts/prepare-fossasia-usbc --with-toolchain
```

Set `FROGALERT_FOSSASIA_OFFLINE=1` to prohibit downloads and require populated
cache files. Every cached archive is checked for exact size and SHA-256 before
use. The source is re-extracted for every build; critical runtime files are
then re-hashed before compilation.

## What a passing check proves

A passing build establishes reproducible source/toolchain provenance, the
USB-C compile flag, expected runtime symbols, the WCH startup sentinel, the
absence of linked AMO/LR/SC instructions, expected USB descriptor strings, and
the presence or absence of the canary and survey markers. It reconstructs a
raw BIN from the audited ELF and requires byte identity with the Make-produced
BIN. Every profile/lane size and SHA-256 is locked independently; the legacy
baseline also must match the already recovered FOSSASIA image exactly.

The survey and frog lanes additionally require their passive-scan/cancel/suspend,
display-view, configuration, bounded classifier, text-alert, frog-render, and
animation-ownership symbols plus at least 8 KiB between static RAM and the
stack top. The Actions candidate packager requires both profile-specific
BIN/ELF pairs for each lane and produces separate counter and dancing-frog
checksum/metadata directories with every approval flag false.

It does **not** prove that a derived image boots, scans, displays correctly,
accepts a BadgeMagic upload, enters ISP on KEY2, or recovers after a failed
write. It also does not turn the Actions bundle into a GitHub firmware Release.
Keep both candidates local until those checks pass on the exact physical badge.
