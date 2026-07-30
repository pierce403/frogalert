# 2026-07-29 dancing-frog firmware lane

- Added a separate `frogs` build lane; the existing counter `survey` hashes are
  unchanged.
- The alternate view uses the existing double-buffered three-frog renderer and
  toggles its two poses every 500 ms.
- Detection alerts and the temporary BadgeMagic app cue stop or preempt the
  frog frame event. The selected frog view resumes through the normal display
  ownership transition.
- Both exact profiles retain passive surveys, alerts, adaptive button routing,
  BadgeMagic compatibility, and the inherited long-KEY2 ISP path.
- Locked build evidence:
  - top `B1144C_260404`: 206,076 bytes,
    `61989dbf9daeb42ee1c60d169478b1164f28fca60cb50e65e9a524c1ce08c2fc`
  - bottom `B1144C_250901`: 206,076 bytes,
    `506c26e9e581722616b1ff1651c78dfe0bc75592ad519ab2db2b9c4732cc9249`
- These images are hardware-unverified and remain under ignored `tmp/`.
- First CI exposed an eight-byte counter-image drift because the frog event
  test remained compiled with an empty body when the variant macro was off.
  Guarding the entire branch restored both pre-existing survey hashes while
  retaining both frog hashes.
- Physical testing of the first frog build found no visible frogs during mode
  exploration. The view was selected correctly, but every short press covered
  it with—and restarted—the ten-second Bluetooth readiness animation. The
  corrected lane ends the visible cue after one second while retaining the
  ten-second advertising window.
