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

The shared USB id is not a target identity. The browser must send Identify and
accept only a payload beginning with chip id `0x82`, device type `0x16`.

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

Program/verify packets contain a 32-bit little-endian address, a padding byte,
and at most 56 bytes of data XORed with an 8-byte key. With an all-zero key
seed, the key is derived from the sum of the first eight UID bytes; the final
key byte also includes the chip id. The bootloader requires a final empty
Program packet after all data chunks.

Firmware is padded with zeroes to a 1 KiB boundary. The page rejects any input
whose erase plan would exceed the CH582 448 KiB code-flash definition.

Before erase, the page writes the reviewed CH58x defaults for the `0x07`
configuration group and requires an exact readback. This mirrors the required
`wchisp config reset` prerequisite for a protected stock badge. That write is
the first destructive operation and is separately disclosed in the UI.

## Implementation boundary

`site/wchisp-protocol.js` contains deterministic packet and validation helpers.
`site/app.js` owns WebUSB permission, transport, progress, safety confirmations,
and failure recovery. Pure helpers are tested in Node; physical acceptance
requires captured request/response fixtures and a confirmed badge.

Primary reference implementation: <https://github.com/ch32-rs/wchisp>.
