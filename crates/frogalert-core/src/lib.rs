#![cfg_attr(not(test), no_std)]

pub mod advertisement;
pub mod boot;
pub mod config;
pub mod display;
pub mod render;
pub mod runtime;
pub mod scan;
pub mod transfer;

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
    /// Bluetooth address in canonical, most-significant-byte-first display order.
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
    /// True when an official Flipper Zero hardware-color service is present.
    ///
    /// Flipper firmware advertises 0x3081, 0x3082, or 0x3083 for its black,
    /// white, or transparent hardware shell. This remains a passive hint and
    /// complements the local-name rule when no scan response is available.
    pub flipper_service: bool,
    /// True when manufacturer-specific data starts with Meta company ID 0x01AB.
    pub meta_company_01ab: bool,
    /// True when the advertisement contains Meta-assigned 16-bit service FD5F.
    pub meta_service_fd5f: bool,
}

impl<'a> Observation<'a> {
    /// Parses the passive advertising fields used by the built-in policy.
    pub fn from_advertisement(
        address: [u8; 6],
        public_address: bool,
        data: &'a [u8],
    ) -> Result<Self, advertisement::AdvertisementError> {
        Ok(Self {
            address,
            public_address,
            name: advertisement::local_name(data)?,
            badge_magic_service: advertisement::has_service16(data, 0xfee0)?,
            flipper_service: advertisement::has_service16(data, 0x3081)?
                || advertisement::has_service16(data, 0x3082)?
                || advertisement::has_service16(data, 0x3083)?,
            meta_company_01ab: advertisement::has_company_id(data, 0x01ab)?,
            meta_service_fd5f: advertisement::has_service16(data, 0xfd5f)?,
        })
    }
}

/// Classifies a canonical, most-significant-byte-first address.
pub fn classify(observation: &Observation<'_>) -> Option<Match> {
    config::builtins(observation, config::ALL_TARGETS)
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
            flipper_service: false,
            meta_company_01ab: false,
            meta_service_fd5f: false,
        }
    }

    #[test]
    fn matches_public_axon_oui() {
        let found = classify(&observation([0x00, 0x25, 0xDF, 1, 2, 3], true, None)).unwrap();
        assert_eq!(found.kind, AlertKind::Cop);
        assert_eq!(found.label, "Axon OUI");
    }

    #[test]
    fn does_not_guess_address_byte_order() {
        assert_eq!(
            classify(&observation([3, 2, 1, 0xDF, 0x25, 0x00], true, None)),
            None
        );
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
        assert_eq!(found.label, "Flipper name");
        assert_eq!(found.kind.message(), "FLIPPER DETECTED");
    }

    #[test]
    fn flipper_hardware_color_services_trigger_without_a_name() {
        for service in [0x3081_u16, 0x3082, 0x3083] {
            let [low, high] = service.to_le_bytes();
            let data = [3, 0x03, low, high];
            let seen = Observation::from_advertisement([0; 6], false, &data).unwrap();
            assert_eq!(seen.name, None);
            assert!(seen.flipper_service);

            let found = classify(&seen).unwrap();
            assert_eq!(found.kind, AlertKind::Flipper);
            assert_eq!(found.label, "Flipper 3081-3083 service");
        }
    }

    #[test]
    fn adjacent_services_are_not_flipper_hints() {
        for service in [0x3080_u16, 0x3084] {
            let [low, high] = service.to_le_bytes();
            let data = [3, 0x03, low, high];
            let seen = Observation::from_advertisement([0; 6], false, &data).unwrap();
            assert!(!seen.flipper_service);
            assert_eq!(classify(&seen), None);
        }
    }

    #[test]
    fn malformed_flipper_service_data_fails_closed() {
        let data = [2, 0x03, 0x81];
        assert_eq!(
            Observation::from_advertisement([0; 6], false, &data),
            Err(advertisement::AdvertisementError::TruncatedField)
        );
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
    fn meta_company_and_service_pair_is_a_cop_alert() {
        let mut seen = observation([0; 6], false, None);
        seen.meta_company_01ab = true;
        assert_eq!(classify(&seen), None);
        seen.meta_service_fd5f = true;
        let found = classify(&seen).unwrap();
        assert_eq!(found.kind, AlertKind::Cop);
        assert_eq!(found.label, "Meta 01AB + FD5F");

        seen.meta_company_01ab = false;
        assert_eq!(classify(&seen), None);
    }

    #[test]
    fn parses_and_classifies_observed_meta_passive_fields() {
        let data = [
            2, 0x01, 0x06, 3, 0x03, 0x5f, 0xfd, 5, 0xff, 0xab, 0x01, 0x12, 0x34,
        ];
        let seen = Observation::from_advertisement([0; 6], false, &data).unwrap();
        assert_eq!(classify(&seen).unwrap().label, "Meta 01AB + FD5F");
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
    fn badge_magic_service_has_priority_over_other_detector_hints() {
        let mut seen = observation([3, 2, 1, 0xDF, 0x25, 0x00], true, Some(b"My FLIPPER Zero"));
        seen.badge_magic_service = true;
        assert_eq!(classify(&seen).unwrap().kind, AlertKind::FrogDance);
    }

    #[test]
    fn detector_priority_is_frog_then_karr_then_cop_then_flipper() {
        let public_axon = [0x00, 0x25, 0xDF, 1, 2, 3];

        let mut karr = observation(public_axon, true, Some(b"QT FLIPPER-42"));
        karr.flipper_service = true;
        assert_eq!(classify(&karr).unwrap().kind, AlertKind::Karr);

        let mut cop = observation(public_axon, true, Some(b"My FLIPPER Zero"));
        cop.flipper_service = true;
        assert_eq!(classify(&cop).unwrap().kind, AlertKind::Cop);
    }

    #[test]
    fn unrelated_device_is_ignored() {
        assert_eq!(
            classify(&observation([1, 2, 3, 4, 5, 6], true, Some(b"Headphones"))),
            None
        );
    }
}
