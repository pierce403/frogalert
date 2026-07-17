# Hardware and flashing safety

FrogAlert targets only the FOSSASIA-supported BadgeMagic variant:

| Property | Required value |
| --- | --- |
| MCU | WCH CH582M, QFN48 |
| CPU | QingKe RISC-V |
| Display | 11x44 charlieplexed LED matrix |
| Battery | nominal 3.7 V Li-ion |
| Bootloader USB ID | `4348:55e0` |

Badges sold under similar names can contain different controllers or 11x55
matrices. The enclosure and the OEM BLE name `LSLED` are not sufficient proof.

## Before the first flash

1. Open the badge and photograph the PCB and MCU marking.
2. Confirm exactly 44 LED columns.
3. Disconnect the battery, hold KEY2 (near USB), connect USB, and confirm the
   ISP device appears as `4348:55e0`.
4. Do not flash until a FrogAlert image has been built for the observed hardware
   revision.

The OEM image cannot be backed up because read protection is enabled. There is
no known route to restore it after replacement.

The eventual flash flow uses `wchisp`:

```sh
wchisp config reset
wchisp flash frogalert-ch582.bin
```

This command is documentation only today; no release image is provided yet.

