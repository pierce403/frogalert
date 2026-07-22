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
void frogalert_survey_counter_observe(frogalert_survey_counter_t *counter,
				      const uint8_t address[6]);

#endif
