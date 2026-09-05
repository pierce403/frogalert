# Browser connection and flashing

FrogAlert uses two browser hardware APIs for two different jobs. Calling both
of them “Web Bluetooth flashing” would be technically wrong.

The dedicated guided surface is <https://frogalert.org/flash/>. The landing
page retains read-only badge and artifact inspection, but its destructive
controls have been removed. Every flashing and recovery write belongs on
`/flash/`.

`/flash/` is a one-screen-at-a-time wizard optimized around the ROM's short
no-command entry window. Before asking the user to enter ISP, it downloads and
validates both members of the newest atomic top/bottom release pair. The page
shows each image's profile, size, SHA-256, build provenance, and hardware-test
status plus a concise target/risk disclosure. Downloading, validation, and ISP
entry are not gated by checkboxes, a typed phrase, or a separate review step.
The Top/Bottom choice made only after read-only info is the sole in-page consent;
connection alone never writes anything.

The connection step checks previously authorized devices for either the known
BadgeMagic application signature `0416:5020` or the WCH ISP ids. Seeing
`0416:5020` keeps the wizard on the connection step and offers the routine
button/dot guide with the display upright; the page does not open or claim the
application's HID/CDC interfaces. The first screen leads with the instruction to
hold either **Top** or **Bottom**, remember which one worked, and release when
the dot appears. For first-time permission, pair-ready enables one **Start
watching for ISP** tap that opens the WCH-only chooser before the physical hold;
the user leaves it open, performs the hold, and selects the WCH device promptly.
Remembered permission can auto-detect the attach. The entry guide does not
preselect a hardware profile.

As soon as a WCH ISP device is available, the page opens and claims interface
0, validates the bulk endpoints, and immediately sends `0xA1` Identify followed
by `0xA7` Read Config. No manifest fetch or profile question runs first. That
read-only exchange is the browser equivalent of the useful portion of `wchisp
info`: it proves CH582 `0x82 / 0x16`, validates the UID/configuration response,
and buys the active-session time needed for the larger flash. A first-time
badge still requires one explicit chooser tap because WebUSB does not expose
unapproved devices. After successful info, FrogAlert stores only a coarse
“WCH ISP was authorized” hint; Chrome owns the real permission. On later visits
`navigator.usb.getDevices()` and authorized USB attach events may run this
read-only info exchange automatically. They never request new permission or
send a destructive command. No USB serial or device identifier is stored.

Only after info succeeds does the wizard ask, “Which button got this badge into
flashing mode?” With the display upright, **Top button** binds the already
validated `B1144C_260404` image and **Bottom button** binds the already
validated `B1144C_250901` image. That clearly labeled answer is the separate
final destructive action and sole in-page consent: after atomically rechecking
artifact, profile, and captured-device state, it immediately begins
configuration reset,
programming, and byte verification. There is no later Continue button or
browser confirmation. If the user is unsure, neither button worked, either
image is unavailable, or any binding changed, the wizard stops without a
developer-BIN fallback. Unrelated diagnostics and Bluetooth controls remain
outside the visible flasher.

| Job | Browser API | Device state |
| --- | --- | --- |
| Verify/configure normal nametag behavior | Web Bluetooth | Badge firmware running and advertising `FEE0` |
| Replace MCU firmware | WebUSB | WCH factory ISP bootloader running |

## Supported browser target

Use current Chrome or Chromium Edge on desktop over HTTPS (or localhost during
development). Firefox and Safari/iOS do not expose WebUSB. Current Chrome on an
Android phone can expose WebUSB when the phone supports USB host mode and the
badge is connected through a data-capable USB OTG adapter. Android adds its own
USB permission prompt after the browser chooser. That phone path is implemented
in the responsive UI but remains hardware-unverified.

