# Compact phone flasher

- Reworked `/flash/` around the Android Chrome + data-capable USB OTG path.
- WebUSB and local BIN selection are visually first within their sections.
- Browser diagnostics, detected-device facts, recovery detail, and session logs
  are disclosures; safety confirmations and program/verify state remain visible.
- Narrow viewports use a sticky horizontal step rail and a sticky final flash
  action.
- `./scripts/verify` passes.
- In-app browser DOM inspection at 390×844 confirmed the compact disclosures,
  phone requirements, WebUSB controls, local BIN control, confirmations, and
  program/verify controls all render. Physical Android WebUSB remains unverified.
