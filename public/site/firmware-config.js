const MAGIC_TEXT = "FROGALERTCFGv1\0\0";
const MAGIC_BYTES = Uint8Array.from(MAGIC_TEXT, (character) => character.charCodeAt(0));

export const FIRMWARE_CONFIG_MAGIC = Uint8Array.from(MAGIC_BYTES);
export const FIRMWARE_CONFIG_SCHEMA_VERSION = 1;
export const FIRMWARE_CONFIG_BLOCK_SIZE = 384;
export const MAX_CUSTOM_MONITORING_RULES = 8;

export const HARDWARE_PROFILES = Object.freeze({
  B1144C_250901_USB_C: 1,
  B1144C_260404_USB_C: 2,
});

export const BUILTIN_TARGET_BITS = Object.freeze({
  POLICE: 1 << 0,
  FLIPPER: 1 << 1,
  KARR: 1 << 2,
  RAY_BAN: 1 << 3,
  BADGEMAGIC: 1 << 4,
});

export const MATCH_TYPES = Object.freeze({
  NAME_CONTAINS: 1,
  NAME_PREFIX: 2,
  NAME_EXACT: 3,
  PUBLIC_OUI: 4,
  SERVICE_16_BIT: 5,
});

export const ALL_BUILTIN_TARGETS = Object.values(BUILTIN_TARGET_BITS).reduce(
  (mask, bit) => mask | bit,
  0,
);

const HEADER_SIZE = 32;
const CUSTOM_RULE_SIZE = 44;
const CUSTOM_VALUE_SIZE = 24;
const CUSTOM_MESSAGE_SIZE = 16;
const CRC_OFFSET = 28;
const CRC_SIZE = 4;
const KNOWN_HARDWARE_PROFILES = new Set(Object.values(HARDWARE_PROFILES));
const KNOWN_MATCH_TYPES = new Set(Object.values(MATCH_TYPES));

const EMPTY_RULES = Object.freeze([]);
export const DEFAULT_FIRMWARE_CONFIG = Object.freeze({
  hardwareProfile: HARDWARE_PROFILES.B1144C_260404_USB_C,
  builtInTargets: ALL_BUILTIN_TARGETS,
  customRules: EMPTY_RULES,
});

export function createDefaultFirmwareConfig(
  hardwareProfile = HARDWARE_PROFILES.B1144C_260404_USB_C,
) {
  assertHardwareProfile(hardwareProfile);
  return {
    hardwareProfile,
    builtInTargets: ALL_BUILTIN_TARGETS,
    customRules: [],
  };
}

export function encodeFirmwareConfig(config = DEFAULT_FIRMWARE_CONFIG) {
  const normalized = normalizeConfig(config);
  const block = new Uint8Array(FIRMWARE_CONFIG_BLOCK_SIZE);
  const view = new DataView(block.buffer);

  block.set(MAGIC_BYTES, 0);
  view.setUint16(16, FIRMWARE_CONFIG_SCHEMA_VERSION, true);
  view.setUint16(18, FIRMWARE_CONFIG_BLOCK_SIZE, true);
  block[20] = normalized.hardwareProfile;
  block[21] = normalized.customRules.length;
  view.setUint16(22, 0, true);
  view.setUint32(24, normalized.builtInTargets, true);

  normalized.customRules.forEach((rule, index) => {
    const offset = HEADER_SIZE + index * CUSTOM_RULE_SIZE;
    block[offset] = rule.type;
    block[offset + 1] = rule.valueBytes.length;
    block[offset + 2] = rule.messageBytes.length;
    block[offset + 3] = 0;
    block.set(rule.valueBytes, offset + 4);
    block.set(rule.messageBytes, offset + 4 + CUSTOM_VALUE_SIZE);
  });

  view.setUint32(CRC_OFFSET, firmwareConfigCrc32(block), true);
  return block;
}

