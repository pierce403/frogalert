/*
 * Private hardware-survey candidate for one exact B1144C USB-C profile.
 *
 * WCH's official CentPeri example initializes Central and Peripheral roles
 * together before starting either application task. This module follows that
 * pattern but never connects as a central: it performs passive discovery only.
 * FOSSASIA continues to own startup, clocks, vectors, USB, display refresh,
 * buttons, persistent nametag data, and ROM-ISP entry.
 */
#include "CH58xBLE_LIB.h"
#include "setup.h"
#include "../debug.h"

#include "frogalert-survey-core.h"
#include "frogalert-survey.h"

#ifndef FROGALERT_HARDWARE_PROFILE_ID
#error "survey build must bind one exact FrogAlert hardware profile id"
#endif
#ifndef FROGALERT_HARDWARE_PROFILE_NAME
#error "survey build must bind one exact FrogAlert hardware profile name"
#endif

#define SURVEY_START_DEVICE_EVENT (1U << 0)
#define SURVEY_PREPARE_EVENT      (1U << 1)
#define SURVEY_BEGIN_EVENT        (1U << 2)
#define SURVEY_DISPLAY_PAGE_EVENT (1U << 3)
#define SURVEY_WATCHDOG_EVENT     (1U << 4)
#define SURVEY_ALERT_END_EVENT    (1U << 5)
#define SURVEY_APP_WINDOW_END_EVENT (1U << 6)
#define SURVEY_FROG_VIEW_FRAME_EVENT (1U << 7)
#define SURVEY_APP_CUE_END_EVENT     (1U << 8)

#define TMOS_TICKS_FROM_MS(ms) ((uint32_t)(ms) * 1000U / 625U)
#define SURVEY_CYCLE_TIME_MS  20000U
#define SURVEY_SCAN_TIME_MS   3000U
#define SURVEY_RADIO_QUIET_MS 250U
#define SURVEY_FIRST_DELAY    TMOS_TICKS_FROM_MS(15000U)
#define SURVEY_RETRY_DELAY    TMOS_TICKS_FROM_MS(10000U)
#define SURVEY_RADIO_QUIET    TMOS_TICKS_FROM_MS(SURVEY_RADIO_QUIET_MS)
#define SURVEY_NEXT_DELAY     TMOS_TICKS_FROM_MS( \
	SURVEY_CYCLE_TIME_MS - SURVEY_SCAN_TIME_MS - SURVEY_RADIO_QUIET_MS)
#define SURVEY_FRAME_TIME     TMOS_TICKS_FROM_MS(1000U)
#define SURVEY_FROG_VIEW_FRAME_TIME TMOS_TICKS_FROM_MS(500U)
#define SURVEY_WATCHDOG_TIME  TMOS_TICKS_FROM_MS(5000U)
#define SURVEY_SCAN_TICKS     TMOS_TICKS_FROM_MS(SURVEY_SCAN_TIME_MS)
#define SURVEY_APP_WINDOW_TIME TMOS_TICKS_FROM_MS(10000U)
#define SURVEY_APP_CUE_TIME    TMOS_TICKS_FROM_MS(1000U)

#define SURVEY_CANCEL_NONE    0
#define SURVEY_CANCEL_TIMEOUT 1
#define SURVEY_CANCEL_SUSPEND 2
#define SURVEY_CANCEL_ERROR   3

__attribute__((used, section(".rodata.frogalert")))
const char frogalert_survey_identity[] =
	"FROGALERT:SURVEY-CONFIG-V1:FOSSASIA-9ce885d:"
	FROGALERT_HARDWARE_PROFILE_NAME ":UNVERIFIED";

#ifdef FROGALERT_DANCING_FROG_MODE
__attribute__((used, section(".rodata.frogalert")))
const char frogalert_dancing_frog_identity[] =
	"FROGALERT:VIEW:DANCING-FROGS:UNVERIFIED";
#endif

