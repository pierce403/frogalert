#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

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

static frogalert_survey_match_t classify_match(
	const frogalert_monitor_config_t *config, const uint8_t address[6],
	uint8_t public_address, const uint8_t *data, uint8_t data_length)
{
	frogalert_survey_match_t match;

	frogalert_survey_classify(config, address, public_address, data,
				  data_length, &match);
	return match;
}

static frogalert_survey_alert_t classify(
	const uint8_t address[6], uint8_t public_address, const uint8_t *data,
	uint8_t data_length)
{
	static const frogalert_monitor_config_t config = {
		.builtin_targets = FROGALERT_TARGET_ALL,
	};

	return classify_match(&config, address, public_address, data,
			      data_length).alert;
}

int main(void)
{
	frogalert_survey_counter_t counter;
	uint8_t address[6];
	static const uint8_t axon_name[] = {
		12, 0x09, 'A', 'x', 'o', 'n', ' ', 'B', 'o', 'd', 'y', ' ', '4',
	};
	static const uint8_t taser_name[] = {
		9, 0x09, 'm', 'y', ' ', 'T', 'A', 'S', 'E', 'R',
	};
	static const uint8_t flipper_name[] = {
		2, 0x01, 0x06,
		16, 0x09, 'x', 'F', 'l', 'i', 'p', 'p', 'e', 'r', ' ',
		'M', 'a', 'r', 'l', 'i', 'n',
	};
	static const uint8_t short_flipper_name[] = {
		8, 0x08, 'F', 'L', 'I', 'P', 'P', 'E', 'R',
	};
	static const uint8_t karr_name[] = {
		11, 0x09, 'Q', 'T', ' ', '1', '2', '3', '4', '5', '6', '7',
	};
	static const uint8_t short_karr_name[] = {
		9, 0x08, 'q', 't', ' ', 'S', 'N', '-', '4', '2',
	};
	static const uint8_t empty_karr_name[] = {
		4, 0x09, 'Q', 'T', ' ',
	};
	static const uint8_t containing_karr_name[] = {
		13, 0x09, 'M', 'y', ' ', 'Q', 'T', ' ', '1', '2', '3', '4',
		'5', '6',
	};
	static const uint8_t badge_magic_name[] = {
		16, 0x09, 'L', 'E', 'D', ' ', 'B', 'a', 'd', 'g', 'e', ' ',
		'M', 'a', 'g', 'i', 'c',
	};
	static const uint8_t padded_badge_magic_name[] = {
		18, 0x09, 'L', 'E', 'D', ' ', 'B', 'a', 'd', 'g', 'e', ' ',
		'M', 'a', 'g', 'i', 'c', 0, 0,
	};
	static const uint8_t containing_badge_magic_name[] = {
		19, 0x09, 'M', 'y', ' ', 'L', 'E', 'D', ' ', 'B', 'a', 'd',
		'g', 'e', ' ', 'M', 'a', 'g', 'i', 'c',
	};
	static const uint8_t badge_magic_service[] = {
		2, 0x01, 0x06,
		3, 0x02, 0xe0, 0xfe,
	};
	static const uint8_t badge_magic_complete_service[] = {
		3, 0x03, 0xe0, 0xfe,
	};
	static const uint8_t badge_magic_flipper[] = {
		3, 0x02, 0xe0, 0xfe,
		8, 0x09, 'F', 'l', 'i', 'p', 'p', 'e', 'r',
	};
	static const uint8_t ray_ban_dash_name[] = {
		13, 0x09, 'R', 'a', 'Y', '-', 'B', 'a', 'N', ' ', 'M', 'e', 't',
		'a',
	};
	static const uint8_t ray_ban_space_name[] = {
		13, 0x09, 'R', 'A', 'Y', ' ', 'B', 'A', 'N', ' ', 'M', 'e', 't',
		'a',
	};
	static const uint8_t meta_glasses_passive[] = {
		2, 0x01, 0x06,
		3, 0x03, 0x5f, 0xfd,
		5, 0xff, 0xab, 0x01, 0x12, 0x34,
	};
	static const uint8_t meta_company_only[] = {
		5, 0xff, 0xab, 0x01, 0x12, 0x34,
	};
	static const uint8_t meta_service_only[] = {
		3, 0x03, 0x5f, 0xfd,
	};
	static const uint8_t wrong_company_meta_service[] = {
		3, 0x03, 0x5f, 0xfd,
		5, 0xff, 0x53, 0x0d, 0x12, 0x34,
	};
	static const uint8_t meta_company_wrong_service[] = {
		3, 0x03, 0xb7, 0xfe,
		5, 0xff, 0xab, 0x01, 0x12, 0x34,
	};
	static const uint8_t unrelated_name[] = {
		11, 0x09, 'H', 'e', 'a', 'd', 'p', 'h', 'o', 'n', 'e', 's',
	};
	static const uint8_t truncated_name[] = {
		9, 0x09, 'F', 'l', 'i',
	};
	static const uint8_t complete_name_wins[] = {
		8, 0x08, 'F', 'l', 'i', 'p', 'p', 'e', 'r',
		11, 0x09, 'H', 'e', 'a', 'd', 'p', 'h', 'o', 'n', 'e', 's',
	};
	static const uint8_t axon_address[6] = {
		0x56, 0x34, 0x12, 0xdf, 0x25, 0x00,
	};
	static const uint8_t flock_address[6] = {
		0x56, 0x34, 0x12, 0x52, 0x1e, 0xb4,
	};
	static const uint8_t display_order_false_positive[6] = {
		0x00, 0x25, 0xdf, 0x12, 0x34, 0x56,
	};
	static const uint8_t unrelated_address[6] = {
		0x06, 0x05, 0x04, 0x03, 0x02, 0x01,
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

	assert(classify(
		       unrelated_address, 0, axon_name, sizeof(axon_name)) ==
	       FROGALERT_ALERT_COP);
	assert(classify(
		       unrelated_address, 0, taser_name, sizeof(taser_name)) ==
	       FROGALERT_ALERT_COP);
	assert(classify(unrelated_address, 0, flipper_name,
					 sizeof(flipper_name)) ==
	       FROGALERT_ALERT_FLIPPER);
	assert(classify(
		       unrelated_address, 0, short_flipper_name,
		       sizeof(short_flipper_name)) == FROGALERT_ALERT_FLIPPER);
	assert(classify(
		       unrelated_address, 0, karr_name, sizeof(karr_name)) ==
	       FROGALERT_ALERT_KARR);
	assert(classify(
		       unrelated_address, 0, short_karr_name,
		       sizeof(short_karr_name)) == FROGALERT_ALERT_KARR);
	assert(classify(
		       unrelated_address, 0, empty_karr_name,
		       sizeof(empty_karr_name)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, containing_karr_name,
		       sizeof(containing_karr_name)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, badge_magic_name,
		       sizeof(badge_magic_name)) == FROGALERT_ALERT_FROG_DANCE);
	assert(classify(
		       unrelated_address, 0, padded_badge_magic_name,
		       sizeof(padded_badge_magic_name)) ==
	       FROGALERT_ALERT_FROG_DANCE);
	assert(classify(
		       unrelated_address, 0, containing_badge_magic_name,
		       sizeof(containing_badge_magic_name)) ==
	       FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, badge_magic_service,
		       sizeof(badge_magic_service)) ==
	       FROGALERT_ALERT_FROG_DANCE);
	assert(classify(
		       unrelated_address, 0, badge_magic_complete_service,
		       sizeof(badge_magic_complete_service)) ==
	       FROGALERT_ALERT_FROG_DANCE);
	assert(classify(
		       axon_address, 1, badge_magic_flipper,
		       sizeof(badge_magic_flipper)) ==
	       FROGALERT_ALERT_FROG_DANCE);
	assert(classify(
		       unrelated_address, 0, ray_ban_dash_name,
		       sizeof(ray_ban_dash_name)) == FROGALERT_ALERT_COP);
	assert(classify(
		       unrelated_address, 0, ray_ban_space_name,
		       sizeof(ray_ban_space_name)) == FROGALERT_ALERT_COP);
	assert(classify(
		       unrelated_address, 0, meta_glasses_passive,
		       sizeof(meta_glasses_passive)) == FROGALERT_ALERT_COP);
	assert(classify(
		       unrelated_address, 0, meta_company_only,
		       sizeof(meta_company_only)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, meta_service_only,
		       sizeof(meta_service_only)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, wrong_company_meta_service,
		       sizeof(wrong_company_meta_service)) ==
	       FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, meta_company_wrong_service,
		       sizeof(meta_company_wrong_service)) ==
	       FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, unrelated_name,
		       sizeof(unrelated_name)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, truncated_name,
		       sizeof(truncated_name)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, complete_name_wins,
		       sizeof(complete_name_wins)) == FROGALERT_ALERT_NONE);
	assert(classify(
		       unrelated_address, 0, NULL, 0) == FROGALERT_ALERT_NONE);

	assert(classify(axon_address, 1, NULL, 0) ==
	       FROGALERT_ALERT_COP);
	assert(classify(flock_address, 1, NULL, 0) ==
	       FROGALERT_ALERT_COP);
	assert(classify(axon_address, 0, NULL, 0) ==
	       FROGALERT_ALERT_NONE);
	assert(classify(flock_address, 0, NULL, 0) ==
	       FROGALERT_ALERT_NONE);
	assert(classify(
		       display_order_false_positive, 1, NULL, 0) ==
	       FROGALERT_ALERT_NONE);
	assert(classify(
		       axon_address, 1, flipper_name, sizeof(flipper_name)) ==
	       FROGALERT_ALERT_COP);

	{
		frogalert_monitor_config_t config = {
			.builtin_targets = FROGALERT_TARGET_FLIPPER,
		};
		frogalert_survey_match_t match;
		static const uint8_t custom_value[] = "phone";
		static const uint8_t custom_message[] = "MY TARGET";

		assert(classify_match(&config, axon_address, 1, NULL, 0).alert ==
		       FROGALERT_ALERT_NONE);
		assert(classify_match(&config, unrelated_address, 0,
				      flipper_name, sizeof(flipper_name)).alert ==
		       FROGALERT_ALERT_FLIPPER);
		assert(classify_match(&config, unrelated_address, 0,
				      meta_glasses_passive,
				      sizeof(meta_glasses_passive)).alert ==
		       FROGALERT_ALERT_NONE);

		config.custom_rule_count = 1;
		config.custom_rules[0].type = FROGALERT_MATCH_NAME_CONTAINS;
		config.custom_rules[0].value_length =
			(uint8_t)(sizeof(custom_value) - 1);
		config.custom_rules[0].message_length =
			(uint8_t)(sizeof(custom_message) - 1);
		memcpy(config.custom_rules[0].value, custom_value,
		       sizeof(custom_value) - 1);
		memcpy(config.custom_rules[0].message, custom_message,
		       sizeof(custom_message) - 1);
		match = classify_match(&config, unrelated_address, 0,
				       unrelated_name, sizeof(unrelated_name));
		assert(match.alert == FROGALERT_ALERT_CUSTOM);
		assert(match.message_length == sizeof(custom_message) - 1);
		assert(memcmp(match.message, custom_message,
			      sizeof(custom_message) - 1) == 0);

		memset(&config.custom_rules[0], 0,
		       sizeof(config.custom_rules[0]));
		config.custom_rules[0].type = FROGALERT_MATCH_PUBLIC_OUI;
		config.custom_rules[0].value_length = 8;
		config.custom_rules[0].message_length = 3;
		memcpy(config.custom_rules[0].value, "00:25:DF", 8);
		memcpy(config.custom_rules[0].message, "OUI", 3);
		assert(classify_match(&config, axon_address, 1, NULL, 0).alert ==
		       FROGALERT_ALERT_CUSTOM);
		assert(classify_match(&config, axon_address, 0, NULL, 0).alert ==
		       FROGALERT_ALERT_NONE);

		memset(&config.custom_rules[0], 0,
		       sizeof(config.custom_rules[0]));
		config.custom_rules[0].type = FROGALERT_MATCH_SERVICE16;
		config.custom_rules[0].value_length = 4;
		config.custom_rules[0].message_length = 3;
		memcpy(config.custom_rules[0].value, "FEE0", 4);
		memcpy(config.custom_rules[0].message, "SVC", 3);
		assert(classify_match(&config, unrelated_address, 0,
				      badge_magic_service,
				      sizeof(badge_magic_service)).alert ==
		       FROGALERT_ALERT_CUSTOM);
	}

	return 0;
}
