import {
  COMMAND,
  PROGRAM_CHUNK_BYTES,
  WCH_USB_FILTERS,
  dataPacket,
  deriveXorKey,
  erasePacket,
  formatBootloaderVersion,
  identifyPacket,
  isResetConfig,
  ispEndPacket,
  ispKeyPacket,
  parseConfig,
  parseConfigRegisters,
  parseIdentity,
  parseResponse,
  readConfigPacket,
  resetConfigPacket,
  sha256Hex,
  validateFirmware,
  validateReleaseDescriptor,
  xorChunk,
} from "./wchisp-protocol.js";

const BADGE_SERVICE = 0xfee0;
const BADGE_CHARACTERISTIC = 0xfee1;
const NEXT_GEN_SERVICE = 0xf055;
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
  releaseSummary: { message: "Loading release manifest…", tone: "neutral" },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  pcbRevision: $("#pcb-revision"),
  releaseSelect: $("#release-select"),
  releaseStatus: $("#release-status"),
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
}

function setReleaseSummary(message, tone) {
  state.releaseSummary = { message, tone };
  setStatus(elements.releaseStatus, message, tone);
}

function restoreReleaseSummary() {
  setStatus(elements.releaseStatus, state.releaseSummary.message, state.releaseSummary.tone);
}

function updateProgress(value, label) {
  elements.progress.value = value;
  elements.progressLabel.textContent = label;
}

function isTrustworthyContext() {
  return window.isSecureContext || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

function updateCapabilities() {
  const secure = isTrustworthyContext();
  const usb = "usb" in navigator;
  const bluetooth = "bluetooth" in navigator;
  const summary = [secure ? "secure context" : "HTTPS required", usb ? "WebUSB ready" : "no WebUSB", bluetooth ? "Web Bluetooth ready" : "no Web Bluetooth"];
  setStatus(elements.capability, summary.join(" · "), secure && usb ? "good" : "warning");
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
}

async function connectBluetooth() {
  let device = null;
  try {
    elements.bluetoothButton.disabled = true;
    setStatus(elements.bluetoothStatus, "Choose a running BadgeMagic-compatible badge…", "working");
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BADGE_SERVICE] }],
      optionalServices: [NEXT_GEN_SERVICE, 0x180a],
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BADGE_SERVICE);
    await service.getCharacteristic(BADGE_CHARACTERISTIC);
    setStatus(elements.bluetoothStatus, `${device.name || "Badge"} exposes FEE0/FEE1. Probe passed and the page disconnected; no content was changed.`, "good");
  } catch (error) {
    const cancelled = error?.name === "NotFoundError";
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
    setStatus(elements.usbStatus, "Choose the WCH ISP device—not the running nametag…", "working");
    log("Requesting permission for a WCH USB ISP bootloader.");
    const device = await navigator.usb.requestDevice({ filters: WCH_USB_FILTERS });
    await device.open();
    state.usbDevice = device;
    if (!device.configuration) await device.selectConfiguration(1);
    if (device.configuration?.configurationValue !== 1) {
      throw new Error("bootloader did not select USB configuration 1");
    }
    await device.claimInterface(0);

    const identity = parseIdentity(await usbTransfer(identifyPacket()));
    const config = parseConfig(await usbTransfer(readConfigPacket()));
    state.chip = identity;
    state.config = config;
    elements.chipName.textContent = `${identity.name} [0x8216]`;
    elements.bootloaderVersion.textContent = formatBootloaderVersion(config.bootloaderVersion);
    elements.uidStatus.textContent = "checksum valid · value kept private";
    setStatus(elements.usbStatus, "CH582 bootloader identified. No erase or write command has been sent.", "good");
    log("Read-only target gate passed: CH582, family 0x16, UID checksum valid.", "success");
  } catch (error) {
    await closeUsb();
    const cancelled = error?.name === "NotFoundError";
    setStatus(elements.usbStatus, cancelled ? "No bootloader selected. Nothing changed." : `Bootloader probe failed: ${error.message}`, cancelled ? "neutral" : "bad");
    log(cancelled ? "Device selection cancelled; nothing changed." : `Probe stopped safely: ${error.message}`, cancelled ? "info" : "error");
  } finally {
    elements.usbButton.disabled = !("usb" in navigator) || Boolean(state.usbDevice);
    updateFlashButton();
  }
}

