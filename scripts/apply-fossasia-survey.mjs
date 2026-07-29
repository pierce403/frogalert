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
		if (frogalert_survey_suspend(TRUE))
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
#define FROGALERT_KEY1_PROFILE_UNKNOWN 0
#define FROGALERT_KEY1_PROFILE_250901  1
#define FROGALERT_KEY1_PROFILE_260404  2

int btn_key1_pressed(void);
uint8_t btn_key1_profile(void);
uint8_t btn_key1_profile_detected(void);
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
    "adaptive KEY1 declarations",
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
/*
 * The two USB-C boards connect KEY1/PA1 to opposite rails. An open switch
 * follows both weak pulls (low, then high); a held 250901 switch stays high
 * under both, while a held 260404 switch stays low under both. Probe only
 * until the first unambiguous held sample, then retain the detected polarity.
 * KEY2/PB22 and its independent long-press ROM-ISP path are untouched.
 */
static volatile uint8_t frogalert_key1_profile;
static uint8_t frogalert_key1_candidate;
static uint8_t frogalert_key1_confidence;

__HIGH_CODE
static void frogalert_key1_settle(void)
{
\t/* Let the weak internal pull settle the open PA1 trace before sampling. */
\tDelayUs(2);
}

__HIGH_CODE
static void frogalert_key1_restore_pull(void)
{
\tuint8_t profile = frogalert_key1_profile;

\tif (profile == FROGALERT_KEY1_PROFILE_250901) {
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);
\t} else if (profile == FROGALERT_KEY1_PROFILE_260404) {
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\t} else {
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);
#else
\t} else {
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);
#endif
\t}
}

__HIGH_CODE
int btn_key1_pressed(void)
{
\tuint8_t profile = frogalert_key1_profile;
\tuint8_t pulled_down;
\tuint8_t pulled_up;
\tuint8_t observed = FROGALERT_KEY1_PROFILE_UNKNOWN;

\tif (profile == FROGALERT_KEY1_PROFILE_250901)
\t\treturn GPIOA_ReadPortPin(KEY1_PIN) != 0;
\tif (profile == FROGALERT_KEY1_PROFILE_260404)
\t\treturn GPIOA_ReadPortPin(KEY1_PIN) == 0;

\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);
\tfrogalert_key1_settle();
\tpulled_down = GPIOA_ReadPortPin(KEY1_PIN) != 0;
\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);
\tfrogalert_key1_settle();
\tpulled_up = GPIOA_ReadPortPin(KEY1_PIN) != 0;

\tif (pulled_down && pulled_up)
\t\tobserved = FROGALERT_KEY1_PROFILE_250901;
\telse if (!pulled_down && !pulled_up)
\t\tobserved = FROGALERT_KEY1_PROFILE_260404;

\tif (observed == FROGALERT_KEY1_PROFILE_UNKNOWN) {
\t\tfrogalert_key1_candidate = FROGALERT_KEY1_PROFILE_UNKNOWN;
\t\tfrogalert_key1_confidence = 0;
\t} else if (observed != frogalert_key1_candidate) {
\t\tfrogalert_key1_candidate = observed;
\t\tfrogalert_key1_confidence = 1;
\t} else if (frogalert_key1_confidence < 4) {
\t\tfrogalert_key1_confidence++;
\t\tif (frogalert_key1_confidence == 4)
\t\t\tfrogalert_key1_profile = observed;
\t}

\t/* Restore a stable pull between 50 Hz samples. */
\tfrogalert_key1_restore_pull();
\treturn observed != FROGALERT_KEY1_PROFILE_UNKNOWN;
}

uint8_t btn_key1_profile(void)
{
\tuint8_t profile = frogalert_key1_profile;

\tif (profile != FROGALERT_KEY1_PROFILE_UNKNOWN)
\t\treturn profile;
#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
\treturn FROGALERT_KEY1_PROFILE_250901;
#else
\treturn FROGALERT_KEY1_PROFILE_260404;
#endif
}

uint8_t btn_key1_profile_detected(void)
{
\treturn frogalert_key1_profile != FROGALERT_KEY1_PROFILE_UNKNOWN;
}

void btn_configure_key1_wake(void)
{
\tif (btn_key1_profile() == FROGALERT_KEY1_PROFILE_250901) {
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PD);
\t\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_RiseEdge);
\t} else {
\t\tGPIOA_ModeCfg(KEY1_PIN, GPIO_ModeIN_PU);
\t\tGPIOA_ITModeCfg(KEY1_PIN, GPIO_ITMode_FallEdge);
\t}
}
#endif

