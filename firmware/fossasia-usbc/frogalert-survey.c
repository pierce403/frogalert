/* WCH SDK adapter. Rust owns FrogAlert policy, rendering, and deadlines.
 * No SDK struct layout is guessed by Rust; startup and ISR ownership stay C. */
#include "CH58xBLE_LIB.h"
#include "setup.h"
#include "../debug.h"
#include "../font.h"
#include "frogalert-survey.h"
#include "frogalert-rust.h"

#define START_EVENT 1U
#define WAKE_EVENT 2U
__attribute__((used, section(".rodata.frogalert")))
const char frogalert_survey_identity[] =
    "FROGALERT:SURVEY-CONFIG-V1:FOSSASIA-9ce885d:"
    FROGALERT_HARDWARE_PROFILE_NAME ":UNVERIFIED";
#ifdef FROGALERT_DANCING_FROG_MODE
__attribute__((used, section(".rodata.frogalert")))
const char frogalert_dancing_frog_identity[] = "FROGALERT:VIEW:DANCING-FROGS:UNVERIFIED";
#endif
static tmosTaskID task_id = INVALID_TASK_ID;
static bStatus_t init_status;
static uint8_t display_active;
static void central_event(gapRoleEvent_t *event);
static void start_role(void);
static gapCentralRoleCB_t callbacks = {NULL, central_event, NULL};
static gapBondCBs_t bond_callbacks = {NULL, NULL};

static uint8_t connected(void)
{
    uint8_t state = GAPROLE_ERROR;
    if (GAPRole_GetParameter(GAPROLE_STATE, &state) != SUCCESS) return TRUE;
    state &= GAPROLE_STATE_ADV_MASK;
    return state != GAPROLE_STARTED && state != GAPROLE_WAITING && state != GAPROLE_ADVERTISING;
}

static uint8_t dispatch(uint8_t event, uint8_t value, const uint8_t *address,
                        const uint8_t *data, uint16_t length)
{
    if (task_id == INVALID_TASK_ID) {
        /* Missing scheduler/ABI setup cannot establish that the radio is idle. */
        if (event == FA_SHUTDOWN) frogalert_reset_off();
        return FALSE;
    }
    frogalert_output_t out = {0};
    frogalert_input_t in = {frogalert_survey_allowed(), connected(), 2,
        frogalert_badgemagic_persistent_advertising(), frogalert_survey_counter_mode()};
    uint8_t advertising, state;
    if (GAPRole_GetParameter(GAPROLE_ADVERT_ENABLED, &advertising) == SUCCESS &&
        GAPRole_GetParameter(GAPROLE_STATE, &state) == SUCCESS) {
        state &= GAPROLE_STATE_ADV_MASK;
        in.advertising = (advertising || state == GAPROLE_ADVERTISING ||
                          state == GAPROLE_CONNECTED_ADV) ? 1 : 0;
    }
    frogalert_runtime_step(TMOS_GetSystemClock(), event, value, &in,
        address, data, length, (const uint8_t (*)[6])font5x7, &out);

    if (out.actions & FA_RESET_OFF) {
        frogalert_reset_off();
        return FALSE;
    }
    /* Replace state/wake BEFORE SDK calls: synchronous callbacks may dispatch
     * again and their newer results must survive this function's return. */
    display_active = out.owned;
    tmos_stop_task(task_id, WAKE_EVENT);
    tmos_clear_event(task_id, WAKE_EVENT);
    if (out.wake_after && tmos_start_task(task_id, WAKE_EVENT, out.wake_after) != SUCCESS)
        tmos_set_event(task_id, WAKE_EVENT);
    if (!out.owned) frogalert_display_survey_release();
    else if (out.frame_changed) frogalert_display_present(out.frame);
    if (out.actions & FA_START_ROLE) start_role();
    if (out.actions & FA_STOP_ADV) ble_disable_advertise();
    if (out.actions & FA_DISCONNECT) frogalert_badgemagic_disconnect();
    if (out.actions & FA_SCAN) {
        bStatus_t status = GAPRole_CentralStartDiscovery(DEVDISC_MODE_ALL, FALSE, FALSE);
        dispatch(FA_START_RESULT, status == SUCCESS, NULL, NULL, 0);
    }
    if (out.actions & FA_CANCEL) {
        bStatus_t status = GAPRole_CentralCancelDiscovery();
        dispatch(FA_CANCEL_RESULT, status == bleIncorrectMode, NULL, NULL, 0);
    }
    if ((out.actions & FA_ADVERTISE) && frogalert_survey_should_advertise() && !connected())
        ble_enable_advertise();
    if (out.actions & FA_SHUTDOWN_IDLE) frogalert_survey_radio_idle();
    return out.radio_idle;
}

