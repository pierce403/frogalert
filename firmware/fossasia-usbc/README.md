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

It waits 15 seconds after the WCH central role becomes ready, skips work while
BadgeMagic is connected or streaming, pauses advertising, scans passively for
three seconds, and shows `BT 00` through `BT 64+` for five seconds. Later
windows begin about 57 seconds after the previous result. Addresses exist only
in a fixed 64-entry RAM table and are explicitly zeroed after success, failure,
or timeout. A five-second watchdog cancels a stuck scan and restores the prior
advertising state. The image never initiates a central connection.

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

The survey lane additionally requires its passive-scan/cancel/display symbols
and at least 8 KiB between static RAM and the stack top. Its current locked BIN
is 198,988 bytes with SHA-256
`38be81f17dabaf81dfbb4f72cff4ea3841927d495edc1ff0794722c77f4b0df2`.

It does **not** prove that a derived image boots, scans, displays correctly,
accepts a BadgeMagic upload, enters ISP on KEY2, or recovers after a failed
write. Keep both candidates local until those checks pass on the exact physical
badge.
