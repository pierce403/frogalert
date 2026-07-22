#![no_std]
#![no_main]
#![feature(impl_trait_in_assoc_type)]

#[cfg(not(feature = "hardware-rev1"))]
compile_error!("select an exact board target with --features hardware-rev1");

use core::cell::RefCell;
use core::fmt::Write;

use ch58x_hal as hal;
use embassy_executor::Spawner;
use embassy_time::{Duration, Timer};
use frogalert_core::display::FrameBuffer;
use frogalert_core::scan::ScanCounter;
use frogalert_display::BadgeDisplay;
use frogalert_recovery::{frogalert_enter_rom_isp, Key2RecoveryHold};
use hal::ble::ffi::*;
use hal::ble::gap::*;
use hal::gpio::{Input, Pull};
use hal::interrupt::{Interrupt, Priority};
use hal::peripherals;
use hal::uart::UartTx;
use hal::{ble, pac};

type CriticalMutex<T> = critical_section::Mutex<RefCell<T>>;

const SCAN_TICKS: u16 = 4_800; // 4,800 * 0.625 ms = 3 seconds
const RESULT_HOLD_TICKS: u32 = 11_200; // 7 seconds
const SCAN_RETRY_TICKS: u32 = 1_600; // 1 second
const MAX_UNIQUE_DEVICES: usize = 64;
const CONTROLLER_SCAN_RESULTS: usize = MAX_UNIQUE_DEVICES + 1;
const TIMER_PERIOD_60MHZ: u32 = 15_000; // 250 microseconds
const KEY2_POLL_TICKS: u32 = 320; // 320 * 0.625 ms = 200 ms

struct SharedState {
    counter: ScanCounter<MAX_UNIQUE_DEVICES>,
    frame: FrameBuffer,
    next_scan_tick: u32,
    scan_waiting: bool,
    report_ready: bool,
    last_count: usize,
    last_saturated: bool,
    scan_start_error: Option<u8>,
    display_pair: usize,
    display_pwm_phase: u8,
}

impl SharedState {
    const fn new() -> Self {
        Self {
            counter: ScanCounter::new(),
            frame: FrameBuffer::new(),
            next_scan_tick: 0,
            scan_waiting: false,
            report_ready: false,
            last_count: 0,
            last_saturated: false,
            scan_start_error: None,
            display_pair: 0,
            display_pwm_phase: 0,
        }
    }
}

// The QingKe V4 core must not use hardware atomic read/modify/write
// instructions. All callback/ISR shared state is therefore guarded by the
// qingke critical-section implementation on the atomic-free IMC target.
static STATE: CriticalMutex<SharedState> = CriticalMutex::new(RefCell::new(SharedState::new()));

unsafe extern "C" fn observer_event_callback(event: &gapRoleEvent_t) {
    match event.gap.opcode {
        GAP_DEVICE_INIT_DONE_EVENT => start_discovery(),
        GAP_DEVICE_INFO_EVENT => {
            let report = event.deviceInfo;
            observe_address(report.addr);
        }
        GAP_DIRECT_DEVICE_INFO_EVENT => {
            let report = event.deviceDirectInfo;
            observe_address(report.addr);
        }
        GAP_EXT_ADV_DEVICE_INFO_EVENT => {
            let report = event.deviceExtAdvInfo;
            observe_address(report.addr);
        }
        GAP_DEVICE_DISCOVERY_EVENT => {
            critical_section::with(|cs| {
                let mut state = STATE.borrow(cs).borrow_mut();
                let count = state.counter.count();
                let saturated = state.counter.is_saturated();
                state.frame.render_device_count(count, saturated);
                state.last_count = count;
                state.last_saturated = saturated;
                state.counter.clear();
                state.next_scan_tick = TMOS_GetSystemClock().wrapping_add(RESULT_HOLD_TICKS);
                state.scan_waiting = true;
                state.report_ready = true;
            });
        }
        _ => {}
    }
}

fn observe_address(address: [u8; 6]) {
    critical_section::with(|cs| {
        STATE.borrow(cs).borrow_mut().counter.observe(address);
    });
}

