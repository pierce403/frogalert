#include "frogalert-boot-status.h"

#include <stddef.h>
#include <string.h>

#define PROFILE_B1144C_250901_USB_C 1
#define PROFILE_B1144C_260404_USB_C 2

#define GLYPH_WIDTH 3U
#define GLYPH_HEIGHT 5U
#define GLYPH_STRIDE 4U

#define ADC_COUNTS 4096U
#define ADC_REFERENCE_MV 2100U
#define BATTERY_DIVIDER_HIGH_KOHM 182U
#define BATTERY_DIVIDER_LOW_KOHM 100U
#define BATTERY_EMPTY_MV 3300U
#define BATTERY_FULL_MV 4200U

_Static_assert(sizeof(FROGALERT_DISPLAY_VERSION) - 1U <= 10U,
	       "compact version plus profile marker exceeds 44 columns");

static const char full_version[] = FROGALERT_VERSION;
static const char display_version[] = FROGALERT_DISPLAY_VERSION;

typedef struct {
	char character;
	uint8_t rows[GLYPH_HEIGHT];
} glyph_t;

/* Three-bit rows, most significant bit first. This table is intentionally
 * private: BadgeMagic uploads and FrogAlert alerts retain FOSSASIA's 5x7
 * font, while only the two immutable boot cards use these compact glyphs. */
static const glyph_t glyphs[] = {
	{' ', {0, 0, 0, 0, 0}},
	{'%', {5, 1, 2, 4, 5}},
	{'.', {0, 0, 0, 0, 2}},
	{'0', {7, 5, 5, 5, 7}},
	{'1', {2, 6, 2, 2, 7}},
	{'2', {7, 1, 7, 4, 7}},
	{'3', {7, 1, 7, 1, 7}},
	{'4', {5, 5, 7, 1, 1}},
	{'5', {7, 4, 7, 1, 7}},
	{'6', {7, 4, 7, 5, 7}},
	{'7', {7, 1, 1, 1, 1}},
	{'8', {7, 5, 7, 5, 7}},
	{'9', {7, 5, 7, 1, 7}},
	{'A', {2, 5, 7, 5, 5}},
	{'F', {7, 4, 6, 4, 4}},
	{'I', {7, 2, 2, 2, 7}},
	{'O', {7, 5, 5, 5, 7}},
	{'S', {7, 4, 7, 1, 7}},
	{'V', {5, 5, 5, 5, 2}},
	{'a', {0, 3, 5, 5, 3}},
	{'b', {4, 4, 6, 5, 6}},
	{'r', {0, 0, 6, 4, 4}},
	{'v', {0, 5, 5, 5, 2}},
};

static const uint8_t *glyph_rows(char character)
{
	for (size_t index = 0; index < sizeof(glyphs) / sizeof(glyphs[0]);
	     index++) {
		if (glyphs[index].character == character)
			return glyphs[index].rows;
	}
	return glyphs[0].rows;
}

static uint8_t text_width(size_t length)
{
	if (!length)
		return 0;
	return (uint8_t)(length * GLYPH_STRIDE - 1U);
}

static void clear_frame(volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS])
{
	for (uint8_t column = 0; column < FROGALERT_BOOT_COLUMNS; column++)
		framebuffer[column] = 0;
}

static void draw_glyph(volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS],
		       char character, uint8_t column, uint8_t row)
{
	const uint8_t *rows = glyph_rows(character);

	for (uint8_t y = 0; y < GLYPH_HEIGHT; y++) {
		for (uint8_t x = 0; x < GLYPH_WIDTH; x++) {
			if (rows[y] & (1U << (GLYPH_WIDTH - x - 1U)))
				framebuffer[column + x] |= (uint16_t)(1U << (row + y));
		}
	}
}

static void draw_text(volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS],
		      const char *text, uint8_t column, uint8_t row)
{
	while (*text) {
		draw_glyph(framebuffer, *text, column, row);
		column = (uint8_t)(column + GLYPH_STRIDE);
		text++;
	}
}