static const char cop_alert[] = "COP DETECTED";
static const char flipper_alert[] = "FLIPPER DETECTED";
static const char karr_alert[] = "KARR DETECTED";

static tmosTaskID survey_task_id = INVALID_TASK_ID;
static frogalert_survey_counter_t survey_counter;
static uint8_t central_ready;
static uint8_t scan_active;
static uint8_t restore_advertising;
static uint8_t cancel_reason;
static uint8_t advertise_when_idle;
static uint8_t app_window_active;
static uint8_t app_cue_active;
static uint8_t latest_count;
static uint8_t latest_saturated;
static uint8_t completed_count;
static uint8_t completed_saturated;
static uint8_t alert_visible;
static uint8_t alert_frame_count;
static uint8_t alert_frame_index;
#ifdef FROGALERT_DANCING_FROG_MODE
static uint8_t frog_view_frame;
#endif
static frogalert_survey_alert_t detected_alert;
static const uint8_t *detected_custom_message;
static uint8_t detected_custom_message_length;
static const frogalert_monitor_config_t *active_monitor_config;
static bStatus_t central_init_status = SUCCESS;

static void survey_central_event(gapRoleEvent_t *event);

static gapCentralRoleCB_t central_callbacks = {
	NULL,
	survey_central_event,
	NULL,
};

static gapBondCBs_t central_bond_callbacks = {
	NULL,
	NULL,
};

static uint8_t peripheral_is_connected(void)
{
	uint8_t state = GAPROLE_ERROR;

	if (GAPRole_GetParameter(GAPROLE_STATE, &state) != SUCCESS)
		return 1;
	state &= GAPROLE_STATE_ADV_MASK;
	return state == GAPROLE_CONNECTED || state == GAPROLE_CONNECTED_ADV;
}

static void schedule_survey(uint32_t delay)
{
	tmos_stop_task(survey_task_id, SURVEY_PREPARE_EVENT);
	tmos_start_task(survey_task_id, SURVEY_PREPARE_EVENT, delay);
}

static uint8_t render_alert(frogalert_survey_alert_t alert)
{
	switch (alert) {
	case FROGALERT_ALERT_COP:
		return frogalert_display_survey_message(cop_alert,
							sizeof(cop_alert) - 1);
	case FROGALERT_ALERT_FLIPPER:
		return frogalert_display_survey_message(
			flipper_alert, sizeof(flipper_alert) - 1);
	case FROGALERT_ALERT_KARR:
		return frogalert_display_survey_message(karr_alert,
							sizeof(karr_alert) - 1);
	case FROGALERT_ALERT_FROG_DANCE:
		frogalert_display_frog_dance(alert_frame_index);
		return 3;
	case FROGALERT_ALERT_CUSTOM:
		return frogalert_display_survey_message(
			(const char *)detected_custom_message,
			detected_custom_message_length);
	default:
		return 0;
	}
}

static void display_selected_view(void)
{
	if (alert_visible) {
		if (detected_alert == FROGALERT_ALERT_FROG_DANCE)
			frogalert_display_frog_dance(alert_frame_index);
		else
			frogalert_display_survey_page_redraw();
	} else if (frogalert_survey_counter_mode()) {
#ifdef FROGALERT_DANCING_FROG_MODE
		frogalert_display_frog_dance(frog_view_frame);
#else
		frogalert_display_survey_count(latest_count, latest_saturated);
#endif
	} else {
		frogalert_display_survey_release();
	}
}

#ifdef FROGALERT_DANCING_FROG_MODE
static void schedule_frog_view_frame(void)
{
	tmos_stop_task(survey_task_id, SURVEY_FROG_VIEW_FRAME_EVENT);
	if (!alert_visible && frogalert_survey_allowed() &&
	    frogalert_survey_counter_mode())
		tmos_start_task(survey_task_id, SURVEY_FROG_VIEW_FRAME_EVENT,
				SURVEY_FROG_VIEW_FRAME_TIME);
}
#endif

