# Display, recovery, and BLE count facts

## Recovery is not factory restoration

The manufacturer firmware is read-protected and no official OEM image is
available. FOSSASIA release v0.1 supplies an open BadgeMagic-compatible image
for the Micro-USB board, not the original bytes. FrogAlert calls this an open
firmware substitute and restricts it to exact profile `HARDWARE_REV1`.

Pinned artifact facts:

- filename: `badgemagic-open-v0.1-hardware-rev1.bin`
- size: 155,672 bytes
- SHA-256: `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`
- upstream source commit: `68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8`
- FrogAlert hardware evidence: none yet

The website's recovery control only prepares and hash-checks this file. The
manifest's false FrogAlert hardware-verification flag blocks the destructive
button for this bundled file. A physical Rev1 identify/program/verify/boot/app/
recovery smoke must pass before enabling it.

## Display software versus hardware proof

Text rendering is understood: the logical framebuffer is 44 columns of 11-bit
row data, and a compact 5x7 renderer can draw counts and clipped alert text.
The upstream scan topology uses 23 Charlieplex nets and 22 source phases. The
clean research reference is FOSSASIA commit `aa890e9`; current head `eb6e9da`
has duplicate I/K pin entries and must not be ported.

The Rev1 Rust bank driver cross-links, but readable text on a real badge is not
proved. Run a slow single-pixel walk before trusting orientation, the row-zero
swap, pin ordering, current, or refresh. Rev2's T net is still disputed as PB6
versus PB23, so no Rev2 build is offered.

## Atomic-free BLE prototype

The verified dependency base is `ch58x-hal` commit `611954e` with its
unpublished `ch58x 0.4.0` dependency changed to published `0.3.0`. Target
`riscv32imc-unknown-none-elf`; never opt into QingKe hardware atomics. The build
script disassembles every linked ELF and rejects AMO, LR, or SC instructions.

The lab build passively scans for three seconds, counts at most 64 distinct
advertiser addresses in an allocation-free table, zeros that table at the end
of the window, displays the approximate count for seven seconds, and repeats.
It logs only the count. It is observer-only and does not provide BadgeMagic
GATT compatibility.

The vendored WCH BLE archive reports V1.90 and has SHA-256
`9363b1fd04a8d4c33798ac480fd860b4b4cce023053d8e3dfde1a9a3b00d1b72`.
The HAL currently assumes an external 32.768 kHz LSE; confirm that crystal on
the target PCB before a radio test.
