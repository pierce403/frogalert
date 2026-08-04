# Release process

FrogAlert has two independently versioned surfaces: the static website and the
badge firmware. A website release can ship without firmware. Every successful,
audited standard firmware build on canonical `main` CI is published
automatically so it is available to the phone flasher immediately; physical
hardware evidence changes its verification status but is not a publication
gate.

## Website-only release

1. Update site copy, tests, docs, and `FEATURES.md` together.
2. Run `./scripts/verify`.
3. Perform a real local browser smoke at desktop and mobile widths.
4. Commit and push the cohesive change.
5. Verify the post-CI publication workflow reconciles the unchanged published
   firmware catalog and GitHub Pages publishes the exact commit over HTTPS.
6. Confirm `frogalert.org` and the firmware manifest load without mixed content.
7. Record the deployed commit and any browser limitations in a dated log.

## Firmware publication gate

The standard counter top/bottom pair publishes only after automation proves all
of these facts:

- a clean build from the pinned FOSSASIA source and MRS toolchain, plus a pinned
  Rust toolchain if the image links the Rust policy archive;
- exact ELF and raw BIN artifacts for both supported USB-C profiles;
- size, startup-sentinel, vector, symbol, RAM, profile, lane, and
  forbidden-instruction audits;
- exact SHA-256 identities tied to the source commit and declared version;
- a canonical successful `.github/workflows/ci.yml` run on current `main`;
- an unexpired, source-bound Actions artifact and candidate receipt;
- GitHub provenance attestations for every published BIN and ELF;
- no match in `firmware/quarantine.json`;
- an atomic descriptor pair, release notes, irreversible first-flash warning,
  and CLI fallback.

The generated descriptors explicitly record `hardware_verified: false`,
`verification_basis: "ci-audited"`, and `flash_approved: true`. That combination
means “cloud-built, audited, and intentionally offered for flashing,” not
“tested on a badge.” Physical smoke evidence is required before changing
`hardware_verified` to true, describing an image as hardware-tested, or
promoting a channel whose acceptance contract makes that claim.

The historical `frogalert-pixel-walk` and `frogalert-count` standalone Rust
images do not satisfy this gate. Their final ELFs contain a broken external
interrupt-vector layout, their build helpers intentionally refuse to emit a
BIN, and their failed SHA remains permanently quarantined.

The replacement USB-C path inherits the calibrated internal-LSI, USB,
BadgeMagic, display, button, and recovery systems from FOSSASIA source
`9ce885d`. C-only and Rust-ABI canaries are development artifacts rather than
the standard counter release lane and are not auto-promoted.
`B1144C_260404_USB_C` and `B1144C_250901_USB_C` are separate release targets
even though their LED
matrix mapping is identical: KEY1 pull, pressed polarity, and shutdown wake
edge differ. CI therefore publishes one exact descriptor per profile; evidence
for one artifact/profile/PCB marking cannot mark the other hardware-verified,
and an untouched KEY1 is not an automatic profile detector.

## Commit-driven publication

`firmware/fossasia-usbc/version.json` is the source of truth for the version
embedded in a new image. Change that file in the same source commit as the
firmware change. `scripts/require-firmware-version-bump.mjs` makes every active
firmware change strictly advance that semantic version, preventing new bytes
from colliding with an immutable published tag. A successful push to `main`, or
a manual **CI** run from the GitHub Actions page, then performs the complete
candidate build on GitHub. No developer laptop is required to download MRS,
compile a BIN, update a moving output hash, or commit generated firmware.

Manual `workflow_dispatch` first checks the catalog. If the current version
already has a complete published counter pair, it skips a redundant firmware
rebuild and reconciles the existing release/site. If either descriptor is
absent, it builds and follows the normal automatic publication path.

The cloud candidate job builds and audits both top/`260404` and
bottom/`250901` profiles for the counter and frog lanes. Candidate mode retains
the source/toolchain pins, startup sentinel, ELF-to-BIN identity, vectors,
symbols, RAM headroom, embedded profile, rule set, and forbidden-instruction
checks. It intentionally calculates the new output size and SHA-256 instead of
requiring those outputs as inputs. It packages the declared semantic version,
exact source commit, GitHub repository/run/workflow/job/attempt, both BIN/ELF
pairs, and their hashes in `candidate.json`. GitHub also creates build
provenance attestations for the BINs and ELFs. The Actions artifact is named
`frogalert-candidate-<full-source-commit>` and is retained for 90 days.
Initial publication always requires that exact artifact and its attestations.
After the artifact expires, later site rebuilds may materialize an already
published version only from its complete immutable GitHub Release asset set,
after revalidating the tag/source ancestry, planned filenames, sizes, hashes,
BIN startup sentinel, and ELF header. Integrity or provenance failures never
fall back to release assets.