static void draw_profile_marker(
				volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS],
				uint8_t column, uint8_t row)
{
#if FROGALERT_HARDWARE_PROFILE_ID == PROFILE_B1144C_260404_USB_C
	static const uint8_t marker[GLYPH_HEIGHT] = {2, 7, 2, 2, 2};
#elif FROGALERT_HARDWARE_PROFILE_ID == PROFILE_B1144C_250901_USB_C
	static const uint8_t marker[GLYPH_HEIGHT] = {2, 2, 2, 7, 2};
#else
#error "unsupported FrogAlert boot profile marker"
#endif

	for (uint8_t y = 0; y < GLYPH_HEIGHT; y++) {
		for (uint8_t x = 0; x < GLYPH_WIDTH; x++) {
			if (marker[y] & (1U << (GLYPH_WIDTH - x - 1U)))
				framebuffer[column + x] |= (uint16_t)(1U << (row + y));
		}
	}
}

const char *frogalert_boot_full_version(void)
{
	return full_version;
}

const char *frogalert_boot_display_version(void)
{
	return display_version;
}

frogalert_battery_reading_t frogalert_battery_from_raw(uint16_t raw)
{
	const uint32_t divider_denominator =
		ADC_COUNTS * BATTERY_DIVIDER_LOW_KOHM;
	uint32_t millivolts =
		(uint32_t)raw * ADC_REFERENCE_MV *
		(BATTERY_DIVIDER_HIGH_KOHM + BATTERY_DIVIDER_LOW_KOHM);
	frogalert_battery_reading_t reading;

	millivolts = (millivolts + divider_denominator / 2U) /
		     divider_denominator;
	reading.millivolts = (uint16_t)millivolts;
	if (millivolts <= BATTERY_EMPTY_MV) {
		reading.percent = 0;
	} else if (millivolts >= BATTERY_FULL_MV) {
		reading.percent = 100;
	} else {
		reading.percent = (uint8_t)(
			((millivolts - BATTERY_EMPTY_MV) * 100U +
			 (BATTERY_FULL_MV - BATTERY_EMPTY_MV) / 2U) /
			(BATTERY_FULL_MV - BATTERY_EMPTY_MV));
	}
	return reading;
}

void frogalert_boot_format_battery(
	char output[FROGALERT_BOOT_BATTERY_TEXT_CAPACITY],
	frogalert_battery_reading_t reading)
{
	uint16_t centivolts = (uint16_t)((reading.millivolts + 5U) / 10U);
	uint8_t index = 0;

	if (centivolts > 599U)
		centivolts = 599U;
	output[index++] = (char)('0' + centivolts / 100U);
	output[index++] = '.';
	output[index++] = (char)('0' + (centivolts / 10U) % 10U);
	output[index++] = (char)('0' + centivolts % 10U);
	output[index++] = 'V';
	output[index++] = ' ';
	if (reading.percent >= 100U) {
		output[index++] = '1';
		output[index++] = '0';
		output[index++] = '0';
	} else {
		if (reading.percent >= 10U)
			output[index++] = (char)('0' + reading.percent / 10U);
		output[index++] = (char)('0' + reading.percent % 10U);
	}
	output[index++] = '%';
	output[index] = '\0';
}

void frogalert_boot_render_credit(
	volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS])
{
	static const char credit[] = "FOSSASIA";
	const size_t version_length = sizeof(display_version) - 1U;
	const uint8_t version_width = text_width(version_length);
	const uint8_t marker_gap = 2U;
	const uint8_t status_width =
		(uint8_t)(version_width + marker_gap + GLYPH_WIDTH);
	const uint8_t status_start =
		(uint8_t)((FROGALERT_BOOT_COLUMNS - status_width) / 2U);

	clear_frame(framebuffer);
	draw_text(framebuffer, credit,
		  (uint8_t)((FROGALERT_BOOT_COLUMNS -
			     text_width(sizeof(credit) - 1U)) /
			    2U),
		  0);
	draw_text(framebuffer, display_version, status_start, 6);
	draw_profile_marker(framebuffer,
			    (uint8_t)(status_start + version_width + marker_gap),
			    6);
}

void frogalert_boot_render_battery(
	volatile uint16_t framebuffer[FROGALERT_BOOT_COLUMNS],
	frogalert_battery_reading_t reading)
{
	char text[FROGALERT_BOOT_BATTERY_TEXT_CAPACITY];
	size_t length;

	frogalert_boot_format_battery(text, reading);
	length = strlen(text);
	clear_frame(framebuffer);
	draw_text(framebuffer, text,
		  (uint8_t)((FROGALERT_BOOT_COLUMNS - text_width(length)) / 2U),
		  3);
}
