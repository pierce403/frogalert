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
3. Begin fetching and validating the atomic published top/bottom pair as soon
   as the page loads; do not gate that preparation on an acknowledgement. The
   first screen must lead with the instruction to hold Top or Bottom and
   remember which worked. For first-time permission, pair-ready enables one
   **Start watching for ISP** tap that opens the WCH-only chooser before the
   physical hold; remembered permission can auto-detect the attach. On connect,
   filter only WCH ISP ids, claim interface 0, then immediately send `0xA1`
   Identify followed by `0xA7` Read Config before any question or network work.
   A timer or USB attach event may update guidance but must never open
   `requestDevice()`; only a user gesture may open the first-time chooser.
4. Never write on connect. Show both images' PCB/profile binding, size, SHA-256,
   provenance, and hardware status without checkboxes, a typed phrase, or a
   separate review gate. After read-only info, the clearly destructive Top or
   Bottom choice is the sole in-page consent and must immediately flash and
   byte-verify the matching prevalidated image. Do not add another Continue,
   confirmation, or profile selection.
   The owner has authorized immediate publication of the standard counter
   top/bottom pair after trusted main CI. Assembly may accept a release with
   `hardware_verified: false` only when it is explicitly CI-audited and
   flash-approved, carries exact canonical run/artifact/receipt/attestation
   provenance, binds one profile and one PCB marking, and is absent from the
   quarantine registry. Keep that status visible before flashing. Do not extend
   this bypass to hosted lab or recovery images. Load the same quarantine
   registry in the browser and reject a matching local file after hashing it.
   Keep the checked-in same-origin manifest and BIN as the executable catalog.
   GitHub Releases may supply notes and alternate downloads, but browser code
   must not query the GitHub API or flash a GitHub-hosted asset.
5. Reset CH58x protection/configuration through `0xA8`, validate the follow-up
   `0xA7` envelope/status, and accept only the exact requested 12 bytes
   `ff ff ff ff ff ff ff ff 4f ff 0f d5` or the physically documented
   CH582/BTVER 02.40 canonical readback
   `ff ff ff ff ff ff ff ff 4f 3f 0f 45`. FOSSASIA
   [issue #110](https://github.com/fossasia/badgemagic-firmware/issues/110)
   records that canonical value before a successful flash. Every other
   readback must stop before erase. Then pad, erase, program, verify, and
   request reset in that order. Pinned upstream `wchisp`
   [`cefd870`](https://github.com/ch32-rs/wchisp/commit/cefd8707df345f1fbd7795e15367281f440bbf05)
   checks command success without byte equality; do not broaden FrogAlert to
   that status-only rule without new physical evidence. If verification fails,
   report failure prominently and do not claim recovery or success.
   Distinguish a reset acknowledgement from a sent reset whose response was
   lost during disconnect.
6. Capture one USB device for the entire destructive session, check it before
   every transfer, require an exclusive Web Lock before `0xA8`, and keep
   reconnect locked until the session exits. Missing or denied Web Locks fail
   closed.
7. Keep all firmware bytes and device identifiers local to the browser.
8. Preserve accessible status, keyboard navigation, reduced motion, secure
   context checks, and honest unsupported-browser messaging.
9. Run `./scripts/verify`, then test through a local browser. A physical-badge
   run is additionally required before changing an artifact's status to
   hardware-verified, but it is not an automatic-release prerequisite.
10. Update `FEATURES.md` and the site readiness labels with the same evidence.
11. For publication changes, preserve the post-CI order: generate and validate
    the exact CI-audited descriptor pair, materialize and attest the immutable
    bundle, publish and verify the GitHub Release, then deploy Pages. A run with
    no new firmware artifact remains a successful website-only path once the
    current version's complete pair is already published; a missing pair must
    trigger the catch-up candidate path.

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
