# Browser connection and flashing

FrogAlert uses two browser hardware APIs for two different jobs. Calling both
of them “Web Bluetooth flashing” would be technically wrong.

The dedicated guided surface is <https://frogalert.org/flash/>. The landing
page retains read-only badge and artifact inspection, but its destructive
controls have been removed. Every flashing and recovery write belongs on
`/flash/`.

`/flash/` is a one-screen-at-a-time wizard. It starts by checking previously
authorized USB devices for either the known BadgeMagic application signature
`0416:5020` or the WCH ISP ids. Seeing `0416:5020` keeps the wizard on the
connection step and tries the bottom button, then the top button, with the
badge display held upright; the page does not open or claim the application's
HID/CDC interfaces. For
each attempt, the user explicitly opens the WCH-only chooser first, leaves it
open, then holds the indicated button and selects the ISP device as soon as it
appears. This spends the short ROM window identifying the device instead of
opening browser permission UI afterward. A
reported dot from the bottom button maps to the **bottom-button image**
(`B1144C_250901`); a dot from the top maps to the **top-button image**
(`B1144C_260404`). These are the public labels; manifests and build tooling
retain the exact PCB identifiers.
If neither button produces the dot, the public wizard stops before C3; that
hazardous operation remains qualified bench recovery, not profile detection.
Seeing an ISP id starts
only read-only USB configuration, Identify, and Read Config operations. A
first-time badge still requires one explicit chooser tap because WebUSB does
not expose unapproved devices. After a successful read-only identification,
FrogAlert stores only a coarse local “WCH ISP was authorized” hint. Chrome owns
the real device permission. On later visits the page uses
`navigator.usb.getDevices()` and USB attach events to identify the permitted
bootloader automatically, without another site-level Connect step. If browser
permission was cleared, the local hint grants nothing and the guide exposes
the native chooser as a fallback. No USB serial or device identifier is stored.
Only after CH582 `0x82 / 0x16` identification
succeeds does the wizard use the observed button path to download the newest
approved matching same-origin image, verify its size, hash, profile, and
evidence metadata, then show confirmations and finally the separate
program-and-verify action. There is no file chooser or profile selector in the
public wizard. If no approved image exists for that button, it stops without
offering a developer BIN. Failure returns to the
connection screen with the relevant KEY2 recovery hint; unrelated diagnostics
and Bluetooth controls are not visible in the flasher.

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
- Windows may require the ISP interface to use WinUSB; the WCH vendor driver can
  prevent the browser from claiming it.
- macOS should not need a vendor driver, but still needs a physical test.

The CLI fallback is `wchisp` and remains part of every release plan.

## Enter the bootloader

The physically confirmed USB-C reference is an 11×44 board marked
`B1144C_250901` with a WCH `CH582M`. It has a soldered pouch battery and no
user-removable battery connector. Leave the cell and its leads alone.

For that board running the tested FOSSASIA USB-C application—or a future
FrogAlert image whose exact artifact passed recovery acceptance—the routine
path is:

1. Keep a stable data-capable USB connection.
2. Hold the profile's KEY2 for about 2.2 seconds: the button farther from USB
   on `B1144C_260404`, or the button nearest USB on `B1144C_250901`.
3. Release when one dot lights near the middle of the panel.
4. Open the WebUSB chooser promptly and accept only `4348:55e0` or
   `1a86:55e0`.

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

`/flash/` therefore keeps a routine compatible-firmware guide that confirms
stable data USB, opens the WCH-only chooser from an explicit user tap, then asks
the user to hold the indicated button and release at the single dot while the
chooser is already watching. A timer or USB attach event never opens a chooser,
runs a command, or turns the read-only connection into a write. Only the
explicit **Start watching for ISP** action may call
`navigator.usb.requestDevice()`.

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
same recovery test.

## What the browser can identify

After the user explicitly selects the bootloader, `/flash/` can validate:

- WCH USB vendor/product descriptors without displaying or logging a serial;
- configuration 1, interface 0, and bulk endpoint 2 in both directions;
- chip id `0x82` and family/type `0x16` from the Identify response;
- the bootloader version, UID checksum, and a conservative configuration
  summary from the read-only configuration response; and
- the selected artifact's local length, padding/erase plan, SHA-256,
  provenance, declared profile, and hardware-evidence status.

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

Every FrogAlert image must preserve and physically prove FOSSASIA's deliberate
KEY2 recovery affordance before it is flash-approved. Keep the upstream TMOS
polling/task, display cue, and address-zero transfer intact rather than
reconstructing the hook in a new runtime. Acceptance requires a short press to retain its normal
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
`BM1144-C` text, or an untouched button. It instead records which guided
button attempt actually produced the dot and ISP device. Entering the page
while the badge is already in ISP provides no such evidence, so automatic
selection stops and asks the user to let the badge return to normal mode and
repeat the guided entry.

