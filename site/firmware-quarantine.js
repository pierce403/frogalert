const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function parseFirmwareQuarantineRegistry(registry) {
  if (
    !registry ||
    typeof registry !== "object" ||
    registry.schema_version !== 1 ||
    !Array.isArray(registry.artifacts)
  ) {
    throw new Error("unsupported firmware quarantine registry");
  }

  const hashes = new Set();
  for (const artifact of registry.artifacts) {
    if (!artifact || typeof artifact !== "object" || !SHA256_PATTERN.test(artifact.sha256)) {
      throw new Error("firmware quarantine registry contains an invalid SHA-256");
    }
    if (hashes.has(artifact.sha256)) {
      throw new Error(`firmware quarantine registry repeats SHA-256 ${artifact.sha256}`);
    }
    hashes.add(artifact.sha256);
  }
  return hashes;
}

export function assertFirmwareHashNotQuarantined(sha256, quarantinedHashes) {
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error("firmware SHA-256 is invalid");
  }
  if (!(quarantinedHashes instanceof Set)) {
    throw new Error("firmware quarantine registry is not loaded");
  }
  if (quarantinedHashes.has(sha256)) {
    throw new Error(
      "this firmware SHA-256 is quarantined after a failed physical hardware smoke test",
    );
  }
  return true;
}