void btn_init()
`,
    "adaptive KEY1 implementation",
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
    "adaptive KEY1 shutdown wake",
  );
  return result;
}

export function applyMainHooks(source) {
  let result = normalizeLineEndings(source);
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

static void frogalert_key1_transition(void)
{
	if (btn_key1_profile() == FROGALERT_KEY1_PROFILE_250901)
		change_mode();
	else if (mode == NORMAL)
		frogalert_view_transition();
}

static void frogalert_key2_transition(void)
{
	/*
	 * Until KEY1 proves the board, let a short KEY2 press select the counter
	 * but never walk an accidentally cross-flashed badge toward power-off.
	 */
	if (!btn_key1_profile_detected()) {
		if (mode == NORMAL)
			frogalert_view_transition();
		return;
	}
	if (btn_key1_profile() == FROGALERT_KEY1_PROFILE_250901) {
		if (mode == NORMAL)
			frogalert_view_transition();
	} else {
		change_mode();
	}
}
#endif

void play_splash`,
    "KEY2 virtual counter-view rotation",
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
#define FROGALERT_SURVEY_PHASE_GAP     2

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

uint8_t frogalert_display_survey_count(uint8_t count, uint8_t saturated,
				       uint8_t phase)
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

	if (phase != ' ' && (phase < ' ' || phase > '~'))
		return FALSE;
	if (phase != ' ')
		width += FROGALERT_SURVEY_PHASE_GAP +
			 FROGALERT_SURVEY_GLYPH_WIDTH;
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
	if (phase != ' ') {
		uint8_t phase_start =
			glyph_start +
			result_length * FROGALERT_SURVEY_GLYPH_STRIDE +
			FROGALERT_SURVEY_PHASE_GAP - 1;
		for (uint8_t column = 0;
		     column < FROGALERT_SURVEY_GLYPH_WIDTH; column++)
			frogalert_survey_overlay_fb[target_index]
				[phase_start + column] =
				(uint16_t)(font5x7[phase - ' ']
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
		if (mode == NORMAL)
			start_normal_animation();
		else
			start_ble_animation();
	}
	frogalert_survey_view_changed();
}
#endif

static void disp_charging()
{`,
    "streaming disconnect restores FrogAlert display ownership",
  );
  result = replaceOnce(
    result,
    `	// Disable bitmap transition while in download mode
	btn_onOnePress(KEY2, NULL);

	// Take control of the current bitmap to display
	// the Bluetooth animation
	ble_enable_advertise();
	start_ble_animation();`,
    `	// Route both buttons through the detected KEY1 electrical profile.
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
    `static void mode_setup_normal()
{
	btn_onOnePress(KEY2, bm_transition);
	reload_bmlist();
	start_normal_animation();
}`,
    `static void mode_setup_normal()
{
#ifdef FROGALERT_SURVEY
	frogalert_counter_view = FALSE;
	frogalert_display_survey_relinquish();
	btn_onOnePress(KEY1, frogalert_key1_transition);
	btn_onOnePress(KEY2, frogalert_key2_transition);
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
#else
	btn_onOnePress(KEY1, change_mode);
	btn_onOnePress(KEY2, bm_transition);
#endif
	btn_onLongPress(KEY1, change_brightness);`,
    "initial KEY2 virtual counter-view registration",
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
  const [peripheral, main, animation, button, buttonHeader, power] =
    await Promise.all([
    readFile(peripheralPath, "utf8"),
    readFile(mainPath, "utf8"),
    readFile(animationPath, "utf8"),
    readFile(buttonPath, "utf8"),
    readFile(buttonHeaderPath, "utf8"),
    readFile(powerPath, "utf8"),
  ]);
  await Promise.all([
    writeFile(peripheralPath, applyPeripheralHooks(peripheral), "utf8"),
    writeFile(mainPath, applyMainHooks(main), "utf8"),
    writeFile(animationPath, applyAnimationHooks(animation), "utf8"),
    writeFile(buttonPath, applyButtonHooks(button), "utf8"),
    writeFile(buttonHeaderPath, applyButtonHeaderHooks(buttonHeader), "utf8"),
    writeFile(powerPath, applyPowerHooks(power), "utf8"),
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
