import {
  COMMAND,
  WCH_USB_FILTERS,
  formatBootloaderVersion,
  identifyPacket,
  ispEndPacket,
  parseConfig,
  parseIdentity,
  parseResponse,
  readConfigPacket,
  sha256Hex,
  validateFirmware,
  validateRecoveryDescriptor,
  validateReleaseDescriptor,
} from "./wchisp-protocol.js";
import {
  canEnableFlash,
  canProgramArtifact,
  nextArtifactGeneration,
  revisionInputTransition,
} from "./flasher-state.js";
import { programAndVerifyFirmware } from "./flash-session.js";
import {
  BADGE_CHARACTERISTIC,
  BADGE_SERVICE,
  DEVICE_INFORMATION_SERVICE,
  FIRMWARE_REVISION_CHARACTERISTIC,
  MANUFACTURER_NAME_CHARACTERISTIC,
  MODEL_NUMBER_CHARACTERISTIC,
  NEXT_GEN_SERVICE,
  browserCapabilityReport,
  configurationSummary,
  decodeGattText,
  firmwareArtifactUrl,
  firmwareManifestUrl,
  isMobileNavigator,
  protectedFirmwareExplanation,
  usbDescriptorSummary,
  validateWchUsbConfiguration,
} from "./flash-support.js";

const USB_ENDPOINT = 2;
const USB_READ_BYTES = 64;

const state = {
  usbDevice: null,
  chip: null,
  config: null,
  firmware: null,
  flashing: false,
  bluetoothDevice: null,
  artifactGeneration: 0,
  activeFlashDevice: null,
  recoveryImages: [],
  releaseSummary: { message: "Loading release manifest…", tone: "neutral" },
  wakeLock: null,
  activeStage: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const destructivePage = document.body.dataset.flashMode === "program";

const elements = {
  capability: $("#capability-status"),
  bluetoothButton: $("#bluetooth-connect"),
  bluetoothStatus: $("#bluetooth-status"),
  usbButton: $("#usb-connect"),
  usbStatus: $("#usb-status"),
  chipName: $("#chip-name"),
  bootloaderVersion: $("#bootloader-version"),
  uidStatus: $("#uid-status"),
  firmwareInput: $("#firmware-file"),
  pcbMarking: $("#pcb-marking"),
  pcbRevision: $("#pcb-revision"),
  releaseSelect: $("#release-select"),
  releaseStatus: $("#release-status"),
  recoveryButton: $("#recovery-prepare"),
  recoveryBoardConfirmation: $("#recovery-board-confirmation"),
  recoveryStatus: $("#recovery-status"),
  recoveryVersion: $("#recovery-version"),
  recoveryTarget: $("#recovery-target"),
  recoverySource: $("#recovery-source"),
  recoverySize: $("#recovery-size"),
  recoveryHash: $("#recovery-hash"),
  recoveryVerification: $("#recovery-verification"),
  firmwareName: $("#firmware-name"),
  firmwareSize: $("#firmware-size"),
  firmwareHash: $("#firmware-hash"),
  firmwareRevision: $("#firmware-revision"),
  confirmations: $$(".flash-confirmation"),
  flashButton: $("#flash-button"),
  progress: $("#flash-progress"),
  progressLabel: $("#progress-label"),
  log: $("#flash-log"),
  matrix: $("#led-matrix"),
  platformStatus: $("#platform-status"),
  phoneGuidance: $("#phone-guidance"),
  runtimeDeviceName: $("#runtime-device-name"),
  runtimeProfile: $("#runtime-profile"),
  runtimeFirmware: $("#runtime-firmware"),
  runtimeManufacturer: $("#runtime-manufacturer"),
  runtimeModel: $("#runtime-model"),
  usbId: $("#usb-id"),
  usbProduct: $("#usb-product"),
  usbManufacturer: $("#usb-manufacturer"),
  usbVersion: $("#usb-version"),
  usbConfigState: $("#usb-config-state"),
  currentFirmwareStatus: $("#current-firmware-status"),
  boardDetectionStatus: $("#board-detection-status"),
  usbDisconnectButton: $("#usb-disconnect"),
  authorizedUsbStatus: $("#authorized-usb-status"),
  wakeLockStatus: $("#wake-lock-status"),
  secureContextStatus: $("#secure-context-status"),
  webUsbSupportStatus: $("#webusb-support-status"),
  webBluetoothSupportStatus: $("#webbluetooth-support-status"),
  usbPermissionStatus: $("#usb-permission-status"),
  chipIdentity: $("#chip-identity"),
  badgeGattStatus: $("#badge-gatt-status"),
  pcbMarkingStatus: $("#pcb-marking-status"),
  matrixStatus: $("#matrix-status"),
  selectedProfileStatus: $("#selected-profile-status"),
  firmwareProvenance: $("#firmware-provenance"),
  firmwareVerification: $("#firmware-verification"),
  flashPhrase: $("#flash-phrase"),
  armedStatus: $("#armed-status"),
  copyLogButton: $("#copy-log"),
  stages: {
    identify: $("#stage-identify"),
    config: $("#stage-config"),
    erase: $("#stage-erase"),
    program: $("#stage-program"),
    verify: $("#stage-verify"),
    reset: $("#stage-reset"),
  },
};

const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
};

function renderMatrix(text) {
  if (!elements.matrix) return;
  const rows = 11;
  const columns = 44;
  const pixels = Array.from({ length: rows }, () => Array(columns).fill(false));
  const width = text.length * 6 - 1;
  const startX = Math.max(0, Math.floor((columns - width) / 2));
  const startY = 2;
  [...text].forEach((letter, letterIndex) => {
    (FONT[letter] || FONT.X).forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        const column = startX + letterIndex * 6 + x;
        if (column < columns && pixel === "1") pixels[startY + y][column] = true;
      });
    });
  });
  elements.matrix.replaceChildren(
    ...pixels.flatMap((row) =>
      row.map((active) => {
        const pixel = document.createElement("span");
        pixel.className = active ? "matrix-pixel is-on" : "matrix-pixel";
        return pixel;
      }),
    ),
  );
  elements.matrix.setAttribute("aria-label", `LED badge preview reading ${text}`);
}

