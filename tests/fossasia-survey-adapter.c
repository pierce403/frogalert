/* Execute the unmodified production C adapter and real Rust archive. Only the
 * SDK and board effects are simulated; RF and interrupt timing are not. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define FROGALERT_HARDWARE_PROFILE_NAME "host-adapter-test"
#include "ble/frogalert-survey.c"

uint8_t font5x7[95][6];
static pTaskEventHandlerFn handler;
static gapCentralRoleCB_t *central;
static uint32_t clock_now, timer_at;
static uint16_t pending, stopped, parameters[40];
static uint8_t timer, in_handler, allowed, role_state, adv, want_adv, max_scan;
static uint8_t timer_fail, state_fail, adv_fail, param_fail, param_ignore;
static uint8_t start_fail, cancel_lost, scanning, sync_complete, sync_ready;
static unsigned starts, cancels, dispatches, allocations, timer_calls, getters;
static unsigned idle_handoffs, off_resets, writes;
static uint16_t panel[44];

uint32_t TMOS_GetSystemClock(void) { return clock_now; }
tmosTaskID TMOS_ProcessEventRegister(pTaskEventHandlerFn fn) { handler = fn; return 7; }
bStatus_t tmos_set_event(tmosTaskID id, tmosEvents event)
{ assert(id == 7); pending |= event; return SUCCESS; }
bStatus_t tmos_clear_event(tmosTaskID id, tmosEvents event)
{ assert(id == 7); assert(!in_handler); pending &= ~event; return SUCCESS; }
BOOL tmos_start_task(tmosTaskID id, tmosEvents event, tmosTimer delay)
{
    assert(id == 7 && event == WAKE_EVENT && delay);
    timer_calls++;
    if (timer_fail) return FALSE; // This API does NOT return bStatus_t.
    if (!timer) allocations++;
    timer = TRUE; timer_at = clock_now + delay;
    return TRUE;
}
bStatus_t tmos_stop_task(tmosTaskID id, tmosEvents event)
{
    assert(id == 7 && event == WAKE_EVENT);
    timer = FALSE; pending &= ~event;
    if (in_handler) stopped |= event;
    return SUCCESS;
}
uint8_t *tmos_msg_receive(tmosTaskID id) { assert(id == 7); return NULL; }
bStatus_t tmos_msg_deallocate(uint8_t *msg) { (void)msg; return SUCCESS; }
bStatus_t GAP_SetParamValue(uint16_t id, uint16_t value)
{
    assert(id < 40);
    if (param_fail) return INVALIDPARAMETER;
    if (!param_ignore) parameters[id] = value;
    return SUCCESS;
}
uint16_t GAP_GetParamValue(uint16_t id) { assert(id < 40); return parameters[id]; }
bStatus_t GAPRole_SetParameter(uint16_t id, uint16_t len, void *value)
{
    assert(id == GAPROLE_MAX_SCAN_RES && len == 1);
    if (param_fail) return INVALIDPARAMETER;
    if (!param_ignore) max_scan = *(uint8_t *)value;
    return SUCCESS;
}
bStatus_t GAPRole_GetParameter(uint16_t id, void *value)
{
    getters++;
    if (id == GAPROLE_STATE) {
        if (state_fail) return FAILURE;
        *(uint8_t *)value = role_state;
    } else if (id == GAPROLE_ADVERT_ENABLED) {
        if (adv_fail) return FAILURE;
        *(uint8_t *)value = adv;
    } else { assert(id == GAPROLE_MAX_SCAN_RES); *(uint8_t *)value = max_scan; }
    return SUCCESS;
}
bStatus_t GAPRole_CentralInit(void) { return SUCCESS; }
bStatus_t GAPRole_CentralStartDevice(uint8_t id, gapBondCBs_t *bond, gapCentralRoleCB_t *cb)
{
    (void)bond; assert(id == 7); central = cb;
    if (sync_ready) {
        gapRoleEvent_t event = {0}; event.gap.opcode = GAP_DEVICE_INIT_DONE_EVENT;
        central->eventCB(&event);
    }
    return SUCCESS;
}
static void complete(unsigned crowd, uint8_t status)
{
    gapDevRec_t records[64] = {{0}};
    assert(crowd <= 64);
    for (unsigned i = 0; i < crowd; i++) {
        records[i].addrType = i % 2;
        records[i].addr[0] = (uint8_t)i;
        records[i].addr[5] = 0x11;
    }
    scanning = FALSE;
    gapRoleEvent_t event = {0};
    event.discCmpl.opcode = GAP_DEVICE_DISCOVERY_EVENT;
    event.discCmpl.hdr.status = status;
    event.discCmpl.numDevs = (uint8_t)crowd;
    event.discCmpl.pDevList = records;
    central->eventCB(&event);
}
bStatus_t GAPRole_CentralStartDiscovery(uint8_t mode, uint8_t active, uint8_t whitelist)
{
    assert(mode == DEVDISC_MODE_ALL && !active && !whitelist);
    assert(allowed && !adv && !scanning);
    assert(parameters[TGAP_DISC_SCAN] == 4800 && parameters[TGAP_DISC_SCAN_INT] == 16);
    assert(parameters[TGAP_DISC_SCAN_WIND] == 16 && max_scan == 64);
    starts++;
    if (start_fail) return bleIncorrectMode;
    scanning = TRUE;
    if (sync_complete) complete(12, SUCCESS);
    return SUCCESS;
}
bStatus_t GAPRole_CentralCancelDiscovery(void)
{
    cancels++;
    if (cancel_lost) return SUCCESS;
    scanning = FALSE;
    return bleIncorrectMode;
}
void ble_disable_advertise(void) { adv = FALSE; }
void ble_enable_advertise(void) { assert(!scanning); adv = TRUE; }
uint8_t frogalert_survey_allowed(void) { return allowed; }
uint8_t frogalert_survey_counter_mode(void) { return TRUE; }
uint8_t frogalert_badgemagic_persistent_advertising(void) { return want_adv; }
void frogalert_badgemagic_disconnect(void) { role_state = GAPROLE_WAITING; }
void frogalert_display_survey_release(void) {}
void frogalert_display_present(const uint16_t frame[44]) { memcpy(panel, frame, sizeof(panel)); writes++; }
void frogalert_survey_radio_idle(void) { assert(!scanning && !adv); idle_handoffs++; }
void frogalert_reset_off(void) { off_resets++; }

static void pump(void)
{
    unsigned count = 0;
    while (pending) {
        assert(++count < 64 && "timer success must not create an immediate wake loop");
        uint16_t events = pending; pending = stopped = 0;
        in_handler = TRUE; dispatches++;
        uint16_t remaining = handler(7, events);
        in_handler = FALSE;
        // Pinned TMOS merges fresh events with unconsumed handler bits.
        pending |= remaining & ~stopped;
    }
}
static void wake(void)
{
    assert(timer); clock_now = timer_at; timer = FALSE;
    pending |= WAKE_EVENT; pump();
}
static void boot(uint32_t now)
{
    clock_now = now; pending = stopped = timer = in_handler = 0;
    memset(parameters, 0, sizeof(parameters));
    memset(panel, 0, sizeof(panel));
    allowed = TRUE; role_state = GAPROLE_WAITING;
    adv = want_adv = max_scan = 0;
    timer_fail = state_fail = adv_fail = param_fail = param_ignore = 0;
    start_fail = cancel_lost = scanning = sync_complete = 0; sync_ready = TRUE;
    starts = cancels = dispatches = allocations = timer_calls = getters = 0;
    idle_handoffs = off_resets = writes = 0;
    frogalert_survey_role_init(); frogalert_survey_init(); pump();
    assert(!pending && timer && timer_at == now + 24000);
    assert(dispatches == 1);
}
static void report(unsigned device, uint8_t opcode)
{
    uint8_t malformed[] = {5, 0xff};
    gapRoleEvent_t e = {0};
    e.gap.opcode = opcode;
    if (opcode == GAP_DEVICE_INFO_EVENT) {
        e.deviceInfo.addrType = device % 2; e.deviceInfo.addr[0] = (uint8_t)device;
        e.deviceInfo.addr[5] = 0x11; e.deviceInfo.dataLen = sizeof(malformed);
        e.deviceInfo.pEvtData = malformed;
    } else if (opcode == GAP_EXT_ADV_DEVICE_INFO_EVENT) {
        e.deviceExtAdvInfo.addrType = device % 2; e.deviceExtAdvInfo.addr[0] = (uint8_t)device;
        e.deviceExtAdvInfo.addr[5] = 0x11;
    } else {
        e.deviceDirectInfo.addrType = device % 2; e.deviceDirectInfo.addr[0] = (uint8_t)device;
        e.deviceDirectInfo.addr[5] = 0x11;
    }
    central->eventCB(&e);
}
static void count_is(unsigned n)
{
    for (unsigned x = 0; x < 5; x++) {
        assert(panel[20+x] == (uint16_t)(font5x7['0'+n/10-' '][1+x] << 2));
        assert(panel[26+x] == (uint16_t)(font5x7['0'+n%10-' '][1+x] << 2));
    }
}
static void crowds(uint32_t now)
{
    boot(now);
    for (unsigned window = 0; window < 12; window++) {
        wake(); wake(); assert(scanning);
        unsigned before = timer_calls, reads = getters, frames = writes, allocs = allocations;
        uint32_t deadline = timer_at;
        unsigned crowd = window % 2 ? 30 : 12;
        for (unsigned pass = 0; pass < 4; pass++) {
            for (unsigned i = 0; i < crowd; i++) {
                clock_now++;
                report(i, pass % 3 == 0 ? GAP_DEVICE_INFO_EVENT :
                    pass % 3 == 1 ? GAP_EXT_ADV_DEVICE_INFO_EVENT : GAP_DIRECT_DEVICE_INFO_EVENT);
            }
        }
        assert(timer_calls == before && allocations == allocs && timer_at == deadline);
        assert(getters - reads == crowd * 4 && writes == frames);
        clock_now = deadline - 3200; // Exactly three seconds after scan start.
        complete(crowd, SUCCESS); count_is(crowd);
        assert(timer && timer_at == clock_now + 26800 && !pending);
    }
}
static void state_guards(void)
{
    const uint8_t unavailable[] = {GAPROLE_INIT, GAPROLE_ERROR, GAPROLE_CONNECTED,
        GAPROLE_CONNECTED_ADV, 0x0f};
    for (unsigned i = 0; i < sizeof(unavailable); i++) {
        boot(0); role_state = unavailable[i];
        wake(); assert(!starts); // Never authorize a new scan from these states.
        role_state = GAPROLE_WAITING; wake();
        role_state = unavailable[i]; wake(); assert(!starts); // Quiet boundary too.
    }
    for (unsigned failure = 0; failure < 2; failure++) {
        boot(0); state_fail = failure == 0; adv_fail = failure == 1;
        wake(); assert(!starts);
    }
    for (unsigned i = 0; i < 2; i++) {
        boot(0); wake(); wake();
        role_state = unavailable[i]; // INIT/ERROR while discovery is active.
        for (unsigned n = 0; n < 3; n++) report(n, GAP_DEVICE_INFO_EVENT);
        assert(scanning && !cancels);
        clock_now += 4800; complete(12, SUCCESS); count_is(12);
        wake(); assert(starts == 1); // Completion is valid, but no new scan yet.
        allowed = FALSE;
        frogalert_survey_prepare_shutdown();
        assert(!idle_handoffs); // Unavailable state still cannot authorize poweroff.
        role_state = GAPROLE_WAITING; wake(); assert(idle_handoffs == 1);
    }
    for (unsigned failure = 0; failure < 4; failure++) {
        boot(0); wake(); wake(); report(0, GAP_DEVICE_INFO_EVENT);
        if (failure == 0) role_state = GAPROLE_CONNECTED;
        if (failure == 1) state_fail = TRUE;
        if (failure == 2) role_state = 0x0f;
        if (failure == 3) allowed = FALSE;
        report(1, GAP_DEVICE_INFO_EVENT);
        assert(cancels == 1 && !scanning);
        role_state = GAPROLE_WAITING; state_fail = FALSE; allowed = TRUE;
        complete(12, SUCCESS); count_is(0); // Cancelled/late data stays discarded.
    }
}
static void timer_failures(void)
{
    boot(0); timer_fail = TRUE; wake();
    assert(!timer && !pending && !starts);
    unsigned before = timer_calls;
    for (unsigned n = 0; n < 20; n++) report(n, GAP_DEVICE_INFO_EVENT);
    assert(timer_calls == before && !pending); // Reports cannot amplify a failure.
    clock_now += 320; frogalert_survey_poll();
    assert(!timer && !pending && !starts && timer_calls == before + 1);
    timer_fail = FALSE; clock_now += 320; frogalert_survey_poll();
    assert(scanning && timer && !pending && starts == 1);

    boot(0); wake(); wake(); cancel_lost = timer_fail = TRUE; allowed = FALSE;
    frogalert_survey_prepare_shutdown();
    unsigned polls = 0;
    while (!off_resets) {
        assert(++polls <= 150);
        clock_now += 320; frogalert_survey_poll();
        assert(!pending && !idle_handoffs);
    }
    assert(polls == 150 && off_resets == 1); // 30-second off deadline survives timer loss.
}
static void settings_and_callbacks(void)
{
    for (unsigned failure = 0; failure < 3; failure++) {
        boot(0); wake();
        if (failure == 0) param_fail = TRUE;
        else param_ignore = TRUE;
        if (failure == 2) {
            // All timing settings correct but the SDK ignores the capacity write.
            parameters[TGAP_DISC_SCAN] = 4800; parameters[TGAP_DISC_SCAN_INT] = 16;
            parameters[TGAP_DISC_SCAN_WIND] = 16; parameters[TGAP_FILTER_ADV_REPORTS] = TRUE;
        }
        wake(); assert(!starts && !scanning);
        param_fail = param_ignore = FALSE;
        wake(); wake(); assert(starts == 1 && scanning);
    }
    boot(0); wake(); sync_complete = TRUE; wake();
    count_is(12);
    assert(starts == 1 && !scanning && timer_at == clock_now + 26800);

    boot(0); wake(); start_fail = TRUE; wake();
    assert(starts == 1 && !scanning && timer_at == clock_now + 16000);
    start_fail = FALSE; wake(); wake(); assert(starts == 2 && scanning);

    boot(0); adv = want_adv = TRUE; role_state = GAPROLE_ADVERTISING;
    wake(); assert(!adv && !scanning);
    role_state = GAPROLE_WAITING; wake(); assert(scanning);
    clock_now += 4800; complete(12, SUCCESS); assert(adv && !scanning);
}
int main(void)
{
    // Distinguishable glyphs verify both digits through the real Rust renderer.
    for (unsigned n = 0; n < 10; n++)
        for (unsigned x = 1; x < 6; x++) font5x7['0'+n-' '][x] = n + 1;
    crowds(0); crowds(UINT32_MAX - 100000U);
    state_guards(); timer_failures(); settings_and_callbacks();
    puts("FrogAlert production survey adapter: scheduler, crowds, states and SDK faults passed");
}
