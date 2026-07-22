/*
 * Build-only identity canary for the first FrogAlert/FOSSASIA integration.
 *
 * This translation unit deliberately owns no startup, vector, interrupt,
 * GPIO, timer, USB, BLE, display, button, power, or flash behavior. The
 * companion make overlay retains this string in the linked image so tooling
 * can distinguish a canary build from the byte-identical upstream baseline.
 */
__attribute__((used, section(".rodata.frogalert")))
const char frogalert_build_canary[] =
    "FROGALERT:FOSSASIA-USB-C-BASE:9ce885d682b5c56c3ac7595c09e009a210885221:UNVERIFIED";
