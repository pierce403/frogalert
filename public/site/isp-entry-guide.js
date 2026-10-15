export const ISP_ENTRY_WINDOW_MS = 10_000;

export const ISP_ENTRY_PHASE = Object.freeze({
  CLOSED: "closed",
  CONFIRM_COMPATIBLE: "confirm-compatible",
  USB_CONNECTED: "usb-connected",
  HOLD_KEY2: "hold-key2",
  WAIT_FOR_DOT: "wait-for-dot",
  CONNECT_WINDOW: "connect-window",
  CHOOSER: "chooser",
  IDENTIFIED: "identified",
  RETRY: "retry",
});

export const ISP_ENTRY_SEQUENCE = Object.freeze([
  ISP_ENTRY_PHASE.CLOSED,
  ISP_ENTRY_PHASE.CONFIRM_COMPATIBLE,
  ISP_ENTRY_PHASE.USB_CONNECTED,
  ISP_ENTRY_PHASE.HOLD_KEY2,
  ISP_ENTRY_PHASE.WAIT_FOR_DOT,
  ISP_ENTRY_PHASE.CONNECT_WINDOW,
]);

const knownPhases = new Set(Object.values(ISP_ENTRY_PHASE));

function requireKnownPhase(phase) {
  if (!knownPhases.has(phase)) {
    throw new RangeError(`unknown ISP entry phase: ${String(phase)}`);
  }
}

export function nextIspEntryPhase(phase) {
  requireKnownPhase(phase);
  const index = ISP_ENTRY_SEQUENCE.indexOf(phase);
  if (index < 0 || index === ISP_ENTRY_SEQUENCE.length - 1) return phase;
  return ISP_ENTRY_SEQUENCE[index + 1];
}

export function previousIspEntryPhase(phase) {
  requireKnownPhase(phase);
  const index = ISP_ENTRY_SEQUENCE.indexOf(phase);
  if (index <= 0) return phase;
  return ISP_ENTRY_SEQUENCE[index - 1];
}

export function canRequestIspDevice(phase) {
  requireKnownPhase(phase);
  return phase === ISP_ENTRY_PHASE.CONNECT_WINDOW;
}

export function beginIspDeviceRequest(phase) {
  if (!canRequestIspDevice(phase)) {
    throw new Error("the WebUSB chooser requires the completed KEY2 entry sequence");
  }
  return ISP_ENTRY_PHASE.CHOOSER;
}

export function finishIspDeviceRequest({ identified = false } = {}) {
  if (typeof identified !== "boolean") {
    throw new TypeError("identified must be a boolean");
  }
  return identified ? ISP_ENTRY_PHASE.IDENTIFIED : ISP_ENTRY_PHASE.RETRY;
}

export function ispEntryCountdown(startedAtMs, nowMs) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) {
    throw new TypeError("ISP entry countdown timestamps must be finite monotonic milliseconds");
  }
  if (startedAtMs < 0 || nowMs < 0) {
    throw new RangeError("ISP entry countdown timestamps must not be negative");
  }
  if (nowMs < startedAtMs) {
    throw new RangeError("ISP entry countdown clock moved backwards");
  }

  const elapsedMs = nowMs - startedAtMs;
  const remainingMs = Math.max(0, ISP_ENTRY_WINDOW_MS - elapsedMs);
  return {
    elapsedMs,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    expired: remainingMs === 0,
  };
}
