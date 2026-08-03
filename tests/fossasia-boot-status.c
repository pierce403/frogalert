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

	assert(strcmp(frogalert_boot_full_version(), FROGALERT_VERSION) == 0);
	assert(strcmp(frogalert_boot_display_version(),
		      FROGALERT_DISPLAY_VERSION) == 0);
	frogalert_boot_render_credit(framebuffer);
	assert_frame_bounds(framebuffer);

	/* v0.2.0b1 occupies columns 4..34. Columns 35..36 are the gap and
	 * columns 37..39 are the compiled profile arrow. */
	assert((framebuffer[35] & 0x7c0U) == 0);
	assert((framebuffer[36] & 0x7c0U) == 0);
#if FROGALERT_HARDWARE_PROFILE_ID == 2
	assert(framebuffer[37] == 0x080);
	assert(framebuffer[38] == 0x7c0);
	assert(framebuffer[39] == 0x080);
#elif FROGALERT_HARDWARE_PROFILE_ID == 1
	assert(framebuffer[37] == 0x200);
	assert(framebuffer[38] == 0x7c0);
	assert(framebuffer[39] == 0x200);
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
