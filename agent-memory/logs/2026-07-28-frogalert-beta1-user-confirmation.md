# FrogAlert 0.1.0-beta.1 user hardware confirmation

Date: 2026-07-28

Source commit:
`e8787b850cc64381b7d70889adab659997422959`

Exact artifacts:

- `B1144C_260404_USB_C`, PCB `B1144C_260404`,
  SHA-256 `c6d06c59396aa6ffd6d1d9314cc4baf051c0205391c19a88bd749a31bface0d9`
- `B1144C_250901_USB_C`, PCB `B1144C_250901`,
  SHA-256 `f9367fe16952f9f23758fd401f25ae6b0c22ec6cdab6f3893b1650d79173d5c9`

## User hardware confirmation

The user confirmed that both exact current images are working on their badges
and directed the project to publish them without waiting for additional
transport transcripts. They are therefore released as beta, not stable,
firmware.

## Runtime and display

Normal boot, display output, nametag mode, the fixed Bluetooth counter, local
alerts, frog frames, and restoration of the selected view were observed during
iterative physical testing.

## BadgeMagic compatibility

The user confirmed BadgeMagic upload compatibility while testing the exact
firmware line. Uploaded names and animations remained usable alongside the
FrogAlert counter and alert overlays.

## Buttons and recovery

The profile-specific button behavior was exercised on both photographed board
revisions. Long KEY2 produced the dot cue and entered the CH582 ROM ISP
recovery path; the top-button image is for `260404` and the bottom-button image
is for `250901`.

## Uncaptured transport evidence

Exact-hash CLI program/verify output and a complete WebUSB program/verify log
were not captured. This missing CLI and WebUSB transcript evidence is disclosed
as a beta limitation, not represented as completed, and does not block the
user-confirmed beta catalog. Stable promotion still requires captured
transport evidence.
