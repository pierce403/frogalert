import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readlink } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readBytes = (path) => readFile(new URL(path, root));

test("landing page exposes the project and guarded device flow", async () => {
  const html = await read("index.html");
  for (const required of [
    "FrogAlert",
    "id=\"flash-lab\"",
    "id=\"bluetooth-connect\"",
    "id=\"usb-connect\"",
    "id=\"firmware-file\"",
    "id=\"pcb-marking\"",
    "id=\"pcb-revision\"",
    "id=\"recovery-prepare\"",
    "id=\"recovery-board-confirmation\"",
    "id=\"flash-button\"",
    "class=\"flash-confirmation\"",
    "site/app.js",
    "site/styles.css",
  ]) {
    assert.ok(html.includes(required), `index.html should include ${required}`);
  }
  assert.match(html, /OEM (?:firmware|image) is unavailable and unrecoverable/i);
  assert.match(html, /Web Bluetooth cannot install firmware/i);
  assert.match(html, /id="bluetooth-connect"[^>]+disabled/);
  assert.match(html, /id="usb-connect"[^>]+disabled/);
  assert.match(html, /resets CH58x protection\/configuration/i);
  assert.match(html, /Install open BadgeMagic firmware/);
  assert.match(html, /Prepare open BadgeMagic firmware/);
  assert.match(html, /PROTOTYPE \/ BADGE/);
  assert.match(html, /BLE count lab build/);
  assert.match(html, /OEM image is unavailable and unrecoverable/i);
  assert.match(html, /does not connect, reset configuration, erase, or write/i);
  assert.match(html, /Programming is not enabled for this bundled image/i);
  assert.match(html, /developer BIN chooser below remains the explicit experimental path/i);
  assert.match(html, /compar(?:e|ed) both sides.*reference photos/i);
  assert.match(html, /USB identification only proves the MCU family/i);
  assert.doesNotMatch(html, /factory reset/i);
  assert.match(html, /id="recovery-prepare"[^>]+disabled/);
});

test("Pages deploy waits for successful CI and publishes only manifest-listed artifacts", async () => {
  const workflow = await read(".github/workflows/pages.yml");
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
});

test("release manifest separates unreleased FrogAlert builds from pinned open recovery", async () => {
  const manifest = JSON.parse(await read("firmware/releases/manifest.json"));
  assert.equal(manifest.schema_version, 2);
  assert.deepEqual(manifest.releases, []);
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
