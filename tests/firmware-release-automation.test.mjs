import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildFirmwareReleasePlan,
  writeFirmwareReleaseBundle,
} from "../scripts/firmware-release-plan.mjs";
import {
  loadFirmwareReleaseBundle,
  publishFirmwareReleaseBundle,
} from "../scripts/publish-github-releases.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const PUBLISH_COMMIT = "b".repeat(40);
const KNOWN_GOOD_SHA =
  "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function evidence(artifactSha) {
  return {
    artifact_sha256: artifactSha,
    source_commit: SOURCE_COMMIT,
    record: "firmware/evidence/2026-07-23-release-smoke.json",
    transcript: "agent-memory/logs/2026-07-23-release-smoke.md",
    tested_at: "2026-07-23",
    hardware_profile: "B1144C_250901_USB_C",
    pcb_marking: "B1144C_250901",
    cli_program_verified: true,
    cli_byte_verify_passed: true,
    webusb_program_verified: true,
    webusb_byte_verify_passed: true,
    boot_observed: true,
    power_cycle_passed: true,
    key1_behavior_passed: true,
    short_key2_behavior_passed: true,
    application_usb_id: "0416:5020",
    application_hid_enumeration_passed: true,
    application_cdc_enumeration_passed: true,
    display_passed: true,
    badgemagic_upload_passed: true,
    key2_dot_observed: true,
    key2_recovery_passed: true,
    known_good_reflash_passed: true,
    known_good_reflash_sha256: KNOWN_GOOD_SHA,
    recovery_method: "key2-only",
    recovery_usb_id: "4348:55e0",
  };
}

function evidenceTranscript(record) {
  return [
    "# Exact release image hardware smoke",
    record.tested_at,
    record.artifact_sha256,
    record.source_commit,
    record.hardware_profile,
    record.pcb_marking,
    record.application_usb_id,
    record.recovery_usb_id,
    record.known_good_reflash_sha256,
    "## CLI program and byte verification\nwchisp program completed and byte verify passed for the exact release.",
    "## WebUSB program and byte verification\nWebUSB program completed and byte verify passed in the browser.",
    `## Application USB HID and CDC\nObserved ${record.application_usb_id} with HID and CDC interfaces after reset.`,
    "## Display and BadgeMagic upload\nDisplay passed and the BadgeMagic app upload rendered normally.",
    "## KEY1 and short KEY2\nKEY1 behavior passed and a short KEY2 press remained in the application.",
    `## KEY2-only recovery\nLong KEY2 showed the dot and enumerated ${record.recovery_usb_id}.`,
    `## Known-good reflash\nKnown-good reflash ${record.known_good_reflash_sha256} completed and verify passed.`,
  ].join("\n");
}

