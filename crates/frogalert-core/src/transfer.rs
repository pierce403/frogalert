//! Validate the legacy 16-byte upload before the hardware adapter allocates/writes.
//! Buffer ownership stays with the SDK allocator; no data is committed until complete.

pub const HEADER: usize = 64;
pub const CHUNK: usize = 16;

/// Invalid or absent timestamps do not reach the SDK calendar loops.
pub fn clock(bytes: [u8; 6]) -> Option<[u16; 6]> {
    let year = 2000 + u16::from(bytes[0].wrapping_sub(208));
    let [_, month, day, hour, minute, second] = bytes;
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    if day == 0 || day > days || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    Some([
        year,
        u16::from(month),
        u16::from(day),
        u16::from(hour),
        u16::from(minute),
        u16::from(second),
    ])
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Transfer {
    received: usize,
    total: Option<usize>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Write {
    pub offset: usize,
    pub capacity: usize,
    pub total: Option<usize>,
    pub restart: bool,
}

impl Transfer {
    pub const fn new() -> Self {
        Self {
            received: 0,
            total: None,
        }
    }
    pub fn reset(&mut self) {
        *self = Self::new();
    }

    /// Returns the required capacity before copying. Call `reset` on allocation,
    /// transport, or flash failure; no partially accepted frame can then continue.
    pub fn accept(&mut self, packet: &[u8], max_data: usize) -> Option<Write> {
        let result = self.accept_inner(packet, max_data);
        if result.is_none() {
            self.reset();
        }
        result
    }
    fn accept_inner(&mut self, packet: &[u8], max_data: usize) -> Option<Write> {
        if packet.len() != CHUNK {
            return None;
        }
        let restart = packet.starts_with(b"wang\0\0");
        if restart {
            self.reset();
        }
        if self.received == 0 && !restart {
            return None;
        }
        if self.received == CHUNK {
            let columns: usize = packet
                .as_chunks::<2>()
                .0
                .iter()
                .map(|n| usize::from(u16::from_be_bytes(*n)))
                .sum();
            let total = HEADER.checked_add(11usize.checked_mul(columns)?)?;
            if total > max_data {
                return None;
            }
            self.total = Some(total);
        }
        let capacity = self.total.unwrap_or(HEADER).div_ceil(CHUNK) * CHUNK;
        let offset = self.received;
        self.received = self.received.checked_add(CHUNK)?;
        if self.received > capacity {
            return None;
        }
        let total = self.total.filter(|&total| self.received >= total);
        if total.is_some() {
            self.reset();
        }
        Some(Write {
            offset,
            capacity,
            total,
            restart,
        })
    }
}
