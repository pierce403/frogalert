#include "frogalert-monitor-config.h"

#ifndef FROGALERT_HARDWARE_PROFILE_ID
#error "FROGALERT_HARDWARE_PROFILE_ID must name the exact compiled board profile"
#endif

#if FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_250901_USB_C
#define FROGALERT_DEFAULT_CONFIG_CRC32 0xcf53a631UL
#elif FROGALERT_HARDWARE_PROFILE_ID == FROGALERT_PROFILE_B1144C_260404_USB_C
#define FROGALERT_DEFAULT_CONFIG_CRC32 0x387328ceUL
#else
#error "unsupported FrogAlert hardware profile id"
#endif

__attribute__((used, aligned(4), section(".rodata.frogalert_config")))
const frogalert_monitor_config_t frogalert_monitor_config = {
	.magic = {
		'F', 'R', 'O', 'G', 'A', 'L', 'E', 'R',
		'T', 'C', 'F', 'G', 'v', '1', 0, 0,
	},
	.schema_version = FROGALERT_MONITOR_CONFIG_SCHEMA,
	.struct_size = FROGALERT_MONITOR_CONFIG_SIZE,
	.hardware_profile = FROGALERT_HARDWARE_PROFILE_ID,
	.custom_rule_count = 0,
	.reserved = 0,
	.builtin_targets = FROGALERT_TARGET_ALL,
	.crc32 = FROGALERT_DEFAULT_CONFIG_CRC32,
	.custom_rules = {{0}},
};

static uint8_t bytes_are_zero(const uint8_t *bytes, uint16_t length)
{
	for (uint16_t index = 0; index < length; index++) {
		if (bytes[index] != 0)
			return 0;
	}
	return 1;
}

static uint8_t bytes_are_printable(const uint8_t *bytes, uint8_t length)
{
	for (uint8_t index = 0; index < length; index++) {
		if (bytes[index] < ' ' || bytes[index] > '~')
			return 0;
	}
	return 1;
}

static uint8_t is_hex(uint8_t value)
{
	return (value >= '0' && value <= '9') ||
	       (value >= 'A' && value <= 'F');
}

static uint32_t config_crc32(const frogalert_monitor_config_t *config)
{
	const uint8_t *bytes = (const uint8_t *)config;
	uint32_t crc = 0xffffffffUL;

	for (uint16_t index = 0; index < FROGALERT_MONITOR_CONFIG_SIZE; index++) {
		uint8_t value = index >= 28U && index < 32U ? 0 : bytes[index];

		crc ^= value;
		for (uint8_t bit = 0; bit < 8; bit++) {
			uint32_t mask = (uint32_t)(-(int32_t)(crc & 1U));
			crc = (crc >> 1) ^ (0xedb88320UL & mask);
		}
	}
	return crc ^ 0xffffffffUL;
}

static uint8_t valid_rule(const frogalert_monitor_rule_t *rule)
{
	if (rule->type < FROGALERT_MATCH_NAME_CONTAINS ||
	    rule->type > FROGALERT_MATCH_SERVICE16 ||
	    rule->value_length == 0 ||
	    rule->value_length > FROGALERT_MONITOR_VALUE_MAX ||
	    rule->message_length == 0 ||
	    rule->message_length > FROGALERT_MONITOR_MESSAGE_MAX ||
	    rule->reserved != 0)
		return 0;
	if (!bytes_are_printable(rule->message, rule->message_length) ||
	    !bytes_are_zero(&rule->message[rule->message_length],
			    FROGALERT_MONITOR_MESSAGE_MAX -
			    rule->message_length) ||
	    !bytes_are_zero(&rule->value[rule->value_length],
			    FROGALERT_MONITOR_VALUE_MAX -
			    rule->value_length))
		return 0;

	if (rule->type <= FROGALERT_MATCH_NAME_EXACT)
		return bytes_are_printable(rule->value, rule->value_length);
	if (rule->type == FROGALERT_MATCH_PUBLIC_OUI) {
		return rule->value_length == 8 &&
		       is_hex(rule->value[0]) && is_hex(rule->value[1]) &&
		       rule->value[2] == ':' &&
		       is_hex(rule->value[3]) && is_hex(rule->value[4]) &&
		       rule->value[5] == ':' &&
		       is_hex(rule->value[6]) && is_hex(rule->value[7]);
	}
	return rule->value_length == 4 &&
	       is_hex(rule->value[0]) && is_hex(rule->value[1]) &&
	       is_hex(rule->value[2]) && is_hex(rule->value[3]);
}

uint8_t frogalert_monitor_config_validate(
	const frogalert_monitor_config_t *config, uint8_t expected_profile)
{
	if (!config)
		return 0;
	if (config->magic[0] != 'F' || config->magic[1] != 'R' ||
	    config->magic[2] != 'O' || config->magic[3] != 'G' ||
	    config->magic[4] != 'A' || config->magic[5] != 'L' ||
	    config->magic[6] != 'E' || config->magic[7] != 'R' ||
	    config->magic[8] != 'T' || config->magic[9] != 'C' ||
	    config->magic[10] != 'F' || config->magic[11] != 'G' ||
	    config->magic[12] != 'v' || config->magic[13] != '1' ||
	    config->magic[14] != 0 || config->magic[15] != 0)
		return 0;
	if (config->schema_version != FROGALERT_MONITOR_CONFIG_SCHEMA ||
	    config->struct_size != FROGALERT_MONITOR_CONFIG_SIZE ||
	    config->hardware_profile != expected_profile ||
	    config->custom_rule_count > FROGALERT_MONITOR_CONFIG_RULES ||
	    config->reserved != 0 ||
	    (config->builtin_targets & ~FROGALERT_TARGET_ALL) != 0 ||
	    config_crc32(config) != config->crc32)
		return 0;

	for (uint8_t index = 0; index < FROGALERT_MONITOR_CONFIG_RULES; index++) {
		const frogalert_monitor_rule_t *rule = &config->custom_rules[index];

		if (index < config->custom_rule_count) {
			if (!valid_rule(rule))
				return 0;
		} else if (!bytes_are_zero((const uint8_t *)rule, sizeof(*rule))) {
			return 0;
		}
	}
	return 1;
}
