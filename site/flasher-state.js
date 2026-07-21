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

export function canProgramArtifact({
  isBundledRecovery = false,
  hardwareVerifiedByFrogalert = false,
} = {}) {
  return !isBundledRecovery || hardwareVerifiedByFrogalert === true;
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
