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
  - top `B1144C_260404`: 206,136 bytes,
    `573de8e08e22987d4862eb7774c1dc3645b91c76b245246fd22444364aa9790d`
  - bottom `B1144C_250901`: 206,136 bytes,
    `8dd21c8b7d7692179280278e0c21e448e3fba5c18a2735359db3eef4c8f82bef`
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
- The standard and frog-view survey lanes now use the same deterministic alert
  priority: BadgeMagic frogs, KARR, COP, Flipper, then custom. Only a strictly
  higher-priority result can replace an active overlay. The detection-triggered
  frog animation lasts three seconds as three one-second frames; this is
  independent of the continuous 500 ms frog-view mode.
