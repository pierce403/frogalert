---
name: maintain-web-flasher
description: Maintain and verify FrogAlert's static browser device experience. Use for index.html, site assets, Web Bluetooth BadgeMagic connections, WebUSB WCH ISP flashing, firmware manifests, browser compatibility, USB safety gates, or GitHub Pages deployment.
---

# Maintain Web Flasher

Treat browser flashing as a destructive hardware workflow, not a decorative
button. Preserve the difference between Web Bluetooth and WebUSB.

## Workflow

1. Read `docs/WEB_FLASHING.md`, `docs/PROTOCOL.md`, `FEATURES.md`, and existing
   protocol tests.
2. Keep packet construction and validation pure in `site/wchisp-protocol.js`;
   keep permission prompts and WebUSB transport in `site/app.js`.
3. On connect, filter only WCH ISP ids, claim interface 0, and identify the
   exact CH582/type `0x16` before enabling destructive actions.
4. Never write on connect. Require a local/release firmware image bound to the
   entered PCB revision, size and SHA-256 display, all explicit safety
   confirmations, and a final click.
5. Reset CH58x protection/configuration through `0xA8`, require exact `0xA7`
   readback, then pad, erase, program, verify, and request reset in that order.
   If verification fails, report failure prominently and do not claim recovery
   or success. Distinguish a reset acknowledgement from a sent reset whose
   response was lost during disconnect.
6. Capture one USB device for the entire destructive session, check it before
   every transfer, and keep reconnect locked until the session exits.
7. Keep all firmware bytes and device identifiers local to the browser.
8. Preserve accessible status, keyboard navigation, reduced motion, secure
   context checks, and honest unsupported-browser messaging.
9. Run `./scripts/verify`, then test through a local browser. Hardware changes
   additionally require a supported-browser physical-badge run.
10. Update `FEATURES.md` and the site readiness labels with the same evidence.

## Release gate

Do not mark browser flashing stable until Chrome/Edge on at least two desktop
operating systems has completed connect, identify, revision binding,
configuration reset/readback, erase, program, byte verify, reset, BadgeMagic
upload, and recovery-path tests on a confirmed badge. Publish only HTTPS pages;
WebUSB is not a general insecure-origin API.

## Licensing

The WCH ISP packet behavior is documented by the GPL-2.0-only `ch32-rs/wchisp`
project. Keep source attribution and license notices with any derived browser
implementation, and do not silently relicense copied code.