async function makeFixture(t, { withRelease = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "frogalert-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "firmware", "releases", "notes"), { recursive: true });
  await mkdir(join(root, "firmware", "evidence"), { recursive: true });
  await mkdir(join(root, "agent-memory", "logs"), { recursive: true });

  const image = Buffer.alloc(8192);
  for (let index = 0; index < image.length; index++) image[index] = index & 0xff;
  image.writeUInt32LE(0xf5f9bda9, 0x14);
  const debugImage = Buffer.alloc(4096);
  for (let index = 0; index < debugImage.length; index++) {
    debugImage[index] = (index * 3) & 0xff;
  }
  debugImage.set([0x7f, 0x45, 0x4c, 0x46], 0);
  const artifactSha = sha256(image);
  const hardwareEvidence = evidence(artifactSha);
  const descriptor = {
    id: "frogalert-0.1.0-alpha.1-b1144c-250901-usbc",
    kind: "frogalert-release",
    label: "FrogAlert",
    version: "0.1.0-alpha.1",
    channel: "alpha",
    target: "ch582m-badgemagic-11x44",
    hardware_revisions: ["B1144C_250901_USB_C"],
    pcb_markings: ["B1144C_250901"],
    source_commit: SOURCE_COMMIT,
    file: "frogalert-0.1.0-alpha.1-ch582m.bin",
    bytes: image.byteLength,
    sha256: artifactSha,
    hardware_verified: true,
    hardware_evidence: hardwareEvidence,
    release_tag: "v0.1.0-alpha.1",
    release_url:
      "https://github.com/pierce403/frogalert/releases/tag/v0.1.0-alpha.1",
    release_notes: "firmware/releases/notes/v0.1.0-alpha.1.md",
    debug_file: "frogalert-0.1.0-alpha.1-ch582m.elf",
    debug_bytes: debugImage.byteLength,
    debug_sha256: sha256(debugImage),
  };
  const manifest = {
    schema_version: 4,
    updated: "2026-07-23",
    github_repository: "pierce403/frogalert",
    releases: withRelease ? [descriptor] : [],
    lab_images: [],
    recovery_images: [],
  };
  await writeFile(
    join(root, "firmware", "releases", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(root, "firmware", "quarantine.json"),
    `${JSON.stringify({ schema_version: 1, artifacts: [] }, null, 2)}\n`,
  );
  if (withRelease) {
    await writeFile(join(root, "firmware", "releases", descriptor.file), image);
    await writeFile(
      join(root, "firmware", "releases", descriptor.debug_file),
      debugImage,
    );
    await writeFile(
      join(root, descriptor.hardware_evidence.record),
      `${JSON.stringify({ schema_version: 1, ...hardwareEvidence }, null, 2)}\n`,
    );
    await writeFile(
      join(root, descriptor.hardware_evidence.transcript),
      evidenceTranscript(hardwareEvidence),
    );
    await writeFile(
      join(root, descriptor.release_notes),
      "# FrogAlert 0.1.0 alpha 1\n\nFirst physically verified release fixture for automation tests.\n",
    );
  }
  return { root, descriptor, image };
}

test("empty approved catalog creates an empty release plan", async (t) => {
  const { root } = await makeFixture(t, { withRelease: false });
  const plan = await buildFirmwareReleasePlan({
    repositoryRoot: root,
    repository: "pierce403/frogalert",
    publishCommit: PUBLISH_COMMIT,
  });
  assert.deepEqual(plan.releases, []);
});

test("release plan contains exact verified assets and mandatory safety notes", async (t) => {
  const { root, descriptor } = await makeFixture(t);
  const checkedCommits = [];
  const plan = await buildFirmwareReleasePlan({
    repositoryRoot: root,
    repository: "pierce403/frogalert",
    publishCommit: PUBLISH_COMMIT,
    assertSourceCommit: (_root, source, publish) => {
      checkedCommits.push([source, publish]);
      return true;
    },
  });
  assert.deepEqual(checkedCommits, [[SOURCE_COMMIT, PUBLISH_COMMIT]]);
  assert.equal(plan.releases.length, 1);
  const [release] = plan.releases;
  assert.equal(release.tag, descriptor.release_tag);
  assert.equal(release.prerelease, true);
  assert.match(release.body, /OEM image cannot be backed up or restored/);
  assert.match(release.body, new RegExp(descriptor.sha256));
  assert.deepEqual(
    release.assets.map(({ name }) => name),
    [
      descriptor.file,
      descriptor.debug_file,
      `${descriptor.file}.sha256`,
      `${descriptor.id}.json`,
      `${descriptor.id}.evidence.json`,
    ],
  );

  const bundleRoot = join(root, "bundle");
  await writeFirmwareReleaseBundle(plan, bundleRoot);
  const loaded = await loadFirmwareReleaseBundle(bundleRoot);
  assert.equal(loaded.releases[0].assets[0].sha256, descriptor.sha256);
});

test("release planning rejects changed bytes before publication", async (t) => {
  const { root, descriptor, image } = await makeFixture(t);
  image[100] ^= 0xff;
  await writeFile(join(root, "firmware", "releases", descriptor.file), image);
  await assert.rejects(
    buildFirmwareReleasePlan({
      repositoryRoot: root,
      repository: "pierce403/frogalert",
      publishCommit: PUBLISH_COMMIT,
    }),
    /does not match its descriptor/,
  );
});

class FakeGithub {
  constructor() {
    this.releases = [];
    this.assets = new Map();
    this.nextReleaseId = 1;
    this.nextAssetId = 100;
    this.uploadCount = 0;
    this.rest = {
      repos: {
        getReleaseByTag: async ({ tag }) => {
          const release = this.releases.find(
            (candidate) => candidate.tag_name === tag && !candidate.draft,
          );
          if (!release) throw Object.assign(new Error("not found"), { status: 404 });
          return { data: release };
        },
        listReleases: async () => ({ data: this.releases }),
        createRelease: async (input) => {
          const release = {
            id: this.nextReleaseId++,
            tag_name: input.tag_name,
            target_commitish: input.target_commitish,
            name: input.name,
            body: input.body,
            draft: input.draft,
            prerelease: input.prerelease,
          };
          this.releases.push(release);
          this.assets.set(release.id, []);
          return { data: release };
        },
        listReleaseAssets: async ({ release_id }) => ({
          data: this.assets.get(release_id) || [],
        }),
        uploadReleaseAsset: async ({ release_id, name, data }) => {
          this.uploadCount++;
          const content = Buffer.from(data);
          const asset = {
            id: this.nextAssetId++,
            name,
            size: content.byteLength,
            content,
          };
          this.assets.get(release_id).push(asset);
          return { data: asset };
        },
        updateRelease: async ({ release_id, ...changes }) => {
          const release = this.releases.find((candidate) => candidate.id === release_id);
          Object.assign(release, {
            tag_name: changes.tag_name,
            target_commitish: changes.target_commitish,
            name: changes.name,
            body: changes.body,
            draft: changes.draft,
            prerelease: changes.prerelease,
          });
          return { data: release };
        },
      },
    };
  }

  async paginate(method, args) {
    return (await method(args)).data;
  }

  async request(_route, { asset_id }) {
    for (const assets of this.assets.values()) {
      const asset = assets.find((candidate) => candidate.id === asset_id);
      if (asset) return { data: asset.content };
    }
    throw Object.assign(new Error("asset not found"), { status: 404 });
  }
}

test("publisher drafts, verifies, publishes, and then treats matching releases as immutable", async (t) => {
  const { root } = await makeFixture(t);
  const plan = await buildFirmwareReleasePlan({
    repositoryRoot: root,
    repository: "pierce403/frogalert",
    publishCommit: PUBLISH_COMMIT,
  });
  const bundleRoot = join(root, "bundle");
  await writeFirmwareReleaseBundle(plan, bundleRoot);

  const github = new FakeGithub();
  assert.equal(
    await publishFirmwareReleaseBundle({
      github,
      owner: "pierce403",
      repo: "frogalert",
      bundleRoot,
      targetCommitish: PUBLISH_COMMIT,
    }),
    1,
  );
  assert.equal(github.releases[0].draft, false);
  assert.equal(github.uploadCount, 5);

  await publishFirmwareReleaseBundle({
    github,
    owner: "pierce403",
    repo: "frogalert",
    bundleRoot,
    targetCommitish: PUBLISH_COMMIT,
  });
  assert.equal(github.uploadCount, 5, "matching published assets must not be uploaded again");

  github.assets.get(github.releases[0].id)[0].content[100] ^= 0xff;
  await assert.rejects(
    publishFirmwareReleaseBundle({
      github,
      owner: "pierce403",
      repo: "frogalert",
      bundleRoot,
      targetCommitish: PUBLISH_COMMIT,
    }),
    /asset hash differs/,
  );
});
