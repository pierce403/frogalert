# Upstream research snapshot

Research performed 2026-07-17 and refreshed on 2026-07-22. The project records
exact upstream links and only vendors the build-required HAL subset and the
explicitly attributed recovery artifact.

## BadgeMagic

- Firmware and hardware documentation:
  <https://github.com/fossasia/badgemagic-firmware>
- Badge BLE protocol (`FEE0/FEE1`, legacy packet format):
  <https://github.com/fossasia/badgemagic-firmware/blob/master/BadgeBLE.md>
- BadgeMagic app: <https://github.com/fossasia/badgemagic-app>
- CH58x Rust HAL and BLE examples: <https://github.com/ch32-rs/ch58x-hal>
- WCH ISP flasher: <https://github.com/ch32-rs/wchisp>

The current FOSSASIA firmware is Apache-2.0. Preserve its copyright and NOTICE
requirements when incorporating code, and distinguish copied implementation
from independently implemented hardware/protocol behavior. The `wchisp` tool is
GPL-2.0-only and has a separate license boundary; see `docs/THIRD_PARTY.md`.

### Recovery-image finding

No official OEM/factory image is available. FOSSASIA documents that the closed
manufacturer firmware is read-protected and cannot be dumped, so overwriting it
has no path back to the original bytes:

<https://github.com/fossasia/badgemagic-firmware#supported-hardware>

