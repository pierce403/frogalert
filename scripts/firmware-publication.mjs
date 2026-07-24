const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HARDWARE_PROFILE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const QUARANTINE_EVIDENCE_PATTERN = /^agent-memory\/logs\/[a-zA-Z0-9._-]+\.md$/;
const HARDWARE_EVIDENCE_PATTERN = /^firmware\/evidence\/[a-zA-Z0-9._-]+\.json$/;
const TEST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_ID_PATTERN = /^frogalert-[a-z0-9][a-z0-9.-]{2,95}$/;
const RELEASE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const RELEASE_TAG_PATTERN =
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const RELEASE_NOTES_PATTERN =
  /^firmware\/releases\/notes\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/;
const GITHUB_REPOSITORY_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const RELEASE_CHANNELS = new Set(["alpha", "beta", "stable"]);
const RECOVERY_USB_IDS = new Set(["4348:55e0", "1a86:55e0"]);
const KNOWN_GOOD_REFLASH_SHA256_BY_PROFILE = new Map([
  [
    "B1144C_250901_USB_C",
    "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2",
  ],
]);

function requireNonemptyString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
}

export function validateFirmwareQuarantine(quarantine) {
  if (
    !quarantine ||
    typeof quarantine !== "object" ||
    quarantine.schema_version !== 1 ||
    !Array.isArray(quarantine.artifacts)
  ) {
    throw new Error("unsupported firmware quarantine schema");
  }

  const hashes = new Set();
  for (const artifact of quarantine.artifacts) {
    if (!artifact || typeof artifact !== "object" || !SHA256_PATTERN.test(artifact.sha256)) {
      throw new Error("quarantined firmware SHA-256 is invalid");
    }
    if (hashes.has(artifact.sha256)) {
      throw new Error(`duplicate quarantined firmware SHA-256: ${artifact.sha256}`);
    }
    if (!SOURCE_COMMIT_PATTERN.test(artifact.source_commit)) {
      throw new Error("quarantined firmware source commit is invalid");
    }
    if (!HARDWARE_PROFILE_PATTERN.test(artifact.hardware_profile)) {
      throw new Error("quarantined firmware hardware profile is invalid");
    }
    requireNonemptyString(artifact.pcb_marking, "quarantined firmware PCB marking is missing");
    if (artifact.status !== "failed-hardware-smoke") {
      throw new Error("quarantined firmware status is invalid");
    }
    if (!QUARANTINE_EVIDENCE_PATTERN.test(artifact.evidence)) {
      throw new Error("quarantined firmware evidence record is invalid");
    }
    requireNonemptyString(artifact.reason, "quarantined firmware reason is missing");
    hashes.add(artifact.sha256);
  }
  return hashes;
}

