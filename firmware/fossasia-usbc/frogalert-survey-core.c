#include "frogalert-survey-core.h"

#define GAP_ADTYPE_LOCAL_NAME_SHORT    0x08
#define GAP_ADTYPE_LOCAL_NAME_COMPLETE 0x09

static uint8_t ascii_lower(uint8_t value)
{
	if (value >= 'A' && value <= 'Z')
		return (uint8_t)(value + ('a' - 'A'));
	return value;
}

static uint8_t contains_flipper(const uint8_t *value, uint8_t value_length)
{
	static const uint8_t needle[] = "flipper";

	if (value_length < sizeof(needle) - 1)
		return 0;
	for (uint8_t offset = 0;
	     offset <= value_length - (sizeof(needle) - 1); offset++) {
		uint8_t matches = 1;

		for (uint8_t index = 0; index < sizeof(needle) - 1; index++) {
			if (ascii_lower(value[offset + index]) != needle[index]) {
				matches = 0;
				break;
			}
		}
		if (matches)
			return 1;
	}
	return 0;
}

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

uint8_t frogalert_survey_counter_observe(frogalert_survey_counter_t *counter,
					 const uint8_t address[6])
{
	for (uint8_t index = 0; index < counter->count; index++) {
		if (address_equal(counter->addresses[index], address))
			return 0;
	}

	if (counter->count >= FROGALERT_SURVEY_MAX_DEVICES) {
		if (counter->saturated)
			return 0;
		counter->saturated = 1;
		return 1;
	}

	for (uint8_t index = 0; index < FROGALERT_SURVEY_ADDRESS_BYTES; index++)
		counter->addresses[counter->count][index] = address[index];
	counter->count++;
	return 1;
}

uint8_t frogalert_survey_has_flipper_name(const uint8_t *data,
					  uint8_t data_length)
{
	uint8_t offset = 0;

	if (!data)
		return 0;
	while (offset < data_length) {
		uint8_t field_length = data[offset++];
		uint8_t remaining = (uint8_t)(data_length - offset);

		if (field_length == 0)
			break;
		if (field_length > remaining)
			return 0;
		if (field_length > 1 &&
		    (data[offset] == GAP_ADTYPE_LOCAL_NAME_SHORT ||
		     data[offset] == GAP_ADTYPE_LOCAL_NAME_COMPLETE) &&
		    contains_flipper(&data[offset + 1],
				     (uint8_t)(field_length - 1)))
			return 1;
		offset = (uint8_t)(offset + field_length);
	}
	return 0;
}