async function closeUsb() {
  const device = state.usbDevice;
  state.usbDevice = null;
  state.chip = null;
  state.config = null;
  resetConfirmations();
  elements.chipName.textContent = "not connected";
  elements.bootloaderVersion.textContent = "—";
  elements.uidStatus.textContent = "—";
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
}

function confirmationsComplete() {
  return elements.confirmations.every((input) => input.checked);
}

function resetConfirmations() {
  elements.confirmations.forEach((input) => {
    input.checked = false;
  });
}

function selectedRevision() {
  return elements.pcbRevision.value.trim();
}

function revisionMatchesArtifact() {
  const revision = selectedRevision();
  return Boolean(revision && state.firmware?.hardwareRevisions?.includes(revision));
}

function updateFlashButton() {
  elements.flashButton.disabled =
    state.flashing ||
    !state.usbDevice ||
    !state.chip ||
    !state.config ||
    !state.firmware ||
    !revisionMatchesArtifact() ||
    !confirmationsComplete();
}

function clearFirmware() {
  resetConfirmations();
  state.firmware = null;
  elements.firmwareName.textContent = "not loaded";
  elements.firmwareSize.textContent = "—";
  elements.firmwareHash.textContent = "—";
  elements.firmwareRevision.textContent = "—";
  updateFlashButton();
}

async function setFirmware(bytes, name, source, { expectedHash = null, generation, hardwareRevisions } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const validated = validateFirmware(raw, name);
  const hash = await sha256Hex(raw);
  if (generation !== state.artifactGeneration) return false;
  if (expectedHash && hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("firmware SHA-256 does not match its release manifest");
  }
  state.firmware = { name, source, raw, hash, hardwareRevisions: [...hardwareRevisions], ...validated };
  elements.firmwareName.textContent = name;
  elements.firmwareSize.textContent = `${raw.byteLength.toLocaleString()} bytes (${validated.padded.byteLength.toLocaleString()} padded)`;
  elements.firmwareHash.textContent = hash;
  elements.firmwareRevision.textContent = hardwareRevisions.join(", ");
  log(`Loaded ${name} from ${source}; SHA-256 calculated locally.`);
  updateFlashButton();
  return true;
}