function validateHardwareEvidence(artifact, description) {
  const evidence = artifact.hardware_evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(`${description} has no physical hardware evidence`);
  }
  if (evidence.artifact_sha256 !== artifact.sha256) {
    throw new Error(`${description} hardware evidence is not bound to its SHA-256`);
  }
  if (evidence.source_commit !== artifact.source_commit) {
    throw new Error(`${description} hardware evidence is not bound to its source commit`);
  }
  if (!HARDWARE_EVIDENCE_PATTERN.test(evidence.record)) {
    throw new Error(`${description} hardware evidence record is invalid`);
  }
  if (!QUARANTINE_EVIDENCE_PATTERN.test(evidence.transcript)) {
    throw new Error(`${description} hardware evidence transcript is invalid`);
  }
  if (!TEST_DATE_PATTERN.test(evidence.tested_at)) {
    throw new Error(`${description} hardware evidence test date is invalid`);
  }
  if (
    !HARDWARE_PROFILE_PATTERN.test(evidence.hardware_profile) ||
    !artifact.hardware_revisions.includes(evidence.hardware_profile)
  ) {
    throw new Error(`${description} hardware evidence profile does not match the artifact`);
  }
  const knownGoodReflashSha = KNOWN_GOOD_REFLASH_SHA256_BY_PROFILE.get(
    evidence.hardware_profile,
  );
  if (
    !knownGoodReflashSha ||
    evidence.known_good_reflash_sha256 !== knownGoodReflashSha
  ) {
    throw new Error(
      `${description} hardware evidence is not bound to the known-good recovery image`,
    );
  }
  requireNonemptyString(evidence.pcb_marking, `${description} hardware evidence PCB marking is missing`);
  if (
    Array.isArray(artifact.pcb_markings) &&
    artifact.pcb_markings.length > 0 &&
    !artifact.pcb_markings.includes(evidence.pcb_marking)
  ) {
    throw new Error(`${description} hardware evidence PCB marking does not match the artifact`);
  }
  for (const check of [
    "cli_program_verified",
    "cli_byte_verify_passed",
    "webusb_program_verified",
    "webusb_byte_verify_passed",
    "boot_observed",
    "power_cycle_passed",
    "key1_behavior_passed",
    "short_key2_behavior_passed",
    "application_hid_enumeration_passed",
    "application_cdc_enumeration_passed",
    "display_passed",
    "badgemagic_upload_passed",
    "key2_dot_observed",
    "key2_recovery_passed",
    "known_good_reflash_passed",
  ]) {
    if (evidence[check] !== true) {
      throw new Error(`${description} hardware evidence does not confirm ${check}`);
    }
  }
  if (evidence.application_usb_id !== "0416:5020") {
    throw new Error(`${description} hardware evidence does not confirm the application USB stack`);
  }
  if (evidence.recovery_method !== "key2-only") {
    throw new Error(`${description} hardware evidence does not confirm KEY2-only recovery`);
  }
  if (!RECOVERY_USB_IDS.has(String(evidence.recovery_usb_id || "").toLowerCase())) {
    throw new Error(`${description} hardware evidence does not confirm WCH ROM ISP recovery`);
  }
}

export function validateHardwareEvidenceRecord(artifact, record, description = "FrogAlert artifact") {
  const evidence = artifact?.hardware_evidence;
  if (!record || typeof record !== "object" || Array.isArray(record) || record.schema_version !== 1) {
    throw new Error(`${description} structured hardware evidence record is invalid`);
  }
  const boundFields = [
    "artifact_sha256",
    "source_commit",
    "tested_at",
    "hardware_profile",
    "pcb_marking",
    "transcript",
    "cli_program_verified",
    "cli_byte_verify_passed",
    "webusb_program_verified",
    "webusb_byte_verify_passed",
    "boot_observed",
    "power_cycle_passed",
    "key1_behavior_passed",
    "short_key2_behavior_passed",
    "application_usb_id",
    "application_hid_enumeration_passed",
    "application_cdc_enumeration_passed",
    "display_passed",
    "badgemagic_upload_passed",
    "key2_dot_observed",
    "key2_recovery_passed",
    "known_good_reflash_passed",
    "known_good_reflash_sha256",
    "recovery_method",
    "recovery_usb_id",
  ];
  for (const field of boundFields) {
    if (record[field] !== evidence?.[field]) {
      throw new Error(`${description} structured hardware evidence differs at ${field}`);
    }
  }
  validateHardwareEvidence(
    { ...artifact, hardware_evidence: { ...record, record: evidence.record } },
    description,
  );
  return true;
}

