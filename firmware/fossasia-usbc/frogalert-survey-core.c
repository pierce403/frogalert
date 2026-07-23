#include "frogalert-survey-core.h"

#define GAP_ADTYPE_LOCAL_NAME_SHORT    0x08
#define GAP_ADTYPE_LOCAL_NAME_COMPLETE 0x09
#define GAP_ADTYPE_16BIT_MORE          0x02
#define GAP_ADTYPE_16BIT_COMPLETE      0x03

typedef struct {
	const uint8_t *value;
	uint8_t length;
} local_name_t;

static uint8_t ascii_lower(uint8_t value)
{
	if (value >= 'A' && value <= 'Z')
		return (uint8_t)(value + ('a' - 'A'));
	return value;
}

static uint8_t ascii_contains(const uint8_t *value, uint8_t value_length,
			      const uint8_t *needle, uint8_t needle_length)
{
	if (!needle_length || value_length < needle_length)
		return 0;
	for (uint8_t offset = 0;
	     offset <= (uint8_t)(value_length - needle_length); offset++) {
		uint8_t matches = 1;

		for (uint8_t index = 0; index < needle_length; index++) {
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

static uint8_t ascii_equal_padded(const uint8_t *value, uint8_t value_length,
				  const uint8_t *expected,
				  uint8_t expected_length)
{
	if (!value)
		return 0;
	while (value_length && value[value_length - 1] == 0)
		value_length--;
	if (value_length != expected_length)
		return 0;
	for (uint8_t index = 0; index < expected_length; index++) {
		if (ascii_lower(value[index]) != expected[index])
			return 0;
	}
	return 1;
}

static uint8_t address_matches_oui(const uint8_t address[6],
				   const uint8_t prefix[3])
{
	/*
	 * WCH discovery reports store Bluetooth addresses least-significant
	 * byte first. Compare only the normalized public-address OUI bytes.
	 */
	return address && address[5] == prefix[0] &&
	       address[4] == prefix[1] && address[3] == prefix[2];
}

static frogalert_survey_alert_t classify_name(const uint8_t *name,
					      uint8_t name_length)
{
	static const uint8_t axon[] = "axon body";
	static const uint8_t taser[] = "taser";
	static const uint8_t flipper[] = "flipper";
	static const uint8_t badge_magic[] = "led badge magic";
	static const uint8_t ray_ban_dash[] = "ray-ban";
	static const uint8_t ray_ban_space[] = "ray ban";

	if (ascii_contains(name, name_length, axon, sizeof(axon) - 1) ||
	    ascii_contains(name, name_length, taser, sizeof(taser) - 1))
		return FROGALERT_ALERT_COP;
	if (ascii_contains(name, name_length, flipper,
			   sizeof(flipper) - 1))
		return FROGALERT_ALERT_FLIPPER;
	if (ascii_equal_padded(name, name_length, badge_magic,
			       sizeof(badge_magic) - 1))
		return FROGALERT_ALERT_FROG_DANCE;
	if (ascii_contains(name, name_length, ray_ban_dash,
			   sizeof(ray_ban_dash) - 1) ||
	    ascii_contains(name, name_length, ray_ban_space,
			   sizeof(ray_ban_space) - 1))
		return FROGALERT_ALERT_COP;
	return FROGALERT_ALERT_NONE;
}

static frogalert_survey_alert_t classify_advertisement(const uint8_t *data,
						       uint8_t data_length)
{
	local_name_t shortened = {0};
	local_name_t complete = {0};
	uint8_t badge_magic_service = 0;
	uint8_t offset = 0;

	if (!data)
		return FROGALERT_ALERT_NONE;
	while (offset < data_length) {
		uint8_t field_length = data[offset++];
		uint8_t remaining = (uint8_t)(data_length - offset);
		uint8_t field_type;
		local_name_t current;

		if (field_length == 0)
			break;
		if (field_length > remaining)
			return FROGALERT_ALERT_NONE;
		field_type = data[offset];
		current.value = &data[offset + 1];
		current.length = field_length > 1 ?
			(uint8_t)(field_length - 1) : 0;
		if (field_type == GAP_ADTYPE_LOCAL_NAME_COMPLETE)
			complete = current;
		else if (field_type == GAP_ADTYPE_LOCAL_NAME_SHORT)
			shortened = current;
		else if (field_type == GAP_ADTYPE_16BIT_MORE ||
			 field_type == GAP_ADTYPE_16BIT_COMPLETE) {
			for (uint8_t index = 0;
			     index + 1 < current.length; index += 2) {
				if (current.value[index] == 0xe0 &&
				    current.value[index + 1] == 0xfe)
					badge_magic_service = 1;
			}
		}
		offset = (uint8_t)(offset + field_length);
	}
	{
		frogalert_survey_alert_t named = classify_name(
			complete.value ? complete.value : shortened.value,
			complete.value ? complete.length : shortened.length);

		if (named != FROGALERT_ALERT_NONE)
			return named;
	}
	return badge_magic_service ?
		FROGALERT_ALERT_FROG_DANCE : FROGALERT_ALERT_NONE;
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

frogalert_survey_alert_t frogalert_survey_classify(
	const uint8_t address[6], uint8_t public_address, const uint8_t *data,
	uint8_t data_length)
{
	static const uint8_t axon_oui[3] = {0x00, 0x25, 0xdf};
	static const uint8_t flock_oui[3] = {0xb4, 0x1e, 0x52};

	if (public_address &&
	    (address_matches_oui(address, axon_oui) ||
	     address_matches_oui(address, flock_oui)))
		return FROGALERT_ALERT_COP;
	return classify_advertisement(data, data_length);
}
