//! The flash configuration is a byte protocol, never a packed Rust reference.

use crate::{advertisement, AlertKind, Match, Observation};

pub const SIZE: usize = 384;
pub const ALL_TARGETS: u32 = 31;
const MAGIC: &[u8; 16] = b"FROGALERTCFGv1\0\0";

#[derive(Clone, Copy)]
pub struct Config {
    bytes: [u8; SIZE],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Detection {
    pub kind: AlertKind,
    pub message: [u8; 16],
    pub length: u8,
}

impl Detection {
    pub fn new(kind: AlertKind, message: &[u8]) -> Self {
        let mut result = Self {
            kind,
            message: [0; 16],
            length: message.len().min(16) as u8,
        };
        result.message[..usize::from(result.length)]
            .copy_from_slice(&message[..usize::from(result.length)]);
        result
    }

    pub fn priority(self) -> u8 {
        match self.kind {
            AlertKind::FrogDance => 5,
            AlertKind::Karr => 4,
            AlertKind::Cop => 3,
            AlertKind::Flipper => 2,
            AlertKind::Hax => 1,
        }
    }
}

pub const fn crc32(bytes: &[u8; SIZE]) -> u32 {
    let mut crc = u32::MAX;
    let mut i = 0;
    while i < SIZE {
        crc ^= if i >= 28 && i < 32 {
            0
        } else {
            bytes[i] as u32
        };
        let mut bit = 0;
        while bit < 8 {
            crc = (crc >> 1) ^ (0xedb88320 & 0u32.wrapping_sub(crc & 1));
            bit += 1;
        }
        i += 1;
    }
    !crc
}

#[inline(always)]
pub const fn default_blob(profile: u8) -> [u8; SIZE] {
    let mut bytes = [0; SIZE];
    let mut i = 0;
    while i < 16 {
        bytes[i] = MAGIC[i];
        i += 1;
    }
    bytes[16] = 1;
    bytes[18] = 0x80;
    bytes[19] = 1;
    bytes[20] = profile;
    bytes[24] = ALL_TARGETS as u8;
    let crc = crc32(&bytes).to_le_bytes();
    i = 0;
    while i < 4 {
        bytes[28 + i] = crc[i];
        i += 1;
    }
    bytes
}

fn zero(bytes: &[u8]) -> bool {
    bytes.iter().all(|&b| b == 0)
}
fn printable(bytes: &[u8]) -> bool {
    bytes.iter().all(|b| (b' '..=b'~').contains(b))
}
fn hex(b: u8) -> Option<u16> {
    match b {
        b'0'..=b'9' => Some(u16::from(b - b'0')),
        b'A'..=b'F' => Some(u16::from(b - b'A' + 10)),
        _ => None,
    }
}
fn hex_number(bytes: &[u8]) -> Option<u16> {
    bytes
        .iter()
        .try_fold(0u16, |n, &b| Some((n << 4) | hex(b)?))
}

impl Config {
    pub fn parse(bytes: &[u8], profile: u8) -> Option<Self> {
        let bytes: [u8; SIZE] = bytes.try_into().ok()?;
        if !matches!(profile, 1 | 2)
            // Compare immediate words so the BIN contains exactly one literal
            // config magic (the patchable block, not a second parser constant).
            || core::hint::black_box(u32::from_le_bytes([bytes[0],bytes[1],bytes[2],bytes[3]])) != 0x474f5246
            || core::hint::black_box(u32::from_le_bytes([bytes[4],bytes[5],bytes[6],bytes[7]])) != 0x52454c41
            || core::hint::black_box(u32::from_le_bytes([bytes[8],bytes[9],bytes[10],bytes[11]])) != 0x47464354
            || core::hint::black_box(u32::from_le_bytes([bytes[12],bytes[13],bytes[14],bytes[15]])) != 0x00003176
            || bytes[16..20] != [1, 0, 0x80, 1]
            || bytes[20] != profile
            || bytes[21] > 8
            || !zero(&bytes[22..24])
            || u32::from_le_bytes(bytes[24..28].try_into().ok()?) & !ALL_TARGETS != 0
            || crc32(&bytes) != u32::from_le_bytes(bytes[28..32].try_into().ok()?)
        {
            return None;
        }
        for (i, rule) in bytes[32..].as_chunks::<44>().0.iter().enumerate() {
            if i >= usize::from(bytes[21]) {
                if !zero(rule) {
                    return None;
                }
                continue;
            }
            let (kind, n, m) = (rule[0], usize::from(rule[1]), usize::from(rule[2]));
            if !(1..=5).contains(&kind)
                || !(1..=24).contains(&n)
                || !(1..=16).contains(&m)
                || rule[3] != 0
                || !zero(&rule[4 + n..28])
                || !zero(&rule[28 + m..])
                || !printable(&rule[28..28 + m])
            {
                return None;
            }
            let v = &rule[4..4 + n];
            let valid = match kind {
                1..=3 => printable(v),
                4 => {
                    n == 8
                        && v[2] == b':'
                        && v[5] == b':'
                        && [0, 1, 3, 4, 6, 7].iter().all(|&j| hex(v[j]).is_some())
                }
                5 => n == 4 && hex_number(v).is_some(),
                _ => false,
            };
            if !valid {
                return None;
            }
        }
        Some(Self { bytes })
    }