The raw cloud candidate remains build evidence rather than the public
descriptor: its metadata fixes `hardware_verified`, `flash_approved`,
`publishable`, and `hosted_on_site` to `false`, and the candidate job has no
release permission. After that job and its attestations succeed, the post-CI
workflow generates the standard counter descriptors from the exact candidate,
marks only those descriptors CI-audited and flash-approved, validates the full
publication bundle, and records the metadata in a generated commit. It never
substitutes a locally built BIN or ELF. The resulting version has a real GitHub
Release and becomes the site's latest phone-flashable version even when its
physical status remains untested.

Each published version is an atomic USB-C pair: exactly one top/`260404`
descriptor and exactly one bottom/`250901` descriptor with the same release
identity. Site assembly and the browser catalog fail closed on a missing or
duplicate profile, so “latest” cannot silently resolve to different versions
on different boards.

Repository verification is split across trust boundaries. The ordinary
source/unit `verify` job runs without release-write permissions. The canonical
firmware job builds and attests the candidate. Only after that CI run succeeds
does the post-CI workflow receive scoped Actions, attestation, release, and Pages
permissions, retrieve the exact candidate, generate the descriptors, assemble
the site, and generate the release plan from those staged bytes.

Schema 5 records the exact candidate `workflow_run_id`, workflow path and run
attempt, Actions `artifact_id`, artifact name and archive digest,
candidate-metadata SHA-256, firmware variant, and build lane on every new
release descriptor. The post-CI publication workflow then:

1. checks out the exact successful `main` commit with full history;
2. requires that recorded run to be a completed, successful canonical
   `.github/workflows/ci.yml` run on `main` in this repository at the exact
   source commit and attempt;
3. asks GitHub for the one recorded Actions artifact and rejects a different
   run, id, name, digest, expired archive, candidate receipt, variant, or lane;
4. extracts only the published profile's exact BIN and ELF under `tmp/`, then
   rechecks version, source commit, lane, profile, byte lengths, hashes,
   startup sentinel, quarantine, attestations, and either the exact CI-audited
   release basis or hash-bound hardware evidence;
5. creates a local metadata commit parented to the triggering source commit
   without pushing it yet;
6. creates a release bundle containing that same BIN, checksum, symbol-bearing
   ELF, descriptor, optional hardware-evidence snapshot, and safety notes;
7. pushes the generated metadata commit only with a compare-and-swap update
   that refuses stale or non-fast-forward `main` state;
8. creates or resumes a **draft** GitHub Release, uploads every asset,
   downloads it again, and compares its SHA-256;
9. publishes the GitHub Release only after every asset matches; and
10. deploys the same staged BIN bytes to Pages only after release reconciliation
   succeeds.

The release/Pages workflow also requires its triggering `workflow_run.path` to
equal `.github/workflows/ci.yml`; the human-readable workflow name `CI` is not
a trust identity. Before checking out or executing repository code, a
read-only ref check requires the triggering SHA to remain current
`refs/heads/main`. The final metadata push uses compare-and-swap semantics, so
a slower run cannot overwrite newer source or publish stale bytes.

The two `v0.1.0-beta.1` descriptors are explicitly listed as legacy
repository-backed artifacts because they predate this workflow. Schema 5
rejects a new release without cloud candidate provenance, so future work cannot
quietly fall back to a laptop-built file.

A website-only commit produces no new firmware release when the current
version's complete counter pair already exists. If an intervening commit made a
valid candidate stale before its metadata push, the newer `main` CI rebuilds
the still-missing version without demanding a false version bump. Existing
published releases are immutable: a missing, extra, differently sized,
differently hashed, or differently described asset fails the workflow instead
of being overwritten. Publication runs are not cancelled midway through an
upload.

The website never queries the GitHub API and never flashes from a GitHub asset.
Its sole executable catalog remains the same-origin
`firmware/releases/manifest.json` and its same-origin BIN copy. GitHub Releases
provide human-readable notes, immutable downloads, and provenance.

Published release ordering is independent from raw CI candidate metadata. The
flasher derives “latest” only from validated semantic versions in the
`releases` collection. Before asking the user to enter ISP, the public wizard
downloads and validates the complete newest top/bottom pair, including each
descriptor, byte length, SHA-256, embedded profile, provenance, quarantine
status, and hardware-test status. This preparation starts automatically and is
not gated by an acknowledgement, typed phrase, or review step. The wizard
visibly discloses the target boundary, irreversibility, provenance, and
hardware-unverified status. Its first visible instruction tells the user to
hold Top or Bottom to enter ISP and remember which button worked while
preparation continues in the background. Both possible answers must be ready
before the ISP claim without choosing a profile or writing the device.

## Phone-first release boundary

