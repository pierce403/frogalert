# Android app advertising after a cross-profile flash

On 2026-07-29 the adaptive bottom-button candidate
`6c66fe90cc71da5a9fc5fa21ba61c4f0ca610ae354d1211a33645b836b8c9ea9`
was flashed to a bottom-button badge. The BadgeMagic Android app initially did
not connect, then began working after a delay.

This disproves a permanently broken GATT service but does not distinguish an
Android discovery delay from FrogAlert's advertising/scan transition. The
candidate still inherited FOSSASIA's default behavior of disabling advertising
at boot when `badge_cfg.ble_always_on` was false, making app access depend on
entering download mode with the correctly routed button.

An initial response explicitly enabled peripheral advertising in normal
nametag mode. It was rejected before physical testing after the user identified
the multi-badge-room failure: BadgeMagic app commit
`42c98bc8c7d24459c5145d1b2efdda26c8aaf27e` defaults to “any” and connects to
the first advertisement containing `FEE0`, without a chooser.

Current source instead keeps unattended normal-mode advertising off. Either
short button calls the existing survey-suspension path with advertising
restoration, opening a roughly ten-second app-attention window before surveys
retry and showing the same animated Bluetooth readiness cue. A view-button
window returns to the selected nametag/counter; the system-mode button retains
FOSSASIA's ordinary download-mode behavior. This makes discovery independent
of the profile-specific mode button without putting every FrogAlert badge into
the candidate pool. An established connection still suspends surveys until
disconnect. Rebuilds remain hardware-unverified until both exact profiles and
deliberate cross-profile flashes pass Android discover/connect/upload,
disconnect, cue/view restoration, survey-resume, multi-badge selection, and
KEY2-only ISP recovery checks.
