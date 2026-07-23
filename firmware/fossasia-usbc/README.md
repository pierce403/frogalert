# Pinned FOSSASIA USB-C hardware shell

This directory defines FrogAlert's replacement firmware base for the exact
`B1144C_250901_USB_C` profile. It pins the FOSSASIA source that has already
booted on the physical badge and the same MRS V1.92 compiler used upstream.

The architecture boundary is deliberate: FOSSASIA C continues to own reset,
vectors, the linker layout, clock setup, display refresh, USB HID plus CDC,
BadgeMagic-compatible BLE services, internal-LSI calibration, buttons, power,
and the KEY2-to-ROM-ISP hook. Rust may later enter only as a small C-ABI
library for portable FrogAlert policy. Rust must not own the hardware shell.

## Build lanes

The exact baseline contains no FrogAlert source. Its resulting BIN must match
the known-good 177,704-byte FOSSASIA image byte-for-byte:

```bash
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
```

The lock also records FOSSASIA bin commit `b56cd949`, its 250,072-byte
`usb-c/badgemagic-ch582.elf`, and the ELF's SHA-256. Running the pinned
toolchain's `objcopy -O binary -S` on that exact ELF has been verified to
produce the same 177,704-byte known-good BIN and SHA-256 as the local baseline.
The locally rebuilt ELF itself need not be byte-identical because ELF metadata
can carry build-path differences; the loadable raw image is the exact gate.

The first integration canary adds only `frogalert-canary.c`, a retained build
identity string with no functions or hardware references:

```bash
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
```

The private survey candidate keeps that same C hardware shell and adds a
bounded passive counter for the exact USB-C profile:

```bash
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
```

This diagnostic lane starts in normal nametag view. Short KEY2 presses extend
FOSSASIA's existing display selection with a virtual counter:
`Name 1 → BT counter → Name 2 → BT counter → …`. KEY1 retains its normal
download/power behavior and long-press brightness action, and the separate
long-KEY2 ISP task remains unchanged. Passive surveys run in either visible
view; selecting the counter changes presentation, not whether the radio
schedule runs.

In counter view, the final character exposes progress: `I` means Central
initialization, `R` means ready/waiting, and `S` means the three-second passive
scan is active. A completed result has no suffix; `E` means an
initialization/start error and `T` means the five-second watchdog expired. For
example, a normal first cycle is `BT 00  I`, `BT 00  R`, `BT 00  S` (with live
updates), then `BT 04`.

The first scan begins 15 seconds after readiness, so the first completed result
normally appears about 18 seconds after startup. The lane skips scan work while
BadgeMagic is connected or streaming, pauses advertising, and consumes both
live report events and the controller's completion list. A bounded
AD-structure classifier mirrors every README detector row:

- public `00:25:DF` and `B4:1E:52` OUIs produce `COP DETECTED`;
- case-insensitive `Axon Body`, `TASER`, `Ray-Ban`, and `Ray Ban` names produce
  `COP DETECTED`;
- case-insensitive `Flipper` produces `FLIPPER DETECTED`; and
- an exact case-insensitive `LED Badge Magic` name or advertised `0xFEE0`
  service runs a two-frame, three-frog animation.

Cop, Flipper, and frog overlays each last three seconds. Each then restores the
selected nametag or latest `BT 00` through
`BT 64+` counter view without modifying uploaded content. Passive discovery
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
an overlay or selected counter first takes panel ownership, then resumes the
selected uploaded name. This removes the diagnostic's added blank-frame flicker
but does not change FOSSASIA's roughly 45 Hz matrix refresh. For fixed and
frame-animation modes only, a compatibility helper recognizes 48-column
blocks with two blank columns at both edges and copies their inner 44 columns
using the correct 48-column stride. Unqualified payloads retain the original
44-column path.

Any value carrying a phase suffix is diagnostic state, not a completed radio
measurement. The selected nametag remains the base view unless the user chooses
the counter; overlays are temporary. These are build properties and remain
unverified on hardware.

The first run downloads about 345 MB of pinned archives. Source, toolchain,
objects, ELF, map, disassembly, and BIN files stay under ignored
`tmp/fossasia-usbc/`. Nothing here copies a BIN into `firmware/releases/`,
updates the website manifest, invokes `wchisp`, or authorizes a flash.

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
the presence or absence of the canary and survey markers. It reconstructs a raw BIN from
the audited ELF and requires byte identity with the Make-produced BIN. Both
derived sizes and SHA-256 values are locked; the baseline also must
match the already recovered FOSSASIA image exactly.

The survey lane additionally requires its passive-scan/cancel/suspend,
display-view, bounded classifier, text-alert, and frog-render symbols plus at
least 8 KiB between static RAM and the stack top. Its current locked BIN is
201,628 bytes with SHA-256
`8dff996d2170c24dc30aa781f27ff47fae6ab1ea7a6f53eac777d40edf19ebf7`.
The audited section sizes are 193,136 bytes of text, 8,492 bytes of data, and
4,588 bytes of BSS; measured stack/runtime headroom remains 9,788 bytes.

It does **not** prove that a derived image boots, scans, displays correctly,
accepts a BadgeMagic upload, enters ISP on KEY2, or recovers after a failed
write. Keep both candidates local until those checks pass on the exact physical
badge.
