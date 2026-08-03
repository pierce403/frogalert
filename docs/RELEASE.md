# Release process

FrogAlert has two independently versioned surfaces: the static website and the
badge firmware. A website release can ship without firmware; a firmware release
cannot ship without hardware evidence.

## Website-only release

1. Update site copy, tests, docs, and `FEATURES.md` together.
2. Run `./scripts/verify`.
3. Perform a real local browser smoke at desktop and mobile widths.
4. Commit and push the cohesive change.
5. Verify the post-CI publication workflow reconciles the unchanged approved
   firmware catalog and GitHub Pages publishes the exact commit over HTTPS.
6. Confirm `frogalert.org` and the firmware manifest load without mixed content.
7. Record the deployed commit and any browser limitations in a dated log.

## Firmware release gate

Do not publish a firmware entry until all of these exist:

- positively identified CH582M 11×44 badge and recorded PCB revision;
- clean release build from the pinned FOSSASIA source and MRS toolchain, plus
  a pinned Rust toolchain if the image links the Rust policy archive;
- ELF and raw BIN artifacts;
- raw BIN size within the target region;
- SHA-256 and manifest entry tied to the source commit;
- captured local `wchisp` program and byte-verify success;
- WebUSB program and verify success;
- display, button, power-cycle, and recovery smoke tests;
- official BadgeMagic app upload before and after an alert/scan cycle;
- release notes with irreversible first-flash warning and CLI fallback.

The historical `frogalert-pixel-walk` and `frogalert-count` standalone Rust
images do not satisfy this gate. Their final ELFs contain a broken external
interrupt-vector layout, their build helpers intentionally refuse to emit a
BIN, and their failed SHA remains permanently quarantined.

The replacement USB-C path inherits the calibrated internal-LSI, USB,
BadgeMagic, display, button, and recovery systems from FOSSASIA source
`9ce885d`. Do not publish its C-only or Rust-ABI canaries until the exact bytes
pass the complete gate above. `B1144C_260404_USB_C` and
`B1144C_250901_USB_C` are separate release targets even though their LED
matrix mapping is identical: KEY1 pull, pressed polarity, and shutdown wake
edge differ. Evidence for one artifact/profile/PCB marking cannot approve the
other, and an untouched KEY1 is not an automatic profile detector.

## Commit-driven publication

`firmware/fossasia-usbc/version.json` is the source of truth for the version
embedded in a new image. Change that file in the same source commit as the
firmware change. A successful push to `main`, or a manual **CI** run from the
GitHub Actions page, then performs the complete candidate build on GitHub. No
developer laptop is required to download MRS, compile a BIN, update a moving
output hash, or commit generated firmware.

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

A cloud candidate is still not a release. Its metadata fixes
`hardware_verified`, `flash_approved`, `publishable`, and `hosted_on_site` to
`false`, and the candidate job has no release permission. The exact candidate
bytes must be flashed and tested on each claimed physical board. The later
approval commit contains only the manifest descriptor, release notes, and
hash-bound evidence/transcript; it does not contain a locally built BIN or ELF.
Every approved declared version must have a real GitHub Release and becomes the
site's latest version after publication. An untested declared version remains
an Actions candidate and is never presented as released firmware.

Each published version is an atomic USB-C pair: exactly one top/`260404`
descriptor and exactly one bottom/`250901` descriptor with the same release
identity. Site assembly and the browser catalog fail closed on a missing or
duplicate profile, so “latest” cannot silently resolve to different versions
on different boards.

Repository verification is split across trust boundaries. The ordinary
source/unit `verify` job runs without remote release artifacts or their access
permissions. On non-PR runs, a separate `publication-assets` job starts only
after `verify`, receives scoped Actions and attestation read access, retrieves
and validates every approved candidate, assembles the site, and generates the
release plan from those exact staged bytes.

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
4. extracts only the approved profile's exact BIN and ELF under `tmp/`, then
   rechecks version, source commit, lane, profile, byte lengths, hashes,
   startup sentinel, quarantine, attestations, and hardware evidence;
5. requires the firmware source commit to be an ancestor of the approval
   commit;
6. creates a release bundle containing that same BIN, checksum, symbol-bearing
   ELF, descriptor, evidence snapshot, and safety notes;
7. creates or resumes a **draft** GitHub Release, uploads every asset,
   downloads it again, and compares its SHA-256;
8. publishes the GitHub Release only after every asset matches; and
9. deploys the same staged BIN bytes to Pages only after release reconciliation
   succeeds.

The release/Pages workflow also requires its triggering `workflow_run.path` to
equal `.github/workflows/ci.yml`; the human-readable workflow name `CI` is not
a trust identity. Before checking out or executing repository code, a
read-only ref check also requires the triggering SHA to remain the current
`refs/heads/main`, preventing a slower older CI run from redeploying stale
source.

The two `v0.1.0-beta.1` descriptors are explicitly listed as legacy
repository-backed artifacts because they predate this workflow. Schema 5
rejects a new release without cloud candidate provenance, so future work cannot
quietly fall back to a laptop-built file.

A website-only commit or any commit with an empty `releases` collection
produces an empty plan and no GitHub Release. Existing published releases are
immutable: a missing, extra, differently sized, differently hashed, or
differently described asset fails the workflow instead of being overwritten.
Publication runs are not cancelled midway through an upload.

