# Third-party sources and licenses

FrogAlert is Apache-2.0 unless a file says otherwise.

- FOSSASIA `badgemagic-firmware` — Apache-2.0. Pinned source for FrogAlert's
  initial USB-C hardware/runtime shell, plus hardware mapping, BadgeMagic
  protocol documentation, and flashing safety reference.
  <https://github.com/fossasia/badgemagic-firmware>
- `ch32-rs/ch58x-hal` — MIT OR Apache-2.0. Rust HAL and BLE feasibility
  reference. <https://github.com/ch32-rs/ch58x-hal>
- `ch32-rs/wchisp` — GPL-2.0-only. USB ISP reference implementation and device
  database. <https://github.com/ch32-rs/wchisp>
- Colonel Panic OUI-Spy detector — no explicit license was found at review time;
  factual rule provenance only, with no code copied.
  <https://github.com/colonelpanichacks/ouispy-detector>
- Unagi — repository license applies. Initial advertised-name rule provenance.
  <https://github.com/pierce403/unagi>

The browser ISP module is an independent small implementation of the documented
packet behavior with source attribution. Before redistributing copied or
materially adapted GPL implementation code, review the license boundary and add
the required notices/source terms rather than silently treating it as Apache.

## Pinned FOSSASIA USB-C hardware shell

`firmware/fossasia-usbc/` pins FOSSASIA source commit `9ce885d` and records the
source archive, MRS V1.92 toolchain, critical runtime files, and known-good
linked baseline by size and SHA-256. Source and toolchain are downloaded into
ignored `tmp/`; the repository does not vendor or redistribute the complete
archives.

Derived images preserve upstream Apache-2.0 notices and the notices in WCH's
startup, peripheral, ISP, and BLE components. Those WCH components are for WCH
microcontrollers; FrogAlert's build remains CH582M-specific. Keep the original
license files in build/release source bundles, and do not imply the opaque WCH
BLE archive is an all-open or all-Rust implementation.

## Quarantined CH58x HAL and WCH radio archive

`firmware/vendor/ch58x-hal/` is the build-relevant subset of MIT OR Apache-2.0
`ch32-rs/ch58x-hal` commit
[`611954e`](https://github.com/ch32-rs/ch58x-hal/commit/611954e40cc4a562f0c4756ab4c0a935af6158df).
FrogAlert carries four documented patches: the upstream reference to the
unpublished `ch58x` `0.4.0` PAC is changed to published `0.3.0`; the BLE heap
address uses a raw mutable pointer rather than an aliasing shared reference;
async GPIO machinery is gated behind the HAL's `embassy` feature; and the
synchronous SysTick delay supplies embedded-hal 1.0's required `delay_ns`
method. The last two allowed the historical pixel-walk build to disable BLE and
Embassy. That standalone runtime is now quarantined because the substituted PAC
and runtime produced an invalid external-vector layout. The source remains for
forensics and reusable pure logic, not as the base of new badge images. The
upstream license notices and a local provenance note are retained.

The HAL links WCH's precompiled `vendor/LIBCH58xBLE.a`; the radio stack is not
an all-Rust implementation. The pinned archive reports `CH58x_BLE_LIB_V1.90`
and has SHA-256
`9363b1fd04a8d4c33798ac480fd860b4b4cce023053d8e3dfde1a9a3b00d1b72`.
It carries Nanjing Qinheng Microelectronics notices and is used only for the WCH
CH582 target. Do not substitute another archive without checking its license,
FFI compatibility, binary hash, instruction audit, and physical BLE behavior.

## Redistributed open BadgeMagic image

`firmware/releases/badgemagic-open-v0.1-hardware-rev1.bin` is an exact copy of
FOSSASIA's published `badgemagic-ch582.bin` from the Apache-2.0
[`v0.1` release](https://github.com/fossasia/badgemagic-firmware/releases/tag/v0.1),
which is labeled for the Micro-USB board only.

- Upstream artifact:
  <https://github.com/fossasia/badgemagic-firmware/releases/download/v0.1/badgemagic-ch582.bin>
- Source commit:
  <https://github.com/fossasia/badgemagic-firmware/commit/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8>
- Byte length: `155672`
- SHA-256: `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`

The upstream build includes WCH's BLE archive and peripheral sources carrying
Nanjing Qinheng Microelectronics copyright notices and an instruction that the
software and binaries are used on its microcontrollers. FrogAlert restricts
this image to an identified WCH CH582M and preserves the FOSSASIA source,
license, release, and WCH provenance here. The image is an open
BadgeMagic-compatible substitute; it is not the unavailable OEM firmware and
is not yet hardware-verified by FrogAlert.
