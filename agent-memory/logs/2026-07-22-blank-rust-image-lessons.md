# Blank Rust image: failure analysis and lessons learned

## Outcome

The first FrogAlert image flashed to the photographed CH582M USB-C badge
failed its physical smoke test and has been withdrawn.

- PCB marking: `B1144C_250901`
- firmware profile: `B1144C_250901_USB_C`
- source commit: `f794974584b67f8809f5ab8cb2c52269aab7509b`
- file: `frogalert-pixel-walk-b1144c-250901-usbc-f794974.bin`
- size: 5,632 bytes
- SHA-256: `02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22`

After the user-run CLI flash, the panel stayed blank. Ordinary application USB
also did not enumerate, but that image deliberately had no USB stack, so this
was expected and was not independent evidence of a startup failure. Holding
KEY2 did not enter ISP, which did fail the image's recovery acceptance test.
The badge was subsequently recovered through the CH582 mask-ROM ISP and again
boots FOSSASIA's working USB-C firmware. The exact recovery command transcript
was not captured.

## Confirmed linked-image defect

The standalone Rust firmware combined `ch58x` PAC 0.3.0 with `qingke-rt` 0.5.0.
Those versions disagree about the section containing the external interrupt
table:

- PAC 0.3.0 emits `__EXTERNAL_INTERRUPTS` as ordinary read-only data;
- `qingke-rt` 0.5.0 expects `.vector_table.external_interrupts` in the RAM
  `.highcode` vector region.

The final USB-C pixel-walk ELF proves the mismatch:

```text
00001360 T DefaultInterruptHandler
00001474 R __EXTERNAL_INTERRUPTS
20000000 T _highcode_vma_start
20000004 T __CORE_INTERRUPTS
20000040 T __EXCEPTIONS
20000070 T TMR0
```

CH582 interrupt 16 is Timer 0. With `mtvec` based at `0x20000000`, its vector
word is at `0x20000040`. The failed raw image contains little-endian
`0x00001360` at corresponding file offset `0x44`: the default interrupt
handler, whose body is an infinite self-jump. The application enables Timer 0
immediately after selecting the first framebuffer pixel. Its first interrupt
therefore enters that loop before the display refresh or foreground KEY2 poll
can run. This deterministically explains both the blank display and the failed
application recovery hook. The count firmware has the same linked-vector
defect and is also quarantined.

The working FOSSASIA USB-C image instead contains a valid RAM high-code handler
pointer at that vector position. Its WCH startup, linker layout, display timer,
USB HID+CDC stack, BLE/TMOS runtime, calibrated internal LSI, and KEY2 task were
tested together rather than reconstructed independently.

## What the old checks proved—and did not prove

The failed image passed all prior automated gates:

- 32-bit RISC-V IMC ELF and no AMO/LR/SC instructions;
- the `frogalert_enter_rom_isp` function ended with `jr zero`;
- the raw image contained WCH marker `0xF5F9BDA9` at offset `0x14`;
- package size and SHA-256 matched the hosted manifest;
- host, browser, and static-site tests passed.

Those checks established byte identity and the presence of individual code
fragments. They did not establish that the interrupt table referenced those
fragments, that execution reached the foreground KEY2 poll, or that the badge
could recover after boot. Copying the single startup marker was necessary for
parity but nowhere near sufficient to establish runtime compatibility.

## Durable changes in direction

1. The exact FOSSASIA USB-C source at
   `9ce885d682b5c56c3ac7595c09e009a210885221` becomes FrogAlert's initial
   hardware shell. Preserve its startup assembly, linker script, clock setup,
   display scan, USB HID+CDC, BadgeMagic BLE service, TMOS scheduler, and KEY2
   ISP task.
2. Keep Rust for allocation-free parsing, classification, counting, and other
   pure logic behind a narrow primitive C ABI. Rust does not own reset,
   vectors, interrupts, clocks, USB, BLE role setup, or display refresh in the
   next images.
3. The next physical image is a C-only compatibility canary with only
   self-identifying metadata changed. After it passes, add a Rust ABI-only
   canary before enabling scanning or changing the panel.
4. Post-link gates must validate vector section placement and actual handler
   words, not only symbol presence. Any PAC/runtime substitution is a binary
   layout change that requires this audit.
5. Unverified FrogAlert binaries remain only under ignored `tmp/`. Public
   assembly accepts one profile/PCB pair per artifact and requires a structured
   record bound to hash and source. It must prove CLI and WebUSB program/verify,
   application USB, display, BadgeMagic upload, power-cycle behavior, separate
   KEY1/short-KEY2 behavior, KEY2-only dot-to-ISP recovery, and known-good
   reflash. A dated transcript must repeat the exact identifiers and contain
   captured sections for each test. A C3-assisted ROM entry does not satisfy
   the application recovery gate. This failed SHA remains in the permanent
   quarantine registry.
6. The pinned FOSSASIA builder reconstructs the final BIN from the audited ELF,
   requires byte identity with the Make-produced BIN, and locks both baseline
   and canary size/SHA-256. Descriptor strings and marker fragments are not
   accepted as evidence that arbitrary bytes came from the audited executable.

## Required physical smoke sequence

Before any future FrogAlert image is published:

1. capture the exact `wchisp` program and byte-verify transcript;
2. after normal KEY2 recovery is proven, capture a WebUSB program and byte
   verification of the same exact artifact;
3. power-cycle and confirm the expected application identity;
4. confirm USB `0416:5020` HID and CDC enumeration;
5. upload and display a nametag through the BadgeMagic app;
6. confirm KEY1 and short KEY2 behavior;
7. hold KEY2 through the dot cue and confirm ISP `4348:55e0` enumeration;
8. reflash the known-good image through that normal recovery path;
9. repeat boot and recovery after another power cycle.

Only after the C-only canary passes the complete sequence should the Rust ABI
canary be tried. Radio scanning and alert overlays come later.
