import assert from "node:assert/strict";
import test from "node:test";

import {
  programAndVerifyFirmware,
  readBootloaderInfo,
} from "../site/flash-session.js";
import {
  CH58X_CANONICAL_RESET_READBACK,
  CH58X_RESET_CONFIG,
  COMMAND,
  deriveXorKey,
} from "../site/wchisp-protocol.js";

const uid = Uint8Array.of(1, 2, 3, 4, 5, 6, 0x09, 0x0c);

function validConfigPayload(registers = CH58X_RESET_CONFIG) {
  const payload = new Uint8Array(14);
  payload.set([0x07, 0x00]);
  payload.set(registers, 2);
  return payload;
}

function fakeTransport({
  configRegisters = CH58X_RESET_CONFIG,
  configPayload = null,
  badConfig = false,
  badVerifyAt = -1,
} = {}) {
  const packets = [];
  let verifyIndex = 0;
  const keyChecksum = deriveXorKey(uid).reduce((sum, byte) => (sum + byte) & 0xff, 0);
  return {
    packets,
    async transfer(packet) {
      packets.push(packet);
      switch (packet[0]) {
        case COMMAND.READ_CONFIG: {
          const payload = configPayload?.slice() || validConfigPayload(configRegisters);
          if (badConfig) payload[6] = 0x23;
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

test("read-only bootloader info sends only A1 then A7 before the button choice", async () => {
  const packets = [];
  const configPayload = new Uint8Array(26);
  configPayload.set([0x00, 0x02, 0x90, 0x00], 14);
  configPayload.set(uid, 18);

  const result = await readBootloaderInfo({
    transfer: async (packet) => {
      packets.push(packet);
      if (packet[0] === COMMAND.IDENTIFY) return Uint8Array.of(0x82, 0x16);
      if (packet[0] === COMMAND.READ_CONFIG) return configPayload;
      throw new Error(`unexpected command 0x${packet[0].toString(16)}`);
    },
  });

  assert.deepEqual(
    packets.map((packet) => packet[0]),
    [COMMAND.IDENTIFY, COMMAND.READ_CONFIG],
  );
  for (const postChoiceCommand of [
    COMMAND.WRITE_CONFIG,
    COMMAND.ERASE,
    COMMAND.ISP_KEY,
    COMMAND.PROGRAM,
    COMMAND.VERIFY,
    COMMAND.ISP_END,
  ]) {
    assert.ok(
      !packets.some((packet) => packet[0] === postChoiceCommand),
      `read-only info must not send post-choice command 0x${postChoiceCommand.toString(16)}`,
    );
  }
  assert.deepEqual([...packets[1]], [COMMAND.READ_CONFIG, 0x02, 0x00, 0x1f, 0x00]);
  assert.equal(result.identity.name, "CH582");
  assert.deepEqual([...result.config.bootloaderVersion], [0x00, 0x02, 0x90, 0x00]);
  assert.deepEqual([...result.config.uid], [...uid]);
  assert.ok(configPayload.every((byte) => byte === 0), "temporary config payload must be zeroed");
});

test("read-only bootloader info rejects another target before reading config", async () => {
  const packets = [];
  await assert.rejects(
    readBootloaderInfo({
      transfer: async (packet) => {
        packets.push(packet);
        return Uint8Array.of(0x83, 0x16);
      },
    }),
    /unsupported WCH target/,
  );
  assert.deepEqual(packets.map((packet) => packet[0]), [COMMAND.IDENTIFY]);
});

test("read-only bootloader info zeroes a malformed config payload", async () => {
  const configPayload = Uint8Array.of(1, 2, 3);
  await assert.rejects(
    readBootloaderInfo({
      transfer: async (packet) =>
        packet[0] === COMMAND.IDENTIFY
          ? Uint8Array.of(0x82, 0x16)
          : configPayload,
    }),
    /configuration response is missing/,
  );
  assert.deepEqual([...configPayload], [0, 0, 0]);
});

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

test("canonical CH582 reset normalization proceeds to erase and verification", async () => {
  const transport = fakeTransport({
    configRegisters: CH58X_CANONICAL_RESET_READBACK,
  });
  const result = await programAndVerifyFirmware({
    padded: new Uint8Array(1024),
    eraseSectors: 8,
    uid,
    transfer: transport.transfer,
    reset: async () => true,
    randomByte: () => 0,
    wait: async () => {},
  });

  assert.deepEqual(transport.packets.slice(0, 3).map((packet) => packet[0]), [
    COMMAND.WRITE_CONFIG,
    COMMAND.READ_CONFIG,
    COMMAND.ERASE,
  ]);
  assert.equal(result.chunks, 19);
});

test("unsupported configuration readback stops before erase", async () => {
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
    /configuration reset did not match an accepted readback/,
  );
  assert.deepEqual(transport.packets.map((packet) => packet[0]), [
    COMMAND.WRITE_CONFIG,
    COMMAND.READ_CONFIG,
  ]);
});

test("malformed configuration readback stops before erase", async () => {
  const transport = fakeTransport({ configPayload: new Uint8Array(13) });
  await assert.rejects(
    programAndVerifyFirmware({
      padded: new Uint8Array(1024),
      eraseSectors: 8,
      uid,
      transfer: transport.transfer,
      reset: async () => true,
      randomByte: () => 0,
    }),
    /configuration response is missing CH58x registers/,
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
