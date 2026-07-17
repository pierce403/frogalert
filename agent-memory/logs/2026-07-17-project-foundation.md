# 2026-07-17 — project foundation

## Outcomes

- Initialized and published `pierce403/frogalert` on `main`.
- Added a Rust `no_std` detection core with six passing tests and a simulator.
- Confirmed the target is a WCH CH582M RISC-V BLE MCU with an 11×44 display.
- Confirmed BadgeMagic compatibility uses service/characteristic `FEE0/FEE1`.
- Confirmed WCH factory flashing is USB ISP, not BLE.
- Added a static project site, guarded browser device flows, project operating
  docs, repo-local skills, and an extensive readiness tracker.

## Important limitation

No firmware image has been built or flashed. Browser protocol checks can be
unit-tested without hardware, but physical flashing remains unverified.