static void central_event(gapRoleEvent_t *event)
{
    if (!event) return;
    switch (event->gap.opcode) {
    case GAP_DEVICE_INIT_DONE_EVENT:
        dispatch(FA_READY, event->gap.hdr.status == SUCCESS, NULL, NULL, 0);
        break;
    case GAP_DEVICE_INFO_EVENT:
        dispatch(FA_REPORT, event->deviceInfo.addrType, event->deviceInfo.addr,
                 event->deviceInfo.pEvtData, event->deviceInfo.dataLen);
        break;
    case GAP_EXT_ADV_DEVICE_INFO_EVENT:
        dispatch(FA_REPORT, event->deviceExtAdvInfo.addrType, event->deviceExtAdvInfo.addr,
                 event->deviceExtAdvInfo.pEvtData, event->deviceExtAdvInfo.dataLen);
        break;
    case GAP_DIRECT_DEVICE_INFO_EVENT:
        dispatch(FA_REPORT, event->deviceDirectInfo.addrType, event->deviceDirectInfo.addr, NULL, 0);
        break;
    case GAP_DEVICE_DISCOVERY_EVENT:
        if (event->discCmpl.hdr.status == SUCCESS) {
            for (uint8_t i = 0; event->discCmpl.pDevList && i < event->discCmpl.numDevs; i++)
                dispatch(FA_REPORT, event->discCmpl.pDevList[i].addrType,
                         event->discCmpl.pDevList[i].addr, NULL, 0);
        }
        dispatch(FA_COMPLETE, event->discCmpl.hdr.status == SUCCESS, NULL, NULL, 0);
        break;
    default: break;
    }
}

static void start_role(void)
{
    if (init_status != SUCCESS) init_status = GAPRole_CentralInit();
    bStatus_t status = init_status;
    if (status == SUCCESS) status = GAPRole_CentralStartDevice(task_id, &bond_callbacks, &callbacks);
    /* The combined-role init callback can precede registration. */
    dispatch(FA_READY, status == SUCCESS || status == bleAlreadyInRequestedMode, NULL, NULL, 0);
}
static uint16_t survey_task(uint8_t id, uint16_t events)
{
    (void)id;
    if (events & SYS_EVENT_MSG) {
        uint8_t *message = tmos_msg_receive(task_id);
        if (message) tmos_msg_deallocate(message);
        return events ^ SYS_EVENT_MSG;
    }
    if (events & START_EVENT) { start_role(); return events ^ START_EVENT; }
    if (events & WAKE_EVENT) { dispatch(FA_TICK, 0, NULL, NULL, 0); return events ^ WAKE_EVENT; }
    return 0;
}
uint8_t frogalert_survey_display_active(void) { return frogalert_survey_allowed() && display_active; }
void frogalert_survey_view_changed(void) { dispatch(FA_VIEW, 0, NULL, NULL, 0); }
uint8_t frogalert_survey_suspend(uint8_t advertise_after) { return dispatch(FA_SUSPEND, advertise_after, NULL, NULL, 0); }
uint8_t frogalert_survey_prepare_shutdown(void) { return dispatch(FA_SHUTDOWN, 0, NULL, NULL, 0); }
void frogalert_survey_cancel_shutdown(void) { dispatch(FA_RESUME, 0, NULL, NULL, 0); }
uint8_t frogalert_survey_should_advertise(void) { return frogalert_badgemagic_persistent_advertising(); }
void frogalert_survey_role_init(void) { init_status = GAPRole_CentralInit(); }
void frogalert_survey_init(void)
{
    uint8_t max_results = 64;
    if (frogalert_rust_abi() != 0x00030002UL) return;
    task_id = TMOS_ProcessEventRegister(survey_task);
    if (task_id == INVALID_TASK_ID) { PRINT("FrogAlert task allocation failed\n"); return; }
#ifdef FROGALERT_DANCING_FROG_MODE
    frogalert_runtime_init(TRUE);
#else
    frogalert_runtime_init(FALSE);
#endif
    GAP_SetParamValue(TGAP_DISC_SCAN, 4800);
    GAP_SetParamValue(TGAP_DISC_SCAN_INT, 16);
    GAP_SetParamValue(TGAP_DISC_SCAN_WIND, 16);
    GAP_SetParamValue(TGAP_FILTER_ADV_REPORTS, TRUE);
    GAPRole_SetParameter(GAPROLE_MAX_SCAN_RES, sizeof(max_results), &max_results);
    tmos_set_event(task_id, START_EVENT);
}