static void save_survey_view(uint8_t count, uint8_t saturated)
{
	latest_count = count;
	latest_saturated = saturated;
#ifndef FROGALERT_DANCING_FROG_MODE
	if (!alert_visible && frogalert_survey_counter_mode())
		frogalert_display_survey_count(count, saturated);
#endif
}

static void commit_survey_view(uint8_t count, uint8_t saturated)
{
	completed_count = count;
	completed_saturated = saturated;
	save_survey_view(count, saturated);
}

static void restore_completed_view(void)
{
	save_survey_view(completed_count, completed_saturated);
}

static void show_alert(const frogalert_survey_match_t *match)
{
	frogalert_survey_alert_t alert = match->alert;
	uint8_t incoming_priority;
	uint8_t current_priority;

	switch (alert) {
	case FROGALERT_ALERT_FROG_DANCE:
		incoming_priority = 4;
		break;
	case FROGALERT_ALERT_KARR:
		incoming_priority = 3;
		break;
	case FROGALERT_ALERT_COP:
		incoming_priority = 2;
		break;
	case FROGALERT_ALERT_FLIPPER:
		incoming_priority = 1;
		break;
	default:
		incoming_priority = 0;
		break;
	}
	switch (detected_alert) {
	case FROGALERT_ALERT_FROG_DANCE:
		current_priority = 4;
		break;
	case FROGALERT_ALERT_KARR:
		current_priority = 3;
		break;
	case FROGALERT_ALERT_COP:
		current_priority = 2;
		break;
	case FROGALERT_ALERT_FLIPPER:
		current_priority = 1;
		break;
	default:
		current_priority = 0;
		break;
	}

	if (alert == FROGALERT_ALERT_NONE || alert == detected_alert ||
	    (detected_alert != FROGALERT_ALERT_NONE &&
	     incoming_priority <= current_priority))
		return;

	/*
	 * Keep one deterministic result for the survey window. A later, strictly
	 * higher-priority match may replace the current overlay:
	 * frogs, then KARR, then COP, then Flipper.
	 */
	detected_alert = alert;
	detected_custom_message = match->message;
	detected_custom_message_length = match->message_length;
	alert_visible = 1;
	alert_frame_count = 0;
	alert_frame_index = 0;
	tmos_stop_task(survey_task_id, SURVEY_DISPLAY_PAGE_EVENT);
	tmos_stop_task(survey_task_id, SURVEY_ALERT_END_EVENT);
#ifdef FROGALERT_DANCING_FROG_MODE
	tmos_stop_task(survey_task_id, SURVEY_FROG_VIEW_FRAME_EVENT);
#endif
	alert_frame_count = render_alert(alert);
	if (!alert_frame_count) {
		alert_visible = 0;
		detected_alert = FROGALERT_ALERT_NONE;
#ifdef FROGALERT_DANCING_FROG_MODE
		schedule_frog_view_frame();
#endif
		return;
	}
	if (alert_frame_count > 1)
		tmos_start_task(survey_task_id, SURVEY_DISPLAY_PAGE_EVENT,
				SURVEY_FRAME_TIME);
	tmos_start_task(survey_task_id, SURVEY_ALERT_END_EVENT,
			(uint32_t)SURVEY_FRAME_TIME * alert_frame_count);
}

static void mark_central_ready(void)
{
	if (central_ready)
		return;
	central_ready = 1;
	commit_survey_view(0, FALSE);
	schedule_survey(SURVEY_FIRST_DELAY);
}

static void restore_advertising_if_needed(void)
{
	if (restore_advertising && frogalert_survey_allowed() &&
	    frogalert_survey_should_advertise() && !peripheral_is_connected())
		ble_enable_advertise();
	restore_advertising = 0;
}

