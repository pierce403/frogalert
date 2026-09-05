//! Wake qualification at 20 ms intervals, before USB, BLE or the panel starts.
//! Hardware owns sampling and shutdown; this state is caller-owned, never global.
#[derive(Default)]
#[repr(C)]
pub struct Wake {
    key: u8,
    held: u8,
    released: u8,
    qualified: u8,
}

#[derive(Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Action {
    Wait,
    Sleep,
    Boot,
    Isp,
}

impl Wake {
    /// KEY2 wins simultaneous presses so recovery cannot be stolen by KEY1.
    pub fn new(key1: bool, key2: bool) -> Self {
        Self {
            key: if key2 { 2 } else { u8::from(key1) },
            ..Self::default()
        }
    }

    pub fn sample(&mut self, profile: u8, key1: bool, key2: bool) -> Action {
        if !matches!(profile, 1 | 2) || self.key == 0 || (profile == 2 && self.key == 1) {
            return Action::Sleep;
        }
        let pressed = if self.key == 2 { key2 } else { key1 };
        if pressed {
            self.released = 0;
            self.held = self.held.saturating_add(1);
            if self.held >= 5 {
                self.qualified = 1;
            } // 100 ms continuous press.
            if self.key == 2 && self.held >= 110 {
                return Action::Isp;
            }
        } else {
            self.held = 0; // Bounce must never accumulate into a recovery hold.
            self.released = self.released.saturating_add(1);
            if self.released >= 3 {
                // Consume 60 ms of release before button polling.
                return if self.qualified != 0 && self.key == if profile == 1 { 1 } else { 2 } {
                    Action::Boot
                } else {
                    Action::Sleep
                };
            }
        }
        Action::Wait
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(w: &mut Wake, profile: u8) -> Action {
        assert_eq!(w.sample(profile, false, false), Action::Wait);
        assert_eq!(w.sample(profile, false, false), Action::Wait);
        w.sample(profile, false, false)
    }
    #[test]
    fn glitches_never_boot_either_profile() {
        for profile in [1, 2] {
            for key in [1, 2] {
                for ticks in 0..5 {
                    let mut w = Wake::new(key == 1, key == 2);
                    if profile == 2 && key == 1 {
                        assert_eq!(w.sample(profile, true, false), Action::Sleep);
                        continue;
                    }
                    for _ in 0..ticks {
                        assert_eq!(w.sample(profile, key == 1, key == 2), Action::Wait);
                    }
                    assert_eq!(release(&mut w, profile), Action::Sleep);
                }
            }
        }
    }
    #[test]
    fn top_wakes_only_after_stable_release() {
        for profile in [1, 2] {
            let (a, b) = (profile == 1, profile == 2);
            let mut w = Wake::new(a, b);
            for _ in 0..5 {
                assert_eq!(w.sample(profile, a, b), Action::Wait);
            }
            assert_eq!(w.sample(profile, false, false), Action::Wait);
            assert_eq!(w.sample(profile, a, b), Action::Wait);
            assert_eq!(release(&mut w, profile), Action::Boot);
        }
    }
    #[test]
    fn recovery_is_continuous_and_has_priority() {
        for profile in [1, 2] {
            let mut w = Wake::new(true, true);
            for _ in 0..109 {
                assert_eq!(w.sample(profile, true, true), Action::Wait);
            }
            assert_eq!(w.sample(profile, true, false), Action::Wait);
            for _ in 0..109 {
                assert_eq!(w.sample(profile, true, true), Action::Wait);
            }
            assert_eq!(w.sample(profile, true, true), Action::Isp);
        }
        let mut w = Wake::new(true, true);
        for _ in 0..10 {
            w.sample(1, true, true);
        }
        assert_eq!(release(&mut w, 1), Action::Sleep);
    }
    #[test]
    fn long_key1_hold_saturates_and_unknown_inputs_fail_closed() {
        let mut w = Wake::new(true, false);
        for _ in 0..100_000 {
            assert_eq!(w.sample(1, true, false), Action::Wait);
        }
        assert_eq!(release(&mut w, 1), Action::Boot);
        assert_eq!(
            Wake::new(false, false).sample(1, false, false),
            Action::Sleep
        );
        assert_eq!(Wake::new(true, true).sample(0, true, true), Action::Sleep);
    }
}
