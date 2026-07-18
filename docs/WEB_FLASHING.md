# Browser connection and flashing

FrogAlert uses two browser hardware APIs for two different jobs. Calling both
of them “Web Bluetooth flashing” would be technically wrong.

| Job | Browser API | Device state |
| --- | --- | --- |
| Verify/configure normal nametag behavior | Web Bluetooth | Badge firmware running and advertising `FEE0` |
| Replace MCU firmware | WebUSB | WCH factory ISP bootloader running |

## Supported browser target

Use current Chrome or Chromium Edge on desktop over HTTPS (or localhost during
development). Firefox and Safari do not currently expose WebUSB. Android USB
OTG, ChromeOS, and other Chromium platforms remain experimental until tested.

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

The bootloader window is short. The alternative powered-board C3 reset method
requires opening and shorting the correct capacitor and is deliberately not the
primary website instruction.

After compatible open firmware is installed, long-pressing KEY2 should preserve
the easier ISP-entry path. That behavior is a firmware acceptance requirement.

## Browser safety state machine

The browser page must progress through these states:

1. `unsupported` or `ready` — inspect secure-context and API availability.
2. `permission` — user explicitly chooses a WCH ISP device.
3. `identified` — read-only probe confirms chip `0x82`, type `0x16`.
4. `artifact-ready` — a revision-bound local or released raw BIN passes size
   and SHA-256 checks. Preparing an open BadgeMagic image stops here and sends
   no USB commands.
5. `armed` — user records the observed physical PCB marking separately from the
   firmware profile and confirms CH582M, 11×44 matrix,
   configuration reset, the unavailable and unrecoverable OEM image, and
   stable power.
6. `config-reset` — first destructive command; write reviewed CH58x defaults
   through `0xA8`, then require exact `0xA7` readback.
7. `erasing` — erase only after configuration readback succeeds.
8. `programming` — write 56-byte encrypted chunks and a final empty write.
9. `verifying` — compare all programmed chunks through ISP command `0xA6`.
10. `success` — only after verification; distinguish reset acknowledgement
    from a sent reset whose response was lost during disconnect.
11. `failed` — retain the artifact and show how to re-enter ISP and retry.

Connecting is never consent to alter configuration or erase. No destructive command may run before
state 6.

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
device identifiers never leave the browser.

## What verify means

WCH ISP does not allow the page to download and back up the OEM code flash. Its
verify command compares submitted bytes against programmed flash internally.
“Verified” therefore means that comparison passed; it does not mean an OEM
backup exists or that every product behavior has passed a smoke test.

## Hardware release matrix

Do not mark browser flashing stable until the full flow—identify, configuration
reset/readback, erase, program, verify, reset, BadgeMagic upload, re-enter ISP,
and retry recovery—has passed on a confirmed badge in Chrome/Edge across at
least two desktop operating systems.
