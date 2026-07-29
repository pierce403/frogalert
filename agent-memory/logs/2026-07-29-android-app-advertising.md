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

Current source explicitly enables peripheral advertising in normal nametag
mode for FrogAlert survey builds. Passive survey preparation may still disable
it for the three-second scan, and an established connection suspends surveys
until disconnect. Rebuilds remain hardware-unverified until both exact profiles
and deliberate cross-profile flashes pass Android discover/connect/upload,
disconnect, survey-resume, and KEY2-only ISP recovery checks.