Actions and `workflow_dispatch` make compilation and publication independent of
a developer laptop. Once canonical CI and the post-CI publication checks pass,
the new standard pair is available through the same-origin public manifest and
can be selected from `/flash/` on a supported Android/Chromium WebUSB setup.
Browser JavaScript never receives a GitHub token and never reads an expiring
Actions artifact.

Immediate availability does not imply a physical smoke. The flasher shows the
CI-audited, hardware-untested status without adding confirmation gates. As soon
as the captured ISP device is claimed it runs `0xA1` Identify and `0xA7` Read
Config—the useful
read-only `wchisp info` exchange—before any question or network work. Only
after CH582 `0x82/0x16` identification succeeds does it ask whether the top or
bottom button produced ISP. That clearly destructive answer is the sole
in-page consent and final user action: it binds the exact profile/marking and
immediately starts
config reset, flash, and byte verification with the already validated matching
image. An uncertain or missing answer stops without writing. Lab images,
configured local derivatives, and third-party recovery firmware do not inherit
this automatic release exception.

## Manifest entry

The manifest is `firmware/releases/manifest.json`. It separates standard
FrogAlert firmware in `releases`, physically approved experimental FrogAlert
builds in `lab_images`, and attributed third-party substitutes in
`recovery_images`. A CI-audited standard release entry has this shape:

```json
{
  "id": "frogalert-0.2.0-beta.2-b1144c-250901-usbc",
  "kind": "frogalert-release",
  "label": "FrogAlert",
  "version": "0.2.0-beta.2",
  "channel": "beta",
  "release_tag": "v0.2.0-beta.2",
  "release_url": "https://github.com/pierce403/frogalert/releases/tag/v0.2.0-beta.2",
  "release_notes": "firmware/releases/notes/v0.2.0-beta.2.md",
  "published_at": "YYYY-MM-DD",
  "firmware_variant": "counter",
  "target": "ch582m-badgemagic-11x44",
  "hardware_revisions": ["B1144C_250901_USB_C"],
  "pcb_markings": ["B1144C_250901"],
  "source_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "file": "frogalert-0.2.0-beta.2-bottom-b1144c-250901-usb-c.bin",
  "bytes": 123456,
  "sha256": "64-lowercase-hex-characters",
  "debug_file": "frogalert-0.2.0-beta.2-bottom-b1144c-250901-usb-c.elf",
  "debug_bytes": 234567,
  "debug_sha256": "64-lowercase-hex-characters",
  "hardware_verified": false,
  "verification_basis": "ci-audited",
  "flash_approved": true,
  "build_provenance": {
    "kind": "github-actions-candidate",
    "workflow_run_id": 123456789,
    "workflow_path": ".github/workflows/ci.yml",
    "workflow_run_attempt": 1,
    "artifact_id": 987654321,
    "artifact_name": "frogalert-candidate-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "artifact_digest": "sha256:64-lowercase-hex-characters",
    "candidate_metadata_sha256": "64-lowercase-hex-characters",
    "build_lane": "survey"
  }
}
```

The top-level schema is version 5 and pins
`"github_repository": "pierce403/frogalert"`. It lists only the historical
repository-backed tags in `legacy_repository_release_tags`; every other release
must carry the complete GitHub Actions candidate provenance above. A release
id, semantic version, publication date, channel, `v<version>` tag, canonical
repository URL, safe checked-in notes path, and exact symbol-bearing ELF
identity are required. The ELF is attached
to GitHub for debugging but is never copied into the Pages flasher artifact.
Multiple exact-board descriptors may share a version/tag only when their label,
channel, source commit, notes, and URL are identical. Artifact ids and
filenames must be unique across release and lab collections.

The site rejects unknown targets, invalid hashes, oversize images, unsupported
hardware revisions, and an arbitrary false `hardware_verified` value. A false
value is executable only for the narrowly defined standard-release combination:
exact source-bound Actions provenance, `verification_basis: "ci-audited"`,
`flash_approved: true`, `firmware_variant: "counter"`, and the `survey` build
lane. One descriptor covers exactly one firmware profile and one physical PCB
marking.

Changing a descriptor to `hardware_verified: true` requires a separate
hash/profile/PCB-bound record under `firmware/evidence/`. Site assembly parses
that record and its dated transcript, requiring the claimed source, board, USB,
display, app-upload, KEY2-only recovery, and known-good-reflash facts to match.
A C3-assisted ROM entry is useful recovery evidence but cannot satisfy the
application KEY2 acceptance gate. Stable hardware-tested status continues to
require the complete schema-1 record. Schema-2 `user-confirmed-beta` evidence
may record an exact owner-confirmed image while explicitly disclosing missing
CLI/WebUSB transport logs; it cannot support a stable hardware-tested claim.

