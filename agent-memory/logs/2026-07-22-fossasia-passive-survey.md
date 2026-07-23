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
below removes that sole dependency and makes every radio phase visible. It has
not yet been physically tested.

The locked artifact is:

- profile: `B1144C_250901_USB_C`;
- path: `tmp/fossasia-usbc/build/survey/badgemagic-ch582.bin`;
- size: 199,788 bytes;
- SHA-256:
  `610aeb1ddb8aefdd3ab74d7e67c41b63033620fb3b2c17a625ad0f16434d4475`;
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
- Starts a circular status scroll at 100 ms per column. `I` means initializing,
  `R` ready/waiting, `S` scanning, `E` error, and `T` watchdog timeout. The
  suffix disappears only for a completed measurement.
- Deduplicates at most 64 six-byte advertiser addresses, updates the display
  live while scanning, and also consumes the controller's completion list in
  case individual report events were not delivered to this callback.
- Keeps the completed `BT 00` through `BT 64+` result visible between surveys.
  The diagnostic view intentionally masks the normal nametag between surveys,
  but yields while the app is streaming or the badge is outside normal mode.
- Parses live legacy and extended advertisement AD structures with strict
  bounds checks. Complete or shortened local names containing `Flipper`,
  case-insensitively, immediately show `FLIPPER DETECTED`; the message persists
  until the next survey begins. The completion-list fallback has addresses but
  no advertisement payload, so only live reports can produce a name alert.
- Mirrors Unagi's seeded `Flipper` name rule. It deliberately does not use a
  Flipper OUI: official firmware advertises `xFlipper <device-name>` and derives
  the public MAC from STM32 identifiers, which are not unique to Flipper.
- Stops FOSSASIA animation tasks only when taking display ownership. The prior
  100 ms scroll path called `stop_all_animation()` every step and therefore
  cleared the live framebuffer repeatedly, adding blank/partial-frame flicker.
  The roughly 45 Hz underlying FOSSASIA matrix refresh is unchanged.
- Explicitly zeroes the address table after success, start failure, timeout,
  and initialization; no address is printed, persisted, or transmitted.
- Schedules the next normal attempt about 57 seconds after completion. Busy or
  connected states retry later without disturbing the app.

This counts advertiser addresses heard in one short window. It does not count
people or prove physical-device identity. OUI classification remains future
work; the Flipper experiment uses only the advertised local name.

## Preserved shell and build evidence

The build retains and audits the FOSSASIA startup/vector sentinel, live Timer 0
and USB vector targets, USB HID+CDC symbols and descriptors, BLE/TMOS and
BadgeMagic service symbols, display path, and KEY2 application recovery
symbols. The Make-produced BIN is byte-identical to a fresh `objcopy` of the
audited ELF. The final disassembly contains no AMO/LR/SC instructions.

Static RAM ends at `0x20009204`; the WCH linker stack top is `0x2000b800`,
leaving 9,724 bytes. The build rejects less than 8,192 bytes of headroom.
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
BadgeMagic upload/streaming, count-scroll readability and updates, KEY1 and
short KEY2, KEY2-only dot-to-ISP recovery, repeated scan/advertising/app
reconnect behavior, current measurement, and known-good FOSSASIA reflash. The
normal saved nametag must be rechecked after returning to the baseline because
this diagnostic deliberately keeps the count visible. A 24-hour cadence test
is required before calling regular surveys stable.
