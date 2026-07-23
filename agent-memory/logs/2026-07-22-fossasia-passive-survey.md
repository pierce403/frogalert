# 2026-07-22 FOSSASIA-shell passive survey candidate

## Outcome

Built a private aggregate-count survey candidate for the photographed
`B1144C_250901` USB-C badge without reviving the failed standalone Rust
runtime. The image remains under ignored `tmp/`, is absent from the public
manifest, and is not flash-approved. The user reported that the 199,076-byte
continuous-scroll build visibly displayed `BT 00` on the badge, proving its
injected display path ran, but no measured count was observed. There is no
hash-bound flash transcript proving that exact image was programmed. Review of
the startup order found a likely scheduling failure: FOSSASIA starts Peripheral
before the survey registers its Central callback, so the combined-role
initialization event can occur before the survey can observe it. The replacement
below removes that sole dependency, makes every radio phase visible in a
KEY2-selectable count view, and adds bounded temporary alerts while retaining
the normal nametag as the default view. The intervening 199,788-byte
Flipper-only candidate was superseded before physical testing. The current
candidate has not yet been physically tested. A later timing revision
superseded the 201,412-byte
`42a42f4a1aeedafeafc4e2d14c95c467f2eb4e3397f8712be555b1b99330e650`
build: it shortened every overlay to three seconds and moved survey starts from
roughly once a minute to roughly once every 20 seconds.

The locked artifact is:

- profile: `B1144C_250901_USB_C`;
- path: `tmp/fossasia-usbc/build/survey/badgemagic-ch582.bin`;
- size: 201,388 bytes;
- SHA-256:
  `2ea6880fa8dfdb332f539512290eea76e9bd7bf4bdeffb94baa5892357c382c8`;
- FOSSASIA shell source: `9ce885d682b5c56c3ac7595c09e009a210885221`;
- toolchain: pinned MRS V1.92;
- hardware status: unverified.

Build it without permitting downloads:

```sh
FROGALERT_FOSSASIA_OFFLINE=1 \
  ./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --check
```

## Survey behavior

- Initializes WCH Central beside the existing FOSSASIA Peripheral role using
  the pattern in WCH's pinned `CentPeri` example.
- Retains the FOSSASIA 6 KiB BLE heap, matching WCH's shared default used by
  that example; the path to WCH's pinned heap configuration is recorded in the
  upstream lock.
- Never calls a central establish-link operation.
- Treats a successful Central start as readiness instead of relying only on a
  possibly missed `GAP_DEVICE_INIT_DONE_EVENT` callback.
- Waits 15 seconds after role readiness, then attempts a passive three-second
  discovery window.
- Re-checks that BadgeMagic is disconnected and the display is in normal,
  non-streaming operation both before pausing advertising and before scanning.
- Remembers whether advertising was enabled and restores only that prior state
  on success, start failure, or timeout.
- Cancels discovery with a five-second watchdog rather than leaving the badge
  radio-silent if WCH never emits completion.
- Treats WCH cancellation as asynchronous: it keeps the scan active until the
  discovery-complete event (or `bleIncorrectMode`) confirms idle, and makes
  streaming, peripheral connection, and download-mode transitions request the
  same cancellation before advertising can resume.
- Clears a streaming session on current-link termination so a phone that drops
  before sending the normal stream-exit command cannot suppress every future
  survey until power cycle.
- Starts a circular status scroll at 100 ms per column. `I` means initializing,
  `R` ready/waiting, `S` scanning, `E` error, and `T` watchdog timeout. The
  suffix disappears only for a completed measurement.
- Deduplicates at most 64 six-byte advertiser addresses, updates the display
  live while scanning, and also consumes the controller's completion list in
  case individual report events were not delivered to this callback.
- Keeps the completed `BT 00` through `BT 64+` result available as a virtual
  display view. Short KEY2 rotates
  `Name 1 → BT counter → Name 2 → BT counter`; KEY1 system/brightness behavior
  and the separate long-KEY2 ISP poll remain inherited. Scanning continues in
  either selected view.