function startMatrixPreview() {
  const frames = ["FROG", "ALERT"];
  let frame = 0;
  renderMatrix(frames[frame]);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.setInterval(() => {
    frame = (frame + 1) % frames.length;
    renderMatrix(frames[frame]);
  }, 2200);
}

function setStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function log(message, tone = "info") {
  const entry = document.createElement("li");
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  entry.dataset.tone = tone;
  entry.textContent = `${timestamp} — ${message}`;
  elements.log.append(entry);
  elements.log.scrollTop = elements.log.scrollHeight;
  if (elements.copyLogButton) elements.copyLogButton.disabled = false;
}

function setReleaseSummary(message, tone) {
  state.releaseSummary = { message, tone };
  setStatus(elements.releaseStatus, message, tone);
}

function restoreReleaseSummary() {
  setStatus(elements.releaseStatus, state.releaseSummary.message, state.releaseSummary.tone);
}

function updateProgress(value, label) {
  if (elements.progress) elements.progress.value = value;
  if (elements.progressLabel) elements.progressLabel.textContent = label;
}

function setStage(name, stageState) {
  const element = elements.stages[name];
  if (!element) return;
  if (stageState) element.dataset.state = stageState;
  else delete element.dataset.state;
  state.activeStage = stageState === "active" ? name : state.activeStage === name ? null : state.activeStage;
}

function resetStages() {
  state.activeStage = null;
  Object.values(elements.stages).forEach((element) => {
    if (element) delete element.dataset.state;
  });
}

function failActiveStage() {
  if (state.activeStage) setStage(state.activeStage, "failed");
}

function isTrustworthyContext() {
  return window.isSecureContext || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

function updateCapabilities() {
  const secure = isTrustworthyContext();
  const usb = "usb" in navigator;
  const bluetooth = "bluetooth" in navigator;
  const mobile = isMobileNavigator(navigator);
  const report = browserCapabilityReport({
    secureContext: secure,
    hasWebUsb: usb,
    hasWebBluetooth: bluetooth,
    mobile,
    userAgent: navigator.userAgent,
  });
  const summary = [secure ? "secure context" : "HTTPS required", usb ? "WebUSB API ready" : "no WebUSB", bluetooth ? "Web Bluetooth ready" : "no Web Bluetooth"];
  setStatus(elements.capability, summary.join(" · "), secure && usb ? "good" : "warning");
  setStatus(
    elements.secureContextStatus,
    secure ? "HTTPS / trustworthy context" : "Blocked — HTTPS required",
    secure ? "good" : "bad",
  );
  setStatus(
    elements.webUsbSupportStatus,
    usb ? "WebUSB API available" : "Unavailable in this browser",
    usb ? "good" : "warning",
  );
  setStatus(
    elements.webBluetoothSupportStatus,
    bluetooth ? "Web Bluetooth API available" : "Unavailable in this browser",
    bluetooth ? "good" : "warning",
  );
  setStatus(
    elements.usbPermissionStatus,
    usb ? "Not requested — press Connect when ready" : "Unavailable without WebUSB",
    usb ? "neutral" : "warning",
  );
  setStatus(
    elements.platformStatus,
    `${mobile ? "mobile" : "desktop"} browser · ${report.canFlash ? "WebUSB API eligible; device access not yet confirmed" : "browser flashing unavailable"}`,
    report.canFlash ? "good" : "warning",
  );
  setStatus(elements.phoneGuidance, report.phoneGuidance, report.canFlash ? "good" : "warning");
  setStatus(elements.currentFirmwareStatus, protectedFirmwareExplanation(), "warning");
  setStatus(
    elements.boardDetectionStatus,
    "Not detectable over USB or Bluetooth. Open the enclosure and record the physical PCB markings, CH582M package, 11×44 matrix, port layout, and LSE crystal.",
    "warning",
  );
  elements.usbButton.disabled = !secure || !usb;
  elements.bluetoothButton.disabled = !secure || !bluetooth;
  if (!secure) {
    setStatus(elements.usbStatus, "Open this page over HTTPS or localhost before connecting hardware.", "bad");
    setStatus(elements.bluetoothStatus, "Open this page over HTTPS or localhost before connecting hardware.", "bad");
  } else if (!usb) {
    setStatus(elements.usbStatus, "WebUSB is unavailable. Use current desktop Chrome/Edge or the wchisp CLI.", "warning");
  }
  if (secure && !bluetooth) {
    setStatus(elements.bluetoothStatus, "Web Bluetooth is unavailable in this browser. The official BadgeMagic app remains the fallback.", "warning");
  }
  refreshAuthorizedUsbStatus();
}

async function refreshAuthorizedUsbStatus() {
  if (!("usb" in navigator) || !isTrustworthyContext()) {
    setStatus(elements.authorizedUsbStatus, "No WebUSB access in this browser.", "warning");
    return;
  }
  try {
    const devices = await navigator.usb.getDevices();
    const wchDevices = devices.filter((device) =>
      WCH_USB_FILTERS.some(
        (filter) => device.vendorId === filter.vendorId && device.productId === filter.productId,
      ),
    );
    setStatus(
      elements.authorizedUsbStatus,
      wchDevices.length === 0
        ? "No previously authorized WCH bootloader is visible. Permission is requested only after you press Connect."
        : `${wchDevices.length} previously authorized WCH bootloader${wchDevices.length === 1 ? " is" : "s are"} attached. Press Connect to identify read-only.`,
      wchDevices.length === 0 ? "neutral" : "good",
    );
  } catch (error) {
    setStatus(elements.authorizedUsbStatus, `Authorized-device check failed: ${error.message}`, "warning");
  }
}

async function readOptionalGattText(service, characteristicId) {
  try {
    const characteristic = await service.getCharacteristic(characteristicId);
    return decodeGattText(await characteristic.readValue());
  } catch {
    return null;
  }
}

async function connectBluetooth() {
  let device = null;
  try {
    elements.bluetoothButton.disabled = true;
    setStatus(elements.bluetoothStatus, "Choose a running BadgeMagic-compatible badge…", "working");
    if (elements.badgeGattStatus) elements.badgeGattStatus.textContent = "Probe in progress";
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BADGE_SERVICE] }],
      optionalServices: [NEXT_GEN_SERVICE, 0x180a],
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BADGE_SERVICE);
    await service.getCharacteristic(BADGE_CHARACTERISTIC);
    let firmwareVersion = null;
    let manufacturer = null;
    let model = null;
    try {
      const deviceInformation = await server.getPrimaryService(DEVICE_INFORMATION_SERVICE);
      [firmwareVersion, manufacturer, model] = await Promise.all([
        readOptionalGattText(deviceInformation, FIRMWARE_REVISION_CHARACTERISTIC),
        readOptionalGattText(deviceInformation, MANUFACTURER_NAME_CHARACTERISTIC),
        readOptionalGattText(deviceInformation, MODEL_NUMBER_CHARACTERISTIC),
      ]);
    } catch {
      // Legacy BadgeMagic firmware commonly omits the Device Information service.
    }
    if (elements.runtimeDeviceName) elements.runtimeDeviceName.textContent = device.name || "name not reported";
    if (elements.runtimeProfile) elements.runtimeProfile.textContent = "FEE0 service + FEE1 characteristic detected";
    if (elements.badgeGattStatus) elements.badgeGattStatus.textContent = "FEE0/FEE1 detected";
    if (elements.runtimeFirmware) {
      elements.runtimeFirmware.textContent = firmwareVersion || "not exposed by this running firmware";
    }
    if (elements.runtimeManufacturer) elements.runtimeManufacturer.textContent = manufacturer || "not exposed";
    if (elements.runtimeModel) elements.runtimeModel.textContent = model || "not exposed";
    setStatus(
      elements.bluetoothStatus,
      `${device.name || "Badge"} exposes FEE0/FEE1. ${
        firmwareVersion
          ? `Device Information reports firmware ${firmwareVersion}.`
          : "No trustworthy firmware version was exposed."
      } Probe passed and the page disconnected; no content was changed.`,
      "good",
    );
  } catch (error) {
    const cancelled = error?.name === "NotFoundError";
    if (elements.badgeGattStatus) {
      elements.badgeGattStatus.textContent = cancelled ? "Not probed" : "FEE0/FEE1 not confirmed";
    }
    setStatus(elements.bluetoothStatus, cancelled ? "No badge selected." : `Badge probe failed: ${error.message}`, cancelled ? "neutral" : "bad");
  } finally {
    if (device?.gatt?.connected) device.gatt.disconnect();
    state.bluetoothDevice = null;
    elements.bluetoothButton.disabled = !("bluetooth" in navigator);
  }
}

