# Upstream research snapshot

Research performed 2026-07-17. The project intentionally links to upstream
documents instead of vendoring code whose license or revision might diverge.

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
