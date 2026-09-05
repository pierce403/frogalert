import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {access, mkdir, readFile, writeFile} from "node:fs/promises";

// Use the shipping SDK declarations, including BOOL timer returns and event
// layouts. Extract from the hash-checked archive rather than inventing a shim.
const {upstream} = JSON.parse(await readFile("firmware/fossasia-usbc/upstream-lock.json", "utf8"));
const archive = `tmp/fossasia-usbc/cache/${upstream.archive_file}`;
try { await access(archive); } catch {
  execFileSync("bash", ["scripts/prepare-fossasia-usbc", "--source-only"], {stdio: "inherit"});
}
assert.equal(createHash("sha256").update(await readFile(archive)).digest("hex"), upstream.archive_sha256);
const base = "tmp/c-tests/survey";
await mkdir(`${base}/ble`, {recursive: true});
for (const [source, target] of [
  ["CH5xx_ble_firmware_library/BLE/CH58xBLE_LIB.h", "ble/CH58xBLE_LIB.h"],
  ["src/ble/setup.h", "ble/setup.h"], ["src/font.h", "font.h"],
]) {
  await writeFile(`${base}/${target}`, execFileSync("tar", ["-xOzf", archive, `${upstream.extracted_directory}/${source}`]));
}
await writeFile(`${base}/debug.h`, "#define PRINT(...) ((void)0)\n");
await writeFile(`${base}/ble/frogalert-survey.c`, await readFile("firmware/fossasia-usbc/frogalert-survey.c"));
