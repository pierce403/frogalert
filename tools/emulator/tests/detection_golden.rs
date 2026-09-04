// Golden packets and expectations migrated unchanged from the C detector suite.
use frogalert_core::{
    config::{default_blob, Config},
    AlertKind,
};
#[test]
fn previous_firmware_detection_contract() {
    let config = Config::parse(&default_blob(2), 2).unwrap();
    let axon_name: [u8; 13] = [
        12, 0x09, b'A', b'x', b'o', b'n', b' ', b'B', b'o', b'd', b'y', b' ', b'4',
    ];
    let taser_name: [u8; 10] = [9, 0x09, b'm', b'y', b' ', b'T', b'A', b'S', b'E', b'R'];
    let flipper_name: [u8; 20] = [
        2, 0x01, 0x06, 16, 0x09, b'x', b'F', b'l', b'i', b'p', b'p', b'e', b'r', b' ', b'M', b'a',
        b'r', b'l', b'i', b'n',
    ];
    let short_flipper_name: [u8; 9] = [8, 0x08, b'F', b'L', b'I', b'P', b'P', b'E', b'R'];
    let flipper_black_service: [u8; 4] = [3, 0x02, 0x81, 0x30];
    let flipper_white_service: [u8; 4] = [3, 0x03, 0x82, 0x30];
    let flipper_transparent_service: [u8; 4] = [3, 0x03, 0x83, 0x30];
    let flipper_service_below_range: [u8; 4] = [3, 0x03, 0x80, 0x30];
    let flipper_service_above_range: [u8; 4] = [3, 0x03, 0x84, 0x30];
    let truncated_flipper_service: [u8; 3] = [2, 0x03, 0x81];
    let malformed_flipper_service: [u8; 3] = [3, 0x03, 0x81];
    let odd_flipper_service: [u8; 5] = [4, 0x03, 0x81, 0x30, 0xff];
    let karr_name: [u8; 12] = [
        11, 0x09, b'Q', b'T', b' ', b'1', b'2', b'3', b'4', b'5', b'6', b'7',
    ];
    let short_karr_name: [u8; 10] = [9, 0x08, b'q', b't', b' ', b'S', b'N', b'-', b'4', b'2'];
    let empty_karr_name: [u8; 5] = [4, 0x09, b'Q', b'T', b' '];
    let containing_karr_name: [u8; 14] = [
        13, 0x09, b'M', b'y', b' ', b'Q', b'T', b' ', b'1', b'2', b'3', b'4', b'5', b'6',
    ];
    let badge_magic_name: [u8; 17] = [
        16, 0x09, b'L', b'E', b'D', b' ', b'B', b'a', b'd', b'g', b'e', b' ', b'M', b'a', b'g',
        b'i', b'c',
    ];
    let padded_badge_magic_name: [u8; 19] = [
        18, 0x09, b'L', b'E', b'D', b' ', b'B', b'a', b'd', b'g', b'e', b' ', b'M', b'a', b'g',
        b'i', b'c', 0, 0,
    ];
    let containing_badge_magic_name: [u8; 20] = [
        19, 0x09, b'M', b'y', b' ', b'L', b'E', b'D', b' ', b'B', b'a', b'd', b'g', b'e', b' ',
        b'M', b'a', b'g', b'i', b'c',
    ];
    let badge_magic_service: [u8; 7] = [2, 0x01, 0x06, 3, 0x02, 0xe0, 0xfe];
    let badge_magic_complete_service: [u8; 4] = [3, 0x03, 0xe0, 0xfe];
    let badge_magic_flipper: [u8; 13] = [
        3, 0x02, 0xe0, 0xfe, 8, 0x09, b'F', b'l', b'i', b'p', b'p', b'e', b'r',
    ];
    let badge_magic_flipper_service: [u8; 8] = [3, 0x02, 0xe0, 0xfe, 3, 0x03, 0x81, 0x30];
    let ray_ban_dash_name: [u8; 14] = [
        13, 0x09, b'R', b'a', b'Y', b'-', b'B', b'a', b'N', b' ', b'M', b'e', b't', b'a',
    ];
    let ray_ban_space_name: [u8; 14] = [
        13, 0x09, b'R', b'A', b'Y', b' ', b'B', b'A', b'N', b' ', b'M', b'e', b't', b'a',
    ];
    let meta_glasses_passive: [u8; 13] = [
        2, 0x01, 0x06, 3, 0x03, 0x5f, 0xfd, 5, 0xff, 0xab, 0x01, 0x12, 0x34,
    ];
    let meta_company_only: [u8; 6] = [5, 0xff, 0xab, 0x01, 0x12, 0x34];
    let meta_service_only: [u8; 4] = [3, 0x03, 0x5f, 0xfd];
    let wrong_company_meta_service: [u8; 10] =
        [3, 0x03, 0x5f, 0xfd, 5, 0xff, 0x53, 0x0d, 0x12, 0x34];
    let meta_company_wrong_service: [u8; 10] =
        [3, 0x03, 0xb7, 0xfe, 5, 0xff, 0xab, 0x01, 0x12, 0x34];
    let unrelated_name: [u8; 12] = [
        11, 0x09, b'H', b'e', b'a', b'd', b'p', b'h', b'o', b'n', b'e', b's',
    ];
    let truncated_name: [u8; 5] = [9, 0x09, b'F', b'l', b'i'];
    let complete_name_wins: [u8; 21] = [
        8, 0x08, b'F', b'l', b'i', b'p', b'p', b'e', b'r', 11, 0x09, b'H', b'e', b'a', b'd', b'p',
        b'h', b'o', b'n', b'e', b's',
    ];
    let axon_address: [u8; 6] = [0x56, 0x34, 0x12, 0xdf, 0x25, 0x00];
    let flock_address: [u8; 6] = [0x56, 0x34, 0x12, 0x52, 0x1e, 0xb4];
    let display_order_false_positive: [u8; 6] = [0x00, 0x25, 0xdf, 0x12, 0x34, 0x56];
    let unrelated_address: [u8; 6] = [0x06, 0x05, 0x04, 0x03, 0x02, 0x01];
    assert_eq!(
        config
            .classify(unrelated_address, false, &axon_name)
            .map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &taser_name)
            .map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &flipper_name)
            .map(|d| d.kind),
        Some(AlertKind::Flipper)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &short_flipper_name)
            .map(|d| d.kind),
        Some(AlertKind::Flipper)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &flipper_black_service)
            .map(|d| d.kind),
        Some(AlertKind::Flipper)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &flipper_white_service)
            .map(|d| d.kind),
        Some(AlertKind::Flipper)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &flipper_transparent_service)
            .map(|d| d.kind),
        Some(AlertKind::Flipper)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &flipper_service_below_range)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &flipper_service_above_range)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &truncated_flipper_service)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &malformed_flipper_service)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &odd_flipper_service)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &karr_name)
            .map(|d| d.kind),
        Some(AlertKind::Karr)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &short_karr_name)
            .map(|d| d.kind),
        Some(AlertKind::Karr)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &empty_karr_name)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &containing_karr_name)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &badge_magic_name)
            .map(|d| d.kind),
        Some(AlertKind::FrogDance)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &padded_badge_magic_name)
            .map(|d| d.kind),
        Some(AlertKind::FrogDance)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &containing_badge_magic_name)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &badge_magic_service)
            .map(|d| d.kind),
        Some(AlertKind::FrogDance)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &badge_magic_complete_service)
            .map(|d| d.kind),
        Some(AlertKind::FrogDance)
    );
    assert_eq!(
        config
            .classify(axon_address, true, &badge_magic_flipper)
            .map(|d| d.kind),
        Some(AlertKind::FrogDance)
    );
    assert_eq!(
        config
            .classify(axon_address, true, &badge_magic_flipper_service)
            .map(|d| d.kind),
        Some(AlertKind::FrogDance)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &ray_ban_dash_name)
            .map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &ray_ban_space_name)
            .map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &meta_glasses_passive)
            .map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &meta_company_only)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &meta_service_only)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &wrong_company_meta_service)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &meta_company_wrong_service)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &unrelated_name)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &truncated_name)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &complete_name_wins)
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(unrelated_address, false, &[])
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config.classify(axon_address, true, &[]).map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config.classify(flock_address, true, &[]).map(|d| d.kind),
        Some(AlertKind::Cop)
    );
    assert_eq!(
        config.classify(axon_address, false, &[]).map(|d| d.kind),
        None
    );
    assert_eq!(
        config.classify(flock_address, false, &[]).map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(display_order_false_positive, true, &[])
            .map(|d| d.kind),
        None
    );
    assert_eq!(
        config
            .classify(axon_address, true, &flipper_name)
            .map(|d| d.kind),
        Some(AlertKind::Cop)
    );
}
