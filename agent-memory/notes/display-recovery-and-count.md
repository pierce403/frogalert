# Display, recovery, and BLE count facts

## Physical USB-C badge evidence

A 2026-07-22 macro photo of the opened PCB marked `B1144C_250901` clearly
shows a WCH `CH582M` in the 48-pin package. This satisfies the MCU-marking gate
only. It does not establish the USB-C board's charlieplex mapping or make the
current Micro-USB `HARDWARE_REV1` artifacts compatible. A metal-can component
is populated at `Y2`, but the photo does not prove its frequency or connection.
The pouch battery is soldered to PCB tabs and has no user-removable connector;
the documented cold-entry battery isolation is skilled bench work and remains
untested on this exact board.

The same physical session established a successful C3/KEY2 ROM-ISP entry as
`4348:55e0`. After a user-run flash, the badge booted an application whose USB
descriptors self-report manufacturer `FOSSASIA WAS HERE`, product
`LED Badge Magic`, and serial `BM1144-C fw: v0.1`; it exposes HID and CDC ACM
and created `/dev/ttyACM0`. The downloaded file was later recovered as
`/home/pierce/Downloads/badgemagic-ch582.bin`. It exactly matches FOSSASIA's
pinned USB-C development blob `18bffdb8f766ddfd818aecf102ac0df284ad1c07`:

- size: 177,704 bytes
- SHA-256: `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`
- embedded version: `(C) v0.1-42-g9ce885d`
- source commit: `9ce885d682b5c56c3ac7595c09e009a210885221`

The retained evidence still lacks the `wchisp` command/program/verify
transcript, so it cannot prove that those exact local bytes were the ones
programmed.

## Recovery is not factory restoration

The manufacturer firmware is read-protected and no official OEM image is
available. FOSSASIA release v0.1 supplies a Micro-USB open
BadgeMagic-compatible image, not the original bytes. The USB-C `BM1144-C` image
that booted on the physical badge is a development `bin`-branch artifact rather
than a v0.1 release asset. FrogAlert's bundled website substitute remains
restricted to the exact Micro-USB profile `HARDWARE_REV1`.

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

The Rust bank driver now carries mutually exclusive `HARDWARE_REV1` and
`B1144C_250901_USB_C` candidates. The USB-C map is pinned to the exact working
development source: J PB15, K PB14, T PB6; all other display nets match Rev1.
Do not alias this to generic `BM1144-C`, Rev2, or Rev3. Run a slow single-pixel
walk before trusting orientation, the row-zero swap, pin ordering, current, or
refresh.

Both Rust lab applications share a 2.2-second KEY2 hold and address-zero ROM
transfer implementation. Unit/build evidence is not physical recovery proof;
each artifact still needs short-press and `4348:55e0` long-press acceptance.

WCH startup compatibility adds a separate packaging invariant. Official WCH
startup places `0xF5F9BDA9` in the reserved core-vector word at raw image offset
`0x14`; qingke-rt 0.5.0 leaves that word zero. FrogAlert's build scripts replace
only zero with that sentinel before hashing and site publication, and reject
any other value as linker drift. The sentinel is parity with working images,
not a demonstrated cause of the KEY2 recovery path.

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
The pinned FOSSASIA USB-C source uses calibrated internal LSI, and its later
upstream history explicitly says the board cannot use LSE. The Rust count image
and HAL BLE initializer currently select external LSE, so only the display-only
pixel walk may target `B1144C_250901_USB_C`; USB-C radio builds remain blocked.

Hosted FrogAlert lab images belong in the manifest's separate `lab_images`
collection. `hardware_verified: false` permits local fetch/hash/profile
inspection but must remain an executable direct-write lock. The first hosted
entry is the 5,632-byte USB-C pixel walk from source `f794974`, SHA-256
`02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22`,
bound to `B1144C_250901_USB_C` and physical marking `B1144C_250901`. It remains
unverified; hosting and download never imply flash approval.