static void finish_survey(uint8_t reason)
{
	uint8_t count = survey_counter.count;
	uint8_t saturated = survey_counter.saturated;

	scan_active = 0;
	cancel_reason = SURVEY_CANCEL_NONE;
	tmos_stop_task(survey_task_id, SURVEY_WATCHDOG_EVENT);
	frogalert_survey_counter_reset(&survey_counter);

	if (reason == SURVEY_CANCEL_SUSPEND) {
		restore_advertising = 0;
		restore_completed_view();
		if (advertise_when_idle && !peripheral_is_connected())
			ble_enable_advertise();
		advertise_when_idle = 0;
		schedule_survey(SURVEY_RETRY_DELAY);
		return;
	}

	restore_advertising_if_needed();
	advertise_when_idle = 0;
	if (reason == SURVEY_CANCEL_TIMEOUT) {
		restore_completed_view();
		PRINT("FrogAlert passive survey timed out\n");
		schedule_survey(SURVEY_RETRY_DELAY);
		return;
	}
	if (reason == SURVEY_CANCEL_ERROR) {
		restore_completed_view();
		PRINT("FrogAlert passive survey completion failed\n");
		schedule_survey(SURVEY_RETRY_DELAY);
		return;
	}

	PRINT("FrogAlert passive survey count: %u%s\n", count,
	      saturated ? "+" : "");
	commit_survey_view(count, saturated);
	schedule_survey(SURVEY_NEXT_DELAY);
}

static void observe_advertisement(uint8_t address_type,
				  const uint8_t address[B_ADDR_LEN],
				  const uint8_t *data, uint8_t data_length)
{
	frogalert_survey_match_t match;

	if (!scan_active || cancel_reason != SURVEY_CANCEL_NONE ||
	    !frogalert_survey_allowed() || peripheral_is_connected())
		return;
	frogalert_survey_classify(
		active_monitor_config, address, address_type == ADDRTYPE_PUBLIC,
		data, data_length, &match);
	show_alert(&match);
	frogalert_survey_counter_observe(&survey_counter, address);
}

static void observe_address(uint8_t address_type,
			    const uint8_t address[B_ADDR_LEN])
{
	observe_advertisement(address_type, address, NULL, 0);
}

static void survey_central_event(gapRoleEvent_t *event)
{
	switch (event->gap.opcode) {
	case GAP_DEVICE_INIT_DONE_EVENT:
		if (event->gap.hdr.status == SUCCESS) {
			PRINT("FrogAlert passive survey role ready\n");
			mark_central_ready();
		} else {
			central_ready = 0;
			restore_completed_view();
			PRINT("FrogAlert survey role failed: %u\n",
			      event->gap.hdr.status);
		}
		break;
	case GAP_DEVICE_INFO_EVENT:
		observe_advertisement(event->deviceInfo.addrType,
				      event->deviceInfo.addr,
				      event->deviceInfo.pEvtData,
				      event->deviceInfo.dataLen);
		break;
	case GAP_EXT_ADV_DEVICE_INFO_EVENT:
		observe_advertisement(event->deviceExtAdvInfo.addrType,
				      event->deviceExtAdvInfo.addr,
				      event->deviceExtAdvInfo.pEvtData,
				      event->deviceExtAdvInfo.dataLen);
		break;
	case GAP_DIRECT_DEVICE_INFO_EVENT:
		observe_address(event->deviceDirectInfo.addrType,
				event->deviceDirectInfo.addr);
		break;
	case GAP_DEVICE_DISCOVERY_EVENT:
		if (scan_active) {
			uint8_t reason = cancel_reason;

			if (reason == SURVEY_CANCEL_NONE &&
			    event->discCmpl.hdr.status != SUCCESS)
				reason = SURVEY_CANCEL_ERROR;
			if (reason == SURVEY_CANCEL_NONE) {
				for (uint8_t index = 0;
				     event->discCmpl.pDevList &&
				     index < event->discCmpl.numDevs;
				     index++)
					observe_address(
						event->discCmpl.pDevList[index].addrType,
						event->discCmpl.pDevList[index].addr);
			}
			finish_survey(reason);
		}
		break;
	default:
		break;
	}
}