    /// WCH reports addresses little endian. Normalize once; never guess both orders.
    pub fn classify(&self, mut address: [u8; 6], public: bool, data: &[u8]) -> Option<Detection> {
        address.reverse();
        let observation = Observation::from_advertisement(address, public, data).ok()?;
        let targets = u32::from_le_bytes(self.bytes[24..28].try_into().ok()?);
        if let Some(found) = builtins(&observation, targets) {
            return Some(Detection::new(found.kind, found.kind.message().as_bytes()));
        }
        let name = observation.name.unwrap_or_default();
        for rule in self.bytes[32..]
            .as_chunks::<44>()
            .0
            .iter()
            .take(usize::from(self.bytes[21]))
        {
            let value = &rule[4..4 + usize::from(rule[1])];
            let matches = match rule[0] {
                1 => contains(name, value),
                2 => name
                    .get(..value.len())
                    .is_some_and(|n| n.eq_ignore_ascii_case(value)),
                3 => name.trim_ascii_end_null().eq_ignore_ascii_case(value),
                4 => {
                    public
                        && address[0] & 2 == 0
                        && [0, 3, 6].iter().enumerate().all(|(i, &j)| {
                            hex_number(&value[j..j + 2]) == Some(u16::from(address[i]))
                        })
                }
                5 => hex_number(value)
                    .is_some_and(|uuid| advertisement::has_service16(data, uuid) == Ok(true)),
                _ => false,
            };
            if matches {
                return Some(Detection::new(
                    AlertKind::Hax,
                    &rule[28..28 + usize::from(rule[2])],
                ));
            }
        }
        None
    }
}

trait TrimNull {
    fn trim_ascii_end_null(&self) -> &[u8];
}
impl TrimNull for [u8] {
    fn trim_ascii_end_null(&self) -> &[u8] {
        let end = self.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
        &self[..end]
    }
}
fn contains(name: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && name
            .windows(needle.len())
            .any(|n| n.eq_ignore_ascii_case(needle))
}

/// Shared by the firmware and the host observation CLI. Addresses are canonical here.
pub fn builtins(o: &Observation<'_>, targets: u32) -> Option<Match> {
    let name = o.name.unwrap_or_default();
    let oui = o.public_address && o.address[0] & 2 == 0;
    let qt = name
        .get(..3)
        .is_some_and(|n| n.eq_ignore_ascii_case(b"qt "))
        && name[3..]
            .iter()
            .any(|&b| b != 0 && !b.is_ascii_whitespace());
    let rules = [
        (
            16,
            AlertKind::FrogDance,
            "BadgeMagic FEE0 service",
            o.badge_magic_service,
        ),
        (
            16,
            AlertKind::FrogDance,
            "BadgeMagic name",
            name.trim_ascii_end_null()
                .eq_ignore_ascii_case(b"led badge magic"),
        ),
        (4, AlertKind::Karr, "KARR QT serial name", qt),
        (
            1,
            AlertKind::Cop,
            "Axon OUI",
            oui && o.address[..3] == [0, 0x25, 0xdf],
        ),
        (
            1,
            AlertKind::Cop,
            "Flock Safety OUI",
            oui && o.address[..3] == [0xb4, 0x1e, 0x52],
        ),
        (1, AlertKind::Cop, "Axon name", contains(name, b"axon body")),
        (1, AlertKind::Cop, "TASER name", contains(name, b"taser")),
        (
            8,
            AlertKind::Cop,
            "Meta 01AB + FD5F",
            o.meta_company_01ab && o.meta_service_fd5f,
        ),
        (
            8,
            AlertKind::Cop,
            "Ray-Ban name",
            contains(name, b"ray-ban"),
        ),
        (
            8,
            AlertKind::Cop,
            "Ray Ban name",
            contains(name, b"ray ban"),
        ),
        (
            2,
            AlertKind::Flipper,
            "Flipper 3081-3083 service",
            o.flipper_service,
        ),
        (
            2,
            AlertKind::Flipper,
            "Flipper name",
            contains(name, b"flipper"),
        ),
    ];
    rules
        .into_iter()
        .find(|(group, _, _, yes)| group & targets != 0 && *yes)
        .map(|(_, kind, label, _)| Match { kind, label })
}
