import {
  COMMAND,
  CH582_FLASH_BYTES,
  PROGRAM_CHUNK_BYTES,
  SECTOR_BYTES,
  dataPacket,
  deriveXorKey,
  erasePacket,
  isResetConfig,
  ispKeyPacket,
  parseConfigRegisters,
  readConfigPacket,
  resetConfigPacket,
  xorChunk,
} from "./wchisp-protocol.js";

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

export async function programAndVerifyFirmware({
  padded,
  eraseSectors,
  uid,
  transfer,
  reset,
  randomByte,
  wait = async () => {},
  onEvent = () => {},
}) {
  if (!(padded instanceof Uint8Array) || padded.byteLength === 0) {
    throw new TypeError("padded firmware must be a non-empty Uint8Array");
  }
  if (padded.byteLength % SECTOR_BYTES !== 0) {
    throw new RangeError("padded firmware length must be aligned to one KiB");
  }
  const expectedEraseSectors = Math.max(8, padded.byteLength / SECTOR_BYTES + 1);
  if (!Number.isInteger(eraseSectors) || eraseSectors !== expectedEraseSectors) {
    throw new RangeError("erase sector count is invalid");
  }
  if (eraseSectors * SECTOR_BYTES > CH582_FLASH_BYTES) {
    throw new RangeError("erase plan exceeds CH582 code flash");
  }
  requireFunction(transfer, "transfer");
  requireFunction(reset, "reset");
  requireFunction(randomByte, "randomByte");
  requireFunction(wait, "wait");
  requireFunction(onEvent, "onEvent");

  const key = deriveXorKey(uid);
  const chunks = Math.ceil(padded.byteLength / PROGRAM_CHUNK_BYTES);
  const emit = (event) => {
    try {
      onEvent(event);
    } catch {
      // UI rendering must never interrupt an in-flight hardware transaction.
    }
  };

  try {
    emit({ phase: "config-reset", chunks });
    await transfer(resetConfigPacket());
    const resetRegisters = parseConfigRegisters(await transfer(readConfigPacket(0x07)));
    if (!isResetConfig(resetRegisters)) {
      throw new Error("CH58x configuration reset did not match readback");
    }
    emit({ phase: "config-verified", chunks });

    emit({ phase: "erase", eraseSectors, chunks });
    await transfer(erasePacket(eraseSectors));
    await wait(1000);

    emit({ phase: "program-key", chunks });
    await beginKeySession(key, transfer);
    for (let index = 0; index < chunks; index += 1) {
      const address = index * PROGRAM_CHUNK_BYTES;
      const chunk = padded.slice(address, address + PROGRAM_CHUNK_BYTES);
      await transfer(
        dataPacket(COMMAND.PROGRAM, address, randomByte(), xorChunk(chunk, key)),
      );
      emit({ phase: "program", index: index + 1, chunks });
    }
    await transfer(
      dataPacket(COMMAND.PROGRAM, padded.byteLength, randomByte(), new Uint8Array()),
    );
    emit({ phase: "program-finalized", chunks });
    await wait(500);

    emit({ phase: "verify-key", chunks });
    await beginKeySession(key, transfer);
    for (let index = 0; index < chunks; index += 1) {
      const address = index * PROGRAM_CHUNK_BYTES;
      const chunk = padded.slice(address, address + PROGRAM_CHUNK_BYTES);
      const response = await transfer(
        dataPacket(COMMAND.VERIFY, address, randomByte(), xorChunk(chunk, key)),
      );
      if (response[0] !== 0x00) {
        throw new Error(`verify mismatch at address 0x${address.toString(16)}`);
      }
      emit({ phase: "verify", index: index + 1, chunks });
    }

    emit({ phase: "verified", chunks });
    const resetAcknowledged = await reset();
    emit({ phase: "complete", chunks, resetAcknowledged });
    return { chunks, resetAcknowledged };
  } finally {
    key.fill(0);
  }
}

async function beginKeySession(key, transfer) {
  const response = await transfer(ispKeyPacket());
  const checksum = key.reduce((sum, byte) => (sum + byte) & 0xff, 0);
  if (response[0] !== checksum) {
    throw new Error("bootloader ISP key checksum did not match");
  }
}