A `lab_images` entry carries the same immutable identity and physical-evidence
fields as a hardware-tested release. It differs in stability/support
expectations, not in hardware safety, and does not receive the standard counter
auto-publication exception. The public assembler rejects a lab image with
`hardware_verified: false`, missing or mismatched evidence, and every SHA in
`firmware/quarantine.json`. The browser also checks that
registry after hashing a manually selected local file, so a previously
downloaded failed artifact cannot be reintroduced through the developer path.

The local inspection tool may derive a survey BIN by changing its
CRC-protected built-in/custom monitoring block. That operation preserves the
compiled hardware profile but changes the SHA-256. The configured bytes are
explicitly `hardware_verified: false`; neither the base artifact's CI approval
nor its physical evidence transfers across a configuration/hash change.
Configured derivatives remain local unless a future audited build lane and
publication policy explicitly covers them.

The legacy `releases` pair contains two exact `0.1.0-beta.1` USB-C artifacts:
the top-button `B1144C_260404` image and bottom-button `B1144C_250901` image.
Both use user-confirmed schema-2 beta evidence, while `lab_images` remains
empty. Subsequent standard counter versions are recorded automatically as the
same atomic profile pair with a CI-audited basis and honest hardware status.
The first USB-C pixel-walk build was withdrawn after a blank-boot hardware
failure and failed KEY2 recovery. Failed, quarantined, nonstandard-lane, and
local derivative artifacts must remain outside the public release directory.
The one `recovery_images` entry is FOSSASIA's official open BadgeMagic firmware
v0.1 substitute, constrained to exact `HARDWARE_REV1` and recorded as
`hardware_verified_by_frogalert: false`. It is not a FrogAlert release and it is
not the original OEM firmware.

## Temporary build evidence

CI runs the candidate commands below. They are documented for reproduction,
not required for ordinary phone/cloud development:

```sh
./scripts/prepare-fossasia-usbc --with-toolchain
./scripts/build-fossasia-usbc baseline --check
./scripts/build-fossasia-usbc canary --check
./scripts/build-fossasia-usbc survey --candidate
./scripts/build-fossasia-usbc frogs --candidate
./scripts/build-fossasia-usbc B1144C_250901_USB_C baseline --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C canary --check
./scripts/build-fossasia-usbc B1144C_250901_USB_C survey --candidate
./scripts/build-fossasia-usbc B1144C_250901_USB_C frogs --candidate
```

The omitted profile builds the default `B1144C_260404_USB_C`; the explicit
commands build legacy `B1144C_250901_USB_C`. The latter baseline must reproduce
the known-good 177,704-byte BIN at SHA-256
`2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2`.
The canary adds only an inert retained metadata string. All three lanes
preserve the FOSSASIA USB-C startup/linker/runtime and audit required symbols,
startup marker, USB identity, KEY2-related runtime, and forbidden atomic
instructions.
The final Make-produced BIN must also match a fresh `objcopy -O binary -S` of
the audited ELF. Baseline and canary outputs remain immutable locks; candidate
survey/frog outputs are recorded as receipts by GitHub rather than used as
pre-build input locks.
Output remains under `tmp/fossasia-usbc/build/<PROFILE>/<LANE>/`; the scripts
neither flash nor copy bytes into a public directory. Only the post-CI workflow
may turn the audited standard candidate into hosted release assets.
Only GitHub Actions invokes `firmware-candidate.mjs`: schema-3 candidate
receipts require the real repository, run, workflow, job, and attempt supplied
by the runner. Do not fabricate those fields for a local bundle.

The old standalone Rust helpers are diagnostic quarantine checks only. They
build an ELF, demonstrate the misplaced external table and wrong Timer 0
vector, delete any stale BIN, and fail before `objcopy`. Do not work around that
failure or use a historical temporary BIN.

## Rollback and recovery

There is no factory/OEM rollback. The original image is read-protected,
unavailable, cannot be dumped, and therefore cannot be restored after the first
replacement.

For an exactly identified FOSSASIA Micro-USB `HARDWARE_REV1` board, the website
may prepare FOSSASIA's published open BadgeMagic v0.1 firmware as a substitute:

- file: `badgemagic-open-v0.1-hardware-rev1.bin`;
- length: `155672` bytes;
- SHA-256: `7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9`;
- FrogAlert hardware verification: false.

Preparing that image is non-destructive. While its hardware-verification flag
is false, it cannot reach the separate final program action. Unknown revisions,
`HARDWARE_REV2`, and `HARDWARE_REV3` have no approved substitute. After
FrogAlert releases exist, a failed update should be recoverable by re-entering
WCH ISP and reflashing a
physically tested last-known-good open image. That retry must itself be tested
before any FrogAlert release is called stable.

A physical Rev1 recovery smoke must pass before changing that flag and enabling
the path.
