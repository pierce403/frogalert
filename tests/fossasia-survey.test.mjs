import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  applyMainHooks,
  applyPeripheralHooks,
} from "../scripts/apply-fossasia-survey.mjs";
import { loadLock, surveyText } from "../scripts/audit-fossasia-usbc.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const firmwareDirectory = path.join(
  repositoryRoot,
  "firmware/fossasia-usbc",
);

test("survey hooks preserve the FOSSASIA shell and fail closed on drift", () => {
  const peripheral = [
    '#include "setup.h"',
    '#include "../config.h"',
    "static void gap_init()",
    "{",
    "\tGAPRole_PeripheralInit();",
    "",
    "\tuint16_t min_interval = 6;",
  ].join("\r\n");
  const main = [
    '#include "ble/setup.h"',
    '#include "ble/profile.h"',
    "\tperipheral_init();",
    "",
    "\tif (! badge_cfg.ble_always_on) {",
    "static void disp_charging()",
    "{",
    "",
  ].join("\r\n");

  const patchedPeripheral = applyPeripheralHooks(peripheral);
  const patchedMain = applyMainHooks(main);
  assert.match(patchedPeripheral, /GAPRole_PeripheralInit\(\);[\s\S]*frogalert_survey_role_init\(\);/);
  assert.match(patchedMain, /peripheral_init\(\);[\s\S]*frogalert_survey_init\(\);/);
  assert.match(patchedMain, /mode == NORMAL && !streaming_enabled/);
  assert.match(patchedMain, /stop_all_animation\(\);/);
  assert.match(patchedMain, /frogalert_survey_bitmap/);
  assert.match(patchedMain, /frogalert_survey_offset \+ column/);
  assert.match(patchedMain, /text\[5\] = '\+'/);
  assert.match(patchedMain, /frogalert_display_survey_step\(\);/);
  assert.doesNotMatch(patchedMain, /mode_setup_normal\(\);/);
  assert.throws(
    () => applyPeripheralHooks(patchedPeripheral),
    /must match exactly once/,
  );
});

test("survey candidate is passive, bounded, ephemeral, and connection-safe", async () => {
  const [survey, core, overlay, build] = await Promise.all([
    readFile(path.join(firmwareDirectory, "frogalert-survey.c"), "utf8"),
    readFile(path.join(firmwareDirectory, "frogalert-survey-core.c"), "utf8"),
    readFile(path.join(firmwareDirectory, "frogalert-survey.mk"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts/build-fossasia-usbc"), "utf8"),
  ]);

  assert.match(survey, new RegExp(surveyText));
  assert.match(
    survey,
    /GAPRole_CentralStartDiscovery\(DEVDISC_MODE_ALL, FALSE,\s*FALSE\)/,
  );
  assert.match(survey, /peripheral_is_connected\(\)/);
  assert.match(survey, /frogalert_survey_allowed\(\)/);
  assert.match(survey, /SURVEY_SCAN_TICKS\s+4800U/);
  assert.match(survey, /SURVEY_NEXT_DELAY\s+TMOS_TICKS_FROM_MS\(57000U\)/);
  assert.match(survey, /SURVEY_SCROLL_TIME\s+TMOS_TICKS_FROM_MS\(100U\)/);
  assert.match(survey, /SURVEY_WATCHDOG_TIME\s+TMOS_TICKS_FROM_MS\(5000U\)/);
  assert.match(survey, /frogalert_display_survey_count\(0, FALSE\)/);
  assert.match(survey, /tmos_start_reload_task\(survey_task_id,[\s\S]*SURVEY_DISPLAY_STEP_EVENT/);
  assert.ok(
    survey.indexOf("frogalert_display_survey_count(0, FALSE)") <
      survey.indexOf("status = GAPRole_CentralStartDevice"),
    "diagnostic count must render before central-role startup",
  );
  assert.doesNotMatch(survey, /SURVEY_DISPLAY_END_EVENT/);
  assert.match(survey, /GAPRole_CentralCancelDiscovery\(\)/);
  assert.match(survey, /GAPROLE_ADVERT_ENABLED/);
  assert.match(survey, /status != SUCCESS \|\| advertising_enabled/);
  assert.match(survey, /status == SUCCESS \|\| status == bleIncorrectMode/);
  assert.match(survey, /frogalert_survey_counter_reset\(&survey_counter\)/);
  assert.doesNotMatch(survey, /GAPRole_CentralEstablishLink/);
  assert.doesNotMatch(survey, /PRINT\([^\n]*(addr|address)/i);
  assert.match(core, /volatile uint8_t \*bytes/);
  assert.match(overlay, /^CFLAGS \+= -DFROGALERT_SURVEY=1$/m);
  assert.match(build, /baseline\|canary\|survey/);
  assert.match(build, /apply-fossasia-survey\.mjs/);
  assert.doesNotMatch(build, /\bwchisp\b/);
  assert.match(build, /audit-fossasia-usbc\.mjs" ram/);
  assert.match(build, /cleanup_failed_audit/);
});

test("survey role pattern is pinned to WCH's combined-role example", async () => {
  const lock = await loadLock();
  assert.deepEqual(lock.survey_reference, {
    repository: "https://github.com/openwch/ch583",
    commit: "bd508ad7ceed48377619837051412a651952857f",
    combined_role_example: "EVT/EXAM/BLE/CentPeri/APP/centPeri_main.c",
    central_scan_example: "EVT/EXAM/BLE/CentPeri/APP/central.c",
    ble_heap_config: "EVT/EXAM/BLE/HAL/include/config.h",
  });
});
