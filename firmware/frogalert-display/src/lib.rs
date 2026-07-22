#![no_std]

// SPDX-License-Identifier: Apache-2.0
//
// Hardware behavior and the HARDWARE_REV1 pin map are adapted from FOSSASIA's
// Apache-2.0 badgemagic-firmware release v0.1 at commit
// 68e4ce488d0a011c2e03c631b5cc0c24dff7e1f8 and checked against the clean Rev1
// map at commit aa890e90649f288b02e80002ab82088128bead14. The USB-C map is pinned
// to the working USBC_VERSION=1 source commit
// 9ce885d682b5c56c3ac7595c09e009a210885221 and the photographed
// B1144C_250901 board. This crate must not be used for an unidentified board.

#[cfg(not(any(feature = "hardware-rev1", feature = "hardware-b1144c-250901-usbc")))]
compile_error!("select exactly one supported BadgeMagic display profile");

#[cfg(all(feature = "hardware-rev1", feature = "hardware-b1144c-250901-usbc"))]
compile_error!("BadgeMagic display profiles are mutually exclusive");

use ch58x_hal::pac;

pub const COLUMNS: usize = 44;
pub const ROWS: usize = 11;
pub const COLUMN_PAIRS: usize = COLUMNS / 2;

const PA_MASK: u32 = pin(15) | pin(12) | pin(10) | pin(11) | pin(4);
const PB_MASK: u32 = pin(18)
    | pin(0)
    | pin(7)
    | pin(9)
    | pin(8)
    | pin(15)
    | pin(14)
    | pin(13)
    | pin(12)
    | pin(5)
    | pin(3)
    | pin(4)
    | pin(2)
    | pin(1)
    | pin(T_PIN)
    | pin(21)
    | pin(20)
    | pin(19);

#[derive(Clone, Copy)]
enum Port {
    A,
    B,
}

#[derive(Clone, Copy)]
struct LedPin {
    port: Port,
    number: u8,
}

impl LedPin {
    const fn a(number: u8) -> Self {
        Self {
            port: Port::A,
            number,
        }
    }

    const fn b(number: u8) -> Self {
        Self {
            port: Port::B,
            number,
        }
    }

    const fn mask(self) -> u32 {
        pin(self.number)
    }
}

const LED_PINS: [LedPin; 23] = [
    LedPin::a(15),
    LedPin::b(18),
    LedPin::b(0),
    LedPin::b(7),
    LedPin::a(12),
    LedPin::a(10),
    LedPin::a(11),
    LedPin::b(9),
    LedPin::b(8),
    LedPin::b(15),
    LedPin::b(14),
    LedPin::b(13),
    LedPin::b(12),
    LedPin::b(5),
    LedPin::a(4),
    LedPin::b(3),
    LedPin::b(4),
    LedPin::b(2),
    LedPin::b(1),
    LedPin::b(T_PIN),
    LedPin::b(21),
    LedPin::b(20),
    LedPin::b(19),
];

#[cfg(feature = "hardware-rev1")]
const T_PIN: u8 = 23;

#[cfg(feature = "hardware-b1144c-250901-usbc")]
const T_PIN: u8 = 6;

const fn pin(number: u8) -> u32 {
    1_u32 << number
}

pub struct BadgeDisplay;

impl BadgeDisplay {
    pub fn refresh_pair(pair: usize, columns: &[u16; COLUMNS]) {
        let first = pair * 2;
        drive_pair(pair, columns[first], columns[first + 1]);
    }

    pub fn release_all() {
        unsafe {
            let port_a = &*pac::GPIOA::PTR;
            let port_b = &*pac::GPIOB::PTR;
            port_a.dir().modify(|r, w| w.bits(r.bits() & !PA_MASK));
            port_b.dir().modify(|r, w| w.bits(r.bits() & !PB_MASK));
        }
    }
}

fn drive_pair(drive_index: usize, mut first: u16, mut second: u16) {
    if drive_index == 0 {
        let first_bit = first & 1;
        let second_bit = second & 1;
        first = (first & !1) | second_bit;
        second = (second & !1) | first_bit;
    }

    let mut combined = combine_columns(first, second);
    let drive = LED_PINS[drive_index];
    let mut out_a = 0;
    let mut out_b = 0;
    let mut dir_a = 0;
    let mut dir_b = 0;

    match drive.port {
        Port::A => {
            out_a |= drive.mask();
            dir_a |= drive.mask();
        }
        Port::B => {
            out_b |= drive.mask();
            dir_b |= drive.mask();
        }
    }

    for (index, led_pin) in LED_PINS.iter().copied().enumerate() {
        if index == drive_index {
            continue;
        }
        if combined & 1 != 0 {
            match led_pin.port {
                Port::A => dir_a |= led_pin.mask(),
                Port::B => dir_b |= led_pin.mask(),
            }
        }
        combined >>= 1;
    }

    apply(out_a, dir_a, out_b, dir_b);
}

fn combine_columns(mut first: u16, mut second: u16) -> u32 {
    let mut value = 0;
    value |= ((first & 1) as u32) << 22;
    value |= ((second & 1) as u32) << 23;
    for _ in 0..ROWS {
        first >>= 1;
        second >>= 1;
        value >>= 2;
        value |= ((first & 1) as u32) << 22;
        value |= ((second & 1) as u32) << 23;
    }
    value
}

fn apply(out_a: u32, dir_a: u32, out_b: u32, dir_b: u32) {
    unsafe {
        let port_a = &*pac::GPIOA::PTR;
        let port_b = &*pac::GPIOB::PTR;

        // Float the controlled pins before changing polarity to avoid ghosting
        // or briefly shorting two charlieplex lines.
        let original_dir_a = port_a.dir().read().bits();
        let original_dir_b = port_b.dir().read().bits();
        port_a.dir().write(|w| w.bits(original_dir_a & !PA_MASK));
        port_b.dir().write(|w| w.bits(original_dir_b & !PB_MASK));

        let original_out_a = port_a.out().read().bits();
        let original_out_b = port_b.out().read().bits();
        port_a
            .out()
            .write(|w| w.bits((original_out_a & !PA_MASK) | (out_a & PA_MASK)));
        port_b
            .out()
            .write(|w| w.bits((original_out_b & !PB_MASK) | (out_b & PB_MASK)));

        // Keep prototype drive strength at the lower 5 mA setting.
        let original_drive_a = port_a.pd_drv().read().bits();
        let original_drive_b = port_b.pd_drv().read().bits();
        port_a
            .pd_drv()
            .write(|w| w.bits(original_drive_a & !PA_MASK));
        port_b
            .pd_drv()
            .write(|w| w.bits(original_drive_b & !PB_MASK));

        port_a
            .dir()
            .write(|w| w.bits((original_dir_a & !PA_MASK) | (dir_a & PA_MASK)));
        port_b
            .dir()
            .write(|w| w.bits((original_dir_b & !PB_MASK) | (dir_b & PB_MASK)));
    }
}
