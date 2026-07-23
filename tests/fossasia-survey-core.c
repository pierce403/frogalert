#include <assert.h>
#include <stddef.h>
#include <stdint.h>

#include "frogalert-survey-core.h"

static void make_address(uint8_t address[6], uint16_t value)
{
	address[0] = (uint8_t)(value & 0xff);
	address[1] = (uint8_t)(value >> 8);
	address[2] = 0x22;
	address[3] = 0x33;
	address[4] = 0x44;
	address[5] = 0x55;
}

int main(void)
{
	frogalert_survey_counter_t counter;
	uint8_t address[6];
	static const uint8_t flipper_name[] = {
		2, 0x01, 0x06,
		16, 0x09, 'x', 'F', 'l', 'i', 'p', 'p', 'e', 'r', ' ',
		'M', 'a', 'r', 'l', 'i', 'n',
	};
	static const uint8_t short_name[] = {
		8, 0x08, 'F', 'L', 'I', 'P', 'P', 'E', 'R',
	};
	static const uint8_t unrelated_name[] = {
		11, 0x09, 'H', 'e', 'a', 'd', 'p', 'h', 'o', 'n', 'e', 's',
	};
	static const uint8_t truncated_name[] = {
		9, 0x09, 'F', 'l', 'i',
	};

	frogalert_survey_counter_reset(&counter);
	assert(counter.count == 0);
	assert(counter.saturated == 0);

	make_address(address, 7);
	assert(frogalert_survey_counter_observe(&counter, address) == 1);
	assert(frogalert_survey_counter_observe(&counter, address) == 0);
	assert(counter.count == 1);

	frogalert_survey_counter_reset(&counter);
	for (uint16_t value = 0; value < FROGALERT_SURVEY_MAX_DEVICES; value++) {
		make_address(address, value);
		assert(frogalert_survey_counter_observe(&counter, address) == 1);
	}
	assert(counter.count == FROGALERT_SURVEY_MAX_DEVICES);
	assert(counter.saturated == 0);

	make_address(address, FROGALERT_SURVEY_MAX_DEVICES);
	assert(frogalert_survey_counter_observe(&counter, address) == 1);
	assert(counter.count == FROGALERT_SURVEY_MAX_DEVICES);
	assert(counter.saturated == 1);

	frogalert_survey_counter_reset(&counter);
	assert(counter.count == 0);
	assert(counter.saturated == 0);
	for (uint16_t index = 0; index < sizeof(counter.addresses); index++)
		assert(((const uint8_t *)counter.addresses)[index] == 0);

	assert(frogalert_survey_has_flipper_name(
		       flipper_name, sizeof(flipper_name)) == 1);
	assert(frogalert_survey_has_flipper_name(
		       short_name, sizeof(short_name)) == 1);
	assert(frogalert_survey_has_flipper_name(
		       unrelated_name, sizeof(unrelated_name)) == 0);
	assert(frogalert_survey_has_flipper_name(
		       truncated_name, sizeof(truncated_name)) == 0);
	assert(frogalert_survey_has_flipper_name(NULL, 0) == 0);

	return 0;
}
