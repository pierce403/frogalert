# Historical compact phone flasher

This records an earlier dense phone layout. The 2026-08-03 minimized-click
flow supersedes its extra controls and gating.

- Reworked `/flash/` around the Android Chrome + data-capable USB OTG path.
- WebUSB and local BIN selection are visually first within their sections.
- Browser diagnostics, detected-device facts, recovery detail, and session logs
  were rendered as disclosures alongside program/verify state.
- Narrow viewports use a sticky horizontal step rail and a sticky final flash
  action.
- `./scripts/verify` passes.
- In-app browser DOM inspection at 390×844 confirmed that the historical compact
  disclosures and program/verify controls rendered. Physical Android WebUSB
  remains unverified.
