/* This test deliberately remains C: it catches layout/calling-convention drift
 * that a Rust-only simulator cannot observe. The linked library is production. */
#include "frogalert-rust.h"
#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

int main(void)
{
    static const uint8_t font[95][6] = {{0}};
    const uint8_t address[6] = {1,2,3,4,5,6};
    frogalert_input_t in = {1,0,0,0,1};
    frogalert_output_t out;
    assert(offsetof(frogalert_output_t, frame) == 12);
    assert(frogalert_rust_abi() == 0x00030002UL);
    frogalert_runtime_init(0);
    frogalert_runtime_step(0,FA_READY,1,&in,NULL,NULL,0,font,&out);
    assert(out.wake_after == 24000 && out.radio_idle && out.owned);
    frogalert_runtime_step(24000,FA_TICK,0,&in,NULL,NULL,0,font,&out);
    assert(out.wake_after == 400 && !(out.actions & FA_SCAN));
    frogalert_runtime_step(24400,FA_TICK,0,&in,NULL,NULL,0,font,&out);
    assert(out.actions & FA_SCAN); assert(!out.radio_idle);
    frogalert_runtime_step(24401,FA_REPORT,0,&in,address,NULL,0,font,&out);
    in.allowed=0;
    frogalert_runtime_step(24402,FA_SHUTDOWN,0,&in,NULL,NULL,0,font,&out);
    assert(out.actions & FA_CANCEL); assert(!out.owned && !out.radio_idle);
    frogalert_runtime_step(24403,FA_CANCEL_RESULT,1,&in,NULL,NULL,0,font,&out);
    assert(out.actions & FA_SHUTDOWN_IDLE); assert(out.radio_idle);
    assert(out.wake_after == 0);

    uint8_t header[16] = "wang\0";
    uint8_t sizes[16] = {0,1};
    uint8_t packet[16] = {0};
    frogalert_write_t write;
    frogalert_transfer_reset();
    assert(frogalert_transfer_accept(header,16,32767,&write));
    assert(write.restart && write.offset==0 && write.capacity==64 && write.total==0);
    assert(frogalert_transfer_accept(sizes,16,32767,&write));
    assert(write.offset==16 && write.capacity==80 && write.total==0);
    for (int i=2;i<5;i++) assert(frogalert_transfer_accept(packet,16,32767,&write));
    assert(write.total==75 && write.offset==64);
    assert(!frogalert_transfer_accept(packet,16,32767,&write));
    uint16_t clock[6];
    assert(!frogalert_transfer_clock(packet,clock));
    frogalert_wake_t wake;
    const uint8_t top1 = FROGALERT_HARDWARE_PROFILE_ID == 1;
    frogalert_wake_init(&wake, top1, !top1);
    for (int i=0; i<5; i++)
        assert(frogalert_wake_sample(&wake, top1, !top1) == FA_WAKE_WAIT);
    for (int i=0; i<2; i++)
        assert(frogalert_wake_sample(&wake, 0, 0) == FA_WAKE_WAIT);
    assert(frogalert_wake_sample(&wake, 0, 0) == FA_WAKE_BOOT);
    frogalert_wake_init(&wake, 1, 1);
    for (int i=0; i<109; i++)
        assert(frogalert_wake_sample(&wake, 1, 1) == FA_WAKE_WAIT);
    assert(frogalert_wake_sample(&wake, 1, 1) == FA_WAKE_ISP);
    puts("FrogAlert Rust/C ABI conformance passed");
}
