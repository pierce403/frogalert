# Pinned FOSSASIA USB-C firmware base

FrogAlert's replacement badge architecture now uses the exact working
FOSSASIA USB-C firmware as its hardware/runtime shell instead of a standalone
Rust reset/vector/HAL stack.

## Pinned inputs

- FOSSASIA source commit:
  `9ce885d682b5c56c3ac7595c09e009a210885221`
- source archive: 14,644,075 bytes, SHA-256
  `982e36ade508545487c3282a7fd12c35a4f4df12e5b1959a8f0b2065553e9d50`
- MRS Linux toolchain: V1.92, 330,007,712 bytes, SHA-256
  `33e0dd7581a2eea25bc5d1aa2c31f5c8b316e543b954d84f9e1ffc5999e93fea`
- firmware selector: `USBC_VERSION=1`
- embedded version inputs: `v0.1-42-g9ce885d` / `v0.1`
- known-good ELF: bin commit `b56cd9495738e8e3170bf723e70b445de936a5d2`,
  250,072 bytes, SHA-256
  `d13cc219ae21824b8de45f476e2e348a57d0d7b39def72972bb2e977197838df`

The lock also records hashes for the compiler tools, the entire embedded GCC
tree, startup assembly, linker script, WCH BLE and ISP archives, main/button
logic, display driver, BLE setup/profile, and USB implementation.

## Baseline result

Command:

```sh
FROGALERT_FOSSASIA_OFFLINE=1 \
  ./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
```

Result:

- 177,704-byte BIN
- SHA-256
  `2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`
- byte-for-byte match with the known-good FOSSASIA USB-C artifact
- WCH startup sentinel present
- reset, Timer 0, USB interrupt/start, BadgeMagic legacy service, TMOS clock,
  and main symbols present
- RAM vector base equals `.highcode` start, IRQ 16 targets `TMR0_IRQHandler`,
  and IRQ 22 targets `USB_IRQHandler`
- USB `0416:5020` identity strings present
- no AMO/LR/SC instructions in the linked image

The build was repeated independently and produced the same result. Upstream
compiler warnings remain visible; the exact known-good output is the baseline,
so do not patch them casually as part of FrogAlert integration.

## Metadata-only compatibility canary

Command:

```sh
FROGALERT_FOSSASIA_OFFLINE=1 \
  ./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
```

Result:

- 177,788-byte BIN
- SHA-256
  `6591f55f6035721384dd2780cb66c03d58e5e08817a1b4e5808a9d2821503e87`
- all baseline runtime/USB/BLE/display/KEY2 symbol and instruction audits pass
- the only requested overlay is a retained, inert C build-identity string
- the Make-produced BIN exactly matches `objcopy -O binary -S` of the audited
  ELF, and the canary size/SHA-256 are locked rather than inferred from markers

This canary is **build evidence only**. It remains under ignored
`tmp/fossasia-usbc/`, is not in the release manifest, and is not downloadable
from the site. It is not approved for public or end-user flashing. Its only
permitted next use is an explicitly authorized one-badge bench smoke; the first
CLI program/verify starts the later WebUSB program/verify, application USB,
BadgeMagic upload, button, KEY2 ISP, known-good reflash, and power-cycle
checklist.

## Rust boundary

The next Rust step is a separate ABI-only canary. A small `no_std` static
library may expose primitive C functions for version/classification/counting.
FOSSASIA C continues to own reset, vectors, interrupts, clocks, USB, BLE/TMOS,
display scanning, buttons, power, and the final link. No scanner or display
change belongs in the first Rust-linked canary.
