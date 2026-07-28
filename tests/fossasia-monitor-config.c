#include <assert.h>
#include <stdint.h>

#include "frogalert-monitor-config.h"

#ifndef FROGALERT_HARDWARE_PROFILE_ID
#error "test must compile one exact hardware profile"
#endif

int main(void)
{
	frogalert_monitor_config_t modified = frogalert_monitor_config;
	uint8_t other_profile =
		FROGALERT_HARDWARE_PROFILE_ID ==
			FROGALERT_PROFILE_B1144C_250901_USB_C ?
		FROGALERT_PROFILE_B1144C_260404_USB_C :
		FROGALERT_PROFILE_B1144C_250901_USB_C;

	assert(sizeof(frogalert_monitor_rule_t) ==
	       FROGALERT_MONITOR_RULE_SIZE);
	assert(sizeof(frogalert_monitor_config_t) ==
	       FROGALERT_MONITOR_CONFIG_SIZE);
	assert(frogalert_monitor_config_validate(
		       &frogalert_monitor_config,
		       FROGALERT_HARDWARE_PROFILE_ID));
	assert(!frogalert_monitor_config_validate(
		       &frogalert_monitor_config, other_profile));

	modified.builtin_targets ^= FROGALERT_TARGET_FLIPPER;
	assert(!frogalert_monitor_config_validate(
		       &modified, FROGALERT_HARDWARE_PROFILE_ID));
	modified = frogalert_monitor_config;
	modified.magic[0] ^= 1U;
	assert(!frogalert_monitor_config_validate(
		       &modified, FROGALERT_HARDWARE_PROFILE_ID));
	modified = frogalert_monitor_config;
	modified.custom_rule_count = FROGALERT_MONITOR_CONFIG_RULES + 1U;
	assert(!frogalert_monitor_config_validate(
		       &modified, FROGALERT_HARDWARE_PROFILE_ID));

	return 0;
}
