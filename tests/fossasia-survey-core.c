#include <assert.h>
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

	frogalert_survey_counter_reset(&counter);
	assert(counter.count == 0);
	assert(counter.saturated == 0);

	make_address(address, 7);
	frogalert_survey_counter_observe(&counter, address);
	frogalert_survey_counter_observe(&counter, address);
	assert(counter.count == 1);

	frogalert_survey_counter_reset(&counter);
	for (uint16_t value = 0; value < FROGALERT_SURVEY_MAX_DEVICES; value++) {
		make_address(address, value);
		frogalert_survey_counter_observe(&counter, address);
	}
	assert(counter.count == FROGALERT_SURVEY_MAX_DEVICES);
	assert(counter.saturated == 0);

	make_address(address, FROGALERT_SURVEY_MAX_DEVICES);
	frogalert_survey_counter_observe(&counter, address);
	assert(counter.count == FROGALERT_SURVEY_MAX_DEVICES);
	assert(counter.saturated == 1);

	frogalert_survey_counter_reset(&counter);
	assert(counter.count == 0);
	assert(counter.saturated == 0);
	for (uint16_t index = 0; index < sizeof(counter.addresses); index++)
		assert(((const uint8_t *)counter.addresses)[index] == 0);

	return 0;
}
