# Protocol contracts

This document separates the application GATT protocol from the WCH ROM ISP
protocol. Both use the badge's USB/BLE hardware, but they are not interchangeable.

## BadgeMagic legacy GATT

- advertised identity: commonly `LSLED` on OEM or `LED Badge Magic` on open
  firmware;
- service UUID: `0000fee0-0000-1000-8000-00805f9b34fb`;
- write characteristic: `0000fee1-0000-1000-8000-00805f9b34fb`;
- application data arrives as ordered 16-byte writes;
- a new frame begins with the six bytes `wang\0\0`.

The frame describes up to eight 11-row bitmap tracks, animation modes, speed,
flash/marquee bitfields, bitmap sizes, timestamp bytes, and pixel data. FrogAlert
must store a completed valid frame and render it as the normal nametag. An alert
is a temporary overlay, not a replacement frame.

See upstream `BadgeBLE.md` for the complete field layout.

The `/flash/` read-only probe may also request the standard Device Information
service (`0x180A`) and read optional firmware revision (`0x2A26`), manufacturer
name (`0x2A29`), and model number (`0x2A24`) text. Those strings are
self-reported application metadata. They are sanitized and length-limited for
display, and are not proof of the bytes installed in code flash. Many legacy
badges expose none of them.

## WCH USB ISP transport

Known factory-bootloader USB ids:

- `4348:55e0`
- `1a86:55e0`

Transport contract:

- configuration 1;
- interface 0;
- bulk OUT address `0x02` (WebUSB endpoint number 2);
- bulk IN address `0x82` (WebUSB endpoint number 2);
- maximum transfer packet: 64 bytes.

The browser validates that configuration/interface/alternate/endpoint shape
before issuing Identify. It never exposes the USB serial number in its facts or
session log.

The shared USB id is not a target identity. The browser must send Identify and
accept only a payload beginning with chip id `0x82`, device type `0x16`.

Before ISP entry, photographed OEM and FOSSASIA-derived USB-C badges have
enumerated their running application as `0416:5020`. The flasher may use that
descriptor as a conservative “normal application mode” hint and show the KEY2
guide, but it must not treat it as a bootloader or open its application
interfaces. It cannot prove the installed firmware or exact hardware. Only the
WCH ids above followed by the Identify exchange may advance to the post-info
Top/Bottom action. They do not select a hardware profile by themselves.

## ISP command envelope

Requests begin with command byte plus a little-endian payload length. Responses
echo the command and carry a little-endian response length at bytes 2–3.

Commands used by the website prototype:

| Command | Byte | Purpose |
| --- | ---: | --- |
| Identify | `0xA1` | Determine exact chip and family |
| ISP key | `0xA3` | Establish the UID-derived XOR key |
| Erase | `0xA4` | Erase code-flash sectors |
| Program | `0xA5` | Program one address/chunk |
| Verify | `0xA6` | Compare one address/chunk |
| Read config | `0xA7` | Obtain bootloader version and UID |
| Write config | `0xA8` | Reset CH58x protection/configuration before first erase |
| ISP end | `0xA2` | Reset/end the session |

For an authorized WebUSB device, the first claimed-interface operations are
always `0xA1` Identify followed immediately by `0xA7` Read Config with the full
`0x1f` mask. Together they are the useful read-only portion of `wchisp info`:
they prove `0x82/0x16`, capture bootloader/configuration facts, validate the UID
checksum, and turn the brief no-command enumeration into an active ISP
session. No manifest fetch, profile question, or other human-paced UI work may
run between claiming the interface and this exchange. A USB attach event may
start it only for a device for which the browser already has permission; attach
and timer events must never call `requestDevice()`.

Both current published profile images must already be downloaded, hashed,
profile-checked, and quarantine-checked before routine ISP entry. This
preparation runs automatically and is not gated by acknowledgements. After the
read-only exchange, the user's **Top button** or **Bottom button** answer selects
the corresponding cached profile and serves as the sole in-page consent and
final destructive activation. The implementation must recheck the same
captured device, info result, and artifact binding at that event;
it must stop on an unknown answer, disconnect, double activation, or stale
artifact. The next command may then be the destructive `0xA8` config reset—no
extra Continue or browser confirmation stands between the answer and the
matching flash/verify sequence.

Program/verify packets contain a 32-bit little-endian address, a padding byte,
and at most 56 bytes of data XORed with an 8-byte key. With an all-zero key
seed, the key is derived from the sum of the first eight UID bytes; the final
key byte also includes the chip id. The bootloader requires a final empty
Program packet after all data chunks.

Firmware is padded with zeroes to a 1 KiB boundary. The page rejects any input
whose erase plan would exceed the CH582 448 KiB code-flash definition. It also
rejects implausibly short and single-repeated-byte local images before USB
access. The destructive session independently revalidates the aligned length
and exact erase-sector count so a UI bug cannot change the plan.

Before erase, the page writes the reviewed CH58x defaults for the `0x07`
configuration group. The complete request is:

```text
a8 0e 00 07 00 ff ff ff ff ff ff ff ff 4f ff 0f d5
```

The following `0xA7` response must have a successful status, a valid envelope,
and exactly one of two reviewed 12-byte register values:

- the requested bytes, `ff ff ff ff ff ff ff ff 4f ff 0f d5`; or
- the CH582/BTVER 02.40 canonical readback,
  `ff ff ff ff ff ff ff ff 4f 3f 0f 45`.

The second form is not a failed reset. A physical BadgeMagic CH582 running
bootloader 02.40 was recorded changing the requested final word
`4f ff 0f d5` to `4f 3f 0f 45`, then erasing, programming, and verifying
successfully in
[FOSSASIA issue #110](https://github.com/fossasia/badgemagic-firmware/issues/110).
Those cleared reserved/signature bits are therefore an accepted hardware
canonicalization; any other readback still stops before `0xA4` erase. This
mirrors the required `wchisp config reset` prerequisite for a protected stock
badge without imposing byte equality that the hardware does not preserve.
That `0xA8` write is the first destructive operation. It is visibly disclosed,
then authorized for the exact selected profile only by the post-info
Top/Bottom action.

## Implementation boundary

`site/wchisp-protocol.js` contains deterministic packet and validation helpers.
`site/flash-session.js` owns the transport-independent destructive order and
zeroes its derived key on every exit. `site/app.js` owns WebUSB permission,
captured-device binding, timeouts, progress, target/risk disclosure, and failure
recovery. Node tests run a complete fake reset/readback/erase/program/finalize/
verify/reset session plus configuration and verify failures. Physical
acceptance still requires captured request/response fixtures and a confirmed
badge; a timeout is treated as an unknown hardware state, not a known failure
before or after the command.

The ISP can reveal the bootloader version and validate its UID, but it cannot
read protected application bytes or determine an arbitrary current firmware
version. Exact PCB revision, matrix mapping, and component population also
remain outside the protocol.

Primary reference implementation: pinned `ch32-rs/wchisp` commit
[`cefd8707df345f1fbd7795e15367281f440bbf05`](https://github.com/ch32-rs/wchisp/commit/cefd8707df345f1fbd7795e15367281f440bbf05).
Its
[`reset_config`](https://github.com/ch32-rs/wchisp/blob/cefd8707df345f1fbd7795e15367281f440bbf05/src/flashing.rs)
path checks the `0xA8` write and follow-up `0xA7` response status but does not
require the returned register bytes to equal the bytes sent. FrogAlert retains
the narrower two-value allowlist above.
