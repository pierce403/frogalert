/*
 * Private hardware-survey candidate for the exact B1144C_250901 USB-C badge.
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

#define SURVEY_START_DEVICE_EVENT (1U << 0)
#define SURVEY_PREPARE_EVENT      (1U << 1)
#define SURVEY_BEGIN_EVENT        (1U << 2)
#define SURVEY_DISPLAY_STEP_EVENT (1U << 3)
#define SURVEY_WATCHDOG_EVENT     (1U << 4)
#define SURVEY_ALERT_END_EVENT    (1U << 5)

#define TMOS_TICKS_FROM_MS(ms) ((uint32_t)(ms) * 1000U / 625U)
#define SURVEY_CYCLE_TIME_MS  20000U
#define SURVEY_SCAN_TIME_MS   3000U
#define SURVEY_FIRST_DELAY    TMOS_TICKS_FROM_MS(15000U)
#define SURVEY_RETRY_DELAY    TMOS_TICKS_FROM_MS(10000U)
#define SURVEY_RADIO_QUIET    TMOS_TICKS_FROM_MS(250U)
#define SURVEY_NEXT_DELAY     TMOS_TICKS_FROM_MS( \
	SURVEY_CYCLE_TIME_MS - SURVEY_SCAN_TIME_MS)
#define SURVEY_SCROLL_TIME    TMOS_TICKS_FROM_MS(100U)
#define SURVEY_WATCHDOG_TIME  TMOS_TICKS_FROM_MS(5000U)
#define SURVEY_ALERT_TIME     TMOS_TICKS_FROM_MS(3000U)
#define SURVEY_FROG_TIME      TMOS_TICKS_FROM_MS(3000U)
#define SURVEY_SCAN_TICKS     TMOS_TICKS_FROM_MS(SURVEY_SCAN_TIME_MS)

#define SURVEY_PHASE_INITIALIZING 'I'
#define SURVEY_PHASE_READY        'R'
#define SURVEY_PHASE_SCANNING     'S'
#define SURVEY_PHASE_COMPLETE     ' '
#define SURVEY_PHASE_ERROR        'E'
#define SURVEY_PHASE_TIMEOUT      'T'

#define SURVEY_CANCEL_NONE    0
#define SURVEY_CANCEL_TIMEOUT 1
#define SURVEY_CANCEL_SUSPEND 2
#define SURVEY_CANCEL_ERROR   3

__attribute__((used, section(".rodata.frogalert")))
const char frogalert_survey_identity[] =
	"FROGALERT:SURVEY-MODES-RULES:FOSSASIA-9ce885d:B1144C_250901_USB_C:UNVERIFIED";

static const char cop_alert[] = "COP DETECTED";
static const char flipper_alert[] = "FLIPPER DETECTED";

static tmosTaskID survey_task_id = INVALID_TASK_ID;
static frogalert_survey_counter_t survey_counter;
static uint8_t central_ready;
static uint8_t scan_active;
static uint8_t restore_advertising;
static uint8_t cancel_reason;
static uint8_t advertise_when_idle;
static uint8_t latest_count;
static uint8_t latest_saturated;
static uint8_t latest_phase = SURVEY_PHASE_INITIALIZING;
static uint8_t completed_count;
static uint8_t completed_saturated;
static uint8_t completed_phase = SURVEY_PHASE_INITIALIZING;
static uint8_t alert_visible;
static uint8_t frog_frame;
static frogalert_survey_alert_t detected_alert;
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

static void render_alert(frogalert_survey_alert_t alert)
{
	switch (alert) {
	case FROGALERT_ALERT_COP:
		frogalert_display_survey_message(cop_alert,
						 sizeof(cop_alert) - 1);
		break;
	case FROGALERT_ALERT_FLIPPER:
		frogalert_display_survey_message(flipper_alert,
						 sizeof(flipper_alert) - 1);
		break;
	case FROGALERT_ALERT_FROG_DANCE:
		frogalert_display_frog_dance(frog_frame++);
		break;
	default:
		break;
	}
}

static void display_selected_view(void)
{
	if (alert_visible) {
		render_alert(detected_alert);
	} else if (frogalert_survey_counter_mode()) {
		frogalert_display_survey_count(latest_count, latest_saturated,
					       latest_phase);
	} else {
		frogalert_display_survey_release();
	}
}

static void save_survey_view(uint8_t count, uint8_t saturated, uint8_t phase)
{
	latest_count = count;
	latest_saturated = saturated;
	latest_phase = phase;
	if (!alert_visible && frogalert_survey_counter_mode())
		frogalert_display_survey_count(count, saturated, phase);
}

static void commit_survey_view(uint8_t count, uint8_t saturated, uint8_t phase)
{
	completed_count = count;
	completed_saturated = saturated;
	completed_phase = phase;
	save_survey_view(count, saturated, phase);
}

static void restore_completed_view(void)
{
	save_survey_view(completed_count, completed_saturated, completed_phase);
}

static void show_survey(uint8_t phase)
{
	save_survey_view(survey_counter.count, survey_counter.saturated, phase);
}

static void show_alert(frogalert_survey_alert_t alert)
{
	if (alert == FROGALERT_ALERT_NONE || alert == detected_alert ||
	    (detected_alert != FROGALERT_ALERT_NONE &&
	     detected_alert != FROGALERT_ALERT_FROG_DANCE))
		return;

	/*
	 * A broad, friendly FEE0 hint must never hide a Cop or Flipper warning.
	 * A later warning may replace the frog dance; warnings otherwise remain
	 * stable for the remainder of the short survey window.
	 */
	detected_alert = alert;
	alert_visible = 1;
	frog_frame = 0;
	render_alert(alert);
	tmos_stop_task(survey_task_id, SURVEY_ALERT_END_EVENT);
	tmos_start_task(survey_task_id, SURVEY_ALERT_END_EVENT,
			alert == FROGALERT_ALERT_FROG_DANCE ?
			SURVEY_FROG_TIME : SURVEY_ALERT_TIME);
}