static uint16_t survey_task(uint8_t task_id, uint16_t events)
{
	(void)task_id;

	if (events & SYS_EVENT_MSG) {
		uint8_t *message = tmos_msg_receive(survey_task_id);
		if (message)
			tmos_msg_deallocate(message);
		return events ^ SYS_EVENT_MSG;
	}

	if (events & SURVEY_START_DEVICE_EVENT) {
		bStatus_t status;

		/* Show a stable zero until the first complete scan result. */
		save_survey_view(0, FALSE);
		if (central_init_status != SUCCESS) {
			restore_completed_view();
			return events ^ SURVEY_START_DEVICE_EVENT;
		}
		status = GAPRole_CentralStartDevice(
			survey_task_id, &central_bond_callbacks, &central_callbacks);
		if (status == SUCCESS || status == bleAlreadyInRequestedMode) {
			/*
			 * FOSSASIA starts Peripheral before this callback is
			 * registered. Do not depend solely on a possibly earlier
			 * combined-role GAP_DEVICE_INIT_DONE_EVENT.
			 */
			mark_central_ready();
		} else {
			restore_completed_view();
			PRINT("FrogAlert central start failed: %u\n", status);
		}
		return events ^ SURVEY_START_DEVICE_EVENT;
	}

	if (events & SURVEY_PREPARE_EVENT) {
		uint8_t advertising_enabled = 0;
		bStatus_t status;

		if (!central_ready || scan_active ||
		    !frogalert_survey_allowed() || peripheral_is_connected()) {
			schedule_survey(SURVEY_RETRY_DELAY);
			return events ^ SURVEY_PREPARE_EVENT;
		}

		frogalert_survey_counter_reset(&survey_counter);
		detected_alert = FROGALERT_ALERT_NONE;
		detected_custom_message = NULL;
		detected_custom_message_length = 0;
		alert_visible = 0;
		alert_frame_count = 0;
		alert_frame_index = 0;
		tmos_stop_task(survey_task_id, SURVEY_DISPLAY_PAGE_EVENT);
		tmos_stop_task(survey_task_id, SURVEY_ALERT_END_EVENT);
		status = GAPRole_GetParameter(GAPROLE_ADVERT_ENABLED,
					      &advertising_enabled);
		if (status != SUCCESS) {
			PRINT("FrogAlert advertising-state read failed: %u\n", status);
			schedule_survey(SURVEY_RETRY_DELAY);
			return events ^ SURVEY_PREPARE_EVENT;
		}
		if (advertising_enabled) {
			restore_advertising = 1;
			ble_disable_advertise();
		}
		tmos_start_task(survey_task_id, SURVEY_BEGIN_EVENT,
				SURVEY_RADIO_QUIET);
		return events ^ SURVEY_PREPARE_EVENT;
	}

	if (events & SURVEY_BEGIN_EVENT) {
		bStatus_t status;
		uint8_t advertising_enabled = 0;

		status = GAPRole_GetParameter(GAPROLE_ADVERT_ENABLED,
					      &advertising_enabled);
		if (!frogalert_survey_allowed() || peripheral_is_connected() ||
		    status != SUCCESS || advertising_enabled) {
			restore_advertising_if_needed();
			frogalert_survey_counter_reset(&survey_counter);
			schedule_survey(SURVEY_RETRY_DELAY);
			return events ^ SURVEY_BEGIN_EVENT;
		}

		scan_active = 1;
		status = GAPRole_CentralStartDiscovery(DEVDISC_MODE_ALL, FALSE,
					       FALSE);
		if (status == SUCCESS) {
			cancel_reason = SURVEY_CANCEL_NONE;
			tmos_start_task(survey_task_id, SURVEY_WATCHDOG_EVENT,
					SURVEY_WATCHDOG_TIME);
		} else {
			scan_active = 0;
			restore_advertising_if_needed();
			frogalert_survey_counter_reset(&survey_counter);
			restore_completed_view();
			PRINT("FrogAlert passive survey start failed: %u\n", status);
			schedule_survey(SURVEY_RETRY_DELAY);
		}
		return events ^ SURVEY_BEGIN_EVENT;
	}

	if (events & SURVEY_WATCHDOG_EVENT) {
		if (scan_active) {
			bStatus_t status;

			if (cancel_reason == SURVEY_CANCEL_NONE)
				cancel_reason = SURVEY_CANCEL_TIMEOUT;
			status = GAPRole_CentralCancelDiscovery();
			if (status == bleIncorrectMode) {
				finish_survey(cancel_reason);
			} else {
				if (status != SUCCESS)
					PRINT("FrogAlert survey cancel failed: %u\n",
					      status);
				tmos_start_task(survey_task_id,
						SURVEY_WATCHDOG_EVENT,
						SURVEY_RETRY_DELAY);
			}
		}
		return events ^ SURVEY_WATCHDOG_EVENT;
	}

	if (events & SURVEY_ALERT_END_EVENT) {
		tmos_stop_task(survey_task_id, SURVEY_DISPLAY_PAGE_EVENT);
		alert_visible = 0;
		alert_frame_count = 0;
		alert_frame_index = 0;
		display_selected_view();
#ifdef FROGALERT_DANCING_FROG_MODE
		schedule_frog_view_frame();
#endif
		return events ^ SURVEY_ALERT_END_EVENT;
	}

	if (events & SURVEY_APP_WINDOW_END_EVENT) {
		app_window_active = 0;
		advertise_when_idle = 0;
		restore_advertising = 0;
		tmos_stop_task(survey_task_id, SURVEY_APP_CUE_END_EVENT);
		if (!peripheral_is_connected()) {
			if (!frogalert_badgemagic_persistent_advertising())
				ble_disable_advertise();
			if (app_cue_active)
				frogalert_display_app_attention_end();
		}
		app_cue_active = 0;
		return events ^ SURVEY_APP_WINDOW_END_EVENT;
	}

	if (events & SURVEY_APP_CUE_END_EVENT) {
		if (app_cue_active && !peripheral_is_connected()) {
			app_cue_active = 0;
			frogalert_display_app_attention_end();
		}
		return events ^ SURVEY_APP_CUE_END_EVENT;
	}

	if (events & SURVEY_DISPLAY_PAGE_EVENT) {
		if (alert_visible &&
		    alert_frame_index + 1 < alert_frame_count) {
			alert_frame_index++;
			if (detected_alert == FROGALERT_ALERT_FROG_DANCE)
				frogalert_display_frog_dance(alert_frame_index);
			else
				frogalert_display_survey_page_step();
			if (alert_frame_index + 1 < alert_frame_count)
				tmos_start_task(
					survey_task_id,
					SURVEY_DISPLAY_PAGE_EVENT,
					SURVEY_FRAME_TIME);
		}
		return events ^ SURVEY_DISPLAY_PAGE_EVENT;
	}

#ifdef FROGALERT_DANCING_FROG_MODE
	if (events & SURVEY_FROG_VIEW_FRAME_EVENT) {
		if (!alert_visible && frogalert_survey_allowed() &&
		    frogalert_survey_counter_mode()) {
			frog_view_frame ^= 1U;
			frogalert_display_frog_dance(frog_view_frame);
			tmos_start_task(survey_task_id,
					SURVEY_FROG_VIEW_FRAME_EVENT,
					SURVEY_FROG_VIEW_FRAME_TIME);
		}
		return events ^ SURVEY_FROG_VIEW_FRAME_EVENT;
	}
#endif

	return 0;
}

