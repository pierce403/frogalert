# Delayed screen-on from charger-status wake

The owner physically observed a badge turn itself on unpredictably, sometimes
roughly 20 minutes after entering hardware shutdown on beta.15.

The exact path was deterministic in source: pinned FOSSASIA `poweroff()` armed
active-low `CHARGE_STT` on PA0 for falling-edge GPIO wake. FrogAlert retained
that source, wrote its screen-off reset marker, and reset from the GPIO ISR.
Early boot recognized the retained marker but did not require a button, so a
charger-state transition or PA0 glitch became a normal illuminated boot.

Beta.16 removes PA0 from the shutdown interrupt enable set. The exact-profile
top/system button and KEY2 recovery remain the only wake inputs. Early boot
also samples the valid inputs and immediately re-enters shutdown if neither is
still asserted. Normal-operation `charging_status()` remains unchanged.

Physical acceptance requires multi-hour plugged and unplugged darkness on both
profiles, followed by explicit top-button wake, continuous KEY2-to-ISP, current
measurement, and ordinary BadgeMagic uploads.

All four pinned candidate builds passed source/toolchain, ELF/BIN identity,
startup/vector, symbol, button, RAM, and calculated-receipt audits:

- counter top/`260404`: 201,100 bytes,
  `c0e78296e75715fa2c29224a2d3d7629eb96ac8ddf7be194e84f80ae5af21ebc`;
- counter bottom/`250901`: 201,340 bytes,
  `77915d3a679179b104c050e403f2445d028d31743d333ea9f88c3197f133b985`;
- frogs top/`260404`: 201,188 bytes,
  `0d7790d1ba2d3ea602c02eecf0320c42846ef09d1b3ebe54772790c381b795af`;
- frogs bottom/`250901`: 201,428 bytes,
  `2438568595af188abc615a18ca7a2f833b504c45f0fd79cc9e51fe44248c3149`.