Web Bluetooth availability does not make an unsupported phone capable of
firmware replacement; it can only inspect the running application protocol.
The public compatibility data and platform notes are tracked in
[MDN browser-compat-data](https://github.com/mdn/browser-compat-data/blob/c148dfd9271343add2b6995c60c3580fd79fa92a/api/USB.json),
[Chrome's WebUSB guidance](https://developer.chrome.com/docs/capabilities/build-for-webusb#platform-specific-considerations),
and [Android's USB host documentation](https://developer.android.com/develop/connectivity/usb).

Browser API support alone is not sufficient:

- Linux may require a udev rule permitting `4348:55e0` and `1a86:55e0`.
  If opening the bootloader fails with access denied, the flasher detects desktop
  Linux and presents the scoped `70-frogalert.rules` command with a copy button.
  It grants the active desktop session access using `TAG+="uaccess"`, reloads
  the rules, and asks for a bootloader reconnect. Browser permission alone does
  not grant OS access. Android, ChromeOS, macOS, Windows, and unknown platforms
  do not receive Linux commands; Android guidance explains its extra USB prompt.
- Windows may require the ISP interface to use WinUSB; the WCH vendor driver can
  prevent the browser from claiming it.
- macOS should not need a vendor driver, but still needs a physical test.

The CLI fallback is `wchisp` and remains part of every release plan.

## Enter the bootloader

The physically confirmed USB-C reference is an 11×44 board marked
`B1144C_250901` with a WCH `CH582M`. It has a soldered pouch battery and no
user-removable battery connector. Leave the cell and its leads alone.

For that board running the tested FOSSASIA USB-C application—or a compatible
FrogAlert release that preserves the inherited KEY2 hook—the routine path is:

1. Keep a stable data-capable USB connection and the display upright.
2. Wait for both images to finish validating. If Chrome needs first-time
   permission, tap **Start watching for ISP** and leave the WCH-only chooser
   open. A remembered permission needs no chooser tap.
3. Hold either **Top** or **Bottom** for about 2.2 seconds and remember which
   one worked. Top is the `B1144C_260404` path (KEY2 farther from USB); Bottom
   is the `B1144C_250901` path (KEY2 nearest USB).
4. Release when one dot lights near the middle of the panel. If the chooser is
   open, promptly select only `4348:55e0` or `1a86:55e0`.

No RESET or multi-button combination is needed. This is application-provided
entry into the CH582 mask-ROM ISP, not a bundled replacement bootloader. Four
captured sessions showed the ISP USB identity for about 9–13 seconds before the
application returned, so the chooser must be opened promptly.

Original, unknown, blank, or broken application firmware cannot be assumed to
provide that KEY2 hook. On the photographed `B1144C_250901` board, holding its
KEY2—the button nearest USB—while pressing the populated RESET switch did not
enter ISP. Its documented first entry required a qualified operator to hold
KEY2 while momentarily bridging both ends of PCB capacitor `C3`. Nyx documents
the same C3 operation for `B1144C_260404`, but identifies KEY2 as the button
farther from USB. FrogAlert has photographed that revision and observed that
bridging C3 while holding the nearer, wrong button only reset the OEM
`0416:5020` application. Holding the farther-from-USB KEY2 while bridging C3
subsequently enumerated `4348:55e0` twice on 2026-07-28, and the board later
booted FOSSASIA's `LED Badge Magic` application. No captured `wchisp`
program/verify transcript binds the exact flashed bytes.
That hazardous rail-collapse maneuver is expert-only, is not a battery
operation, and is deliberately not implemented as a public website checklist.
An ordinary user should stop at this boundary.

`/flash/` therefore keeps a routine compatible-firmware guide whose first screen
leads with the Top/Bottom hold instruction. If Chrome still needs permission,
pair-ready enables one **Start watching for ISP** action that opens the WCH-only
chooser before the user holds a button, releases at the single dot, and selects
WCH promptly. Remembered permission can auto-detect the attach. The user reports
which button worked only after the read-only ISP info exchange. A timer
or USB attach event never opens a chooser or turns a connection into a write.
Only that explicit connection action may call `navigator.usb.requestDevice()`.
When Chrome already grants access, an attach event may claim the WCH interface
and immediately send only
`0xA1` Identify plus `0xA7` Read Config so the ISP session does not expire while
waiting for the final Top/Bottom answer.

Pinned FOSSASIA USB-C source `9ce885d` polls KEY2/PB22 every 200 ms and, after
more than ten consecutive held samples (about 2.2 seconds), executes a transfer
to address zero while KEY2 remains low. It does not install a second bootloader;
the flashable USB ISP remains the CH582 mask-ROM implementation. FrogAlert must
label long-press entry as an application-provided convenience, not as evidence
about unknown OEM firmware or an unverified FrogAlert build. Original or
unknown firmware on the confirmed board reaches the expert-recovery stop
condition described above.

This behavior is physically confirmed on the photographed USB-C
`B1144C_250901` badge running the pinned FOSSASIA development image, which
self-reports `BM1144-C fw: v0.1`: a KEY2-only long press displayed one dot near
the middle and entered ISP without RESET or C3. That evidence does not transfer
automatically to a future FrogAlert image; each FrogAlert artifact must pass the
same recovery test before its descriptor may say `hardware_verified: true`. The
public flasher explicitly warns when a CI-audited release has not yet passed
that physical smoke.

## What the browser can identify

Before ISP entry, `/flash/` validates both published profile artifacts. After
the user explicitly selects—or Chrome exposes a previously authorized—
bootloader, it can validate:

- WCH USB vendor/product descriptors without displaying or logging a serial;
- configuration 1, interface 0, and bulk endpoint 2 in both directions;
- chip id `0x82` and family/type `0x16` from the Identify response;
- the bootloader version, UID checksum, and a conservative configuration
  summary from the read-only configuration response; and
- the preloaded top and bottom artifacts' local lengths, padding/erase plans,
  SHA-256 values, provenance, declared profiles, and hardware-evidence status.

The USB bootloader cannot identify the exact installed application firmware,
PCB revision, matrix wiring, physical MCU package marking, LSE population,
display health, or button health. A running BadgeMagic-compatible application
may optionally self-report Device Information firmware/manufacturer/model text
over Bluetooth; the page labels that untrusted, optional metadata rather than
treating it as proof of flash contents. Physical board and 11×44 confirmation
remain separate human inputs.

The known application USB id `0416:5020` is similarly only a mode hint. Both
OEM and open FOSSASIA-derived firmware have used that id, and other devices can
reuse it. Its detection means “a known BadgeMagic application-shaped USB
device is connected,” not that the browser proved the firmware, PCB revision,
MCU marking, or display geometry. The wizard advances only after the separate
ROM ISP identity exchange succeeds.

Every standard FrogAlert image must preserve FOSSASIA's deliberate KEY2
recovery affordance before CI publication; source, symbol, and linked-image
audits guard the upstream TMOS polling/task, display cue, and address-zero
transfer rather than reconstructing the hook in a new runtime. Physical
acceptance is still required before marking the image hardware-verified: a
short press must retain its normal
application action and a roughly 2.2-second hold to re-enumerate as
`4348:55e0`, followed by successful program and byte verification. A broken or
blank application cannot provide this convenience; on the confirmed USB-C
board that reaches the expert-only recovery stop condition rather than a
routine browser checklist.

The withdrawn Rust pixel-walk image contained a recovery function but never
reached it because its first Timer 0 interrupt entered the default handler.
Symbol presence is no longer accepted as recovery evidence.

## Hardware-profile selection

The public wizard maps its observed entry button to one exact USB-C profile:

- `B1144C_260404_USB_C` — printed `B1144C_260404`, Nyx KEY1
  pull-up/active-low/falling-wake profile and firmware build default;
- `B1144C_250901_USB_C` — printed `B1144C_250901`, legacy KEY1
  pull-down/active-high/rising-wake profile; and
- `HARDWARE_REV1` — the separate Micro-USB recovery-only path.

The two USB-C boards use the same LED matrix and KEY2/PB22 electrical mapping,
but their physical KEY2 positions differ: farther from USB on `260404`, nearest
USB on `250901`. Their KEY1 switch is open while untouched, so there is no
reliable read-only boot probe:
PA1 simply follows the internal pull selected by firmware. The browser cannot
infer the profile from CH582 identity, USB descriptors, case color, generic
`BM1144-C` text, or an untouched button. After read-only ISP info succeeds, it
asks the user which physical
button actually produced flashing mode. The explicit answer, not an inferred
guide state, binds the profile. A badge that is already in ISP may proceed only
when the user can still answer that question reliably; **Neither / not sure**
closes the read-only session without writing and directs the user to repeat the
entry.

Every configurable survey BIN embeds its compiled profile id. Before ISP entry,
the page rejects either member of the atomic pair if that id mismatches its
declared top/bottom profile. At the final answer it promotes only the matching
prevalidated bytes and rechecks the binding before the first `0xA8` write.
`/flash/` contains no file input, including in hidden or legacy markup.
Read-only local artifact inspection remains on the project landing page and
cannot provide a fallback when a published release is missing.

## Local monitoring customization

After a compatible local FrogAlert survey BIN is loaded, `/flash/` exposes five
built-in target groups:

- Axon/TASER/Flock indicators;
- Flipper names and the official serial-profile services `0x3081`–`0x3083`;
- KARR `QT ` names;
- Ray-Ban names and the same-report Meta `0x01AB` + `0xFD5F` pair; and
- BadgeMagic/FrogAlert badges.

The user may also add up to eight custom rules. A rule matches a
case-insensitive name substring, prefix, or exact name; a canonical public OUI;
or a 16-bit advertised service, then displays a printable message of at most
16 characters. Public-OUI rules still ignore randomized/local addresses.
These are spoofable signals, not device-identity proof.

The browser locates exactly one 384-byte `FROGALERTCFGv1` block, validates its
schema/profile/CRC/padding, and preserves an immutable copy of the original
BIN. **Apply monitoring options** encodes the selected settings into a new
copy, calculates a new SHA-256, resets every prepared-flash binding, and
offers the configured local BIN for download. Editing any option makes the
current selection dirty and blocks flashing until it is applied. Restoring the
base options derives again from the immutable source, not from a chain of
previous patches.

Configuration never changes the compiled hardware profile. The resulting
bytes are labeled a local developer artifact with
`hardware_verified: false`; they do not inherit a CI candidate's or future
release's publication approval or physical evidence. A customized hash remains
local unless a future canonical build lane audits and publishes that exact
derivative; exact-board program/verify and a full smoke record would still be
required to mark it hardware-verified.

## Browser safety state machine

The browser page must progress through these states:

1. `unsupported` or `ready` — inspect secure-context and API availability.
2. `preparing` — immediately start validating the newest atomic release pair,
   show the target/risk and hardware-unverified disclosures, and make the first
   visible instruction tell the user to hold Top or Bottom to enter ISP and
   remember which worked. This state has no checkbox, typed phrase, or separate
   review gate.
3. `pair-ready` — both members pass descriptor, length, SHA-256,
   embedded-profile, provenance, quarantine, and programming-policy checks and
   remain in memory. No profile is selected yet.
4. `permission` — the user explicitly chooses a new WCH ISP device, or Chrome
   exposes one already authorized; neither case is destructive.
5. `info` — immediately after interface/endpoint validation, `0xA1` Identify
   and `0xA7` Read Config confirm chip `0x82`, type `0x16`, bootloader/config,
   and UID integrity. Raw UID and serial data are not logged. No network or
   human-paced UI work precedes this exchange after claim.
6. `button-answer` — the user explicitly answers Top or Bottom. This binds the
   corresponding cached profile/PCB marking to the same captured info session
   and is the final destructive activation. Neither, uncertainty, stale bytes,
   disconnect, or a repeated activation fails closed.
7. `config-reset` — first destructive command; write reviewed CH58x defaults
   through `0xA8`, then accept only the exact requested `0xA7` register bytes
   or the documented CH582/BTVER 02.40 canonical readback described below.
8. `erasing` — erase only after configuration readback succeeds.
9. `programming` — write 56-byte encrypted chunks and a final empty write.
10. `verifying` — compare all programmed chunks through ISP command `0xA6`.
11. `success` — only after verification; distinguish reset acknowledgement
    from a sent reset whose response was lost during disconnect.
12. `failed` — retain the validated pair but invalidate the device/answer
    binding and show how to re-enter ISP and retry.

### CH582 configuration readback

The `0xA8` reset requests these 12 configuration bytes:

```text
ff ff ff ff ff ff ff ff 4f ff 0f d5
```

CH582 bootloader 02.40 may canonicalize that value and return:

```text
ff ff ff ff ff ff ff ff 4f 3f 0f 45
```

This exact transition preceded a successful erase, program, and verify on
physical BadgeMagic hardware in
[FOSSASIA issue #110](https://github.com/fossasia/badgemagic-firmware/issues/110).
The public flasher therefore accepts the requested value or that one canonical
value after validating the `0xA8` and `0xA7` response envelopes and statuses.
It does not ignore the readback or broadly mask differences: every other value
fails before `0xA4` erase. Pinned upstream `wchisp` commit
[`cefd8707df345f1fbd7795e15367281f440bbf05`](https://github.com/ch32-rs/wchisp/commit/cefd8707df345f1fbd7795e15367281f440bbf05)
checks both command responses without comparing the returned register bytes,
so FrogAlert's two-value rule remains the narrower policy.

Connecting is never consent to alter configuration or erase. The later
Top/Bottom control is the sole in-page consent and immediate final action, but
no destructive command may run before state 7. The answer
handler must disable both choices synchronously, require and acquire the
exclusive Web Lock, and revalidate the same device, info result, and exact
cached artifact before sending `0xA8`; a missing or denied lock fails closed,
and a double tap must not open a second session. A screen wake lock is requested
for the destructive duration. A
timeout is always reported as an unknown device state because the underlying
USB command may have completed after the browser stopped waiting; recovery
requires a fresh info exchange followed by a complete program-and-verify
cycle.

## Open BadgeMagic recovery path

There is no factory-default recovery image. The manufacturer firmware is
closed, read-protected, unavailable, and cannot be dumped from the badge.
FrogAlert must never label any control as a factory reset.

The site instead offers **Install open BadgeMagic firmware**. This is an
explicit substitute: FOSSASIA's Apache-2.0 BadgeMagic-compatible firmware v0.1,
not the original OEM image. Its preparation button only fetches the same-origin
artifact, checks its byte length and SHA-256 locally, and binds it to the exact
revision. It does not connect to USB or send reset, erase, program, or verify
commands. Programming still requires its recovery-specific destructive button
and every target, identity, session-binding, and verification gate. While
`hardware_verified_by_frogalert` is false, the site goes further:
it permits preparation and inspection but refuses to arm destructive
programming for the bundled image.

The reviewed upstream image is restricted to the opened Micro-USB board after
the user confirms CH582M, exactly 44 columns, the Micro-USB layout, and a match
against FOSSASIA's pinned
[front/back photos](https://github.com/fossasia/badgemagic-firmware/blob/68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8/CH582.md#hardware-details),
then enters the build-profile token `HARDWARE_REV1`:

- same-origin file: `badgemagic-open-v0.1-hardware-rev1.bin`;
- upstream release: <https://github.com/fossasia/badgemagic-firmware/releases/tag/v0.1>;
- source commit: `68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8`;
- length: `155672` bytes;
- SHA-256: `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`;
- FrogAlert hardware status: unverified.

The manifest's hardware-verification flag is an executable safety gate, not
just a label. Enabling it requires a recorded physical Rev1 smoke covering
identify, config reset/readback, erase, program, verify, boot, BadgeMagic app
upload, and re-entry into ISP.

Unknown revisions, `HARDWARE_REV2`, and `HARDWARE_REV3` have no reviewed stable
upstream image and must remain disabled. USB chip identification cannot prove
the LED wiring or PCB generation, and `HARDWARE_REV1` is not a value the user
can read from the board.

## Artifact policy

The public artifact path uses same-origin, versioned `.bin` files listed in
`firmware/releases/manifest.json`. The manifest keeps standard FrogAlert
releases, physically approved experimental FrogAlert builds, and third-party
open recovery images in separate `releases`, `lab_images`, and
`recovery_images` collections. Each entry must contain:

- release version;
- target and supported hardware revision(s);
- source commit;
- byte length;
- SHA-256;
- same-origin artifact filename and optional GitHub release URL;
- an explicit hardware-verification status and its required basis.

Schema v5 also carries the canonical FrogAlert GitHub repository, release id,
semantic version, publication date, channel, `v<version>` tag, GitHub notes
URL, checked-in release-notes path, and exact Actions provenance for every new
non-legacy release. The selector uses the stable manifest id rather than
embedding serialized descriptor JSON in the page. It shows the release label,
version, channel, and exact hardware profile, and provides separate links to
the same-origin verified BIN and the human-readable GitHub Release.

The same-origin manifest remains the only executable catalog. The browser does
not call the GitHub API or download a GitHub-hosted asset, so a missing GitHub
service response cannot alter firmware selection and the static
`connect-src 'self'` policy remains intact. After successful firmware CI on
current `main`, the publication workflow retrieves the one source-bound
artifact, verifies its archive metadata, candidate receipt, BIN/ELF hashes,
build attestations, lane, profile pair, and quarantine status, then generates
the standard counter descriptors and publishes the GitHub Release before
deploying the Pages artifact that exposes the same bytes.

Site assembly accepts `hardware_verified: false` only for a standard counter
release whose exact source-bound Actions provenance is paired with
`verification_basis: "ci-audited"` and `flash_approved: true`. It keeps that
untested status visible at the point of action. Changing the flag to true still
requires evidence bound to the exact SHA-256, firmware profile, and PCB
marking. Stable schema-1 evidence must confirm program/verify, boot, power
cycle, short-button safety, and long-press ROM-ISP recovery. Schema-2 evidence
may bind an exact user-confirmed beta while explicitly disclosing that
CLI/WebUSB transport logs were not captured.

Lab images do not receive the CI-audited exception: they still require physical
evidence. The assembler rejects every hash in `firmware/quarantine.json`, even
if a later descriptor claims that hash was verified. Local builds, configured
derivatives, and nonstandard candidates stay under ignored `tmp/`.

The manifest's legacy pair contains user-confirmed `0.1.0-beta.1` releases for
both exact USB-C profiles; subsequent successful audited standard builds are
added automatically as an atomic top/bottom pair, and `lab_images` remains
empty. The first display-only USB-C pixel-walk build was
withdrawn after it booted blank and failed application-provided KEY2 recovery.
No failed, quarantined, nonstandard, or provenance-incomplete FrogAlert bytes
may remain downloadable from the public site.

The reviewed FOSSASIA v0.1 substitute may appear in `recovery_images` while
retaining `hardware_verified_by_frogalert: false`. The experimental page also
accepts a developer-selected local BIN, labels that path unverified, and binds
it to the PCB revision selected before loading. If the BIN has a FrogAlert
configuration block, the embedded profile must match and any monitoring patch
creates a newly hashed, unverified derivative. That explicitly local route
remains distinct from manifest-managed write locks. Firmware bytes and device
identifiers never leave the browser. The local validator rejects wrong
extensions, implausibly short images, uniform blank/fill images, unaligned
internal plans, erase plans beyond CH582 code flash, and every SHA in the
same-origin quarantine registry. If that registry cannot be loaded, artifact
preparation fails closed.

## What verify means

WCH ISP does not allow the page to download and back up the OEM code flash. Its
verify command compares submitted bytes against programmed flash internally.
“Verified” therefore means that comparison passed; it does not mean an OEM
backup exists or that every product behavior has passed a smoke test.

## Hardware release matrix

Do not mark browser flashing stable until the full flow—identify, configuration
reset/readback, erase, program, verify, reset, BadgeMagic upload, re-enter ISP,
and retry recovery—has passed on a confirmed badge in Chrome/Edge across at
least two desktop operating systems. Android Chrome plus USB OTG additionally
requires its own complete program, interruption, recovery, wake-lock, and
power-stability record before phone flashing can be called supported.
