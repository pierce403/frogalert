import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HARDWARE_PROFILE,
  SUPPORTED_HARDWARE_PROFILES,
  applyHardwareProfile,
} from "../scripts/apply-fossasia-hardware-profile.mjs";

const legacyProfile = "B1144C_250901_USB_C";
const flippedProfile = "B1144C_260404_USB_C";

function pinnedSources(lineEnding = "\n") {
  return {
    buttonSource: [
      "void btn_init()",
      "{",
      "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
      "\tGPIOB_ModeCfg(KEY2_PIN, GPIO_ModeIN_PU);",
      "}",
    ].join(lineEnding),
    buttonHeader: [
      "#define isPressed(key) \t\t((key) ? \\",
      "\t\t\t\t!GPIOB_ReadPortPin(KEY2_PIN) : \\",
      "\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))",
    ].join(lineEnding),
    powerSource: [
      "void poweroff()",
      "{",
      "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
      "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);",
      "\tGPIOA_ModeCfg(CHARGE_STT_PIN, GPIO_ModeIN_PU);",
      "\tGPIOA_ITModeCfg(CHARGE_STT_PIN, GPIO_ITMode_FallEdge);",
      "}",
    ].join(lineEnding),
  };
}

test("260404 is the default and both exact profiles are supported", () => {
  assert.equal(DEFAULT_HARDWARE_PROFILE, flippedProfile);
  assert.deepEqual(SUPPORTED_HARDWARE_PROFILES, [
    legacyProfile,
    flippedProfile,
  ]);
  assert.ok(Object.isFrozen(SUPPORTED_HARDWARE_PROFILES));
});

test("260404 flips only KEY1 input, read, and wake polarity", () => {
  const input = pinnedSources();
  const result = applyHardwareProfile({
    ...input,
    profile: flippedProfile,
  });

  assert.equal(result.changed, true);
  assert.equal(
    result.buttonSource,
    input.buttonSource.replace(
      "GPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD)",
      "GPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU)",
    ),
  );
  assert.equal(
    result.buttonHeader,
    input.buttonHeader.replace(
      "GPIOA_ReadPortPin(KEY1_PIN)",
      "!GPIOA_ReadPortPin(KEY1_PIN)",
    ),
  );
  assert.equal(
    result.powerSource,
    input.powerSource
      .replace(
        "GPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD)",
        "GPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU)",
      )
      .replace(
        "GPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge)",
        "GPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_FallEdge)",
      ),
  );
  assert.match(result.buttonSource, /KEY2_PIN, GPIO_ModeIN_PU/);
  assert.match(result.buttonHeader, /!GPIOB_ReadPortPin\(KEY2_PIN\)/);
  assert.match(result.powerSource, /CHARGE_STT_PIN, GPIO_ITMode_FallEdge/);
});

test("250901 verifies pinned snippets and is a write-free no-op", () => {
  const input = pinnedSources("\r\n");
  const result = applyHardwareProfile({
    ...input,
    profile: legacyProfile,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(
    {
      buttonSource: result.buttonSource,
      buttonHeader: result.buttonHeader,
      powerSource: result.powerSource,
    },
    pinnedSources(),
  );
});

test("unknown profiles fail closed", () => {
  assert.throws(
    () =>
      applyHardwareProfile({
        ...pinnedSources(),
        profile: "B1144C_UNKNOWN_USB_C",
      }),
    /unsupported FOSSASIA hardware profile/,
  );
});

test("missing pinned snippets fail closed", () => {
  const sources = pinnedSources();
  assert.throws(
    () =>
      applyHardwareProfile({
        ...sources,
        buttonSource: sources.buttonSource.replace(
          "GPIO_ModeIN_PD",
          "GPIO_ModeIN_Floating",
        ),
        profile: flippedProfile,
      }),
    /KEY1 input-pull configuration must match exactly once/,
  );
  assert.throws(
    () =>
      applyHardwareProfile({
        ...sources,
        buttonHeader: sources.buttonHeader.replace(
          "GPIOA_ReadPortPin",
          "GPIOA_ReadPin",
        ),
        profile: legacyProfile,
      }),
    /KEY1 pressed-polarity expression must match exactly once/,
  );
  assert.throws(
    () =>
      applyHardwareProfile({
        ...sources,
        powerSource: sources.powerSource.replace(
          "GPIO_ITMode_RiseEdge",
          "GPIO_ITMode_HighLevel",
        ),
        profile: flippedProfile,
      }),
    /KEY1 shutdown wake configuration must match exactly once/,
  );
});

test("duplicate pinned snippets fail closed", () => {
  const sources = pinnedSources();
  assert.throws(
    () =>
      applyHardwareProfile({
        ...sources,
        buttonSource: `${sources.buttonSource}\n\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);`,
        profile: legacyProfile,
      }),
    /KEY1 input-pull configuration must match exactly once/,
  );
  assert.throws(
    () =>
      applyHardwareProfile({
        ...sources,
        buttonHeader: `${sources.buttonHeader}\n\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))`,
        profile: flippedProfile,
      }),
    /KEY1 pressed-polarity expression must match exactly once/,
  );
  assert.throws(
    () =>
      applyHardwareProfile({
        ...sources,
        powerSource: [
          sources.powerSource,
          "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
          "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);",
        ].join("\n"),
        profile: flippedProfile,
      }),
    /KEY1 shutdown wake configuration must match exactly once/,
  );
});