function dataViewBytes(view) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

async function usbTransfer(packet, expectedDevice = null) {
  if (
    expectedDevice &&
    (state.usbDevice !== expectedDevice || state.activeFlashDevice !== expectedDevice)
  ) {
    throw new Error("USB device changed during the active flash session");
  }
  const device = expectedDevice || state.usbDevice;
  if (!device?.opened) throw new Error("WCH ISP device is not open");
  const sent = await withTimeout(device.transferOut(USB_ENDPOINT, packet), 8000, "USB write");
  if (sent.status !== "ok" || sent.bytesWritten !== packet.byteLength) {
    throw new Error(`USB write failed (${sent.status}, ${sent.bytesWritten || 0}/${packet.byteLength} bytes)`);
  }
  const received = await withTimeout(device.transferIn(USB_ENDPOINT, USB_READ_BYTES), 8000, "USB response");
  if (received.status !== "ok" || !received.data) {
    throw new Error(`USB read failed (${received.status})`);
  }
  return parseResponse(dataViewBytes(received.data), packet[0]);
}

async function connectUsb() {
  if (state.flashing) return;
  try {
    resetConfirmations();
    elements.usbButton.disabled = true;
    setStatus(elements.usbPermissionStatus, "Device chooser requested by your action.", "working");
    setStatus(elements.usbStatus, "Choose the WCH ISP device—not the running nametag…", "working");
    log("Requesting permission for a WCH USB ISP bootloader.");
    const device = await navigator.usb.requestDevice({ filters: WCH_USB_FILTERS });
    await device.open();
    state.usbDevice = device;
    if (!device.configuration) await device.selectConfiguration(1);
    if (device.configuration?.configurationValue !== 1) {
      throw new Error("bootloader did not select USB configuration 1");
    }
    validateWchUsbConfiguration(device.configuration);
    await device.claimInterface(0);

    const identity = parseIdentity(await usbTransfer(identifyPacket()));
    const configPayload = await usbTransfer(readConfigPacket());
    let config;
    try {
      config = parseConfig(configPayload);
    } finally {
      configPayload.fill(0);
    }
    state.chip = identity;
    state.config = config;
    const descriptor = usbDescriptorSummary(device);
    const configSummary = configurationSummary(config.registers);
    elements.chipName.textContent = `${identity.name} [0x8216]`;
    elements.bootloaderVersion.textContent = formatBootloaderVersion(config.bootloaderVersion);
    elements.uidStatus.textContent = "checksum valid · value kept private";
    if (elements.usbId) elements.usbId.textContent = descriptor.vidPid;
    if (elements.usbProduct) elements.usbProduct.textContent = descriptor.product;
    if (elements.usbManufacturer) elements.usbManufacturer.textContent = descriptor.manufacturer;
    if (elements.usbVersion) elements.usbVersion.textContent = descriptor.deviceVersion;
    if (elements.usbConfigState) elements.usbConfigState.textContent = configSummary.label;
    if (elements.chipIdentity) elements.chipIdentity.textContent = "0x82 / 0x16";
    if (elements.usbDisconnectButton) elements.usbDisconnectButton.disabled = false;
    resetStages();
    setStage("identify", "complete");
    setStatus(elements.usbPermissionStatus, "Permission granted to this captured WCH device.", "good");
    setStatus(elements.usbStatus, "CH582 bootloader identified. No erase or write command has been sent.", "good");
    log(
      `Read-only target gate passed: CH582, family 0x16, bootloader ${formatBootloaderVersion(config.bootloaderVersion)}, UID checksum valid; application firmware remains unreadable.`,
      "success",
    );
  } catch (error) {
    await closeUsb();
    const cancelled = error?.name === "NotFoundError";
    setStatus(
      elements.usbPermissionStatus,
      cancelled ? "Device chooser cancelled." : `USB permission/open failed: ${error.message}`,
      cancelled ? "neutral" : "bad",
    );
    setStatus(elements.usbStatus, cancelled ? "No bootloader selected. Nothing changed." : `Bootloader probe failed: ${error.message}`, cancelled ? "neutral" : "bad");
    log(cancelled ? "Device selection cancelled; nothing changed." : `Probe stopped safely: ${error.message}`, cancelled ? "info" : "error");
  } finally {
    elements.usbButton.disabled = !("usb" in navigator) || Boolean(state.usbDevice);
    updateFlashButton();
  }
}

