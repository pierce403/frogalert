#ifndef FROGALERT_SURVEY_CORE_H
#define FROGALERT_SURVEY_CORE_H

#include <stdint.h>

#define FROGALERT_SURVEY_ADDRESS_BYTES 6
#define FROGALERT_SURVEY_MAX_DEVICES 64

typedef struct {
	uint8_t addresses[FROGALERT_SURVEY_MAX_DEVICES]
			 [FROGALERT_SURVEY_ADDRESS_BYTES];
	uint8_t count;
	uint8_t saturated;
} frogalert_survey_counter_t;

typedef enum {
	FROGALERT_ALERT_NONE = 0,
	FROGALERT_ALERT_COP,
	FROGALERT_ALERT_FLIPPER,
	FROGALERT_ALERT_KARR,
	FROGALERT_ALERT_FROG_DANCE,
} frogalert_survey_alert_t;

void frogalert_survey_counter_reset(frogalert_survey_counter_t *counter);
uint8_t frogalert_survey_counter_observe(frogalert_survey_counter_t *counter,
					 const uint8_t address[6]);
frogalert_survey_alert_t frogalert_survey_classify(
	const uint8_t address[6], uint8_t public_address, const uint8_t *data,
	uint8_t data_length);

#endif
