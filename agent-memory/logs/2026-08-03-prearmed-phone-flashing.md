# Minimized-click post-info phone flashing

The owner changed the public phone-flasher interaction to minimize clicks while
making the most of the CH582 ROM ISP's short no-command window. The flasher
must automatically download and fully validate the newest atomic top/bottom
release pair. It shows both images' provenance, hardware-unverified status, and
concise target/risk disclosure, but preparation and ISP entry are not gated by
checkboxes, a typed phrase, or a review step. Connection must never select a
profile or write flash.

The first instruction tells the user, with the display upright, to hold either
**Top** or **Bottom** until the badge enters flashing mode and to remember which
button worked. For first-time browser permission, pair-ready enables one
**Start watching for ISP** tap that opens the WCH-only chooser before the
physical hold; the user leaves it open, performs the hold, and selects WCH.
Previously authorized devices should auto-detect the attach.

When an authorized `4348:55e0` or `1a86:55e0` device becomes available, the
page must claim interface 0 and immediately send `0xA1` Identify followed by
`0xA7` Read Config. The existing encoders already implement the useful
read-only portion of `wchisp info`. No manifest fetch or profile question may
consume time between interface claim and those transfers. A first-time device
still requires the user's explicit WebUSB chooser action; an attach event may
run info only when Chrome already grants access, and may never send a
destructive command.

After info proves CH582 `0x82/0x16`, the page asks which physical button, with
the display upright, produced flashing mode. **Top button** maps to
`B1144C_260404_USB_C` / `B1144C_260404`; **Bottom button** maps to
`B1144C_250901_USB_C` / `B1144C_250901`. No guide state preselects an answer. A
badge already in ISP can proceed
only if the user can answer reliably; neither/unsure stops read-only.

The Top/Bottom answer is the sole in-page consent and final destructive
activation. Its handler must atomically promote only the matching prevalidated
bytes, disable both
choices against double taps, acquire the existing cross-tab/session locks,
revalidate the captured device/info/artifact binding, and immediately
run config reset, erase, program, and byte verification. There is no later
Continue button or browser confirmation, and there is no earlier
acknowledgement gate. Disconnects, stale artifacts, failed
info, missing pair members, lock denial, or ambiguous answers fail before
`0xA8`.

Physical follow-up still needs an Android Chrome/OTG run covering authorized
attach, first-time chooser hot-plug, the info-held pause, both button answers,
double-tap suppression, disconnect before and during write, and successful
program/verify/reset. This policy does not make the browser path
hardware-verified.
