import assert from "node:assert/strict";
import test from "node:test";

import { programAndVerifyFirmware } from "../site/flash-session.js";
import { CH58X_RESET_CONFIG, COMMAND, deriveXorKey } from "../site/wchisp-protocol.js";

const uid = Uint8Array.of(1, 2, 3, 4, 5, 6, 0x09, 0x0c);

function validConfigPayload() {
  const payload = new Uint8Array(14);
  payload.set(CH58X_RESET_CONFIG, 2);
  return payload;
}

function fakeTransport({ badConfig = false, badVerifyAt = -1 } = {}) {
  const packets = [];
  let verifyIndex = 0;
  const keyChecksum = deriveXorKey(uid).reduce((sum, byte) => (sum + byte) & 0xff, 0);
  return {
    packets,
    async transfer(packet) {
      packets.push(packet);
      switch (packet[0]) {
        case COMMAND.READ_CONFIG: {
          const payload = validConfigPayload();
          if (badConfig) payload[2] ^= 0xff;
          return payload;
        }
        case COMMAND.ISP_KEY:
          return Uint8Array.of(keyChecksum);
        case COMMAND.VERIFY: {
          const result = Uint8Array.of(verifyIndex === badVerifyAt ? 1 : 0);
          verifyIndex += 1;
          return result;
        }
        default:
          return new Uint8Array();
      }
    },
  };
}

test("full fake session resets config before erase, finalizes program, verifies, and resets", async () => {
  const transport = fakeTransport();
  const events = [];
  let resetCalls = 0;
  const padded = new Uint8Array(1024).map((_, index) => index);
  const result = await programAndVerifyFirmware({
    padded,
    eraseSectors: 8,
    uid,
    transfer: transport.transfer,
    reset: async () => {
      resetCalls += 1;
      return true;
    },
    randomByte: () => 0x55,
    wait: async () => {},
    onEvent: (event) => events.push(event),
  });

  const commands = transport.packets.map((packet) => packet[0]);
  assert.deepEqual(commands.slice(0, 4), [
    COMMAND.WRITE_CONFIG,
    COMMAND.READ_CONFIG,
    COMMAND.ERASE,
    COMMAND.ISP_KEY,
  ]);
  assert.equal(commands.filter((command) => command === COMMAND.PROGRAM).length, 20);
  assert.equal(commands.filter((command) => command === COMMAND.VERIFY).length, 19);
  assert.equal(commands.at(24), COMMAND.ISP_KEY);
  const programPackets = transport.packets.filter((packet) => packet[0] === COMMAND.PROGRAM);
  assert.equal(programPackets.at(-1).byteLength, 8, "final program packet must have no data");
  assert.equal(resetCalls, 1);
  assert.deepEqual(result, { chunks: 19, resetAcknowledged: true });
  assert.equal(events.at(-1).phase, "complete");
});

test("configuration readback mismatch stops before erase", async () => {
  const transport = fakeTransport({ badConfig: true });
  await assert.rejects(
    programAndVerifyFirmware({
      padded: new Uint8Array(1024),
      eraseSectors: 8,
      uid,
      transfer: transport.transfer,
      reset: async () => true,
      randomByte: () => 0,
    }),
    /configuration reset did not match/,
  );
  assert.deepEqual(transport.packets.map((packet) => packet[0]), [
    COMMAND.WRITE_CONFIG,
    COMMAND.READ_CONFIG,
  ]);
});

test("verify mismatch never reports completion or sends reset", async () => {
  const transport = fakeTransport({ badVerifyAt: 0 });
  let resetCalls = 0;
  await assert.rejects(
    programAndVerifyFirmware({
      padded: new Uint8Array(1024),
      eraseSectors: 8,
      uid,
      transfer: transport.transfer,
      reset: async () => {
        resetCalls += 1;
        return true;
      },
      randomByte: () => 0,
      wait: async () => {},
    }),
    /verify mismatch at address 0x0/,
  );
  assert.equal(resetCalls, 0);
});

test("invalid erase plans and unaligned images are rejected before USB traffic", async () => {
  const transport = fakeTransport();
  const base = {
    uid,
    transfer: transport.transfer,
    reset: async () => true,
    randomByte: () => 0,
  };

  await assert.rejects(
    programAndVerifyFirmware({ ...base, padded: new Uint8Array(56), eraseSectors: 8 }),
    /aligned to one KiB/,
  );
  await assert.rejects(
    programAndVerifyFirmware({ ...base, padded: new Uint8Array(1024), eraseSectors: 9 }),
    /erase sector count is invalid/,
  );
  assert.equal(transport.packets.length, 0);
});

test("a throwing UI callback cannot interrupt an active hardware session", async () => {
  const transport = fakeTransport();
  const result = await programAndVerifyFirmware({
    padded: new Uint8Array(1024),
    eraseSectors: 8,
    uid,
    transfer: transport.transfer,
    reset: async () => true,
    randomByte: () => 0,
    wait: async () => {},
    onEvent: () => {
      throw new Error("rendering failed");
    },
  });
  assert.equal(result.chunks, 19);
});
