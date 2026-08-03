# Cloud release path and compact boot status

Date: 2026-08-03

## Firmware source

`firmware/fossasia-usbc/version.json` now declares `0.2.0-beta.1` and the
lossless compact panel form `v0.2.0b1`. Both counter and frog lanes retain the
FOSSASIA shell and show two fixed boot cards before the configurable splash:

- `FOSSASIA`, compact FrogAlert version, and a compiled up arrow for the
  top/`B1144C_260404_USB_C` image or down arrow for the
  bottom/`B1144C_250901_USB_C` image;
- calibrated battery voltage and a bounded linear 0–100% estimate in a private
  3×5 font.

The battery path discards the first ADC conversion, adds WCH's signed rough
calibration value to 20 retained samples, clamps each sample to 12 bits, and
uses the existing 182 kOhm / 100 kOhm divider and 2.1 V reference in fixed-point
math. The Battery GATT characteristic uses the same conversion. Device
Information reports `FrogAlert 0.2.0-beta.1 / FOSSASIA v0.1-42-g9ce885d`, and
the manufacturer remains `FOSSASIA`. USB descriptors are unchanged.

Local candidate audits produced:

- counter top: 200,836 bytes,
  `cd546bc16b4c310d60f46ada0a5ab57cace3b95231242d14c6b934f6e4700022`
- counter bottom: 200,836 bytes,
  `054c6ebd158f982f1045e9293041181fbc97c14f7f04e37ef97636fc2d220621`
- frogs top: 200,920 bytes,
  `76a43c8320325f2b3ccf56e3a9022914d59c4e88088db60804f1217d95b23bda`
- frogs bottom: 200,920 bytes,
  `ef6da5d1eeaa889922d80441ca9e0aceb8a40d0ba0b8b8eb5ac147ef6619bdd2`

These hashes are local reproducibility receipts, not release evidence. The
commit-bound GitHub run must reproduce and attest its own exact bytes before
physical testing.

## GitHub build and release boundary

Manual `workflow_dispatch` and active-firmware pushes build both profiles and
both lanes with `--candidate`, which preserves every structural audit while
calculating the output hashes instead of accepting moving output locks. The
90-day Actions artifact records semantic version, source commit, workflow run,
attempt, job, lane, profiles, and BIN/ELF hashes. A separate non-PR job attests
the BINs and ELFs.

Manifest schema 5 keeps `v0.1.0-beta.1` as the only legacy repository-backed
release. Every later release records its exact CI workflow/run/attempt,
artifact id/name/archive digest, candidate-receipt digest, firmware variant,
and lane. Publication rejects anything other than a completed successful
canonical `main` CI run at the exact source commit, verifies the artifact and
attestations, materializes bytes only under `tmp/`, then feeds the identical
staged files to GitHub Releases and Pages. Generated new-version BINs and ELFs
are never committed.

## Website

The visible landing page now focuses on the product, the manifest-derived
latest approved version, exact supported PCB markings, profile-specific
downloads, release notes, and FOSSASIA credit. The previous developer
inspection console is no longer visible on the homepage. `/flash/` remains the
single public destructive wizard and continues to use only approved
same-origin release bytes.

## Phone-only physical candidate testing

Cloud editing and compilation no longer require a laptop. Physical testing of
an unverified candidate from a phone is still a separate safety boundary: the
public flasher correctly refuses Actions candidates.

The preferred future design is a generated Codespaces-only lab under ignored
`tmp/`. Authenticated `gh` would download and verify one exact candidate
server-side, and a private HTTPS forwarded port would serve a visibly
unverified version of the existing profile-bound wizard without exposing a
token or publishing candidate bytes. Before building that route, verify on a
real Android Chrome phone that a top-level `*.app.github.dev` URL exposes
WebUSB and that the forwarding proxy does not set `Permissions-Policy: usb=()`.
Do not put unverified candidates in Pages as a workaround.

## Integration review corrections

The final workflow review caught four cloud-only failures before the first
push. `github.job` is not available in a job-level expression, so candidate
metadata now records the literal audited `firmware-candidate` job id. The
upload action's bare archive hash is normalized to the schema's
`sha256:<hex>` form in the job summary. Trusted non-PR CI now materializes
approved remote bytes in a separate `publication-assets` job; ordinary and PR
source verification never needs Actions-artifact permission. The Pages gate
requires the triggering workflow path to be exactly
`.github/workflows/ci.yml`, not merely a workflow with the display name `CI`.

Every public version must also contain one exact top/`260404` and one exact
bottom/`250901` image. Both site assembly and browser catalog loading fail
closed on a partial or duplicate pair, preventing different boards from
silently receiving different “latest” versions.

Rendered desktop and 390×844 mobile checks found and fixed low-contrast
download buttons. The compact flasher remained one pane at a time. Normal-mode
USB detection now transfers keyboard focus from the hidden connect button into
the revealed button guide, inactive progress text has stronger contrast, and
the success-page home link uses the bright foreground color.

An additional workflow-order review found that successful `main` CI runs can
finish out of order. The release/Pages workflow now performs a read-only
GitHub-ref check before checkout or repository code and continues only when
the triggering CI SHA still equals `refs/heads/main`; an older successful run
therefore cannot redeploy a stale site after a newer commit is current.
