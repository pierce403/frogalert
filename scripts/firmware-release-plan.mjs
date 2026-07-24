#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import { assertCh58xUserOptionMagic } from "./firmware-image.mjs";
import {
  validateFirmwarePublicationManifest,
  validateHardwareEvidenceRecord,
  validateHardwareEvidenceTranscript,
} from "./firmware-publication.mjs";

const RELEASE_NOTES_PATTERN =
  /^firmware\/releases\/notes\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRepositoryPath(repositoryRoot, repositoryPath, description) {
  const absolute = resolve(repositoryRoot, repositoryPath);
  if (!absolute.startsWith(`${repositoryRoot}/`)) {
    throw new Error(`${description} resolves outside the repository`);
  }
  return absolute;
}

function releaseAsset(name, content, contentType) {
  const bytes = Buffer.from(content);
  return {
    name,
    content_type: contentType,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    content: bytes,
  };
}

function releaseBody({ release, descriptors, notes, repository }) {
  const artifactLines = descriptors.map((descriptor) => {
    const evidence = descriptor.hardware_evidence;
    return [
      `- \`${descriptor.file}\``,
      `  - profile: \`${descriptor.hardware_revisions[0]}\``,
      `  - physical PCB marking: \`${descriptor.pcb_markings[0]}\``,
      `  - size: ${descriptor.bytes.toLocaleString("en-US")} bytes`,
      `  - SHA-256: \`${descriptor.sha256}\``,
      `  - debug ELF: \`${descriptor.debug_file}\` · SHA-256 \`${descriptor.debug_sha256}\``,
      `  - hardware smoke: ${evidence.tested_at}`,
      `  - evidence: [record](https://github.com/${repository}/blob/${release.release_tag}/${evidence.record}) · [transcript](https://github.com/${repository}/blob/${release.release_tag}/${evidence.transcript})`,
    ].join("\n");
  });

  return [
    notes.trim(),
    "",
    "## Verified artifacts",
    "",
    ...artifactLines,
    "",
    "## Before flashing",
    "",
    "Replacing the original read-protected firmware is irreversible: the OEM image cannot be backed up or restored. Use only the artifact whose exact hardware profile and physical PCB marking match the opened badge.",
    "",
    "The browser flasher downloads the same-origin copy from [frogalert.org/flash/](https://frogalert.org/flash/), recalculates its SHA-256 locally, and still requires every normal identification, board-binding, consent, program, and byte-verification step. `wchisp` remains the command-line fallback.",
    "",
    `Firmware source commit: [\`${release.source_commit}\`](https://github.com/${repository}/commit/${release.source_commit})`,
    "",
  ].join("\n");
}

export function assertGitSourceCommitReachable(repositoryRoot, sourceCommit, publishCommit) {
  if (!SOURCE_COMMIT_PATTERN.test(sourceCommit) || !SOURCE_COMMIT_PATTERN.test(publishCommit)) {
    throw new Error("release source and publication commits must be full Git commit ids");
  }
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", sourceCommit, publishCommit],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    throw new Error(
      `release source commit ${sourceCommit} is not reachable from publication commit ${publishCommit}${detail ? `: ${detail}` : ""}`,
    );
  }
  return true;
}

