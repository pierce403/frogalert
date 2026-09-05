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
  applyLegacyProfileHooks,
  applyLegacyTransferHeaderHooks,
  applyLegacyTransferHooks,
  applyMainHooks,
  applyPeripheralHooks,
  applyPowerHooks,
  applyPowerHeaderHooks,
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
    "}",
    "",
    "static void check(int k)",
    "{",
    "\tstatic int hold[KEY_INDEX], is_longpress[KEY_INDEX];",
    "\tif (debounce(k, isPressed(k))) {",
    "\t\thold[k]++;",
    "\t\tif (hold[k] >= LONGPRESS_THRES && is_longpress[k] == 0) {",
    "\t\t\tis_longpress[k] = 1;",
    "\t\t\tlongPressPending[k] = true;",
    "\t\t\tif (button_task_id != INVALID_TASK_ID) {",
    "\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);",
    "\t\t\t}",
    "\t\t}",
    "\t} else {",
    "\t\tif (hold[k] > 0 && hold[k] < LONGPRESS_THRES) {",
    "\t\t\tonePressPending[k] = true;",
    "\t\t\tif (button_task_id != INVALID_TASK_ID) {",
    "\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);",
    "\t\t\t}",
    "\t\t}",
    "\t}",
    "}",
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
  const legacyWake = [
    "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
    "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);",
  ].join("\n");
  const legacyPower = [
    "void poweroff()",
    "{",
    "\t// Stop wasting energy",
    "\tGPIOA_ModeCfg(GPIO_Pin_All, GPIO_ModeIN_Floating);",
    "\tGPIOB_ModeCfg(GPIO_Pin_All, GPIO_ModeIN_Floating);",
    "",
    "\t// Configure wake-up",
    legacyWake,
    "\tGPIOA_ModeCfg(CHARGE_STT_PIN, GPIO_ModeIN_PU);",
    "\tGPIOA_ITModeCfg(CHARGE_STT_PIN, GPIO_ITMode_FallEdge);",
    "\tPFIC_EnableIRQ(GPIO_A_IRQn);",
    "\tPWR_PeriphWakeUpCfg(ENABLE, RB_SLP_GPIO_WAKE, Long_Delay);",
    "",
    "\t/* Good bye */",
    "\tLowPower_Shutdown(0);",
    "}",
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
  assert.match(patchedButton, /GPIOPinRemap\(ENABLE, RB_PIN_INTX\);[\s\S]*GPIOB_ITModeCfg\(KEY2_PIN/);
  assert.doesNotMatch(patchedButton, /btn_key1_profile_detected/);
  assert.doesNotMatch(patchedButton, /btn_key1_profile\(void\)/);
  assert.match(
    patchedButton,
    /int btn_brightness_key\(void\)[\s\S]*FROGALERT_PROFILE_B1144C_250901_USB_C[\s\S]*return KEY2;[\s\S]*return KEY1;/,
  );
  assert.match(
    patchedButton,
    /#define FROGALERT_BRIGHTNESS_RELEASE_MAX \(BUTTON_SCAN_FREQ \* 2\)/,
  );
  assert.match(
    patchedButton,
    /if \(k == KEY2\)[\s\S]*return;[\s\S]*k == KEY2 && hold\[k\] >= LONGPRESS_THRES &&[\s\S]*hold\[k\] < FROGALERT_BRIGHTNESS_RELEASE_MAX/,
  );
  assert.doesNotMatch(patchedButton, /LONGPRESS_THRES \* 5|125/);
  assert.equal(
    patchedButton.match(/GPIOB_ModeCfg\(KEY2_PIN, GPIO_ModeIN_PU\)/g)?.length,
    2,
  );
  for (const header of [activeHighHeader, activeLowHeader]) {
    const patchedHeader = applyButtonHeaderHooks(header);
    assert.match(
      patchedHeader,
      /#include "ble\/frogalert-monitor-config\.h"/,
    );
    assert.match(
      patchedHeader,
      /#ifndef FROGALERT_HARDWARE_PROFILE_ID[\s\S]*#error "FROGALERT_HARDWARE_PROFILE_ID must identify the compiled button profile"/,
    );
    assert.match(
      patchedHeader,
      /FROGALERT_HARDWARE_PROFILE_ID != FROGALERT_PROFILE_B1144C_250901_USB_C[\s\S]*FROGALERT_HARDWARE_PROFILE_ID != FROGALERT_PROFILE_B1144C_260404_USB_C[\s\S]*#error "unsupported FrogAlert button hardware profile"/,
    );
    assert.match(patchedHeader, /btn_key1_pressed\(\)/);
    assert.match(patchedHeader, /btn_brightness_key\(void\)/);
    assert.match(patchedHeader, /!GPIOB_ReadPortPin\(KEY2_PIN\)/);
  }
  for (const power of [legacyPower, currentPower]) {
    const patchedPower = applyPowerHooks(power);
    assert.match(patchedPower, /btn_configure_screen_off_wake\(\)/);
    assert.match(
      patchedPower,
      /#ifndef FROGALERT_SURVEY[\s\S]*GPIOA_ITModeCfg\(CHARGE_STT_PIN, GPIO_ITMode_FallEdge\)[\s\S]*#endif/,
    );
    assert.match(
      patchedPower,
      /R16_PA_INT_EN = 0;[\s\S]*R16_PB_INT_EN = 0;[\s\S]*PWR_PeriphWakeUpCfg\(DISABLE[\s\S]*btn_configure_screen_off_wake\(\)[\s\S]*GPIOA_ClearITFlagBit\(0xffffU\)[\s\S]*GPIOB_ClearITFlagBit\(0xffffU\)[\s\S]*SYS_ResetKeepBuf\(FROGALERT_SCREEN_OFF_MAGIC\)[\s\S]*PFIC_EnableIRQ\(GPIO_B_IRQn\)[\s\S]*LowPower_Shutdown\(0\)/,
    );
    assert.match(
      patchedPower,
      /frogalert_consume_screen_off_wake\(void\)[\s\S]*SYS_GetLastResetSta\(\)[\s\S]*R8_GLOB_RESET_KEEP[\s\S]*reset_status != RST_STATUS_RPOR[\s\S]*SYS_ResetKeepBuf\(0\)/,
    );
    assert.match(
      patchedPower,
      /GPIOA_IRQHandler\(void\)[\s\S]*frogalert_shutdown_arming[\s\S]*SYS_ResetExecute\(\)/,
    );
    assert.match(
      patchedPower,
      /GPIOB_IRQHandler\(void\)[\s\S]*frogalert_shutdown_arming[\s\S]*SYS_ResetExecute\(\)/,
    );
    assert.doesNotMatch(patchedPower, /LowPower_Sleep\(/);
  }
  const patchedPowerHeader = applyPowerHeaderHooks("void poweroff();");
  assert.match(
    patchedPowerHeader,
    /int frogalert_consume_screen_off_wake\(void\);/,
  );
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

test("legacy BadgeMagic writes are bounded, padded, and reset on disconnect", () => {
  const legacy = [
    '#include "data.h"',
    "int legacy_ble_rx(uint8_t *val, uint16_t len)",
    "{",
    "\tstatic uint16_t c, data_len, n;",
    "\tstatic uint8_t *data;",
    "\tmemcpy(data + c * len, val, len);",
    "\tdata = realloc(data, data_len);",
    "\tdata_flatSave(data, data_len);",
    "\treturn 0;",
    "}",
    "",
    "int legacy_usb_rx(uint8_t *buf, uint16_t len)",
    "{",
    "\treturn 0;",
    "}",
  ].join("\n");
  const header = "int legacy_ble_rx(uint8_t *val, uint16_t len);";
  const profile = [
    "\tuint16_t uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);",
    "\tif(uuid == RxCharUUID) {",
    "\t\tif (legacy_ble_rx(pValue, len)) {",
  ].join("\n");

  const patchedLegacy = applyLegacyTransferHooks(legacy);
  const patchedHeader = applyLegacyTransferHeaderHooks(header);
  const patchedProfile = applyLegacyProfileHooks(profile);
  assert.match(
    patchedLegacy,
    /FROGALERT_LEGACY_MAX_DATA[\s\S]*EEPROM_MAX_SIZE - sizeof\(badge_cfg_t\)/,
  );
  assert.match(patchedLegacy, /frogalert_transfer_accept[\s\S]*realloc\(frogalert_legacy_data, write.capacity\)/);
  assert.match(patchedLegacy, /frogalert_transfer_reset\(\)/);
  assert.match(
    patchedLegacy,
    /status = data_flatSave[\s\S]*legacy_ble_reset\(\);[\s\S]*if \(status\)/,
  );
  assert.doesNotMatch(patchedLegacy, /PRINT\("%02X "/);
  assert.match(patchedHeader, /void legacy_ble_reset\(void\);/);
  assert.match(
    patchedProfile,
    /if \(offset != 0\)[\s\S]*ATT_ERR_INVALID_OFFSET/,
  );
});

test("survey hooks preserve the FOSSASIA shell and fail closed on drift", () => {
  const peripheral = [
    '#include "setup.h"',
    '#include "../config.h"',
    "#define CONN_TIMEOUT        100 // Supervision timeout (units of 10ms)",
    "static void gap_init()",
    "{",
    "\tGAPRole_PeripheralInit();",
    "",
    "\tuint16_t min_interval = 6;",
    "static void link_onEstablished(gapRoleEvent_t *pe)",
    "{",
    "\tif(conn_list.connHandle != GAP_CONNHANDLE_INIT) {",
    "\t\tGAPRole_TerminateLink(e->connectionHandle);",
    "\t\tGAPRole_PeripheralConnParamUpdateReq(e->connectionHandle,",
    "\t\t\t\t\tMIN_CONN_INTERVAL,",
    "\t\t\t\t\tMAX_CONN_INTERVAL,",
    "\t\t\t\t\tSLAVE_LATENCY,",
    "\t\t\t\t\tCONN_TIMEOUT,",
    "\t\t\t\t\ttaskid);",
    "\t\treturn;",
    "\t}",
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
    "#define BLE_NEXT_STEP       (1 << 4)",
    "",
    "static tmosTaskID common_taskid = INVALID_TASK_ID ;",
    "static void mode_setup_download();",
    "static void mode_setup_normal();",
    "\tif(events & SYS_EVENT_MSG) {",
    "\t\tuint8 *pMsg = tmos_msg_receive(common_taskid);",
    "\t\tif(pMsg != NULL)",
    "\t\t{",
    "\t\t\ttmos_msg_deallocate(pMsg);",
    "\t\t}",
    "\t\treturn (events ^ SYS_EVENT_MSG);",
    "\t}",
    "\tif(events & ANI_NEXT_STEP) {",
    "",
    "\t\tstatic int (*animations[])(bm_t *bm, uint16_t *fb) = {",
    "\tif (events & ANI_MARQUE) {",
    "\t\tbm_t *bm = bmlist_current();",
    "\tif (events & ANI_FLASH) {",
    "\t\tbm_t *bm = bmlist_current();",
    "\tif (events & BLE_NEXT_STEP) {",
    "\t\tani_xbm_next_frame(&bluetooth, fb, 10, 0);",
    "\tif (events & SCAN_BOOTLD_BTN) {",
    "\t\tstatic uint32_t hold;",
    "\t\thold = isPressed(KEY2) ? hold + 1 : 0;",
    "\t\tif (hold > 10) {",
    "\t\t\treset_jump();",
    "\t\t}",
    "\tif (modes[mode])",
    "\t\tmodes[mode]();",
    "}",
    "",
    "__HIGH_CODE",
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
    "static void stop_all_animation()",
    "{",
    "\ttmos_stop_task(common_taskid, ANI_NEXT_STEP);",
    "\ttmos_stop_task(common_taskid, ANI_MARQUE);",
    "\ttmos_stop_task(common_taskid, ANI_FLASH);",
    "\ttmos_stop_task(common_taskid, BLE_NEXT_STEP);",
    "\tmemset(fb, 0, sizeof(fb));",
    "}",
    "",
    "int streaming_enabled;",
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
    "\t// If always-on BLE is enabled, then skip this mode, jump to next mode",
    "\tif (badge_cfg.ble_always_on) {",
    "\t\tchange_mode();",
    "\t}",
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
    "int main()",
    "{",
    "\tSetSysClock(CLK_SOURCE_PLL_60MHz);",
    "\tdebug_init();",
    "\tbtn_onOnePress(KEY1, change_mode);",
    "\tbtn_onOnePress(KEY2, bm_transition);",
    "\tbtn_onLongPress(KEY1, change_brightness);",
    "\tpower_init();",
    "\tdisp_charging();",
    "\tcfg_init();",
    "\tplay_splash(&spl, 0, 0, badge_cfg.splash_speedT);",
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
    /enable_advertising\(FALSE\);[\s\S]*GAPRole_PeripheralConnParamUpdateReq[\s\S]*CONN_TIMEOUT[\s\S]*frogalert_survey_suspend\(FALSE\)/,
  );
  assert.match(patchedPeripheral, /#define CONN_TIMEOUT\s+600/);
  assert.doesNotMatch(
    patchedPeripheral.match(
      /if\(conn_list\.connHandle != GAP_CONNHANDLE_INIT\)[\s\S]*?\n\t\}/,
    )?.[0] ?? "",
    /PeripheralConnParamUpdateReq/,
  );
  assert.match(
    patchedPeripheral,
    /conn_list\.connHandle = GAP_CONNHANDLE_INIT;[\s\S]*legacy_ble_reset\(\);[\s\S]*frogalert_survey_on_disconnect\(\);[\s\S]*frogalert_survey_should_advertise\(\)[\s\S]*frogalert_survey_suspend\(advertise_after\)[\s\S]*enable_advertising\(TRUE\)/,
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
  const key1Transition = patchedMain.match(
    /static void frogalert_key1_transition\(void\)\n\{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(key1Transition);
  assert.match(
    key1Transition,
    /FROGALERT_PROFILE_B1144C_250901_USB_C[\s\S]*frogalert_change_mode\(\);[\s\S]*#else[\s\S]*mode == NORMAL[\s\S]*frogalert_view_transition\(\)/,
  );
  const key2Transition = patchedMain.match(
    /static void frogalert_key2_transition\(void\)\n\{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(key2Transition);
  assert.match(
    key2Transition,
    /FROGALERT_PROFILE_B1144C_250901_USB_C[\s\S]*mode == NORMAL[\s\S]*frogalert_view_transition\(\)[\s\S]*#else[\s\S]*frogalert_change_mode\(\)/,
  );
  assert.doesNotMatch(
    `${key1Transition}\n${key2Transition}`,
    /frogalert_survey_open_app_window|ble_enable_advertise|start_ble_animation/,
  );
  assert.doesNotMatch(
    patchedMain,
    /frogalert_open_app_window|frogalert_display_app_attention/,
  );
  assert.match(
    patchedMain,
    /frogalert_badgemagic_persistent_advertising\(void\)[\s\S]*mode != POWER_OFF[\s\S]*badge_cfg\.ble_always_on \|\| mode == DOWNLOAD/,
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
    /frogalert_survey_on_disconnect\(void\)[\s\S]*streaming_enabled = 0;[\s\S]*mode != NORMAL[\s\S]*start_ble_animation\(\);[\s\S]*mode == NORMAL[\s\S]*start_normal_animation\(\);[\s\S]*frogalert_survey_view_changed\(\)/,
  );
  assert.match(
    patchedMain,
    /btn_onOnePress\(KEY1, frogalert_key1_transition\);[\s\S]*btn_onOnePress\(KEY2, frogalert_key2_transition\)/,
  );
  assert.doesNotMatch(patchedMain, /!btn_key1_profile_detected\(\)/);
  assert.match(
    patchedMain,
    /frogalert_survey_suspend\(TRUE\)[\s\S]*ble_enable_advertise\(\)/,
  );
  assert.match(patchedMain, /mode = NORMAL;[\s\S]*mode_setup_normal\(\)/);
  assert.match(patchedMain, /stop_all_animation\(\);/);
  assert.doesNotMatch(patchedMain, /btn_onOnePress\(KEY2, NULL\)/);
  assert.match(
    patchedMain,
    /btn_onOnePress\(KEY1, frogalert_key1_transition\);[\s\S]*btn_onOnePress\(KEY2, frogalert_key2_transition\);[\s\S]*btn_onLongPress\(btn_brightness_key\(\), change_brightness\);/,
  );
  assert.match(
    patchedMain,
    /frogalert_change_mode\(\)[\s\S]*mode == NORMAL[\s\S]*mode = DOWNLOAD;[\s\S]*mode_setup_download\(\);[\s\S]*mode == DOWNLOAD[\s\S]*mode = POWER_OFF;[\s\S]*mode_setup_screen_off\(\);[\s\S]*mode = NORMAL;[\s\S]*mode_setup_normal\(\);/,
  );
  const frogModeTransition = patchedMain.match(
    /static void frogalert_change_mode\(\)\n\{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(frogModeTransition);
  assert.doesNotMatch(
    frogModeTransition,
    /(?:^|\s)change_mode\(\);|poweroff\(/,
  );
  const screenOffSetup = patchedMain.match(
    /static void mode_setup_screen_off\(void\)\n\{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(screenOffSetup);
  assert.match(
    screenOffSetup,
    /frogalert_shutdown_pending = TRUE;[\s\S]*ble_disable_advertise\(\);[\s\S]*stop_all_animation\(\);[\s\S]*TMR0_ITCfg\(DISABLE[\s\S]*PFIC_DisableIRQ\(TMR0_IRQn\);[\s\S]*TMR0_Disable\(\);[\s\S]*leds_releaseall\(\);[\s\S]*frogalert_survey_prepare_shutdown\(\)[\s\S]*frogalert_survey_radio_idle\(\)/,
  );
  assert.doesNotMatch(
    screenOffSetup,
    /\n\s*(?:poweroff|LowPower_Shutdown|TMR3_Disable)\(/,
  );
  assert.match(
    patchedMain,
    /frogalert_survey_radio_idle\(void\)[\s\S]*frogalert_shutdown_pending && mode == POWER_OFF[\s\S]*tmos_set_event\(common_taskid, FROGALERT_ENTER_SHUTDOWN\)/,
  );
  assert.match(
    patchedMain,
    /events & FROGALERT_ENTER_SHUTDOWN[\s\S]*frogalert_shutdown_pending && mode == POWER_OFF[\s\S]*TMR3_ITCfg\(DISABLE[\s\S]*PFIC_DisableIRQ\(TMR3_IRQn\)[\s\S]*TMR3_Disable\(\)[\s\S]*poweroff\(\)/,
  );
  assert.match(
    patchedMain,
    /static void mode_setup_normal\(\)[\s\S]*frogalert_shutdown_pending = FALSE[\s\S]*tmos_stop_task\(common_taskid, FROGALERT_ENTER_SHUTDOWN\)[\s\S]*frogalert_survey_cancel_shutdown\(\)[\s\S]*TMR0_ClearITFlag[\s\S]*TMR0_Enable\(\);[\s\S]*TMR0_ITCfg\(ENABLE[\s\S]*PFIC_EnableIRQ\(TMR0_IRQn\);/,
  );
  assert.match(
    patchedMain,
    /frogalert_handle_screen_off_wake\(void\)[\s\S]*frogalert_consume_screen_off_wake\(\)[\s\S]*GPIOB_ModeCfg\(KEY2_PIN, GPIO_ModeIN_PU\)[\s\S]*frogalert_wake_init[\s\S]*DelayMs\(20\)[\s\S]*frogalert_wake_sample[\s\S]*FA_WAKE_SLEEP[\s\S]*poweroff\(\)[\s\S]*FA_WAKE_ISP[\s\S]*reset_jump\(\)/,
  );
  assert.match(
    patchedMain,
    /mode_setup_normal\(\)[\s\S]*badge_cfg\.ble_always_on[\s\S]*frogalert_survey_suspend\(TRUE\)[\s\S]*ble_enable_advertise\(\)/,
  );
  assert.match(
    patchedMain,
    /events & SCAN_BOOTLD_BTN[\s\S]*hold = isPressed\(KEY2\) \? hold \+ 1 : 0;[\s\S]*hold > 10[\s\S]*reset_jump\(\);/,
  );
  assert.match(
    patchedMain,
    /badge_cfg\.ble_always_on[\s\S]*frogalert_change_mode\(\);[\s\S]*return;/,
  );
  assert.match(patchedMain, /frogalert_display_present/);
  assert.match(
    patchedMain,
    /volatile uint16_t frogalert_survey_overlay_fb\[2\]\[LED_COLS\]/,
  );
  assert.match(
    patchedMain,
    /frogalert_survey_overlay_index \^ 1U[\s\S]*frogalert_survey_overlay_index = next;[\s\S]*frogalert_survey_display_owned = TRUE;/,
  );
  assert.match(
    patchedMain,
    /if \(frogalert_survey_display_owned\)[\s\S]*frogalert_survey_overlay_fb[\s\S]*else[\s\S]*led_write2dcol\(i >> 2, fb\[column\]/,
  );
  assert.match(patchedMain, /if \(!frogalert_survey_display_owned\)[\s\S]*stop_all_animation\(\)/);
  assert.match(patchedMain, /frogalert_display_survey_release[\s\S]*start_normal_animation\(\)/);
  assert.match(patchedMain, /stop_all_animation\(\);[\s\S]*frogalert_survey_suspend\(FALSE\);[\s\S]*frogalert_display_survey_relinquish\(\);[\s\S]*streaming_enabled = 1;/);
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

test("SDK adapter links the Rust application and retains passive discovery", async () => {
  const survey = await readFile(path.join(firmwareDirectory, "frogalert-survey.c"), "utf8");
  const make = await readFile(path.join(firmwareDirectory, "frogalert-survey.mk"), "utf8");
  assert.match(survey, /GAPRole_CentralStartDiscovery\(DEVDISC_MODE_ALL, FALSE, FALSE\)/);
  assert.match(survey, /GAPRole_CentralCancelDiscovery\(\)/);
  assert.match(survey, /frogalert_runtime_step\(TMOS_GetSystemClock\(\)/);
  assert.match(survey, /GAP_EXT_ADV_DEVICE_INFO_EVENT/);
  assert.match(survey, /GAP_DIRECT_DEVICE_INFO_EVENT/);
  assert.match(survey, /event->discCmpl.pDevList/);
  assert.match(survey, /status == bleIncorrectMode/);
  assert.match(survey, /frogalert_runtime_init\(TRUE\)/);
  assert.match(survey, /frogalert_runtime_init\(FALSE\)/);
  assert.doesNotMatch(survey, /GAPRole_CentralEstablishLink|malloc|calloc|realloc/);
  assert.match(make, /FROGALERT_RUST_LIB/);
  assert.doesNotMatch(make, /frogalert_survey_core\.c|frogalert_boot_status\.c/);
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
