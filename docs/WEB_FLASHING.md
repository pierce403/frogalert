# Browser connection and flashing

FrogAlert uses two browser hardware APIs for two different jobs. Calling both
of them “Web Bluetooth flashing” would be technically wrong.

The dedicated guided surface is <https://frogalert.org/flash/>. The landing
page retains read-only badge and artifact inspection, but its destructive
controls have been removed. Every flashing and recovery write belongs on
`/flash/`.

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

For an OEM badge, the least invasive documented method is:

1. Disconnect the badge battery.
2. Hold KEY2, the button nearest USB.
3. Connect USB while holding KEY2.
4. Look for a single illuminated pixel and connect from the page promptly.

The bootloader window is short—upstream guidance treats it as roughly ten
seconds—so request the device immediately. The alternative powered-board C3 reset method
requires opening and shorting the correct capacitor and is deliberately not the
primary website instruction. A blank, frozen, or interrupted application can
usually still reach the ROM bootloader with KEY2. If no USB bootloader
enumerates after retrying with stable power and a known data cable, a website
cannot repair that lower-level hardware or bootloader failure.

`/flash/` keeps this sequence beside the USB chooser in a five-step, one-hand
guide. The countdown begins only after the user confirms the single-pixel
signal and is advisory: expiry never opens a chooser, runs a command, or turns
the read-only connection into a write. Only the final explicit tap may call
`navigator.usb.requestDevice()`. USB attach events may update the visible
status, but must never synthesize that tap or skip a physical step.

Upstream FOSSASIA firmware also documents a long press of KEY2 after its open
firmware has already been installed. FrogAlert must label that as an upstream
open-firmware behavior, not as evidence about unknown OEM firmware or an
unverified FrogAlert build. The battery-disconnected cold-entry sequence is the
recovery path when the installed application is unknown, blank, or broken.

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

After compatible open firmware is installed, long-pressing KEY2 should preserve
the easier ISP-entry path. That behavior is a firmware acceptance requirement.

## Browser safety state machine

The browser page must progress through these states:

1. `unsupported` or `ready` — inspect secure-context and API availability.
2. `permission` — user explicitly chooses a WCH ISP device.
3. `identified` — descriptor/endpoint validation and a read-only probe confirm
   chip `0x82`, type `0x16`; raw UID and serial data are not logged.
4. `artifact-ready` — a revision-bound local or released raw BIN passes size
   and SHA-256 checks. Preparing an open BadgeMagic image stops here and sends
   no USB commands.
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

The public one-click path will use same-origin, versioned `.bin` files listed in
`firmware/releases/manifest.json`. Schema v2 keeps FrogAlert releases and
third-party open recovery images in separate `releases` and `recovery_images`
collections. Each entry must contain:

- release version;
- target and supported hardware revision(s);
- source commit;
- byte length;
- SHA-256;
- same-origin artifact filename and optional GitHub release URL;
- hardware verification record.

Until a hardware-tested FrogAlert firmware release exists, `releases` remains
empty. The reviewed FOSSASIA v0.1 substitute may appear in `recovery_images`
while retaining `hardware_verified_by_frogalert: false`. The experimental page
also accepts a developer-selected local BIN, labels that path unverified, and
binds it to the PCB revision entered at selection time. Firmware bytes and
device identifiers never leave the browser. The local validator rejects wrong
extensions, implausibly short images, uniform blank/fill images, unaligned
internal plans, and erase plans beyond CH582 code flash.

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
