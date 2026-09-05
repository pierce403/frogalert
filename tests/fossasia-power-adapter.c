/* Execute the production shutdown adapter against register/SDK fakes. This
 * catches the PB8/PB22 mux regression and stale sources at the sleep boundary;
 * it does not emulate current draw or the MCU's WFI electrical behavior. */
#include <assert.h>
#include <setjmp.h>
#include <stdint.h>
#include <stdio.h>
#define FROGALERT_SURVEY 1
#define FROGALERT_PROFILE_B1144C_250901_USB_C 1
#define __INTERRUPT
#define __HIGH_CODE
#define TRUE 1
#define FALSE 0
#define ENABLE 1
#define DISABLE 0
#define KEY1_PIN 2U
#define KEY2_PIN (1U << 22)
#define KEY2 1
#define CHARGE_STT_PIN 1U
#define GPIO_Pin_All 0xffffffffU
#define RB_PIN_INTX 0x2000
#define RB_SLP_USB_WAKE 1
#define RB_SLP_USB2_WAKE 2
#define RB_SLP_RTC_WAKE 8
#define RB_SLP_GPIO_WAKE 16
#define RB_SLP_BAT_WAKE 32
#define RB_ADC_POWER_ON 1
#define RB_ADC_BUF_EN 2
#define RB_PIN_USB_IE 128
#define RB_PIN_USB_DP_PU 256
#define RST_STATUS_RPOR 1
#define GPIO_A_IRQn 26
#define GPIO_B_IRQn 27
#define Long_Delay 0
#define GPIO_ModeIN_PD 0
#define GPIO_ModeIN_PU 1
#define GPIO_ModeIN_Floating 2
#define GPIO_ITMode_RiseEdge 0
#define GPIO_ITMode_FallEdge 1
static struct { uint32_t IRER[2], IPRR[2]; } pfic;
#define PFIC (&pfic)
static uint16_t R16_PA_INT_EN, R16_PB_INT_EN, R16_PIN_ANALOG_IE;
static uint8_t R8_GLOB_RESET_KEEP, R8_USB_INT_EN, R8_USB_CTRL, R8_UDEV_CTRL, R8_ADC_CFG;
static uint16_t pa_flags, pb_flags, remap;
static uint32_t enabled;
static uint8_t wake_sources, reset_status, held;
static unsigned delay_ms;
static jmp_buf shutdown;
static void GPIOA_ModeCfg(uint32_t pin, int mode) { (void)pin; (void)mode; }
static void GPIOB_ModeCfg(uint32_t pin, int mode) { (void)pin; (void)mode; }
#if FROGALERT_HARDWARE_PROFILE_ID == 1
static void GPIOA_ITModeCfg(uint32_t pin, int mode) {
    assert(mode == GPIO_ITMode_RiseEdge); R16_PA_INT_EN |= pin;
}
static int btn_key1_pressed(void) { return held; }
#endif
static void GPIOB_ITModeCfg(uint32_t pin, int mode) {
    assert(mode == GPIO_ITMode_FallEdge);
    R16_PB_INT_EN |= (uint16_t)(pin | ((pin & (3U << 22)) >> 14));
}
static void GPIOPinRemap(int on, uint16_t bits) { assert(on); remap |= bits; }
static int isPressed(int key) { assert(key == KEY2); return held; }
static void DelayMs(unsigned ms) { delay_ms += ms; }
static void PWR_PeriphWakeUpCfg(int on, uint8_t bits, int mode) {
    (void)mode; if (on) wake_sources |= bits; else wake_sources &= ~bits;
}
static void PFIC_EnableIRQ(int irq) { enabled |= 1U << irq; }
static void PFIC_DisableIRQ(int irq) { enabled &= ~(1U << irq); }
static void PFIC_ClearPendingIRQ(int irq) { (void)irq; }
static void GPIOA_ClearITFlagBit(uint16_t pins) { pa_flags &= ~pins; }
static void GPIOB_ClearITFlagBit(uint16_t pins) { pb_flags &= ~pins; }
static uint16_t GPIOA_ReadITFlagPort(void) { return pa_flags; }
static uint16_t GPIOB_ReadITFlagBit(uint32_t pin) { return pb_flags & (pin >> 14); }
static void SYS_ResetKeepBuf(uint8_t value) { R8_GLOB_RESET_KEEP = value; }
static uint8_t SYS_GetLastResetSta(void) { return reset_status; }
static void SYS_ResetExecute(void) { longjmp(shutdown, 2); }
static void LowPower_Shutdown(uint8_t retention) {
    assert(retention == 0);
    assert(wake_sources == RB_SLP_GPIO_WAKE);
    assert(remap & RB_PIN_INTX); // Otherwise bit 8 listens to the floating LED PB8.
    assert(R16_PB_INT_EN == (1U << 8));
    assert(R16_PA_INT_EN == (FROGALERT_HARDWARE_PROFILE_ID == 1 ? KEY1_PIN : 0));
    assert(pa_flags == 0 && pb_flags == 0);
    assert(enabled == ((1U << GPIO_B_IRQn) | (FROGALERT_HARDWARE_PROFILE_ID == 1 ? 1U << GPIO_A_IRQn : 0)));
    assert(pfic.IRER[0] == 0xffffffffU && pfic.IRER[1] == 0xffffffffU);
    assert(pfic.IPRR[0] == 0xffffffffU && pfic.IPRR[1] == 0xffffffffU);
    assert(R8_USB_CTRL == 0 && R8_USB_INT_EN == 0 && R8_UDEV_CTRL == 0);
    assert(!(R16_PIN_ANALOG_IE & (RB_PIN_USB_IE | RB_PIN_USB_DP_PU)));
    assert(!(R8_ADC_CFG & (RB_ADC_POWER_ON | RB_ADC_BUF_EN)));
    assert(R8_GLOB_RESET_KEEP == 0xa7);
    assert(delay_ms == (held ? 300U : 60U));
    longjmp(shutdown, 1);
}
/* PRODUCTION_POWER */
int main(void) {
    for (held = 0; held < 2; held++) {
        R16_PA_INT_EN = R16_PB_INT_EN = pa_flags = pb_flags = 0xffff;
        R8_USB_CTRL = R8_USB_INT_EN = R8_UDEV_CTRL = R8_ADC_CFG = 0xff;
        R16_PIN_ANALOG_IE = 0xffff;
        wake_sources = 0x3b; delay_ms = 0; enabled = remap = 0;
        int result = setjmp(shutdown);
        if (!result) poweroff();
        assert(result == 1);
    }
    for (reset_status = 0; reset_status < 8; reset_status++) {
        R8_GLOB_RESET_KEEP = 0xa7;
        assert(frogalert_consume_screen_off_wake() == (reset_status != RST_STATUS_RPOR));
        assert(R8_GLOB_RESET_KEEP == (reset_status != RST_STATUS_RPOR ? 0xa7 : 0));
    }
    for (unsigned marker = 0; marker < 256; marker++) {
        if (marker == 0xa7) continue;
        R8_GLOB_RESET_KEEP = marker;
        assert(!frogalert_consume_screen_off_wake());
        assert(R8_GLOB_RESET_KEEP == 0);
    }
    pa_flags = CHARGE_STT_PIN;
    GPIOA_IRQHandler(); // A charger/spurious port interrupt must not reset.
    assert(pa_flags == 0);
    pb_flags = 1;
    GPIOB_IRQHandler();
    assert(pb_flags == 0);
    int result = setjmp(shutdown);
    if (!result) { pb_flags = 1U << 8; GPIOB_IRQHandler(); }
    assert(result == 2);
    R8_GLOB_RESET_KEEP = 0;
    result = setjmp(shutdown);
    if (!result) frogalert_reset_off();
    assert(result == 2 && R8_GLOB_RESET_KEEP == 0xa7);
    puts("Production shutdown register/SDK fault fixture passed");
}
