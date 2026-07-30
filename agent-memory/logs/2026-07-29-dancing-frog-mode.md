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
  - top `B1144C_260404`: 205,972 bytes,
    `115ac29613b099cc5d409bd3338f1a4f86befc82727989d4b00a053b9c838f50`
  - bottom `B1144C_250901`: 205,972 bytes,
    `495921986be061d0a0bb575b7943231281c61afd921544df3ced053fe4e57a38`
- These images are hardware-unverified and remain under ignored `tmp/`.
