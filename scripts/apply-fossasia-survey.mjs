#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function replaceOnce(source, before, after, label) {
  const pieces = source.split(before);
  assert.equal(
    pieces.length,
    2,
    `${label} must match exactly once in the pinned FOSSASIA source`,
  );
  return `${pieces[0]}${after}${pieces[1]}`;
}

function normalizeLineEndings(source) {
  return source.replaceAll("\r\n", "\n");
}

export function applyPeripheralHooks(source) {
  let result = normalizeLineEndings(source);
  result = replaceOnce(
    result,
    '#include "setup.h"\n#include "../config.h"\n',
    '#include "setup.h"\n#include "../config.h"\n#ifdef FROGALERT_SURVEY\n#include "frogalert-survey.h"\n#endif\n',
    "peripheral survey include",
  );
  result = replaceOnce(
    result,
    "\tGAPRole_PeripheralInit();\n\n\tuint16_t min_interval = 6;",
    "\tGAPRole_PeripheralInit();\n#ifdef FROGALERT_SURVEY\n\tfrogalert_survey_role_init();\n#endif\n\n\tuint16_t min_interval = 6;",
    "combined peripheral and central role initialization",
  );
  result = replaceOnce(
    result,
    `	conn_list.connTimeout = e->connTimeout;
	enable_advertising(FALSE);
}`,
    `	conn_list.connTimeout = e->connTimeout;
	enable_advertising(FALSE);
#ifdef FROGALERT_SURVEY
	(void)frogalert_survey_suspend(FALSE);
#endif
}`,
    "peripheral connection suspends central discovery",
  );
  result = replaceOnce(
    result,
    `static void link_onTerminated(gapRoleEvent_t *pe)
{
	gapTerminateLinkEvent_t *event = (gapTerminateLinkEvent_t *)pe;
	GAPRole_TerminateLink(pe->linkCmpl.connectionHandle);
	enable_advertising(TRUE);

	if(event->connectionHandle == conn_list.connHandle) {
		conn_list.connHandle = GAP_CONNHANDLE_INIT;
		conn_list.connInterval = 0;
		conn_list.connSlaveLatency = 0;
		conn_list.connTimeout = 0;
	} else {
		// Requested connection is not existed in connection list
	}
}`,
    `static void link_onTerminated(gapRoleEvent_t *pe)
{
	gapTerminateLinkEvent_t *event = (gapTerminateLinkEvent_t *)pe;
	GAPRole_TerminateLink(pe->linkCmpl.connectionHandle);

	if(event->connectionHandle == conn_list.connHandle) {
		conn_list.connHandle = GAP_CONNHANDLE_INIT;
		conn_list.connInterval = 0;
		conn_list.connSlaveLatency = 0;
		conn_list.connTimeout = 0;
#ifdef FROGALERT_SURVEY
		frogalert_survey_on_disconnect();
		uint8_t advertise_after =
			frogalert_survey_should_advertise();
		if (frogalert_survey_suspend(advertise_after) &&
		    advertise_after)
			enable_advertising(TRUE);
#else
		enable_advertising(TRUE);
#endif
	} else {
		// Requested connection is not existed in connection list
	}
}`,
    "peripheral disconnection waits for central discovery to become idle",
  );
  return result;
}

export function applyButtonHeaderHooks(source) {
  let result = normalizeLineEndings(source);
  const activeHigh = `#define isPressed(key) \t\t((key) ? \\
\t\t\t\t!GPIOB_ReadPortPin(KEY2_PIN) : \\
\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))
`;
  const activeLow = `#define isPressed(key) \t\t((key) ? \\
\t\t\t\t!GPIOB_ReadPortPin(KEY2_PIN) : \\
\t\t\t\t!GPIOA_ReadPortPin(KEY1_PIN))
`;
  const originalPressed = result.includes(activeHigh) ? activeHigh : activeLow;
  const compiledKey1Read =
    originalPressed === activeHigh
      ? "\t\t\t\tGPIOA_ReadPortPin(KEY1_PIN))"
      : "\t\t\t\t!GPIOA_ReadPortPin(KEY1_PIN))";
  result = replaceOnce(
    result,
    originalPressed,
    `#ifdef FROGALERT_SURVEY
#include "ble/frogalert-monitor-config.h"

#ifndef FROGALERT_HARDWARE_PROFILE_ID
#error "FROGALERT_HARDWARE_PROFILE_ID must identify the compiled button profile"
#endif
#if FROGALERT_HARDWARE_PROFILE_ID != FROGALERT_PROFILE_B1144C_250901_USB_C && \
    FROGALERT_HARDWARE_PROFILE_ID != FROGALERT_PROFILE_B1144C_260404_USB_C
#error "unsupported FrogAlert button hardware profile"
#endif

int btn_key1_pressed(void);
int btn_brightness_key(void);
void btn_configure_key1_wake(void);

#define isPressed(key) \t\t((key) ? \\
\t\t\t\t!GPIOB_ReadPortPin(KEY2_PIN) : \\
\t\t\t\tbtn_key1_pressed())
#else
#define isPressed(key) \t\t((key) ? \\
\t\t\t\t!GPIOB_ReadPortPin(KEY2_PIN) : \\
${compiledKey1Read}
#endif
`,
    "profile-bound KEY1 declarations",
  );
  return result;
}