unsafe fn start_discovery() {
    let result = GAPRole_ObserverStartDiscovery(DEVDISC_MODE_ALL, 0, 0);
    critical_section::with(|cs| {
        let mut state = STATE.borrow(cs).borrow_mut();
        match result {
            Ok(()) => {
                state.scan_waiting = false;
                state.scan_start_error = None;
            }
            Err(status) => {
                state.next_scan_tick = TMOS_GetSystemClock().wrapping_add(SCAN_RETRY_TICKS);
                state.scan_waiting = true;
                state.scan_start_error = Some(status.get());
            }
        }
    });
}

fn scan_due(now: u32, deadline: u32) -> bool {
    now.wrapping_sub(deadline) as i32 >= 0
}

fn init_display_timer() {
    let timer = unsafe { &*pac::TMR0::PTR };
    unsafe {
        timer.cnt_end().write(|w| w.bits(TIMER_PERIOD_60MHZ));
        timer.ctrl_mod().write(|w| w.tmr_all_clear().set_bit());
        timer.ctrl_mod().write(|w| w.tmr_count_en().set_bit());
        timer.inter_en().write(|w| w.tmr_ie_cyc_end().set_bit());
    }
    hal::interrupt::TMR0::set_priority(Priority::P3);
    unsafe {
        hal::interrupt::TMR0::enable();
    }
}

fn stop_display_timer() {
    hal::interrupt::TMR0::disable();
    let timer = unsafe { &*pac::TMR0::PTR };
    timer.inter_en().write(|w| unsafe { w.bits(0) });
    timer.ctrl_mod().write(|w| w.tmr_all_clear().set_bit());
    timer.int_flag().write(|w| unsafe { w.bits(0x1f) });
    hal::interrupt::TMR0::unpend();
}

fn stop_embassy_systick() {
    let systick = unsafe { &*pac::SYSTICK::PTR };
    systick
        .ctlr()
        .modify(|_, w| w.stie().clear_bit().ste().clear_bit());
    systick.sr().write(|w| w.cntif().clear_bit());
    unsafe {
        let interrupt = qingke_rt::CoreInterrupt::SysTick as u8;
        qingke::pfic::disable_interrupt(interrupt);
        qingke::pfic::unpend_interrupt(interrupt);
    }
}

fn enter_rom_isp() -> ! {
    // Ask the observer role to stop before shutting off interrupts. The ROM
    // startup path will reset the controller; this call only avoids leaving a
    // scan callback active while the display GPIO is being released.
    unsafe {
        let _ = GAPRole_ObserverCancelDiscovery();
        let _ = RF_Shut();
    }
    qingke::register::gintenr::set_disable();
    stop_display_timer();
    stop_embassy_systick();
    BadgeDisplay::release_all();
    unsafe { frogalert_enter_rom_isp() }
}

#[qingke_rt::interrupt]
fn TMR0() {
    let timer = unsafe { &*pac::TMR0::PTR };
    timer.int_flag().write(|w| w.tmr_if_cyc_end().set_bit());

    critical_section::with(|cs| {
        let mut state = STATE.borrow(cs).borrow_mut();
        // Match the upstream 250 us on / 250 us released cadence: 22 pairs
        // refresh at about 91 Hz. A four-phase cadence would fall near 45 Hz
        // and is too likely to visibly flicker.
        let phase = state.display_pwm_phase & 1;
        state.display_pwm_phase = state.display_pwm_phase.wrapping_add(1);
        if phase == 0 {
            let pair = state.display_pair % 22;
            state.display_pair = state.display_pair.wrapping_add(1);
            BadgeDisplay::refresh_pair(pair, state.frame.columns());
        } else {
            BadgeDisplay::release_all();
        }
    });
}

