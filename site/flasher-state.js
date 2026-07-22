export function nextArtifactGeneration(currentGeneration) {
  if (!Number.isSafeInteger(currentGeneration) || currentGeneration < 0) {
    throw new RangeError("artifact generation must be a non-negative safe integer");
  }
  if (currentGeneration === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("artifact generation is exhausted");
  }
  return currentGeneration + 1;
}

export function revisionInputTransition({
  artifactGeneration,
  isRecoveryArtifact = false,
  artifactMatchesRevision = false,
}) {
  return {
    artifactGeneration: nextArtifactGeneration(artifactGeneration),
    clearFirmware: isRecoveryArtifact && !artifactMatchesRevision,
  };
}

export function artifactBoardBinding({ hardwareRevisions, pcbMarkings = null } = {}) {
  if (!Array.isArray(hardwareRevisions) || hardwareRevisions.length === 0) {
    throw new Error("artifact hardware revisions are missing");
  }
  const binding = { hardwareRevisions: [...hardwareRevisions] };
  if (pcbMarkings !== null) {
    if (!Array.isArray(pcbMarkings) || pcbMarkings.length === 0) {
      throw new Error("artifact physical PCB markings are missing");
    }
    binding.pcbMarkings = [...pcbMarkings];
  }
  return binding;
}

export function canProgramArtifact({
  artifactKind = "unknown",
  hardwareVerified = false,
  hardwareVerifiedByFrogalert = false,
} = {}) {
  if (artifactKind === "local-developer") return true;
  if (artifactKind === "open-badgemagic-recovery") {
    return hardwareVerifiedByFrogalert === true;
  }
  if (artifactKind === "frogalert-release" || artifactKind === "frogalert-lab") {
    return hardwareVerified === true;
  }
  return false;
}

export function canEnableFlash({
  flashing = false,
  hasUsbDevice = false,
  hasChipIdentity = false,
  hasConfig = false,
  hasFirmware = false,
  hasBoardRecord = false,
  artifactMatchesRevision = false,
  confirmationsComplete = false,
  artifactConfirmationComplete = true,
  artifactProgrammingAllowed = true,
  typedPhraseComplete = true,
} = {}) {
  return (
    !flashing &&
    hasUsbDevice &&
    hasChipIdentity &&
    hasConfig &&
    hasFirmware &&
    hasBoardRecord &&
    artifactMatchesRevision &&
    confirmationsComplete &&
    artifactConfirmationComplete &&
    artifactProgrammingAllowed &&
    typedPhraseComplete
  );
}