static void mark_central_ready(void)
{
	if (central_ready)
		return;
	central_ready = 1;
	commit_survey_view(0, FALSE, SURVEY_PHASE_READY);
	schedule_survey(SURVEY_FIRST_DELAY);
}

static void restore_advertising_if_needed(void)
{
	if (restore_advertising && frogalert_survey_allowed() &&
	    !peripheral_is_connected())
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
		commit_survey_view(0, FALSE, SURVEY_PHASE_TIMEOUT);
		PRINT("FrogAlert passive survey timed out\n");
		schedule_survey(SURVEY_RETRY_DELAY);
		return;
	}
	if (reason == SURVEY_CANCEL_ERROR) {
		commit_survey_view(0, FALSE, SURVEY_PHASE_ERROR);
		PRINT("FrogAlert passive survey completion failed\n");
		schedule_survey(SURVEY_RETRY_DELAY);
		return;
	}

	PRINT("FrogAlert passive survey count: %u%s\n", count,
	      saturated ? "+" : "");
	commit_survey_view(count, saturated, SURVEY_PHASE_COMPLETE);
	schedule_survey(SURVEY_NEXT_DELAY);
}

static void observe_advertisement(uint8_t address_type,
				  const uint8_t address[B_ADDR_LEN],
				  const uint8_t *data, uint8_t data_length)
{
	uint8_t count_changed;
	frogalert_survey_alert_t alert;

	if (!scan_active || cancel_reason != SURVEY_CANCEL_NONE ||
	    !frogalert_survey_allowed() || peripheral_is_connected())
		return;
	alert = frogalert_survey_classify(
		address, address_type == ADDRTYPE_PUBLIC, data, data_length);
	show_alert(alert);
	count_changed = frogalert_survey_counter_observe(&survey_counter, address);
	if (count_changed)
		show_survey(SURVEY_PHASE_SCANNING);
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
			show_survey(SURVEY_PHASE_ERROR);
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

		/* Make every startup phase observable before the first scan. */
		save_survey_view(0, FALSE, SURVEY_PHASE_INITIALIZING);
		tmos_start_reload_task(survey_task_id,
				       SURVEY_DISPLAY_STEP_EVENT,
				       SURVEY_SCROLL_TIME);
		if (central_init_status != SUCCESS) {
			show_survey(SURVEY_PHASE_ERROR);
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
			show_survey(SURVEY_PHASE_ERROR);
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
		alert_visible = 0;
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
			show_survey(SURVEY_PHASE_SCANNING);
			tmos_start_task(survey_task_id, SURVEY_WATCHDOG_EVENT,
					SURVEY_WATCHDOG_TIME);
		} else {
			scan_active = 0;
			restore_advertising_if_needed();
			frogalert_survey_counter_reset(&survey_counter);
			show_survey(SURVEY_PHASE_ERROR);
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
		alert_visible = 0;
		display_selected_view();
		return events ^ SURVEY_ALERT_END_EVENT;
	}

	if (events & SURVEY_DISPLAY_STEP_EVENT) {
		if (alert_visible &&
		    detected_alert == FROGALERT_ALERT_FROG_DANCE)
			frogalert_display_frog_dance(frog_frame++);
		else
			frogalert_display_survey_step();
		return events ^ SURVEY_DISPLAY_STEP_EVENT;
	}

	return 0;
}

uint8_t frogalert_survey_display_active(void)
{
	return frogalert_survey_allowed() &&
	       (frogalert_survey_counter_mode() || alert_visible);
}

void frogalert_survey_view_changed(void)
{
	display_selected_view();
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
	GAP_SetParamValue(TGAP_DISC_SCAN, SURVEY_SCAN_TICKS);
	GAP_SetParamValue(TGAP_DISC_SCAN_INT, 16);
	GAP_SetParamValue(TGAP_DISC_SCAN_WIND, 16);
	GAP_SetParamValue(TGAP_FILTER_ADV_REPORTS, TRUE);
	GAPRole_SetParameter(GAPROLE_MAX_SCAN_RES, sizeof(max_results),
			     &max_results);
	tmos_set_event(survey_task_id, SURVEY_START_DEVICE_EVENT);
}
