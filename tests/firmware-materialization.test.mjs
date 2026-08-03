import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  githubAttestationArguments,
  materializeFirmwareArtifacts,
  validateGithubActionsRun,
} from "../scripts/materialize-firmware-artifacts.mjs";

const PROFILE = "B1144C_260404_USB_C";
const SOURCE_COMMIT = "a".repeat(40);
const TEST_ROOT = fileURLToPath(new URL("../tmp/", import.meta.url));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeFixture(t) {
  await mkdir(TEST_ROOT, { recursive: true });
  const root = await mkdtemp(join(TEST_ROOT, "materialize-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of [
    "firmware/releases",
    "firmware/evidence",
    "agent-memory/logs",
    "tmp/download-source/counter",
  ]) {
    await mkdir(join(root, directory), { recursive: true });
  }

  const bin = Buffer.alloc(8192, 0x5a);
  bin.writeUInt32LE(0xf5f9bda9, 0x14);
  const elf = Buffer.alloc(4096, 0x2a);
  elf.set([0x7f, 0x45, 0x4c, 0x46], 0);
  const binName = "frogalert-0.2.0-beta.1-top-b1144c-260404-usb-c.bin";
  const elfName = "frogalert-0.2.0-beta.1-top-b1144c-260404-usb-c.elf";
  const candidate = {
    schema_version: 3,
    kind: "frogalert-candidate",
    version: "0.2.0-beta.1",
    source_commit: SOURCE_COMMIT,
    github_repository: "pierce403/frogalert",
    provenance: {
      provider: "github-actions",
      repository: "pierce403/frogalert",
      run_id: "123",
      run_attempt: "1",
      workflow:
        "pierce403/frogalert/.github/workflows/ci.yml@refs/heads/main",
    },
    build_lane: "survey",
    hardware_verified: false,
    flash_approved: false,
    publishable: false,
    hosted_on_site: false,
    artifacts: {
      [PROFILE]: {
        hardware_profile: PROFILE,
        pcb_marking: "B1144C_260404",
        firmware: { file: binName, bytes: bin.byteLength, sha256: sha256(bin) },
        debug_elf: { file: elfName, bytes: elf.byteLength, sha256: sha256(elf) },
      },
    },
  };
  const candidateBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`);
  const candidateRoot = join(root, "tmp", "download-source", "counter");
  await writeFile(join(candidateRoot, "candidate.json"), candidateBytes);
  await writeFile(join(candidateRoot, binName), bin);
  await writeFile(join(candidateRoot, elfName), elf);

  const evidence = {
    artifact_sha256: sha256(bin),
    source_commit: SOURCE_COMMIT,
    record: "firmware/evidence/release.json",
    transcript: "agent-memory/logs/release.md",
    tested_at: "2026-08-03",
    hardware_profile: PROFILE,
    pcb_marking: "B1144C_260404",
    verification_basis: "user-confirmed-beta",
    user_confirmed_working: true,
    boot_observed: true,
    display_passed: true,
    badgemagic_upload_passed: true,
    button_behavior_passed: true,
    key2_dot_observed: true,
    key2_recovery_passed: true,
    transport_transcript_captured: false,
  };
  const provenance = {
    kind: "github-actions-candidate",
    workflow_run_id: 123,
    workflow_path: ".github/workflows/ci.yml",
    workflow_run_attempt: 1,
    artifact_id: 456,
    artifact_name: `frogalert-candidate-${SOURCE_COMMIT}`,
    artifact_digest: `sha256:${"d".repeat(64)}`,
    candidate_metadata_sha256: sha256(candidateBytes),
    build_lane: "survey",
  };
  const descriptor = {
    id: "frogalert-0.2.0-beta.1-b1144c-260404-usbc",
    kind: "frogalert-release",
    label: "FrogAlert",
    version: "0.2.0-beta.1",
    channel: "beta",
    release_tag: "v0.2.0-beta.1",
    release_url: "https://github.com/pierce403/frogalert/releases/tag/v0.2.0-beta.1",
    release_notes: "firmware/releases/notes/v0.2.0-beta.1.md",
    published_at: "2026-08-03",
    firmware_variant: "counter",
    target: "ch582m-badgemagic-11x44",
    hardware_revisions: [PROFILE],
    pcb_markings: ["B1144C_260404"],
    source_commit: SOURCE_COMMIT,
    file: binName,
    bytes: bin.byteLength,
    sha256: sha256(bin),
    debug_file: elfName,
    debug_bytes: elf.byteLength,
    debug_sha256: sha256(elf),
    hardware_verified: true,
    hardware_evidence: evidence,
    build_provenance: provenance,
  };
  const manifest = {
    schema_version: 5,
    updated: "2026-08-03",
    github_repository: "pierce403/frogalert",
    legacy_repository_release_tags: [],
    releases: [descriptor],
    lab_images: [],
    recovery_images: [],
  };
  await writeFile(
    join(root, "firmware/releases/manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    join(root, "firmware/quarantine.json"),
    `${JSON.stringify({ schema_version: 1, artifacts: [] })}\n`,
  );
  const { record: _record, ...recordFields } = evidence;
  await writeFile(
    join(root, evidence.record),
    `${JSON.stringify({ schema_version: 2, ...recordFields }, null, 2)}\n`,
  );
  await writeFile(
    join(root, evidence.transcript),
    [
      evidence.tested_at,
      evidence.artifact_sha256,
      evidence.source_commit,
      evidence.hardware_profile,
      evidence.pcb_marking,
      "## User hardware confirmation\nThe user confirmed this exact image is working.",
      "## Runtime and display\nNormal boot, Bluetooth count, and display output worked.",
      "## BadgeMagic compatibility\nBadgeMagic upload compatibility was confirmed.",
      "## Buttons and recovery\nButton behavior and the KEY2 dot recovery path worked.",
      "## Uncaptured transport evidence\nCLI and WebUSB program logs were not captured.",
    ].join("\n"),
  );
  return {
    root,
    candidateRoot: join(root, "tmp", "download-source"),
    descriptor,
    bin,
    candidate,
    manifest,
  };
}

test("approved release bytes can be materialized from one exact Actions candidate", async (t) => {
  const { root, candidateRoot, descriptor, bin } = await makeFixture(t);
  let downloads = 0;
  const attested = [];
  const result = await materializeFirmwareArtifacts({
    repositoryRoot: root,
    outputRoot: join(root, "tmp", "release-artifacts"),
    fetchCandidate: async () => {
      downloads += 1;
      return candidateRoot;
    },
    verifyAttestations: async ({ files }) => attested.push(...files),
  });
  assert.equal(downloads, 1);
  assert.equal(attested.length, 2);
  assert.deepEqual(await readFile(join(result.outputRoot, descriptor.file)), bin);
});

test("materialization fails closed when candidate metadata is not the approved receipt", async (t) => {
  const { root, candidateRoot } = await makeFixture(t);
  await writeFile(join(candidateRoot, "counter", "candidate.json"), "{}\n");
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => candidateRoot,
      verifyAttestations: async () => {},
    }),
    /candidate metadata differs/,
  );
});

test("future releases reject transitional candidate metadata", async (t) => {
  const { root, candidateRoot, candidate, manifest } = await makeFixture(t);
  candidate.schema_version = 2;
  const candidateBytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`);
  await writeFile(join(candidateRoot, "counter", "candidate.json"), candidateBytes);
  manifest.releases[0].build_provenance.candidate_metadata_sha256 =
    sha256(candidateBytes);
  await writeFile(
    join(root, "firmware/releases/manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await assert.rejects(
    materializeFirmwareArtifacts({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "release-artifacts"),
      fetchCandidate: async () => candidateRoot,
      verifyAttestations: async () => {},
    }),
    /candidate metadata does not match/,
  );
});

