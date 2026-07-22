export const CH58X_USER_OPTION_OFFSET = 0x14;
export const CH58X_USER_OPTION_MAGIC = 0xf5f9bda9;

function asImageBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("CH58x firmware image must be a Uint8Array");
  }
  if (bytes.byteLength < CH58X_USER_OPTION_OFFSET + 4) {
    throw new Error("CH58x firmware image is too short to contain the startup option sentinel");
  }
  return bytes;
}

export function readCh58xUserOptionMagic(bytes) {
  const image = asImageBytes(bytes);
  return new DataView(image.buffer, image.byteOffset, image.byteLength).getUint32(
    CH58X_USER_OPTION_OFFSET,
    true,
  );
}

export function assertCh58xUserOptionMagic(bytes) {
  if (readCh58xUserOptionMagic(bytes) !== CH58X_USER_OPTION_MAGIC) {
    throw new Error("CH58x firmware image is missing the WCH startup sentinel at offset 0x14");
  }
  return true;
}

export function finalizeCh58xFirmware(bytes) {
  const image = Uint8Array.from(asImageBytes(bytes));
  const existing = readCh58xUserOptionMagic(image);
  if (existing !== 0 && existing !== CH58X_USER_OPTION_MAGIC) {
    throw new Error(
      `refusing to replace non-reserved CH58x vector data at offset 0x14 (0x${existing.toString(16).padStart(8, "0")})`,
    );
  }
  new DataView(image.buffer, image.byteOffset, image.byteLength).setUint32(
    CH58X_USER_OPTION_OFFSET,
    CH58X_USER_OPTION_MAGIC,
    true,
  );
  assertCh58xUserOptionMagic(image);
  return image;
}