export function validateHardwareEvidenceTranscript(
  artifact,
  record,
  transcript,
  description = "FrogAlert artifact",
) {
  validateHardwareEvidenceRecord(artifact, record, description);
  if (typeof transcript !== "string" || !transcript.trim()) {
    throw new Error(`${description} hardware evidence transcript is empty`);
  }
  for (const fact of [
    record.tested_at,
    record.artifact_sha256,
    record.source_commit,
    record.hardware_profile,
    record.pcb_marking,
    record.application_usb_id,
    record.recovery_usb_id,
    record.known_good_reflash_sha256,
  ]) {
    if (!transcript.includes(fact)) {
      throw new Error(`${description} hardware evidence transcript is missing ${fact}`);
    }
  }
  const sectionRequirements = [
    ["## CLI program and byte verification", ["wchisp", "program", "verify"]],
    ["## WebUSB program and byte verification", ["webusb", "program", "verify"]],
    ["## Application USB HID and CDC", [record.application_usb_id, "hid", "cdc"]],
    ["## Display and BadgeMagic upload", ["display", "badgemagic", "upload"]],
    ["## KEY1 and short KEY2", ["key1", "key2", "short"]],
    ["## KEY2-only recovery", ["key2", "dot", record.recovery_usb_id]],
    ["## Known-good reflash", ["reflash", "verify", record.known_good_reflash_sha256]],
  ];
  for (const [heading, requiredTerms] of sectionRequirements) {
    const headingStart = transcript.indexOf(heading);
    if (headingStart === -1) {
      throw new Error(`${description} hardware evidence transcript is missing ${heading}`);
    }
    const bodyStart = headingStart + heading.length;
    const nextHeading = transcript.indexOf("\n## ", bodyStart);
    const body = transcript.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading).trim();
    const normalizedBody = body.toLowerCase();
    if (body.length < 20 || requiredTerms.some((term) => !normalizedBody.includes(term.toLowerCase()))) {
      throw new Error(`${description} hardware evidence transcript has no captured evidence under ${heading}`);
    }
  }
  return true;
}

export function validatePublishableFrogAlertArtifact(artifact, quarantinedHashes, description) {
  if (!artifact || typeof artifact !== "object") {
    throw new Error(`${description} descriptor is missing`);
  }
  if (artifact.target !== "ch582m-badgemagic-11x44") {
    throw new Error(`${description} target is invalid`);
  }
  if (
    !Array.isArray(artifact.hardware_revisions) ||
    artifact.hardware_revisions.length !== 1 ||
    artifact.hardware_revisions.some((profile) => !HARDWARE_PROFILE_PATTERN.test(profile))
  ) {
    throw new Error(`${description} must target exactly one valid hardware profile`);
  }
  if (
    !Array.isArray(artifact.pcb_markings) ||
    artifact.pcb_markings.length !== 1 ||
    typeof artifact.pcb_markings[0] !== "string" ||
    !artifact.pcb_markings[0].trim()
  ) {
    throw new Error(`${description} must target exactly one physical PCB marking`);
  }
  if (!SHA256_PATTERN.test(artifact.sha256)) {
    throw new Error(`${description} SHA-256 is invalid`);
  }
  if (typeof artifact.file !== "string" || !/^[a-zA-Z0-9._-]+\.bin$/.test(artifact.file)) {
    throw new Error(`${description} filename is invalid`);
  }
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1) {
    throw new Error(`${description} byte length is invalid`);
  }
  if (!SOURCE_COMMIT_PATTERN.test(artifact.source_commit)) {
    throw new Error(`${description} source commit is invalid`);
  }
  if (quarantinedHashes.has(artifact.sha256)) {
    throw new Error(`${description} matches a quarantined firmware SHA-256`);
  }
  if (artifact.hardware_verified !== true) {
    throw new Error(`${description} is not physically hardware-verified`);
  }
  validateHardwareEvidence(artifact, description);
  return true;
}