export function applyButtonHooks(source) {
  let result = normalizeLineEndings(source);
  result = replaceOnce(
    result,
    `static uint16_t btn_task(tmosTaskID, uint16_t);

void btn_init()
`,
    `static uint16_t btn_task(tmosTaskID, uint16_t);

#ifdef FROGALERT_SURVEY
__HIGH_CODE
int btn_key1_pressed(void)
{
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\treturn GPIOA_ReadPortPin(KEY1_PIN) != 0;
#else
\treturn GPIOA_ReadPortPin(KEY1_PIN) == 0;
#endif
}

int btn_brightness_key(void)
{
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\treturn KEY2;
#else
\treturn KEY1;
#endif
}

#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
#define FROGALERT_BRIGHTNESS_RELEASE_MAX (BUTTON_SCAN_FREQ * 2)
#endif

void btn_configure_key1_wake(void)
{
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);
\t\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);
#else
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);
\t\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_FallEdge);
#endif
}
#endif

void btn_init()
`,
    "profile-bound KEY1 implementation",
  );
  result = replaceOnce(
    result,
    `\t\tif (hold[k] >= LONGPRESS_THRES && is_longpress[k] == 0) {
\t\t\tis_longpress[k] = 1;
\t\t\tlongPressPending[k] = true;
\t\t\tif (button_task_id != INVALID_TASK_ID) {
\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);
\t\t\t}
\t\t}`,
    `\t\tif (hold[k] >= LONGPRESS_THRES && is_longpress[k] == 0) {
\t\t\tis_longpress[k] = 1;
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\t\t\t/* KEY2 is the physical bottom button on this profile. Defer its
\t\t\t * brightness action until release, leaving a continuous hold free
\t\t\t * for the independent 200 ms KEY2-to-ISP task. */
\t\t\tif (k == KEY2)
\t\t\t\treturn;
#endif
\t\t\tlongPressPending[k] = true;
\t\t\tif (button_task_id != INVALID_TASK_ID) {
\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);
\t\t\t}
\t\t}`,
    "bottom KEY2 deferred brightness activation",
  );
  result = replaceOnce(
    result,
    `\t\tif (hold[k] > 0 && hold[k] < LONGPRESS_THRES) {
\t\t\tonePressPending[k] = true;
\t\t\tif (button_task_id != INVALID_TASK_ID) {
\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);
\t\t\t}
\t\t}`,
    `#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\t\tif (k == KEY2 && hold[k] >= LONGPRESS_THRES &&
\t\t    hold[k] < FROGALERT_BRIGHTNESS_RELEASE_MAX) {
\t\t\tlongPressPending[k] = true;
\t\t\tif (button_task_id != INVALID_TASK_ID) {
\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);
\t\t\t}
\t\t} else
#endif
\t\tif (hold[k] > 0 && hold[k] < LONGPRESS_THRES) {
\t\t\tonePressPending[k] = true;
\t\t\tif (button_task_id != INVALID_TASK_ID) {
\t\t\t\ttmos_set_event(button_task_id, BTN_PRESS);
\t\t\t}
\t\t}`,
    "bottom KEY2 brightness release window",
  );
  return result;
}

export function applyPowerHooks(source) {
  let result = normalizeLineEndings(source);
  const legacyWake = [
    "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);",
    "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);",
  ].join("\n");
  const currentWake = [
    "\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);",
    "\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_FallEdge);",
  ].join("\n");
  const originalWake = result.includes(legacyWake) ? legacyWake : currentWake;
  result = replaceOnce(
    result,
    originalWake,
    `#ifdef FROGALERT_SURVEY
\tbtn_configure_key1_wake();
#else
${originalWake}
#endif`,
    "profile-bound KEY1 shutdown wake",
  );
  return result;
}

export function applyBatteryPowerHooks(source) {
  let result = normalizeLineEndings(source);
  result = replaceOnce(
    result,
    '#include "debug.h"\n',
    '#include "debug.h"\n#include "frogalert-boot-status.h"\n',
    "bounded battery conversion include",
  );
  result = replaceOnce(
    result,
    `void power_init()
{`,
    `static int16_t frogalert_adc_calibration;

void power_init()
{`,
    "retained ADC calibration",
  );
  result = replaceOnce(
    result,
    `	int16_t adc_calib = ADC_DataCalib_Rough();
	PRINT("RoughCalib_Value = %d \\n", adc_calib);`,
    `	frogalert_adc_calibration = ADC_DataCalib_Rough();
	PRINT("RoughCalib_Value = %d \\n", frogalert_adc_calibration);`,
    "ADC calibration capture",
  );
  result = replaceOnce(
    result,
    `int batt_raw()
{
	int ret = 0;

	PRINT("ADC reading: \\n");
	uint16_t buf[20];
	for(int i = 0; i < 20; i++) {
		uint16_t adc = ADC_ExcutSingleConver();
		ret += adc;
		PRINT("%d \\n", adc);
	}

	return ret / 20;
}`,
    `int batt_raw()
{
	uint32_t total = 0;

	PRINT("ADC reading: \\n");
	/* WCH recommends discarding the first conversion after selecting the
	 * external channel. Apply the signed rough-calibration offset to every
	 * retained sample before averaging. */
	(void)ADC_ExcutSingleConver();
	for (int i = 0; i < 20; i++) {
		int32_t adc = (int32_t)ADC_ExcutSingleConver() +
			      frogalert_adc_calibration;
		if (adc < 0)
			adc = 0;
		else if (adc > 4095)
			adc = 4095;
		total += (uint16_t)adc;
		PRINT("%d \\n", (int)adc);
	}

	return (int)(total / 20U);
}`,
    "calibrated averaged battery ADC samples",
  );
  result = replaceOnce(
    result,
    `#define ZERO_PERCENT_THRES      (3.3)
#define _100_PERCENT_THRES      (4.2)
#define ADC_MAX_VAL             (4096.0) // 12 bit
#define ADC_MAX_VOLT            (2.1)   // Volt
#define R1                      (182.0) // kOhm
#define R2                      (100.0) // kOhm
#define PERCENT_RANGE           (_100_PERCENT_THRES - ZERO_PERCENT_THRES)
#define VOLT_DIV(v)             ((v) / (R1 + R2) * R2) // Voltage divider
#define VOLT_DIV_INV(v)         ((v) / R2 * (R1 + R2)) // .. Inverse
#define ADC2VOLT(raw)           ((raw) / ADC_MAX_VAL * ADC_MAX_VOLT)
#define VOLT2ADC(volt)          ((volt) / ADC_MAX_VOLT * ADC_MAX_VAL)

int batt_raw2percent(int r)
{
	float vadc = ADC2VOLT(r);
	float vbat = VOLT_DIV_INV(vadc);
	float strip = vbat - ZERO_PERCENT_THRES;
	if (strip < PERCENT_RANGE) {
		// Negative values meaning the battery is not connected or died
		return (int)(strip / PERCENT_RANGE * 100.0);
	}
	return 100;
}`,
    `int batt_raw2percent(int r)
{
	if (r < 0)
		r = 0;
	else if (r > 4095)
		r = 4095;
	return frogalert_battery_from_raw((uint16_t)r).percent;
}`,
    "fixed-point bounded battery percentage",
  );
  return result;
}

