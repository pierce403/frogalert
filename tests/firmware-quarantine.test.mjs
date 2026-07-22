import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFirmwareHashNotQuarantined,
  parseFirmwareQuarantineRegistry,
} from "../site/firmware-quarantine.js";

const failedSha = "02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22";

test("browser quarantine rejects the withdrawn pixel-walk bytes", () => {
  const hashes = parseFirmwareQuarantineRegistry({
    schema_version: 1,
    artifacts: [{ sha256: failedSha }],
  });
  assert.throws(
    () => assertFirmwareHashNotQuarantined(failedSha, hashes),
    /failed physical hardware smoke test/,
  );
  assert.equal(assertFirmwareHashNotQuarantined("a".repeat(64), hashes), true);
});

test("browser quarantine fails closed when the registry is unavailable or malformed", () => {
  assert.throws(
    () => assertFirmwareHashNotQuarantined("a".repeat(64), null),
    /not loaded/,
  );
  assert.throws(
    () => parseFirmwareQuarantineRegistry({ schema_version: 1, artifacts: [{ sha256: "bad" }] }),
    /invalid SHA-256/,
  );
  assert.throws(
    () =>
      parseFirmwareQuarantineRegistry({
        schema_version: 1,
        artifacts: [{ sha256: failedSha }, { sha256: failedSha }],
      }),
    /repeats SHA-256/,
  );
});
