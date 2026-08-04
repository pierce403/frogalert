# Automatic phone firmware publication

Date: 2026-08-03

## Decision

The project owner no longer flashes development releases from a laptop. Every
successful, audited standard counter build on canonical `main` CI must therefore
become available through the same-origin public `/flash/` flow as soon as the
post-CI publication checks finish. A separate physical-evidence approval commit
is no longer a release prerequisite.

This changes publication timing, not the meaning of hardware evidence. A newly
generated descriptor records:

- `hardware_verified: false`;
- `verification_basis: "ci-audited"`; and
- `flash_approved: true`.

The site must display that exact distinction before the irreversible action.
Only evidence bound to the precise BIN hash, firmware profile, and PCB marking
may later change `hardware_verified` to true.

## Automatic release boundary

The exception is deliberately narrow. It covers the atomic standard counter
pair for `B1144C_260404_USB_C` and `B1144C_250901_USB_C` only after the pinned
build, linked-image audits, quarantine check, candidate receipt, GitHub run and
artifact binding, archive digest, and provenance attestations all pass. The
post-CI workflow generates release descriptors and notes, validates the exact
BIN/ELF bundle, records metadata with a compare-and-swap update, reconciles the
immutable GitHub Release, and deploys the same BIN bytes to Pages.

Initial publication requires the exact attempt-bound Actions artifact and its
attestations. Because Actions artifacts expire, subsequent site rebuilds may
use the already-published GitHub Release only after validating the tag/source
ancestry, exact complete asset set, sizes, hashes, BIN startup sentinel, and ELF
header. Candidate integrity failures never trigger this fallback.

Raw candidate metadata remains non-publishable. Labs, the dancing-frog lane,
canaries, locally configured derivatives, and the third-party recovery image do
not inherit this exception. Their existing physical or explicit approval gates
remain in force. Quarantined hashes remain permanently refused.

Active firmware changes must strictly advance
`firmware/fossasia-usbc/version.json`; this prevents new bytes from colliding
with an immutable tag. A manual workflow dispatch may reconcile an already
complete published pair without rebuilding it, but must build and follow the
normal automatic publication path when the current version is absent.
An ordinary later `main` push also rebuilds an absent current pair, closing the
race where newer source arrives after a candidate build but before its
compare-and-swap metadata push; this catch-up does not require a false version
bump when firmware inputs did not change.

## Safety that did not change

The flasher still requires an exact top/bottom answer, CH582 `0x82/0x16`
identification, opened-board CH582M/11×44 confirmation, stable power, and
explicit acknowledgement that the read-protected OEM image cannot be restored.
A later 2026-08-03 owner decision moved those acknowledgements before ISP,
made immediate `0xA1`/`0xA7` info the first claimed-interface work, and made the
post-info Top/Bottom answer the separate final destructive action. See
`2026-08-03-prearmed-phone-flashing.md`. Availability is not a claim that the
display, buttons, radio, BadgeMagic upload, Android WebUSB path, or KEY2 recovery
has passed on that exact release.