export function applyDeviceInfoHooks(source) {
  let result = normalizeLineEndings(source);
  result = replaceOnce(
    result,
    "static const uint8_t    firmwareRev_val[] = USBC_VER_PREFIX VERSION;",
    'static const uint8_t    firmwareRev_val[] = "FrogAlert " FROGALERT_VERSION " / FOSSASIA " VERSION;',
    "exact FrogAlert BLE firmware revision",
  );
  assert.match(
    result,
    /static const uint8_t\s+mfr_name_val\[\] = "FOSSASIA";/,
    "FOSSASIA Device Information manufacturer credit drifted",
  );
  return result;
}

export function applyMainHooks(source) {
  let result = normalizeLineEndings(source);
  result = replaceOnce(
    result,
    `static void mode_setup_download();
static void mode_setup_normal();`,
    `static void mode_setup_download();
static void mode_setup_normal();
#ifdef FROGALERT_SURVEY
static void mode_setup_screen_off(void);
#endif`,
    "recoverable screen-off mode declaration",
  );
  result = replaceOnce(
    result,
    `	if (modes[mode])
		modes[mode]();
}

__HIGH_CODE
static void bm_transition()`,
    `	if (modes[mode])
		modes[mode]();
}
#ifdef FROGALERT_SURVEY
__HIGH_CODE
static void frogalert_change_mode()
{
	/* Keep the upstream visible cycle without entering CH58x shutdown. The
	 * application-level screen-off state leaves the button task and KEY2 ISP
	 * poll alive, so the badge can always wake without USB power. */
	if (mode == NORMAL) {
		mode = DOWNLOAD;
		mode_setup_download();
	} else if (mode == DOWNLOAD) {
		mode = POWER_OFF;
		mode_setup_screen_off();
	} else {
		mode = NORMAL;
		mode_setup_normal();
	}
}
#endif

__HIGH_CODE
static void bm_transition()`,
    "survey system button uses recoverable screen-off state",
  );
  result = replaceOnce(
    result,
    '#include "power.h"\n',
    '#include "power.h"\n#ifdef FROGALERT_SURVEY\n#include "frogalert-boot-status.h"\n#endif\n',
    "compact boot status include",
  );
  result = replaceOnce(
    result,
    "#define ANI_NEXT_STEP       (1 << 0)\n",
    `/* FrogAlert carries bkero/badgemagic-firmware 074c448's refresh fix in
 * the private survey lane. The ISR scans 22 column pairs over four ticks,
 * so 16 kHz produces a roughly 182 Hz complete-frame refresh. */
#define FROGALERT_LED_TICK_HZ (16000)

#define ANI_NEXT_STEP       (1 << 0)
`,
    "16 kHz display refresh constant",
  );
  result = replaceOnce(
    result,
    '#include "ble/setup.h"\n#include "ble/profile.h"\n',
    '#include "ble/setup.h"\n#include "ble/profile.h"\n#ifdef FROGALERT_SURVEY\n#include "ble/frogalert-survey.h"\n#endif\n',
    "main survey include",
  );
  result = replaceOnce(
    result,
    "\tperipheral_init();\n\n\tif (! badge_cfg.ble_always_on) {",
    "\tperipheral_init();\n#ifdef FROGALERT_SURVEY\n\tfrogalert_survey_init();\n#endif\n\n\tif (! badge_cfg.ble_always_on) {",
    "survey application initialization",
  );
  result = replaceOnce(
    result,
    `	if(events & ANI_NEXT_STEP) {

		static int (*animations[])(bm_t *bm, uint16_t *fb) = {`,
    `	if(events & ANI_NEXT_STEP) {
#ifdef FROGALERT_SURVEY
		if (frogalert_survey_display_active())
			return events ^ ANI_NEXT_STEP;
#endif

		static int (*animations[])(bm_t *bm, uint16_t *fb) = {`,
    "queued normal animation cannot reclaim an active survey overlay",
  );
  result = replaceOnce(
    result,
    `	if (events & ANI_MARQUE) {
		bm_t *bm = bmlist_current();`,
    `	if (events & ANI_MARQUE) {
#ifdef FROGALERT_SURVEY
		if (frogalert_survey_display_active())
			return events ^ ANI_MARQUE;
#endif
		bm_t *bm = bmlist_current();`,
    "queued marquee cannot reclaim an active survey overlay",
  );
  result = replaceOnce(
    result,
    `	if (events & ANI_FLASH) {
		bm_t *bm = bmlist_current();`,
    `	if (events & ANI_FLASH) {
#ifdef FROGALERT_SURVEY
		if (frogalert_survey_display_active())
			return events ^ ANI_FLASH;
#endif
		bm_t *bm = bmlist_current();`,
    "queued flash effect cannot reclaim an active survey overlay",
  );
  result = replaceOnce(
    result,
    `	if (events & BLE_NEXT_STEP) {
		ani_xbm_next_frame(&bluetooth, fb, 10, 0);`,
    `	if (events & BLE_NEXT_STEP) {
#ifdef FROGALERT_SURVEY
		if (frogalert_survey_display_active())
			return events ^ BLE_NEXT_STEP;
#endif
		ani_xbm_next_frame(&bluetooth, fb, 10, 0);`,
    "queued Bluetooth animation cannot reclaim an active survey overlay",
  );
  result = replaceOnce(
    result,
    `	bmlist_drop(curr_bm);
}

static uint16_t common_tasks`,
    `	bmlist_drop(curr_bm);
}

#ifdef FROGALERT_SURVEY
static uint8_t frogalert_bmlist_blank(void)
{
	bm_t *start = bmlist_current();
	bm_t *bm = start;

	if (!bm)
		return TRUE;
	do {
		if (bm->buf) {
			for (uint16_t column = 0; column < bm->width; column++) {
				if (bm->buf[column])
					return FALSE;
			}
		}
		bm = bm->next;
	} while (bm && bm != start);
	return TRUE;
}

static void frogalert_apply_blank_nametag_fallback(void)
{
	static const char fallback[] = "503.PARTY";
	const uint16_t width = (sizeof(fallback) - 1U) * 6U;
	bm_t *bm = bmlist_current();
	uint16_t *buffer;

	if (!bm || !frogalert_bmlist_blank())
		return;
	while (bm->next != bm)
		bmlist_drop(bm->next);
	buffer = realloc(bm->buf, width * sizeof(*buffer));
	if (!buffer)
		return;
	bm->buf = buffer;
	bm->width = width;
	bm->modes = 0;
	bm->is_flash = FALSE;
	bm->is_marquee = FALSE;
	bm->anim_step = 0;
	memset(bm->buf, 0, width * sizeof(*bm->buf));
	for (uint8_t character = 0; character < sizeof(fallback) - 1U;
	     character++) {
		for (uint8_t column = 0; column < 5; column++) {
			bm->buf[character * 6U + column] =
				(uint16_t)(font5x7[fallback[character] - ' ']
					[column + 1U] << 2);
		}
	}
}
#endif

static uint16_t common_tasks`,
    "blank nametag fallback renderer",
  );
  result = replaceOnce(
    result,
    `static void bm_transition()
{
	if (is_play_sequentially) {
		is_play_sequentially = 0;
		bmlist_gohead();
		return;
	}

	bmlist_gonext();
	if (bmlist_current() == bmlist_head()) {
		is_play_sequentially = 1;
		return;
	}
}
void play_splash`,
    `static void bm_transition()
{
	if (is_play_sequentially) {
		is_play_sequentially = 0;
		bmlist_gohead();
		return;
	}

	bmlist_gonext();
	if (bmlist_current() == bmlist_head()) {
		is_play_sequentially = 1;
		return;
	}
}
#ifdef FROGALERT_SURVEY
static uint8_t frogalert_counter_view;
static void start_ble_animation(void);
static void start_normal_animation(void);
extern int streaming_enabled;

uint8_t frogalert_survey_counter_mode(void)
{
	return mode == NORMAL && frogalert_counter_view;
}

static void frogalert_view_transition(void)
{
	if (frogalert_counter_view) {
		frogalert_counter_view = FALSE;
		is_play_sequentially = FALSE;
		bmlist_gonext();
	} else {
		is_play_sequentially = FALSE;
		frogalert_counter_view = TRUE;
	}
	frogalert_survey_view_changed();
}

uint8_t frogalert_badgemagic_persistent_advertising(void)
{
	return mode != POWER_OFF &&
	       (badge_cfg.ble_always_on || mode == DOWNLOAD);
}

static void frogalert_key1_transition(void)
{
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
	frogalert_change_mode();
#else
	if (mode == NORMAL)
		frogalert_view_transition();
#endif
}

static void frogalert_key2_transition(void)
{
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
	if (mode == NORMAL)
		frogalert_view_transition();
#else
	frogalert_change_mode();
#endif
}
#endif

void play_splash`,
    "profile-bound physical button roles",
  );
  result = replaceOnce(
    result,
    `static void disp_charging()
{
`,
    `#ifdef FROGALERT_SURVEY
#define FROGALERT_SURVEY_TEXT_MAX     16
#define FROGALERT_SURVEY_PAGE_CHARS   8
#define FROGALERT_SURVEY_PAGE_MAX     2
#define FROGALERT_SURVEY_BT_LOGO_WIDTH 6
#define FROGALERT_SURVEY_GLYPH_WIDTH   5
#define FROGALERT_SURVEY_GLYPH_STRIDE  6
#define FROGALERT_SURVEY_ICON_GAP      2

static char frogalert_survey_text[FROGALERT_SURVEY_TEXT_MAX];
static uint8_t frogalert_survey_page_start[FROGALERT_SURVEY_PAGE_MAX];
static uint8_t frogalert_survey_page_length[FROGALERT_SURVEY_PAGE_MAX];
static uint8_t frogalert_survey_page_count;
static uint8_t frogalert_survey_page;
static volatile uint16_t frogalert_survey_overlay_fb[2][LED_COLS];
static volatile uint8_t frogalert_survey_overlay_index;
static volatile uint8_t frogalert_survey_display_owned;

uint8_t frogalert_survey_allowed(void)
{
	return mode == NORMAL && !streaming_enabled;
}

void frogalert_display_survey_relinquish(void)
{
	frogalert_survey_display_owned = FALSE;
}

void frogalert_display_survey_release(void)
{
	if (!frogalert_survey_display_owned)
		return;
	frogalert_survey_display_owned = FALSE;
	if (mode == NORMAL && !streaming_enabled)
		start_normal_animation();
}

static void frogalert_display_survey_render_page(void)
{
	uint8_t text_length;
	uint8_t text_start;
	uint8_t stride;
	uint8_t width;
	uint8_t start;
	uint8_t target_index;

	if (!frogalert_survey_display_active()) {
		frogalert_display_survey_release();
		return;
	}
	if (!frogalert_survey_page_count)
		return;
	if (!frogalert_survey_display_owned) {
		stop_all_animation();
	}

	text_start = frogalert_survey_page_start[frogalert_survey_page];
	text_length = frogalert_survey_page_length[frogalert_survey_page];
	stride = text_length == FROGALERT_SURVEY_PAGE_CHARS ? 5 : 6;
	width = (uint8_t)(text_length * stride - (stride == 6 ? 1 : 0));
	start = (uint8_t)((LED_COLS - width) / 2);
	target_index = frogalert_survey_overlay_index ^ 1U;
	for (uint8_t column = 0; column < LED_COLS; column++)
		frogalert_survey_overlay_fb[target_index][column] = 0;
	for (uint8_t character = 0; character < text_length; character++) {
		for (uint8_t column = 0; column < 5; column++)
			frogalert_survey_overlay_fb[target_index]
				[start + character * stride + column] =
				(uint16_t)(font5x7[
					frogalert_survey_text[
						text_start + character] - ' ']
					[column + 1] << 2);
	}
	frogalert_survey_overlay_index = target_index;
	frogalert_survey_display_owned = TRUE;
}

static uint8_t frogalert_display_survey_text(const char *text,
					     uint8_t text_length,
					     uint8_t paginate)
{
	uint8_t second_start;
	uint8_t split;

	if (!text || text_length == 0 || text_length > FROGALERT_SURVEY_TEXT_MAX)
		return FALSE;
	for (uint8_t character = 0; character < text_length; character++) {
		if (text[character] < ' ' || text[character] > '~')
			return FALSE;
		frogalert_survey_text[character] = text[character];
	}

	frogalert_survey_page = 0;
	frogalert_survey_page_count = 1;
	frogalert_survey_page_start[0] = 0;
	frogalert_survey_page_length[0] = text_length;
	frogalert_survey_page_start[1] = 0;
	frogalert_survey_page_length[1] = 0;
	if (paginate && text_length > FROGALERT_SURVEY_PAGE_CHARS) {
		split = FROGALERT_SURVEY_PAGE_CHARS;
		for (uint8_t index = 1;
		     index < FROGALERT_SURVEY_PAGE_CHARS; index++) {
			if (text[index] == ' ' &&
			    text_length - index - 1 <=
				    FROGALERT_SURVEY_PAGE_CHARS)
				split = index;
		}
		second_start = split;
		while (second_start < text_length &&
		       text[second_start] == ' ')
			second_start++;
		frogalert_survey_page_count = 2;
		frogalert_survey_page_length[0] = split;
		frogalert_survey_page_start[1] = second_start;
		frogalert_survey_page_length[1] =
			(uint8_t)(text_length - second_start);
	}
	frogalert_display_survey_render_page();
	return frogalert_survey_page_count;
}

uint8_t frogalert_display_survey_count(uint8_t count, uint8_t saturated)
{
	/* First-frame rune from FOSSASIA's pinned 24x66 bluetooth.xbm. */
	static const uint16_t bluetooth_logo[FROGALERT_SURVEY_BT_LOGO_WIDTH] = {
		0x088, 0x050, 0x7ff, 0x222, 0x154, 0x088,
	};
	char result[3] = {
		(char)('0' + ((count / 10) % 10)),
		(char)('0' + (count % 10)),
		'+',
	};
	uint8_t result_length = saturated ? 3 : 2;
	uint8_t width = FROGALERT_SURVEY_BT_LOGO_WIDTH +
			FROGALERT_SURVEY_ICON_GAP +
			result_length * FROGALERT_SURVEY_GLYPH_STRIDE - 1;
	uint8_t start;
	uint8_t glyph_start;
	uint8_t target_index;

	if (!frogalert_survey_display_active()) {
		frogalert_display_survey_release();
		return FALSE;
	}
	if (!frogalert_survey_display_owned)
		stop_all_animation();

	start = (uint8_t)((LED_COLS - width) / 2);
	glyph_start = start + FROGALERT_SURVEY_BT_LOGO_WIDTH +
		      FROGALERT_SURVEY_ICON_GAP;
	target_index = frogalert_survey_overlay_index ^ 1U;
	for (uint8_t column = 0; column < LED_COLS; column++)
		frogalert_survey_overlay_fb[target_index][column] = 0;
	for (uint8_t column = 0;
	     column < FROGALERT_SURVEY_BT_LOGO_WIDTH; column++)
		frogalert_survey_overlay_fb[target_index][start + column] =
			bluetooth_logo[column];
	for (uint8_t character = 0; character < result_length; character++) {
		for (uint8_t column = 0;
		     column < FROGALERT_SURVEY_GLYPH_WIDTH; column++)
			frogalert_survey_overlay_fb[target_index]
				[glyph_start +
				 character * FROGALERT_SURVEY_GLYPH_STRIDE +
				 column] =
				(uint16_t)(font5x7[result[character] - ' ']
					[column + 1] << 2);
	}
	frogalert_survey_page_count = 0;
	frogalert_survey_overlay_index = target_index;
	frogalert_survey_display_owned = TRUE;
	return TRUE;
}

uint8_t frogalert_display_survey_message(const char *message,
					 uint8_t message_length)
{
	return frogalert_display_survey_text(message, message_length, TRUE);
}

void frogalert_display_frog_dance(uint8_t frame)
{
	static const uint16_t frogs[2][9] = {
		{0x11c, 0x0b6, 0x07e, 0x3f4, 0x1f4,
		 0x3f4, 0x07e, 0x0b6, 0x11c},
		{0x09c, 0x136, 0x27e, 0x1f4, 0x1f4,
		 0x1f4, 0x27e, 0x136, 0x09c},
	};
	static const uint8_t starts[3] = {1, 17, 33};
	uint8_t target_index;

	if (!frogalert_survey_display_active())
		return;
	if (!frogalert_survey_display_owned) {
		stop_all_animation();
	}
	target_index = frogalert_survey_overlay_index ^ 1U;
	for (uint8_t column = 0; column < LED_COLS; column++)
		frogalert_survey_overlay_fb[target_index][column] = 0;
	frame &= 1;
	for (uint8_t frog = 0; frog < 3; frog++) {
		for (uint8_t column = 0; column < 9; column++)
			frogalert_survey_overlay_fb[target_index]
				[starts[frog] + column] = frogs[frame][column];
	}
	frogalert_survey_overlay_index = target_index;
	frogalert_survey_display_owned = TRUE;
}

void frogalert_display_survey_page_step(void)
{
	if (!frogalert_survey_display_active()) {
		frogalert_display_survey_release();
		return;
	}
	if (!frogalert_survey_display_owned ||
	    frogalert_survey_page_count <= 1 ||
	    frogalert_survey_page + 1 >= frogalert_survey_page_count)
		return;
	frogalert_survey_page++;
	frogalert_display_survey_render_page();
}

void frogalert_display_survey_page_redraw(void)
{
	frogalert_display_survey_render_page();
}
#endif

static void disp_charging()
{
`,
    "bounded survey count display hooks",
  );
  result = replaceOnce(
    result,
    `static void stop_all_animation()
{
	tmos_stop_task(common_taskid, ANI_NEXT_STEP);
	tmos_stop_task(common_taskid, ANI_MARQUE);
	tmos_stop_task(common_taskid, ANI_FLASH);
	tmos_stop_task(common_taskid, BLE_NEXT_STEP);
	memset(fb, 0, sizeof(fb));
}

int streaming_enabled;`,
    `static void stop_all_animation()
{
	tmos_stop_task(common_taskid, ANI_NEXT_STEP);
	tmos_stop_task(common_taskid, ANI_MARQUE);
	tmos_stop_task(common_taskid, ANI_FLASH);
	tmos_stop_task(common_taskid, BLE_NEXT_STEP);
	memset(fb, 0, sizeof(fb));
}
#ifdef FROGALERT_SURVEY
static void mode_setup_screen_off(void)
{
	/* Keep beta.11's physically working screen-off behavior. In particular,
	 * do not enter CH58x shutdown from the BadgeMagic-capable runtime. */
	ble_disable_advertise();
	(void)frogalert_survey_suspend(FALSE);
	frogalert_display_survey_relinquish();
	stop_all_animation();
	TMR0_ITCfg(DISABLE, TMR0_3_IT_CYC_END);
	PFIC_DisableIRQ(TMR0_IRQn);
	TMR0_Disable();
	leds_releaseall();
	btn_onOnePress(KEY1, frogalert_key1_transition);
	btn_onOnePress(KEY2, frogalert_key2_transition);
}
#endif

int streaming_enabled;`,
    "recoverable display-off mode preserves buttons and ISP",
  );
  result = replaceOnce(
    result,
    `	if (params[0] == 0x00) { // enter streaming mode
		stop_all_animation();
		streaming_enabled = 1;
	} else if (params[0] == 0x01) { // return to normal mode
		resume_from_streaming();
		streaming_enabled = 0;
	}`,
    `	if (params[0] == 0x00) { // enter streaming mode
		stop_all_animation();
#ifdef FROGALERT_SURVEY
		(void)frogalert_survey_suspend(FALSE);
		frogalert_display_survey_relinquish();
#endif
		streaming_enabled = 1;
	} else if (params[0] == 0x01) { // return to normal mode
		streaming_enabled = 0;
		resume_from_streaming();
#ifdef FROGALERT_SURVEY
		frogalert_survey_view_changed();
#endif
	}`,
    "streaming transfers and restores FrogAlert display ownership",
  );
  result = replaceOnce(
    result,
    `static void disp_charging()
{`,
    `#ifdef FROGALERT_SURVEY
void frogalert_survey_on_disconnect(void)
{
	if (streaming_enabled) {
		streaming_enabled = 0;
		if (mode != NORMAL)
			start_ble_animation();
	}
	if (mode == NORMAL) {
		start_normal_animation();
		frogalert_survey_view_changed();
	}
}
#endif

static void disp_charging()
{`,
    "streaming disconnect restores FrogAlert display ownership",
  );
  result = replaceOnce(
    result,
    `static void disp_charging()
{`,
    `#ifdef FROGALERT_SURVEY
static void frogalert_display_boot_status(void)
{
	frogalert_battery_reading_t reading;

	/* Sample against a blank panel, then show two short, fixed boot cards.
	 * This credit is independent of the user-configurable splash. */
	for (uint8_t column = 0; column < LED_COLS; column++)
		fb[column] = 0;
	DelayMs(10);
	reading = frogalert_battery_from_raw((uint16_t)batt_raw());
	frogalert_boot_render_credit(fb);
	DelayMs(750);
	frogalert_boot_render_battery(fb, reading);
	DelayMs(750);
}
#endif

static void disp_charging()
{`,
    "immutable FOSSASIA, version, profile, and battery boot cards",
  );
  result = replaceOnce(
    result,
    `		if (charging_status()) {
			disp_bat_stt(blink ? percent : 0, 2, 2);
			if (ani_xbm_next_frame(&fabm_xbm, fb, 16, 0) == 0) {
				fb_puts(VERSION_ABBR, sizeof(VERSION_ABBR), 16, 2);
				fb_putchar(' ', 40, 2);
			}
			blink = !blink;
			DelayMs(500);
		} else {
			disp_bat_stt(percent, 7, 2);
			DelayMs(500);
			return;
		}`,
    `#ifdef FROGALERT_SURVEY
		(void)blink;
		(void)percent;
		if (charging_status())
			frogalert_display_boot_status();
		else
			return;
#else
		if (charging_status()) {
			disp_bat_stt(blink ? percent : 0, 2, 2);
			if (ani_xbm_next_frame(&fabm_xbm, fb, 16, 0) == 0) {
				fb_puts(VERSION_ABBR, sizeof(VERSION_ABBR), 16, 2);
				fb_putchar(' ', 40, 2);
			}
			blink = !blink;
			DelayMs(500);
		} else {
			disp_bat_stt(percent, 7, 2);
			DelayMs(500);
			return;
		}
#endif`,
    "charging screen uses real FrogAlert boot metadata",
  );
  result = replaceOnce(
    result,
    `	power_init();
	disp_charging();
	cfg_init();`,
    `	power_init();
	disp_charging();
#ifdef FROGALERT_SURVEY
	frogalert_display_boot_status();
#endif
	cfg_init();`,
    "immutable boot cards precede configured splash",
  );
  result = replaceOnce(
    result,
    `	// If always-on BLE is enabled, then skip this mode, jump to next mode
	if (badge_cfg.ble_always_on) {
		change_mode();
	}`,
    `	// If always-on BLE is enabled, return directly to normal mode.
	if (badge_cfg.ble_always_on) {
		frogalert_change_mode();
		return;
	}`,
    "always-on mode skips download without entering shutdown",
  );
  result = replaceOnce(
    result,
    `	// Disable bitmap transition while in download mode
	btn_onOnePress(KEY2, NULL);

	// Take control of the current bitmap to display
	// the Bluetooth animation
	ble_enable_advertise();
	start_ble_animation();`,
    `	// Route physical top/bottom roles through the compiled board profile.
	// The view button is inert outside normal mode; the system button advances.
	btn_onOnePress(KEY1, frogalert_key1_transition);
	btn_onOnePress(KEY2, frogalert_key2_transition);

	// Take control of the current bitmap to display
	// the Bluetooth animation. Never advertise during Central discovery.
#ifdef FROGALERT_SURVEY
	uint8_t frogalert_radio_idle = frogalert_survey_suspend(TRUE);
	frogalert_display_survey_relinquish();
	if (frogalert_radio_idle)
		ble_enable_advertise();
#else
	ble_enable_advertise();
#endif
	start_ble_animation();`,
    "download mode suspends passive discovery before advertising",
  );
  result = replaceOnce(
    result,
    `void reload_bmlist()
{
	clean_bmlist();
	load_bmlist();
}`,
    `void reload_bmlist()
{
	clean_bmlist();
	load_bmlist();
#ifdef FROGALERT_SURVEY
	frogalert_apply_blank_nametag_fallback();
#endif
}`,
    "blank nametag fallback after BadgeMagic upload",
  );
  result = replaceOnce(
    result,
    `static void mode_setup_normal()
{
	btn_onOnePress(KEY2, bm_transition);
	reload_bmlist();
	start_normal_animation();
}`,
    `static void mode_setup_normal()
{
#ifdef FROGALERT_SURVEY
	TMR0_ClearITFlag(TMR0_3_IT_CYC_END);
	TMR0_Enable();
	TMR0_ITCfg(ENABLE, TMR0_3_IT_CYC_END);
	PFIC_EnableIRQ(TMR0_IRQn);
	frogalert_counter_view = FALSE;
	frogalert_display_survey_relinquish();
	btn_onOnePress(KEY1, frogalert_key1_transition);
	btn_onOnePress(KEY2, frogalert_key2_transition);
	if (badge_cfg.ble_always_on) {
		uint8_t frogalert_radio_idle = frogalert_survey_suspend(TRUE);
		if (frogalert_radio_idle)
			ble_enable_advertise();
	}
#else
	btn_onOnePress(KEY2, bm_transition);
#endif
	reload_bmlist();
	start_normal_animation();
#ifdef FROGALERT_SURVEY
	frogalert_survey_view_changed();
#endif
}`,
    "normal mode restores badge view and KEY2 rotation",
  );
  result = replaceOnce(
    result,
    `void handle_after_rx()
{
	if (badge_cfg.reset_rx) {
		SYS_ResetExecute();
	} else {
		mode_setup_normal();
	}
}`,
    `void handle_after_rx()
{
	if (badge_cfg.reset_rx) {
		SYS_ResetExecute();
	} else {
#ifdef FROGALERT_SURVEY
		mode = NORMAL;
#endif
		mode_setup_normal();
	}
}`,
    "BadgeMagic upload restores the normal system mode",
  );
  result = replaceOnce(
    result,
    `	btn_onOnePress(KEY1, change_mode);
	btn_onOnePress(KEY2, bm_transition);
	btn_onLongPress(KEY1, change_brightness);`,
    `#ifdef FROGALERT_SURVEY
	btn_onOnePress(KEY1, frogalert_key1_transition);
	btn_onOnePress(KEY2, frogalert_key2_transition);
	btn_onLongPress(btn_brightness_key(), change_brightness);
#else
	btn_onOnePress(KEY1, change_mode);
	btn_onOnePress(KEY2, bm_transition);
	btn_onLongPress(KEY1, change_brightness);
#endif`,
    "initial physical button registration",
  );
  result = replaceOnce(
    result,
    `	load_bmlist();

	ble_setup();`,
    `	load_bmlist();
#ifdef FROGALERT_SURVEY
	frogalert_apply_blank_nametag_fallback();
#endif

	ble_setup();`,
    "blank nametag fallback at boot",
  );
  result = replaceOnce(
    result,
    "\tTMR0_TimerInit((FREQ_SYS / 2000) / 2);\n",
    "\tTMR0_TimerInit(FREQ_SYS / FROGALERT_LED_TICK_HZ);\n",
    "display refresh timer runs at 16 kHz",
  );
  result = replaceOnce(
    result,
    `			led_write2dcol(i >> 2, fb[i >> 1], fb[(i >> 1) + 1]);`,
    `#ifdef FROGALERT_SURVEY
			uint8_t column = i >> 1;
			uint8_t overlay_index =
				frogalert_survey_overlay_index;
			if (frogalert_survey_display_owned)
				led_write2dcol(i >> 2,
					frogalert_survey_overlay_fb
						[overlay_index][column],
					frogalert_survey_overlay_fb
						[overlay_index][column + 1]);
			else
				led_write2dcol(i >> 2, fb[column],
					      fb[column + 1]);
#else
			led_write2dcol(i >> 2, fb[i >> 1],
				      fb[(i >> 1) + 1]);
#endif`,
    "display ISR gives FrogAlert overlays absolute framebuffer priority",
  );
  result = replaceOnce(
    result,
    "\t\telse if (state > (badge_cfg.led_brightness&3))\n",
    `		/* Blank only on the first tick past the selected on-period.
		 * Releasing the same 23 pins again on later ticks changes no
		 * output and wastes time in this higher-rate interrupt. */
		else if (state == (badge_cfg.led_brightness&3) + 1)
`,
    "display PWM blanks once per column pair",
  );
  return result;
}

