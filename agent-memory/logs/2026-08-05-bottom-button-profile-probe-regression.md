# Bottom-button profile-probe regression

The user tested the published `0.2.0-beta.4` pair. The top image's expected
counter button worked, but the bottom image's bottom/near-USB press entered the
persistent BadgeMagic name-update/download mode instead of selecting the
Bluetooth counter.

Source inspection isolated the only route from bottom-profile KEY2 to
`change_mode()`: the experimental held-KEY1 PA1 probe had classified the board
as `260404` and swapped the short-button roles. The probe assumed an open PA1
would settle to `low/high` under successive weak pulls after 2 microseconds.
The physical result disproves that as a safe runtime hardware decision.

`0.2.0-beta.5` removes runtime profile reclassification. The survey and frog
lanes retain the compiled exact profile for KEY1 polarity, short-button roles,
and shutdown wake. `260404` keeps KEY1 as the view selector; `250901` keeps
KEY2 as the view selector. Long-KEY2 ISP remains in the inherited FOSSASIA
shell. Exact PCB marking and matching artifact selection are mandatory; an
accidental cross-profile flash is no longer corrected at runtime.

This is a source-level correction until both new exact hashes are rebuilt and
the bottom image confirms counter selection, system/download behavior,
brightness, power/wake, BadgeMagic upload, and KEY2-only ISP recovery.

Local `--candidate` builds passed the runtime, vector, USB/BLE/display/KEY2,
ELF/BIN identity, RAM, profile, and calculated-receipt gates:

- counter top/`260404`: 200,576 bytes,
  `005525cdb9cb7259cb53f7a25881c033b06717736cb6a452bfef17eda6f62a45`
- counter bottom/`250901`: 200,576 bytes,
  `5c465e598b62151b54ab16c73744a5907704314427a8bc545926d132518f4cce`
- frogs top/`260404`: 200,660 bytes,
  `92bd6ea0e95528c344369adf758181e44b33bdbe2476b9321e29090118c93989`
- frogs bottom/`250901`: 200,660 bytes,
  `c6b0a00873e752327a7493990fe1fecb579a52c427aeecc88291c2b1e54f0e4d`

These are local build receipts, not canonical cloud provenance or physical
verification.