#[embassy_executor::main(entry = "qingke_rt::entry")]
#[qingke_rt::highcode]
async fn main(_spawner: Spawner) -> ! {
    let mut config = hal::Config::default();
    config.clock.use_pll_60mhz().enable_lse();
    let peripherals = hal::init(config);
    hal::embassy::init();

    let key2 = Input::new(peripherals.PB22, Pull::Up);
    let mut uart = UartTx::new(peripherals.UART1, peripherals.PA9, Default::default()).unwrap();

    critical_section::with(|cs| {
        STATE
            .borrow(cs)
            .borrow_mut()
            .frame
            .render_device_count(0, false);
    });
    init_display_timer();

    let _ = writeln!(&mut uart, "FrogAlert count prototype / HARDWARE_REV1");
    let _ = writeln!(
        &mut uart,
        "BLE observer only; BadgeMagic GATT is not present in this lab build"
    );
    let _ = ble::init(ble::Config::default()).unwrap();
    unsafe {
        GAPRole_ObserverInit().unwrap();
        // Keep one controller slot above the app's retained-address capacity so
        // a 65th unique report can turn the display into an honest `64+`.
        let max_scan_results = CONTROLLER_SCAN_RESULTS as u8;
        GAPRole_SetParameter(
            GAPROLE_MAX_SCAN_RES,
            core::mem::size_of_val(&max_scan_results) as u16,
            (&max_scan_results as *const u8).cast(),
        )
        .unwrap();
        GAP_SetParamValue(TGAP_DISC_SCAN, SCAN_TICKS).unwrap();
        GAP_SetParamValue(TGAP_DISC_SCAN_PHY, GAP_PHY_BIT_LE_1M).unwrap();
    }

    static CALLBACK: gapRoleObserverCB_t = gapRoleObserverCB_t {
        eventCB: Some(observer_event_callback),
    };
    unsafe {
        GAPRole_ObserverStartDevice(&CALLBACK).unwrap();
    }

    let mut recovery_hold = Key2RecoveryHold::new();
    let mut next_key2_tick = unsafe { TMOS_GetSystemClock() }.wrapping_add(KEY2_POLL_TICKS);
    loop {
        Timer::after(Duration::from_micros(300)).await;
        unsafe {
            TMOS_SystemProcess();
        }

        let now = unsafe { TMOS_GetSystemClock() };
        if scan_due(now, next_key2_tick) {
            next_key2_tick = now.wrapping_add(KEY2_POLL_TICKS);
            if recovery_hold.sample(key2.is_low()) {
                enter_rom_isp();
            }
        }

        let (report, scan_start_error) = critical_section::with(|cs| {
            let mut state = STATE.borrow(cs).borrow_mut();
            let report = if state.report_ready {
                state.report_ready = false;
                Some((state.last_count, state.last_saturated))
            } else {
                None
            };
            let scan_start_error = state.scan_start_error.take();
            (report, scan_start_error)
        });
        if let Some((count, saturated)) = report {
            let _ = writeln!(
                &mut uart,
                "scan complete: {}{} nearby BLE devices",
                count,
                if saturated { "+" } else { "" }
            );
        }
        if let Some(status) = scan_start_error {
            let _ = writeln!(
                &mut uart,
                "scan start returned BLE status 0x{:02x}; retrying in 1 second",
                status
            );
        }

        let restart_scan = critical_section::with(|cs| {
            let mut state = STATE.borrow(cs).borrow_mut();
            if state.scan_waiting {
                let now = unsafe { TMOS_GetSystemClock() };
                if scan_due(now, state.next_scan_tick) {
                    state.scan_waiting = false;
                    return true;
                }
            }
            false
        });
        if restart_scan {
            unsafe {
                start_discovery();
            }
        }
    }
}

#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    stop_display_timer();
    BadgeDisplay::release_all();
    let pa9 = unsafe { peripherals::PA9::steal() };
    let uart1 = unsafe { peripherals::UART1::steal() };
    if let Ok(mut serial) = UartTx::new(uart1, pa9, Default::default()) {
        let _ = writeln!(&mut serial, "\nFrogAlert panic: {info}");
    }
    loop {
        // The display is released and its timer is disabled above. Sleeping
        // avoids turning an error into a 60 MHz battery drain.
        qingke::riscv::asm::wfi();
    }
}
