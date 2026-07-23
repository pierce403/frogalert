#ifndef FROGALERT_SURVEY_H
#define FROGALERT_SURVEY_H

#include <stdint.h>

void frogalert_survey_role_init(void);
void frogalert_survey_init(void);

/* Implemented by the small, audited hook in the FOSSASIA main module. */
uint8_t frogalert_survey_allowed(void);
uint8_t frogalert_display_survey_count(uint8_t count, uint8_t saturated,
				       uint8_t phase);
void frogalert_display_survey_step(void);

#endif
