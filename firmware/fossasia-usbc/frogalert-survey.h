#ifndef FROGALERT_SURVEY_H
#define FROGALERT_SURVEY_H

#include <stdint.h>

#include "frogalert-monitor-config.h"

void frogalert_survey_role_init(void);
void frogalert_survey_init(void);
uint8_t frogalert_survey_suspend(uint8_t advertise_after);
uint8_t frogalert_survey_prepare_shutdown(void);
void frogalert_survey_cancel_shutdown(void);
uint8_t frogalert_survey_should_advertise(void);
void frogalert_survey_on_disconnect(void);
void frogalert_survey_view_changed(void);
uint8_t frogalert_survey_display_active(void);

/* Implemented by the small, audited hook in the FOSSASIA main module. */
uint8_t frogalert_survey_allowed(void);
uint8_t frogalert_survey_counter_mode(void);
uint8_t frogalert_badgemagic_persistent_advertising(void);
void frogalert_survey_radio_idle(void);
void frogalert_display_survey_relinquish(void);
void frogalert_display_survey_release(void);

#endif