Every configurable survey BIN embeds its compiled profile id. The page rejects
a mismatch between that id and the button-derived profile. `/flash/` contains
no file input, including in hidden or legacy markup. Read-only local artifact
inspection remains on the project landing page and cannot provide a fallback
when an approved release is missing.

## Local monitoring customization

After a compatible local FrogAlert survey BIN is loaded, `/flash/` exposes five
built-in target groups:

- Axon/TASER/Flock indicators;
- Flipper names;
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
copy, calculates a new SHA-256, resets every destructive confirmation, and
offers the configured local BIN for download. Editing any option makes the
current selection dirty and blocks flashing until it is applied. Restoring the
base options derives again from the immutable source, not from a chain of
previous patches.

Configuration never changes the compiled hardware profile. The resulting
bytes are labeled a local developer artifact with
`hardware_verified: false`; they do not inherit a CI candidate's or future
release's physical evidence. A customized hash needs its own exact-board
program/verify and full smoke record before it could ever become public.

## Browser safety state machine

The browser page must progress through these states:

1. `unsupported` or `ready` — inspect secure-context and API availability.
2. `permission` — user explicitly chooses a WCH ISP device.
3. `identified` — descriptor/endpoint validation and a read-only probe confirm
   chip `0x82`, type `0x16`; raw UID and serial data are not logged.
4. `artifact-ready` — a revision-bound local or released raw BIN passes size,
   profile, configuration, and SHA-256 checks. Unapplied monitoring edits block
   this state. Preparing an open BadgeMagic image stops here and sends no USB
   commands.
5. `armed` — user records the observed physical PCB marking separately from the
   firmware profile and confirms CH582M, 11×44 matrix,
   configuration reset, the unavailable and unrecoverable OEM image, and
   stable power, then types `ERASE THIS BADGE`.
6. `config-reset` — first destructive command; write reviewed CH58x defaults
   through `0xA8`, then require exact `0xA7` readback.
7. `erasing` — erase only after configuration readback succeeds.
8. `programming` — write 56-byte encrypted chunks and a final empty write.
9. `verifying` — compare all programmed chunks through ISP command `0xA6`.
10. `success` — only after verification; distinguish reset acknowledgement
    from a sent reset whose response was lost during disconnect.
11. `failed` — retain the artifact and show how to re-enter ISP and retry.

Connecting is never consent to alter configuration or erase. No destructive command may run before
state 6. When supported, an exclusive Web Lock prevents another FrogAlert tab
from entering the destructive session, and a screen wake lock is requested for
the duration. A timeout is always reported as an unknown device state because
the underlying USB command may have completed after the browser stopped
waiting; recovery requires a fresh identify followed by a complete
program-and-verify cycle.

## Open BadgeMagic recovery path

There is no factory-default recovery image. The manufacturer firmware is
closed, read-protected, unavailable, and cannot be dumped from the badge.
FrogAlert must never label any control as a factory reset.

The site instead offers **Install open BadgeMagic firmware**. This is an
explicit substitute: FOSSASIA's Apache-2.0 BadgeMagic-compatible firmware v0.1,
not the original OEM image. Its preparation button only fetches the same-origin
artifact, checks its byte length and SHA-256 locally, and binds it to the exact
revision. It does not connect to USB or send reset, erase, program, or verify
commands. Programming still requires the separate destructive button and every
ordinary hardware, identity, confirmation, session-binding, and verification
gate. While `hardware_verified_by_frogalert` is false, the site goes further:
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
`firmware/releases/manifest.json`. The manifest keeps physically approved
FrogAlert releases, physically approved experimental FrogAlert builds, and
third-party open recovery images in separate `releases`, `lab_images`, and
`recovery_images` collections. Each entry must contain:

- release version;
- target and supported hardware revision(s);
- source commit;
- byte length;
- SHA-256;
- same-origin artifact filename and optional GitHub release URL;
- hardware verification record.

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
`connect-src 'self'` policy remains intact. After successful CI on `main`, the
publication workflow retrieves the one recorded successful main-CI artifact,
verifies its archive metadata, candidate receipt, BIN/ELF hashes, and build
attestations, then publishes any new manifest-approved GitHub Release before
deploying the Pages artifact that exposes the same bytes.

Site assembly rejects a FrogAlert release or lab image unless
`hardware_verified` is true and its evidence is bound to the exact SHA-256,
firmware profile, and PCB marking. Stable schema-1 evidence must confirm
program/verify, boot, power cycle, short-button safety, and long-press ROM-ISP
recovery. Beta schema-2 evidence may instead bind an exact user-confirmed image
while explicitly disclosing that CLI/WebUSB transport logs were not captured.
It also
rejects every hash in `firmware/quarantine.json`, even if a later descriptor
claims that hash was verified. First-test images stay under ignored `tmp/`.

The manifest contains user-confirmed `0.1.0-beta.1` releases for both exact
USB-C profiles; `lab_images` remains empty. The first display-only USB-C
pixel-walk build was
withdrawn after it booted blank and failed application-provided KEY2 recovery.
No failed or merely build-audited FrogAlert bytes may remain downloadable from
the public site.

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
