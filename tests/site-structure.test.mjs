import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readlink } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readBytes = (path) => readFile(new URL(path, root));

function assertSocialPreview(html) {
  assert.match(
    html,
    /property="og:image" content="https:\/\/frogalert\.org\/site\/og-card\.jpg"/,
  );
  assert.match(html, /property="og:image:type" content="image\/jpeg"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:alt" content="[^"]+"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(
    html,
    /name="twitter:image" content="https:\/\/frogalert\.org\/site\/og-card\.jpg"/,
  );
  assert.match(html, /name="twitter:image:alt" content="[^"]+"/);
  assert.doesNotMatch(html, /og-card\.png/);
}

function jpegDimensions(bytes) {
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  throw new Error("JPEG dimensions were not found");
}

test("landing page exposes the project and guarded device flow", async () => {
  const html = await read("index.html");
  const app = await read("site/app.js");
  for (const required of [
    "FrogAlert",
    "id=\"flash-lab\"",
    "id=\"bluetooth-connect\"",
    "id=\"usb-connect\"",
    "id=\"firmware-file\"",
    "id=\"release-download\"",
    "id=\"release-link\"",
    "id=\"pcb-marking\"",
    "id=\"pcb-revision\"",
    "id=\"lab-image-select\"",
    "id=\"lab-image-status\"",
    "id=\"lab-image-download\"",
    "id=\"recovery-prepare\"",
    "id=\"recovery-board-confirmation\"",
    "site/app.js",
    "site/styles.css",
  ]) {
    assert.ok(html.includes(required), `index.html should include ${required}`);
  }
  assert.match(html, /OEM (?:firmware|image) is unavailable and unrecoverable/i);
  assert.match(html, /Web Bluetooth checks the running BadgeMagic service/i);
  assert.match(html, /id="bluetooth-connect"[^>]+disabled/);
  assert.match(html, /id="usb-connect"[^>]+disabled/);
  assert.match(html, /Install open BadgeMagic firmware/);
  assert.match(html, /Prepare open BadgeMagic firmware/);
  assert.match(html, /PROTOTYPE \/ BADGE · HARDWARE-UNVERIFIED/);
  assert.match(html, /Private two-mode survey BIN/);
  assert.match(html, /short KEY2 press.*names.*BT 00/is);
  assert.match(html, /Scanning runs in either display mode/i);
  assert.match(html, /shows.*COP DETECTED.*for three seconds/is);
  assert.match(html, /shows three dancing frogs/i);
  assert.match(html, /scan starts about every 20 seconds/i);
  assert.match(html, /LED Badge Magic/);
  assert.match(html, /Passive scan limit:.*does not request scan responses/is);
  assert.match(html, /FEE0.*fallback can match other compatible badges/is);
  assert.match(html, /LED Badge Magic[\s\S]*Exact, case-insensitive hint/);
  assert.match(html, /Flipper[\s\S]*FLIPPER DETECTED/);
  assert.match(html, /QT [\s\S]*serial[\s\S]*KARR DETECTED/);
  assert.match(html, /Ray-Ban[\s\S]*Ray Ban[\s\S]*COP DETECTED/);
  assert.doesNotMatch(html, /HAX DETECTED/);
  assert.match(html, /201,788-byte candidate/);
  assert.match(html, /9d35de6a3bf7cdf90b2a4fe05fa25d0a85a3f9b18da42228b5e25908a92c51a7/);
  assert.match(html, /qualified 48-column app animations/);
  assert.match(html, /not hosted or released/i);
  assert.match(html, /OEM image is unavailable and unrecoverable/i);
  assert.match(html, /Preparation does not touch USB/i);
  assert.match(
    html,
    /This bundled image cannot be programmed from the site yet/i,
  );
  assert.match(html, /local BIN chooser below is read-only on this page/i);
  assert.match(html, /This page.*cannot reset configuration, erase, or program/is);
  assert.match(html, /B1144C_250901.*CH582M.*11×44/is);
  assert.match(html, /Ordinary KEY2 entry works only after compatible FOSSASIA.*FrogAlert firmware/is);
  assert.match(html, /Original or unknown firmware.*expert-only C3/is);
  assert.match(html, /RESET plus KEY2 did not work/i);
  assert.match(html, /one dot lights near the middle/i);
  assert.match(html, /4348:55e0.*1a86:55e0.*9–13 second/is);
  assert.match(html, /Hardware-verified lab build/i);
  assert.match(html, /Download selected hardware-verified lab BIN/i);
  assert.match(html, /compar(?:e|ed) both sides.*reference photos/i);
  assert.match(html, /USB identification only proves the MCU family/i);
  assert.doesNotMatch(html, /factory reset/i);
  assert.match(html, /id="recovery-prepare"[^>]+disabled/);
  assert.match(html, /data-flash-mode="inspect"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /name="referrer"/);
  assertSocialPreview(html);
  for (const stalePhrase of [
    "situational-awareness frog",
    "No vaporware arithmetic",
    "hardware gates, and receipts",
    "guarded destructive workflow",
    "same tiny",
  ]) {
    assert.ok(!html.includes(stalePhrase), `landing copy should omit ${stalePhrase}`);
  }
  assert.doesNotMatch(html, /id="flash-button"/);
  assert.doesNotMatch(html, /class="flash-confirmation"/);
  assert.match(app, /const destructivePage = document\.body\.dataset\.flashMode === "program"/);
  assert.match(app, /artifactKind: "frogalert-lab"/);
  assert.match(app, /assertFirmwareHashNotQuarantined\(hash, state\.quarantinedFirmwareHashes\)/);
  assert.match(app, /physicalMarkingMatchesArtifact\(\)/);
  assert.match(app, /pcbMarkings: \[\.\.\.release\.pcb_markings\]/);
  assert.match(app, /state\.releases = sortReleaseCatalogNewestFirst\(/);
  assert.match(app, /option\.value = release\.id/);
  assert.doesNotMatch(app, /option\.value = JSON\.stringify\(release\)/);
  assert.match(app, /sortReleaseCatalogNewestFirst\(/);
  assert.match(app, /wchisp-protocol\.js\?v=5/);
  assert.match(app, /isp-entry-guide\.js\?v=5/);
  assert.match(html, /site\/app\.js\?v=5/);
  assert.match(app, /latest approved/);
  assert.match(app, /Nothing is selected or loaded automatically/);
  assert.match(html, /newest semantic version.*never selected automatically/i);
  assert.match(app, /elements\.releaseDownload\.href = firmwareArtifactUrl\(release\.file/);
  assert.match(app, /elements\.releaseLink\.href = release\.release_url/);
  assert.match(app, /typeof navigator\.usb\?\.requestDevice === "function"/);
  assert.match(app, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches/);
  assert.doesNotMatch(app, /"usb" in navigator/);
  assert.match(app, /return destructivePage && elements\.flashPhrase\?\.value\.trim\(\) === "ERASE THIS BADGE"/);
  assert.match(app, /if \(destructivePage && elements\.flashButton\)/);
  assert.match(app, /Private developer BINs may be selected locally for qualified bench testing only/);
  assert.match(app, /Private survey builds remain local, hardware-unverified developer artifacts/);
});

test("dedicated flash route exposes guided mobile and recovery workflow", async () => {
  const html = await read("flash/index.html");
  const app = await read("site/app.js");
  const flashCss = await read("site/flash.css");
  for (const required of [
    "site/app.js",
    "site/flash.css",
    "id=\"capability-status\"",
    "id=\"bluetooth-connect\"",
    "id=\"usb-connect\"",
    "id=\"usb-disconnect\"",
    "id=\"isp-guide-start\"",
    "id=\"isp-entry-guide\"",
    "id=\"isp-guide-title\"",
    "id=\"isp-guide-instruction\"",
    "id=\"isp-guide-step\"",
    "id=\"isp-guide-countdown\"",
    "id=\"isp-guide-back\"",
    "id=\"isp-guide-next\"",
    "id=\"isp-guide-connect\"",
    "id=\"isp-guide-retry\"",
    "id=\"isp-guide-cancel\"",
    "id=\"runtime-firmware\"",
    "id=\"current-firmware-status\"",
    "id=\"board-detection-status\"",
    "id=\"firmware-file\"",
    "id=\"release-download\"",
    "id=\"release-link\"",
    "id=\"lab-image-select\"",
    "id=\"lab-image-status\"",
    "id=\"lab-image-download\"",
    "id=\"recovery-prepare\"",
    "id=\"flash-button\"",
    "id=\"flash-phrase\"",
    "class=\"flash-confirmation\"",
    "id=\"flash-log\"",
  ]) {
    assert.ok(html.includes(required), `flash/index.html should include ${required}`);
  }
  assert.match(html, /Android.*USB OTG/is);
  assert.match(html, /\.\.\/site\/app\.js\?v=5/);
  assert.match(html, /iPhone.*WebUSB/is);
  assert.match(html, /B1144C_250901.*CH582M.*11×44/is);
  assert.match(html, /After compatible FOSSASIA.*FrogAlert firmware is installed/is);
  assert.match(html, /hold.*KEY2.*about 2\.2 seconds/is);
  assert.match(html, /one dot lights near the middle/i);
  assert.match(html, /4348:55e0.*1a86:55e0.*9–13 second/is);
  assert.match(html, /Original or unknown firmware.*ordinary KEY2 hook is not available/is);
  assert.match(html, /RESET plus KEY2 did not work/i);
  assert.match(html, /hold KEY2 while momentarily bridging both ends of PCB capacitor.*C3/is);
  assert.match(html, /hazardous rail-collapse maneuver.*not routine/is);
  assert.match(html, /Leave the soldered cell and its leads alone/i);
  assert.match(html, /Download selected hardware-verified lab BIN/i);
  assert.match(html, /id="isp-guide-connect"[^>]+type="button"[^>]+hidden[^>]+disabled/);
  assert.match(`${html}\n${app}`, /Identify and Read Config/i);
  assert.ok(
    html.indexOf('id="isp-entry-guide"') < html.indexOf('id="usb-status"'),
    "the KEY2 guide must stay beside the chooser and before its live status",
  );
  assert.match(app, /ispGuideConnect\?\.addEventListener\("click", beginGuidedUsbConnection\)/);
  assert.match(app, /void connectUsb\(\{ guided: true \}\)/);
  assert.match(app, /function focusIspEntryPhaseControl\(phase\)/);
  assert.match(app, /focusIspEntryPhaseControl\(nextPhase\)/);
  assert.match(app, /\[ISP_ENTRY_PHASE\.IDENTIFIED, ISP_ENTRY_PHASE\.RETRY\]\.includes\(state\.ispEntryPhase\)/);
  assert.match(app, /focusIspEntryPhaseControl\(state\.ispEntryPhase\)/);
  assert.doesNotMatch(app, /set(?:Timeout|Interval)\([^)]*requestDevice/s);
  assert.match(flashCss, /\.flash-page \[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(flashCss, /\.isp-guide-overview\s*\{\s*grid-template-columns:\s*repeat\(5,/s);
  assert.match(html, /current (?:application )?firmware.*(?:unknown|cannot|not)/is);
  assert.match(html, /PCB revision.*cannot.*detect/is);
  assert.match(html, /OEM (?:firmware|image).*(?:unavailable|cannot be backed up)/is);
  assert.match(html, /Connecting alone never writes/i);
  assert.match(html, /Only hash-bound images with physical boot and recovery evidence may appear here/i);
  assert.match(html, /current private survey candidate is 201,788 bytes/i);
  assert.match(html, /not hosted, released, or hardware-approved/i);
  assert.match(html, /qualified bench testing only/i);
  assert.match(
    html,
    /does not prove detector behavior, board compatibility, short-KEY2 mode switching, app-animation compatibility, or long-KEY2 recovery/i,
  );
  assert.match(html, /9d35de6a3bf7cdf90b2a4fe05fa25d0a85a3f9b18da42228b5e25908a92c51a7/);
  assert.match(html, /qualified 48-column app-animation cropping/);
  assert.doesNotMatch(html, /factory reset/i);
  assert.match(html, /data-flash-mode="program"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /name="referrer"/);
  assertSocialPreview(html);
  assert.doesNotMatch(html, /every fact checks out/i);
});

test("first-entry guidance defaults unknown firmware to a safe stop", async () => {
  const sources = {
    landing: await read("index.html"),
    flasher: await read("flash/index.html"),
    app: await read("site/app.js"),
    hardware: await read("docs/HARDWARE.md"),
    webFlashing: await read("docs/WEB_FLASHING.md"),
    readme: await read("README.md"),
  };
  const combined = Object.values(sources).join("\n");

  assert.match(combined, /B1144C_250901/);
  assert.match(combined, /CH582M/);
  assert.match(combined, /11×44/);
  assert.match(combined, /4348:55e0/);
  assert.match(combined, /1a86:55e0/);
  assert.match(combined, /9–13 seconds?/);
  assert.match(combined, /one dot.*near the middle/is);
  assert.match(combined, /original or unknown firmware.*stop/is);
  assert.match(combined, /RESET plus KEY2 did not work/i);
  assert.match(combined, /both ends of PCB capacitor.*C3/is);
  assert.match(combined, /expert-only|expert bench/i);

  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(
      source,
      /(?:disconnect|isolate|cut).{0,40}(?:battery|cell)|(?:battery|cell).{0,40}(?:disconnect|isolate|cut)/is,
      `${name} must not turn the soldered battery into a user step`,
    );
    assert.doesNotMatch(
      source,
      /short.{0,40}(?:battery|cell)|(?:battery|cell).{0,40}short/is,
      `${name} must not instruct users to short the battery`,
    );
  }
});

test("social preview card is a 1200 by 630 JPEG", async () => {
  const bytes = await readBytes("site/og-card.jpg");
  assert.deepEqual(jpegDimensions(bytes), { width: 1200, height: 630 });
  assert.ok(bytes.length > 40_000, "social card should contain rendered artwork");
  const source = await read("site/og-card.svg");
  assert.match(source, /width="1200" height="630"/);
  assert.match(source, /Bluetooth alerts on a nametag/);
  await assert.rejects(readBytes("site/og-card.png"), /ENOENT/);
});

test("publication waits for successful same-repository CI and deploys only after release reconciliation", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  const ci = await read(".github/workflows/ci.yml");
  const assembler = await read("scripts/assemble-site.mjs");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[CI\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /workflow_run\.head_sha/);
  assert.match(workflow, /node scripts\/assemble-site\.mjs _site/);
  assert.match(workflow, /node scripts\/firmware-release-plan\.mjs tmp\/release-publication/);
  assert.match(workflow, /publishFirmwareReleaseBundle/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /needs: publish-releases/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /find firmware\/releases/);
  assert.doesNotMatch(workflow, /build-fossasia-usbc|build-count-firmware|build-display-bringup/);
  assert.match(assembler, /refusing to publish unlisted firmware artifact/);
  assert.match(assembler, /firmware artifact does not match manifest/);
  assert.match(assembler, /assertCh58xUserOptionMagic/);
  assert.match(assembler, /manifest\.lab_images/);
  assert.match(assembler, /validateFirmwarePublicationManifest/);
  assert.match(assembler, /firmware", "quarantine\.json"/);
  assert.match(assembler, /join\(repositoryRoot, "flash"\)/);
  assert.match(ci, /run: \.\/scripts\/verify/);
  assert.doesNotMatch(ci, /run:\s*\|[\s\S]*\.\/scripts\/build-display-bringup/);
  assert.doesNotMatch(ci, /run:\s*\|[\s\S]*\.\/scripts\/build-count-firmware/);
});

test("release manifest separates releases, hosted labs, and pinned open recovery", async () => {
  const manifest = JSON.parse(await read("firmware/releases/manifest.json"));
  assert.equal(manifest.schema_version, 4);
  assert.equal(manifest.github_repository, "pierce403/frogalert");
  assert.deepEqual(manifest.releases, []);
  assert.deepEqual(manifest.lab_images, []);
  await assert.rejects(
    readBytes("firmware/releases/frogalert-pixel-walk-b1144c-250901-usbc-f794974.bin"),
    /ENOENT/,
    "the failed hardware-smoke image must not remain publishable",
  );
  const quarantine = JSON.parse(await read("firmware/quarantine.json"));
  assert.equal(quarantine.schema_version, 1);
  assert.equal(
    quarantine.artifacts[0].sha256,
    "02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22",
  );
  await read(quarantine.artifacts[0].evidence);

  assert.equal(manifest.recovery_images.length, 1);
  const recovery = manifest.recovery_images[0];
  assert.equal(recovery.id, "fossasia-badgemagic-v0.1-hardware-rev1");
  assert.equal(recovery.version, "v0.1");
  assert.deepEqual(recovery.hardware_revisions, ["HARDWARE_REV1"]);
  assert.equal(recovery.hardware_verified_by_frogalert, false);
  assert.equal(recovery.file, "badgemagic-open-v0.1-hardware-rev1.bin");
  assert.equal(recovery.bytes, 155672);
  assert.equal(
    recovery.sha256,
    "7beebae130d36aa3b975d03019bb2027abf2f030295bd0f9daa625f04fb1e6b9",
  );
  assert.equal(recovery.upstream.source_commit, "68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8");
  assert.equal(recovery.upstream.license, "Apache-2.0");

  const artifact = await readBytes(`firmware/releases/${recovery.file}`);
  assert.equal(artifact.byteLength, recovery.bytes);
  assert.equal(createHash("sha256").update(artifact).digest("hex"), recovery.sha256);
});

test("recurse-style harness files remain canonical symlinks", async () => {
  assert.equal(await readlink(new URL("CLAUDE.md", root)), "AGENTS.md");
  assert.equal(await readlink(new URL("GEMINI.md", root)), "AGENTS.md");
});

test("repo skills expose valid portable frontmatter", async () => {
  for (const name of ["curator", "build-badge-firmware", "maintain-web-flasher"]) {
    const skill = await read(`skills/${name}/SKILL.md`);
    assert.match(skill, /^---\nname: [a-z0-9-]+\ndescription: .+\n---\n/);
    assert.doesNotMatch(skill, /<[^>]+>/, `${name} should not retain template placeholders`);
  }
});

test("feature tracker preserves evidence-based status vocabulary", async () => {
  const features = await read("FEATURES.md");
  for (const status of [
    "SHIPPED",
    "PROTOTYPE",
    "IN PROGRESS",
    "PLANNED",
    "BLOCKED",
    "DEFERRED",
    "REJECTED",
    "VERIFIED",
    "AVAILABLE",
    "QUARANTINED",
    "FAILED",
  ]) {
    assert.ok(features.includes(`| **${status}** |`), `FEATURES.md should define ${status}`);
  }
  assert.match(features, /Stable browser flashing.*BLOCKED/s);
});