async function closeUsb() {
  const device = state.usbDevice;
  const config = state.config;
  state.usbDevice = null;
  state.chip = null;
  state.config = null;
  config?.uid?.fill(0);
  config?.registers?.fill(0);
  resetConfirmations();
  elements.chipName.textContent = "not connected";
  elements.bootloaderVersion.textContent = "—";
  elements.uidStatus.textContent = "—";
  if (elements.chipIdentity) elements.chipIdentity.textContent = "—";
  if (elements.usbId) elements.usbId.textContent = "not connected";
  if (elements.usbProduct) elements.usbProduct.textContent = "—";
  if (elements.usbManufacturer) elements.usbManufacturer.textContent = "—";
  if (elements.usbVersion) elements.usbVersion.textContent = "—";
  if (elements.usbConfigState) elements.usbConfigState.textContent = "—";
  if (elements.usbDisconnectButton) elements.usbDisconnectButton.disabled = true;
  if (device?.opened) {
    try {
      await device.releaseInterface(0);
    } catch {
      // The bootloader may already have disconnected after reset.
    }
    try {
      await device.close();
    } catch {
      // Closing an already disconnected bootloader is harmless.
    }
  }
  refreshAuthorizedUsbStatus();
}

async function disconnectUsbByUser() {
  if (state.flashing) return;
  await closeUsb();
  setStatus(elements.usbStatus, "Bootloader connection closed without changing firmware.", "neutral");
  log("Closed the read-only bootloader connection; nothing was erased or written.");
  elements.usbButton.disabled = !("usb" in navigator);
  updateFlashButton();
}

async function copyRedactedLog() {
  if (!elements.copyLogButton) return;
  try {
    const text = [...elements.log.children]
      .map((entry) => entry.textContent)
      .join("\n");
    await navigator.clipboard.writeText(text);
    elements.copyLogButton.textContent = "Copied redacted log";
    window.setTimeout(() => {
      elements.copyLogButton.textContent = "Copy redacted log";
    }, 1600);
  } catch (error) {
    log(`Could not copy the redacted session log: ${error.message}`, "error");
  }
}

function confirmationsComplete() {
  return elements.confirmations.every((input) => input.checked);
}

function typedPhraseComplete() {
  return destructivePage && elements.flashPhrase?.value.trim() === "ERASE THIS BADGE";
}

function resetConfirmations() {
  elements.confirmations.forEach((input) => {
    input.checked = false;
  });
  if (elements.flashPhrase) elements.flashPhrase.value = "";
}

function selectedRevision() {
  return elements.pcbRevision.value.trim();
}

function hasBoardRecord() {
  return elements.pcbMarking.value.trim().length > 0;
}

function recoveryDescriptor() {
  return state.recoveryImages[0] || null;
}

function renderRecoveryDescriptor(recovery) {
  const releaseLink = document.createElement("a");
  releaseLink.href = recovery.upstream.release_url;
  releaseLink.target = "_blank";
  releaseLink.rel = "noopener noreferrer";
  releaseLink.textContent = `${recovery.label} ${recovery.version} · ${recovery.upstream.license}`;
  elements.recoveryVersion.replaceChildren(releaseLink);
  elements.recoveryTarget.textContent = `${recovery.hardware_revisions[0]} · CH582M · 11×44 · Micro-USB`;
  const sourceLink = document.createElement("a");
  sourceLink.href = recovery.upstream.source_url;
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = recovery.upstream.source_commit.slice(0, 12);
  elements.recoverySource.replaceChildren(sourceLink);
  elements.recoverySize.textContent = `${recovery.bytes.toLocaleString()} bytes`;
  elements.recoveryHash.textContent = recovery.sha256;
  elements.recoveryVerification.textContent = "hardware-unverified by FrogAlert";
}

function updateRecoveryButton() {
  const recovery = recoveryDescriptor();
  const revision = selectedRevision();
  const matches = Boolean(recovery && revision === recovery.hardware_revisions[0]);
  const boardConfirmed = elements.recoveryBoardConfirmation.checked;
  elements.recoveryButton.disabled = state.flashing || !matches || !boardConfirmed;
  if (!recovery) {
    setStatus(elements.recoveryStatus, "No reviewed open BadgeMagic recovery descriptor is available.", "warning");
  } else if (!revision) {
    setStatus(
      elements.recoveryStatus,
      "Enter HARDWARE_REV1 exactly after inspecting the opened Micro-USB board. Preparation remains disabled.",
      "neutral",
    );
  } else if (!matches) {
    setStatus(
      elements.recoveryStatus,
      `No reviewed open BadgeMagic image is available for ${revision}. Unknown boards, HARDWARE_REV2, and HARDWARE_REV3 remain disabled.`,
      "warning",
    );
  } else if (!boardConfirmed) {
    setStatus(
      elements.recoveryStatus,
      "Compare the opened board with the linked FOSSASIA reference photos and check the hardware confirmation before preparing this image.",
      "warning",
    );
  } else if (state.firmware?.recoveryId === recovery.id) {
    setStatus(
      elements.recoveryStatus,
      `${recovery.label} ${recovery.version} is prepared and hash-verified locally for inspection. Nothing has been written, and browser programming stays locked until a physical HARDWARE_REV1 smoke test passes.`,
      "warning",
    );
  } else {
    setStatus(
      elements.recoveryStatus,
      `${recovery.label} ${recovery.version} can be prepared and inspected for HARDWARE_REV1. This only loads bytes; browser programming stays locked until a physical HARDWARE_REV1 smoke test passes.`,
      "warning",
    );
  }
}