test("only a successful canonical main CI run may supply release bytes", () => {
  const repository = "pierce403/frogalert";
  const provenance = {
    workflow_run_id: 123,
    workflow_path: ".github/workflows/ci.yml",
    workflow_run_attempt: 1,
  };
  const run = {
    id: 123,
    path: ".github/workflows/ci.yml",
    run_attempt: 1,
    event: "push",
    head_branch: "main",
    head_sha: SOURCE_COMMIT,
    head_repository: { full_name: repository },
    repository: { full_name: repository },
    status: "completed",
    conclusion: "success",
  };
  assert.equal(
    validateGithubActionsRun(run, {
      repository,
      provenance,
      sourceCommit: SOURCE_COMMIT,
    }),
    true,
  );
  for (const override of [
    { event: "pull_request" },
    { head_branch: "feature" },
    { head_sha: "b".repeat(40) },
    { conclusion: "failure" },
    { run_attempt: 2 },
  ]) {
    assert.throws(
      () =>
        validateGithubActionsRun(
          { ...run, ...override },
          { repository, provenance, sourceCommit: SOURCE_COMMIT },
        ),
      /successful canonical main CI build/,
    );
  }
});

test("attestation verification is bound to main, source commit, and CI workflow", () => {
  assert.deepEqual(
    githubAttestationArguments({
      repository: "pierce403/frogalert",
      provenance: { workflow_path: ".github/workflows/ci.yml" },
      sourceCommit: SOURCE_COMMIT,
      file: "/tmp/frogalert.bin",
    }),
    [
      "attestation",
      "verify",
      "/tmp/frogalert.bin",
      "--repo",
      "pierce403/frogalert",
      "--signer-workflow",
      "pierce403/frogalert/.github/workflows/ci.yml",
      "--source-digest",
      SOURCE_COMMIT,
      "--source-ref",
      "refs/heads/main",
      "--deny-self-hosted-runners",
    ],
  );
});
