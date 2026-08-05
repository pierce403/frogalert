# BadgeMagic cue restoration race

The user physically observed `0.2.0-beta.3` top firmware intermittently remain
on the Bluetooth readiness animation after the bottom button selected the
counter view.

The button path first selects the counter, then opens the ten-second BadgeMagic
advertising window and starts a one-second visible cue. At the cue timeout,
`frogalert-survey.c` restores the selected view only when
`peripheral_is_connected()` is false. If a phone connects during that second,
the timeout is consumed while `app_cue_active` remains true; restoration is
deferred until the disconnect callback. The same branch is possible when the
GAP state query fails because `peripheral_is_connected()` deliberately returns
true on error. At the ten-second window timeout, a still-connected peripheral
again suppresses restoration and the flag is cleared, so the Bluetooth
animation can remain visible for the connection lifetime.

Focused source tests pass, but they use structural regular expressions and do
not model the connected-at-cue-time transition. A controlled reproduction
should compare presses with all BadgeMagic clients stopped against a client
that connects within the first second. No firmware behavior was changed during
this diagnosis.
