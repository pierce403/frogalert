#![cfg_attr(not(test), no_std)]

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AlertKind {
    Cop,
    Hax,
}

impl AlertKind {
    pub const fn message(self) -> &'static str {
        match self {
            Self::Cop => "COP DETECTED",
            Self::Hax => "HAX DETECTED",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Match {
    pub kind: AlertKind,
    pub label: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Observation<'a> {
    /// Bluetooth address in controller byte order or normal display order.
    pub address: [u8; 6],
    /// True only when the controller reports a public (non-randomized) address.
    pub public_address: bool,
    /// Complete or shortened local name extracted from advertisement data.
    pub name: Option<&'a [u8]>,
}

#[derive(Clone, Copy)]
struct OuiRule {
    prefix: [u8; 3],
    kind: AlertKind,
    label: &'static str,
}

#[derive(Clone, Copy)]
struct NameRule {
    needle: &'static [u8],
    kind: AlertKind,
    label: &'static str,
}

// BLE-relevant seed prefixes from the published OUI-Spy database. The larger
// Flock list is documented as Wi-Fi promiscuous-mode research and is therefore
// intentionally not treated as BLE evidence here.
const OUI_RULES: &[OuiRule] = &[
    OuiRule {
        prefix: [0x00, 0x25, 0xDF],
        kind: AlertKind::Cop,
        label: "Axon OUI",
    },
    OuiRule {
        prefix: [0xB4, 0x1E, 0x52],
        kind: AlertKind::Cop,
        label: "Flock Safety OUI",
    },
];

// These mirror Unagi's currently seeded name rules.
const NAME_RULES: &[NameRule] = &[
    NameRule {
        needle: b"axon body",
        kind: AlertKind::Cop,
        label: "Axon name",
    },
    NameRule {
        needle: b"taser",
        kind: AlertKind::Cop,
        label: "TASER name",
    },
    NameRule {
        needle: b"flipper",
        kind: AlertKind::Hax,
        label: "Flipper name",
    },
    NameRule {
        needle: b"ray-ban",
        kind: AlertKind::Hax,
        label: "Ray-Ban name",
    },
    NameRule {
        needle: b"ray ban",
        kind: AlertKind::Hax,
        label: "Ray Ban name",
    },
];

pub fn classify(observation: &Observation<'_>) -> Option<Match> {
    // BLE private/random addresses frequently collide with vendor prefixes.
    // Only use OUI matching when the controller identifies a public address.
    if observation.public_address {
        for rule in OUI_RULES {
            if starts_with_either_order(&observation.address, &rule.prefix) {
                return Some(Match {
                    kind: rule.kind,
                    label: rule.label,
                });
            }
        }
    }

    let name = observation.name?;
    for rule in NAME_RULES {
        if ascii_contains_ignore_case(name, rule.needle) {
            return Some(Match {
                kind: rule.kind,
                label: rule.label,
            });
        }
    }
    None
}

fn starts_with_either_order(address: &[u8; 6], prefix: &[u8; 3]) -> bool {
    address[..3] == prefix[..] || [address[5], address[4], address[3]] == *prefix
}

fn ascii_contains_ignore_case(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|window| {
        window
            .iter()
            .zip(needle)
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observation(address: [u8; 6], public_address: bool, name: Option<&[u8]>) -> Observation<'_> {
        Observation {
            address,
            public_address,
            name,
        }
    }

    #[test]
    fn matches_public_axon_oui() {
        let found = classify(&observation([0x00, 0x25, 0xDF, 1, 2, 3], true, None)).unwrap();
        assert_eq!(found.kind, AlertKind::Cop);
        assert_eq!(found.label, "Axon OUI");
    }

    #[test]
    fn handles_controller_little_endian_address_order() {
        let found = classify(&observation([3, 2, 1, 0xDF, 0x25, 0x00], true, None)).unwrap();
        assert_eq!(found.kind, AlertKind::Cop);
    }

    #[test]
    fn rejects_oui_on_random_address() {
        assert_eq!(
            classify(&observation([0x00, 0x25, 0xDF, 1, 2, 3], false, None)),
            None
        );
    }

    #[test]
    fn matches_names_case_insensitively() {
        let found = classify(&observation([0; 6], false, Some(b"My FLIPPER Zero"))).unwrap();
        assert_eq!(found.kind, AlertKind::Hax);
        assert_eq!(found.kind.message(), "HAX DETECTED");
    }

    #[test]
    fn name_rule_still_works_with_random_address() {
        let found = classify(&observation(
            [0xC2, 0, 0, 0, 0, 1],
            false,
            Some(b"Axon Body 4"),
        ))
        .unwrap();
        assert_eq!(found.kind, AlertKind::Cop);
    }

    #[test]
    fn unrelated_device_is_ignored() {
        assert_eq!(
            classify(&observation([1, 2, 3, 4, 5, 6], true, Some(b"Headphones"))),
            None
        );
    }
}
