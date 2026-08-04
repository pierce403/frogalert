# Browser flashing constraints

- “Connect to a running badge” and “replace firmware” are different transports.
  BadgeMagic compatibility uses Web Bluetooth GATT; WCH ISP flashing uses
  WebUSB bulk endpoints 2 OUT and 2 IN.
- Accept only WCH ISP USB ids `4348:55e0` or `1a86:55e0`, then require the ISP
  identify response to report CH582 (`0x82`) in CH58x family (`0x16`).
- Selection of a USB device is never permission to erase it. Automatically
  validate and retain both published profile images, show the target/risk/power
  disclosures without an acknowledgement gate, then make the post-info
  Top/Bottom choice the sole in-page destructive consent.
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
- The running OEM and FOSSASIA-derived USB-C application can enumerate as
  `0416:5020`. The flasher may recognize that previously authorized descriptor
  as a normal-mode hint and show KEY2/dot guidance, but must not open its
  HID/CDC interfaces or treat it as target proof. First-time detection still
  requires a user-initiated browser chooser.
- From detected application mode, call the variants **bottom-button image**
  (`250901`) and **top-button image** (`260404`). Tell the user to hold either
  with the badge display upright and remember which worked. After read-only
  info, ask for that answer; no guide state preselects the profile. Exact PCB
  ids remain canonical in manifests and build tooling. If
  neither worked or the user is unsure, stop before C3.
- If a browser USB operation times out, the underlying command may still have
  completed. Treat device state as unknown and require a fresh identify plus a
  complete program/verify cycle.
- The routine compatible-firmware KEY2 path is profile-specific: KEY2 is
  farther from USB on `B1144C_260404` and nearest USB on `B1144C_250901`.
  Release after the single pixel, then connect promptly. Keep revision-specific
  C3 shorting out of routine web instructions; both photographed USB-C badges
  have soldered batteries without user-removable connectors.
- A physical USB-C badge marked `B1144C_250901` has a populated switch labeled
  `RESET`, but holding KEY2 while pressing it caused no USB re-enumeration from
  the OEM `0416:5020` application device. Treat RESET+KEY2 as disproven for that
  board unless later electrical tracing establishes a different sequence.
- On the same board, holding KEY2 while momentarily bridging both terminals of
  `C3` successfully enumerated the WCH ROM ISP device as `4348:55e0` twice. This
  is physical CLI/kernel evidence for the rail-collapse entry mechanism, not a
  browser-flasher smoke test, and its short-circuit risk keeps it out of routine
  public instructions.
- Keep that physical handoff beside the chooser as an explicit state machine.
  The approximately ten-second indicator is advisory; countdown expiry and USB
  attach events must not invoke `requestDevice()`. Only an explicit chooser tap
  may request new permission. When permission already exists, an attach may
  immediately claim WCH interface 0 and send only Identify plus Read Config;
  it must never erase or program.
- For detected application mode, the first screen leads with the Top/Bottom
  hold instruction. If browser permission is still needed, pair-ready enables
  one **Start watching for ISP** tap that opens the WCH-only chooser before the
  physical hold; leave it open and select WCH as soon as it appears. Remembered
  permission can auto-detect the attach. This preserves the short ROM window for the
  immediate read-only `0xA1`/`0xA7` info exchange. After that exchange, the
  clearly destructive Top/Bottom answer atomically selects the matching cached
  image and starts config reset, flash, and verify without another prompt. Do
  not add checkboxes, a typed phrase, or a separate review gate.
  Native chooser hot-plug behavior remains a physical browser acceptance gate.
- FOSSASIA documents a KEY2 long press only after its own open firmware is
  installed. For OEM, unknown, blank, or broken application firmware, use the
  battery-disconnected cold-entry sequence and do not infer failure from an
  empty chooser before checking the data cable, port, OTG mode, and OS driver.
- The upstream `wchisp` project is GPL-2.0-only. Preserve attribution and review
  license boundaries before copying or materially porting implementation code.
