//! Ephemeral, fixed-capacity accounting for one BLE scan window.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObservationResult {
    Added,
    Duplicate,
    Saturated,
}

/// Counts distinct advertiser addresses without allocation or persistence.
///
/// The address table exists only for the current scan window. `clear` also
/// zeroes the table so a completed window does not become a device history.
pub struct ScanCounter<const CAPACITY: usize> {
    addresses: [[u8; 6]; CAPACITY],
    len: usize,
    saturated: bool,
}

impl<const CAPACITY: usize> ScanCounter<CAPACITY> {
    pub const fn new() -> Self {
        Self {
            addresses: [[0; 6]; CAPACITY],
            len: 0,
            saturated: false,
        }
    }

    pub fn observe(&mut self, address: [u8; 6]) -> ObservationResult {
        if self.addresses[..self.len].contains(&address) {
            return ObservationResult::Duplicate;
        }
        if self.len == CAPACITY {
            self.saturated = true;
            return ObservationResult::Saturated;
        }
        self.addresses[self.len] = address;
        self.len += 1;
        ObservationResult::Added
    }

    pub const fn count(&self) -> usize {
        self.len
    }

    pub const fn is_saturated(&self) -> bool {
        self.saturated
    }

    pub fn clear(&mut self) {
        // These ephemeral identifiers must actually leave memory at the end of
        // a scan window. Volatile stores keep release optimization from
        // deleting zeroization that is otherwise not observable by Rust code.
        for address in &mut self.addresses {
            unsafe { core::ptr::write_volatile(address, [0; 6]) };
        }
        self.len = 0;
        self.saturated = false;
    }
}

impl<const CAPACITY: usize> Default for ScanCounter<CAPACITY> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_unique_advertisers_not_packets() {
        let mut counter = ScanCounter::<4>::new();
        assert_eq!(counter.observe([1; 6]), ObservationResult::Added);
        assert_eq!(counter.observe([1; 6]), ObservationResult::Duplicate);
        assert_eq!(counter.observe([2; 6]), ObservationResult::Added);
        assert_eq!(counter.count(), 2);
    }

    #[test]
    fn reports_capacity_without_wrapping() {
        let mut counter = ScanCounter::<1>::new();
        assert_eq!(counter.observe([1; 6]), ObservationResult::Added);
        assert_eq!(counter.observe([2; 6]), ObservationResult::Saturated);
        assert_eq!(counter.count(), 1);
        assert!(counter.is_saturated());
    }

    #[test]
    fn clear_starts_a_fresh_window() {
        let mut counter = ScanCounter::<2>::new();
        counter.observe([1; 6]);
        counter.clear();
        assert_eq!(counter.count(), 0);
        assert!(!counter.is_saturated());
        assert_eq!(counter.observe([1; 6]), ObservationResult::Added);
    }
}
