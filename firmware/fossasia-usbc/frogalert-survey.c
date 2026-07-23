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

#define TMOS_TICKS_FROM_MS(ms) ((uint32_t)(ms) * 1000U / 625U)
#define SURVEY_FIRST_DELAY     TMOS_TICKS_FROM_MS(15000U)
#define SURVEY_RETRY_DELAY     TMOS_TICKS_FROM_MS(10000U)
#define SURVEY_RADIO_QUIET     TMOS_TICKS_FROM_MS(250U)
#define SURVEY_NEXT_DELAY      TMOS_TICKS_FROM_MS(57000U)
#define SURVEY_SCROLL_TIME     TMOS_TICKS_FROM_MS(100U)
#define SURVEY_WATCHDOG_TIME   TMOS_TICKS_FROM_MS(5000U)
#define SURVEY_SCAN_TICKS      4800U /* 3 seconds in 0.625 ms units. */

__attribute__((used, section(".rodata.frogalert")))
const char frogalert_survey_identity[] =
	"FROGALERT:SURVEY-SCROLL:FOSSASIA-9ce885d:B1144C_250901_USB_C:UNVERIFIED";

static tmosTaskID survey_task_id = INVALID_TASK_ID;
static frogalert_survey_counter_t survey_counter;
static uint8_t central_ready;
static uint8_t scan_active;
static uint8_t restore_advertising;

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

static void restore_advertising_if_needed(void)
{
	if (restore_advertising)
		ble_enable_advertise();
	restore_advertising = 0;
}

static void finish_survey(void)
{
	uint8_t count = survey_counter.count;
	uint8_t saturated = survey_counter.saturated;

	scan_active = 0;
	tmos_stop_task(survey_task_id, SURVEY_WATCHDOG_EVENT);
	restore_advertising_if_needed();
	frogalert_survey_counter_reset(&survey_counter);

	PRINT("FrogAlert passive survey count: %u%s\n", count,
	      saturated ? "+" : "");
	frogalert_display_survey_count(count, saturated);
	schedule_survey(SURVEY_NEXT_DELAY);
}

static void observe_address(const uint8_t address[B_ADDR_LEN])
{
	if (scan_active)
		frogalert_survey_counter_observe(&survey_counter, address);
}

static void survey_central_event(gapRoleEvent_t *event)
{
	switch (event->gap.opcode) {
	case GAP_DEVICE_INIT_DONE_EVENT:
		central_ready = event->gap.hdr.status == SUCCESS;
		if (central_ready) {
			PRINT("FrogAlert passive survey role ready\n");
			schedule_survey(SURVEY_FIRST_DELAY);
		} else {
			PRINT("FrogAlert survey role failed: %u\n",
			      event->gap.hdr.status);
		}
		break;
	case GAP_DEVICE_INFO_EVENT:
		observe_address(event->deviceInfo.addr);
		break;
	case GAP_EXT_ADV_DEVICE_INFO_EVENT:
		observe_address(event->deviceExtAdvInfo.addr);
		break;
	case GAP_DIRECT_DEVICE_INFO_EVENT:
		observe_address(event->deviceDirectInfo.addr);
		break;
	case GAP_DEVICE_DISCOVERY_EVENT:
		if (scan_active)
			finish_survey();
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

		/* Make the diagnostic display observable before the first scan. */
		frogalert_display_survey_count(0, FALSE);
		tmos_start_reload_task(survey_task_id,
				       SURVEY_DISPLAY_STEP_EVENT,
				       SURVEY_SCROLL_TIME);
		status = GAPRole_CentralStartDevice(
			survey_task_id, &central_bond_callbacks, &central_callbacks);
		if (status != SUCCESS && status != bleAlreadyInRequestedMode)
			PRINT("FrogAlert central start failed: %u\n", status);
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
			tmos_start_task(survey_task_id, SURVEY_WATCHDOG_EVENT,
					SURVEY_WATCHDOG_TIME);
		} else {
			scan_active = 0;
			restore_advertising_if_needed();
			frogalert_survey_counter_reset(&survey_counter);
			PRINT("FrogAlert passive survey start failed: %u\n", status);
			schedule_survey(SURVEY_RETRY_DELAY);
		}
		return events ^ SURVEY_BEGIN_EVENT;
	}

	if (events & SURVEY_WATCHDOG_EVENT) {
		if (scan_active) {
			bStatus_t status = GAPRole_CentralCancelDiscovery();

			if (status == SUCCESS || status == bleIncorrectMode) {
				scan_active = 0;
				restore_advertising_if_needed();
				frogalert_survey_counter_reset(&survey_counter);
				PRINT("FrogAlert passive survey timed out\n");
				schedule_survey(SURVEY_RETRY_DELAY);
			} else {
				PRINT("FrogAlert survey cancel failed: %u\n", status);
				tmos_start_task(survey_task_id,
						SURVEY_WATCHDOG_EVENT,
						SURVEY_RETRY_DELAY);
			}
		}
		return events ^ SURVEY_WATCHDOG_EVENT;
	}

	if (events & SURVEY_DISPLAY_STEP_EVENT) {
		frogalert_display_survey_step();
		return events ^ SURVEY_DISPLAY_STEP_EVENT;
	}

	return 0;
}

void frogalert_survey_role_init(void)
{
	bStatus_t status = GAPRole_CentralInit();
	if (status != SUCCESS)
		PRINT("FrogAlert central role init failed: %u\n", status);
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
