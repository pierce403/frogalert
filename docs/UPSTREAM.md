# Upstream research snapshot

Research performed 2026-07-17 and refreshed on 2026-07-18. The project records
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

## Rust and display implementation snapshot

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
the display-only pixel walk compile with HAL default features disabled, so it
does not link the WCH BLE archive or initialize an external LSE.

FrogAlert deliberately targets `riscv32imc-unknown-none-elf`, not upstream's
IMAC default. QingKe maintainers found V4 atomic read/modify/write behavior
unsafe and added an explicit safety gate. The build disassembles the final ELF
and rejects AMO, LR, or SC instructions:

- <https://github.com/ch32-rs/ch32-hal/issues/59>
- <https://github.com/ch32-rs/qingke/commit/75dbd9539d5abf66f24435b66da3a02bb251dde6>

The logical display format is a 44-column framebuffer whose low 11 bits are LED
rows. Text rendering is understood at the host layer, but the physical driver
still needs revision-specific proof. Do not port current FOSSASIA `leddrv.c` at
`eb6e9da`: duplicate I/K initializers shift later pin entries. Use the clean
`aa890e9` mapping as the research reference and validate it with a slow pixel
walk:

- <https://github.com/fossasia/badgemagic-firmware/blob/aa890e90649f288b02e80002ab82088128bead14/src/leddrv.c>
- <https://github.com/fossasia/badgemagic-firmware/blob/eb6e9dab4ec3924085e79f596aaca64e347023f5/src/leddrv.c>

The ordinary USB-C revision's T net remains disputed as PB6 versus PB23, so no
Rev2 target is enabled without a resolved PCB identifier and physical pixel
test.

## Detection seeds

Unagi currently seeds name rules for `Flipper`, `Axon Body`, `TASER`,
`Ray-Ban`, and `Ray Ban`:

<https://github.com/pierce403/unagi>

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
