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

const PCB_MARKING_BY_PROFILE = Object.freeze({
  B1144C_250901_USB_C: "B1144C_250901",
  B1144C_260404_USB_C: "B1144C_260404",
});

const PROFILE_HINT_BY_BUTTON = Object.freeze({
  top: Object.freeze({
    position: "top",
    profile: "B1144C_260404_USB_C",
    marking: "B1144C_260404",
    imageLabel: "top-button image",
  }),
  bottom: Object.freeze({
    position: "bottom",
    profile: "B1144C_250901_USB_C",
    marking: "B1144C_250901",
    imageLabel: "bottom-button image",
  }),
});

export function profileHintForIspButton(position) {
  const hint = PROFILE_HINT_BY_BUTTON[position];
  return hint ? { ...hint } : null;
}

export function expectedPcbMarking(profile) {
  return PCB_MARKING_BY_PROFILE[profile] || null;
}

export function physicalMarkingMatchesProfiles({
  hardwareRevisions,
  physicalMarking,
} = {}) {
  if (!Array.isArray(hardwareRevisions) || hardwareRevisions.length === 0) {
    return false;
  }
  const expected = new Set(
    hardwareRevisions
      .map((profile) => expectedPcbMarking(profile))
      .filter(Boolean),
  );
  if (expected.size === 0) return true;

  const normalized = String(physicalMarking || "").toUpperCase();
  const observed = Object.values(PCB_MARKING_BY_PROFILE).filter((marking) =>
    normalized.includes(marking),
  );
  return observed.length === 1 && expected.has(observed[0]);
}

export function canProgramArtifact({
  artifactKind = "unknown",
  hardwareVerified = false,
  hardwareVerifiedByFrogalert = false,
  flashApproved = false,
} = {}) {
  if (artifactKind === "local-developer") return true;
  if (artifactKind === "open-badgemagic-recovery") {
    return hardwareVerifiedByFrogalert === true;
  }
  if (artifactKind === "frogalert-release") {
    return hardwareVerified === true || flashApproved === true;
  }
  if (artifactKind === "frogalert-lab") {
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
