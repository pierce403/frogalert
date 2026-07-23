# 2026-07-22 FOSSASIA-shell passive survey candidate

## Outcome

Built a private aggregate-count survey candidate for the photographed
`B1144C_250901` USB-C badge without reviving the failed standalone Rust
runtime. The image remains under ignored `tmp/`, is absent from the public
manifest, and is not flash-approved. The user reported that the preceding
five-second-overlay build continued showing the normal nametag and no count was
observed; there is no hash-bound flash transcript proving that exact image was
on the badge. The replacement below has not yet been physically tested.

The locked artifact is:

- profile: `B1144C_250901_USB_C`;
- path: `tmp/fossasia-usbc/build/survey/badgemagic-ch582.bin`;
- size: 199,076 bytes;
- SHA-256:
  `d9bb8465e5784c77e06304e555577ffedd56eb229dcc7de5ae9ac0ab5044e193`;
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
- Waits 15 seconds after role readiness, then attempts a passive three-second
  discovery window.
- Re-checks that BadgeMagic is disconnected and the display is in normal,
  non-streaming operation both before pausing advertising and before scanning.
- Remembers whether advertising was enabled and restores only that prior state
  on success, start failure, or timeout.
- Cancels discovery with a five-second watchdog rather than leaving the badge
  radio-silent if WCH never emits completion.
- Immediately starts a circular `BT 00` scroll at 100 ms per column before the
  first scan finishes. That initial value proves the display hook is running;
  it is not a completed radio measurement.
- Deduplicates at most 64 six-byte advertiser addresses and updates the
  persistent scroll to `BT 00` through `BT 64+` after each completed survey.
  The diagnostic view intentionally masks the normal nametag between surveys,
  but yields while the app is streaming or the badge is outside normal mode.
- Explicitly zeroes the address table after success, start failure, timeout,
  and initialization; no address is printed, persisted, or transmitted.
- Schedules the next normal attempt about 57 seconds after completion. Busy or
  connected states retry later without disturbing the app.

This counts advertiser addresses heard in one short window. It does not count
people, prove physical-device identity, or classify OUIs yet.

## Preserved shell and build evidence

The build retains and audits the FOSSASIA startup/vector sentinel, live Timer 0
and USB vector targets, USB HID+CDC symbols and descriptors, BLE/TMOS and
BadgeMagic service symbols, display path, and KEY2 application recovery
symbols. The Make-produced BIN is byte-identical to a fresh `objcopy` of the
audited ELF. The final disassembly contains no AMO/LR/SC instructions.

Static RAM ends at `0x200091a4`; the WCH linker stack top is `0x2000b800`,
leaving 9,820 bytes. The build rejects less than 8,192 bytes of headroom.
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
