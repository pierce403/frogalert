# Commit-driven firmware release pipeline

Date: 2026-07-23

## Outcome

FrogAlert now has a source-level publication pipeline for successful
same-repository `main` commits. It does not create a firmware release for every
commit. Instead, it reconciles only physically approved descriptors already
present in the committed schema-v4 release manifest.

The current `releases` and `lab_images` collections remain empty. The private
201,788-byte survey/KARR candidate remains ignored under `tmp/` and is not part
of any release bundle, GitHub Release, or Pages artifact.

## Durable contract

1. CI must succeed for the exact commit.
2. The publication workflow checks out that SHA with full history.
3. Site assembly revalidates quarantine, evidence record/transcript, CH58x
   startup sentinel, byte length, SHA-256, and unlisted-artifact refusal.
4. The release planner also proves each firmware source commit is an ancestor
   of the publishing commit.
5. GitHub Releases are created as drafts. Exact BIN, symbol-bearing ELF,
   checksum, descriptor, and structured evidence assets are uploaded,
   downloaded, and hash-compared. The ELF is not copied into Pages.
6. Only a complete matching draft is published.
7. An existing published release is immutable. Missing, extra, or mismatched
   metadata/assets fail rather than being overwritten.
8. Pages deploys only after reconciliation succeeds.
9. The browser continues to trust only the same-origin manifest and BIN. It
   does not query GitHub or flash GitHub-hosted bytes.

## Verification status

The planner, bundle loader, draft publication, idempotent existing-release
check, and remote-asset mismatch rejection have local automated tests. The
workflow still needs its first live no-release run after the commit is pushed,
and the firmware path cannot be exercised until an exact artifact passes the
full physical release gate.

The local `/flash/` runtime was also loaded through the in-app Chromium browser
at `localhost`. It fetched the schema-v4 manifest and quarantine registry,
showed the honest empty-release warning, kept both release links hidden, and
had no horizontal overflow at desktop or a 375-pixel content viewport. A
versioned module URL avoids retaining the pre-schema-v4 app module, and
capability probes now require callable WebUSB/Web Bluetooth methods rather than
trusting a present-but-undefined browser property.
