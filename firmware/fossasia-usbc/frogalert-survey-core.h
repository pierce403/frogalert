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

void frogalert_survey_counter_reset(frogalert_survey_counter_t *counter);
uint8_t frogalert_survey_counter_observe(frogalert_survey_counter_t *counter,
					 const uint8_t address[6]);
uint8_t frogalert_survey_has_flipper_name(const uint8_t *data,
					  uint8_t data_length);

#endif
