import {readFile, writeFile, mkdir} from "node:fs/promises";
import {applyLegacyTransferHooks} from "../scripts/apply-fossasia-survey.mjs";

// Pinned-source shape: the transformer replaces this entire function. The test
// compiles the resulting receiver, with only hardware calls and allocation mocked.
const original = `#include "data.h"
int legacy_ble_rx(uint8_t *val, uint16_t len)
{
static uint16_t c, data_len, n;
memcpy(data + c * len, val, len);
data = realloc(data, data_len);
data_flatSave(data, data_len);
}
int legacy_usb_rx(uint8_t *buf, uint16_t len)`;
const receiver = applyLegacyTransferHooks(original)
  .split("\nint legacy_usb_rx")[0].replace(/^#include.*\n/gm, "");
const fixture = await readFile("tests/fossasia-legacy-adapter.c", "utf8");
await mkdir("tmp/c-tests", {recursive:true});
await writeFile("tmp/c-tests/legacy-adapter.c", fixture.replace("/* INSERT_PRODUCTION_RECEIVER */", receiver));
