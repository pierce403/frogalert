import assert from "node:assert/strict";
import test from "node:test";

import {
  ISP_ENTRY_PHASE,
  ISP_ENTRY_SEQUENCE,
  ISP_ENTRY_WINDOW_MS,
  beginIspDeviceRequest,
  canRequestIspDevice,
  finishIspDeviceRequest,
  ispEntryCountdown,
  nextIspEntryPhase,
  previousIspEntryPhase,
} from "../site/isp-entry-guide.js";

test("KEY2 guide advances and retreats through the physical sequence", () => {
  assert.deepEqual(ISP_ENTRY_SEQUENCE, [
    ISP_ENTRY_PHASE.CLOSED,
    ISP_ENTRY_PHASE.POWER_OFF,
    ISP_ENTRY_PHASE.HOLD_KEY2,
    ISP_ENTRY_PHASE.CONNECT_WHILE_HELD,
    ISP_ENTRY_PHASE.WAIT_FOR_PIXEL,
    ISP_ENTRY_PHASE.CONNECT_WINDOW,
  ]);

  let phase = ISP_ENTRY_PHASE.CLOSED;
  for (const expected of ISP_ENTRY_SEQUENCE.slice(1)) {
    phase = nextIspEntryPhase(phase);
    assert.equal(phase, expected);
  }
  assert.equal(nextIspEntryPhase(phase), ISP_ENTRY_PHASE.CONNECT_WINDOW);

  for (const expected of ISP_ENTRY_SEQUENCE.slice(0, -1).reverse()) {
    phase = previousIspEntryPhase(phase);
    assert.equal(phase, expected);
  }
  assert.equal(previousIspEntryPhase(phase), ISP_ENTRY_PHASE.CLOSED);
});

test("only the completed KEY2 sequence is eligible to open the chooser", () => {
  for (const phase of Object.values(ISP_ENTRY_PHASE)) {
    assert.equal(
      canRequestIspDevice(phase),
      phase === ISP_ENTRY_PHASE.CONNECT_WINDOW,
      phase,
    );
  }

  assert.equal(beginIspDeviceRequest(ISP_ENTRY_PHASE.CONNECT_WINDOW), ISP_ENTRY_PHASE.CHOOSER);
  assert.throws(
    () => beginIspDeviceRequest(ISP_ENTRY_PHASE.WAIT_FOR_PIXEL),
    /completed KEY2 entry sequence/,
  );
  assert.equal(finishIspDeviceRequest({ identified: true }), ISP_ENTRY_PHASE.IDENTIFIED);
  assert.equal(finishIspDeviceRequest({ identified: false }), ISP_ENTRY_PHASE.RETRY);
});

test("unknown phases and malformed probe results are rejected", () => {
  for (const operation of [nextIspEntryPhase, previousIspEntryPhase, canRequestIspDevice]) {
    assert.throws(() => operation("erase"), /unknown ISP entry phase/);
  }
  assert.throws(
    () => finishIspDeviceRequest({ identified: "yes" }),
    /identified must be a boolean/,
  );
});

test("countdown derives a monotonic ten-second advisory window", () => {
  assert.equal(ISP_ENTRY_WINDOW_MS, 10_000);
  assert.deepEqual(ispEntryCountdown(5_000, 5_000), {
    elapsedMs: 0,
    remainingMs: 10_000,
    remainingSeconds: 10,
    expired: false,
  });
  assert.deepEqual(ispEntryCountdown(5_000, 10_000), {
    elapsedMs: 5_000,
    remainingMs: 5_000,
    remainingSeconds: 5,
    expired: false,
  });
  assert.deepEqual(ispEntryCountdown(5_000, 14_999), {
    elapsedMs: 9_999,
    remainingMs: 1,
    remainingSeconds: 1,
    expired: false,
  });
  assert.deepEqual(ispEntryCountdown(5_000, 15_000), {
    elapsedMs: 10_000,
    remainingMs: 0,
    remainingSeconds: 0,
    expired: true,
  });
  assert.deepEqual(ispEntryCountdown(5_000, 17_500), {
    elapsedMs: 12_500,
    remainingMs: 0,
    remainingSeconds: 0,
    expired: true,
  });

  assert.equal(
    canRequestIspDevice(ISP_ENTRY_PHASE.CONNECT_WINDOW),
    true,
    "countdown expiry is advisory and does not revoke the explicit read-only chooser action",
  );
});

test("countdown rejects non-monotonic and invalid clock input", () => {
  assert.throws(() => ispEntryCountdown(2, 1), /clock moved backwards/);
  assert.throws(() => ispEntryCountdown(-1, 1), /must not be negative/);
  assert.throws(() => ispEntryCountdown(0, Number.NaN), /must be finite/);
  assert.throws(() => ispEntryCountdown(Number.POSITIVE_INFINITY, 1), /must be finite/);
});
