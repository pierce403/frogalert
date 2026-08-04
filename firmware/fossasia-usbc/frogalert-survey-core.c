#include "frogalert-survey-core.h"

#define GAP_ADTYPE_LOCAL_NAME_SHORT    0x08
#define GAP_ADTYPE_LOCAL_NAME_COMPLETE 0x09
#define GAP_ADTYPE_16BIT_MORE          0x02
#define GAP_ADTYPE_16BIT_COMPLETE      0x03
#define GAP_ADTYPE_MANUFACTURER_SPECIFIC 0xff

#define FLIPPER_SERVICE_BLACK       0x3081
#define FLIPPER_SERVICE_WHITE       0x3082
#define FLIPPER_SERVICE_TRANSPARENT 0x3083

typedef struct {
	const uint8_t *value;
	uint8_t length;
} local_name_t;

typedef struct {
	local_name_t shortened;
	local_name_t complete;
	const uint8_t *data;
	uint8_t data_length;
} advertisement_t;

static uint8_t ascii_lower(uint8_t value)
{
	if (value >= 'A' && value <= 'Z')
		return (uint8_t)(value + ('a' - 'A'));
	return value;
}

static uint8_t ascii_contains(const uint8_t *value, uint8_t value_length,
			      const uint8_t *needle, uint8_t needle_length)
{
	if (!value || !needle_length || value_length < needle_length)
		return 0;
	for (uint8_t offset = 0;
	     offset <= (uint8_t)(value_length - needle_length); offset++) {
		uint8_t matches = 1;

		for (uint8_t index = 0; index < needle_length; index++) {
			if (ascii_lower(value[offset + index]) !=
			    ascii_lower(needle[index])) {
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
		if (ascii_lower(value[index]) != ascii_lower(expected[index]))
			return 0;
	}
	return 1;
}

static uint8_t ascii_starts_with(const uint8_t *value, uint8_t value_length,
				 const uint8_t *prefix,
				 uint8_t prefix_length)
{
	if (!value || value_length < prefix_length)
		return 0;
	for (uint8_t index = 0; index < prefix_length; index++) {
		if (ascii_lower(value[index]) != ascii_lower(prefix[index]))
			return 0;
	}
	return 1;
}

static uint8_t ascii_starts_with_value(const uint8_t *value,
				       uint8_t value_length,
				       const uint8_t *prefix,
				       uint8_t prefix_length)
{
	if (!ascii_starts_with(value, value_length, prefix, prefix_length) ||
	    value_length <= prefix_length)
		return 0;
	for (uint8_t index = prefix_length; index < value_length; index++) {
		if (value[index] != 0 && value[index] != ' ' &&
		    value[index] != '\t' && value[index] != '\r' &&
		    value[index] != '\n')
			return 1;
	}
	return 0;
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

static uint8_t hex_value(uint8_t value)
{
	if (value >= '0' && value <= '9')
		return (uint8_t)(value - '0');
	return (uint8_t)(value - 'A' + 10U);
}

static advertisement_t parse_advertisement(const uint8_t *data,
					    uint8_t data_length)
{
	advertisement_t advertisement = {
		.data = data,
		.data_length = data_length,
	};
	uint8_t offset = 0;

	if (!data)
		return advertisement;
	while (offset < data_length) {
		uint8_t field_length = data[offset++];
		uint8_t remaining = (uint8_t)(data_length - offset);
		uint8_t field_type;
		local_name_t current;

		if (field_length == 0)
			break;
		if (field_length > remaining) {
			advertisement.data = 0;
			advertisement.data_length = 0;
			advertisement.shortened.value = 0;
			advertisement.complete.value = 0;
			return advertisement;
		}
		field_type = data[offset];
		current.value = &data[offset + 1];
		current.length = field_length > 1 ?
			(uint8_t)(field_length - 1) : 0;
		if (field_type == GAP_ADTYPE_LOCAL_NAME_COMPLETE)
			advertisement.complete = current;
		else if (field_type == GAP_ADTYPE_LOCAL_NAME_SHORT)
			advertisement.shortened = current;
		offset = (uint8_t)(offset + field_length);
	}
	return advertisement;
}

static local_name_t advertisement_name(const advertisement_t *advertisement)
{
	return advertisement->complete.value ?
		advertisement->complete : advertisement->shortened;
}

static uint8_t advertisement_has_service(
	const advertisement_t *advertisement, uint16_t service)
{
	uint8_t offset = 0;

	if (!advertisement->data)
		return 0;
	while (offset < advertisement->data_length) {
		uint8_t field_length = advertisement->data[offset++];
		uint8_t remaining =
			(uint8_t)(advertisement->data_length - offset);
		uint8_t field_type;

		if (field_length == 0)
			break;
		if (field_length > remaining)
			return 0;
		field_type = advertisement->data[offset];
		if (field_type == GAP_ADTYPE_16BIT_MORE ||
		    field_type == GAP_ADTYPE_16BIT_COMPLETE) {
			if (((uint8_t)(field_length - 1U) & 1U) != 0U)
				return 0;
			for (uint8_t index = 1; index + 1 < field_length;
			     index += 2) {
				uint16_t current =
					(uint16_t)advertisement->data[offset + index] |
					((uint16_t)advertisement->data[
						offset + index + 1] << 8);
				if (current == service)
					return 1;
			}
		}
		offset = (uint8_t)(offset + field_length);
	}
	return 0;
}

static uint8_t advertisement_has_company(
	const advertisement_t *advertisement, uint16_t company)
{
	uint8_t offset = 0;

	if (!advertisement->data)
		return 0;
	while (offset < advertisement->data_length) {
		uint8_t field_length = advertisement->data[offset++];
		uint8_t remaining =
			(uint8_t)(advertisement->data_length - offset);
		uint8_t field_type;

		if (field_length == 0)
			break;
		if (field_length > remaining)
			return 0;
		field_type = advertisement->data[offset];
		if (field_type == GAP_ADTYPE_MANUFACTURER_SPECIFIC &&
		    field_length >= 3) {
			uint16_t current =
				(uint16_t)advertisement->data[offset + 1] |
				((uint16_t)advertisement->data[offset + 2] << 8);

			if (current == company)
				return 1;
		}
		offset = (uint8_t)(offset + field_length);
	}
	return 0;
}

static uint8_t custom_rule_matches(
	const frogalert_monitor_rule_t *rule, const uint8_t address[6],
	uint8_t public_address, const advertisement_t *advertisement)
{
	local_name_t name = advertisement_name(advertisement);

	switch (rule->type) {
	case FROGALERT_MATCH_NAME_CONTAINS:
		return ascii_contains(name.value, name.length, rule->value,
				      rule->value_length);
	case FROGALERT_MATCH_NAME_PREFIX:
		return ascii_starts_with(name.value, name.length, rule->value,
					 rule->value_length);
	case FROGALERT_MATCH_NAME_EXACT:
		return ascii_equal_padded(name.value, name.length, rule->value,
					  rule->value_length);
	case FROGALERT_MATCH_PUBLIC_OUI:
		if (public_address) {
			uint8_t oui[3] = {
				(uint8_t)((hex_value(rule->value[0]) << 4) |
					  hex_value(rule->value[1])),
				(uint8_t)((hex_value(rule->value[3]) << 4) |
					  hex_value(rule->value[4])),
				(uint8_t)((hex_value(rule->value[6]) << 4) |
					  hex_value(rule->value[7])),
			};
			return address_matches_oui(address, oui);
		}
		return 0;
	case FROGALERT_MATCH_SERVICE16: {
		uint16_t service =
			(uint16_t)(hex_value(rule->value[0]) << 12) |
			(uint16_t)(hex_value(rule->value[1]) << 8) |
			(uint16_t)(hex_value(rule->value[2]) << 4) |
			hex_value(rule->value[3]);
		return advertisement_has_service(
			advertisement, service);
	}
	default:
		return 0;
	}
}

static frogalert_survey_alert_t classify_builtins(
	uint32_t targets, const uint8_t address[6], uint8_t public_address,
	const advertisement_t *advertisement)
{
	static const uint8_t axon_oui[3] = {0x00, 0x25, 0xdf};
	static const uint8_t flock_oui[3] = {0xb4, 0x1e, 0x52};
	static const uint8_t axon[] = "axon body";
	static const uint8_t taser[] = "taser";
	static const uint8_t flipper[] = "flipper";
	static const uint8_t karr_prefix[] = "qt ";
	static const uint8_t badge_magic[] = "led badge magic";
	static const uint8_t ray_ban_dash[] = "ray-ban";
	static const uint8_t ray_ban_space[] = "ray ban";
	local_name_t name = advertisement_name(advertisement);

	if ((targets & FROGALERT_TARGET_BADGEMAGIC) &&
	    (ascii_equal_padded(name.value, name.length, badge_magic,
				sizeof(badge_magic) - 1) ||
	     advertisement_has_service(advertisement, 0xfee0)))
		return FROGALERT_ALERT_FROG_DANCE;
	if ((targets & FROGALERT_TARGET_KARR) &&
	    ascii_starts_with_value(name.value, name.length, karr_prefix,
				    sizeof(karr_prefix) - 1))
		return FROGALERT_ALERT_KARR;
	if ((targets & FROGALERT_TARGET_POLICE) &&
	    ((public_address &&
	      (address_matches_oui(address, axon_oui) ||
	       address_matches_oui(address, flock_oui))) ||
	     ascii_contains(name.value, name.length, axon, sizeof(axon) - 1) ||
	     ascii_contains(name.value, name.length, taser, sizeof(taser) - 1)))
		return FROGALERT_ALERT_COP;
	if ((targets & FROGALERT_TARGET_RAY_BAN) &&
	    ((advertisement_has_company(advertisement, 0x01ab) &&
	      advertisement_has_service(advertisement, 0xfd5f)) ||
	     ascii_contains(name.value, name.length, ray_ban_dash,
			    sizeof(ray_ban_dash) - 1) ||
	     ascii_contains(name.value, name.length, ray_ban_space,
			    sizeof(ray_ban_space) - 1)))
		return FROGALERT_ALERT_COP;
	if ((targets & FROGALERT_TARGET_FLIPPER) &&
	    (ascii_contains(name.value, name.length, flipper,
			    sizeof(flipper) - 1) ||
	     advertisement_has_service(advertisement, FLIPPER_SERVICE_BLACK) ||
	     advertisement_has_service(advertisement, FLIPPER_SERVICE_WHITE) ||
	     advertisement_has_service(advertisement,
			       FLIPPER_SERVICE_TRANSPARENT)))
		return FROGALERT_ALERT_FLIPPER;
	return FROGALERT_ALERT_NONE;
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

void frogalert_survey_classify(
	const frogalert_monitor_config_t *config, const uint8_t address[6],
	uint8_t public_address, const uint8_t *data, uint8_t data_length,
	frogalert_survey_match_t *match)
{
	advertisement_t advertisement;

	if (!match)
		return;
	match->alert = FROGALERT_ALERT_NONE;
	match->message = 0;
	match->message_length = 0;
	if (!config)
		return;

	advertisement = parse_advertisement(data, data_length);
	match->alert = classify_builtins(config->builtin_targets, address,
					 public_address, &advertisement);
	if (match->alert != FROGALERT_ALERT_NONE)
		return;
	for (uint8_t index = 0; index < config->custom_rule_count; index++) {
		const frogalert_monitor_rule_t *rule =
			&config->custom_rules[index];

		if (custom_rule_matches(rule, address, public_address,
					&advertisement)) {
			match->alert = FROGALERT_ALERT_CUSTOM;
			match->message = rule->message;
			match->message_length = rule->message_length;
			return;
		}
	}
}
