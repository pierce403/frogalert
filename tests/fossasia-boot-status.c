#include "frogalert-boot-status.h"

#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static void assert_frame_bounds(const uint16_t framebuffer[FROGALERT_BOOT_COLUMNS])
{
	uint8_t nonzero = 0;

	for (uint8_t column = 0; column < FROGALERT_BOOT_COLUMNS; column++) {
		assert((framebuffer[column] & ~0x7ffU) == 0);
		if (framebuffer[column])
			nonzero = 1;
	}
	assert(nonzero);
}

static void test_battery_conversion(void)
{
	frogalert_battery_reading_t reading;
	char text[FROGALERT_BOOT_BATTERY_TEXT_CAPACITY];

	reading = frogalert_battery_from_raw(0);
	assert(reading.millivolts == 0);
	assert(reading.percent == 0);

	reading = frogalert_battery_from_raw(2288);
	assert(reading.millivolts >= 3300 && reading.millivolts <= 3310);
	assert(reading.percent <= 1);

	reading = frogalert_battery_from_raw(2594);
	assert(reading.millivolts >= 3745 && reading.millivolts <= 3755);
	assert(reading.percent == 50);
	frogalert_boot_format_battery(text, reading);
	assert(strcmp(text, "3.75V 50%") == 0);

	reading = frogalert_battery_from_raw(4095);
	assert(reading.millivolts >= 5915 && reading.millivolts <= 5925);
	assert(reading.percent == 100);
	frogalert_boot_format_battery(text, reading);
	assert(strcmp(text, "5.92V 100%") == 0);
}

static void test_credit_and_profile_marker(void)
{
	uint16_t framebuffer[FROGALERT_BOOT_COLUMNS];
	const size_t version_length = strlen(FROGALERT_DISPLAY_VERSION);
	const uint8_t version_width =
		(uint8_t)(version_length ? version_length * 4U - 1U : 0U);
	const uint8_t marker_column =
		(uint8_t)((FROGALERT_BOOT_COLUMNS - (version_width + 5U)) / 2U +
			  version_width + 2U);

	assert(strcmp(frogalert_boot_full_version(), FROGALERT_VERSION) == 0);
	assert(strcmp(frogalert_boot_display_version(),
		      FROGALERT_DISPLAY_VERSION) == 0);
	frogalert_boot_render_credit(framebuffer);
	assert_frame_bounds(framebuffer);

	/* The two-column gap and three-column marker follow the centered compact
	 * version, including short stable versions whose columns overlap the credit above. */
	assert(marker_column >= 2U);
	assert(marker_column + 2U < FROGALERT_BOOT_COLUMNS);
	assert((framebuffer[marker_column - 2U] & 0x7c0U) == 0);
	assert((framebuffer[marker_column - 1U] & 0x7c0U) == 0);
#if FROGALERT_HARDWARE_PROFILE_ID == 2
	assert((framebuffer[marker_column] & 0x7c0U) == 0x080);
	assert((framebuffer[marker_column + 1U] & 0x7c0U) == 0x7c0);
	assert((framebuffer[marker_column + 2U] & 0x7c0U) == 0x080);
#elif FROGALERT_HARDWARE_PROFILE_ID == 1
	assert((framebuffer[marker_column] & 0x7c0U) == 0x200);
	assert((framebuffer[marker_column + 1U] & 0x7c0U) == 0x7c0);
	assert((framebuffer[marker_column + 2U] & 0x7c0U) == 0x200);
#else
#error "test requires a supported FrogAlert hardware profile"
#endif
}

static void test_battery_frame(void)
{
	uint16_t framebuffer[FROGALERT_BOOT_COLUMNS];
	frogalert_battery_reading_t reading = {
		.millivolts = 3920,
		.percent = 69,
	};

	frogalert_boot_render_battery(framebuffer, reading);
	assert_frame_bounds(framebuffer);
	for (uint8_t column = 0; column < FROGALERT_BOOT_COLUMNS; column++) {
		/* The centered 3x5 battery line occupies rows 3..7 only. */
		assert((framebuffer[column] & ~0x0f8U) == 0);
	}
}

int main(void)
{
	test_battery_conversion();
	test_credit_and_profile_marker();
	test_battery_frame();
	puts("FrogAlert compact boot status tests passed");
	return 0;
}
