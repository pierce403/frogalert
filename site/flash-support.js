import { isResetConfig } from "./wchisp-protocol.js";

export const BADGE_SERVICE = 0xfee0;
export const BADGE_CHARACTERISTIC = 0xfee1;
export const NEXT_GEN_SERVICE = 0xf055;
export const DEVICE_INFORMATION_SERVICE = 0x180a;
export const MODEL_NUMBER_CHARACTERISTIC = 0x2a24;
export const FIRMWARE_REVISION_CHARACTERISTIC = 0x2a26;
export const MANUFACTURER_NAME_CHARACTERISTIC = 0x2a29;

function formatHex(value, width) {
  return Number(value).toString(16).padStart(width, "0");
}

export function isMobileNavigator(navigatorLike = {}) {
  if (typeof navigatorLike.userAgentData?.mobile === "boolean") {
    return navigatorLike.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigatorLike.userAgent || ""));
}

export function browserCapabilityReport({
  secureContext = false,
  hasWebUsb = false,
  hasWebBluetooth = false,
  mobile = false,
  userAgent = "",
} = {}) {
  const android = /Android/i.test(String(userAgent));
  let phoneGuidance = "Desktop Chrome or Chromium Edge is the primary supported path.";
  if (mobile && android && hasWebUsb) {
    phoneGuidance =
      "Android WebUSB is available. Use current Chrome or another compatible Chromium browser, a USB OTG/data adapter, and accept Android's additional USB permission prompt.";
  } else if (mobile && /iPhone|iPad|iPod/i.test(String(userAgent))) {
    phoneGuidance =
      "iPhone and iPad browsers do not expose WebUSB. This device can read the instructions, but flashing requires compatible Android or desktop Chromium.";
  } else if (mobile && !hasWebUsb) {
    phoneGuidance =
      "This mobile browser does not expose WebUSB. Use current Chrome on Android with USB OTG, or desktop Chrome/Edge.";
  }

  return {
    secureContext,
    hasWebUsb,
    hasWebBluetooth,
    mobile,
    canFlash: secureContext && hasWebUsb,
    phoneGuidance,
  };
}

export function decodeGattText(value) {
  if (value == null) return null;
  let bytes;
  if (value instanceof Uint8Array) {
    bytes = value;
  } else if (value instanceof DataView) {
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value);
  } else {
    throw new TypeError("GATT text must be an ArrayBuffer, DataView, or Uint8Array");
  }
  const end = bytes.indexOf(0);
  const text = new TextDecoder()
    .decode(end === -1 ? bytes : bytes.slice(0, end))
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 96) : null;
}

export function firmwareManifestUrl(moduleUrl) {
  return new URL("../firmware/releases/manifest.json", moduleUrl);
}

export function firmwareArtifactUrl(filename, moduleUrl) {
  if (typeof filename !== "string" || !/^[a-zA-Z0-9._-]+\.bin$/.test(filename)) {
    throw new Error("firmware filename is not a safe raw BIN name");
  }
  return new URL(`../firmware/releases/${encodeURIComponent(filename)}`, moduleUrl);
}

export function usbDescriptorSummary(device = {}) {
  const vendorId = Number(device.vendorId || 0);
  const productId = Number(device.productId || 0);
  return {
    vidPid: `${formatHex(vendorId, 4)}:${formatHex(productId, 4)}`,
    product: String(device.productName || "not reported"),
    manufacturer: String(device.manufacturerName || "not reported"),
    deviceVersion: [
      device.deviceVersionMajor,
      device.deviceVersionMinor,
      device.deviceVersionSubminor,
    ].every(Number.isInteger)
      ? `${device.deviceVersionMajor}.${device.deviceVersionMinor}.${device.deviceVersionSubminor}`
      : "not reported",
  };
}

export function validateWchUsbConfiguration(configuration) {
  if (!configuration || configuration.configurationValue !== 1) {
    throw new Error("WCH bootloader must use USB configuration 1");
  }
  const usbInterface = [...(configuration.interfaces || [])].find(
    (candidate) => candidate.interfaceNumber === 0,
  );
  if (!usbInterface) throw new Error("WCH bootloader interface 0 is missing");
  const alternate =
    usbInterface.alternate ||
    [...(usbInterface.alternates || [])].find((candidate) => candidate.alternateSetting === 0) ||
    [...(usbInterface.alternates || [])][0];
  if (!alternate) throw new Error("WCH bootloader interface 0 has no alternate descriptor");
  const endpoints = [...(alternate.endpoints || [])];
  const hasBulkOut = endpoints.some(
    (endpoint) =>
      endpoint.endpointNumber === 2 && endpoint.direction === "out" && endpoint.type === "bulk",
  );
  const hasBulkIn = endpoints.some(
    (endpoint) =>
      endpoint.endpointNumber === 2 && endpoint.direction === "in" && endpoint.type === "bulk",
  );
  if (!hasBulkOut || !hasBulkIn) {
    throw new Error("WCH bootloader must expose bulk endpoint 2 in both directions");
  }
  return { interfaceNumber: 0, endpointNumber: 2 };
}

export function configurationSummary(registers) {
  if (!(registers instanceof Uint8Array) || registers.byteLength !== 12) {
    return {
      matchesReviewedDefaults: false,
      label: "configuration response unavailable",
    };
  }
  const matchesReviewedDefaults = isResetConfig(registers);
  return {
    matchesReviewedDefaults,
    label: matchesReviewedDefaults
      ? "reviewed CH58x defaults already present"
      : "does not match the reviewed defaults; an exact reset + readback is required before erase",
  };
}

export function protectedFirmwareExplanation() {
  return "The WCH ISP protocol does not expose protected application bytes or a trustworthy application version. Probe the running badge over Bluetooth for an optional Device Information version; otherwise current firmware remains unknown.";
}