function revisionMatchesArtifact() {
  const revision = selectedRevision();
  return Boolean(revision && state.firmware?.hardwareRevisions?.includes(revision));
}

function recoveryArtifactConfirmationComplete() {
  return (
    state.firmware?.artifactKind !== "open-badgemagic-recovery" ||
    elements.recoveryBoardConfirmation.checked
  );
}

function artifactProgrammingAllowed() {
  return canProgramArtifact({
    isBundledRecovery: state.firmware?.artifactKind === "open-badgemagic-recovery",
    hardwareVerifiedByFrogalert: state.firmware?.hardwareVerifiedByFrogalert,
  });
}

function updateFlashButton() {
  const enabled = canEnableFlash({
    flashing: state.flashing,
    hasUsbDevice: Boolean(state.usbDevice),
    hasChipIdentity: Boolean(state.chip),
    hasConfig: Boolean(state.config),
    hasFirmware: Boolean(state.firmware),
    hasBoardRecord: hasBoardRecord(),
    artifactMatchesRevision: revisionMatchesArtifact(),
    confirmationsComplete: confirmationsComplete(),
    artifactConfirmationComplete: recoveryArtifactConfirmationComplete(),
    artifactProgrammingAllowed: artifactProgrammingAllowed(),
    typedPhraseComplete: typedPhraseComplete(),
  });
  if (elements.flashButton) elements.flashButton.disabled = !enabled;
  setStatus(
    elements.armedStatus,
    enabled
      ? "Armed for the captured device and exact selected artifact. Final confirmation still required."
      : "Not armed — complete device identification, artifact binding, physical checks, and the exact phrase.",
    enabled ? "warning" : "neutral",
  );
  if (elements.pcbMarkingStatus) {
    elements.pcbMarkingStatus.textContent = hasBoardRecord()
      ? "Recorded locally for this session"
      : "Not recorded";
  }
  if (elements.selectedProfileStatus) {
    elements.selectedProfileStatus.textContent = selectedRevision() || "Not selected";
  }
  if (elements.matrixStatus) {
    elements.matrixStatus.textContent = elements.confirmations[1]?.checked
      ? "User confirmed exactly 11×44"
      : "Not confirmed";
  }
}

function clearFirmware() {
  resetConfirmations();
  state.firmware = null;
  elements.firmwareName.textContent = "not loaded";
  elements.firmwareSize.textContent = "—";
  elements.firmwareHash.textContent = "—";
  elements.firmwareRevision.textContent = "—";
  if (elements.firmwareProvenance) elements.firmwareProvenance.textContent = "—";
  if (elements.firmwareVerification) elements.firmwareVerification.textContent = "—";
  updateProgress(0, "Not armed");
  updateFlashButton();
  updateRecoveryButton();
}

function beginArtifactPreparation() {
  state.artifactGeneration = nextArtifactGeneration(state.artifactGeneration);
  return state.artifactGeneration;
}

async function setFirmware(
  bytes,
  name,
  source,
  { expectedHash = null, generation, hardwareRevisions, metadata = {} } = {},
) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const validated = validateFirmware(raw, name);
  const hash = await sha256Hex(raw);
  if (generation !== state.artifactGeneration) return false;
  if (expectedHash && hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("firmware SHA-256 does not match its release manifest");
  }
  state.firmware = {
    name,
    source,
    raw,
    hash,
    hardwareRevisions: [...hardwareRevisions],
    ...validated,
    ...metadata,
  };
  elements.firmwareName.textContent = name;
  elements.firmwareSize.textContent = `${raw.byteLength.toLocaleString()} bytes (${validated.padded.byteLength.toLocaleString()} padded)`;
  elements.firmwareHash.textContent = hash;
  elements.firmwareRevision.textContent = hardwareRevisions.join(", ");
  if (elements.firmwareProvenance) {
    elements.firmwareProvenance.textContent =
      metadata.provenance || (source === "local file" ? "Local file selected by user" : source);
  }
  if (elements.firmwareVerification) {
    elements.firmwareVerification.textContent =
      metadata.hardwareEvidence ||
      (source === "local file" ? "No release or hardware evidence supplied" : "Not reported");
  }
  log(`Loaded ${name} from ${source}; SHA-256 calculated locally.`);
  updateFlashButton();
  return true;
}

async function chooseLocalFirmware(event) {
  if (state.flashing) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const revision = selectedRevision();
  const generation = beginArtifactPreparation();
  elements.releaseSelect.value = "";
  restoreReleaseSummary();
  clearFirmware();
  if (!revision) {
    elements.firmwareInput.value = "";
    log("Enter the exact PCB revision before selecting a developer BIN.", "error");
    return;
  }
  try {
    await setFirmware(new Uint8Array(await file.arrayBuffer()), file.name, "local file", {
      generation,
      hardwareRevisions: [revision],
    });
  } catch (error) {
    if (generation !== state.artifactGeneration) return;
    clearFirmware();
    log(`Firmware rejected before any device write: ${error.message}`, "error");
  }
}

