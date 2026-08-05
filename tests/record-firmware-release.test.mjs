import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recordFirmwareRelease } from "../scripts/record-firmware-release.mjs";
import { validateFirmwarePublicationManifest } from "../scripts/firmware-publication.mjs";

const REPOSITORY = "pierce403/frogalert";
const SOURCE_COMMIT = "a".repeat(40);
const WORKFLOW_RUN_ID = 123456789;
const WORKFLOW_RUN_ATTEMPT = 1;
const ARTIFACT_ID = 987654321;
const ARTIFACT_DIGEST = `sha256:${"d".repeat(64)}`;
const VERSION = "0.2.0-beta.2";
const PROFILES = [
  ["B1144C_260404_USB_C", "B1144C_260404", "top"],
  ["B1144C_250901_USB_C", "B1144C_250901", "bottom"],
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function firmwareBytes(fill) {
  const bytes = Buffer.alloc(8192, fill);
  bytes.writeUInt32LE(0xf5f9bda9, 0x14);
  return bytes;
}

function elfBytes(fill) {
  const bytes = Buffer.alloc(4096, fill);
  bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
  return bytes;
}

async function writeCandidate(root, {
  sourceCommit = SOURCE_COMMIT,
  runId = WORKFLOW_RUN_ID,
  runAttempt = WORKFLOW_RUN_ATTEMPT,
  version = VERSION,
  firmwareFill = 0x51,
} = {}) {
  const candidateRoot = join(root, "candidate", "counter");
  await mkdir(candidateRoot, { recursive: true });
  const artifacts = {};
  for (const [index, [profile, marking, position]] of PROFILES.entries()) {
    const bin = firmwareBytes(firmwareFill + index);
    const elf = elfBytes(0x31 + index);
    const profileStem = profile.toLowerCase().replaceAll("_", "-");
    const stem =
      `frogalert-${version}-candidate-${sourceCommit.slice(0, 12)}-${position}-${profileStem}`;
    const binName = `${stem}.bin`;
    const elfName = `${stem}.elf`;
    await writeFile(join(candidateRoot, binName), bin);
    await writeFile(join(candidateRoot, elfName), elf);
    artifacts[profile] = {
      hardware_profile: profile,
      pcb_marking: marking,
      firmware: {
        file: binName,
        bytes: bin.byteLength,
        sha256: sha256(bin),
      },
      debug_elf: {
        file: elfName,
        bytes: elf.byteLength,
        sha256: sha256(elf),
      },
    };
  }
  const metadata = {
    schema_version: 3,
    kind: "frogalert-candidate",
    version,
    source_commit: sourceCommit,
    github_repository: REPOSITORY,
    provenance: {
      provider: "github-actions",
      repository: REPOSITORY,
      run_id: String(runId),
      workflow: `${REPOSITORY}/.github/workflows/ci.yml@refs/heads/main`,
      job: "firmware-candidate",
      run_attempt: String(runAttempt),
    },
    build_lane: "survey",
    hardware_verified: false,
    flash_approved: false,
    publishable: false,
    hosted_on_site: false,
    artifacts,
  };
  await writeFile(
    join(candidateRoot, "candidate.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return { candidateRoot, metadata };
}

async function makeFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "frogalert-record-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "firmware", "releases", "notes"), {
    recursive: true,
  });
  await mkdir(join(root, "firmware", "fossasia-usbc"), {
    recursive: true,
  });
  await writeFile(
    join(root, "firmware", "fossasia-usbc", "version.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        version: VERSION,
        display_version: "v0.2.0b2",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "firmware", "releases", "manifest.json"),
    `${JSON.stringify(
      {
        schema_version: 5,
        updated: "2026-07-29",
        github_repository: REPOSITORY,
        legacy_repository_release_tags: [],
        releases: [],
        lab_images: [],
        recovery_images: [],
      },
      null,
      2,
    )}\n`,
  );
  const candidate = await writeCandidate(root);
  return { root, ...candidate };
}

function recordOptions(root, candidateRoot, overrides = {}) {
  const sourceCommit = overrides.sourceCommit || SOURCE_COMMIT;
  return {
    repositoryRoot: root,
    candidateRoot,
    repository: REPOSITORY,
    sourceCommit,
    workflowRunId: overrides.workflowRunId || WORKFLOW_RUN_ID,
    workflowRunAttempt:
      overrides.workflowRunAttempt || WORKFLOW_RUN_ATTEMPT,
    artifactId: overrides.artifactId || ARTIFACT_ID,
    artifactName:
      overrides.artifactName || `frogalert-candidate-${sourceCommit}`,
    artifactDigest: overrides.artifactDigest || ARTIFACT_DIGEST,
    publishedAt: overrides.publishedAt || "2026-08-03",
  };
}