export function decodeFirmwareConfig(input) {
  const block = requireBytes(input, "firmware configuration block");
  if (block.byteLength !== FIRMWARE_CONFIG_BLOCK_SIZE) {
    throw new RangeError(
      `firmware configuration block must be exactly ${FIRMWARE_CONFIG_BLOCK_SIZE} bytes`,
    );
  }
  if (!bytesEqual(block.subarray(0, MAGIC_BYTES.length), MAGIC_BYTES)) {
    throw new Error("firmware configuration magic does not match");
  }

  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const schemaVersion = view.getUint16(16, true);
  if (schemaVersion !== FIRMWARE_CONFIG_SCHEMA_VERSION) {
    throw new Error(
      `unsupported firmware configuration schema ${schemaVersion}; expected ${FIRMWARE_CONFIG_SCHEMA_VERSION}`,
    );
  }

  const declaredSize = view.getUint16(18, true);
  if (declaredSize !== FIRMWARE_CONFIG_BLOCK_SIZE) {
    throw new Error(
      `firmware configuration declares ${declaredSize} bytes; expected ${FIRMWARE_CONFIG_BLOCK_SIZE}`,
    );
  }

  const hardwareProfile = block[20];
  assertHardwareProfile(hardwareProfile);
  const customCount = block[21];
  if (customCount > MAX_CUSTOM_MONITORING_RULES) {
    throw new RangeError(
      `firmware configuration has ${customCount} custom rules; maximum is ${MAX_CUSTOM_MONITORING_RULES}`,
    );
  }
  if (view.getUint16(22, true) !== 0) {
    throw new Error("firmware configuration header reserved bytes must be zero");
  }

  const builtInTargets = view.getUint32(24, true);
  assertBuiltInTargets(builtInTargets);

  const storedCrc = view.getUint32(CRC_OFFSET, true);
  const calculatedCrc = firmwareConfigCrc32(block);
  if (storedCrc !== calculatedCrc) {
    throw new Error(
      `firmware configuration CRC32 mismatch: stored ${formatHex32(storedCrc)}, calculated ${formatHex32(calculatedCrc)}`,
    );
  }

  const customRules = [];
  for (let index = 0; index < MAX_CUSTOM_MONITORING_RULES; index += 1) {
    const offset = HEADER_SIZE + index * CUSTOM_RULE_SIZE;
    const entry = block.subarray(offset, offset + CUSTOM_RULE_SIZE);
    if (index >= customCount) {
      if (!allZero(entry)) {
        throw new Error(`unused custom monitoring rule ${index + 1} must contain only zero bytes`);
      }
      continue;
    }

    const type = entry[0];
    if (!KNOWN_MATCH_TYPES.has(type)) {
      throw new Error(`custom monitoring rule ${index + 1} has unknown match type ${type}`);
    }
    const valueLength = entry[1];
    const messageLength = entry[2];
    if (entry[3] !== 0) {
      throw new Error(`custom monitoring rule ${index + 1} reserved byte must be zero`);
    }
    if (valueLength === 0 || valueLength > CUSTOM_VALUE_SIZE) {
      throw new RangeError(
        `custom monitoring rule ${index + 1} value length must be between 1 and ${CUSTOM_VALUE_SIZE}`,
      );
    }
    if (messageLength === 0 || messageLength > CUSTOM_MESSAGE_SIZE) {
      throw new RangeError(
        `custom monitoring rule ${index + 1} message length must be between 1 and ${CUSTOM_MESSAGE_SIZE}`,
      );
    }

    const valueStart = 4;
    const messageStart = valueStart + CUSTOM_VALUE_SIZE;
    assertZeroPadding(
      entry.subarray(valueStart + valueLength, messageStart),
      `custom monitoring rule ${index + 1} value`,
    );
    assertZeroPadding(
      entry.subarray(messageStart + messageLength),
      `custom monitoring rule ${index + 1} message`,
    );

    const value = decodePrintableAscii(
      entry.subarray(valueStart, valueStart + valueLength),
      `custom monitoring rule ${index + 1} value`,
    );
    const message = decodePrintableAscii(
      entry.subarray(messageStart, messageStart + messageLength),
      `custom monitoring rule ${index + 1} message`,
    );
    const normalizedValue = normalizeRuleValue(type, value, index);
    if (normalizedValue !== value) {
      throw new Error(
        `custom monitoring rule ${index + 1} value is not in canonical ${matchTypeLabel(type)} form`,
      );
    }
    customRules.push({ type, value, message });
  }

  return {
    schemaVersion,
    hardwareProfile,
    builtInTargets,
    customRules,
  };
}

export function findUniqueFirmwareConfigBlock(input) {
  const firmware = requireBytes(input, "firmware image");
  const offsets = [];
  const finalStart = firmware.length - MAGIC_BYTES.length;

  for (let offset = 0; offset <= finalStart; offset += 1) {
    if (matchesAt(firmware, MAGIC_BYTES, offset)) offsets.push(offset);
  }

  if (offsets.length === 0) {
    throw new Error("firmware image does not contain a FrogAlert configuration block");
  }
  if (offsets.length > 1) {
    throw new Error(
      `firmware image contains ${offsets.length} FrogAlert configuration blocks; expected exactly one`,
    );
  }
  if (offsets[0] + FIRMWARE_CONFIG_BLOCK_SIZE > firmware.length) {
    throw new Error(
      `FrogAlert configuration block at offset ${offsets[0]} is truncated in the firmware image`,
    );
  }
  return offsets[0];
}

export function patchFirmwareConfig(input, config) {
  const firmware = requireBytes(input, "firmware image");
  const offset = findUniqueFirmwareConfigBlock(firmware);
  const current = decodeFirmwareConfig(
    firmware.subarray(offset, offset + FIRMWARE_CONFIG_BLOCK_SIZE),
  );
  const replacement = encodeFirmwareConfig(config);
  const replacementProfile = replacement[20];

  if (replacementProfile !== current.hardwareProfile) {
    throw new Error(
      `configuration targets hardware profile ${replacementProfile}, but firmware was built for profile ${current.hardwareProfile}`,
    );
  }

  const patched = Uint8Array.from(firmware);
  patched.set(replacement, offset);
  return patched;
}

