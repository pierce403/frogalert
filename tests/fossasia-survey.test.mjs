import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  applyAnimationHooks,
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
    "static void link_onEstablished(gapRoleEvent_t *pe)",
    "{",
    "\tconn_list.connTimeout = e->connTimeout;",
    "\tenable_advertising(FALSE);",
    "}",
    "static void link_onTerminated(gapRoleEvent_t *pe)",
    "{",
    "\tgapTerminateLinkEvent_t *event = (gapTerminateLinkEvent_t *)pe;",
    "\tGAPRole_TerminateLink(pe->linkCmpl.connectionHandle);",
    "\tenable_advertising(TRUE);",
    "",
    "\tif(event->connectionHandle == conn_list.connHandle) {",
    "\t\tconn_list.connHandle = GAP_CONNHANDLE_INIT;",
    "\t\tconn_list.connInterval = 0;",
    "\t\tconn_list.connSlaveLatency = 0;",
    "\t\tconn_list.connTimeout = 0;",
    "\t} else {",
    "\t\t// Requested connection is not existed in connection list",
    "\t}",
    "}",
  ].join("\r\n");
  const main = [
    '#include "ble/setup.h"',
    '#include "ble/profile.h"',
    "static void bm_transition()",
    "{",
    "\tif (is_play_sequentially) {",
    "\t\tis_play_sequentially = 0;",
    "\t\tbmlist_gohead();",
    "\t\treturn;",
    "\t}",
    "",
    "\tbmlist_gonext();",
    "\tif (bmlist_current() == bmlist_head()) {",
    "\t\tis_play_sequentially = 1;",
    "\t\treturn;",
    "\t}",
    "}",
    "void play_splash",
    "\tperipheral_init();",
    "",
    "\tif (! badge_cfg.ble_always_on) {",
    "\tif (params[0] == 0x00) { // enter streaming mode",
    "\t\tstop_all_animation();",
    "\t\tstreaming_enabled = 1;",
    "\t} else if (params[0] == 0x01) { // return to normal mode",
    "\t\tresume_from_streaming();",
    "\t\tstreaming_enabled = 0;",
    "\t}",
    "static void disp_charging()",
    "{",
    "",
    "\t// Disable bitmap transition while in download mode",
    "\tbtn_onOnePress(KEY2, NULL);",
    "",
    "\t// Take control of the current bitmap to display",
    "\t// the Bluetooth animation",
    "\tble_enable_advertise();",
    "\tstart_ble_animation();",
    "static void mode_setup_normal()",
    "{",
    "\tbtn_onOnePress(KEY2, bm_transition);",
    "\treload_bmlist();",
    "\tstart_normal_animation();",
    "}",
    "void handle_after_rx()",
    "{",
    "\tif (badge_cfg.reset_rx) {",
    "\t\tSYS_ResetExecute();",
    "\t} else {",
    "\t\tmode_setup_normal();",
    "\t}",
    "}",
    "\tbtn_onOnePress(KEY1, change_mode);",
    "\tbtn_onOnePress(KEY2, bm_transition);",
    "\tbtn_onLongPress(KEY1, change_brightness);",
  ].join("\r\n");

  const patchedPeripheral = applyPeripheralHooks(peripheral);
  const patchedMain = applyMainHooks(main);
  assert.match(patchedPeripheral, /GAPRole_PeripheralInit\(\);[\s\S]*frogalert_survey_role_init\(\);/);
  assert.match(
    patchedPeripheral,
    /enable_advertising\(FALSE\);[\s\S]*frogalert_survey_suspend\(FALSE\)/,
  );
  assert.match(
    patchedPeripheral,
    /conn_list\.connHandle = GAP_CONNHANDLE_INIT;[\s\S]*frogalert_survey_on_disconnect\(\);[\s\S]*frogalert_survey_suspend\(TRUE\)[\s\S]*enable_advertising\(TRUE\)/,
  );
  assert.doesNotMatch(
    patchedPeripheral,
    /GAPRole_TerminateLink\([^;]+;[\s\S]{0,80}enable_advertising\(TRUE\);/,
  );
  assert.match(patchedMain, /peripheral_init\(\);[\s\S]*frogalert_survey_init\(\);/);
  assert.match(patchedMain, /mode == NORMAL && !streaming_enabled/);
  assert.match(patchedMain, /static uint8_t frogalert_counter_view/);
  assert.match(patchedMain, /frogalert_view_transition/);
  assert.match(
    patchedMain,
    /frogalert_counter_view = FALSE;[\s\S]*is_play_sequentially = FALSE;[\s\S]*bmlist_gonext\(\)[\s\S]*frogalert_counter_view = TRUE/,
  );
  const viewTransition = patchedMain.match(
    /static void frogalert_view_transition\(void\)\n\{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(viewTransition);
  assert.doesNotMatch(viewTransition, /bm_transition\(\)/);
  assert.match(
    patchedMain,
    /frogalert_survey_on_disconnect\(void\)[\s\S]*streaming_enabled = 0;[\s\S]*mode == NORMAL[\s\S]*start_normal_animation\(\);[\s\S]*start_ble_animation\(\);[\s\S]*frogalert_survey_view_changed\(\)/,
  );
  assert.match(
    patchedMain,
    /btn_onOnePress\(KEY2, frogalert_view_transition\)/,
  );
  assert.match(
    patchedMain,
    /frogalert_survey_suspend\(TRUE\)[\s\S]*ble_enable_advertise\(\)/,
  );
  assert.match(patchedMain, /mode = NORMAL;[\s\S]*mode_setup_normal\(\)/);
  assert.match(patchedMain, /stop_all_animation\(\);/);
  assert.match(patchedMain, /frogalert_survey_bitmap/);
  assert.match(patchedMain, /frogalert_survey_offset \+ column/);
  assert.match(patchedMain, /FROGALERT_SURVEY_TEXT_MAX\s+16/);
  assert.match(patchedMain, /frogalert_display_survey_message/);
  assert.match(patchedMain, /text\[5\] = '\+'/);
  assert.match(patchedMain, /\(char\)phase/);
  assert.match(
    patchedMain,
    /if \(!frogalert_survey_display_owned\)[\s\S]*stop_all_animation\(\)/,
  );
  assert.match(
    patchedMain,
    /if \(!frogalert_survey_display_active\(\)\)[\s\S]*frogalert_display_survey_release\(\)/,
  );
  assert.match(
    patchedMain,
    /frogalert_display_survey_release[\s\S]*start_normal_animation\(\)/,
  );
  assert.match(
    patchedMain,
    /stop_all_animation\(\);[\s\S]*frogalert_survey_suspend\(FALSE\);[\s\S]*frogalert_display_survey_relinquish\(\);[\s\S]*streaming_enabled = 1;/,
  );
  assert.doesNotMatch(
    patchedMain,
    /void frogalert_display_survey_step\(void\)[\s\S]*?\n\tstop_all_animation\(\);/,
  );
  assert.match(patchedMain, /frogalert_display_survey_step\(\);/);
  assert.match(patchedMain, /void frogalert_display_frog_dance/);
  assert.match(patchedMain, /static const uint16_t frogs\[2\]\[9\]/);
  assert.match(patchedMain, /static const uint8_t starts\[3\]/);
  assert.throws(
    () => applyPeripheralHooks(patchedPeripheral),
    /must match exactly once/,
  );
});

test("survey animation hooks crop only qualified padded 48-column frames", () => {
  const animation = [
    '#include "bmlist.h"',
    '#include "debug.h"',
    "int ani_animation(bm_t *bm, uint16_t *fb)",
    "{",
    "\tint frame_steps = ANI_ANIMATION_STEPS;",
    "\tint frames = ALIGN(bm->width, LED_COLS) / LED_COLS;",
    "\tint total_steps = frame_steps * frames;",
    "\tint frame = mod(bm->anim_step, total_steps)/frame_steps;",
    "",
    "\tbm->anim_step++;",
    "",
    "\tstill(bm, fb, frame);",
    "",
    "\treturn mod(bm->anim_step, total_steps);",
    "}",
    "int ani_fixed(bm_t *bm, uint16_t *fb)",
    "{",
    "\tint frame_steps = ANI_FIXED_STEPS;",
    "\tint frames = ALIGN(bm->width, LED_COLS) / LED_COLS;",
    "\tint total_steps = frame_steps * frames;",
    "\tint frame = mod(bm->anim_step, total_steps)/frame_steps;",
    "",
    "\tbm->anim_step++;",
    "\tstill(bm, fb, frame);",
    "",
    "\treturn mod(bm->anim_step, total_steps);",
    "}",
  ].join("\r\n");

  const patched = applyAnimationHooks(animation);
  assert.match(patched, /#include "frogalert-animation-compat\.h"/);
  assert.match(
    patched,
    /#if LED_COLS != FROGALERT_ANIMATION_VISIBLE_COLUMNS/,
  );
  assert.equal(
    patched.match(/frogalert_animation_frame_count/g)?.length,
    2,
  );
  assert.equal(
    patched.match(/frogalert_animation_copy_visible_frame/g)?.length,
    2,
  );
  assert.equal(patched.match(/if \(frames == 0\)/g)?.length, 2);
  assert.doesNotMatch(patched, /ani_scroll_x[\s\S]*frogalert_animation/);
  assert.throws(
    () => applyAnimationHooks(patched),
    /must match exactly once/,
  );
});

test("survey candidate is passive, bounded, ephemeral, and connection-safe", async () => {
  const [survey, core, animationCompat, animationHeader, overlay, build] =
    await Promise.all([
      readFile(path.join(firmwareDirectory, "frogalert-survey.c"), "utf8"),
      readFile(path.join(firmwareDirectory, "frogalert-survey-core.c"), "utf8"),
      readFile(
        path.join(firmwareDirectory, "frogalert-animation-compat.c"),
        "utf8",
      ),
      readFile(
        path.join(firmwareDirectory, "frogalert-animation-compat.h"),
        "utf8",
      ),
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
  assert.match(survey, /SURVEY_CYCLE_TIME_MS\s+20000U/);
  assert.match(survey, /SURVEY_SCAN_TIME_MS\s+3000U/);
  assert.match(
    survey,
    /SURVEY_NEXT_DELAY\s+TMOS_TICKS_FROM_MS\(\s*\\\s*\n\s*SURVEY_CYCLE_TIME_MS - SURVEY_SCAN_TIME_MS\)/,
  );
  assert.match(
    survey,
    /SURVEY_SCAN_TICKS\s+TMOS_TICKS_FROM_MS\(SURVEY_SCAN_TIME_MS\)/,
  );
  assert.match(survey, /SURVEY_SCROLL_TIME\s+TMOS_TICKS_FROM_MS\(100U\)/);
  assert.match(survey, /SURVEY_WATCHDOG_TIME\s+TMOS_TICKS_FROM_MS\(5000U\)/);
  assert.match(survey, /SURVEY_ALERT_TIME\s+TMOS_TICKS_FROM_MS\(3000U\)/);
  assert.match(survey, /SURVEY_FROG_TIME\s+TMOS_TICKS_FROM_MS\(3000U\)/);
  assert.match(
    survey,
    /save_survey_view\(0, FALSE, SURVEY_PHASE_INITIALIZING\)/,
  );
  assert.match(survey, /tmos_start_reload_task\(survey_task_id,[\s\S]*SURVEY_DISPLAY_STEP_EVENT/);
  assert.ok(
    survey.indexOf("save_survey_view(0, FALSE,") <
      survey.indexOf("status = GAPRole_CentralStartDevice"),
    "diagnostic count must render before central-role startup",
  );
  assert.match(
    survey,
    /status == SUCCESS \|\| status == bleAlreadyInRequestedMode\)[\s\S]*mark_central_ready\(\)/,
  );
  assert.match(survey, /event->discCmpl\.pDevList\[index\]\.addr/);
  assert.match(survey, /frogalert_survey_classify/);
  assert.match(survey, /address_type == ADDRTYPE_PUBLIC/);
  assert.match(survey, /event->deviceInfo\.addrType/);
  assert.match(survey, /event->deviceExtAdvInfo\.addrType/);
  assert.match(survey, /event->deviceDirectInfo\.addrType/);
  assert.match(survey, /event->discCmpl\.pDevList\[index\]\.addrType/);
  assert.match(survey, /event->deviceInfo\.pEvtData/);
  assert.match(survey, /event->deviceExtAdvInfo\.pEvtData/);
  assert.match(survey, /"COP DETECTED"/);
  assert.match(survey, /"FLIPPER DETECTED"/);
  assert.match(survey, /FROGALERT_ALERT_FROG_DANCE/);
  assert.match(survey, /frogalert_display_frog_dance/);
  assert.match(survey, /SURVEY_ALERT_END_EVENT/);
  assert.match(survey, /alert == detected_alert/);
  assert.match(
    survey,
    /detected_alert = FROGALERT_ALERT_NONE;[\s\S]*alert_visible = 0;[\s\S]*SURVEY_ALERT_END_EVENT/,
  );
  assert.match(survey, /alert_visible = 0;[\s\S]*display_selected_view\(\)/);
  assert.match(survey, /frogalert_survey_counter_mode\(\)/);
  assert.match(survey, /frogalert_display_survey_release\(\)/);
  assert.match(
    survey,
    /frogalert_survey_suspend\(uint8_t advertise_after\)/,
  );
  assert.ok(
    survey.indexOf("GAPRole_CentralCancelDiscovery()") <
      survey.indexOf("return FALSE;", survey.indexOf("frogalert_survey_suspend")),
    "active discovery suspension must request cancellation before deferring advertising",
  );
  assert.match(survey, /cancel_reason = SURVEY_CANCEL_SUSPEND/);
  assert.match(survey, /event->discCmpl\.hdr\.status != SUCCESS/);
  assert.match(survey, /finish_survey\(reason\)/);
  assert.match(survey, /restore_completed_view\(\)/);
  assert.match(
    survey,
    /advertise_when_idle && !peripheral_is_connected\(\)/,
  );
  assert.match(survey, /show_survey\(SURVEY_PHASE_SCANNING\)/);
  assert.match(survey, /GAPRole_CentralCancelDiscovery\(\)/);
  assert.match(survey, /GAPROLE_ADVERT_ENABLED/);
  assert.match(survey, /status != SUCCESS \|\| advertising_enabled/);
  assert.match(survey, /status == bleIncorrectMode/);
  assert.match(survey, /status != SUCCESS/);
  assert.match(survey, /frogalert_survey_counter_reset\(&survey_counter\)/);
  assert.doesNotMatch(survey, /GAPRole_CentralEstablishLink/);
  assert.doesNotMatch(survey, /PRINT\([^\n]*(addr|address)/i);
  assert.match(core, /volatile uint8_t \*bytes/);
  assert.match(core, /uint8_t frogalert_survey_counter_observe/);
  assert.match(core, /frogalert_survey_alert_t frogalert_survey_classify/);
  assert.match(core, /address\[5\] == prefix\[0\]/);
  assert.doesNotMatch(core, /address\[0\] == prefix\[0\]/);
  assert.match(core, /"axon body"/);
  assert.match(core, /"taser"/);
  assert.match(core, /"flipper"/);
  assert.match(core, /"led badge magic"/);
  assert.match(core, /ascii_equal_padded/);
  assert.match(core, /current\.value\[index\] == 0xe0/);
  assert.match(core, /current\.value\[index \+ 1\] == 0xfe/);
  assert.match(core, /"ray-ban"/);
  assert.match(core, /"ray ban"/);
  assert.match(core, /GAP_ADTYPE_LOCAL_NAME_COMPLETE/);
  assert.match(
    animationCompat,
    /width % FROGALERT_ANIMATION_WIRE_COLUMNS != 0/,
  );
  assert.match(
    animationCompat,
    /bitmap\[base\] != 0 \|\| bitmap\[base \+ 1\] != 0/,
  );
  assert.match(
    animationCompat,
    /bitmap\[base \+ 46\] != 0 \|\| bitmap\[base \+ 47\] != 0/,
  );
  assert.match(animationHeader, /FROGALERT_ANIMATION_WIRE_COLUMNS\s+48U/);
  assert.match(overlay, /^CFLAGS \+= -DFROGALERT_SURVEY=1$/m);
  assert.match(overlay, /src\/frogalert_animation_compat\.c/);
  assert.match(build, /baseline\|canary\|survey/);
  assert.match(build, /frogalert-animation-compat\.c/);
  assert.match(build, /frogalert-animation-compat\.h/);
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

test("Flipper name evidence is pinned to official firmware", async () => {
  const lock = await loadLock();
  assert.deepEqual(lock.flipper_reference, {
    repository: "https://github.com/flipperdevices/flipperzero-firmware",
    commit: "7432d21a7e362d4a5f636e24d6209fbb2eedff1f",
    device_name_source: "targets/f7/furi_hal/furi_hal_version.c",
    advertising_source: "targets/f7/ble_glue/gap.c",
    profile_source: "targets/f7/ble_glue/profiles/serial_profile.c",
  });
});