async function prepareOpenBadgeMagicFirmware() {
  if (state.flashing || !elements.recoveryBoardConfirmation.checked) {
    updateRecoveryButton();
    return;
  }
  const recovery = recoveryDescriptor();
  const generation = beginArtifactPreparation();
  elements.firmwareInput.value = "";
  elements.releaseSelect.value = "";
  clearFirmware();
  try {
    validateRecoveryDescriptor(recovery, selectedRevision());
    elements.recoveryButton.disabled = true;
    setStatus(
      elements.recoveryStatus,
      "Loading the same-origin FOSSASIA v0.1 bytes for local size and SHA-256 verification…",
      "working",
    );
    const artifactUrl = firmwareArtifactUrl(recovery.file, import.meta.url);
    const response = await fetch(artifactUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`open BadgeMagic firmware returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== recovery.bytes) {
      throw new Error("open BadgeMagic firmware byte length does not match the reviewed descriptor");
    }
    const loaded = await setFirmware(
      bytes,
      recovery.file,
      `${recovery.label} ${recovery.version} from FOSSASIA`,
      {
        expectedHash: recovery.sha256,
        generation,
        hardwareRevisions: recovery.hardware_revisions,
        metadata: {
          artifactKind: recovery.kind,
          recoveryId: recovery.id,
          hardwareVerifiedByFrogalert: recovery.hardware_verified_by_frogalert,
          provenance: `FOSSASIA ${recovery.version} · source ${recovery.upstream.source_commit.slice(0, 12)}`,
          hardwareEvidence: "Hardware-unverified by FrogAlert; destructive use locked",
        },
      },
    );
    if (!loaded) return;
    log(
      "Prepared the open BadgeMagic replacement for inspection. No USB command was sent, and browser programming remains locked until a physical HARDWARE_REV1 smoke test passes.",
      "warning",
    );
    updateRecoveryButton();
  } catch (error) {
    if (generation !== state.artifactGeneration) return;
    clearFirmware();
    setStatus(elements.recoveryStatus, `Open BadgeMagic image not prepared: ${error.message}`, "bad");
    log(`Open BadgeMagic image rejected before any device write: ${error.message}`, "error");
    elements.recoveryButton.disabled =
      state.flashing ||
      !elements.recoveryBoardConfirmation.checked ||
      selectedRevision() !== recovery?.hardware_revisions?.[0];
  }
}

async function loadReleaseManifest() {
  try {
    const response = await fetch(firmwareManifestUrl(import.meta.url), { cache: "no-store" });
    if (!response.ok) throw new Error(`manifest returned HTTP ${response.status}`);
    const manifest = await response.json();
    if (
      manifest.schema_version !== 2 ||
      !Array.isArray(manifest.releases) ||
      !Array.isArray(manifest.recovery_images)
    ) {
      throw new Error("manifest schema is not supported");
    }
    const releases = manifest.releases.filter((release) => release.hardware_verified === true);
    if (releases.length === 0) {
      setReleaseSummary("No hardware-verified FrogAlert firmware has been released yet. Developer BIN files can be selected locally.", "warning");
    } else {
      for (const release of releases) {
        const option = document.createElement("option");
        option.value = JSON.stringify(release);
        option.textContent = `${release.version} · ${release.target}`;
        elements.releaseSelect.append(option);
      }
      elements.releaseSelect.disabled = state.flashing;
      setReleaseSummary(`${releases.length} hardware-verified release${releases.length === 1 ? "" : "s"} available.`, "good");
    }

    if (manifest.recovery_images.length !== 1) {
      throw new Error("manifest must contain exactly one reviewed open BadgeMagic recovery image");
    }
    const recovery = manifest.recovery_images[0];
    validateRecoveryDescriptor(recovery, "HARDWARE_REV1");
    state.recoveryImages = [recovery];
    renderRecoveryDescriptor(recovery);
    updateRecoveryButton();
  } catch (error) {
    state.recoveryImages = [];
    setReleaseSummary(`Release list unavailable: ${error.message}`, "bad");
    setStatus(elements.recoveryStatus, `Open BadgeMagic descriptor unavailable: ${error.message}`, "bad");
    elements.recoveryButton.disabled = true;
  }
}

async function chooseRelease(event) {
  if (state.flashing) return;
  const generation = beginArtifactPreparation();
  elements.firmwareInput.value = "";
  clearFirmware();
  if (!event.target.value) {
    restoreReleaseSummary();
    return;
  }
  try {
    const release = JSON.parse(event.target.value);
    validateReleaseDescriptor(release, selectedRevision());
    const artifactUrl = firmwareArtifactUrl(release.file, import.meta.url);
    const response = await fetch(artifactUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`firmware returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== release.bytes) throw new Error("firmware byte length does not match manifest");
    const loaded = await setFirmware(bytes, release.file, `release ${release.version}`, {
      expectedHash: release.sha256,
      generation,
      hardwareRevisions: release.hardware_revisions,
      metadata: {
        provenance: `FrogAlert release ${release.version} · source ${release.source_commit || "not reported"}`,
        hardwareEvidence: "Manifest marks this exact release hardware-verified",
      },
    });
    if (!loaded) return;
    setStatus(elements.releaseStatus, `Loaded ${release.version} for PCB revision ${selectedRevision()}.`, "good");
  } catch (error) {
    if (generation !== state.artifactGeneration) return;
    clearFirmware();
    event.target.value = "";
    setStatus(elements.releaseStatus, `Release not loaded: ${error.message}`, "bad");
    log(`Release rejected before any device write: ${error.message}`, "error");
  }
}

function randomByte() {
  return crypto.getRandomValues(new Uint8Array(1))[0];
}

const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) {
    setStatus(
      elements.wakeLockStatus,
      "Screen wake lock is unavailable. Keep this page visible and prevent the phone or computer from sleeping during a flash.",
      "warning",
    );
    return;
  }
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    setStatus(elements.wakeLockStatus, "Screen wake lock active for this flash session.", "good");
  } catch (error) {
    setStatus(
      elements.wakeLockStatus,
      `Screen wake lock was not granted: ${error.message}. Keep this page visible and the device awake.`,
      "warning",
    );
  }
}

async function releaseWakeLock() {
  const lock = state.wakeLock;
  state.wakeLock = null;
  if (lock) {
    try {
      await lock.release();
    } catch {
      // A browser may release the lock automatically when the page is hidden.
    }
  }
  setStatus(elements.wakeLockStatus, "Wake lock inactive.", "neutral");
}

