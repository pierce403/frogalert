# Browser flashing constraints

- “Connect to a running badge” and “replace firmware” are different transports.
  BadgeMagic compatibility uses Web Bluetooth GATT; WCH ISP flashing uses
  WebUSB bulk endpoints 2 OUT and 2 IN.
- Accept only WCH ISP USB ids `4348:55e0` or `1a86:55e0`, then require the ISP
  identify response to report CH582 (`0x82`) in CH58x family (`0x16`).
- Selection of a USB device is never permission to erase it. Require a local
  firmware file and explicit hardware/risk/power confirmations.
- Pad firmware to a 1 KiB boundary, enforce the CH582 448 KiB code-flash limit,
  program 56-byte chunks, and verify every programmed byte before reset.
- Firmware bytes and chip identifiers stay inside the browser. The static site
  has no upload or telemetry endpoint.
- The browser path is experimental until tested with a physically opened and
  confirmed CH582M 11×44 BadgeMagic board.
- The guided destructive path lives only at `/flash/`; keep the landing lab
  read-only at both DOM and controller gates. Android Chrome can expose WebUSB only
  with USB host support plus a data-capable OTG connection and extra Android
  permission; iOS browsers do not expose WebUSB.
- ISP can detect CH582 `0x82/0x16`, bootloader version, configuration bytes, and
  UID integrity. It cannot determine arbitrary installed application firmware,
  physical PCB revision, matrix wiring, oscillator population, or peripheral
  health. Optional GATT Device Information text is self-reported only.
- If a browser USB operation times out, the underlying command may still have
  completed. Treat device state as unknown and require a fresh identify plus a
  complete program/verify cycle.
- The KEY2 recovery path is battery disconnected, hold the button nearest USB,
  attach stable USB while holding, release after the single pixel, then connect
  promptly. Keep the revision-specific C3 shorting method out of routine web
  instructions.
- The upstream `wchisp` project is GPL-2.0-only. Preserve attribution and review
  license boundaries before copying or materially porting implementation code.
