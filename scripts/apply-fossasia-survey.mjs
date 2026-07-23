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

void frogalert_display_survey_step(void)
{
	if (!frogalert_survey_allowed()) {
		frogalert_survey_display_owned = FALSE;
		return;
	}

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
  return result;
}

export async function applySurveyHooks(sourceDirectory) {
  const peripheralPath = path.join(sourceDirectory, "src/ble/peripheral.c");
  const mainPath = path.join(sourceDirectory, "src/main.c");
  const [peripheral, main] = await Promise.all([
    readFile(peripheralPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);
  await Promise.all([
    writeFile(peripheralPath, applyPeripheralHooks(peripheral), "utf8"),
    writeFile(mainPath, applyMainHooks(main), "utf8"),
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
