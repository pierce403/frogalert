import assert from "node:assert/strict";
import test from "node:test";

import {
  canEnableFlash,
  canProgramArtifact,
  nextArtifactGeneration,
  revisionInputTransition,
} from "../site/flasher-state.js";

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
    "hardware-unverified bundled recovery artifact",
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

test("bundled recovery programming requires FrogAlert physical verification", () => {
  assert.equal(
    canProgramArtifact({
      isBundledRecovery: true,
      hardwareVerifiedByFrogalert: false,
    }),
    false,
  );
  assert.equal(
    canProgramArtifact({
      isBundledRecovery: true,
      hardwareVerifiedByFrogalert: true,
    }),
    true,
  );
  assert.equal(
    canProgramArtifact({
      isBundledRecovery: false,
      hardwareVerifiedByFrogalert: false,
    }),
    true,
    "developer-selected BIN path remains available",
  );
});
