#ifndef FROGALERT_SURVEY_H
#define FROGALERT_SURVEY_H

#include <stdint.h>

#include "frogalert-monitor-config.h"

void frogalert_survey_role_init(void);
void frogalert_survey_init(void);
uint8_t frogalert_survey_suspend(uint8_t advertise_after);
void frogalert_survey_open_app_window(void);
uint8_t frogalert_survey_should_advertise(void);
void frogalert_survey_on_disconnect(void);
void frogalert_survey_view_changed(void);
uint8_t frogalert_survey_display_active(void);

/* Implemented by the small, audited hook in the FOSSASIA main module. */
uint8_t frogalert_survey_allowed(void);
uint8_t frogalert_survey_counter_mode(void);
uint8_t frogalert_badgemagic_persistent_advertising(void);
uint8_t frogalert_display_survey_count(uint8_t count, uint8_t saturated,
				       uint8_t phase);
uint8_t frogalert_display_survey_message(const char *message,
					 uint8_t message_length);
void frogalert_display_frog_dance(uint8_t frame);
void frogalert_display_survey_relinquish(void);
void frogalert_display_survey_release(void);
void frogalert_display_survey_page_step(void);
void frogalert_display_survey_page_redraw(void);

#endif
