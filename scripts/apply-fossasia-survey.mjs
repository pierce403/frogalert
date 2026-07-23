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

export function applyMainHooks(source) {
  let result = normalizeLineEndings(source);
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
#define FROGALERT_SURVEY_COUNT_LENGTH 8
#define FROGALERT_SURVEY_TEXT_MAX     16
#define FROGALERT_SURVEY_TEXT_COLUMNS (FROGALERT_SURVEY_TEXT_MAX * 6)

static uint16_t frogalert_survey_bitmap[FROGALERT_SURVEY_TEXT_COLUMNS];
static uint8_t frogalert_survey_offset;
static uint8_t frogalert_survey_columns;
static uint8_t frogalert_survey_display_owned;

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

static uint8_t frogalert_display_survey_text(const char *text,
					     uint8_t text_length)
{
	if (!text || text_length == 0 || text_length > FROGALERT_SURVEY_TEXT_MAX)
		return FALSE;

	for (uint8_t character = 0; character < text_length; character++) {
		if (text[character] < ' ' || text[character] > '~')
			return FALSE;
		for (uint8_t column = 0; column < 6; column++) {
			frogalert_survey_bitmap[character * 6 + column] =
				(uint16_t)(font5x7[text[character] - ' '][column]
					   << 2);
		}
	}
	frogalert_survey_columns = text_length * 6;
	frogalert_survey_offset = 0;
	frogalert_display_survey_step();
	return TRUE;
}

uint8_t frogalert_display_survey_count(uint8_t count, uint8_t saturated,
				       uint8_t phase)
{
	char text[FROGALERT_SURVEY_COUNT_LENGTH] = {
		'B',
		'T',
		' ',
		(char)('0' + ((count / 10) % 10)),
		(char)('0' + (count % 10)),
		' ',
		' ',
		(char)phase,
	};

	if (saturated)
		text[5] = '+';
	return frogalert_display_survey_text(
		text, FROGALERT_SURVEY_COUNT_LENGTH);
}

uint8_t frogalert_display_survey_message(const char *message,
					 uint8_t message_length)
{
	return frogalert_display_survey_text(message, message_length);
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

	if (!frogalert_survey_display_active())
		return;
	if (!frogalert_survey_display_owned) {
		stop_all_animation();
		frogalert_survey_display_owned = TRUE;
	}
	memset(fb, 0, sizeof(fb));
	frame &= 1;
	for (uint8_t frog = 0; frog < 3; frog++) {
		for (uint8_t column = 0; column < 9; column++)
			fb[starts[frog] + column] = frogs[frame][column];
	}
}

void frogalert_display_survey_step(void)
{
	if (!frogalert_survey_display_active()) {
		frogalert_display_survey_release();
		return;
	}
	if (frogalert_survey_columns == 0)
		return;

	if (!frogalert_survey_display_owned) {
		stop_all_animation();
		frogalert_survey_display_owned = TRUE;
	}
	for (uint8_t column = 0; column < LED_COLS; column++) {
		fb[column] = frogalert_survey_bitmap[
			(frogalert_survey_offset + column) %
			frogalert_survey_columns];
	}
	frogalert_survey_offset =
		(frogalert_survey_offset + 1) % frogalert_survey_columns;
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
    `	// Disable bitmap transition while in download mode
	btn_onOnePress(KEY2, NULL);

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
	btn_onOnePress(KEY2, frogalert_view_transition);
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
    `	btn_onOnePress(KEY1, change_mode);
#ifdef FROGALERT_SURVEY
	btn_onOnePress(KEY2, frogalert_view_transition);
#else
	btn_onOnePress(KEY2, bm_transition);
#endif
	btn_onLongPress(KEY1, change_brightness);`,
    "initial KEY2 virtual counter-view registration",
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
  const [peripheral, main, animation] = await Promise.all([
    readFile(peripheralPath, "utf8"),
    readFile(mainPath, "utf8"),
    readFile(animationPath, "utf8"),
  ]);
  await Promise.all([
    writeFile(peripheralPath, applyPeripheralHooks(peripheral), "utf8"),
    writeFile(mainPath, applyMainHooks(main), "utf8"),
    writeFile(animationPath, applyAnimationHooks(animation), "utf8"),
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
