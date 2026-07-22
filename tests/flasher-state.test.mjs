import assert from "node:assert/strict";
import test from "node:test";

import {
  artifactBoardBinding,
  canEnableFlash,
  canProgramArtifact,
  nextArtifactGeneration,
  revisionInputTransition,
} from "../site/flasher-state.js";

test("artifact state retains exact profile and physical PCB bindings", () => {
  const revisions = ["B1144C_250901_USB_C"];
  const markings = ["B1144C_250901"];
  const binding = artifactBoardBinding({ hardwareRevisions: revisions, pcbMarkings: markings });
  assert.deepEqual(binding, { hardwareRevisions: revisions, pcbMarkings: markings });
  assert.notEqual(binding.hardwareRevisions, revisions);
  assert.notEqual(binding.pcbMarkings, markings);
  assert.throws(() => artifactBoardBinding({ hardwareRevisions: [] }), /revisions are missing/);
  assert.throws(
    () => artifactBoardBinding({ hardwareRevisions: revisions, pcbMarkings: [] }),
    /PCB markings are missing/,
  );
});

test("every revision input transition invalidates an in-flight artifact generation", () => {
  const inFlightGeneration = nextArtifactGeneration(4);
  const transition = revisionInputTransition({
    artifactGeneration: inFlightGeneration,
    isRecoveryArtifact: false,
    artifactMatchesRevision: false,
  });

  assert.equal(inFlightGeneration, 5);
  assert.equal(transition.artifactGeneration, 6);
  assert.notEqual(transition.artifactGeneration, inFlightGeneration);
  assert.equal(transition.clearFirmware, false);
});

test("revision input clears a prepared recovery image only after it stops matching", () => {
  assert.deepEqual(
    revisionInputTransition({
      artifactGeneration: 10,
      isRecoveryArtifact: true,
      artifactMatchesRevision: true,
    }),
    { artifactGeneration: 11, clearFirmware: false },
  );
  assert.deepEqual(
    revisionInputTransition({
      artifactGeneration: 11,
      isRecoveryArtifact: true,
      artifactMatchesRevision: false,
    }),
    { artifactGeneration: 12, clearFirmware: true },
  );
});

test("flash gating requires fresh device identity, configuration, and acknowledgements", () => {
  const ready = {
    flashing: false,
    hasUsbDevice: true,
    hasChipIdentity: true,
    hasConfig: true,
    hasFirmware: true,
    hasBoardRecord: true,
    artifactMatchesRevision: true,
    confirmationsComplete: true,
  };

  assert.equal(canEnableFlash(ready), true);
  for (const missing of [
    "hasUsbDevice",
    "hasChipIdentity",
    "hasConfig",
    "hasBoardRecord",
    "confirmationsComplete",
  ]) {
    assert.equal(canEnableFlash({ ...ready, [missing]: false }), false, missing);
  }
  assert.equal(
    canEnableFlash({ ...ready, artifactConfirmationComplete: false }),
    false,
    "recovery-specific hardware confirmation",
  );
  assert.equal(
    canEnableFlash({ ...ready, artifactProgrammingAllowed: false }),
    false,
    "hardware-unverified manifest-managed artifact",
  );
  assert.equal(
    canEnableFlash({ ...ready, typedPhraseComplete: false }),
    false,
    "dedicated-page typed destructive phrase",
  );
  assert.equal(
    canEnableFlash(ready),
    true,
    "generic artifacts are unaffected when no extra confirmation is required",
  );
});

test("manifest-managed artifacts fail closed until their exact image is hardware-verified", () => {
  assert.equal(canProgramArtifact(), false, "missing artifact policy");
  assert.equal(canProgramArtifact({ artifactKind: "unknown" }), false, "unknown artifact kind");
  assert.equal(
    canProgramArtifact({
      artifactKind: "open-badgemagic-recovery",
      hardwareVerifiedByFrogalert: false,
    }),
    false,
  );
  assert.equal(
    canProgramArtifact({
      artifactKind: "open-badgemagic-recovery",
      hardwareVerifiedByFrogalert: true,
    }),
    true,
  );
  for (const artifactKind of ["frogalert-lab", "frogalert-release"]) {
    assert.equal(
      canProgramArtifact({ artifactKind, hardwareVerified: false }),
      false,
      `${artifactKind} without physical verification`,
    );
    assert.equal(
      canProgramArtifact({ artifactKind, hardwareVerified: true }),
      true,
      `${artifactKind} with physical verification`,
    );
  }
});

test("explicit local developer BIN route remains flashable", () => {
  assert.equal(
    canProgramArtifact({
      artifactKind: "local-developer",
    }),
    true,
    "developer-selected BIN path remains available",
  );
});
