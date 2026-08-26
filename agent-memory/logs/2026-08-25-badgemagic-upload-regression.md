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

Beta.13 removes that entire unverified runtime delta and restores beta.11's
application screen-off behavior. Screen off disables advertising and passive
discovery, stops TMR0 and matrix drive, and retains TMR3, TMOS, USB, and the
unchanged 200 ms KEY2 ISP task. Focused tests now reject hardware-shutdown,
early-wake, and dedicated survey-shutdown symbols in the survey lane.

This isolates the regression to the beta.12 feature boundary without claiming
which CH582 subsystem caused the observed Android failure. The exact beta.13
top and bottom images remain hardware-unverified until the reporting board
successfully completes discovery, connection, a full name upload, display
reload, disconnect, and a second upload across a survey window.

All four local final-version candidates passed the pinned build and structural
audits:

- counter top: 200,344 bytes,
  `c60bebfac24a3102567b69fe9212da4866065fa4d70804b18e0a4ef4a6137b9e`;
- counter bottom: 200,376 bytes,
  `71865ea7dd438e1d88cf2bcdfc00c84872cca590845c142f3a5369e56fceaa01`;
- frogs top: 200,416 bytes,
  `5af09831305d784970649e013d2b8bcd049a0fa3d6c934ecdb9b9f6f4428949e`;
- frogs bottom: 200,448 bytes,
  `5f35682b18160ad79ad9fdab13ca8335c4ccea0b0a0b8a9e713eabb1622a5ed3`.

The counter sizes exactly match beta.11's corresponding images. The hashes
differ because the embedded semantic and compact versions advanced to beta.13.