async function withTimeout(promise, milliseconds, operation) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error(`${operation} timed out after ${milliseconds / 1000} seconds`);
      error.name = "TimeoutError";
      reject(error);
    }, milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function sendReset(expectedDevice) {
  if (state.usbDevice !== expectedDevice || state.activeFlashDevice !== expectedDevice) {
    throw new Error("USB device changed before the reset command");
  }
  const device = expectedDevice;
  if (!device?.opened) throw new Error("WCH ISP device is not open");
  const packet = ispEndPacket();
  const sent = await withTimeout(device.transferOut(USB_ENDPOINT, packet), 3000, "reset command write");
  if (sent.status !== "ok" || sent.bytesWritten !== packet.byteLength) {
    throw new Error(`reset command write failed (${sent.status}, ${sent.bytesWritten || 0}/${packet.byteLength} bytes)`);
  }
  try {
    const received = await withTimeout(device.transferIn(USB_ENDPOINT, USB_READ_BYTES), 1500, "reset response");
    if (received.status !== "ok" || !received.data) return false;
    parseResponse(dataViewBytes(received.data), COMMAND.ISP_END);
    return true;
  } catch {
    return false;
  }
}

async function flashFirmware() {
  if (
    elements.flashButton.disabled ||
    !state.firmware ||
    !state.config ||
    !artifactProgrammingAllowed()
  ) {
    updateFlashButton();
    return;
  }
  const artifactDescription =
    state.firmware.artifactKind === "open-badgemagic-recovery"
      ? "the FOSSASIA open BadgeMagic replacement (not the original OEM image)"
      : state.firmware.name;
  const finalSummary = [
    "FINAL DESTRUCTIVE CHECK",
    "",
    `Target: CH582 [0x82 / 0x16], bootloader ${formatBootloaderVersion(state.config.bootloaderVersion)}`,
    `Physical PCB record: ${elements.pcbMarking.value.trim()}`,
    `Firmware profile: ${selectedRevision()}`,
    `Artifact: ${artifactDescription}`,
    `Image: ${state.firmware.raw.byteLength.toLocaleString()} bytes (${state.firmware.padded.byteLength.toLocaleString()} padded)`,
    `SHA-256: ${state.firmware.hash}`,
    `Erase plan: ${state.firmware.eraseSectors} × 1 KiB sectors after exact config reset/readback`,
    "",
    "The current application firmware is unknown. The OEM image is unavailable and cannot be backed up or restored. Continue only if every line matches the opened badge.",
  ].join("\n");
  const confirmed = window.confirm(
    finalSummary,
  );
  if (!confirmed) {
    log("Final flash confirmation declined; nothing changed.");
    return;
  }

  state.flashing = true;
  const flashDevice = state.usbDevice;
  state.activeFlashDevice = flashDevice;
  updateFlashButton();
  elements.usbButton.disabled = true;
  elements.firmwareInput.disabled = true;
  elements.pcbMarking.disabled = true;
  elements.pcbRevision.disabled = true;
  elements.recoveryBoardConfirmation.disabled = true;
  elements.confirmations.forEach((input) => {
    input.disabled = true;
  });
  if (elements.flashPhrase) elements.flashPhrase.disabled = true;
  elements.releaseSelect.disabled = true;
  elements.recoveryButton.disabled = true;
  if (elements.usbDisconnectButton) elements.usbDisconnectButton.disabled = true;
  const { padded, eraseSectors } = state.firmware;
  await acquireWakeLock();

  try {
    const { resetAcknowledged } = await programAndVerifyFirmware({
      padded,
      eraseSectors,
      uid: state.config.uid,
      transfer: (packet) => usbTransfer(packet, flashDevice),
      reset: () => sendReset(flashDevice),
      randomByte,
      wait: delay,
      onEvent(event) {
        switch (event.phase) {
          case "config-reset":
            setStage("identify", "complete");
            setStage("config", "active");
            updateProgress(1, "Resetting CH58x protection/configuration…");
            log(
              "DESTRUCTIVE STEP: resetting CH58x protection and configuration to the reviewed defaults.",
              "warning",
            );
            break;
          case "config-verified":
            setStage("config", "complete");
            log("Configuration reset readback matched before erase.", "success");
            break;
          case "erase":
            setStage("erase", "active");
            updateProgress(3, "Erasing code flash…");
            log(`DESTRUCTIVE STEP: erasing ${event.eraseSectors} code-flash sectors.`, "warning");
            break;
          case "program-key":
            setStage("erase", "complete");
            setStage("program", "active");
            updateProgress(8, "Starting encrypted program session…");
            break;
          case "program":
            updateProgress(
              8 + Math.round((event.index / event.chunks) * 48),
              `Programming ${event.index} / ${event.chunks}…`,
            );
            break;
          case "program-finalized":
            log(
              `Programmed ${padded.byteLength.toLocaleString()} padded bytes; beginning independent ISP comparison.`,
            );
            break;
          case "verify-key":
            setStage("program", "complete");
            setStage("verify", "active");
            updateProgress(58, "Starting verify session…");
            break;
          case "verify":
            updateProgress(
              58 + Math.round((event.index / event.chunks) * 41),
              `Verifying ${event.index} / ${event.chunks}…`,
            );
            break;
          case "verified":
            setStage("verify", "complete");
            setStage("reset", "active");
            updateProgress(100, "Verified. Resetting badge…");
            log("All programmed chunks passed the bootloader verify command.", "success");
            break;
          case "complete":
            setStage("reset", "complete");
            break;
        }
      },
    });
    setStatus(
      elements.usbStatus,
      resetAcknowledged
        ? "Firmware programmed, ISP-verified, and reset acknowledged."
        : "Firmware programmed and ISP-verified. Reset command was sent, but its response was not confirmed; power-cycle if needed.",
      resetAcknowledged ? "good" : "warning",
    );
    log(
      resetAcknowledged
        ? "Flash completed, verified, and reset acknowledged."
        : "Flash completed and verified; reset response was not confirmed.",
      resetAcknowledged ? "success" : "warning",
    );
    await closeUsb();
  } catch (error) {
    failActiveStage();
    await closeUsb();
    if (state.firmware?.artifactKind === "open-badgemagic-recovery") {
      elements.recoveryBoardConfirmation.checked = false;
    }
    updateProgress(elements.progress.value, "Stopped — follow recovery instructions below");
    const uncertainty =
      error?.name === "TimeoutError"
        ? " The timed-out USB command may still have reached the bootloader, so the badge state is unknown until a complete fresh identify, program, and verify cycle succeeds."
        : "";
    setStatus(
      elements.usbStatus,
      `Flash stopped: ${error.message}.${uncertainty} Reconnect for fresh read-only identification before retrying.`,
      "bad",
    );
    log(
      `FLASH STOPPED: ${error.message}.${uncertainty} Keep this page open, re-enter ISP mode, reconnect, pass read-only identification, and accept every acknowledgement again before retrying the same verified artifact.`,
      "error",
    );
  } finally {
    state.activeFlashDevice = null;
    state.flashing = false;
    await releaseWakeLock();
    elements.firmwareInput.disabled = false;
    elements.pcbMarking.disabled = false;
    elements.pcbRevision.disabled = false;
    elements.recoveryBoardConfirmation.disabled = false;
    elements.confirmations.forEach((input) => {
      input.disabled = false;
    });
    if (elements.flashPhrase) elements.flashPhrase.disabled = false;
    elements.releaseSelect.disabled = elements.releaseSelect.options.length <= 1;
    elements.usbButton.disabled = !("usb" in navigator) || Boolean(state.usbDevice);
    if (elements.usbDisconnectButton) {
      elements.usbDisconnectButton.disabled = !state.usbDevice;
    }
    updateFlashButton();
    updateRecoveryButton();
  }
}

