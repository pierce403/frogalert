# Historical application-aware flasher wizard

This records an earlier chooser-first interaction. The 2026-08-03
minimized-click flow supersedes its attempt ordering and permission sequence.

- Extended the single visible connection step to recognize the known
  BadgeMagic application USB signature `0416:5020` as normal nametag mode.
- The application descriptor is never opened or claimed. It is a mode hint,
  not proof of the installed firmware, PCB revision, CH582M marking, or display.
- The current guide tells the user to hold either Top or Bottom, with a
  2.2-second hold and single-dot cue, and remember which worked. A bottom-button
  success maps to the bottom-button image (`250901`); top maps to the
  top-button image (`260404`). Manifests and build tooling retain the exact PCB
  identifiers.
- If neither button produces the dot, the public wizard stops. It names C3 only
  as qualified bench recovery outside the browser flow.
- The same explicit chooser covers the application and WCH ISP ids. A
  never-authorized USB device remains invisible until the user grants
  permission; timers and attach events still never open a chooser.
- Firmware selection remains gated on WCH ISP descriptor validation plus the
  CH582 `0x82 / 0x16` Identify and Read Config exchange.
- The current flow leads with the button-hold instruction, but if first-time
  WebUSB permission is still needed, pair-ready enables one **Start watching
  for ISP** action that opens the WCH-only chooser before the physical hold.
  Previously authorized ISP devices remain automatic.