export function applyAnimationHooks(source) {
  let result = normalizeLineEndings(source);
  result = replaceOnce(
    result,
    '#include "bmlist.h"\n#include "debug.h"\n',
    '#include "bmlist.h"\n#include "debug.h"\n#ifdef FROGALERT_SURVEY\n#include "frogalert-animation-compat.h"\n#if LED_COLS != FROGALERT_ANIMATION_VISIBLE_COLUMNS\n#error "FrogAlert animation compatibility requires a 44-column display"\n#endif\n#endif\n',
    "animation compatibility include",
  );
  result = replaceOnce(
    result,
    `int ani_animation(bm_t *bm, uint16_t *fb)
{
	int frame_steps = ANI_ANIMATION_STEPS;
	int frames = ALIGN(bm->width, LED_COLS) / LED_COLS;
	int total_steps = frame_steps * frames;
	int frame = mod(bm->anim_step, total_steps)/frame_steps;

	bm->anim_step++;

	still(bm, fb, frame);

	return mod(bm->anim_step, total_steps);
}`,
    `int ani_animation(bm_t *bm, uint16_t *fb)
{
	int frame_steps = ANI_ANIMATION_STEPS;
#ifdef FROGALERT_SURVEY
	int frames = frogalert_animation_frame_count(bm->buf, bm->width);
#else
	int frames = ALIGN(bm->width, LED_COLS) / LED_COLS;
#endif
	if (frames == 0) {
		fb_fill(fb, 0);
		return 0;
	}
	int total_steps = frame_steps * frames;
	int frame = mod(bm->anim_step, total_steps)/frame_steps;

	bm->anim_step++;

#ifdef FROGALERT_SURVEY
	frogalert_animation_copy_visible_frame(bm->buf, bm->width, frame, fb);
#else
	still(bm, fb, frame);
#endif

	return mod(bm->anim_step, total_steps);
}`,
    "animation mode uses qualified 48-column frames",
  );
  result = replaceOnce(
    result,
    `int ani_fixed(bm_t *bm, uint16_t *fb)
{
	int frame_steps = ANI_FIXED_STEPS;
	int frames = ALIGN(bm->width, LED_COLS) / LED_COLS;
	int total_steps = frame_steps * frames;
	int frame = mod(bm->anim_step, total_steps)/frame_steps;

	bm->anim_step++;
	still(bm, fb, frame);

	return mod(bm->anim_step, total_steps);
}`,
    `int ani_fixed(bm_t *bm, uint16_t *fb)
{
	int frame_steps = ANI_FIXED_STEPS;
#ifdef FROGALERT_SURVEY
	int frames = frogalert_animation_frame_count(bm->buf, bm->width);
#else
	int frames = ALIGN(bm->width, LED_COLS) / LED_COLS;
#endif
	if (frames == 0) {
		fb_fill(fb, 0);
		return 0;
	}
	int total_steps = frame_steps * frames;
	int frame = mod(bm->anim_step, total_steps)/frame_steps;

	bm->anim_step++;
#ifdef FROGALERT_SURVEY
	frogalert_animation_copy_visible_frame(bm->buf, bm->width, frame, fb);
#else
	still(bm, fb, frame);
#endif

	return mod(bm->anim_step, total_steps);
}`,
    "fixed mode uses qualified 48-column frames",
  );
  return result;
}

