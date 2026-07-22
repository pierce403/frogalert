# Structured firmware hardware evidence

Every public FrogAlert release or lab image targets exactly one firmware
profile and one physical PCB marking. Its manifest entry points to a JSON file
in this directory. Site assembly reads that file and requires every safety fact
to match the manifest exactly; an empty or unrelated Markdown log is not
evidence.

A record has this shape:

```json
{
  "schema_version": 1,
  "artifact_sha256": "64-lowercase-hex-characters",
  "source_commit": "40-lowercase-hex-characters",
  "tested_at": "YYYY-MM-DD",
  "hardware_profile": "B1144C_250901_USB_C",
  "pcb_marking": "B1144C_250901",
  "transcript": "agent-memory/logs/YYYY-MM-DD-image-profile-smoke.md",
  "cli_program_verified": true,
  "cli_byte_verify_passed": true,
  "webusb_program_verified": true,
  "webusb_byte_verify_passed": true,
  "boot_observed": true,
  "power_cycle_passed": true,
  "key1_behavior_passed": true,
  "short_key2_behavior_passed": true,
  "application_usb_id": "0416:5020",
  "application_hid_enumeration_passed": true,
  "application_cdc_enumeration_passed": true,
  "display_passed": true,
  "badgemagic_upload_passed": true,
  "key2_dot_observed": true,
  "key2_recovery_passed": true,
  "known_good_reflash_passed": true,
  "known_good_reflash_sha256": "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2",
  "recovery_method": "key2-only",
  "recovery_usb_id": "4348:55e0"
}
```

The corresponding manifest `hardware_evidence` object repeats these fields and
adds `record`. C3 or other bench entry does not satisfy `recovery_method`; the
acceptance test must exercise the running application's KEY2-only dot-to-ISP
path.

The dated Markdown transcript must contain the exact date, hash, source commit,
profile, PCB marking, application USB id, and recovery USB id plus these
headings, followed by the actual commands, browser log, kernel output, app
result, and visual observations:

```markdown
## CLI program and byte verification
## WebUSB program and byte verification
## Application USB HID and CDC
## Display and BadgeMagic upload
## KEY1 and short KEY2
## KEY2-only recovery
## Known-good reflash
```

Site assembly reads both files and rejects missing, empty, unrelated, or
identifier-mismatched transcripts. Each section must contain the relevant
command/output or observation terms; headings alone fail. For
`B1144C_250901_USB_C`, the reflash section must name and verify the pinned
177,704-byte FOSSASIA baseline SHA-256 shown above.
