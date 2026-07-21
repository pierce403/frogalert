import assert from "node:assert/strict";
import test from "node:test";

import {
  browserCapabilityReport,
  configurationSummary,
  decodeGattText,
  firmwareArtifactUrl,
  firmwareManifestUrl,
  isMobileNavigator,
  protectedFirmwareExplanation,
  usbDescriptorSummary,
  validateWchUsbConfiguration,
} from "../site/flash-support.js";
import { CH58X_RESET_CONFIG } from "../site/wchisp-protocol.js";

test("capability report treats Android WebUSB as phone-capable but feature-gated", () => {
  const report = browserCapabilityReport({
    secureContext: true,
    hasWebUsb: true,
    hasWebBluetooth: true,
    mobile: true,
    userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/150 Mobile",
  });
  assert.equal(report.canFlash, true);
  assert.match(report.phoneGuidance, /USB OTG\/data adapter/);
  assert.match(report.phoneGuidance, /additional USB permission prompt/);
  assert.equal(isMobileNavigator({ userAgentData: { mobile: true } }), true);
});

test("capability report refuses to imply iPhone WebUSB support", () => {
  const report = browserCapabilityReport({
    secureContext: true,
    hasWebUsb: false,
    hasWebBluetooth: false,
    mobile: true,
    userAgent: "Mozilla/5.0 (iPhone)",
  });
  assert.equal(report.canFlash, false);
  assert.match(report.phoneGuidance, /do not expose WebUSB/);
  assert.match(report.phoneGuidance, /Android or desktop Chromium/);
});

test("GATT text decoder accepts browser value shapes and strips nul padding", () => {
  assert.equal(decodeGattText(new TextEncoder().encode("FrogAlert 0.1\0junk")), "FrogAlert 0.1");
  const bytes = new TextEncoder().encode("WCH\0");
  assert.equal(decodeGattText(new DataView(bytes.buffer)), "WCH");
  assert.equal(decodeGattText(new Uint8Array()), null);
  assert.throws(() => decodeGattText("not bytes"), /GATT text/);
  assert.equal(decodeGattText(new TextEncoder().encode(`frog\n${"x".repeat(200)}`)).length, 96);
});

test("site module URLs resolve release assets from root on both pages", () => {
  const moduleUrl = "https://frogalert.org/site/app.js";
  assert.equal(
    firmwareManifestUrl(moduleUrl).href,
    "https://frogalert.org/firmware/releases/manifest.json",
  );
  assert.equal(
    firmwareArtifactUrl("frogalert.bin", moduleUrl).href,
    "https://frogalert.org/firmware/releases/frogalert.bin",
  );
  assert.throws(() => firmwareArtifactUrl("../bad.bin", moduleUrl), /safe raw BIN/);
});

test("USB descriptors omit serial data and configuration is conservatively summarized", () => {
  assert.deepEqual(
    usbDescriptorSummary({
      vendorId: 0x4348,
      productId: 0x55e0,
      productName: "WCH ISP",
      manufacturerName: "WCH",
      serialNumber: "do-not-display",
      deviceVersionMajor: 2,
      deviceVersionMinor: 9,
      deviceVersionSubminor: 0,
    }),
    {
      vidPid: "4348:55e0",
      product: "WCH ISP",
      manufacturer: "WCH",
      deviceVersion: "2.9.0",
    },
  );
  assert.equal(configurationSummary(CH58X_RESET_CONFIG).matchesReviewedDefaults, true);
  assert.match(configurationSummary(new Uint8Array(12)).label, /does not match.*reset.*before erase/);
  assert.match(protectedFirmwareExplanation(), /current firmware remains unknown/);
});

test("WCH USB descriptor gate requires interface zero and bulk endpoint two in/out", () => {
  const configuration = {
    configurationValue: 1,
    interfaces: [
      {
        interfaceNumber: 0,
        alternate: {
          endpoints: [
            { endpointNumber: 2, direction: "out", type: "bulk" },
            { endpointNumber: 2, direction: "in", type: "bulk" },
          ],
        },
      },
    ],
  };
  assert.deepEqual(validateWchUsbConfiguration(configuration), {
    interfaceNumber: 0,
    endpointNumber: 2,
  });
  assert.throws(
    () =>
      validateWchUsbConfiguration({
        ...configuration,
        interfaces: [{ interfaceNumber: 0, alternate: { endpoints: [] } }],
      }),
    /bulk endpoint 2/,
  );
});
