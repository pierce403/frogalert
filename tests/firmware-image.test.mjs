import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCh58xUserOptionMagic,
  CH58X_USER_OPTION_MAGIC,
  CH58X_USER_OPTION_OFFSET,
  finalizeCh58xFirmware,
  readCh58xUserOptionMagic,
} from "../scripts/firmware-image.mjs";

test("CH58x package finalization writes the WCH sentinel in little-endian form", () => {
  const original = new Uint8Array(64);
  const finalized = finalizeCh58xFirmware(original);

  assert.notEqual(finalized, original);
  assert.deepEqual([...original.slice(CH58X_USER_OPTION_OFFSET, CH58X_USER_OPTION_OFFSET + 4)], [0, 0, 0, 0]);
  assert.deepEqual(
    [...finalized.slice(CH58X_USER_OPTION_OFFSET, CH58X_USER_OPTION_OFFSET + 4)],
    [0xa9, 0xbd, 0xf9, 0xf5],
  );
  assert.equal(readCh58xUserOptionMagic(finalized), CH58X_USER_OPTION_MAGIC);
  assert.equal(assertCh58xUserOptionMagic(finalized), true);
  assert.deepEqual(finalizeCh58xFirmware(finalized), finalized, "finalization is idempotent");
});

test("CH58x package finalization rejects linker drift instead of corrupting a vector", () => {
  assert.throws(() => finalizeCh58xFirmware(new Uint8Array(20)), /too short/);

  const unexpected = new Uint8Array(64);
  new DataView(unexpected.buffer).setUint32(CH58X_USER_OPTION_OFFSET, 0x12345678, true);
  assert.throws(() => finalizeCh58xFirmware(unexpected), /non-reserved CH58x vector data/);
  assert.throws(() => assertCh58xUserOptionMagic(unexpected), /missing the WCH startup sentinel/);
});