- Parses live legacy and extended advertisement AD structures with strict
  bounds checks. The C mirror implements both README public-address OUIs and
  all documented name strings; it applies OUIs only to controller-reported
  public addresses. `COP DETECTED` and `FLIPPER DETECTED` overlay either visible
  view for three seconds, then the selected name/count view is restored. The
  completion-list fallback has addresses but no advertisement payload, so only
  live reports can produce a name alert.
- Mirrors Unagi's seeded `Flipper` name rule. It deliberately does not use a
  Flipper OUI: official firmware advertises `xFlipper <device-name>` and derives
  the public MAC from STM32 identifiers, which are not unique to Flipper.
- Treats an exact case-insensitive `LED Badge Magic` local name or advertised
  `0xFEE0` service as a friendly-badge hint and shows three frogs in two
  alternating frames for three seconds. Passive discovery may not receive a name
  carried only in scan response, so the service fallback may false-positive
  another compatible device that advertises the same UUID.
- Stops FOSSASIA animation tasks only when taking display ownership. The prior
  100 ms scroll path called `stop_all_animation()` every step and therefore
  cleared the live framebuffer repeatedly, adding blank/partial-frame flicker.
  The replacement releases ownership after an overlay and resumes the selected
  uploaded name or counter. The roughly 45 Hz underlying FOSSASIA matrix
  refresh is unchanged.
- Explicitly zeroes the address table after success, start failure, timeout,
  and initialization; no address is printed, persisted, or transmitted.
- Schedules the next normal attempt about 17 seconds after completion, making
  scan starts roughly 20 seconds apart. Repeated reports cannot restart the
  same alert inside one scan, while a continuously present match can retrigger
  in the next window. Busy or connected states retry later without disturbing
  the app.

This counts advertiser addresses heard in one short window. It does not count
people or prove physical-device identity. Every detector remains a spoofable
hint, and the broad `0xFEE0` frog fallback is intentionally playful rather than
an identity assertion. The full embedded rule set is still a bounded C mirror;
moving the same policy behind the Rust ABI remains separately gated.

## Preserved shell and build evidence

The build retains and audits the FOSSASIA startup/vector sentinel, live Timer 0
and USB vector targets, USB HID+CDC symbols and descriptors, BLE/TMOS and
BadgeMagic service symbols, display path, and KEY2 application recovery
symbols. The Make-produced BIN is byte-identical to a fresh `objcopy` of the
audited ELF. The final disassembly contains no AMO/LR/SC instructions.

The audited section sizes are 192,896 bytes of text, 8,492 bytes of data, and
4,588 bytes of BSS. Static RAM ends at `0x200091c4`; the WCH linker stack top
is `0x2000b800`, leaving 9,788 bytes. The build rejects less than 8,192 bytes of
headroom.
The build wrapper deletes BIN outputs on any failed preparation, compile, or
post-link gate so a stale or partially audited image is not mistaken for a
candidate.

The upstream checkout uses CRLF. A traditional context patch failed even
though the semantic hook points were correct, so the build now uses a small
deterministic source transformer. Each exact include/init/display hook must
appear once; source drift fails closed.

## Physical gate

This is build evidence only. The lowest-risk first derived smoke remains the
metadata-only canary. Before the survey candidate is published, it must pass
captured CLI program/verify, cold boot and power cycles, normal nametag display,
BadgeMagic upload/streaming, count-scroll readability and updates, the complete
short-KEY2 name/count rotation, unchanged KEY1 behavior, every three-second
text-overlay restoration, the three-second frog animation, KEY2-only dot-to-ISP
recovery, repeated scan/advertising/app reconnect behavior, current
measurement, and known-good FOSSASIA reflash. A 24-hour cadence test is required
before calling regular surveys stable.
