# Release process

FrogAlert has two independently versioned surfaces: the static website and the
badge firmware. A website release can ship without firmware; a firmware release
cannot ship without hardware evidence.

## Website-only release

1. Update site copy, tests, docs, and `FEATURES.md` together.
2. Run `./scripts/verify`.
3. Perform a real local browser smoke at desktop and mobile widths.
4. Commit and push the cohesive change.
5. Verify GitHub Pages publishes the exact commit over HTTPS.
6. Confirm `frogalert.org` and the firmware manifest load without mixed content.
7. Record the deployed commit and any browser limitations in a dated log.

## Firmware release gate

Do not publish a firmware entry until all of these exist:

- positively identified CH582M 11×44 badge and recorded PCB revision;
- clean release build from a pinned Rust toolchain and HAL revision;
- ELF and raw BIN artifacts;
- raw BIN size within the target region;
- SHA-256 and manifest entry tied to the source commit;
- local `wchisp` program and verify success;
- WebUSB program and verify success;
- display, button, power-cycle, and recovery smoke tests;
- official BadgeMagic app upload before and after an alert/scan cycle;
- release notes with irreversible first-flash warning and CLI fallback.

## Manifest entry

The manifest is `firmware/releases/manifest.json`. A future release entry has
this shape:

```json
{
  "version": "0.1.0-alpha.1",
  "channel": "alpha",
  "target": "ch582m-badgemagic-11x44",
  "hardware_revisions": ["verified-revision"],
  "source_commit": "full-40-character-commit",
  "file": "frogalert-0.1.0-alpha.1-ch582m.bin",
  "bytes": 123456,
  "sha256": "64-lowercase-hex-characters",
  "hardware_verified": true,
  "release_url": "https://github.com/pierce403/frogalert/releases/tag/v0.1.0-alpha.1"
}
```

The site must reject unknown targets, false `hardware_verified`, invalid hashes,
oversize images, and unsupported hardware revisions.

## Rollback and recovery

There is no automatic OEM rollback because the original image is read-protected
and cannot be dumped. A failed FrogAlert update should be recoverable only by
re-entering WCH ISP and reflashing the last known-good open firmware. Keep the
last known-good release available and test that path before calling any release
stable.