export async function applySurveyHooks(sourceDirectory) {
  const peripheralPath = path.join(sourceDirectory, "src/ble/peripheral.c");
  const mainPath = path.join(sourceDirectory, "src/main.c");
  const animationPath = path.join(sourceDirectory, "src/animation.c");
  const buttonPath = path.join(sourceDirectory, "src/button.c");
  const buttonHeaderPath = path.join(sourceDirectory, "src/button.h");
  const powerPath = path.join(sourceDirectory, "src/power.c");
  const deviceInfoPath = path.join(sourceDirectory, "src/ble/profile/devinfo.c");
  const [peripheral, main, animation, button, buttonHeader, power, deviceInfo] =
    await Promise.all([
    readFile(peripheralPath, "utf8"),
    readFile(mainPath, "utf8"),
    readFile(animationPath, "utf8"),
    readFile(buttonPath, "utf8"),
    readFile(buttonHeaderPath, "utf8"),
    readFile(powerPath, "utf8"),
    readFile(deviceInfoPath, "utf8"),
  ]);
  await Promise.all([
    writeFile(peripheralPath, applyPeripheralHooks(peripheral), "utf8"),
    writeFile(mainPath, applyMainHooks(main), "utf8"),
    writeFile(animationPath, applyAnimationHooks(animation), "utf8"),
    writeFile(buttonPath, applyButtonHooks(button), "utf8"),
    writeFile(buttonHeaderPath, applyButtonHeaderHooks(buttonHeader), "utf8"),
    writeFile(
      powerPath,
      applyBatteryPowerHooks(applyPowerHooks(power)),
      "utf8",
    ),
    writeFile(deviceInfoPath, applyDeviceInfoHooks(deviceInfo), "utf8"),
  ]);
}

async function main(argv) {
  assert.equal(argv.length, 1, "usage: apply-fossasia-survey.mjs SOURCE_DIR");
  await applySurveyHooks(path.resolve(argv[0]));
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`FOSSASIA survey hook failed: ${error.message}`);
    process.exitCode = 1;
  });
}
