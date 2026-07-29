# FrogAlert 0.1.0-beta.1 production release

Date: 2026-07-29

Publication commit:
`8f1aecad2faa2829ea3fc2a91c94935dd2982376`

## Automation

- CI run
  [`30427180021`](https://github.com/pierce403/frogalert/actions/runs/30427180021)
  passed the complete repository contract.
- Release and Pages run
  [`30427231242`](https://github.com/pierce403/frogalert/actions/runs/30427231242)
  passed preparation, manifest-approved GitHub Release reconciliation, and
  deployment of the exact validated Pages artifact.
- GitHub published
  [`v0.1.0-beta.1`](https://github.com/pierce403/frogalert/releases/tag/v0.1.0-beta.1)
  as a non-draft prerelease with both BIN, ELF, checksum, descriptor, and
  evidence asset sets.

## Production byte verification

The two BINs were downloaded from `https://frogalert.org/firmware/releases/`
after deployment and hashed locally:

- top-button `B1144C_260404_USB_C`: 205,152 bytes, SHA-256
  `c6d06c59396aa6ffd6d1d9314cc4baf051c0205391c19a88bd749a31bface0d9`
- bottom-button `B1144C_250901_USB_C`: 205,128 bytes, SHA-256
  `f9367fe16952f9f23758fd401f25ae6b0c22ec6cdab6f3893b1650d79173d5c9`

The live schema-v4 manifest named the same two exact files, profiles, sizes,
versions, and hashes.

## Production browser smoke

The public landing page loaded `site/app.js?v=16`, exposed the direct
same-origin top-button download, linked the bottom-button image, and described
automatic wizard selection.

The public `/flash/` page:

- loaded both `0.1.0-beta.1` exact-profile descriptors;
- stated that the matching image is selected from the observed button path;
- contained no file input or visible “Choose file” copy; and
- emitted no browser console errors.

This verifies publication and catalog behavior. It is not a physical WebUSB
program/verify transcript and does not promote the beta to stable.
