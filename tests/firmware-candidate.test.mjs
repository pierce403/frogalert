import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildFirmwareCandidateBundle,
  firmwareCandidateSummary,
  firmwareCandidateVersion,
  githubActionsProvenanceFromEnvironment,
  validateGitHubActionsProvenance,
} from "../scripts/firmware-candidate.mjs";

const SOURCE_COMMIT = "1234567890abcdef1234567890abcdef12345678";
const FIRMWARE_VERSION = "0.2.0-beta.1";
const DISPLAY_VERSION = "v0.2.0b1";
const TEST_SCRATCH_ROOT = fileURLToPath(new URL("../tmp/", import.meta.url));
const PROFILES = [
  "B1144C_260404_USB_C",
  "B1144C_250901_USB_C",
];
const GITHUB_ACTIONS_PROVENANCE = Object.freeze({
  repository: "pierce403/frogalert",
  run_id: "30726276951",
  workflow:
    "pierce403/frogalert/.github/workflows/ci.yml@refs/heads/main",
  job: "firmware-candidate",
  run_attempt: "2",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeFixture(t) {
  await mkdir(TEST_SCRATCH_ROOT, { recursive: true });
  const root = await mkdtemp(join(TEST_SCRATCH_ROOT, "firmware-candidate-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockRoot = join(root, "firmware", "fossasia-usbc");
  await mkdir(lockRoot, { recursive: true });
  await writeFile(
    join(lockRoot, "version.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        version: FIRMWARE_VERSION,
        display_version: DISPLAY_VERSION,
      },
      null,
      2,
    )}\n`,
  );

  const fixtures = {};
  for (const [profileIndex, profile] of PROFILES.entries()) {
    const bin = Buffer.alloc(8192);
    for (let index = 0; index < bin.length; index++) {
      bin[index] = (index + profileIndex) & 0xff;
    }
    bin.writeUInt32LE(0xf5f9bda9, 0x14);
    const elf = Buffer.alloc(4096);
    for (let index = 0; index < elf.length; index++) {
      elf[index] = (index * 7 + profileIndex) & 0xff;
    }
    elf.set([0x7f, 0x45, 0x4c, 0x46], 0);
    fixtures[profile] = { bin, elf, buildRoots: {} };
    for (const lane of ["survey", "frogs"]) {
      const buildRoot = join(
        root,
        "tmp",
        "fossasia-usbc",
        "build",
        profile,
        lane,
      );
      await mkdir(buildRoot, { recursive: true });
      await writeFile(join(buildRoot, "badgemagic-ch582.bin"), bin);
      await writeFile(join(buildRoot, "badgemagic-ch582.elf"), elf);
      await writeFile(join(buildRoot, "badgemagic-ch582.from-elf.bin"), bin);
      await writeFile(join(buildRoot, "rust-toolchain.txt"),
        `rustc 1.98.1 (test fixture)\ncommit-hash: ${"a".repeat(40)}\nrelease: 1.98.1\n`);
      await writeFile(join(buildRoot, "libfrogalert_ffi.a"), "test Rust library");
      fixtures[profile].buildRoots[lane] = buildRoot;
    }
  }

  const lock = {
    schema_version: 2,
    default_profile: PROFILES[0],
    hardware_status: "build-evidence-only",
    profiles: Object.fromEntries(
      PROFILES.map((profile) => [
        profile,
        { pcb_marking: profile.replace("_USB_C", "") },
      ]),
    ),
    upstream: {
      commit: "9ce885d682b5c56c3ac7595c09e009a210885221",
      archive_sha256: "a".repeat(64),
    },
    toolchain: {
      name: "MRS_Toolchain_Linux_x64_V1.92",
      archive_sha256: "b".repeat(64),
      compiler_sha256: "c".repeat(64),
    },
    build: {
      usbc_version: 1,
      // These intentionally stale moving-output locks prove that candidate
      // packaging records the audited build output instead of requiring a
      // locally precomputed survey/frogs hash.
      profile_images: Object.fromEntries(
        PROFILES.map((profile) => [
          profile,
          {
            survey: {
              size: 1,
              sha256: "d".repeat(64),
            },
            frogs: {
              size: 1,
              sha256: "e".repeat(64),
            },
          },
        ]),
      ),
    },
  };
  await writeFile(
    join(lockRoot, "upstream-lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  return { root, fixtures, lock };
}

test("candidate version retains the declared semantic version and commit identity", () => {
  assert.equal(
    firmwareCandidateVersion(FIRMWARE_VERSION, SOURCE_COMMIT),
    "0.2.0-beta.1+candidate.1234567890ab",
  );
  assert.throws(
    () => firmwareCandidateVersion(FIRMWARE_VERSION, "1234567"),
    /full lowercase Git commit/,
  );
  assert.throws(
    () => firmwareCandidateVersion("latest", SOURCE_COMMIT),
    /firmware version is invalid/,
  );
});

test("GitHub Actions provenance is explicit and validated", () => {
  assert.deepEqual(
    validateGitHubActionsProvenance(
      GITHUB_ACTIONS_PROVENANCE,
      "pierce403/frogalert",
    ),
    { provider: "github-actions", ...GITHUB_ACTIONS_PROVENANCE },
  );
  assert.deepEqual(
    githubActionsProvenanceFromEnvironment({
      FROGALERT_CANDIDATE_GITHUB_REPOSITORY: "pierce403/frogalert",
      FROGALERT_CANDIDATE_GITHUB_RUN_ID: "30726276951",
      FROGALERT_CANDIDATE_GITHUB_WORKFLOW:
        "pierce403/frogalert/.github/workflows/ci.yml@refs/heads/main",
      FROGALERT_CANDIDATE_GITHUB_JOB: "firmware-candidate",
      FROGALERT_CANDIDATE_GITHUB_RUN_ATTEMPT: "2",
    }),
    GITHUB_ACTIONS_PROVENANCE,
  );
  assert.throws(
    () =>
      validateGitHubActionsProvenance(
        { ...GITHUB_ACTIONS_PROVENANCE, repository: "someone/else" },
        "pierce403/frogalert",
      ),
    /repository does not match/,
  );
  assert.throws(
    () =>
      validateGitHubActionsProvenance(
        { ...GITHUB_ACTIONS_PROVENANCE, run_id: "not-a-run" },
        "pierce403/frogalert",
      ),
    /run id is invalid/,
  );
});

test("candidate bundle records exact audited bytes and cannot imply release approval", async (t) => {
  const { root, fixtures } = await makeFixture(t);
  const outputRoot = join(root, "tmp", "candidate-output");
  const metadata = await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot,
    sourceCommit: SOURCE_COMMIT,
    repository: "pierce403/frogalert",
    githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
  });

  assert.equal(metadata.schema_version, 3);
  assert.equal(metadata.version, FIRMWARE_VERSION);
  assert.equal(metadata.display_version, DISPLAY_VERSION);
  assert.equal(
    metadata.candidate_version,
    "0.2.0-beta.1+candidate.1234567890ab",
  );
  assert.equal(metadata.source_commit, SOURCE_COMMIT);
  assert.deepEqual(metadata.provenance, {
    provider: "github-actions",
    ...GITHUB_ACTIONS_PROVENANCE,
  });
  assert.equal(metadata.hardware_verified, false);
  assert.equal(metadata.flash_approved, false);
  assert.equal(metadata.publishable, false);
  assert.equal(metadata.hosted_on_site, false);
  assert.equal(metadata.default_hardware_profile, PROFILES[0]);
  assert.deepEqual(metadata.hardware_profiles, PROFILES);
  for (const profile of PROFILES) {
    const position =
      profile === "B1144C_250901_USB_C" ? "bottom" : "top";
    assert.deepEqual(metadata.artifacts[profile].rust_application, {
      compiler: "rustc 1.98.1 (test fixture)",
      compiler_commit: "a".repeat(40),
      target: "riscv32imc-unknown-none-elf",
      library_sha256: sha256("test Rust library"),
    });
    assert.equal(
      metadata.artifacts[profile].firmware.bytes,
      fixtures[profile].bin.byteLength,
    );
    assert.equal(
      metadata.artifacts[profile].firmware.sha256,
      sha256(fixtures[profile].bin),
    );
    assert.equal(
      metadata.artifacts[profile].debug_elf.bytes,
      fixtures[profile].elf.byteLength,
    );
    assert.equal(
      metadata.artifacts[profile].debug_elf.sha256,
      sha256(fixtures[profile].elf),
    );
    assert.match(
      metadata.artifacts[profile].firmware.file,
      new RegExp(
        `-${FIRMWARE_VERSION}-candidate-${SOURCE_COMMIT.slice(0, 12)}-${position}-b1144c-`,
      ),
    );
    assert.match(
      metadata.artifacts[profile].debug_elf.file,
      new RegExp(`-${position}-b1144c-`),
    );
  }

  const checksums = await readFile(join(outputRoot, "SHA256SUMS"), "utf8");
  for (const profile of PROFILES) {
    assert.match(
      checksums,
      new RegExp(metadata.artifacts[profile].firmware.sha256),
    );
    assert.match(
      checksums,
      new RegExp(metadata.artifacts[profile].debug_elf.sha256),
    );
  }
  const readme = await readFile(join(outputRoot, "README.md"), "utf8");
  assert.match(readme, /hardware-unverified CI candidate/i);
  assert.match(readme, new RegExp(`Version: ${FIRMWARE_VERSION}`));
  assert.match(readme, new RegExp(`Display version: ${DISPLAY_VERSION}`));
  assert.match(readme, /GitHub Actions run: 30726276951/);
  assert.match(readme, /not directly approved for flashing/i);
  assert.match(readme, /never copied into the website firmware catalog/i);
  assert.match(readme, /standard counter pair/i);
  assert.match(readme, /dancing-frog lane is not promoted automatically/i);

  const firstMetadata = await readFile(join(outputRoot, "candidate.json"), "utf8");
  await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot,
    sourceCommit: SOURCE_COMMIT,
    repository: "pierce403/frogalert",
    githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
  });
  assert.equal(
    await readFile(join(outputRoot, "candidate.json"), "utf8"),
    firstMetadata,
    "rerunning the same commit must produce identical candidate metadata",
  );
});

test("candidate summary is concise, hash-bound, and explicit about approval", async (t) => {
  const { root } = await makeFixture(t);
  const metadata = await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot: join(root, "tmp", "candidate-output"),
    sourceCommit: SOURCE_COMMIT,
    githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
  });
  const summary = firmwareCandidateSummary(metadata);
  assert.match(summary, /Counter candidate · 0\.2\.0-beta\.1/);
  assert.match(summary, /Hardware-unverified/);
  assert.match(summary, /not approved for flashing or publication/);
  for (const profile of PROFILES) {
    assert.match(summary, new RegExp(metadata.artifacts[profile].firmware.sha256));
  }
});

test("candidate bundle can package the dancing-frog lane separately", async (t) => {
  const { root } = await makeFixture(t);
  const outputRoot = join(root, "tmp", "frog-candidate-output");
  const metadata = await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot,
    sourceCommit: SOURCE_COMMIT,
    buildLane: "frogs",
    githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
  });

  assert.equal(metadata.build_lane, "frogs");
  assert.match(metadata.label, /dancing-frog/i);
  for (const profile of PROFILES) {
    assert.match(metadata.artifacts[profile].firmware.file, /^frogalert-frogs-/);
  }
});

test("candidate packaging hashes audited output directly instead of requiring moving locks", async (t) => {
  const { root, fixtures } = await makeFixture(t);
  const { bin, buildRoots } = fixtures[PROFILES[0]];
  const buildRoot = buildRoots.survey;
  bin[100] ^= 0xff;
  await writeFile(join(buildRoot, "badgemagic-ch582.bin"), bin);
  await writeFile(join(buildRoot, "badgemagic-ch582.from-elf.bin"), bin);
  const metadata = await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot: join(root, "tmp", "candidate-output"),
    sourceCommit: SOURCE_COMMIT,
    githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
  });
  assert.equal(
    metadata.artifacts[PROFILES[0]].firmware.sha256,
    sha256(bin),
  );
});

test("candidate packaging rejects a BIN that is not bound to the audited ELF", async (t) => {
  const { root, fixtures } = await makeFixture(t);
  const { bin, buildRoots } = fixtures[PROFILES[0]];
  const buildRoot = buildRoots.survey;
  bin[101] ^= 0xff;
  await writeFile(
    join(buildRoot, "badgemagic-ch582.from-elf.bin"),
    bin,
  );
  await assert.rejects(
    buildFirmwareCandidateBundle({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "candidate-output"),
      sourceCommit: SOURCE_COMMIT,
      githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
    }),
    /not the audited ELF's exact loadable bytes/,
  );
});

test("candidate packaging rejects Rust compiler drift", async (t) => {
  const { root, fixtures } = await makeFixture(t);
  await writeFile(
    join(fixtures[PROFILES[0]].buildRoots.survey, "rust-toolchain.txt"),
    `rustc 1.99.0\ncommit-hash: ${"a".repeat(40)}\nrelease: 1.99.0\n`,
  );
  await assert.rejects(
    buildFirmwareCandidateBundle({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "candidate-output"),
      sourceCommit: SOURCE_COMMIT,
      githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
    }),
    /pinned Rust 1\.98\.1 compiler/,
  );
});

test("candidate packaging refuses outputs outside ignored repository scratch space", async (t) => {
  const { root } = await makeFixture(t);
  await assert.rejects(
    buildFirmwareCandidateBundle({
      repositoryRoot: root,
      outputRoot: join(root, "firmware", "releases", "candidate"),
      sourceCommit: SOURCE_COMMIT,
      githubActionsProvenance: GITHUB_ACTIONS_PROVENANCE,
    }),
    /must stay under the repository tmp directory/,
  );
});
