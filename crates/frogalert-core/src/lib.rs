#![cfg_attr(not(test), no_std)]

pub mod advertisement;
pub mod display;
pub mod scan;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AlertKind {
    Cop,
    Flipper,
    FrogDance,
    Hax,
    Karr,
}

impl AlertKind {
    pub const fn message(self) -> &'static str {
        match self {
            Self::Cop => "COP DETECTED",
            Self::Flipper => "FLIPPER DETECTED",
            Self::FrogDance => "DANCING FROGS",
            Self::Hax => "HAX DETECTED",
            Self::Karr => "KARR DETECTED",
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
    /// True when the advertisement contains BadgeMagic's 16-bit FEE0 service.
    ///
    /// This is a passive fallback because the open firmware places its local
    /// name in a scan response, which a passive observer cannot request.
    pub badge_magic_service: bool,
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
    matcher: NameMatcher,
}

#[derive(Clone, Copy)]
enum NameMatcher {
    Contains,
    ExactPadded,
    PrefixWithSuffix,
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
        matcher: NameMatcher::Contains,
    },
    NameRule {
        needle: b"taser",
        kind: AlertKind::Cop,
        label: "TASER name",
        matcher: NameMatcher::Contains,
    },
    NameRule {
        needle: b"flipper",
        kind: AlertKind::Flipper,
        label: "Flipper name",
        matcher: NameMatcher::Contains,
    },
    NameRule {
        needle: b"qt ",
        kind: AlertKind::Karr,
        label: "KARR QT serial name",
        matcher: NameMatcher::PrefixWithSuffix,
    },
    NameRule {
        needle: b"led badge magic",
        kind: AlertKind::FrogDance,
        label: "BadgeMagic name",
        matcher: NameMatcher::ExactPadded,
    },
    NameRule {
        needle: b"ray-ban",
        kind: AlertKind::Cop,
        label: "Ray-Ban name",
        matcher: NameMatcher::Contains,
    },
    NameRule {
        needle: b"ray ban",
        kind: AlertKind::Cop,
        label: "Ray Ban name",
        matcher: NameMatcher::Contains,
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

    if let Some(name) = observation.name {
        for rule in NAME_RULES {
            let matches = match rule.matcher {
                NameMatcher::Contains => ascii_contains_ignore_case(name, rule.needle),
                NameMatcher::ExactPadded => ascii_equal_ignore_case_padded(name, rule.needle),
                NameMatcher::PrefixWithSuffix => {
                    ascii_starts_with_ignore_case_and_value(name, rule.needle)
                }
            };
            if matches {
                return Some(Match {
                    kind: rule.kind,
                    label: rule.label,
                });
            }
        }
    }
    observation.badge_magic_service.then_some(Match {
        kind: AlertKind::FrogDance,
        label: "BadgeMagic FEE0 service",
    })
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

fn ascii_equal_ignore_case_padded(mut value: &[u8], expected: &[u8]) -> bool {
    while value.last() == Some(&0) {
        value = &value[..value.len() - 1];
    }
    value.eq_ignore_ascii_case(expected)
}

fn ascii_starts_with_ignore_case_and_value(value: &[u8], prefix: &[u8]) -> bool {
    value.len() > prefix.len()
        && value[..prefix.len()].eq_ignore_ascii_case(prefix)
        && value[prefix.len()..]
            .iter()
            .any(|byte| *byte != 0 && !byte.is_ascii_whitespace())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observation(address: [u8; 6], public_address: bool, name: Option<&[u8]>) -> Observation<'_> {
        Observation {
            address,
            public_address,
            name,
            badge_magic_service: false,
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
        assert_eq!(found.kind, AlertKind::Flipper);
        assert_eq!(found.kind.message(), "FLIPPER DETECTED");
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
    fn ray_ban_names_are_cop_alerts() {
        for name in [b"Ray-Ban Stories".as_slice(), b"Ray Ban Meta".as_slice()] {
            let found = classify(&observation([0; 6], false, Some(name))).unwrap();
            assert_eq!(found.kind, AlertKind::Cop);
            assert_eq!(found.kind.message(), "COP DETECTED");
        }
    }

    #[test]
    fn karr_names_require_qt_prefix_and_serial_value() {
        for name in [b"QT 123456".as_slice(), b"qt SN-42".as_slice()] {
            let found = classify(&observation([0; 6], false, Some(name))).unwrap();
            assert_eq!(found.kind, AlertKind::Karr);
            assert_eq!(found.kind.message(), "KARR DETECTED");
            assert_eq!(found.label, "KARR QT serial name");
        }
        for name in [
            b"QT ".as_slice(),
            b"QT \0\0".as_slice(),
            b"My QT 123456".as_slice(),
        ] {
            assert_eq!(classify(&observation([0; 6], false, Some(name))), None);
        }
    }

    #[test]
    fn badge_magic_name_triggers_frog_dance() {
        let found = classify(&observation([0; 6], false, Some(b"LED Badge Magic\0\0"))).unwrap();
        assert_eq!(found.kind, AlertKind::FrogDance);
        assert_eq!(found.kind.message(), "DANCING FROGS");
        assert_eq!(
            classify(&observation([0; 6], false, Some(b"My LED Badge Magic"))),
            None
        );
    }

    #[test]
    fn badge_magic_service_triggers_frog_dance_without_a_scan_response() {
        let mut seen = observation([0; 6], false, None);
        seen.badge_magic_service = true;
        let found = classify(&seen).unwrap();
        assert_eq!(found.kind, AlertKind::FrogDance);
        assert_eq!(found.label, "BadgeMagic FEE0 service");
    }

    #[test]
    fn unrelated_device_is_ignored() {
        assert_eq!(
            classify(&observation([1, 2, 3, 4, 5, 6], true, Some(b"Headphones"))),
            None
        );
    }
}
