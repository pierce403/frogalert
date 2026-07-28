#ifndef FROGALERT_MONITOR_CONFIG_H
#define FROGALERT_MONITOR_CONFIG_H

#include <stdint.h>

#define FROGALERT_MONITOR_CONFIG_SCHEMA 1U
#define FROGALERT_MONITOR_CONFIG_SIZE 384U
#define FROGALERT_MONITOR_CONFIG_RULES 8U
#define FROGALERT_MONITOR_RULE_SIZE 44U
#define FROGALERT_MONITOR_VALUE_MAX 24U
#define FROGALERT_MONITOR_MESSAGE_MAX 16U

#define FROGALERT_PROFILE_B1144C_250901_USB_C 1U
#define FROGALERT_PROFILE_B1144C_260404_USB_C 2U

#define FROGALERT_TARGET_POLICE     (1UL << 0)
#define FROGALERT_TARGET_FLIPPER    (1UL << 1)
#define FROGALERT_TARGET_KARR       (1UL << 2)
#define FROGALERT_TARGET_RAY_BAN    (1UL << 3)
#define FROGALERT_TARGET_BADGEMAGIC (1UL << 4)
#define FROGALERT_TARGET_ALL        ((1UL << 5) - 1)

typedef enum {
	FROGALERT_MATCH_NAME_CONTAINS = 1,
	FROGALERT_MATCH_NAME_PREFIX = 2,
	FROGALERT_MATCH_NAME_EXACT = 3,
	FROGALERT_MATCH_PUBLIC_OUI = 4,
	FROGALERT_MATCH_SERVICE16 = 5,
} frogalert_monitor_match_type_t;

typedef struct __attribute__((packed)) {
	uint8_t type;
	uint8_t value_length;
	uint8_t message_length;
	uint8_t reserved;
	uint8_t value[FROGALERT_MONITOR_VALUE_MAX];
	uint8_t message[FROGALERT_MONITOR_MESSAGE_MAX];
} frogalert_monitor_rule_t;

typedef struct __attribute__((packed)) {
	uint8_t magic[16];
	uint16_t schema_version;
	uint16_t struct_size;
	uint8_t hardware_profile;
	uint8_t custom_rule_count;
	uint16_t reserved;
	uint32_t builtin_targets;
	uint32_t crc32;
	frogalert_monitor_rule_t custom_rules[FROGALERT_MONITOR_CONFIG_RULES];
} frogalert_monitor_config_t;

typedef char frogalert_monitor_rule_size_check[
	sizeof(frogalert_monitor_rule_t) == FROGALERT_MONITOR_RULE_SIZE ? 1 : -1];
typedef char frogalert_monitor_config_size_check[
	sizeof(frogalert_monitor_config_t) == FROGALERT_MONITOR_CONFIG_SIZE ? 1 : -1];

extern const frogalert_monitor_config_t frogalert_monitor_config;

uint8_t frogalert_monitor_config_validate(
	const frogalert_monitor_config_t *config, uint8_t expected_profile);

#endif