FOSSASIA's only published firmware release is open replacement firmware
[`v0.1 (First Release, micro-USB only)`](https://github.com/fossasia/badgemagic-firmware/releases/tag/v0.1).
FrogAlert records that artifact as an optional `HARDWARE_REV1` substitute with
the exact upstream source commit, byte length, and SHA-256 in the release
manifest. It remains hardware-unverified by FrogAlert and is never described as
a factory reset. A documented incompatible 11×55 badge failed after receiving
the 11×44 image, which is why chip identity alone cannot unlock this path:

<https://github.com/fossasia/badgemagic-firmware/issues/59>

FOSSASIA also maintains force-updated development builds on its `bin` branch.
The USB-C file downloaded during the physical session exactly matches pinned
blob `18bffdb8f766ddfd818aecf102ac0df284ad1c07` at orphan commit `b56cd949`:

- file: `usb-c/badgemagic-ch582.bin`;
- size: `177704` bytes;
- SHA-256: `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`;
- embedded build/source: `(C) v0.1-42-g9ce885d` /
  `9ce885d682b5c56c3ac7595c09e009a210885221`.

This is a development artifact, not a v0.1 release asset. Pin the orphan
commit because the `bin` branch is force-updated:

- <https://github.com/fossasia/badgemagic-firmware/blob/b56cd9495738e8e3170bf723e70b445de936a5d2/usb-c/badgemagic-ch582.bin>
- <https://github.com/fossasia/badgemagic-firmware/commit/9ce885d682b5c56c3ac7595c09e009a210885221>

## Firmware-base decision

The exact FOSSASIA USB-C ELF at bin commit `b56cd949` converts with LLVM
`objcopy` to the known-good 177,704-byte BIN byte-for-byte. That gives FrogAlert
a defensible linked baseline, not merely similar source. Preserve its WCH
startup and linker files, USB HID+CDC stack, BLE/TMOS runtime, internal-LSI
calibration, display code, and KEY2 task in the first derived images.

The pinned ELF is 250,072 bytes with SHA-256
`d13cc219ae21824b8de45f476e2e348a57d0d7b39def72972bb2e977197838df`.
Its `objcopy -O binary -S` result and a fresh source/toolchain rebuild both
produce the same known-good BIN. The build gate also reads `.highcode` and
requires IRQ 16 to target `TMR0_IRQHandler` and IRQ 22 to target
`USB_IRQHandler`.

FrogAlert will initially add Rust only as a small `no_std` static library behind
a primitive C ABI. The known-good WCH GCC/linker path remains the final linker;
Rust does not provide the entry point, interrupt vectors, clocks, USB, BLE role
setup, or display refresh. The first derived artifact is a C-only metadata
canary, followed by an ABI-only Rust canary, before any scan or panel change.

## Quarantined Rust runtime snapshot

The count prototype pins `ch58x-hal` commit
[`611954e`](https://github.com/ch32-rs/ch58x-hal/commit/611954e40cc4a562f0c4756ab4c0a935af6158df),
whose scanner uses `GAPRole_ObserverInit`, a three-second discovery window, and
passive rather than active scanning. The HAL wraps WCH's precompiled BLE
library; it is not a pure Rust radio stack. That commit names an unpublished
`ch58x` `0.4.0` dependency, so FrogAlert's vendored manifest uses the published
`0.3.0` PAC and records that patch beside the source. FrogAlert also patches
the BLE heap address construction to hand the writable precompiled library a
raw mutable pointer without first creating a shared reference. Two additional
minimal-mode patches gate async GPIO machinery behind the `embassy` feature and
implement the missing synchronous SysTick `delay_ns` method. Those changes let
the display-only pixel walk compile, but a successful link hid an incompatible
PAC/runtime vector layout. `ch58x` 0.3.0 emits `__EXTERNAL_INTERRUPTS` as
ordinary read-only data while `qingke-rt` 0.5.0 collects only
`.vector_table.external_interrupts` into its RAM high-code table. In the failed
image, Timer 0's live vector pointed to `DefaultInterruptHandler` and wedged on
the first refresh interrupt. The count image has the same defect. Both
standalone images are quarantined.

FrogAlert deliberately targets `riscv32imc-unknown-none-elf`, not upstream's
IMAC default. QingKe maintainers found V4 atomic read/modify/write behavior
unsafe and added an explicit safety gate. The build disassembles the final ELF
and rejects AMO, LR, or SC instructions:

- <https://github.com/ch32-rs/ch32-hal/issues/59>
- <https://github.com/ch32-rs/qingke/commit/75dbd9539d5abf66f24435b66da3a02bb251dde6>

The atomic-free instruction rule still applies to every future Rust archive,
but it is not a runtime-correctness proof. Final image audits must additionally
validate actual vector placement and handler words. Do not repair the mismatch
by merely assigning the PAC 0.3 array to the new section: that array contains
16 leading reserved words and would shift the table again.

The logical display format is a 44-column framebuffer whose low 11 bits are LED
rows. Text rendering is understood at the host layer. Do not port current
FOSSASIA `leddrv.c` at
`eb6e9da`: duplicate I/K initializers shift later pin entries. Use the clean
`aa890e9` mapping as the research reference and validate it with a slow pixel
walk:

- <https://github.com/fossasia/badgemagic-firmware/blob/aa890e90649f288b02e80002ab82088128bead14/src/leddrv.c>
- <https://github.com/fossasia/badgemagic-firmware/blob/eb6e9dab4ec3924085e79f596aaca64e347023f5/src/leddrv.c>

For the exact downloaded USB-C artifact, the clean source map is the same as
Micro-USB except T is PB6 rather than PB23; J remains PB15 and K PB14. FrogAlert
names that candidate `B1144C_250901_USB_C` after the observed board marking and
does not alias it to generic `BM1144-C`, Rev2, or Rev3. The later `eb6e9da`
revision scheme maps neither Rev2 nor Rev3 exactly to those three pins and also
contains duplicate I/K initializers. A physical 484-position pixel walk remains
required before approving the candidate map.

The pinned USB-C FOSSASIA source disables external 32 kHz selection, powers the
internal LSI, and registers calibration. Upstream commit `4d0521a` later states
explicitly that the board has no external crystal and cannot use LSE:

<https://github.com/fossasia/badgemagic-firmware/commit/4d0521aa1f285af44bf7e08608860128181da255>

The vendored Rust HAL BLE initializer hardcodes external LSE and no calibration
callback. It is not used for the next USB-C images; the FOSSASIA C shell keeps
its proven internal-LSI path.

## Detection seeds

Unagi commit `53099cc9b61f98c02eaf1860313c43d188aec533` seeds a
case-insensitive Bluetooth-name rule for `Flipper`, not a Flipper OUI. It also
seeds name rules for `Axon Body`, `TASER`, `Ray-Ban`, and `Ray Ban`:

<https://github.com/pierce403/unagi/blob/53099cc9b61f98c02eaf1860313c43d188aec533/app/src/main/java/ninja/unagi/alerts/DefaultAlertRules.kt>

Official Flipper firmware at pinned commit
`7432d21a7e362d4a5f636e24d6209fbb2eedff1f` constructs the BLE local name as
`xFlipper <device-name>` and passes that complete local-name field into its GAP
advertising configuration. Its public address is derived from STM32 device and
company identifiers; that is not a unique Flipper vendor prefix and would also
describe unrelated STMicroelectronics products. FrogAlert therefore matches
the advertised name case-insensitively and does not claim a Flipper OUI:

- <https://github.com/flipperdevices/flipperzero-firmware/blob/7432d21a7e362d4a5f636e24d6209fbb2eedff1f/targets/f7/furi_hal/furi_hal_version.c>
- <https://github.com/flipperdevices/flipperzero-firmware/blob/7432d21a7e362d4a5f636e24d6209fbb2eedff1f/targets/f7/ble_glue/gap.c>
- <https://github.com/flipperdevices/flipperzero-firmware/blob/7432d21a7e362d4a5f636e24d6209fbb2eedff1f/targets/f7/ble_glue/profiles/serial_profile.c>

The rule remains a hint: custom firmware can rename a Flipper and any other
device can advertise a name containing `Flipper`.

OUI-Spy's published database provides these initial prefixes:

| Prefix | Label | FrogAlert treatment |
| --- | --- | --- |
| `00:25:DF` | Axon | BLE public-address match |
| `B4:1E:52` | Flock Safety | BLE public-address match |

Source: <https://github.com/colonelpanichacks/ouispy-detector/blob/main/ouis.md>

The database also contains 30 prefixes labeled specifically as Wi-Fi
promiscuous-mode Flock research. The CH582M is a BLE MCU, not an 802.11 radio,
so those prefixes are excluded from FrogAlert's BLE rules.

OUI matches are hints, not identity proof. Vendors can share modules, BLE
addresses can be randomized, and a detected device is not proof of a person or
agency being present.
