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
static uint8_t wake_armed, wake_retry;
static uint32_t wake_at;
static void central_event(gapRoleEvent_t *event);
static void start_role(void);
static gapCentralRoleCB_t callbacks = {NULL, central_event, NULL};
static gapBondCBs_t bond_callbacks = {0};

static frogalert_input_t inputs(uint8_t event)
{
    frogalert_input_t in = {frogalert_survey_allowed(), TRUE, 2,
        frogalert_badgemagic_persistent_advertising(), frogalert_survey_counter_mode()};
    uint8_t state, advertising;
    if (GAPRole_GetParameter(GAPROLE_STATE, &state) != SUCCESS) return in;
    state &= GAPROLE_STATE_ADV_MASK;
    /* INIT/ERROR are not connections. They still cannot authorize a new scan
     * or power handoff, but need not discard an already-running discovery. */
    in.connected = state == GAPROLE_CONNECTED || state == GAPROLE_CONNECTED_ADV ||
                   state > GAPROLE_ERROR;
    if (event != FA_REPORT && state >= GAPROLE_STARTED && state <= GAPROLE_CONNECTED_ADV &&
        GAPRole_GetParameter(GAPROLE_ADVERT_ENABLED, &advertising) == SUCCESS)
        in.advertising = advertising || state == GAPROLE_ADVERTISING || state == GAPROLE_CONNECTED_ADV;
    return in;
}

static uint8_t configure_scan(void)
{
    static const uint16_t settings[][2] = {
        {TGAP_DISC_SCAN, 4800}, {TGAP_DISC_SCAN_INT, 16},
        {TGAP_DISC_SCAN_WIND, 16}, {TGAP_FILTER_ADV_REPORTS, TRUE},
    };
    uint8_t max_results = 64, readback = 0;
    /* Reapply after any role retry; verify the original passive scan settings. */
    for (unsigned i = 0; i < sizeof(settings) / sizeof(settings[0]); i++)
        if (GAP_SetParamValue(settings[i][0], settings[i][1]) != SUCCESS ||
            GAP_GetParamValue(settings[i][0]) != settings[i][1]) return FALSE;
    return GAPRole_SetParameter(GAPROLE_MAX_SCAN_RES, sizeof(max_results), &max_results) == SUCCESS &&
           GAPRole_GetParameter(GAPROLE_MAX_SCAN_RES, &readback) == SUCCESS && readback == max_results;
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
    frogalert_input_t in = inputs(event);
    uint32_t now = TMOS_GetSystemClock();
    frogalert_runtime_step(now, event, value, &in,
        address, data, length, (const uint8_t (*)[6])font5x7, &out);

    if (out.actions & FA_RESET_OFF) {
        frogalert_reset_off();
        return FALSE;
    }
    /* Replace state/wake BEFORE SDK calls: synchronous callbacks may dispatch
     * again and their newer results must survive this function's return. */
    display_active = out.owned;
    if (!out.wake_after) {
        if (wake_armed) tmos_stop_task(task_id, WAKE_EVENT);
        wake_armed = wake_retry = FALSE;
    } else if ((!wake_retry || event == FA_TICK) &&
               (!wake_armed || wake_at != now + out.wake_after)) {
        /* Updating an existing timer reuses its allocation. TRUE means success,
         * unlike the SDK's bStatus_t APIs. Never clear an event in its handler. */
        wake_at = now + out.wake_after;
        wake_armed = tmos_start_task(task_id, WAKE_EVENT, out.wake_after);
        wake_retry = !wake_armed;
    }
    if (!out.owned) frogalert_display_survey_release();
    else if (out.frame_changed) frogalert_display_present(out.frame);
    if (out.actions & FA_START_ROLE) start_role();
    if (out.actions & FA_STOP_ADV) ble_disable_advertise();
    if (out.actions & FA_DISCONNECT) frogalert_badgemagic_disconnect();
    if (out.actions & FA_SCAN) {
        bStatus_t status = configure_scan()
            ? GAPRole_CentralStartDiscovery(DEVDISC_MODE_ALL, FALSE, FALSE) : FAILURE;
        dispatch(FA_START_RESULT, status == SUCCESS, NULL, NULL, 0);
    }
    if (out.actions & FA_CANCEL) {
        bStatus_t status = GAPRole_CentralCancelDiscovery();
        dispatch(FA_CANCEL_RESULT, status == bleIncorrectMode, NULL, NULL, 0);
    }
    if ((out.actions & FA_ADVERTISE) && frogalert_survey_should_advertise()) {
        frogalert_input_t current = inputs(FA_TICK);
        if (!current.connected && current.advertising != 2) ble_enable_advertise();
    }
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
    if (events & WAKE_EVENT) {
        wake_armed = FALSE;
        dispatch(FA_TICK, 0, NULL, NULL, 0);
        return events ^ WAKE_EVENT;
    }
    return 0;
}
uint8_t frogalert_survey_display_active(void) { return frogalert_survey_allowed() && display_active; }
void frogalert_survey_view_changed(void) { dispatch(FA_VIEW, 0, NULL, NULL, 0); }
uint8_t frogalert_survey_suspend(uint8_t advertise_after) { return dispatch(FA_SUSPEND, advertise_after, NULL, NULL, 0); }
uint8_t frogalert_survey_prepare_shutdown(void) { return dispatch(FA_SHUTDOWN, 0, NULL, NULL, 0); }
void frogalert_survey_cancel_shutdown(void) { dispatch(FA_RESUME, 0, NULL, NULL, 0); }
uint8_t frogalert_survey_should_advertise(void) { return frogalert_badgemagic_persistent_advertising(); }
/* Allocation failure retries on the existing 200 ms recovery-button task,
 * not an immediate self-wake loop. Rust still checks absolute deadlines. */
void frogalert_survey_poll(void) { if (wake_retry) dispatch(FA_TICK, 0, NULL, NULL, 0); }
void frogalert_survey_role_init(void) { init_status = GAPRole_CentralInit(); }
void frogalert_survey_init(void)
{
    if (frogalert_rust_abi() != 0x00030002UL) return;
    task_id = TMOS_ProcessEventRegister(survey_task);
    if (task_id == INVALID_TASK_ID) { PRINT("FrogAlert task allocation failed\n"); return; }
    wake_armed = wake_retry = FALSE;
#ifdef FROGALERT_DANCING_FROG_MODE
    frogalert_runtime_init(TRUE);
#else
    frogalert_runtime_init(FALSE);
#endif
    tmos_set_event(task_id, START_EVENT);
}
