#ifndef FROGALERT_BOOT_STATUS_H
#define FROGALERT_BOOT_STATUS_H

#include <stdint.h>

#define FROGALERT_BOOT_COLUMNS 44U
#define FROGALERT_BOOT_ROWS 11U
#define FROGALERT_BOOT_BATTERY_TEXT_CAPACITY 11U

#ifndef FROGALERT_VERSION
#error "FROGALERT_VERSION must contain the exact semantic firmware version"
#endif

#ifndef FROGALERT_DISPLAY_VERSION
#error "FROGALERT_DISPLAY_VERSION must contain the validated compact version"
#endif

#ifndef FROGALERT_HARDWARE_PROFILE_ID
#error "FROGALERT_HARDWARE_PROFILE_ID must identify the compiled image"
#endif

typedef struct {
	uint16_t millivolts;
	uint8_t percent;
} frogalert_battery_reading_t;

const char *frogalert_boot_full_version(void);
const char *frogalert_boot_display_version(void);

frogalert_battery_reading_t frogalert_battery_from_raw(uint16_t raw);
void frogalert_boot_format_battery(
	char output[FROGALERT_BOOT_BATTERY_TEXT_CAPACITY],
	frogalert_battery_reading_t reading);
void frogalert_boot_render_credit(
	volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS]);
void frogalert_boot_render_battery(
	volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS],
	frogalert_battery_reading_t reading);

#endif
