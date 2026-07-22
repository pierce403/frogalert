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
uint8_t frogalert_survey_allowed(void)
{
	return mode == NORMAL && !streaming_enabled;
}

uint8_t frogalert_display_survey_count(uint8_t count, uint8_t saturated)
{
	char text[7] = {
		'B',
		'T',
		' ',
		(char)('0' + ((count / 10) % 10)),
		(char)('0' + (count % 10)),
		'\\0',
		'\\0',
	};

	if (!frogalert_survey_allowed())
		return FALSE;
	if (saturated) {
		text[5] = '+';
		text[6] = '\\0';
	}

	stop_all_animation();
	memset((void *)fb, 0, sizeof(fb));
	fb_puts(text, saturated ? 6 : 5, 4, 2);
	return TRUE;
}

void frogalert_display_survey_end(void)
{
	if (frogalert_survey_allowed())
		mode_setup_normal();
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
