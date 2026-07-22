import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readlink } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readBytes = (path) => readFile(new URL(path, root));

test("landing page exposes the project and guarded device flow", async () => {
  const html = await read("index.html");
  const app = await read("site/app.js");
  for (const required of [
    "FrogAlert",
    "id=\"flash-lab\"",
    "id=\"bluetooth-connect\"",
    "id=\"usb-connect\"",
    "id=\"firmware-file\"",
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
  assert.match(html, /Web Bluetooth cannot install firmware/i);
  assert.match(html, /id="bluetooth-connect"[^>]+disabled/);
  assert.match(html, /id="usb-connect"[^>]+disabled/);
  assert.match(html, /Install open BadgeMagic firmware/);
  assert.match(html, /Prepare open BadgeMagic firmware/);
  assert.match(html, /PROTOTYPE \/ BADGE/);
  assert.match(html, /BLE count lab build/);
  assert.match(html, /OEM image is unavailable and unrecoverable/i);
  assert.match(html, /does not connect, reset configuration, erase, or write/i);
  assert.match(html, /Programming is not enabled for this bundled image/i);
  assert.match(html, /developer BIN chooser below remains an inspection path/i);
  assert.match(html, /All destructive work is restricted to the dedicated guided flow/i);
  assert.match(html, /Hosted experimental build/i);
  assert.match(html, /Download selected lab BIN for qualified local testing/i);
  assert.match(html, /compar(?:e|ed) both sides.*reference photos/i);
  assert.match(html, /USB identification only proves the MCU family/i);
  assert.doesNotMatch(html, /factory reset/i);
  assert.match(html, /id="recovery-prepare"[^>]+disabled/);
  assert.match(html, /data-flash-mode="inspect"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /name="referrer"/);
  assert.doesNotMatch(html, /id="flash-button"/);
  assert.doesNotMatch(html, /class="flash-confirmation"/);
  assert.match(app, /const destructivePage = document\.body\.dataset\.flashMode === "program"/);
  assert.match(app, /artifactKind: "frogalert-lab"/);
  assert.match(app, /physicalMarkingMatchesArtifact\(\)/);
  assert.match(app, /return destructivePage && elements\.flashPhrase\?\.value\.trim\(\) === "ERASE THIS BADGE"/);
  assert.match(app, /if \(destructivePage && elements\.flashButton\)/);
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
  assert.match(html, /iPhone.*WebUSB/is);
  assert.match(html, /Disconnect the battery.*KEY2.*Connect.*USB/is);
  assert.match(html, /No multi-button combo/i);
  assert.match(html, /KEY2[^<]*(?:physical )?button nearest the USB connector/i);
  assert.match(html, /Disconnect the battery.*Unplug USB/is);
  assert.match(html, /holding KEY2.*while connecting.*data-capable USB/is);
  assert.match(html, /one illuminated pixel.*release KEY2/is);
  assert.match(html, /approximately ten seconds/i);
  assert.match(html, /Download selected lab BIN for qualified local testing/i);
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
  assert.match(html, /No erase or write on connect/i);
  assert.match(html, /Unverified hosted images.*inspection.*cannot arm programming/i);
  assert.doesNotMatch(html, /factory reset/i);
  assert.match(html, /data-flash-mode="program"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /name="referrer"/);
});

test("Pages deploy waits for successful CI and publishes only manifest-listed artifacts", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  const ci = await read(".github/workflows/ci.yml");
  const assembler = await read("scripts/assemble-site.mjs");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[CI\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_sha/);
  assert.match(workflow, /node scripts\/assemble-site\.mjs _site/);
  assert.doesNotMatch(workflow, /find firmware\/releases/);
  assert.match(assembler, /refusing to publish unlisted firmware artifact/);
  assert.match(assembler, /firmware artifact does not match manifest/);
  assert.match(assembler, /assertCh58xUserOptionMagic/);
  assert.match(assembler, /manifest\.lab_images/);
  assert.match(assembler, /join\(repositoryRoot, "flash"\)/);
  assert.match(ci, /node scripts\/assemble-site\.mjs tmp\/site-build/);
});

test("release manifest separates releases, hosted labs, and pinned open recovery", async () => {
  const manifest = JSON.parse(await read("firmware/releases/manifest.json"));
  assert.equal(manifest.schema_version, 3);
  assert.deepEqual(manifest.releases, []);
  assert.deepEqual(manifest.lab_images, []);
  await assert.rejects(
    readBytes("firmware/releases/frogalert-pixel-walk-b1144c-250901-usbc-f794974.bin"),
    /ENOENT/,
    "the failed hardware-smoke image must not remain publishable",
  );

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
  for (const status of ["SHIPPED", "PROTOTYPE", "PLANNED", "BLOCKED", "DEFERRED", "REJECTED"]) {
    assert.ok(features.includes(`**${status}**`), `FEATURES.md should define ${status}`);
  }
  assert.match(features, /Stable browser flashing.*BLOCKED/s);
});