async function startFlash() {
  if (!destructivePage) {
    setStatus(
      elements.usbStatus,
      "This landing-page lab is read-only. Open the full flash tool for the guarded destructive workflow.",
      "warning",
    );
    return;
  }
  if (!navigator.locks?.request) {
    log(
      "This browser does not expose the Web Locks API. Close other FrogAlert tabs before continuing.",
      "warning",
    );
    await flashFirmware();
    return;
  }
  try {
    await navigator.locks.request(
      "frogalert-ch582-flash",
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          setStatus(
            elements.usbStatus,
            "Another FrogAlert tab holds the flashing lock. Close it or wait for its operation to finish.",
            "bad",
          );
          log("Flash did not start because another tab holds the exclusive hardware lock.", "error");
          return;
        }
        await flashFirmware();
      },
    );
  } catch (error) {
    setStatus(elements.usbStatus, `Could not acquire the browser flashing lock: ${error.message}`, "bad");
    log(`Flash did not start: browser lock failed (${error.message}).`, "error");
  }
}

function bindEvents() {
  elements.bluetoothButton.addEventListener("click", connectBluetooth);
  elements.usbButton.addEventListener("click", connectUsb);
  elements.firmwareInput.addEventListener("change", chooseLocalFirmware);
  elements.pcbMarking.addEventListener("input", () => {
    state.artifactGeneration = nextArtifactGeneration(state.artifactGeneration);
    resetConfirmations();
    if (state.firmware) {
      clearFirmware();
      log("Cleared the prepared artifact because the opened-board record changed.", "warning");
    }
    updateFlashButton();
  });
  elements.pcbRevision.addEventListener("input", () => {
    elements.recoveryBoardConfirmation.checked = false;
    const transition = revisionInputTransition({
      artifactGeneration: state.artifactGeneration,
      isRecoveryArtifact: state.firmware?.artifactKind === "open-badgemagic-recovery",
      artifactMatchesRevision: revisionMatchesArtifact(),
    });
    state.artifactGeneration = transition.artifactGeneration;
    resetConfirmations();
    if (transition.clearFirmware) {
      clearFirmware();
      log("Cleared the prepared open BadgeMagic image because the exact PCB revision changed.", "warning");
    }
    updateFlashButton();
    updateRecoveryButton();
  });
  elements.releaseSelect.addEventListener("change", chooseRelease);
  elements.recoveryButton.addEventListener("click", prepareOpenBadgeMagicFirmware);
  elements.recoveryBoardConfirmation.addEventListener("change", () => {
    updateRecoveryButton();
    updateFlashButton();
  });
  elements.confirmations.forEach((input) => input.addEventListener("change", updateFlashButton));
  elements.flashPhrase?.addEventListener("input", updateFlashButton);
  if (destructivePage && elements.flashButton) {
    elements.flashButton.addEventListener("click", startFlash);
  }
  elements.usbDisconnectButton?.addEventListener("click", disconnectUsbByUser);
  elements.copyLogButton?.addEventListener("click", copyRedactedLog);
  window.addEventListener("beforeunload", (event) => {
    if (!state.flashing) return;
    event.preventDefault();
    event.returnValue = "";
  });
  if ("usb" in navigator) {
    navigator.usb.addEventListener("connect", (event) => {
      if (
        !WCH_USB_FILTERS.some(
          (filter) =>
            event.device.vendorId === filter.vendorId &&
            event.device.productId === filter.productId,
        )
      ) {
        return;
      }
      setStatus(
        elements.authorizedUsbStatus,
        "A WCH ISP bootloader was attached. Press Connect to request permission and identify it read-only.",
        "good",
      );
    });
    navigator.usb.addEventListener("disconnect", async (event) => {
      if (event.device !== state.usbDevice) return;
      await closeUsb();
      if (state.flashing) {
        elements.usbButton.disabled = true;
        setStatus(
          elements.usbStatus,
          "Bootloader disconnected during the flash session. Follow recovery instructions; reconnect is locked until this operation stops.",
          "bad",
        );
        log("USB bootloader disconnected during the active flash session.", "error");
        updateFlashButton();
        return;
      }
      setStatus(elements.usbStatus, "Bootloader disconnected. Re-enter ISP mode to reconnect.", "neutral");
      log("USB bootloader disconnected.");
      elements.usbButton.disabled = false;
      updateFlashButton();
    });
  }
}

startMatrixPreview();
updateCapabilities();
bindEvents();
loadReleaseManifest();
