#ifndef FROGALERT_RUST_H
#define FROGALERT_RUST_H
#include <stdint.h>

/* Primitive ABI v3.2. Calls run during early boot or on the TMOS thread, never an ISR.
 * Pointers cover the declared size; outputs must not alias inputs. Rust retains
 * no caller pointers and makes no callbacks into the SDK. */
typedef struct { uint8_t allowed, connected, advertising, wants_advertising, counter_view; } frogalert_input_t;
typedef struct {
    uint32_t actions, wake_after;
    uint8_t owned, radio_idle, frame_changed, reserved;
    uint16_t frame[44];
} frogalert_output_t;
typedef struct { uint32_t offset, capacity, total, restart; } frogalert_write_t;
_Static_assert(sizeof(frogalert_input_t) == 5, "Rust input ABI drift");
_Static_assert(sizeof(frogalert_output_t) == 100, "Rust output ABI drift");
_Static_assert(sizeof(frogalert_write_t) == 16, "Rust transfer ABI drift");
enum { FA_TICK, FA_READY, FA_START_RESULT, FA_CANCEL_RESULT, FA_COMPLETE,
       FA_REPORT, FA_SUSPEND, FA_SHUTDOWN, FA_RESUME, FA_VIEW };
enum { FA_START_ROLE=1, FA_STOP_ADV=2, FA_SCAN=4, FA_CANCEL=8,
       FA_ADVERTISE=16, FA_SHUTDOWN_IDLE=32, FA_DISCONNECT=64, FA_RESET_OFF=128 };
uint32_t frogalert_rust_abi(void);
void frogalert_runtime_init(uint8_t frogs);
void frogalert_runtime_step(uint32_t now, uint8_t event, uint8_t value,
    const frogalert_input_t *input, const uint8_t *address,
    const uint8_t *data, uint16_t length, const uint8_t font[95][6],
    frogalert_output_t *output);
void frogalert_transfer_reset(void);
uint8_t frogalert_transfer_clock(const uint8_t timestamp[6], uint16_t clock[6]);
uint8_t frogalert_transfer_accept(const uint8_t *data, uint16_t length,
    uint32_t max_data, frogalert_write_t *output);
void frogalert_display_present(const uint16_t frame[44]);
void frogalert_badgemagic_disconnect(void);
void frogalert_reset_off(void);
/* Pure early-boot state, sampled every 20 ms outside interrupts. */
typedef struct { uint8_t key, held, released, qualified; } frogalert_wake_t;
_Static_assert(sizeof(frogalert_wake_t) == 4, "Rust wake ABI drift");
enum { FA_WAKE_WAIT, FA_WAKE_SLEEP, FA_WAKE_BOOT, FA_WAKE_ISP };
void frogalert_wake_init(frogalert_wake_t *state, uint8_t key1, uint8_t key2);
uint8_t frogalert_wake_sample(frogalert_wake_t *state, uint8_t key1, uint8_t key2);
#endif