test("records one atomic CI-audited counter release pair", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  const result = await recordFirmwareRelease(recordOptions(root, candidateRoot));
  assert.equal(result.changed, true);
  assert.equal(result.version, VERSION);
  assert.equal(result.releaseTag, `v${VERSION}`);

  const manifest = JSON.parse(
    await readFile(join(root, "firmware/releases/manifest.json"), "utf8"),
  );
  assert.equal(manifest.updated, "2026-08-03");
  assert.equal(manifest.releases.length, 2);
  assert.equal(
    validateFirmwarePublicationManifest(manifest, {
      schema_version: 1,
      artifacts: [],
    }),
    true,
  );
  assert.deepEqual(
    new Set(manifest.releases.map((release) => release.hardware_revisions[0])),
    new Set(PROFILES.map(([profile]) => profile)),
  );
  const metadataBytes = await readFile(join(candidateRoot, "candidate.json"));
  for (const release of manifest.releases) {
    assert.equal(release.version, VERSION);
    assert.equal(release.hardware_verified, false);
    assert.equal(release.verification_basis, "ci-audited");
    assert.equal(release.flash_approved, true);
    assert.equal(release.firmware_variant, "counter");
    assert.equal(release.source_commit, SOURCE_COMMIT);
    assert.doesNotMatch(release.file, /candidate|[a-f0-9]{12}/);
    assert.doesNotMatch(release.debug_file, /candidate|[a-f0-9]{12}/);
    assert.deepEqual(release.build_provenance, {
      kind: "github-actions-candidate",
      workflow_run_id: WORKFLOW_RUN_ID,
      workflow_path: ".github/workflows/ci.yml",
      workflow_run_attempt: WORKFLOW_RUN_ATTEMPT,
      artifact_id: ARTIFACT_ID,
      artifact_name: `frogalert-candidate-${SOURCE_COMMIT}`,
      artifact_digest: ARTIFACT_DIGEST,
      candidate_metadata_sha256: sha256(metadataBytes),
      build_lane: "survey",
    });
  }
  const top = manifest.releases.find(
    (release) => release.hardware_revisions[0] === PROFILES[0][0],
  );
  const bottom = manifest.releases.find(
    (release) => release.hardware_revisions[0] === PROFILES[1][0],
  );
  assert.equal(
    top.file,
    `frogalert-${VERSION}-top-b1144c-260404-usb-c.bin`,
  );
  assert.equal(
    bottom.file,
    `frogalert-${VERSION}-bottom-b1144c-250901-usb-c.bin`,
  );
  const notes = await readFile(join(root, result.notesPath), "utf8");
  assert.match(notes, new RegExp(VERSION.replaceAll(".", "\\.")));
  assert.match(notes, /CI-audited release/);
  assert.match(notes, /phone/);
});

test("an exact rerun leaves manifest and existing notes byte-identical", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  const options = recordOptions(root, candidateRoot);
  await recordFirmwareRelease(options);
  const manifestPath = join(root, "firmware/releases/manifest.json");
  const notesPath = join(root, `firmware/releases/notes/v${VERSION}.md`);
  await writeFile(notesPath, "# Hand-authored notes\n\nKeep this exact copy.\n");
  const beforeManifest = await readFile(manifestPath);
  const beforeNotes = await readFile(notesPath);

  const rerun = await recordFirmwareRelease({
    ...options,
    publishedAt: "2026-08-04",
  });
  assert.equal(rerun.changed, false);
  assert.deepEqual(await readFile(manifestPath), beforeManifest);
  assert.deepEqual(await readFile(notesPath), beforeNotes);
});

test("a successful later run attempt retains the artifact-producing attempt", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  await recordFirmwareRelease(
    recordOptions(root, candidateRoot, { workflowRunAttempt: 2 }),
  );
  const manifest = JSON.parse(
    await readFile(join(root, "firmware/releases/manifest.json"), "utf8"),
  );
  for (const release of manifest.releases) {
    assert.equal(release.build_provenance.workflow_run_attempt, 1);
  }
});

test("a candidate cannot claim an attempt newer than the triggering run", async (t) => {
  const { root } = await makeFixture(t);
  const candidate = await writeCandidate(root, { runAttempt: 2 });
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, candidate.candidateRoot)),
    /not bound to the triggering CI run/,
  );
});

test("the same version cannot be rebound to different source or bytes", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  await recordFirmwareRelease(recordOptions(root, candidateRoot));

  const changedBytes = await writeCandidate(root, { firmwareFill: 0x61 });
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, changedBytes.candidateRoot)),
    /already exists with different bytes, source, or provenance/,
  );

  const changedCommit = "b".repeat(40);
  const changed = await writeCandidate(root, {
    sourceCommit: changedCommit,
    firmwareFill: 0x51,
  });
  await assert.rejects(
    recordFirmwareRelease(
      recordOptions(root, changed.candidateRoot, {
        sourceCommit: changedCommit,
        artifactName: `frogalert-candidate-${changedCommit}`,
      }),
    ),
    /already exists with different bytes, source, or provenance/,
  );
});

test("candidate files must match the audited candidate metadata", async (t) => {
  const { root, candidateRoot, metadata } = await makeFixture(t);
  const first = metadata.artifacts[PROFILES[0][0]].firmware.file;
  await writeFile(join(candidateRoot, first), firmwareBytes(0x77));
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, candidateRoot)),
    /differs from candidate metadata/,
  );
});

test("candidate version must match the version declared by the source tree", async (t) => {
  const { root } = await makeFixture(t);
  const changed = await writeCandidate(root, { version: "0.2.0-beta.3" });
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, changed.candidateRoot)),
    /does not match source version/,
  );
});

test("candidate workflow provenance must name canonical main CI exactly", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  const metadataPath = join(candidateRoot, "candidate.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.provenance.workflow =
    `${REPOSITORY}/.github/workflows/ci.yml@refs/heads/main-with-suffix`;
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, candidateRoot)),
    /not bound to the triggering CI run/,
  );
});

test("automatic release refuses a partial profile pair", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  const metadataPath = join(candidateRoot, "candidate.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  delete metadata.artifacts.B1144C_250901_USB_C;
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, candidateRoot)),
    /missing B1144C_250901_USB_C/,
  );
});

test("automatic release never promotes the dancing-frog lane", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  const metadataPath = join(candidateRoot, "candidate.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.build_lane = "frogs";
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, candidateRoot)),
    /not a publishable CI receipt/,
  );
});

test("automatic release version must be newer than every existing release", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  const manifestPath = join(root, "firmware", "releases", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.releases.push({ version: "0.3.0-beta.1" });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(
    recordFirmwareRelease(recordOptions(root, candidateRoot)),
    /must advance beyond existing 0\.3\.0-beta\.1/,
  );
});
