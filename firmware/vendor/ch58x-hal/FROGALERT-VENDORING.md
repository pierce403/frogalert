# FrogAlert vendoring note

This directory contains the build-relevant subset of `ch58x-hal` commit
`611954e40cc4a562f0c4756ab4c0a935af6158df`, licensed MIT or Apache-2.0.

FrogAlert carries four documented source patches:

- the unavailable `ch58x` `0.4.0` dependency is pinned to the published,
  API-compatible `0.3.0` release; and
- the BLE heap address is formed with `addr_of_mut!` instead of creating a
  shared reference to writable `static mut` storage passed to the precompiled
  library;
- asynchronous GPIO futures, wakers, and interrupt handlers are gated behind
  the HAL's `embassy` feature so a synchronous display-only build can disable
  both Embassy and BLE; and
- the synchronous SysTick delay implements the required `delay_ns` trait method
  so the no-Embassy HAL configuration compiles with embedded-hal 1.0.

The linker script, build script, ISP library, and BLE library are otherwise
copied from that commit. Examples and unused radio libraries are not vendored.

The WCH BLE archive is `vendor/LIBCH58xBLE.a`:

- reported version: `CH58x_BLE_LIB_V1.90`
- SHA-256: `9363b1fd04a8d4c33798ac480fd860b4b4cce023053d8e3dfde1a9a3b00d1b72`

Do not update this dependency or substitute another BLE archive without
re-running the cross-build, instruction audit, and physical radio tests.
