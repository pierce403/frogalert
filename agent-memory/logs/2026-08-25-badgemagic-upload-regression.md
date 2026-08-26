# Beta.12 BadgeMagic upload regression

## Physical report and regression boundary

On 2026-08-25 the owner reported that the BadgeMagic Android app could upload a
new name to the immediately preceding beta.11 release but could not do so on
beta.12. This is direct A/B hardware evidence for a release regression, but no
GATT transcript or UART trace was captured.

Source comparison showed that beta.12 did not change the inherited `0xFEE0`
service, writable `0xFEE1` characteristic, legacy `wang\0\0` parser, or upload
completion path. Its only firmware runtime delta was the hardware-shutdown
integration: asynchronous radio shutdown state, TMR3 stop, strong GPIO wake
handlers, reset-keep classification, and the pre-peripheral KEY2 qualifier.

## Fix boundary

Beta.14 removes that entire unverified runtime delta and restores beta.11's
application screen-off behavior. Screen off disables advertising and passive
discovery, stops TMR0 and matrix drive, and retains TMR3, TMOS, USB, and the
unchanged 200 ms KEY2 ISP task. Focused tests now reject hardware-shutdown,
early-wake, and dedicated survey-shutdown symbols in the survey lane.

This isolates the regression to the beta.12 feature boundary without claiming
which CH582 subsystem caused the observed Android failure. The exact beta.14
top and bottom images remain hardware-unverified until the reporting board
successfully completes discovery, connection, a full name upload, display
reload, disconnect, and a second upload across a survey window.

The first beta.13 local candidates passed the pinned build and structural
audits, and their counter sizes exactly matched beta.11. That source commit's
CI failed before candidate building on the unrelated Rust 1.98 lint below, so
the immutable version policy advances the completed fix to beta.14. Record new
final-version receipts before publication.

All four beta.14 candidates passed the pinned build and structural audits:

- counter top: 200,344 bytes,
  `c46504ff4cdebdeaadb067b3248bf4c354426666de24566b4a641062c718696f`;
- counter bottom: 200,376 bytes,
  `e4ff5103de8c3823e0e992f010cf14f387e5b66babd14076f6c0a1c48a4cfcda`;
- frogs top: 200,416 bytes,
  `7ec823232c94fa8f3e65ba7f5614a332df7c0e5f572312905d9dde52c9ce4f2c`;
- frogs bottom: 200,448 bytes,
  `869ca9990a7622deca75c2da83ad9a11cdc1821311de01ef76cd068dec5acb65`.

The first main CI run, `32919991068`, stopped before candidate building because
Rust 1.98 introduced a denied `chunks_exact_to_as_chunks` Clippy lint in the
unchanged advertisement parser. Replace the constant two-byte iterator with
`as_chunks::<2>().0.iter()`; this is an incidental toolchain-compatibility fix,
not part of the firmware regression boundary.
