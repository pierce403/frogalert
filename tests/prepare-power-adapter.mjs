import {readFile, writeFile} from "node:fs/promises";
import {applyPowerHooks, applyButtonHooks} from "../scripts/apply-fossasia-survey.mjs";

const button = applyButtonHooks(await readFile("tests/fixtures/button-shell.c", "utf8"));
const wake = button.match(/void btn_configure_screen_off_wake\(void\)\n\{[\s\S]*?\n\}/)?.[0];
if (!wake) throw new Error("missing production wake configuration");
const power = applyPowerHooks(await readFile("tests/fixtures/power-shell.c", "utf8"));
const fixture = await readFile("tests/fossasia-power-adapter.c", "utf8");
await writeFile("tmp/c-tests/power-adapter.c", fixture.replace("/* PRODUCTION_POWER */", wake + "\n" + power));
