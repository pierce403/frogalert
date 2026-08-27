# Low-power restoration and BadgeMagic transfer hardening

## Corrected physical interpretation

The owner clarified that `0.2.0-beta.12` worked normally and that its earlier
Android upload failure was most likely observed in a Bluetooth-noisy place.
The beta.14 rollback therefore does not establish a hardware-shutdown-caused
regression. Current source restores beta.12's radio-idle hardware shutdown and
profile-specific early wake/KEY2 recovery design.

## Upstream review

Pinned FOSSASIA commit `9ce885d` and current upstream `22685d4` retain the same
legacy 16-byte `FEE1` receiver. The current Flutter Android app at
`4ac9abd` uses write-with-response, a 120 ms inter-chunk delay, three retries,
and a 300 ms initial delay. Upstream PR 188 addresses advertising state after a
successful upload, not transfer corruption. FrogAlert already returns to
normal mode and keeps unattended advertising off after upload.

The review found two concrete inherited weaknesses. The normal accepted BLE
connection never received the intended parameter-update request because it was
inside the rejected-extra-connection branch. The receiver also reallocated to
the exact declared payload length even though the app pads every final packet
to 16 bytes, allowing the final `memcpy` to write past the allocation.

## Current hardening

The FrogAlert overlay moves the parameter request to the accepted connection,
uses the existing 25–125 ms interval range with a six-second supervision
timeout, reserves the complete padded final packet, uses 32-bit length
arithmetic, bounds content below the persistent config block, preserves the
old buffer when `realloc` fails, checks Data-Flash status, rejects nonzero ATT
offsets, clears incomplete state on disconnect, and removes per-byte transfer
logging. The wire format and Android pacing contract are unchanged.

These changes are build evidence only until a physical badge passes repeated
uploads in both quiet and congested environments, an interrupted upload
followed by retry, screen-off current, exact-profile wake, and KEY2 ISP.

All four pinned candidate builds passed source, toolchain, ELF/BIN identity,
startup/vector, symbol, button, RAM, and calculated-receipt audits:

- counter top/`260404`: 201,224 bytes,
  `53b094f73cc2fba2027c7f8247704e608a4f699ede30d1b1416132634d1048d4`;
- counter bottom/`250901`: 201,308 bytes,
  `5c4cd3613569fa7fb667dd152da86e5d9cd3990accd7d228efa431af7a0f6254`;
- frogs top/`260404`: 201,312 bytes,
  `d2e6a51bcafc1d2e7fae2abeebb6e1226c5e3fb1bd60dcab56689459a65afc74`;
- frogs bottom/`250901`: 201,396 bytes,
  `54af790b0eefb903d33e501d4189518ab1affea5351437781b9dc80f85a40293`.