The website never queries the GitHub API and never flashes from a GitHub asset.
Its sole executable catalog remains the same-origin
`firmware/releases/manifest.json` and its same-origin BIN copy. GitHub Releases
provide human-readable notes, immutable downloads, and provenance.

Approved release ordering is independent from CI candidate versions. The
flasher derives “latest” only from validated semantic versions in the approved
`releases` collection. The public wizard may automatically download the newest
descriptor only after its observed bottom/top button path binds the exact
profile. It still requires CH582 identification, confirmations, and a separate
final flash action.

## Phone-only candidate testing boundary

Actions and `workflow_dispatch` make source editing and candidate compilation
phone-independent, but the approved public `/flash/` route intentionally cannot
load an unverified Actions artifact. Do not solve that by putting candidates in
Pages, exposing a GitHub token to browser JavaScript, or weakening the release
manifest.

The intended developer path is a generated, ignored Codespaces candidate lab.
It should use authenticated `gh` server-side to download and verify one exact
candidate, stage only that receipt and its profile-bound bytes under `tmp/`,
and serve a visibly unverified wizard through a private HTTPS forwarded port.
Before implementing that path, physically confirm a top-level
`*.app.github.dev` page on Android Chrome retains `navigator.usb` and the proxy
does not send `Permissions-Policy: usb=()`. Until that check passes, phone-only
physical candidate flashing remains a named external gate rather than a
claimed capability.

## Manifest entry

The manifest is `firmware/releases/manifest.json`. It separates physically
approved FrogAlert firmware in `releases`, physically approved experimental
FrogAlert builds in `lab_images`, and attributed third-party substitutes in
`recovery_images`. A future FrogAlert release entry has this shape:

```json
{
  "id": "frogalert-0.1.0-alpha.1-b1144c-250901-usbc",
  "kind": "frogalert-release",
  "label": "FrogAlert",
  "version": "0.1.0-alpha.1",
  "channel": "alpha",
  "release_tag": "v0.1.0-alpha.1",
  "release_url": "https://github.com/pierce403/frogalert/releases/tag/v0.1.0-alpha.1",
  "release_notes": "firmware/releases/notes/v0.1.0-alpha.1.md",
  "published_at": "YYYY-MM-DD",
  "firmware_variant": "counter",
  "target": "ch582m-badgemagic-11x44",
  "hardware_revisions": ["B1144C_250901_USB_C"],
  "pcb_markings": ["B1144C_250901"],
  "source_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "file": "frogalert-0.1.0-alpha.1-ch582m.bin",
  "bytes": 123456,
  "sha256": "64-lowercase-hex-characters",
  "debug_file": "frogalert-0.1.0-alpha.1-ch582m.elf",
  "debug_bytes": 234567,
  "debug_sha256": "64-lowercase-hex-characters",
  "hardware_verified": true,
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
  },
  "hardware_evidence": {
    "artifact_sha256": "64-lowercase-hex-characters",
    "source_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "record": "firmware/evidence/YYYY-MM-DD-image-profile.json",
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

The site must reject unknown targets, false `hardware_verified`, invalid hashes,
oversize images, and unsupported hardware revisions for destructive use. One
descriptor covers exactly one firmware profile and one physical PCB marking;
publish a separate artifact descriptor and evidence record for every additional
board. Site assembly parses the structured record under `firmware/evidence/`
and requires every hash, source, board, USB, display, app-upload, KEY2-only
recovery, and known-good-reflash fact to match the manifest. It also reads the
bound dated transcript and requires exact identifiers plus dedicated CLI,
WebUSB, application USB, display/app, button, KEY2, and reflash sections. A
C3-assisted ROM entry is useful recovery evidence but cannot satisfy the
application KEY2 acceptance gate. Stable releases continue to require this
complete schema-1 record. Beta releases may use a schema-2
`user-confirmed-beta` record for an exact hash that the owner confirms working
on the exact board. That record must explicitly disclose uncaptured CLI/WebUSB
transport logs and cannot be promoted to stable without them.

A `lab_images` entry carries the same immutable identity and physical-evidence
fields as a release. It differs in stability/support expectations, not in
hardware safety. Unverified images stay only under ignored `tmp/`; the public
assembler rejects `hardware_verified: false`, missing or mismatched evidence,
and every SHA in `firmware/quarantine.json`. The browser also checks that
registry after hashing a manually selected local file, so a previously
downloaded failed artifact cannot be reintroduced through the developer path.

The web flasher may derive a local survey BIN by changing its CRC-protected
built-in/custom monitoring block. That operation preserves the compiled
hardware profile but changes the SHA-256. The configured bytes are explicitly
`hardware_verified: false`; base-artifact evidence does not transfer across a
configuration/hash change. Publishing such a variant would require its own
exact descriptor, profile/PCB-bound evidence record, and transcript.

The `releases` array contains two exact `0.1.0-beta.1` USB-C artifacts: the
top-button `B1144C_260404` image and bottom-button `B1144C_250901` image. Both
use user-confirmed schema-2 beta evidence, while `lab_images` remains empty.
The first USB-C pixel-walk build was withdrawn after a blank-boot hardware
failure and failed KEY2 recovery. A build-only or failed FrogAlert artifact
must remain under ignored `tmp/` paths and must never be copied into the public
release directory.
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
neither flash nor copy bytes into a public directory.
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
