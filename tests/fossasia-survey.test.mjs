import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  applyAnimationHooks,
  applyBatteryPowerHooks,
  applyButtonHeaderHooks,
  applyButtonHooks,
  applyDeviceInfoHooks,
  applyMainHooks,
  applyPeripheralHooks,
  applyPowerHooks,
} from "../scripts/apply-fossasia-survey.mjs";
import { loadLock } from "../scripts/audit-fossasia-usbc.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const firmwareDirectory = path.join(
  repositoryRoot,
  "firmware/fossasia-usbc",
);

test("survey hooks keep KEY1 polarity bound to the compiled profile", () => {
  const button = [
    "static uint16_t btn_task(tmosTaskID, uint16_t);",
    "",
    "void btn_init()",
    "{",
    "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
    "\tGPIOB_ModeCfg(KEY2_PIN, GPIO_ModeIN_PU);",
  ].join("\n");
  const activeHighHeader = [
    "#define isPressed(key) \t\t((key) ? \\",
    "\t\t\t\t!GPIOB_ReadPortPin(KEY2_PIN) : \\",
    "\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))",
    "",
  ].join("\n");
  const activeLowHeader = activeHighHeader.replace(
    "\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))",
    "\t\t\t\t!GPIOA_ReadPortPin(KEY1_PIN))",
  );
  const legacyPower = [
    "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
    "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);",
  ].join("\n");
  const currentPower = legacyPower
    .replace("GPIO_ModeIN_PD", "GPIO_ModeIN_PU")
    .replace("GPIO_ITMode_RiseEdge", "GPIO_ITMode_FallEdge");

  const patchedButton = applyButtonHooks(button);
  assert.match(
    patchedButton,
    /FROGALERT_PROFILE_B1144C_250901_USB_C[\s\S]*return GPIOA_ReadPortPin\(KEY1_PIN\) != 0;[\s\S]*return GPIOA_ReadPortPin\(KEY1_PIN\) == 0;/,
  );
  assert.doesNotMatch(
    patchedButton,
    /DelayUs|pulled_down|pulled_up|candidate|confidence/,
  );
  assert.doesNotMatch(patchedButton, /btn_key1_profile_detected/);
  assert.doesNotMatch(patchedButton, /btn_key1_profile\(void\)/);
  assert.equal(
    patchedButton.match(/GPIOB_ModeCfg\(KEY2_PIN, GPIO_ModeIN_PU\)/g)?.length,
    1,
  );
  for (const header of [activeHighHeader, activeLowHeader]) {
    const patchedHeader = applyButtonHeaderHooks(header);
    assert.match(patchedHeader, /btn_key1_pressed\(\)/);
    assert.match(patchedHeader, /!GPIOB_ReadPortPin\(KEY2_PIN\)/);
  }
  for (const power of [legacyPower, currentPower]) {
    const patchedPower = applyPowerHooks(power);
    assert.match(patchedPower, /btn_configure_key1_wake\(\)/);
    assert.match(patchedPower, /#else[\s\S]*GPIOA_ITModeCfg/);
  }
});

test("survey battery hooks calibrate, average, and clamp the real ADC reading", () => {
  const power = [
    '#include "debug.h"',
    "void power_init()",
    "{",
    "\tGPIOA_ModeCfg(GPIO_Pin_5, GPIO_ModeIN_Floating);",
    "\tADC_ExtSingleChSampInit(SampleFreq_3_2, ADC_PGA_0);",
    "",
    "\tint16_t adc_calib = ADC_DataCalib_Rough();",
    '\tPRINT("RoughCalib_Value = %d \\n", adc_calib);',
    "",
    "\tADC_ChannelCfg(1);",
    "}",
    "int batt_raw()",
    "{",
    "\tint ret = 0;",
    "",
    '\tPRINT("ADC reading: \\n");',
    "\tuint16_t buf[20];",
    "\tfor(int i = 0; i < 20; i++) {",
    "\t\tuint16_t adc = ADC_ExcutSingleConver();",
    "\t\tret += adc;",
    '\t\tPRINT("%d \\n", adc);',
    "\t}",
    "",
    "\treturn ret / 20;",
    "}",
    "#define ZERO_PERCENT_THRES      (3.3)",
    "#define _100_PERCENT_THRES      (4.2)",
    "#define ADC_MAX_VAL             (4096.0) // 12 bit",
    "#define ADC_MAX_VOLT            (2.1)   // Volt",
    "#define R1                      (182.0) // kOhm",
    "#define R2                      (100.0) // kOhm",
    "#define PERCENT_RANGE           (_100_PERCENT_THRES - ZERO_PERCENT_THRES)",
    "#define VOLT_DIV(v)             ((v) / (R1 + R2) * R2) // Voltage divider",
    "#define VOLT_DIV_INV(v)         ((v) / R2 * (R1 + R2)) // .. Inverse",
    "#define ADC2VOLT(raw)           ((raw) / ADC_MAX_VAL * ADC_MAX_VOLT)",
    "#define VOLT2ADC(volt)          ((volt) / ADC_MAX_VOLT * ADC_MAX_VAL)",
    "",
    "int batt_raw2percent(int r)",
    "{",
    "\tfloat vadc = ADC2VOLT(r);",
    "\tfloat vbat = VOLT_DIV_INV(vadc);",
    "\tfloat strip = vbat - ZERO_PERCENT_THRES;",
    "\tif (strip < PERCENT_RANGE) {",
    "\t\t// Negative values meaning the battery is not connected or died",
    "\t\treturn (int)(strip / PERCENT_RANGE * 100.0);",
    "\t}",
    "\treturn 100;",
    "}",
  ].join("\n");
  const deviceInfo = [
    "static const uint8_t    firmwareRev_val[] = USBC_VER_PREFIX VERSION;",
    'static const uint8_t    mfr_name_val[] = "FOSSASIA";',
  ].join("\n");
  const patchedPower = applyBatteryPowerHooks(power);
  const patchedDeviceInfo = applyDeviceInfoHooks(deviceInfo);

  assert.match(patchedPower, /static int16_t frogalert_adc_calibration/);
  assert.match(
    patchedPower,
    /frogalert_adc_calibration = ADC_DataCalib_Rough\(\)/,
  );
  assert.match(
    patchedPower,
    /\(void\)ADC_ExcutSingleConver\(\);[\s\S]*ADC_ExcutSingleConver\(\) \+[\s\S]*frogalert_adc_calibration/,
  );
  assert.match(patchedPower, /adc < 0[\s\S]*adc > 4095/);
  assert.match(
    patchedPower,
    /r < 0[\s\S]*r > 4095[\s\S]*frogalert_battery_from_raw/,
  );
  assert.doesNotMatch(patchedPower, /float|ADC2VOLT|PERCENT_RANGE/);
  assert.match(
    patchedDeviceInfo,
    /firmwareRev_val\[\] = "FrogAlert " FROGALERT_VERSION " \/ FOSSASIA " VERSION/,
  );
  assert.match(patchedDeviceInfo, /mfr_name_val\[\] = "FOSSASIA"/);
});

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
    '#include "power.h"',
    '#include "ble/setup.h"',
    '#include "ble/profile.h"',
    "#define ANI_NEXT_STEP       (1 << 0)",
    "\tif(events & ANI_NEXT_STEP) {",
    "",
    "\t\tstatic int (*animations[])(bm_t *bm, uint16_t *fb) = {",
    "\tif (events & ANI_MARQUE) {",
    "\t\tbm_t *bm = bmlist_current();",
    "\tif (events & ANI_FLASH) {",
    "\t\tbm_t *bm = bmlist_current();",
    "\tif (events & BLE_NEXT_STEP) {",
    "\t\tani_xbm_next_frame(&bluetooth, fb, 10, 0);",
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
    "void load_bmlist()",
    "{",
    "\tdata_legacy_t header;",
    "\tdata_get_header(&header);",
    '\tif (memcmp(header.header, "wang", 5))',
    "\t\treturn;",
    "",
    "\tbm_t *curr_bm = bmlist_current();",
    "\tbmlist_drop(curr_bm);",
    "}",
    "",
    "static uint16_t common_tasks",
    "\tperipheral_init();",
    "",
    "\tif (! badge_cfg.ble_always_on) {",
    "\t\tble_disable_advertise();",
    "\t}",
    "",
    "\tdevInfo_registerService();",
    "\tif (params[0] == 0x00) { // enter streaming mode",
    "\t\tstop_all_animation();",
    "\t\tstreaming_enabled = 1;",
    "\t} else if (params[0] == 0x01) { // return to normal mode",
    "\t\tresume_from_streaming();",
    "\t\tstreaming_enabled = 0;",
    "\t}",
    "static void disp_charging()",
    "{",
    "\tint blink = 0;",
    "\twhile (mode == BOOT) {",
    "\t\tbtn_tick();",
    "\t\tint percent = batt_raw2percent(batt_raw());",
    "",
    "\t\tif (charging_status()) {",
    "\t\t\tdisp_bat_stt(blink ? percent : 0, 2, 2);",
    "\t\t\tif (ani_xbm_next_frame(&fabm_xbm, fb, 16, 0) == 0) {",
    "\t\t\t\tfb_puts(VERSION_ABBR, sizeof(VERSION_ABBR), 16, 2);",
    "\t\t\t\tfb_putchar(' ', 40, 2);",
    "\t\t\t}",
    "\t\t\tblink = !blink;",
    "\t\t\tDelayMs(500);",
    "\t\t} else {",
    "\t\t\tdisp_bat_stt(percent, 7, 2);",
    "\t\t\tDelayMs(500);",
    "\t\t\treturn;",
    "\t\t}",
    "\t}",
    "}",
    "\t// Disable bitmap transition while in download mode",
    "\tbtn_onOnePress(KEY2, NULL);",
    "",
    "\t// Take control of the current bitmap to display",
    "\t// the Bluetooth animation",
    "\tble_enable_advertise();",
    "\tstart_ble_animation();",
    "void reload_bmlist()",
    "{",
    "\tclean_bmlist();",
    "\tload_bmlist();",
    "}",
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
    "\tpower_init();",
    "\tdisp_charging();",
    "\tcfg_init();",
    "\tTMR0_TimerInit((FREQ_SYS / 2000) / 2);",
    "\tload_bmlist();",
    "",
    "\tble_setup();",
    "\t\t\tled_write2dcol(i >> 2, fb[i >> 1], fb[(i >> 1) + 1]);",
    "\t\telse if (state > (badge_cfg.led_brightness&3))",
    "}",
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
    /conn_list\.connHandle = GAP_CONNHANDLE_INIT;[\s\S]*frogalert_survey_on_disconnect\(\);[\s\S]*frogalert_survey_should_advertise\(\)[\s\S]*frogalert_survey_suspend\(advertise_after\)[\s\S]*enable_advertising\(TRUE\)/,
  );
  assert.doesNotMatch(
    patchedPeripheral,
    /GAPRole_TerminateLink\([^;]+;[\s\S]{0,80}enable_advertising\(TRUE\);/,
  );
  assert.match(patchedMain, /peripheral_init\(\);[\s\S]*frogalert_survey_init\(\);/);
  assert.match(patchedMain, /#include "frogalert-boot-status.h"/);
  assert.match(
    patchedMain,
    /frogalert_display_boot_status\(void\)[\s\S]*frogalert_battery_from_raw[\s\S]*frogalert_boot_render_credit[\s\S]*frogalert_boot_render_battery/,
  );
  assert.match(
    patchedMain,
    /power_init\(\);[\s\S]*disp_charging\(\);[\s\S]*frogalert_display_boot_status\(\);[\s\S]*cfg_init\(\);/,
  );
  assert.doesNotMatch(
    patchedMain.match(/#ifdef FROGALERT_SURVEY[\s\S]*?#else/)?.[0] ?? "",
    /VERSION_ABBR/,
  );
  assert.match(
    patchedMain,
    /Android app connects to the first matching FEE0 advertiser[\s\S]*frogalert_survey_open_app_window\(\)/,
  );
  assert.doesNotMatch(patchedMain, /frogalert_key1_transition/);
  assert.match(
    patchedMain,
    /frogalert_key2_transition\(void\)[\s\S]*frogalert_view_transition\(\);[\s\S]*frogalert_open_app_window\(\)/,
  );
  assert.match(
    patchedMain,
    /frogalert_badgemagic_persistent_advertising\(void\)[\s\S]*badge_cfg\.ble_always_on \|\| mode == DOWNLOAD/,
  );
  assert.match(
    patchedMain,
    /frogalert_display_app_attention_start\(void\)[\s\S]*frogalert_display_survey_relinquish\(\);[\s\S]*start_ble_animation\(\)/,
  );
  assert.match(
    patchedMain,
    /frogalert_display_app_attention_end\(void\)[\s\S]*mode != NORMAL \|\| streaming_enabled[\s\S]*start_normal_animation\(\);[\s\S]*frogalert_survey_view_changed\(\)/,
  );
  assert.match(
    patchedMain,
    /#define FROGALERT_LED_TICK_HZ \(16000\)/,
  );
  assert.match(
    patchedMain,
    /TMR0_TimerInit\(FREQ_SYS \/ FROGALERT_LED_TICK_HZ\)/,
  );
  assert.match(
    patchedMain,
    /else if \(state == \(badge_cfg\.led_brightness&3\) \+ 1\)/,
  );
  assert.doesNotMatch(
    patchedMain,
    /TMR0_TimerInit\(\(FREQ_SYS \/ 2000\) \/ 2\)|state > \(badge_cfg\.led_brightness&3\)/,
  );
  for (const event of [
    "ANI_NEXT_STEP",
    "ANI_MARQUE",
    "ANI_FLASH",
    "BLE_NEXT_STEP",
  ]) {
    assert.match(
      patchedMain,
      new RegExp(
        `events & ${event}[\\s\\S]*frogalert_survey_display_active\\(\\)[\\s\\S]*events \\^ ${event}`,
      ),
    );
  }
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
    /frogalert_survey_on_disconnect\(void\)[\s\S]*streaming_enabled = 0;[\s\S]*mode != NORMAL[\s\S]*start_ble_animation\(\);[\s\S]*frogalert_display_app_attention_end\(\)/,
  );
  assert.match(
    patchedMain,
    /btn_onOnePress\(KEY2, frogalert_key2_transition\)/,
  );
  assert.doesNotMatch(patchedMain, /!btn_key1_profile_detected\(\)/);
  assert.match(
    patchedMain,
    /frogalert_survey_suspend\(TRUE\)[\s\S]*ble_enable_advertise\(\)/,
  );
  assert.match(patchedMain, /mode = NORMAL;[\s\S]*mode_setup_normal\(\)/);
  assert.match(patchedMain, /stop_all_animation\(\);/);
  assert.match(
    patchedMain,
    /Preserve upstream download mode[\s\S]*btn_onOnePress\(KEY2, NULL\);/,
  );
  assert.match(
    patchedMain,
    /btn_onOnePress\(KEY1, change_mode\);[\s\S]*btn_onOnePress\(KEY2, frogalert_key2_transition\);[\s\S]*btn_onLongPress\(KEY1, change_brightness\);/,
  );
  assert.match(patchedMain, /frogalert_survey_text/);
  assert.match(
    patchedMain,
    /volatile uint16_t frogalert_survey_overlay_fb\[2\]\[LED_COLS\]/,
  );
  assert.match(
    patchedMain,
    /frogalert_survey_overlay_index \^ 1U[\s\S]*frogalert_survey_overlay_index = target_index;[\s\S]*frogalert_survey_display_owned = TRUE;/,
  );
  assert.match(
    patchedMain,
    /if \(frogalert_survey_display_owned\)[\s\S]*frogalert_survey_overlay_fb[\s\S]*else[\s\S]*led_write2dcol\(i >> 2, fb\[column\]/,
  );
  assert.match(patchedMain, /FROGALERT_SURVEY_PAGE_CHARS\s+8/);
  assert.match(patchedMain, /FROGALERT_SURVEY_PAGE_MAX\s+2/);
  assert.match(patchedMain, /FROGALERT_SURVEY_TEXT_MAX\s+16/);
  assert.match(patchedMain, /frogalert_display_survey_message/);
  assert.match(patchedMain, /FROGALERT_SURVEY_BT_LOGO_WIDTH\s+6/);
  assert.match(
    patchedMain,
    /0x088, 0x050, 0x7ff, 0x222, 0x154, 0x088/,
  );
  assert.match(
    patchedMain,
    /bluetooth_logo\[column\]/,
  );
  assert.match(
    patchedMain,
    /result_length = saturated \? 3 : 2/,
  );
  assert.match(
    patchedMain,
    /result_length \* FROGALERT_SURVEY_GLYPH_STRIDE/,
  );
  assert.match(
    patchedMain,
    /frogalert_display_survey_count\(uint8_t count, uint8_t saturated\)/,
  );
  assert.doesNotMatch(patchedMain, /FROGALERT_SURVEY_PHASE_GAP|phase_start/);
  assert.match(
    patchedMain,
    /frogalert_display_survey_text\(message, message_length, TRUE\)/,
  );
  assert.match(
    patchedMain,
    /stride = text_length == FROGALERT_SURVEY_PAGE_CHARS \? 5 : 6;/,
  );
  assert.match(patchedMain, /return frogalert_survey_page_count;/);
  assert.match(
    patchedMain,
    /start = \(uint8_t\)\(\(LED_COLS - width\) \/ 2\);/,
  );
  assert.match(patchedMain, /\[column \+ 1\] << 2/);
  assert.doesNotMatch(
    patchedMain,
    /frogalert_survey_text\[[\s\S]{0,100}\]\s*\[column\] << 2/,
  );
  assert.match(
    patchedMain,
    /!frogalert_survey_display_owned \|\|\s*frogalert_survey_page_count <= 1/,
  );
  assert.doesNotMatch(patchedMain, /frogalert_survey_offset/);
  assert.doesNotMatch(patchedMain, /frogalert_survey_bitmap/);
  assert.doesNotMatch(
    patchedMain,
    /char text\[FROGALERT_SURVEY_COUNT_LENGTH\]/,
  );
  assert.doesNotMatch(patchedMain, /font5x7\[phase - ' '\]/);
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
    /void frogalert_display_survey_page_step\(void\)[\s\S]*?\n\tstop_all_animation\(\);/,
  );
  assert.match(
    patchedMain,
    /frogalert_survey_page_count <= 1[\s\S]*frogalert_survey_page \+ 1/,
  );
  assert.match(
    patchedMain,
    /frogalert_survey_page \+ 1 >= frogalert_survey_page_count[\s\S]*frogalert_survey_page\+\+;/,
  );
  assert.doesNotMatch(
    patchedMain,
    /frogalert_survey_page =[\s\S]{0,120}%[\s\S]{0,120}frogalert_survey_page_count/,
  );
  assert.match(
    patchedMain,
    /void frogalert_display_survey_page_redraw\(void\)/,
  );
  assert.match(patchedMain, /frogalert_display_survey_render_page\(\);/);
  assert.match(patchedMain, /void frogalert_display_frog_dance/);
  assert.match(patchedMain, /static const uint16_t frogs\[2\]\[9\]/);
  assert.match(patchedMain, /static const uint8_t starts\[3\]/);
  assert.match(
    patchedMain,
    /static const char fallback\[\] = "503\.PARTY"/,
  );
  assert.match(
    patchedMain,
    /frogalert_bmlist_blank\(\)[\s\S]*realloc\(bm->buf, width \* sizeof\(\*buffer\)\)[\s\S]*font5x7\[fallback\[character\] - ' '\][\s\S]*\[column \+ 1U\] << 2/,
  );
  assert.equal(
    patchedMain.match(/frogalert_apply_blank_nametag_fallback\(\);/g)?.length,
    2,
  );
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

  assert.match(
    survey,
    /FROGALERT:SURVEY-CONFIG-V1:FOSSASIA-9ce885d:/,
  );
  assert.match(
    survey,
    /FROGALERT_HARDWARE_PROFILE_NAME ":UNVERIFIED"/,
  );
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
    /SURVEY_NEXT_DELAY\s+TMOS_TICKS_FROM_MS\(\s*\\\s*\n\s*SURVEY_CYCLE_TIME_MS - SURVEY_SCAN_TIME_MS - SURVEY_RADIO_QUIET_MS\)/,
  );
  assert.match(
    survey,
    /SURVEY_SCAN_TICKS\s+TMOS_TICKS_FROM_MS\(SURVEY_SCAN_TIME_MS\)/,
  );
  assert.match(survey, /SURVEY_FRAME_TIME\s+TMOS_TICKS_FROM_MS\(1000U\)/);
  assert.doesNotMatch(survey, /SURVEY_SCROLL_TIME|SURVEY_DISPLAY_STEP_EVENT/);
  assert.match(survey, /SURVEY_WATCHDOG_TIME\s+TMOS_TICKS_FROM_MS\(5000U\)/);
  assert.doesNotMatch(survey, /SURVEY_ALERT_TIME|SURVEY_FROG_TIME/);
  assert.match(survey, /save_survey_view\(0, FALSE\)/);
  assert.doesNotMatch(
    survey,
    /tmos_start_reload_task\(survey_task_id,[\s\S]*SURVEY_DISPLAY_PAGE_EVENT/,
  );
  assert.match(
    survey,
    /alert_frame_count = render_alert\(alert\)[\s\S]*alert_frame_count > 1[\s\S]*SURVEY_DISPLAY_PAGE_EVENT[\s\S]*SURVEY_FRAME_TIME/,
  );
  assert.match(
    survey,
    /\(uint32_t\)SURVEY_FRAME_TIME \* alert_frame_count/,
  );
  assert.match(
    survey,
    /alert_frame_index \+ 1 < alert_frame_count[\s\S]*alert_frame_index\+\+;[\s\S]*frogalert_display_survey_page_step\(\)/,
  );
  assert.match(
    survey,
    /if \(alert_visible\)[\s\S]*frogalert_display_frog_dance\(alert_frame_index\)[\s\S]*frogalert_display_survey_page_redraw\(\)/,
  );
  assert.equal(
    survey.match(/render_alert\(alert\)/g)?.length,
    1,
    "view redraws must preserve the current alert frame",
  );
  assert.match(survey, /frogalert_display_survey_page_step\(\)/);
  assert.ok(
    survey.indexOf("save_survey_view(0, FALSE)") <
      survey.indexOf("status = GAPRole_CentralStartDevice"),
    "the initial zero must render before central-role startup",
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
  assert.match(survey, /"KARR DETECTED"/);
  assert.match(survey, /FROGALERT_ALERT_FROG_DANCE/);
  assert.match(survey, /frogalert_display_frog_dance/);
  assert.match(
    survey,
    /case FROGALERT_ALERT_FROG_DANCE:[\s\S]*incoming_priority = 4;[\s\S]*case FROGALERT_ALERT_KARR:[\s\S]*incoming_priority = 3;[\s\S]*case FROGALERT_ALERT_COP:[\s\S]*incoming_priority = 2;[\s\S]*case FROGALERT_ALERT_FLIPPER:[\s\S]*incoming_priority = 1;/,
  );
  assert.match(
    survey,
    /incoming_priority <= current_priority/,
  );
  assert.match(
    survey,
    /case FROGALERT_ALERT_FROG_DANCE:[\s\S]*frogalert_display_frog_dance\(alert_frame_index\);[\s\S]*return 3;/,
  );
  assert.match(
    core,
    /FROGALERT_TARGET_BADGEMAGIC[\s\S]*FROGALERT_ALERT_FROG_DANCE[\s\S]*FROGALERT_TARGET_KARR[\s\S]*FROGALERT_ALERT_KARR[\s\S]*FROGALERT_TARGET_POLICE[\s\S]*FROGALERT_ALERT_COP[\s\S]*FROGALERT_TARGET_FLIPPER[\s\S]*FROGALERT_ALERT_FLIPPER/,
  );
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
  assert.match(survey, /SURVEY_APP_WINDOW_END_EVENT/);
  assert.match(survey, /SURVEY_APP_WINDOW_TIME/);
  assert.match(
    survey,
    /app_window_active = 0;[\s\S]*advertise_when_idle = 0;[\s\S]*restore_advertising = 0;[\s\S]*frogalert_badgemagic_persistent_advertising\(\)[\s\S]*ble_disable_advertise\(\)/,
  );
  assert.match(
    survey,
    /frogalert_survey_open_app_window\(void\)[\s\S]*app_window_active = 1;[\s\S]*frogalert_survey_suspend\(TRUE\)[\s\S]*SURVEY_APP_WINDOW_END_EVENT/,
  );
  assert.match(
    survey,
    /frogalert_survey_open_app_window\(void\)[\s\S]*frogalert_display_app_attention_start\(\)/,
  );
  assert.match(survey, /SURVEY_APP_CUE_TIME\s+TMOS_TICKS_FROM_MS\(1000U\)/);
  assert.match(
    survey,
    /frogalert_survey_open_app_window\(void\)[\s\S]*app_cue_active = 1;[\s\S]*SURVEY_APP_CUE_END_EVENT[\s\S]*SURVEY_APP_CUE_TIME/,
  );
  const appWindowEnd = survey.slice(
    survey.indexOf("if (events & SURVEY_APP_WINDOW_END_EVENT)"),
    survey.indexOf("if (events & SURVEY_APP_CUE_END_EVENT)"),
  );
  const appCueEnd = survey.slice(
    survey.indexOf("if (events & SURVEY_APP_CUE_END_EVENT)"),
    survey.indexOf("if (events & SURVEY_DISPLAY_PAGE_EVENT)"),
  );
  assert.match(appWindowEnd, /if \(!peripheral_is_connected\(\)\)/);
  assert.match(
    appWindowEnd,
    /\}\s*if \(app_cue_active\)\s*frogalert_display_app_attention_end\(\);\s*app_cue_active = 0;/,
    "the display cue must end even when the radio remains connected",
  );
  assert.doesNotMatch(
    appCueEnd,
    /peripheral_is_connected/,
    "connection state must not consume the one-shot display-cue timeout",
  );
  assert.match(
    appCueEnd,
    /if \(app_cue_active\)[\s\S]*app_cue_active = 0;[\s\S]*frogalert_display_app_attention_end\(\)/,
  );
  assert.doesNotMatch(survey, /SURVEY_PHASE_|show_survey\(/);
  const observeAdvertisement = survey.match(
    /static void observe_advertisement\([\s\S]*?\n\}/,
  )?.[0];
  assert.ok(observeAdvertisement);
  assert.match(observeAdvertisement, /frogalert_survey_counter_observe/);
  assert.doesNotMatch(
    observeAdvertisement,
    /save_survey_view|frogalert_display_survey_count/,
  );
  assert.match(
    survey,
    /PRINT\("FrogAlert passive survey count:[\s\S]*commit_survey_view\(count, saturated\)[\s\S]*SURVEY_NEXT_DELAY/,
  );
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
  assert.match(core, /void frogalert_survey_classify/);
  assert.match(core, /address\[5\] == prefix\[0\]/);
  assert.doesNotMatch(core, /address\[0\] == prefix\[0\]/);
  assert.match(core, /"axon body"/);
  assert.match(core, /"taser"/);
  assert.match(core, /"flipper"/);
  assert.match(core, /FLIPPER_SERVICE_BLACK\s+0x3081/);
  assert.match(core, /FLIPPER_SERVICE_WHITE\s+0x3082/);
  assert.match(core, /FLIPPER_SERVICE_TRANSPARENT\s+0x3083/);
  assert.match(core, /"qt "/);
  assert.match(core, /ascii_starts_with_value/);
  assert.match(core, /"led badge magic"/);
  assert.match(core, /ascii_equal_padded/);
  assert.match(core, /advertisement_has_service\(advertisement, 0xfee0\)/);
  assert.match(core, /GAP_ADTYPE_MANUFACTURER_SPECIFIC\s+0xff/);
  assert.match(core, /static uint8_t advertisement_has_company/);
  assert.match(
    core,
    /advertisement_has_company\(advertisement, 0x01ab\)\s*&&\s*advertisement_has_service\(advertisement, 0xfd5f\)/,
  );
  assert.match(core, /config->custom_rule_count/);
  assert.match(core, /FROGALERT_MATCH_PUBLIC_OUI/);
  assert.match(core, /FROGALERT_MATCH_SERVICE16/);
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
  assert.match(build, /baseline\|canary\|survey\|frogs/);
  assert.match(build, /frogalert-animation-compat\.c/);
  assert.match(build, /frogalert-animation-compat\.h/);
  assert.match(build, /apply-fossasia-survey\.mjs/);
  assert.doesNotMatch(build, /\bwchisp\b/);
  assert.match(build, /audit-fossasia-usbc\.mjs" ram/);
  assert.match(build, /cleanup_failed_audit/);
});

test("dancing-frog lane replaces only the visible counter view", async () => {
  const [survey, frogsOverlay, build] = await Promise.all([
    readFile(path.join(firmwareDirectory, "frogalert-survey.c"), "utf8"),
    readFile(path.join(firmwareDirectory, "frogalert-frogs.mk"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts/build-fossasia-usbc"), "utf8"),
  ]);

  assert.match(frogsOverlay, /FROGALERT_DANCING_FROG_MODE=1/);
  assert.match(frogsOverlay, /frogalert_dancing_frog_identity/);
  assert.match(survey, /SURVEY_FROG_VIEW_FRAME_TIME\s+TMOS_TICKS_FROM_MS\(500U\)/);
  assert.match(
    survey,
    /frogalert_survey_counter_mode\(\)[\s\S]*FROGALERT_DANCING_FROG_MODE[\s\S]*frogalert_display_frog_dance\(frog_view_frame\)/,
  );
  assert.match(
    survey,
    /SURVEY_FROG_VIEW_FRAME_EVENT[\s\S]*frog_view_frame \^= 1U/,
  );
  assert.match(survey, /SURVEY_APP_CUE_TIME\s+TMOS_TICKS_FROM_MS\(1000U\)/);
  assert.match(
    survey,
    /SURVEY_APP_CUE_END_EVENT[\s\S]*frogalert_display_app_attention_end\(\)/,
  );
  assert.match(
    survey,
    /SURVEY_APP_WINDOW_TIME\s+TMOS_TICKS_FROM_MS\(10000U\)/,
  );
  assert.match(build, /image_variant="-frogs"/);
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

test("display refresh fix is pinned to bkero's reviewed source", async () => {
  const lock = await loadLock();
  assert.deepEqual(lock.display_refresh_reference, {
    repository: "https://github.com/bkero/badgemagic-firmware",
    branch: "b1144c-support",
    commit: "074c448066573be2990fe83fd718a22c01b7c283",
    source: "src/main.c",
    timer_tick_hz: 16000,
    column_pairs: 22,
    pwm_ticks_per_pair: 4,
    calculated_frame_hz: 181.8181818181818,
  });
});

test("Flipper passive service evidence is pinned to official firmware and BLESPloit", async () => {
  const lock = await loadLock();
  assert.deepEqual(lock.flipper_reference, {
    repository: "https://github.com/flipperdevices/flipperzero-firmware",
    commit: "11c1012eaa6ad5c3c41048184871b24bd01b3493",
    hardware_color_source: "targets/furi_hal_include/furi_hal_version.h",
    advertising_source: "targets/f7/ble_glue/gap.c",
    profile_source: "targets/f7/ble_glue/profiles/serial_profile.c",
    service_uuid_16_by_hardware_color: {
      black: "3081",
      white: "3082",
      transparent: "3083",
    },
  });
  assert.deepEqual(lock.blesploit_reference, {
    repository: "https://github.com/BLESPloit/device-library",
    commit: "6d940b5325924bd818f8ecccf8a25fcf87c58908",
    manifest: "vendors/flipper_zero/manifest.json",
    observer_source: "vendors/flipper_zero/observer/adv_decode.lua",
    service_uuid_16: ["3081", "3082", "3083"],
  });
});
