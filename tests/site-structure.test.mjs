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
    /property="og:image" content="https:\/\/frogalert\.org\/site\/og-card-v3\.jpg"/,
  );
  assert.match(html, /property="og:image:type" content="image\/jpeg"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(
    html,
    /property="og:image:alt" content="[^"]*long edge-to-edge LED nametag[^"]*"/,
  );
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(
    html,
    /name="twitter:image" content="https:\/\/frogalert\.org\/site\/og-card-v3\.jpg"/,
  );
  assert.match(
    html,
    /name="twitter:image:alt" content="[^"]*long edge-to-edge LED nametag[^"]*"/,
  );
  assert.doesNotMatch(html, /og-card\.png/);
  assert.doesNotMatch(html, /\/site\/og-card\.jpg/);
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
    "id=\"pcb-revision\"",
    "id=\"release-download\"",
    "id=\"release-link\"",
    "id=\"pcb-marking\"",
    "id=\"pcb-revision\"",
    "id=\"lab-image-select\"",
    "id=\"lab-image-status\"",
    "id=\"lab-image-download\"",
    "id=\"recovery-prepare\"",
    "id=\"recovery-board-confirmation\"",
    "id=\"latest-release-channel\"",
    "id=\"latest-release-version\"",
    "id=\"latest-release-markings\"",
    "id=\"latest-top-download\"",
    "id=\"latest-bottom-download\"",
    "id=\"latest-release-notes\"",
    "site/app.js",
    "site/styles.css",
  ]) {
    assert.ok(html.includes(required), `index.html should include ${required}`);
  }
  assert.match(html, /OEM (?:firmware|image) is unavailable and unrecoverable/i);
  assert.match(html, /BadgeMagic device advertising service.*FEE0/is);
  assert.match(html, /id="bluetooth-connect"[^>]+disabled/);
  assert.match(html, /id="usb-connect"[^>]+disabled/);
  assert.match(html, /Install open BadgeMagic firmware/);
  assert.match(html, /Prepare open BadgeMagic firmware/);
  assert.match(html, /Flash latest published firmware/);
  assert.match(html, /Latest firmware/);
  assert.match(html, /button closest to USB.*switch between your messages.*nearby-device count/is);
  assert.match(html, /About every 20 seconds.*three seconds/is);
  assert.match(html, /last completed count on screen while the next scan runs/i);
  assert.match(html, /shows.*COP DETECTED.*one second each/is);
  assert.match(html, /dancing-frog frames/i);
  assert.match(html, /LED Badge Magic/);
  assert.match(html, /Passive scan limit:.*does not request scan responses/is);
  assert.match(html, /FEE0.*fallback can match other compatible badges/is);
  assert.match(html, /LED Badge Magic[\s\S]*Exact, case-insensitive hint/);
  assert.match(html, /Flipper[\s\S]*FLIPPER DETECTED/);
  assert.match(html, /QT [\s\S]*serial[\s\S]*KARR DETECTED/);
  assert.match(html, /Ray-Ban[\s\S]*Ray Ban[\s\S]*COP DETECTED/);
  assert.doesNotMatch(html, /HAX DETECTED/);
  assert.doesNotMatch(html, /frogalert-\d+\.\d+\.\d+(?:-[a-z0-9.]+)?-b1144c-/i);
  assert.match(html, /FOSSASIA's open-source BadgeMagic firmware/i);
  assert.match(html, /github\.com\/fossasia\/badgemagic-firmware/);
  assert.match(html, /cannot be distinguished passively at boot/i);
  assert.match(html, /OEM image is unavailable and unrecoverable/i);
  assert.match(html, /Preparation does not touch USB/i);
  assert.match(
    html,
    /This bundled image cannot be programmed from the site yet/i,
  );
  assert.match(html, /local BIN chooser below is read-only on this page/i);
  assert.match(html, /tools below can inspect.*without changing it/is);
  assert.match(html, /B1144C_250901.*B1144C_260404.*CH582M/is);
  assert.match(html, /KEY2.*nearest USB on.*250901.*farther from USB on.*260404/is);
  assert.match(html, /Ordinary long-press entry works only after compatible FOSSASIA.*FrogAlert firmware/is);
  assert.match(html, /Original or unknown firmware.*expert-recovery boundary/is);
  assert.match(html, /one dot lights near the middle/i);
  assert.match(html, /4348:55e0.*1a86:55e0.*9–13 second/is);
  assert.match(html, /Additional test firmware/i);
  assert.match(html, /Download selected test firmware/i);
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
    "Keep the nametag. Tap KEY2 for the counter.",
    "What works, and what still needs a badge test",
    "Next candidate:",
    "Host tests passing",
    "Two hardware-tested beta images",
    "Concept UI",
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
  assert.match(app, /wchisp-protocol\.js\?v=8/);
  assert.match(app, /flasher-state\.js\?v=4/);
  assert.match(app, /flash-session\.js\?v=3/);
  assert.match(app, /isp-entry-guide\.js\?v=5/);
  assert.match(app, /firmware-config\.js\?v=2/);
  assert.match(html, /site\/app\.js\?v=23/);
  assert.match(html, /id="flash-lab"[^>]+hidden/);
  assert.match(app, /latest\[0\]\.published_at/);
  assert.match(app, /flash-support\.js\?v=3/);
  assert.match(app, /const latestVersion = state\.releases\[0\]\?\.version/);
  assert.match(app, /release\.version === latestVersion/);
  assert.match(app, /release\.pcb_markings\.includes\("B1144C_260404"\)/);
  assert.match(app, /release\.pcb_markings\.includes\("B1144C_250901"\)/);
  assert.match(app, /setLatestDownload\(elements\.latestTopDownload, top, "top"\)/);
  assert.match(app, /setLatestDownload\(elements\.latestBottomDownload, bottom, "bottom"\)/);
  assert.match(app, /elements\.latestReleaseNotes\.href = latest\[0\]\.release_url/);
  assert.match(html, /<caption>Built-in detection rules<\/caption>/);
  const detectionTable = html.match(
    /<caption>Built-in detection rules<\/caption>[\s\S]*?<\/table>/,
  )?.[0];
  assert.ok(detectionTable, "landing page should include the detector table");
  const orderedSignals = [
    "<code>FEE0</code>",
    "<code>LED Badge Magic</code>",
    "<code>QT </code> + serial",
    "<code>00:25:DF</code>",
    "<code>B4:1E:52</code>",
    "<code>01AB</code> + <code>FD5F</code>",
    "<code>Axon Body</code>",
    "<code>TASER</code>",
    "<code>Ray-Ban</code> / <code>Ray Ban</code>",
    "<code>3081</code>, <code>3082</code>, or <code>3083</code>",
    "<code>Flipper</code>",
  ];
  let previousSignalIndex = -1;
  for (const signal of orderedSignals) {
    const signalIndex = detectionTable.indexOf(signal);
    assert.ok(signalIndex > previousSignalIndex, `${signal} should follow detector priority`);
    previousSignalIndex = signalIndex;
  }
  assert.match(
    html,
    /Detection priority:[\s\S]*frog dance → KARR → COP → Flipper[\s\S]*first matching rule wins/i,
  );
  assert.match(app, /validatePairedUsbCReleaseCatalog\(/);
  assert.match(app, /!\[4, 5\]\.includes\(manifest\.schema_version\)/);
  assert.match(app, /both latest images are hash-verified in memory/i);
  assert.match(app, /elements\.releaseDownload\.href = firmwareArtifactUrl\(release\.file/);
  assert.match(app, /elements\.releaseLink\.href = release\.release_url/);
  assert.match(app, /typeof navigator\.usb\?\.requestDevice === "function"/);
  assert.match(app, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches/);
  assert.doesNotMatch(app, /"usb" in navigator/);
  assert.match(app, /if \(destructivePage && elements\.flashButton\)/);
  assert.doesNotMatch(app, /Private developer BINs may be selected locally for qualified bench testing only/);
  assert.doesNotMatch(app, /Private survey builds remain local, hardware-unverified developer artifacts/);
});

test("dedicated flash route exposes one safe wizard step at a time", async () => {
  const html = await read("flash/index.html");
  const app = await read("site/app.js");
  const flashCss = await read("site/flash.css");
  const flasherState = await read("site/flasher-state.js");
  const flashSession = await read("site/flash-session.js");
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
    "id=\"pcb-revision\"",
    "id=\"monitor-targets\"",
    "id=\"monitor-add-rule\"",
    "id=\"monitor-custom-rules\"",
    "id=\"monitor-apply\"",
    "id=\"monitor-download\"",
    "id=\"release-download\"",
    "id=\"release-link\"",
    "id=\"lab-image-select\"",
    "id=\"lab-image-status\"",
    "id=\"lab-image-download\"",
    "id=\"recovery-prepare\"",
    "id=\"flash-button\"",
    "id=\"wizard-pair-version\"",
    "id=\"wizard-pair-top\"",
    "id=\"wizard-pair-bottom\"",
    "id=\"wizard-pair-provenance\"",
    "id=\"wizard-pair-hardware-status\"",
    "id=\"flash-log\"",
  ]) {
    assert.ok(html.includes(required), `flash/index.html should include ${required}`);
  }
  assert.match(html, /Android.*USB OTG/is);
  assert.match(html, /\.\.\/site\/app\.js\?v=23/);
  assert.match(html, /class="wizard-shell"/);
  assert.match(html, /data-wizard-step="connect"[^>]*>/);
  const visibleWizard = html.slice(0, html.indexOf('class="legacy-flasher"'));
  const connectStep = visibleWizard.slice(
    visibleWizard.indexOf('data-wizard-step="connect"'),
    visibleWizard.indexOf('data-wizard-step="firmware"'),
  );
  assert.ok(
    connectStep.indexOf('id="wizard-pair-version"') <
      connectStep.indexOf('id="usb-connect"'),
    "the exact prepared release pair must be visible before ISP entry",
  );
  assert.match(
    connectStep,
    /hold[\s\S]{0,100}top[\s\S]{0,100}bottom[\s\S]{0,140}(?:ISP|flashing mode)/i,
    "the first screen must directly tell the user how to enter flashing mode",
  );
  assert.doesNotMatch(visibleWizard, /class="flash-confirmation"/);
  assert.doesNotMatch(visibleWizard, /id="flash-phrase"/);
  assert.doesNotMatch(visibleWizard, /ERASE THIS BADGE/i);
  assert.doesNotMatch(visibleWizard, /type="checkbox"/);
  assert.doesNotMatch(visibleWizard, />\s*Continue\s*</i);
  assert.match(html, /equivalent of <code>wchisp info<\/code>/i);
  assert.match(
    html,
    /With the badge display upright and readable, choose the button you actually held/i,
  );
  assert.match(
    html,
    /id="wizard-button-top"[^>]+data-isp-button="top"[^>]*>Top button — erase and flash top image now<\/button>/,
  );
  assert.match(
    html,
    /id="wizard-button-bottom"[^>]+data-isp-button="bottom"[^>]*>Bottom button — erase and flash bottom image now<\/button>/,
  );
  assert.match(
    html,
    /id="wizard-button-stop"[^>]*>Not sure — stop without writing<\/button>/,
  );
  for (const step of ["firmware", "flash", "success"]) {
    assert.match(
      html,
      new RegExp(`data-wizard-step="${step}"[^>]*hidden`),
      `${step} must be hidden initially`,
    );
  }
  assert.doesNotMatch(html, /data-wizard-step="confirm"/);
  assert.doesNotMatch(html, /data-wizard-progress="confirm"/);
  assert.match(html, /class="legacy-flasher" hidden aria-hidden="true"/);
  assert.doesNotMatch(
    html.slice(0, html.indexOf('class="legacy-flasher"')),
    /Flasher navigation|flash-help|mode-grid|capabilities-table/,
  );
  assert.match(flashCss, /\.wizard-step/);
  assert.match(flashCss, /\.flash-page > footer\s*\{[^}]*display:\s*none/s);
  assert.match(app, /function detectAuthorizedUsb\(device = null\)/);
  assert.match(app, /await navigator\.usb\.getDevices\(\)/);
  assert.match(app, /connectUsb\(\{ device: ispMatches\[0\], automatic: true \}\)/);
  assert.match(app, /ISP_PERMISSION_HINT_KEY = "frogalert\.wch-isp-authorized\.v1"/);
  assert.match(app, /window\.localStorage\.setItem\(ISP_PERMISSION_HINT_KEY, "yes"\)/);
  assert.match(app, /state\.ispPermissionRemembered = true/);
  assert.match(app, /Chrome remembers this bootloader/);
  assert.match(app, /FrogAlert will identify WCH ISP automatically/);
  assert.match(app, /Not detected\? Open the chooser/);
  assert.match(app, /elements\.usbButton\.hidden = true/);
  assert.match(app, /elements\.wizardApplicationTitle\?\.focus\(\)/);
  assert.match(app, /badgeUsbMode\(candidate\) === "application"/);
  assert.match(app, /showApplicationUsbDevice\(applicationMatches\[0\]\)/);
  assert.match(app, /BADGE_USB_CHOOSER_FILTERS/);
  assert.match(html, /id="wizard-application-guide"[^>]+hidden/);
  assert.match(html, /Badge detected in normal mode/);
  assert.match(html, /Hold Top or Bottom/);
  assert.match(
    html,
    /Tap Start watching first.*Keep the chooser open.*hold either the top or bottom button/is,
  );
  assert.match(html, /Start watching for flashing mode/);
  assert.doesNotMatch(visibleWizard, /No dot — try the top button/i);
  assert.doesNotMatch(visibleWizard, /id="wizard-application-next"/);
  assert.doesNotMatch(app, /wizardApplicationNext|advanceApplicationEntryAttempt/);
  assert.match(app, /connectUsb\(\{ ispOnly: true, applicationAttempt: true \}\)/);
  assert.match(app, /filters: ispOnly \? WCH_USB_FILTERS : BADGE_USB_CHOOSER_FILTERS/);
  assert.match(app, /flasher-state\.js\?v=4/);
  assert.match(app, /flash-session\.js\?v=3/);
  assert.match(flasherState, /top:[\s\S]*profile: "B1144C_260404_USB_C"[\s\S]*marking: "B1144C_260404"[\s\S]*imageLabel: "top-button image"/);
  assert.match(flasherState, /bottom:[\s\S]*profile: "B1144C_250901_USB_C"[\s\S]*marking: "B1144C_250901"[\s\S]*imageLabel: "bottom-button image"/);
  assert.match(flashSession, /export async function readBootloaderInfo\(\{ transfer \}\)/);
  assert.match(flashSession, /parseIdentity\(await transfer\(identifyPacket\(\)\)\)/);
  assert.match(flashSession, /await transfer\(readConfigPacket\(0x1f\)\)/);
  assert.match(html, /Both button-matched images are verified and ready/i);
  assert.match(
    html,
    /<div><dt>Build provenance<\/dt><dd id="firmware-provenance">—<\/dd><\/div>/,
  );
  assert.match(
    html,
    /<div><dt>Hardware status<\/dt><dd id="firmware-verification">—<\/dd><\/div>/,
  );
  assert.match(
    app,
    /GitHub Actions run \$\{build\.workflow_run_id\}, attempt \$\{build\.workflow_run_attempt\} · artifact \$\{build\.artifact_id\} · \$\{build\.artifact_digest\}/,
  );
  assert.match(app, /Programming has started\. Keep this page visible and do not disconnect\./);
  assert.doesNotMatch(html, /type="file"|Choose a local firmware file|id="firmware-file"/);
  assert.doesNotMatch(
    html.slice(0, html.indexOf('class="legacy-flasher"')),
    /Choose the firmware|Choose a local firmware file|Printed PCB revision/,
  );
  const prefetchStart = app.indexOf("async function prefetchLatestButtonReleaseArtifacts");
  const prefetchEnd = app.indexOf("\nfunction loadReleaseManifest", prefetchStart);
  assert.ok(prefetchStart >= 0 && prefetchEnd > prefetchStart, "the latest pair prefetch must be explicit");
  const prefetchSource = app.slice(prefetchStart, prefetchEnd);
  assert.match(prefetchSource, /state\.releasePrefetchReady = false/);
  assert.match(prefetchSource, /latestPair\.length !== 2/);
  assert.match(prefetchSource, /await Promise\.all\(/);
  assert.match(prefetchSource, /verifiedReleaseArtifactBytes/);
  assert.match(prefetchSource, /state\.releasePrefetchReady = true/);
  assert.ok(
    prefetchSource.indexOf("await Promise.all") <
      prefetchSource.indexOf("state.releasePrefetchReady = true"),
    "ISP readiness must follow complete validation of both latest images",
  );
  const artifactCacheStart = app.indexOf("async function verifiedReleaseArtifactBytes");
  const artifactCacheEnd = app.indexOf("\nasync function prefetchLatestButtonReleaseArtifacts", artifactCacheStart);
  assert.ok(artifactCacheStart >= 0 && artifactCacheEnd > artifactCacheStart);
  const artifactCacheSource = app.slice(artifactCacheStart, artifactCacheEnd);
  assert.match(artifactCacheSource, /validateFirmware\(bytes, release\.file\)/);
  assert.match(artifactCacheSource, /inspectFirmwareConfig\(bytes\)/);
  assert.match(artifactCacheSource, /assertFirmwareHashNotQuarantined/);
  const preparedPairStart = app.indexOf("function renderPreparedButtonReleasePair");
  const preparedPairEnd = app.indexOf(
    "\nasync function prefetchLatestButtonReleaseArtifacts",
    preparedPairStart,
  );
  assert.ok(preparedPairStart >= 0 && preparedPairEnd > preparedPairStart);
  const preparedPairSource = app.slice(preparedPairStart, preparedPairEnd);
  assert.match(preparedPairSource, /profileHintForIspButton\("top"\)/);
  assert.match(preparedPairSource, /profileHintForIspButton\("bottom"\)/);
  assert.match(
    preparedPairSource,
    /`\$\{release\.hardware_revisions\[0\]\} · \$\{release\.pcb_markings\[0\]\} · \$\{release\.bytes\.toLocaleString\(\)\} bytes · SHA-256 \$\{release\.sha256\}`/,
  );
  assert.match(
    preparedPairSource,
    /GitHub Actions run \$\{build\.workflow_run_id\}, attempt \$\{build\.workflow_run_attempt\} · artifact \$\{build\.artifact_id\} · \$\{build\.artifact_digest\} · source \$\{top\.source_commit\}/,
  );
  assert.match(preparedPairSource, /Both exact images are marked hardware-tested/);
  assert.match(
    preparedPairSource,
    /CI-audited and approved for site flashing; these exact images are not hardware-tested/,
  );
  assert.ok(
    prefetchSource.indexOf("await Promise.all") <
      prefetchSource.indexOf("renderPreparedButtonReleasePair(latestPair)"),
    "the visible pair summary must render only after both exact images pass validation",
  );
  const fetchManifestStart = app.indexOf("async function fetchReleaseManifest");
  const fetchManifestEnd = app.indexOf("\nasync function loadReleaseArtifact", fetchManifestStart);
  assert.ok(fetchManifestStart >= 0 && fetchManifestEnd > fetchManifestStart);
  const fetchManifestSource = app.slice(fetchManifestStart, fetchManifestEnd);
  assert.match(fetchManifestSource, /await prefetchLatestButtonReleaseArtifacts\(\)/);
  assert.ok(
    fetchManifestSource.indexOf("await prefetchLatestButtonReleaseArtifacts()") <
      fetchManifestSource.indexOf("void detectAuthorizedUsb()"),
    "automatic device detection may start only after both images are prefetched",
  );
  assert.doesNotMatch(
    fetchManifestSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete|ERASE THIS BADGE/,
  );
  assert.match(
    app,
    /state\.releasePrefetchReady = false;[\s\S]*renderPreparedButtonReleasePair\(\);[\s\S]*Release list unavailable/,
  );
  const readinessStart = app.indexOf("function updateConnectionReadiness");
  const readinessEnd = app.indexOf("\nfunction stopIspEntryCountdown", readinessStart);
  assert.ok(readinessStart >= 0 && readinessEnd > readinessStart);
  const readinessSource = app.slice(readinessStart, readinessEnd);
  assert.match(
    readinessSource,
    /const readyForIsp =\s*!destructivePage \|\| state\.releasePrefetchReady/,
  );
  assert.doesNotMatch(
    readinessSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete|consentReady/,
  );

  const connectStart = app.indexOf("async function connectUsb");
  const connectEnd = app.indexOf("\nasync function detectAuthorizedUsb", connectStart);
  const connectSource = app.slice(connectStart, connectEnd);
  assert.match(connectSource, /state\.releasePrefetchReady/);
  assert.doesNotMatch(
    connectSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete|ERASE THIS BADGE/,
  );
  assert.ok(
    connectSource.indexOf("await device.claimInterface(0)") <
      connectSource.indexOf("await readBootloaderInfo"),
    "wchisp info must run immediately after the ISP interface is claimed",
  );
  assert.match(
    connectSource,
    /await device\.claimInterface\(0\);\s*const \{ identity, config \} = await readBootloaderInfo/,
    "no prompt, fetch, or delay may sit between claiming ISP and the A1/A7 info exchange",
  );
  assert.ok(
    connectSource.indexOf("await readBootloaderInfo") <
      connectSource.indexOf("setWizardStep(WIZARD_STEP.FIRMWARE)"),
    "the top/bottom choice must appear only after read-only ISP info succeeds",
  );
  assert.doesNotMatch(connectSource, /fetchReleaseManifest|loadReleaseManifest|verifiedReleaseArtifactBytes/);
  assert.doesNotMatch(
    connectSource,
    /programAndVerifyFirmware|startFlash\(|flashFirmware\(|COMMAND\.(?:WRITE_CONFIG|ERASE|PROGRAM)/,
    "connection and bootloader info must not enter a destructive path",
  );

  const detectStart = app.indexOf("async function detectAuthorizedUsb");
  const detectEnd = app.indexOf("\nasync function closeUsb", detectStart);
  const detectSource = app.slice(detectStart, detectEnd);
  assert.match(detectSource, /state\.releasePrefetchReady/);
  assert.doesNotMatch(
    detectSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete|ERASE THIS BADGE/,
  );

  const wizardUiStart = app.indexOf("function updateWizardUi");
  const wizardUiEnd = app.indexOf("\nfunction setWizardStep", wizardUiStart);
  assert.ok(wizardUiStart >= 0 && wizardUiEnd > wizardUiStart);
  const wizardUiSource = app.slice(wizardUiStart, wizardUiEnd);
  assert.match(wizardUiSource, /state\.releasePrefetchReady/);
  assert.match(wizardUiSource, /!state\.buttonFlashPending/);
  assert.match(wizardUiSource, /!state\.flashing/);
  assert.doesNotMatch(
    wizardUiSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete/,
  );

  const choiceStart = app.indexOf("async function chooseIspButtonAndFlash");
  const choiceEnd = app.indexOf("\nasync function chooseLabImage", choiceStart);
  assert.ok(choiceStart >= 0 && choiceEnd > choiceStart, "the post-info button action must be explicit");
  const choiceSource = app.slice(choiceStart, choiceEnd);
  assert.match(choiceSource, /state\.buttonFlashPending\s*\|\|\s*state\.flashing/);
  assert.doesNotMatch(
    choiceSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete|ERASE THIS BADGE/,
  );
  assert.match(choiceSource, /selectApplicationProfileHint\(position\)/);
  assert.match(choiceSource, /candidate\.hardware_revisions\[0\] === hint\.profile/);
  assert.match(choiceSource, /loadReleaseArtifact\(release/);
  assert.match(choiceSource, /state\.usbDevice !== expectedDevice/);
  const expectedButtonFlashStart = choiceSource.indexOf(
    "const expectedButtonFlash = Object.freeze({",
  );
  const expectedButtonFlashEnd = choiceSource.indexOf(
    "const started = await startFlash",
    expectedButtonFlashStart,
  );
  assert.ok(
    expectedButtonFlashStart >= 0 &&
      expectedButtonFlashEnd > expectedButtonFlashStart,
    "the final button action must freeze its exact pre-armed session tuple",
  );
  const expectedButtonFlashSource = choiceSource.slice(
    expectedButtonFlashStart,
    expectedButtonFlashEnd,
  );
  assert.match(choiceSource, /const expectedChip = state\.chip/);
  for (const binding of [
    /device: expectedDevice/,
    /chip: expectedChip/,
    /config: expectedConfig/,
    /firmware: state\.firmware/,
    /artifactGeneration: state\.artifactGeneration/,
    /position/,
    /releaseId: release\.id/,
    /releaseVersion: release\.version/,
    /firmwareHash: release\.sha256/,
    /profile: hint\.profile/,
    /marking: hint\.marking/,
  ]) {
    assert.match(expectedButtonFlashSource, binding);
  }
  assert.match(
    choiceSource,
    /const started = await startFlash\(\{\s*finalActionConfirmed: true,\s*expectedButtonFlash,\s*\}\)/,
  );
  assert.match(choiceSource, /if \(!started\)[\s\S]*exclusive browser lock or exact button-selected session was unavailable/);
  assert.doesNotMatch(choiceSource, /window\.confirm/);
  assert.doesNotMatch(app, /prepareAutomaticButtonFirmware/);
  assert.doesNotMatch(app, /WIZARD_STEP\.CONFIRM|wizardConfirmContinue|wizardFirmwareContinue/);

  const buttonMatchStart = app.indexOf("function expectedButtonFlashMatches");
  const flashFirmwareStart = app.indexOf("async function flashFirmware", buttonMatchStart);
  const startFlashStart = app.indexOf("async function startFlash", flashFirmwareStart);
  assert.ok(
    buttonMatchStart >= 0 &&
      flashFirmwareStart > buttonMatchStart &&
      startFlashStart > flashFirmwareStart,
    "the frozen button-session guard must sit on the destructive path",
  );
  const buttonMatchSource = app.slice(buttonMatchStart, flashFirmwareStart);
  for (const guard of [
    /Object\.isFrozen\(expected\)/,
    /state\.usbDevice === expected\.device/,
    /expected\.device\?\.opened/,
    /state\.chip === expected\.chip/,
    /state\.config === expected\.config/,
    /state\.firmware === expected\.firmware/,
    /state\.artifactGeneration === expected\.artifactGeneration/,
    /state\.releasePrefetchVersion === expected\.releaseVersion/,
    /state\.buttonReleaseIds\?\.\[expected\.position\] === expected\.releaseId/,
    /state\.firmware\?\.releaseId === expected\.releaseId/,
    /state\.firmware\?\.releaseVersion === expected\.releaseVersion/,
    /state\.firmware\?\.hash\?\.toLowerCase\(\) === expected\.firmwareHash\.toLowerCase\(\)/,
    /state\.applicationProfileHint\?\.profile === expected\.profile/,
    /state\.applicationProfileHint\?\.marking === expected\.marking/,
  ]) {
    assert.match(buttonMatchSource, guard);
  }

  const flashFirmwareSource = app.slice(flashFirmwareStart, startFlashStart);
  assert.match(
    flashFirmwareSource,
    /finalActionConfirmed = false,\s*expectedButtonFlash = null/,
  );
  assert.match(flashFirmwareSource, /if \(!finalActionConfirmed\)[\s\S]*window\.confirm/);
  assert.doesNotMatch(
    flashFirmwareSource,
    /preflightConsentComplete|confirmationsComplete|typedPhraseComplete|ERASE THIS BADGE/,
    "the explicit button choice must not depend on a second consent control",
  );
  assert.ok(
    [...flashFirmwareSource.matchAll(/expectedButtonFlashMatches\(expectedButtonFlash\)/g)]
      .length >= 2,
    "the frozen button session must be checked before arming and again immediately before writes",
  );
  assert.match(
    flashFirmwareSource,
    /await acquireWakeLock\(\);\s*try\s*\{\s*if \(\s*finalActionConfirmed\s*&&\s*!expectedButtonFlashMatches\(expectedButtonFlash\)/,
    "wake-lock acquisition must be followed by a fresh exact-session check before A8",
  );
  assert.ok(
    flashFirmwareSource.indexOf("expectedButtonFlashMatches(expectedButtonFlash)") <
      flashFirmwareSource.indexOf("await programAndVerifyFirmware"),
    "the exact frozen session must be revalidated before the first destructive command",
  );

  const startFlashEnd = app.indexOf("\nfunction bindEvents", startFlashStart);
  const startFlashSource = app.slice(startFlashStart, startFlashEnd);
  assert.match(startFlashSource, /async function startFlash\(options = \{\}\)/);
  const noLocksStart = startFlashSource.indexOf("if (!navigator.locks?.request)");
  const noLocksEnd = startFlashSource.indexOf("\n  try", noLocksStart);
  assert.ok(noLocksStart >= 0 && noLocksEnd > noLocksStart);
  const noLocksSource = startFlashSource.slice(noLocksStart, noLocksEnd);
  assert.match(noLocksSource, /return false/);
  assert.doesNotMatch(noLocksSource, /flashFirmware/);
  assert.match(startFlashSource, /let started = false/);
  assert.ok(
    startFlashSource.indexOf("await navigator.locks.request") <
      startFlashSource.indexOf("started = await flashFirmware(options)"),
    "the exact-session validation and flash may run only after Web Lock acquisition",
  );
  assert.match(
    startFlashSource,
    /if \(!lock\)[\s\S]*return;[\s\S]*started = await flashFirmware\(options\);[\s\S]*return started/,
  );
  assert.match(app, /wizardButtonTop\?\.addEventListener\("click", \(\) =>[\s\S]*chooseIspButtonAndFlash\("top"\)/);
  assert.match(app, /wizardButtonBottom\?\.addEventListener\("click", \(\) =>[\s\S]*chooseIspButtonAndFlash\("bottom"\)/);
  assert.match(
    app,
    /usbButton\.addEventListener\("click", \(\) =>\s*\{\s*void connectUsb\(destructivePage \? \{ ispOnly: true \} : \{\}\);/,
    "the program-page Start watching action must open the ISP-only chooser directly",
  );
  assert.match(
    app,
    /wizardButtonStop\?\.addEventListener\("click", \(\) =>[\s\S]*void disconnectUsbByUser\(\)/,
  );
  assert.match(app, /state\.applicationTransitionPending = true/);
  assert.match(app, /setWizardStep\(WIZARD_STEP\.FIRMWARE\)/);
  assert.match(app, /setWizardStep\(WIZARD_STEP\.SUCCESS, \{ terminal: true \}\)/);
  assert.match(html, /iPhone.*WebUSB/is);
  assert.match(html, /B1144C_250901.*CH582M.*11×44/is);
  assert.match(html, /B1144C_260404.*KEY2.*farther from USB/is);
  assert.match(html, /B1144C_250901.*nearest USB/is);
  assert.match(html, /After compatible FOSSASIA.*FrogAlert firmware is installed/is);
  assert.match(html, /hold.*KEY2.*about 2\.2 seconds/is);
  assert.match(html, /one dot lights near the middle/i);
  assert.match(html, /4348:55e0.*1a86:55e0.*9–13 second/is);
  assert.match(html, /Original or unknown firmware.*ordinary long-press hook is not available/is);
  assert.match(html, /RESET switch did not enter ISP/i);
  assert.match(html, /hold KEY2 while momentarily bridging both ends of PCB capacitor.*C3/is);
  assert.match(html, /hazardous rail-collapse maneuver.*not routine/is);
  assert.match(html, /Leave the soldered cell and its leads alone/i);
  assert.match(html, /Download selected hardware-verified lab BIN/i);
  assert.match(html, /id="isp-guide-connect"[^>]+type="button"[^>]+hidden[^>]+disabled/);
  assert.match(`${html}\n${app}`, /Identify and Read Config/i);
  assert.ok(
    html.indexOf('id="wizard-isp-help"') < html.indexOf('class="legacy-flasher"'),
    "the ISP recovery hint must stay in the visible connection step",
  );
  assert.match(app, /ispGuideConnect\?\.addEventListener\("click", beginGuidedUsbConnection\)/);
  assert.match(app, /void connectUsb\(\{ guided: true \}\)/);
  assert.match(app, /function focusIspEntryPhaseControl\(phase\)/);
  assert.match(app, /focusIspEntryPhaseControl\(nextPhase\)/);
  assert.match(app, /\[ISP_ENTRY_PHASE\.IDENTIFIED, ISP_ENTRY_PHASE\.RETRY\]\.includes\(state\.ispEntryPhase\)/);
  assert.match(app, /focusIspEntryPhaseControl\(state\.ispEntryPhase\)/);
  assert.doesNotMatch(app, /set(?:Timeout|Interval)\([^)]*requestDevice/s);
  assert.match(flashCss, /\.flash-page \[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(flashCss, /\.wizard-home-link\s*\{[^}]*color:\s*var\(--frog-bright\)/s);
  assert.match(flashCss, /\.isp-guide-overview\s*\{\s*grid-template-columns:\s*repeat\(5,/s);
  assert.match(html, /current (?:application )?firmware.*(?:unknown|cannot|not)/is);
  assert.match(html, /PCB revision.*cannot.*detect/is);
  assert.match(html, /OEM (?:firmware|image).*(?:unavailable|cannot be backed up)/is);
  assert.match(html, /Connecting alone never writes/i);
  assert.match(html, /Only hash-bound images with physical boot and recovery evidence may appear here/i);
  assert.match(html, /public flasher accepts same-origin published images/i);
  assert.match(html, /B1144C_260404_USB_C/);
  assert.match(html, /active-low KEY1 wiring/i);
  assert.match(html, /Axon\/TASER\/Flock/);
  assert.match(html, /Custom targets/);
  assert.match(app, /patchFirmwareConfig/);
  assert.match(app, /Locally prepared configuration with a calculated SHA-256/);
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
  assert.match(combined, /RESET.*did not (?:work|enter ISP)/i);
  assert.match(combined, /both ends of PCB capacitor.*C3/is);
  assert.match(combined, /expert-only|expert bench/i);
  assert.match(combined, /260404.*farther from USB/is);
  assert.match(combined, /250901.*nearest USB/is);

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
  const bytes = await readBytes("site/og-card-v3.jpg");
  assert.deepEqual(jpegDimensions(bytes), { width: 1200, height: 630 });
  assert.ok(bytes.length > 40_000, "social card should contain rendered artwork");
  const source = await read("site/og-card.svg");
  assert.match(source, /width="1200" height="630"/);
  assert.match(source, /Bluetooth alerts on a nametag/);
  const shell = source.match(
    /<rect id="badge-shell"[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/,
  );
  const matrix = source.match(
    /<rect id="badge-matrix"[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/,
  );
  assert.ok(shell, "social card should identify the illustrated badge shell");
  assert.ok(matrix, "social card should identify the illustrated LED matrix");
  assert.ok(
    Number(shell[3]) / Number(shell[4]) >= 4,
    "illustrated badge shell should read as a long horizontal nametag",
  );
  assert.equal(
    Number(matrix[3]) / Number(matrix[4]),
    4,
    "illustrated 44×11 LED matrix should have a 4:1 aspect ratio",
  );
  assert.ok(
    Number(matrix[3]) / Number(shell[3]) >= 0.95 &&
      Number(matrix[4]) / Number(shell[4]) >= 0.95,
    "illustrated LED matrix should extend nearly to every badge edge",
  );
  assert.doesNotMatch(source, />11×44<\/text>/);
  assert.match(source, />COP DETECTED<\/text>/);
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
  assert.match(workflow, /workflow_run\.event == 'workflow_dispatch'/);
  assert.match(workflow, /workflow_run\.path == '\.github\/workflows\/ci\.yml'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /workflow_run\.head_sha/);
  assert.match(
    workflow,
    /current-main:[\s\S]*permissions:\s+contents: read[\s\S]*github\.rest\.git\.getRef/,
  );
  assert.match(workflow, /ref: "heads\/main"/);
  assert.match(workflow, /currentSha === triggeringSha/);
  assert.match(workflow, /commit\.parents\[0\]\.sha === triggeringSha/);
  assert.match(workflow, /commit\.author\?\.email === publicationBot/);
  assert.match(workflow, /commit\.committer\?\.email === publicationBot/);
  assert.match(workflow, /Resuming publication/);
  assert.match(
    workflow,
    /prepare:\s+needs: current-main\s+if: needs\.current-main\.outputs\.is_current == 'true'/,
  );
  assert.ok(
    workflow.indexOf("github.rest.git.getRef") <
      workflow.indexOf("uses: actions/checkout@v4"),
    "current main must be checked before repository code is checked out",
  );
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /attestations: read/);
  assert.match(workflow, /github\.rest\.actions\.listWorkflowRunArtifacts/);
  assert.match(workflow, /frogalert-candidate-\$\{context\.payload\.workflow_run\.head_sha\}/);
  assert.match(workflow, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /node scripts\/record-firmware-release\.mjs tmp\/firmware-candidate\/counter/);
  assert.match(workflow, /git commit -m "Publish FrogAlert \$RELEASE_VERSION"/);
  assert.match(workflow, /FROGALERT_RELEASE_PUBLISHED_AT/);
  assert.match(workflow, /workflow_run\.created_at/);
  assert.match(workflow, /current_tree=.*CURRENT_MAIN_SHA\^\{tree\}/);
  assert.match(workflow, /generated_tree=.*generated_publish_sha\^\{tree\}/);
  assert.match(workflow, /node scripts\/materialize-firmware-artifacts\.mjs tmp\/release-artifacts/);
  assert.match(workflow, /FROGALERT_RELEASE_ASSET_ROOT: tmp\/release-artifacts/);
  assert.match(workflow, /node scripts\/assemble-site\.mjs _site/);
  assert.match(workflow, /node scripts\/firmware-release-plan\.mjs tmp\/release-publication/);
  assert.match(workflow, /publishFirmwareReleaseBundle/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /current_main="\$\(git ls-remote origin refs\/heads\/main \| cut -f1\)"/);
  assert.match(workflow, /main moved from validated commit \$PUBLISH_SHA/);
  assert.match(workflow, /git push origin "\$PUBLISH_SHA:refs\/heads\/main"/);
  assert.match(workflow, /FROGALERT_PUBLISH_COMMIT: \$\{\{ needs\.prepare\.outputs\.publish_sha \}\}/);
  assert.match(workflow, /FROGALERT_RELEASE_TAG: \$\{\{ needs\.prepare\.outputs\.release_tag \}\}/);
  assert.match(workflow, /resolveTagCommit/);
  assert.match(workflow, /published release tag .* does not target/);
  assert.ok(
    workflow.indexOf("node scripts/record-firmware-release.mjs") <
      workflow.indexOf("node scripts/materialize-firmware-artifacts.mjs") &&
      workflow.indexOf("node scripts/materialize-firmware-artifacts.mjs") <
        workflow.indexOf("node scripts/assemble-site.mjs") &&
      workflow.indexOf("node scripts/assemble-site.mjs") <
        workflow.indexOf("node scripts/firmware-release-plan.mjs") &&
      workflow.indexOf("node scripts/firmware-release-plan.mjs") <
        workflow.indexOf('origin "$PUBLISH_SHA:refs/heads/main"'),
    "generated release metadata must be fully materialized and validated before its CAS push",
  );
  assert.match(workflow, /needs: publish-releases/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /find firmware\/releases/);
  assert.doesNotMatch(workflow, /build-fossasia-usbc|build-count-firmware|build-display-bringup/);
  assert.match(assembler, /refusing to publish unlisted firmware artifact/);
  assert.match(assembler, /firmware artifact does not match manifest/);
  assert.match(assembler, /assertCh58xUserOptionMagic/);
  assert.match(assembler, /manifest\.lab_images/);
  assert.match(assembler, /validateFirmwarePublicationManifest/);
  assert.match(assembler, /validatePairedUsbCReleaseCatalog/);
  assert.match(assembler, /firmware", "quarantine\.json"/);
  assert.match(assembler, /join\(repositoryRoot, "flash"\)/);
  assert.match(ci, /run: \.\/scripts\/verify/);
  assert.doesNotMatch(ci, /run:\s*\|[\s\S]*\.\/scripts\/build-display-bringup/);
  assert.doesNotMatch(ci, /run:\s*\|[\s\S]*\.\/scripts\/build-count-firmware/);
});

test("release manifest separates releases, hosted labs, and pinned open recovery", async () => {
  const manifest = JSON.parse(await read("firmware/releases/manifest.json"));
  assert.equal(manifest.schema_version, 5);
  assert.equal(manifest.github_repository, "pierce403/frogalert");
  assert.deepEqual(manifest.legacy_repository_release_tags, ["v0.1.0-beta.1"]);
  assert.ok(manifest.releases.length >= 2);
  assert.ok(
    manifest.releases.every(
      (release) =>
        typeof release.version === "string" &&
        typeof release.channel === "string" &&
        (release.hardware_verified === true ||
          (release.hardware_verified === false &&
            release.flash_approved === true &&
            release.verification_basis === "ci-audited" &&
            release.build_provenance?.kind === "github-actions-candidate")),
    ),
    "every release must be hardware-verified or an explicitly flash-approved CI-audited candidate",
  );
  assert.ok(
    manifest.releases.some(
      (release) =>
        release.hardware_verified === false &&
        release.flash_approved === true &&
        release.verification_basis === "ci-audited",
    ),
    "the generated catalog should exercise the CI-audited immediate-publication policy",
  );
  const latestVersion = manifest.releases[0].version;
  const latestProfiles = manifest.releases
    .filter((release) => release.version === latestVersion)
    .map((release) => release.hardware_revisions[0]);
  assert.deepEqual(
    new Set(latestProfiles),
    new Set(["B1144C_260404_USB_C", "B1144C_250901_USB_C"]),
  );
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
