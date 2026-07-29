# Application-aware flasher wizard

- Extended the single visible connection step to recognize the known
  BadgeMagic application USB signature `0416:5020` as normal nametag mode.
- The application descriptor is never opened or claimed. It is a mode hint,
  not proof of the installed firmware, PCB revision, CH582M marking, or display.
- Normal mode tries the nearest-USB button first and the farthest button
  second, with a 2.2-second hold and single-dot cue. A reported nearest-button
  success suggests `250901`; farthest suggests `260404`. The wizard carries
  that hint forward but still requires the exact printed marking and never
  selects an image automatically.
- If neither button produces the dot, the public wizard stops. It names C3 only
  as qualified bench recovery outside the browser flow.
- The same explicit chooser covers the application and WCH ISP ids. A
  never-authorized USB device remains invisible until the user grants
  permission; timers and attach events still never open a chooser.
- Firmware selection remains gated on WCH ISP descriptor validation plus the
  CH582 `0x82 / 0x16` Identify and Read Config exchange.
