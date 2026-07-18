#![no_std]
#![no_main]

#[cfg(not(feature = "hardware-rev1"))]
compile_error!("select an exact board target with --features hardware-rev1");

use core::cell::RefCell;
use core::fmt::Write;

use ch58x_hal as hal;
use frogalert_display::{Rev1Display, COLUMNS, COLUMN_PAIRS, ROWS};
use hal::interrupt::{Interrupt, Priority};
use hal::pac;
use hal::uart::UartTx;

type CriticalMutex<T> = critical_section::Mutex<RefCell<T>>;

const TIMER_PERIOD_60MHZ: u32 = 15_000; // 250 microseconds / 4 kHz
const WALK_INTERVAL_MS: u16 = 750;
const PIXEL_COUNT: usize = COLUMNS * ROWS;

struct WalkState {
    columns: [u16; COLUMNS],
    x: usize,
    y: usize,
    display_pair: usize,
    display_pwm_phase: u8,
}

impl WalkState {
    const fn new() -> Self {
        Self {
            columns: [0; COLUMNS],
            x: 0,
            y: 0,
            display_pair: 0,
            display_pwm_phase: 0,
        }
    }

    fn select_first(&mut self) {
        self.columns[0] = 1;
    }

    fn advance(&mut self) -> (usize, usize, usize) {
        self.columns[self.x] = 0;
        self.x += 1;
        if self.x == COLUMNS {
            self.x = 0;
            self.y += 1;
            if self.y == ROWS {
                self.y = 0;
            }
        }
        self.columns[self.x] = 1 << self.y;
        let index = self.y * COLUMNS + self.x;
        (self.x, self.y, index)
    }
}

// The QingKe V4 core must not use hardware atomic read/modify/write
// instructions. The foreground/ISR handoff stays inside a critical section on
// the atomic-free IMC target, and the build script audits the final ELF.
static STATE: CriticalMutex<WalkState> = CriticalMutex::new(RefCell::new(WalkState::new()));

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

#[qingke_rt::interrupt]
fn TMR0() {
    let timer = unsafe { &*pac::TMR0::PTR };
    timer.int_flag().write(|w| w.tmr_if_cyc_end().set_bit());

    critical_section::with(|cs| {
        let mut state = STATE.borrow(cs).borrow_mut();
        // Match the upstream 250 us on / 250 us released cadence: 22 pairs
        // refresh at about 91 Hz while the GPIO remains at its 5 mA setting.
        let phase = state.display_pwm_phase & 1;
        state.display_pwm_phase = state.display_pwm_phase.wrapping_add(1);
        if phase == 0 {
            let pair = state.display_pair % COLUMN_PAIRS;
            state.display_pair = state.display_pair.wrapping_add(1);
            Rev1Display::refresh_pair(pair, &state.columns);
        } else {
            Rev1Display::release_all();
        }
    });
}

#[qingke_rt::entry]
#[qingke_rt::highcode]
fn main() -> ! {
    let mut config = hal::Config::default();
    config.clock.use_pll_60mhz();
    let peripherals = hal::init(config);

    let mut uart = UartTx::new(peripherals.UART1, peripherals.PA9, Default::default()).unwrap();

    Rev1Display::release_all();
    critical_section::with(|cs| {
        STATE.borrow(cs).borrow_mut().select_first();
    });
    init_display_timer();

    let _ = writeln!(&mut uart, "FrogAlert pixel walk / HARDWARE_REV1");
    let _ = writeln!(
        &mut uart,
        "single logical pixel; display GPIO drive=5mA; no BLE or LSE"
    );
    let _ = writeln!(&mut uart, "pixel x=00 y=00 index=1/{}", PIXEL_COUNT);

    loop {
        hal::delay_ms(WALK_INTERVAL_MS);
        let (x, y, index) = critical_section::with(|cs| STATE.borrow(cs).borrow_mut().advance());
        let _ = writeln!(
            &mut uart,
            "pixel x={:02} y={:02} index={}/{}",
            x,
            y,
            index + 1,
            PIXEL_COUNT
        );
    }
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    hal::interrupt::TMR0::disable();
    Rev1Display::release_all();
    loop {
        // With the matrix released and Timer0 disabled, sleep instead of
        // turning a fault into a 60 MHz battery drain.
        qingke::riscv::asm::wfi();
    }
}