uint8_t frogalert_survey_display_active(void)
{
	return frogalert_survey_allowed() &&
	       (frogalert_survey_counter_mode() || alert_visible);
}

void frogalert_survey_view_changed(void)
{
#ifdef FROGALERT_DANCING_FROG_MODE
	tmos_stop_task(survey_task_id, SURVEY_FROG_VIEW_FRAME_EVENT);
	frog_view_frame = 0;
#endif
	display_selected_view();
#ifdef FROGALERT_DANCING_FROG_MODE
	schedule_frog_view_frame();
#endif
}

uint8_t frogalert_survey_suspend(uint8_t advertise_after)
{
	bStatus_t status;

	tmos_stop_task(survey_task_id, SURVEY_PREPARE_EVENT);
	tmos_stop_task(survey_task_id, SURVEY_BEGIN_EVENT);
	if (!scan_active) {
		restore_advertising = 0;
		advertise_when_idle = 0;
		frogalert_survey_counter_reset(&survey_counter);
		restore_completed_view();
		schedule_survey(SURVEY_RETRY_DELAY);
		return TRUE;
	}

	cancel_reason = SURVEY_CANCEL_SUSPEND;
	if (advertise_after)
		advertise_when_idle = 1;
	status = GAPRole_CentralCancelDiscovery();
	if (status == bleIncorrectMode) {
		finish_survey(SURVEY_CANCEL_SUSPEND);
		return FALSE;
	}
	if (status != SUCCESS)
		PRINT("FrogAlert survey suspend deferred after error: %u\n",
		      status);
	return FALSE;
}

