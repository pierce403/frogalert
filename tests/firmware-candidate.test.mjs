import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildFirmwareCandidateBundle,
  firmwareCandidateVersion,
} from "../scripts/firmware-candidate.mjs";

const SOURCE_COMMIT = "1234567890abcdef1234567890abcdef12345678";
const TEST_SCRATCH_ROOT = fileURLToPath(new URL("../tmp/", import.meta.url));
const PROFILES = [
  "B1144C_260404_USB_C",
  "B1144C_250901_USB_C",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeFixture(t) {
  await mkdir(TEST_SCRATCH_ROOT, { recursive: true });
  const root = await mkdtemp(join(TEST_SCRATCH_ROOT, "firmware-candidate-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lockRoot = join(root, "firmware", "fossasia-usbc");
  await mkdir(lockRoot, { recursive: true });

  const fixtures = {};
  for (const [profileIndex, profile] of PROFILES.entries()) {
    const buildRoot = join(
      root,
      "tmp",
      "fossasia-usbc",
      "build",
      profile,
      "survey",
    );
    await mkdir(buildRoot, { recursive: true });
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
    await writeFile(join(buildRoot, "badgemagic-ch582.bin"), bin);
    await writeFile(join(buildRoot, "badgemagic-ch582.elf"), elf);
    await writeFile(join(buildRoot, "badgemagic-ch582.from-elf.bin"), bin);
    fixtures[profile] = { buildRoot, bin, elf };
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
      profile_images: Object.fromEntries(
        PROFILES.map((profile) => [
          profile,
          {
            survey: {
              size: fixtures[profile].bin.byteLength,
              sha256: sha256(fixtures[profile].bin),
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

test("candidate version is deterministic and commit-bound", () => {
  assert.equal(
    firmwareCandidateVersion(SOURCE_COMMIT),
    "0.0.0-candidate.1234567890ab",
  );
  assert.throws(() => firmwareCandidateVersion("1234567"), /full lowercase Git commit/);
});

test("candidate bundle records exact audited bytes and cannot imply release approval", async (t) => {
  const { root, fixtures, lock } = await makeFixture(t);
  const outputRoot = join(root, "tmp", "candidate-output");
  const metadata = await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot,
    sourceCommit: SOURCE_COMMIT,
    repository: "pierce403/frogalert",
  });

  assert.equal(metadata.version, "0.0.0-candidate.1234567890ab");
  assert.equal(metadata.source_commit, SOURCE_COMMIT);
  assert.equal(metadata.hardware_verified, false);
  assert.equal(metadata.flash_approved, false);
  assert.equal(metadata.publishable, false);
  assert.equal(metadata.hosted_on_site, false);
  assert.equal(metadata.default_hardware_profile, PROFILES[0]);
  assert.deepEqual(metadata.hardware_profiles, PROFILES);
  for (const profile of PROFILES) {
    assert.equal(
      metadata.artifacts[profile].firmware.bytes,
      fixtures[profile].bin.byteLength,
    );
    assert.equal(
      metadata.artifacts[profile].firmware.sha256,
      lock.build.profile_images[profile].survey.sha256,
    );
    assert.equal(
      metadata.artifacts[profile].debug_elf.bytes,
      fixtures[profile].elf.byteLength,
    );
    assert.equal(
      metadata.artifacts[profile].debug_elf.sha256,
      sha256(fixtures[profile].elf),
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
  assert.match(readme, /not approved for flashing/i);
  assert.match(readme, /never copied into the website firmware catalog/i);

  const firstMetadata = await readFile(join(outputRoot, "candidate.json"), "utf8");
  await buildFirmwareCandidateBundle({
    repositoryRoot: root,
    outputRoot,
    sourceCommit: SOURCE_COMMIT,
    repository: "pierce403/frogalert",
  });
  assert.equal(
    await readFile(join(outputRoot, "candidate.json"), "utf8"),
    firstMetadata,
    "rerunning the same commit must produce identical candidate metadata",
  );
});

test("candidate packaging rejects an image that differs from the audited lock", async (t) => {
  const { root, fixtures } = await makeFixture(t);
  const { bin, buildRoot } = fixtures[PROFILES[0]];
  bin[100] ^= 0xff;
  await writeFile(join(buildRoot, "badgemagic-ch582.bin"), bin);
  await writeFile(join(buildRoot, "badgemagic-ch582.from-elf.bin"), bin);
  await assert.rejects(
    buildFirmwareCandidateBundle({
      repositoryRoot: root,
      outputRoot: join(root, "tmp", "candidate-output"),
      sourceCommit: SOURCE_COMMIT,
    }),
    /does not match the audited survey lock/,
  );
});

test("candidate packaging rejects a BIN that is not bound to the audited ELF", async (t) => {
  const { root, fixtures } = await makeFixture(t);
  const { bin, buildRoot } = fixtures[PROFILES[0]];
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
    }),
    /not the audited ELF's exact loadable bytes/,
  );
});

test("candidate packaging refuses outputs outside ignored repository scratch space", async (t) => {
  const { root } = await makeFixture(t);
  await assert.rejects(
    buildFirmwareCandidateBundle({
      repositoryRoot: root,
      outputRoot: join(root, "firmware", "releases", "candidate"),
      sourceCommit: SOURCE_COMMIT,
    }),
    /must stay under the repository tmp directory/,
  );
});