async function chooseLocalFirmware(event) {
  if (state.flashing) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const revision = selectedRevision();
  const generation = ++state.artifactGeneration;
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

async function loadReleaseManifest() {
  try {
    const response = await fetch("./firmware/releases/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`manifest returned HTTP ${response.status}`);
    const manifest = await response.json();
    if (manifest.schema_version !== 1 || !Array.isArray(manifest.releases)) {
      throw new Error("manifest schema is not supported");
    }
    const releases = manifest.releases.filter((release) => release.hardware_verified === true);
    if (releases.length === 0) {
      setReleaseSummary("No hardware-verified FrogAlert firmware has been released yet. Developer BIN files can be selected locally.", "warning");
      return;
    }
    for (const release of releases) {
      const option = document.createElement("option");
      option.value = JSON.stringify(release);
      option.textContent = `${release.version} · ${release.target}`;
      elements.releaseSelect.append(option);
    }
    elements.releaseSelect.disabled = state.flashing;
    setReleaseSummary(`${releases.length} hardware-verified release${releases.length === 1 ? "" : "s"} available.`, "good");
  } catch (error) {
    setReleaseSummary(`Release list unavailable: ${error.message}`, "bad");
  }
}

async function chooseRelease(event) {
  if (state.flashing) return;
  const generation = ++state.artifactGeneration;
  elements.firmwareInput.value = "";
  clearFirmware();
  if (!event.target.value) {
    restoreReleaseSummary();
    return;
  }
  try {
    const release = JSON.parse(event.target.value);
    validateReleaseDescriptor(release, selectedRevision());
    const artifactUrl = new URL(`./firmware/releases/${encodeURIComponent(release.file)}`, window.location.href);
    const response = await fetch(artifactUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`firmware returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== release.bytes) throw new Error("firmware byte length does not match manifest");
    const loaded = await setFirmware(bytes, release.file, `release ${release.version}`, {
      expectedHash: release.sha256,
      generation,
      hardwareRevisions: release.hardware_revisions,
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

async function beginKeySession(key, expectedDevice) {
  const response = await usbTransfer(ispKeyPacket(), expectedDevice);
  const checksum = key.reduce((sum, byte) => (sum + byte) & 0xff, 0);
  if (response[0] !== checksum) {
    throw new Error("bootloader ISP key checksum did not match");
  }
}

async function flashFirmware() {
  if (elements.flashButton.disabled || !state.firmware || !state.config) return;
  const confirmed = window.confirm(
    `Final check: reset CH58x protection/configuration, erase the current firmware, and program ${state.firmware.name} for PCB revision ${selectedRevision()}? The OEM image cannot be backed up or restored automatically.`,
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
  elements.releaseSelect.disabled = true;
  const { padded, eraseSectors } = state.firmware;
  const key = deriveXorKey(state.config.uid);
  const chunks = Math.ceil(padded.byteLength / PROGRAM_CHUNK_BYTES);

  try {
    updateProgress(1, "Resetting CH58x protection/configuration…");
    log("DESTRUCTIVE STEP: resetting CH58x protection and configuration to the reviewed defaults.", "warning");
    await usbTransfer(resetConfigPacket(), flashDevice);
    const resetRegisters = parseConfigRegisters(await usbTransfer(readConfigPacket(0x07), flashDevice));
    if (!isResetConfig(resetRegisters)) {
      throw new Error("CH58x configuration reset did not match readback");
    }
    log("Configuration reset readback matched before erase.", "success");

    updateProgress(3, "Erasing code flash…");
    log(`DESTRUCTIVE STEP: erasing ${eraseSectors} code-flash sectors.`, "warning");
    await usbTransfer(erasePacket(eraseSectors), flashDevice);
    await delay(1000);

    updateProgress(8, "Starting encrypted program session…");
    await beginKeySession(key, flashDevice);
    for (let index = 0; index < chunks; index += 1) {
      const address = index * PROGRAM_CHUNK_BYTES;
      const chunk = padded.slice(address, address + PROGRAM_CHUNK_BYTES);
      await usbTransfer(
        dataPacket(COMMAND.PROGRAM, address, randomByte(), xorChunk(chunk, key)),
        flashDevice,
      );
      updateProgress(8 + Math.round(((index + 1) / chunks) * 48), `Programming ${index + 1} / ${chunks}…`);
    }
    await usbTransfer(
      dataPacket(COMMAND.PROGRAM, padded.byteLength, randomByte(), new Uint8Array()),
      flashDevice,
    );
    log(`Programmed ${padded.byteLength.toLocaleString()} padded bytes; beginning independent ISP comparison.`);
    await delay(500);

    updateProgress(58, "Starting verify session…");
    await beginKeySession(key, flashDevice);
    for (let index = 0; index < chunks; index += 1) {
      const address = index * PROGRAM_CHUNK_BYTES;
      const chunk = padded.slice(address, address + PROGRAM_CHUNK_BYTES);
      const response = await usbTransfer(
        dataPacket(COMMAND.VERIFY, address, randomByte(), xorChunk(chunk, key)),
        flashDevice,
      );
      if (response[0] !== 0x00) throw new Error(`verify mismatch at address 0x${address.toString(16)}`);
      updateProgress(58 + Math.round(((index + 1) / chunks) * 41), `Verifying ${index + 1} / ${chunks}…`);
    }

    updateProgress(100, "Verified. Resetting badge…");
    log("All programmed chunks passed the bootloader verify command.", "success");
    const resetAcknowledged = await sendReset(flashDevice);
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
    if (error?.name === "TimeoutError") await closeUsb();
    updateProgress(elements.progress.value, "Stopped — follow recovery instructions below");
    setStatus(elements.usbStatus, `Flash stopped: ${error.message}`, "bad");
    log(`FLASH STOPPED: ${error.message}. Keep this page open, re-enter ISP mode, reconnect, and retry the same verified artifact.`, "error");
  } finally {
    state.activeFlashDevice = null;
    state.flashing = false;
    elements.firmwareInput.disabled = false;
    elements.releaseSelect.disabled = elements.releaseSelect.options.length <= 1;
    elements.usbButton.disabled = !("usb" in navigator) || Boolean(state.usbDevice);
    updateFlashButton();
  }
}

function bindEvents() {
  elements.bluetoothButton.addEventListener("click", connectBluetooth);
  elements.usbButton.addEventListener("click", connectUsb);
  elements.firmwareInput.addEventListener("change", chooseLocalFirmware);
  elements.pcbRevision.addEventListener("input", () => {
    resetConfirmations();
    updateFlashButton();
  });
  elements.releaseSelect.addEventListener("change", chooseRelease);
  elements.confirmations.forEach((input) => input.addEventListener("change", updateFlashButton));
  elements.flashButton.addEventListener("click", flashFirmware);
  if ("usb" in navigator) {
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