uint8_t frogalert_survey_should_advertise(void)
{
	return app_window_active ||
	       frogalert_badgemagic_persistent_advertising();
}

void frogalert_survey_open_app_window(void)
{
	app_window_active = 1;
	tmos_stop_task(survey_task_id, SURVEY_APP_WINDOW_END_EVENT);
#ifdef FROGALERT_DANCING_FROG_MODE
	tmos_stop_task(survey_task_id, SURVEY_FROG_VIEW_FRAME_EVENT);
#endif
	tmos_stop_task(survey_task_id, SURVEY_APP_CUE_END_EVENT);
	app_cue_active = 1;
	if (frogalert_survey_suspend(TRUE))
		ble_enable_advertise();
	frogalert_display_app_attention_start();
	tmos_start_task(survey_task_id, SURVEY_APP_CUE_END_EVENT,
			SURVEY_APP_CUE_TIME);
	tmos_start_task(survey_task_id, SURVEY_APP_WINDOW_END_EVENT,
			SURVEY_APP_WINDOW_TIME);
}

void frogalert_survey_role_init(void)
{
	central_init_status = GAPRole_CentralInit();
	if (central_init_status != SUCCESS)
		PRINT("FrogAlert central role init failed: %u\n",
		      central_init_status);
}

void frogalert_survey_init(void)
{
	uint8_t max_results = FROGALERT_SURVEY_MAX_DEVICES;

	survey_task_id = TMOS_ProcessEventRegister(survey_task);
	frogalert_survey_counter_reset(&survey_counter);
	if (frogalert_monitor_config_validate(
		    &frogalert_monitor_config, FROGALERT_HARDWARE_PROFILE_ID)) {
		active_monitor_config = &frogalert_monitor_config;
	} else {
		active_monitor_config = NULL;
		PRINT("FrogAlert monitor config invalid; alerts disabled\n");
	}
	GAP_SetParamValue(TGAP_DISC_SCAN, SURVEY_SCAN_TICKS);
	GAP_SetParamValue(TGAP_DISC_SCAN_INT, 16);
	GAP_SetParamValue(TGAP_DISC_SCAN_WIND, 16);
	GAP_SetParamValue(TGAP_FILTER_ADV_REPORTS, TRUE);
	GAPRole_SetParameter(GAPROLE_MAX_SCAN_RES, sizeof(max_results),
			     &max_results);
	tmos_set_event(survey_task_id, SURVEY_START_DEVICE_EVENT);
}
