# One-pane flasher wizard

- Replaced the visible `/flash/` dashboard with four gated panes: connect,
  firmware, confirm, and flash, followed by terminal success.
- Only the active pane is visible and exposed to accessibility APIs. The
  existing detailed controls remain in a hidden compatibility container while
  the protocol code is incrementally simplified.
- `navigator.usb.getDevices()` automatically opens and read-only identifies one
  previously authorized WCH ISP device. A first-time badge still requires an
  explicit chooser tap; attach events never call `requestDevice()`.
- The firmware pane appears only after USB descriptor/endpoint validation,
  CH582 `0x82 / 0x16` Identify, and Read Config succeed.
- The confirmation and flash panes reuse the existing exact profile, physical
  marking, artifact, typed phrase, captured-device, config-reset/readback,
  erase, program, and byte-verification gates.
- Browser inspection at 390×844 showed only the connect pane, no horizontal
  overflow, an enabled explicit chooser action, and no page console errors.
- Android WebUSB physical flashing remains unverified.
