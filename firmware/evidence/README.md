# Structured firmware hardware evidence

Every public FrogAlert release or lab image targets exactly one firmware
profile and one physical PCB marking. Standard counter releases may publish
immediately after canonical CI with `hardware_verified: false`,
`verification_basis: "ci-audited"`, and `flash_approved: true`; they do not
fabricate a file in this directory. When a descriptor claims
`hardware_verified: true`, its manifest entry points to a JSON record here. Site
assembly reads that file and requires every declared fact to match exactly; an
empty or unrelated Markdown log is not evidence. Lab images remain physically
gated and require the same kind of record before publication.

Schema 1 below remains the complete hardware-tested/stable-status gate. A beta
release may instead use schema 2 with `verification_basis:
"user-confirmed-beta"` when the owner has confirmed the exact hash on physical
hardware but transport logs were not captured. Schema 2 must say
`transport_transcript_captured: false` and confirm boot, display, BadgeMagic
upload, profile-specific buttons, and KEY2 dot recovery. It cannot be used for
stable hardware-tested status or lab images. Neither schema is required for the
initial CI-audited standard publication while hardware status remains false.

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

Schema 2 transcripts contain the exact date, hash, source, profile, and marking
plus these substantive sections:

```markdown
## User hardware confirmation
## Runtime and display
## BadgeMagic compatibility
## Buttons and recovery
## Uncaptured transport evidence
```

This beta path records missing CLI/WebUSB transcripts as a limitation instead
of inventing evidence. Publication already happened through the CI-audited
path; the record upgrades only the truthful hardware-test status.
