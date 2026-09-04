/* SDK allocator/flash faults around the ACTUAL generated BLE receiver. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "frogalert-rust.h"
#define EEPROM_MAX_SIZE 32768U
typedef struct { uint8_t reserved[295]; } badge_cfg_t;
typedef struct __attribute__((packed)) {
    uint8_t magic[6], flash, marquee, modes[8];
    uint16_t sizes[8];
    uint8_t pad6[6], timestamp[6], pad4[4], separator[16];
} data_legacy_t;
_Static_assert(sizeof(data_legacy_t)==64, "legacy header ABI");
static int fail_alloc, fail_flash, saved, reloaded;
static size_t capacity;
static uint8_t *allocated;
static uint8_t expected[80];
static void check_guard(void) {
    if (allocated) for (size_t i=capacity;i<capacity+16;i++) assert(allocated[i]==0xa5);
}
static void *mock_realloc(void *ptr, size_t size) {
    check_guard(); assert(ptr==allocated);
    if (fail_alloc) return NULL;
    allocated=realloc(ptr,size+16); assert(allocated);
    capacity=size;memset(allocated+size,0xa5,16);return allocated;
}
static void mock_free(void *ptr) {
    check_guard();assert(ptr==allocated);free(ptr);allocated=NULL;capacity=0;
}
static uint32_t data_flatSave(uint8_t *data,uint32_t length) {
    check_guard();assert(length==75);assert(!memcmp(data,expected,length));
    saved++;return fail_flash ? 1 : 0;
}
static void handle_after_rx(void) {reloaded++;}
static void RTC_InitTime(uint16_t y,uint16_t m,uint16_t d,uint16_t h,uint16_t n,uint16_t s) {
    (void)y;(void)m;(void)d;(void)h;(void)n;(void)s;
    assert(0 && "zero timestamp must never reach SDK calendar code");
}
#define realloc mock_realloc
#define free mock_free
/* INSERT_PRODUCTION_RECEIVER */
#undef realloc
#undef free

static int upload(void) {
    int status=0;
    for (int i=0;i<5 && !status;i++) status=legacy_ble_rx(expected+i*16,16);
    check_guard();return status;
}
int main(void) {
    memcpy(expected,"wang\0\0",6);expected[17]=1;
    memset(expected+64,0xcc,16);
    assert(upload()==0 && saved==1 && reloaded==1 && !allocated);
    fail_flash=1;assert(upload()==-4 && saved==2 && reloaded==1 && !allocated);fail_flash=0;
    fail_alloc=1;assert(upload()==-3 && !allocated);fail_alloc=0;
    for (int stop=1;stop<5;stop++) {
        for (int i=0;i<stop;i++) assert(legacy_ble_rx(expected+i*16,16)==0);
        legacy_ble_reset();assert(!allocated);
        assert(legacy_ble_rx(expected+64,16)<0);
        assert(upload()==0);
    }
    assert(legacy_ble_rx(expected,16)==0);
    fail_alloc=1;assert(legacy_ble_rx(expected+16,16)==-3 && !allocated);fail_alloc=0;
    assert(legacy_ble_rx(expected,16)==0);
    assert(legacy_ble_rx(expected+16,15)<0 && !allocated);
    assert(upload()==0);
    puts("FrogAlert upload adapter fault emulation passed");
}
