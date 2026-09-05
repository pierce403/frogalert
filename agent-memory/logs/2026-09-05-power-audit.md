# Stable 0.3.0 power work

Owner reported general success on Rust firmware, authorized removing beta,
and reported spontaneous wake inherited from C. Exact electrical cause and
new-image current/recovery evidence remain uncaptured.

Source audit found missing PB22 interrupt remap: WCH ITModeCfg translates the
flag but leaves INT24 attached to floating LED PB8 without RB_PIN_INTX.
Implemented the mux correction, exclusive shutdown IRQ/wake ownership,
USB/ADC power-down, bounded release settling, Rust wake qualification,
non-power-on reset marker preservation, and 30-second marked-off reset when
radio shutdown cannot confirm idle. Static 500 ms credit and battery cards
replace the stored upstream default animation; custom splashes remain.

See docs/POWER_AUDIT.md for evidence, tests, and unmeasured opportunities.
The full-image hardware flag remains false. ABI advances to v3.2 for the
explicit reset-off action; hardware ownership remains C.

Local validation: full scripts/verify passed (35 core tests, 20 emulator
reliability tests, classifier golden, C ABI/upload/power fixtures on both
profiles, 164 Node tests, Python tests, and quarantine regression gates).
A 24-hour-per-profile/view soak passed: 17,280 scans and 362,886 frames.
Deleting the PB22 remap from the generated adapter makes its boundary test
fail, confirming the test catches the diagnosed defect. Release-card marker
tests now mask their lower row: a short stable version legitimately overlaps
the FOSSASIA columns above it. Exact release-asset checks run in cloud CI.

A sequential local rebuild hit a transient source cleanup 'Directory not
empty' error; rerunning that profile succeeded. Do not publish partial build
results. The Linux permission component was also verified byte-identical on
the deployed site after CI 33932573065 and publish run 33932854547 succeeded.
