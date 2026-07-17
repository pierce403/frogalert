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
   and SHA-256 checks.
5. `armed` — user confirms CH582M marking, 11×44 matrix, exact PCB revision,
   configuration reset, irreversible loss of OEM firmware, and stable power.
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

## Artifact policy

The public one-click path will use same-origin, versioned `.bin` files listed in
`firmware/releases/manifest.json`. Each entry must contain:

- release version;
- target and supported hardware revision(s);
- source commit;
- byte length;
- SHA-256;
- same-origin artifact filename and optional GitHub release URL;
- hardware verification record.

Until a hardware-tested firmware release exists, the manifest is empty. The
experimental page accepts a developer-selected local BIN but labels the path as
unverified and binds it to the PCB revision entered at selection time. Firmware
bytes and device identifiers never leave the browser.

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
