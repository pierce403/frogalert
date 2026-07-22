#![no_std]

/// Model the pinned FOSSASIA USB-C source `9ce885d` recovery affordance:
/// its 200 ms task transfers after more than ten consecutive held samples.
pub const KEY2_POLL_MS: u16 = 200;
pub const KEY2_HOLD_SAMPLES: u8 = 11;
pub const KEY2_HOLD_MS: u16 = KEY2_POLL_MS * KEY2_HOLD_SAMPLES as u16;

/// Accumulates active-low KEY2 time without interpreting a short press.
///
/// Callers must sample at [`KEY2_POLL_MS`]. Releasing KEY2 resets the counter. A
/// completed hold fires once and remains latched until a release because the
/// caller should immediately quiesce its peripherals and enter the ROM ISP.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Key2RecoveryHold {
    held_samples: u8,
    triggered: bool,
}

impl Key2RecoveryHold {
    pub const fn new() -> Self {
        Self {
            held_samples: 0,
            triggered: false,
        }
    }

    pub fn sample(&mut self, pressed: bool) -> bool {
        if !pressed {
            self.held_samples = 0;
            self.triggered = false;
            return false;
        }
        if self.triggered {
            return false;
        }

        self.held_samples = self.held_samples.saturating_add(1);
        if self.held_samples >= KEY2_HOLD_SAMPLES {
            self.triggered = true;
            return true;
        }
        false
    }

    pub const fn held_ms(&self) -> u16 {
        self.held_samples as u16 * KEY2_POLL_MS
    }
}

/// Transfer to the CH582 startup path at absolute address zero.
///
/// Pinned FOSSASIA USB-C source `9ce885d` uses `j 0x00` while KEY2/PB22 remains
/// low. `jr zero` expresses
/// the same absolute target without relying on assembler interpretation of a
/// numeric PC-relative jump. The CH582 mask-ROM ISP remains the bootloader; this
/// function does not install or replace one.
///
/// # Safety
///
/// The caller must first stop peripheral activity, release driven display
/// lines, and ensure KEY2 is still low. This function disables global
/// interrupts and never returns.
#[cfg(target_arch = "riscv32")]
#[inline(never)]
#[no_mangle]
pub unsafe extern "C" fn frogalert_enter_rom_isp() -> ! {
    qingke::register::gintenr::set_disable();
    core::arch::asm!("fence iorw, iorw", "jr zero", options(noreturn));
}

#[cfg(test)]
mod tests {
    use super::{Key2RecoveryHold, KEY2_HOLD_MS, KEY2_HOLD_SAMPLES};

    #[test]
    fn requires_a_complete_continuous_hold() {
        let mut hold = Key2RecoveryHold::new();
        for _ in 0..KEY2_HOLD_SAMPLES - 1 {
            assert!(!hold.sample(true));
        }
        assert_eq!(hold.held_ms(), 2_000);
        assert!(hold.sample(true));
        assert_eq!(hold.held_ms(), KEY2_HOLD_MS);
        assert!(!hold.sample(true), "a completed hold fires only once");
    }

    #[test]
    fn release_resets_partial_and_completed_holds() {
        let mut hold = Key2RecoveryHold::new();
        for _ in 0..5 {
            assert!(!hold.sample(true));
        }
        assert!(!hold.sample(false));
        assert_eq!(hold.held_ms(), 0);
        for _ in 0..KEY2_HOLD_SAMPLES - 1 {
            assert!(!hold.sample(true));
        }
        assert!(hold.sample(true));
        assert!(!hold.sample(false));
        assert_eq!(hold.held_ms(), 0);
        for _ in 0..KEY2_HOLD_SAMPLES - 1 {
            assert!(!hold.sample(true));
        }
        assert!(hold.sample(true));
    }
}
