/* This test deliberately remains C: it catches layout/calling-convention drift
 * that a Rust-only simulator cannot observe. The linked library is production. */
#include "frogalert-rust.h"
#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

/* Replay changing 20/30-device crowds through the shipping ABI. Reports in
 * the SDK completion list can supplement live reports, but never double count.
 * A real RF/controller failure is outside this fixture's scope. */
static void test_survey_crowds(uint32_t now)
{
    static const uint8_t font[95][6] = {
        ['0'-' '] = {0, 0x3e, 0x51, 0x49, 0x45, 0x3e},
        ['2'-' '] = {0, 0x42, 0x61, 0x51, 0x49, 0x46},
        ['3'-' '] = {0, 0x21, 0x41, 0x45, 0x4b, 0x31},
    };
    const uint8_t malformed[] = {5, 0xff};
    frogalert_input_t in = {1,0,0,0,1};
    frogalert_output_t out;
    frogalert_runtime_init(0);
    frogalert_runtime_step(now,FA_READY,1,&in,NULL,NULL,0,font,&out);
    for (unsigned window=0; window<10; window++) {
        now += out.wake_after;
        frogalert_runtime_step(now,FA_TICK,0,&in,NULL,NULL,0,font,&out);
        assert(out.wake_after == 400);
        now += out.wake_after;
        frogalert_runtime_step(now,FA_TICK,0,&in,NULL,NULL,0,font,&out);
        assert(out.actions & FA_SCAN);
        frogalert_runtime_step(now,FA_START_RESULT,1,&in,NULL,NULL,0,font,&out);
        const uint8_t crowd = window % 2 ? 20 : 30;
        for (uint8_t pass=0; pass<3; pass++) {
            for (uint8_t i=0; i<crowd; i++) {
                uint8_t address[6] = {i,2,3,4,5,6};
                // Last ten devices arrive only in the completion list. Some
                // live packets have malformed AD: that must not hide an address.
                if (pass == 0 && i >= 20) continue;
                frogalert_runtime_step(now + 1 + pass*32 + i,FA_REPORT,i%2,&in,
                    address,pass == 0 ? malformed : NULL,
                    pass == 0 ? sizeof(malformed) : 0,font,&out);
            }
        }
        now += 4800;
        frogalert_runtime_step(now,FA_COMPLETE,1,&in,NULL,NULL,0,font,&out);
        assert(out.frame_changed && out.owned && out.radio_idle);
        for (unsigned x=0; x<5; x++) {
            assert(out.frame[20+x] == (uint16_t)(font['0'+crowd/10-' '][1+x] << 2));
            assert(out.frame[26+x] == (uint16_t)(font['0'-' '][1+x] << 2));
        }
        assert(out.wake_after == 26800); // Next start remains 20 seconds apart.
    }
}

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
    test_survey_crowds(0);
    test_survey_crowds(UINT32_MAX - 100000U);
    puts("FrogAlert Rust/C ABI conformance passed, including repeated 20/30-device surveys");
}
