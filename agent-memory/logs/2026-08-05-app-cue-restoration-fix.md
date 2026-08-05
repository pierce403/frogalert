# BadgeMagic cue restoration fix

`0.2.0-beta.4` removes peripheral connection state from visible readiness-cue
expiry. A short button still opens the ten-second BadgeMagic radio window, but
the Bluetooth animation now yields to the selected name/counter/frog view after
one second even when a client connected during that interval. The existing
display restoration guard continues to leave active bitmap streaming alone.

The ten-second window fallback also restores any still-active cue outside the
advertising-disable condition. Focused tests extract the two TMOS event blocks,
require display restoration outside the connection guard, and reject any
`peripheral_is_connected()` dependency in the one-second cue handler.

The change preserves the pinned FOSSASIA shell and requires new top and bottom
candidate hashes. Compilation, publication, and site delivery are build
evidence only until the former fast-connection timing is reproduced on the top
badge and both profiles pass BadgeMagic upload, disconnect, selected-view
restoration, survey resumption, and KEY2 recovery checks.

Local `--candidate` builds passed the runtime, vector, USB/BLE/display/KEY2,
ELF/BIN identity, RAM, profile, and calculated-receipt gates:

- counter top/`260404`: 200,876 bytes,
  `b65e3aeb54fb23dcd4275cedda5bbdb7d4cf85cb9ae7a017bad66f3612d3df21`
- counter bottom/`250901`: 200,876 bytes,
  `ca1b08f7aed961fa88cf36769f54fb16532367e42fa4691ef2f3f19bce11de21`
- frogs top/`260404`: 200,960 bytes,
  `9aa3741270907812fc5724013506ce05782564b5b8c0fea7cde1e9b824a9f8c1`
- frogs bottom/`250901`: 200,960 bytes,
  `da1859800f08a377ad022ccaf76e2738f2b0ed6fa5f9d058e0ef75f8af1715fc`

These local hashes are calculated build receipts, not canonical cloud
provenance or physical verification.