export function validateFrogAlertReleaseMetadata(
  release,
  githubRepository,
  description = "FrogAlert release",
) {
  if (!GITHUB_REPOSITORY_PATTERN.test(githubRepository || "")) {
    throw new Error("firmware publication GitHub repository is invalid");
  }
  if (!RELEASE_ID_PATTERN.test(release?.id || "")) {
    throw new Error(`${description} id is invalid`);
  }
  if (release.kind !== "frogalert-release") {
    throw new Error(`${description} kind is invalid`);
  }
  requireNonemptyString(release.label, `${description} label is missing`);
  if (!RELEASE_VERSION_PATTERN.test(release.version || "")) {
    throw new Error(`${description} version is invalid`);
  }
  if (!RELEASE_CHANNELS.has(release.channel)) {
    throw new Error(`${description} channel is invalid`);
  }
  const prerelease = release.version.split("-", 2)[1] || "";
  if (
    (release.channel === "stable" && prerelease) ||
    (release.channel !== "stable" &&
      !prerelease.toLowerCase().startsWith(`${release.channel}.`) &&
      prerelease.toLowerCase() !== release.channel)
  ) {
    throw new Error(`${description} version does not match its ${release.channel} channel`);
  }
  const expectedTag = `v${release.version}`;
  if (!RELEASE_TAG_PATTERN.test(release.release_tag || "") || release.release_tag !== expectedTag) {
    throw new Error(`${description} tag must be ${expectedTag}`);
  }
  const expectedUrl = `https://github.com/${githubRepository}/releases/tag/${expectedTag}`;
  if (release.release_url !== expectedUrl) {
    throw new Error(`${description} URL must be ${expectedUrl}`);
  }
  if (!RELEASE_NOTES_PATTERN.test(release.release_notes || "")) {
    throw new Error(`${description} release notes path is invalid`);
  }
  if (
    typeof release.debug_file !== "string" ||
    !/^[a-zA-Z0-9._-]+\.elf$/.test(release.debug_file)
  ) {
    throw new Error(`${description} debug ELF filename is invalid`);
  }
  if (!Number.isSafeInteger(release.debug_bytes) || release.debug_bytes < 64) {
    throw new Error(`${description} debug ELF byte length is invalid`);
  }
  if (!SHA256_PATTERN.test(release.debug_sha256 || "")) {
    throw new Error(`${description} debug ELF SHA-256 is invalid`);
  }
  return true;
}

export function validateFirmwarePublicationManifest(manifest, quarantine) {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.schema_version !== 4 ||
    !GITHUB_REPOSITORY_PATTERN.test(manifest.github_repository || "") ||
    !Array.isArray(manifest.releases) ||
    !Array.isArray(manifest.lab_images) ||
    !Array.isArray(manifest.recovery_images)
  ) {
    throw new Error("firmware publication manifest collections are invalid");
  }

  const quarantinedHashes = validateFirmwareQuarantine(quarantine);
  const artifactIds = new Set();
  const artifactFiles = new Set();
  const releaseGroups = new Map();
  for (const release of manifest.releases) {
    validatePublishableFrogAlertArtifact(release, quarantinedHashes, "FrogAlert release");
    validateFrogAlertReleaseMetadata(release, manifest.github_repository);
    if (artifactIds.has(release.id)) {
      throw new Error(`duplicate FrogAlert publication id: ${release.id}`);
    }
    if (artifactFiles.has(release.file)) {
      throw new Error(`duplicate FrogAlert publication filename: ${release.file}`);
    }
    if (artifactFiles.has(release.debug_file)) {
      throw new Error(`duplicate FrogAlert publication filename: ${release.debug_file}`);
    }
    artifactIds.add(release.id);
    artifactFiles.add(release.file);
    artifactFiles.add(release.debug_file);

    const group = releaseGroups.get(release.release_tag);
    const groupIdentity = {
      version: release.version,
      label: release.label,
      channel: release.channel,
      release_url: release.release_url,
      release_notes: release.release_notes,
      source_commit: release.source_commit,
    };
    if (group) {
      for (const [field, value] of Object.entries(groupIdentity)) {
        if (group[field] !== value) {
          throw new Error(
            `FrogAlert release tag ${release.release_tag} has conflicting ${field}`,
          );
        }
      }
    } else {
      releaseGroups.set(release.release_tag, groupIdentity);
    }
  }
  for (const lab of manifest.lab_images) {
    validatePublishableFrogAlertArtifact(lab, quarantinedHashes, "FrogAlert lab image");
    if (artifactIds.has(lab.id)) {
      throw new Error(`duplicate FrogAlert publication id: ${lab.id}`);
    }
    if (artifactFiles.has(lab.file)) {
      throw new Error(`duplicate FrogAlert publication filename: ${lab.file}`);
    }
    artifactIds.add(lab.id);
    artifactFiles.add(lab.file);
  }

  // recovery_images are reviewed third-party substitutes, not FrogAlert builds.
  // Their separate descriptor and hardware gates are validated elsewhere.
  return true;
}
