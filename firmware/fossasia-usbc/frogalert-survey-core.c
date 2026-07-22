#include "frogalert-survey-core.h"

static uint8_t address_equal(const uint8_t left[6], const uint8_t right[6])
{
	for (uint8_t index = 0; index < FROGALERT_SURVEY_ADDRESS_BYTES; index++) {
		if (left[index] != right[index])
			return 0;
	}
	return 1;
}

void frogalert_survey_counter_reset(frogalert_survey_counter_t *counter)
{
	volatile uint8_t *bytes = (volatile uint8_t *)counter->addresses;

	for (uint16_t index = 0; index < sizeof(counter->addresses); index++)
		bytes[index] = 0;
	counter->count = 0;
	counter->saturated = 0;
}

void frogalert_survey_counter_observe(frogalert_survey_counter_t *counter,
				      const uint8_t address[6])
{
	for (uint8_t index = 0; index < counter->count; index++) {
		if (address_equal(counter->addresses[index], address))
			return;
	}

	if (counter->count >= FROGALERT_SURVEY_MAX_DEVICES) {
		counter->saturated = 1;
		return;
	}

	for (uint8_t index = 0; index < FROGALERT_SURVEY_ADDRESS_BYTES; index++)
		counter->addresses[counter->count][index] = address[index];
	counter->count++;
}