export async function buildFirmwareReleasePlan({
  repositoryRoot,
  repository,
  publishCommit,
  assertSourceCommit = () => true,
} = {}) {
  const root = resolve(repositoryRoot || ".");
  if (!SOURCE_COMMIT_PATTERN.test(publishCommit || "")) {
    throw new Error("publication commit must be a full Git commit id");
  }

  const releaseRoot = join(root, "firmware", "releases");
  const manifest = JSON.parse(await readFile(join(releaseRoot, "manifest.json"), "utf8"));
  const quarantine = JSON.parse(
    await readFile(join(root, "firmware", "quarantine.json"), "utf8"),
  );
  validateFirmwarePublicationManifest(manifest, quarantine);
  if (manifest.github_repository !== repository) {
    throw new Error(
      `release manifest repository ${manifest.github_repository} does not match ${repository}`,
    );
  }

  const descriptorsByTag = new Map();
  for (const descriptor of manifest.releases) {
    await assertSourceCommit(root, descriptor.source_commit, publishCommit);
    const evidenceRecord = JSON.parse(
      await readFile(
        assertRepositoryPath(root, descriptor.hardware_evidence.record, "hardware evidence record"),
        "utf8",
      ),
    );
    validateHardwareEvidenceRecord(descriptor, evidenceRecord, descriptor.file);
    const transcript = await readFile(
      assertRepositoryPath(root, evidenceRecord.transcript, "hardware evidence transcript"),
      "utf8",
    );
    validateHardwareEvidenceTranscript(
      descriptor,
      evidenceRecord,
      transcript,
      descriptor.file,
    );

    const artifactPath = join(releaseRoot, descriptor.file);
    const artifact = await readFile(artifactPath);
    assertCh58xUserOptionMagic(artifact);
    if (artifact.byteLength !== descriptor.bytes || sha256(artifact) !== descriptor.sha256) {
      throw new Error(`release artifact does not match its descriptor: ${descriptor.file}`);
    }
    const debugArtifact = await readFile(join(releaseRoot, descriptor.debug_file));
    if (
      debugArtifact.byteLength !== descriptor.debug_bytes ||
      debugArtifact.byteLength < 64 ||
      debugArtifact[0] !== 0x7f ||
      debugArtifact[1] !== 0x45 ||
      debugArtifact[2] !== 0x4c ||
      debugArtifact[3] !== 0x46 ||
      sha256(debugArtifact) !== descriptor.debug_sha256
    ) {
      throw new Error(`release debug ELF does not match its descriptor: ${descriptor.debug_file}`);
    }

    const group = descriptorsByTag.get(descriptor.release_tag) || [];
    group.push({ descriptor, artifact, debugArtifact, evidenceRecord });
    descriptorsByTag.set(descriptor.release_tag, group);
  }

  const releases = [];
  for (const [tag, entries] of descriptorsByTag) {
    const descriptors = entries.map(({ descriptor }) => descriptor);
    const release = descriptors[0];
    if (!RELEASE_NOTES_PATTERN.test(release.release_notes)) {
      throw new Error(`release notes path is unsafe: ${release.release_notes}`);
    }
    const notes = await readFile(
      assertRepositoryPath(root, release.release_notes, "release notes"),
      "utf8",
    );
    if (notes.trim().length < 40) {
      throw new Error(`release notes are too short: ${release.release_notes}`);
    }

    const assets = [];
    for (const { descriptor, artifact, debugArtifact, evidenceRecord } of entries) {
      assets.push(releaseAsset(descriptor.file, artifact, "application/octet-stream"));
      assets.push(
        releaseAsset(descriptor.debug_file, debugArtifact, "application/x-elf"),
      );
      assets.push(
        releaseAsset(
          `${descriptor.file}.sha256`,
          `${descriptor.sha256}  ${descriptor.file}\n`,
          "text/plain; charset=utf-8",
        ),
      );
      assets.push(
        releaseAsset(
          `${descriptor.id}.json`,
          `${JSON.stringify(descriptor, null, 2)}\n`,
          "application/json",
        ),
      );
      assets.push(
        releaseAsset(
          `${descriptor.id}.evidence.json`,
          `${JSON.stringify(evidenceRecord, null, 2)}\n`,
          "application/json",
        ),
      );
    }

    releases.push({
      tag,
      name: `${release.label} ${release.version}`,
      prerelease: release.channel !== "stable",
      body: releaseBody({
        release,
        descriptors,
        notes,
        repository,
      }),
      source_commit: release.source_commit,
      release_url: release.release_url,
      assets,
    });
  }

  return {
    schema_version: 1,
    repository,
    publish_commit: publishCommit,
    releases,
  };
}

export async function writeFirmwareReleaseBundle(plan, outputRoot) {
  const root = resolve(outputRoot);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const serializable = {
    ...plan,
    releases: [],
  };
  for (const release of plan.releases) {
    const releaseDirectory = join(root, "releases", release.tag);
    await mkdir(releaseDirectory, { recursive: true });
    const bodyPath = join(releaseDirectory, "release-notes.md");
    await writeFile(bodyPath, release.body);
    const serializableRelease = {
      ...release,
      body_file: relative(root, bodyPath),
      body_sha256: sha256(Buffer.from(release.body)),
      assets: [],
    };
    delete serializableRelease.body;

    for (const asset of release.assets) {
      if (basename(asset.name) !== asset.name) {
        throw new Error(`release asset name is unsafe: ${asset.name}`);
      }
      const assetPath = join(releaseDirectory, asset.name);
      await mkdir(dirname(assetPath), { recursive: true });
      await writeFile(assetPath, asset.content);
      const serializableAsset = {
        ...asset,
        path: relative(root, assetPath),
      };
      delete serializableAsset.content;
      serializableRelease.assets.push(serializableAsset);
    }
    serializable.releases.push(serializableRelease);
  }

  await writeFile(join(root, "plan.json"), `${JSON.stringify(serializable, null, 2)}\n`);
  return serializable;
}

async function runCli() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const outputRoot = resolve(repositoryRoot, process.argv[2] || "tmp/release-publication");
  const repository = process.env.GITHUB_REPOSITORY || "pierce403/frogalert";
  const publishCommit = process.env.FROGALERT_PUBLISH_COMMIT;
  if (!publishCommit) {
    throw new Error("FROGALERT_PUBLISH_COMMIT is required");
  }
  const plan = await buildFirmwareReleasePlan({
    repositoryRoot,
    repository,
    publishCommit,
    assertSourceCommit: assertGitSourceCommitReachable,
  });
  await writeFirmwareReleaseBundle(plan, outputRoot);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `release_count=${plan.releases.length}\n`);
  }
  console.log(
    `prepared ${plan.releases.length} verified firmware release${plan.releases.length === 1 ? "" : "s"} in ${relative(repositoryRoot, outputRoot)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await runCli();
}