export function firmwareConfigCrc32(input) {
  const bytes = requireBytes(input, "CRC32 input");
  if (bytes.byteLength !== FIRMWARE_CONFIG_BLOCK_SIZE) {
    throw new RangeError(
      `CRC32 input must be exactly ${FIRMWARE_CONFIG_BLOCK_SIZE} bytes`,
    );
  }

  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = index >= CRC_OFFSET && index < CRC_OFFSET + CRC_SIZE ? 0 : bytes[index];
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeConfig(config) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("firmware configuration must be an object");
  }

  const { hardwareProfile, builtInTargets, customRules = [] } = config;
  assertHardwareProfile(hardwareProfile);
  assertBuiltInTargets(builtInTargets);
  if (!Array.isArray(customRules)) {
    throw new TypeError("customRules must be an array");
  }
  if (customRules.length > MAX_CUSTOM_MONITORING_RULES) {
    throw new RangeError(
      `customRules has ${customRules.length} entries; maximum is ${MAX_CUSTOM_MONITORING_RULES}`,
    );
  }

  return {
    hardwareProfile,
    builtInTargets,
    customRules: customRules.map(normalizeRule),
  };
}

function normalizeRule(rule, index) {
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
    throw new TypeError(`custom monitoring rule ${index + 1} must be an object`);
  }
  if (!KNOWN_MATCH_TYPES.has(rule.type)) {
    throw new Error(`custom monitoring rule ${index + 1} has unknown match type ${rule.type}`);
  }

  const value = normalizeRuleValue(rule.type, rule.value, index);
  const valueBytes = encodePrintableAscii(
    value,
    CUSTOM_VALUE_SIZE,
    `custom monitoring rule ${index + 1} value`,
  );
  const messageBytes = encodePrintableAscii(
    rule.message,
    CUSTOM_MESSAGE_SIZE,
    `custom monitoring rule ${index + 1} message`,
  );
  return { type: rule.type, valueBytes, messageBytes };
}

function normalizeRuleValue(type, input, index) {
  const label = `custom monitoring rule ${index + 1} value`;
  if (typeof input !== "string") {
    throw new TypeError(`${label} must be a string`);
  }

  if (type === MATCH_TYPES.PUBLIC_OUI) {
    const compact = input
      .trim()
      .replaceAll(":", "")
      .replaceAll("-", "")
      .toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(compact)) {
      throw new Error(`${label} must be a public OUI such as 00:25:DF`);
    }
    return compact.match(/.{2}/g).join(":");
  }

  if (type === MATCH_TYPES.SERVICE_16_BIT) {
    const compact = input.trim().replace(/^0x/i, "").toUpperCase();
    if (!/^[0-9A-F]{4}$/.test(compact)) {
      throw new Error(`${label} must be a four-digit 16-bit service such as FEE0`);
    }
    return compact;
  }

  if (input.trim().length === 0) {
    throw new Error(`${label} must contain a non-whitespace name`);
  }
  return input;
}

function assertHardwareProfile(profile) {
  if (!Number.isInteger(profile) || !KNOWN_HARDWARE_PROFILES.has(profile)) {
    throw new RangeError(
      `hardwareProfile must be ${HARDWARE_PROFILES.B1144C_250901_USB_C} (B1144C_250901_USB_C) or ${HARDWARE_PROFILES.B1144C_260404_USB_C} (B1144C_260404_USB_C)`,
    );
  }
}

function assertBuiltInTargets(mask) {
  if (!Number.isSafeInteger(mask) || mask < 0 || mask > 0xffffffff) {
    throw new RangeError("builtInTargets must be an unsigned 32-bit integer");
  }
  const unknownBits = mask & ~ALL_BUILTIN_TARGETS;
  if (unknownBits !== 0) {
    throw new RangeError(
      `builtInTargets contains unknown target bits ${formatHex32(unknownBits >>> 0)}`,
    );
  }
}

function encodePrintableAscii(value, maximumLength, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  if (value.length === 0) throw new RangeError(`${label} must not be empty`);
  if (value.length > maximumLength) {
    throw new RangeError(`${label} must be at most ${maximumLength} ASCII characters`);
  }

  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`${label} must contain printable ASCII characters only`);
    }
    bytes[index] = code;
  }
  return bytes;
}

function decodePrintableAscii(bytes, label) {
  let value = "";
  for (const byte of bytes) {
    if (byte < 0x20 || byte > 0x7e) {
      throw new Error(`${label} must contain printable ASCII characters only`);
    }
    value += String.fromCharCode(byte);
  }
  return value;
}

function assertZeroPadding(bytes, label) {
  if (!allZero(bytes)) throw new Error(`${label} padding bytes must be zero`);
}

function requireBytes(input, label) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  return input;
}

function matchesAt(haystack, needle, offset) {
  for (let index = 0; index < needle.length; index += 1) {
    if (haystack[offset + index] !== needle[index]) return false;
  }
  return true;
}

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  return matchesAt(left, right, 0);
}

function allZero(bytes) {
  return bytes.every((byte) => byte === 0);
}

function matchTypeLabel(type) {
  if (type === MATCH_TYPES.PUBLIC_OUI) return "OUI";
  if (type === MATCH_TYPES.SERVICE_16_BIT) return "16-bit service";
  return "ASCII";
}

function formatHex32(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}
