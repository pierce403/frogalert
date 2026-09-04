use frogalert_core::{
    config::{self, default_blob, Config},
    render::{self, Pages},
    runtime::{Event, SECOND},
    transfer::{self, Transfer},
    AlertKind,
};
use frogalert_emulator::{font::FONT, Badge, Cancel};

fn scanning(profile: u8, frogs: bool) -> Badge {
    let mut b = Badge::new(profile, frogs, 0);
    b.advance(u64::from(15 * SECOND + SECOND / 4));
    assert!(b.radio_busy);
    b
}
fn each(mut test: impl FnMut(u8, bool)) {
    for p in [1, 2] {
        for f in [false, true] {
            test(p, f);
        }
    }
}

#[test]
fn completed_count_holds_during_scans_and_failed_windows() {
    each(|p, f| {
        let mut b = scanning(p, f);
        b.report([1; 6], 0, &[]);
        b.report([1; 6], 0, &[]);
        b.report([1; 6], 1, &[]);
        assert_eq!(b.runtime.completed(), (0, false));
        b.advance(u64::from(3 * SECOND));
        assert_eq!(b.runtime.completed(), (2, false));
        assert_eq!(b.runtime.retained_addresses(), 0);
        b.lost_completion = true;
        b.advance(u64::from(17 * SECOND));
        b.report([2; 6], 1, &[]);
        b.advance(u64::from(6 * SECOND));
        assert_eq!(b.runtime.completed(), (2, false));
        assert_eq!(b.runtime.retained_addresses(), 0);
    });
}

#[test]
fn cancellation_never_claims_idle_while_controller_is_busy() {
    each(|p, f| {
        let mut b = scanning(p, f);
        b.cancel = Cancel::Lost;
        b.lost_completion = true;
        b.report([9; 6], 1, &[]);
        b.download();
        b.off();
        assert_eq!(b.runtime.retained_addresses(), 0);
        assert_eq!(b.shutdowns, 0);
        assert_eq!(b.input.advertising, Some(false));
        // The pending successful discovery event is authoritative, even after
        // a missing cancel acknowledgement. Only then may shutdown proceed.
        b.advance(u64::from(3 * SECOND));
        assert_eq!(b.shutdowns, 1);
        assert_eq!(b.runtime.completed(), (0, false));
    });
}

#[test]
fn lost_completion_stays_bounded_and_recovers_after_confirmed_idle() {
    each(|p, f| {
        let mut b = Badge::new(p, f, 0);
        b.lost_completion = true;
        b.cancel = Cancel::Lost;
        b.advance(u64::from(16 * SECOND));
        b.report([7; 6], 1, &[]);
        b.off();
        b.advance(u64::from(3600 * SECOND));
        assert_eq!(b.scans, 1);
        assert_eq!(b.shutdowns, 0);
        assert!(b.runtime.scanning());
        assert_eq!(b.runtime.retained_addresses(), 0);
        b.cancel = Cancel::AlreadyIdle;
        b.advance(u64::from(10 * SECOND));
        assert_eq!(b.shutdowns, 1);
        b.lost_completion = false;
        b.normal();
        b.advance(u64::from(4 * SECOND));
        assert_eq!(b.scans, 2);
        assert!(!b.radio_busy);
    });
}

#[test]
fn connection_and_failed_state_reads_block_both_scan_boundaries() {
    each(|p, f| {
        let mut b = Badge::new(p, f, 0);
        b.input.connected = true;
        b.advance(u64::from(60 * SECOND));
        assert_eq!(b.scans, 0);
        b.input.connected = false;
        b.input.advertising = None;
        b.advance(u64::from(10 * SECOND));
        assert_eq!(b.scans, 0);
        b.input.advertising = Some(false);
        b.advance(u64::from(5 * SECOND)); // now in the quiet interval
        b.input.connected = true;
        b.advance(u64::from(SECOND));
        assert_eq!(b.scans, 0);
        b.input.connected = false;
        b.start_ok = false;
        b.advance(u64::from(11 * SECOND));
        assert_eq!(b.scans, 1);
        assert!(!b.radio_busy);
        b.start_ok = true;
        b.advance(u64::from(11 * SECOND));
        assert_eq!(b.scans, 2);
    });
}

#[test]
fn replaced_alerts_ignore_stale_page_and_end_events() {
    each(|p, f| {
        let mut b = scanning(p, f);
        b.name("Flipper Zero");
        let flipper = Pages::new(b"FLIPPER DETECTED").unwrap();
        assert_eq!(b.panel, Some(flipper.frame(0, &FONT)));
        b.advance(u64::from(SECOND - 1));
        b.name("Axon Body 4");
        let cop = Pages::new(b"COP DETECTED").unwrap();
        b.advance(1); // former Flipper page deadline
        b.event(Event::Tick);
        assert_eq!(b.panel, Some(cop.frame(0, &FONT)));
        b.advance(u64::from(SECOND - 1));
        assert_eq!(b.panel, Some(cop.frame(1, &FONT)));
        b.event(Event::Tick);
        assert_eq!(b.panel, Some(cop.frame(1, &FONT)));
        b.name("Flipper Zero");
        assert_eq!(b.panel, Some(cop.frame(1, &FONT)));
        b.advance(u64::from(SECOND));
        assert_ne!(b.panel, Some(cop.frame(0, &FONT)));
    });
}

#[test]
fn frog_alert_has_three_frames_and_never_restarts_in_one_window() {
    each(|p, f| {
        let mut b = scanning(p, f);
        b.name("LED Badge Magic");
        for frame in 0..3 {
            assert_eq!(b.panel, Some(render::frogs(frame)));
            b.name("LED Badge Magic");
            b.name("QT 12345");
            b.advance(u64::from(SECOND));
        }
        if !f {
            assert_ne!(b.panel, Some(render::frogs(0)));
        }
    });
}

#[test]
fn suspension_removes_overlay_and_late_reports_cannot_resurrect_it() {
    each(|p, f| {
        let mut b = scanning(p, f);
        b.name("Flipper Zero");
        b.download();
        assert_eq!(b.panel, None);
        b.name("LED Badge Magic");
        b.input.connected = true;
        b.event(Event::Suspend {
            advertise_after: false,
        });
        b.advance(u64::from(5 * SECOND));
        assert_eq!(b.panel, None);
        assert_eq!(b.runtime.completed(), (0, false));
        assert_eq!(b.input.advertising, Some(false));
        b.input.connected = false;
        b.normal();
        b.advance(u64::from(4 * SECOND));
        assert!(b.panel.is_some());
        assert_eq!(b.scans, 2);
    });
}

#[test]
fn display_never_flickers_on_unchanged_counter_reports() {
    let mut b = scanning(2, false);
    let before = b.writes;
    for _ in 0..100 {
        b.report([9; 6], 1, &[]);
        b.event(Event::Tick);
    }
    assert_eq!(b.writes, before);
    b.advance(u64::from(3 * SECOND));
    assert_eq!(b.writes, before + 1);
}

#[test]
fn queued_wake_cannot_restart_scan_after_mode_change() {
    each(|p, f| {
        for offset in [0, 1, 15 * SECOND, 15 * SECOND + 1, 15 * SECOND + SECOND / 4] {
            let mut b = Badge::new(p, f, 0);
            b.advance(u64::from(offset));
            b.download();
            b.off();
            let scans = b.scans;
            for _ in 0..10 {
                b.event(Event::Tick);
            }
            b.advance(u64::from(60 * SECOND));
            assert_eq!(b.scans, scans);
            assert_eq!(b.panel, None);
            assert_eq!(b.input.advertising, Some(false));
        }
    });
}

#[test]
fn clock_wrap_and_day_long_soak() {
    let (scans, _) = frogalert_emulator::soak(24);
    assert_eq!(scans, 4 * 4320);
}

#[test]
fn failed_role_start_retries_without_waiting_for_a_lost_callback() {
    let mut b = Badge::new(1, false, 0);
    b.event(Event::Ready(false));
    b.advance(u64::from(10 * SECOND));
    assert_eq!(b.role_starts, 1);
    assert_eq!(b.scans, 0);
    b.event(Event::Ready(true));
    b.advance(u64::from(16 * SECOND));
    assert_eq!(b.scans, 1);
}

#[test]
fn shutdown_waits_for_advertising_and_connection_completion() {
    each(|p, f| {
        let mut b = Badge::new(p, f, 0);
        b.input.allowed = false;
        b.input.connected = true;
        b.input.advertising = Some(true);
        let out = b.event(Event::Shutdown);
        assert!(out.disconnect && out.stop_advertising && !out.radio_idle);
        b.advance(u64::from(5 * SECOND));
        assert_eq!(b.shutdowns, 0);
        b.input.connected = false;
        b.advance(u64::from(SECOND / 4));
        assert_eq!(b.shutdowns, 1);
        assert_eq!(b.panel, None);
        // A late initialization callback cannot revive a sleeping application.
        b.event(Event::Ready(true));
        b.advance(u64::from(60 * SECOND));
        assert_eq!(b.scans, 0);
    });
}

fn configured(profile: u8, mut blob: [u8; 384]) -> Config {
    let crc = config::crc32(&blob);
    blob[28..32].copy_from_slice(&crc.to_le_bytes());
    Config::parse(&blob, profile).unwrap()
}
#[test]
fn every_config_byte_is_crc_protected_and_profiles_are_not_interchangeable() {
    for p in [1, 2] {
        let blob = default_blob(p);
        assert!(Config::parse(&blob, p).is_some());
        assert!(Config::parse(&blob, 3 - p).is_none());
        for i in 0..384 {
            let mut bad = blob;
            bad[i] ^= 1;
            assert!(Config::parse(&bad, p).is_none(), "offset {i}");
        }
        for i in [21, 22, 23, 25, 26, 27, 32, 383] {
            let mut bad = blob;
            bad[i] = 255;
            let crc = config::crc32(&bad);
            bad[28..32].copy_from_slice(&crc.to_le_bytes());
            assert!(Config::parse(&bad, p).is_none());
        }
    }
}

#[test]
fn all_custom_rule_types_and_disabled_builtins_share_the_shipping_parser() {
    for p in [1, 2] {
        for (kind, value, address, public, data) in [
            (1, &b"lip"[..], [1; 6], false, &b"\x08\x09Flipper"[..]),
            (2, &b"Flip"[..], [1; 6], false, &b"\x08\x09Flipper"[..]),
            (3, &b"Flipper"[..], [1; 6], false, &b"\x08\x09Flipper"[..]),
            (
                4,
                &b"00:25:DF"[..],
                [1, 2, 3, 0xdf, 0x25, 0],
                true,
                &b""[..],
            ),
            (5, &b"3081"[..], [1; 6], false, &b"\x03\x03\x81\x30"[..]),
        ] {
            let mut blob = default_blob(p);
            blob[24] = 0;
            blob[21] = 1;
            blob[32] = kind;
            blob[33] = value.len() as u8;
            blob[34] = 6;
            blob[36..36 + value.len()].copy_from_slice(value);
            blob[60..66].copy_from_slice(b"CUSTOM");
            let config = configured(p, blob);
            let found = config.classify(address, public, data).unwrap();
            assert_eq!(found.kind, AlertKind::Hax);
            assert_eq!(&found.message[..6], b"CUSTOM");
            if kind == 4 {
                assert!(config.classify(address, false, data).is_none());
            }
        }
    }
}

#[test]
fn malformed_suffixes_never_turn_a_prefix_into_a_detection() {
    let config = Config::parse(&default_blob(2), 2).unwrap();
    for prefix in [
        &b"\x03\x03\x81\x30"[..],
        &b"\x08\x09Flipper"[..],
        &b"\x03\xff\xab\x01\x03\x03\x5f\xfd"[..],
    ] {
        assert!(config.classify([1; 6], false, prefix).is_some());
        for length in 2..=255 {
            let mut packet = prefix.to_vec();
            packet.extend([length, 0x09]);
            assert!(config.classify([1; 6], false, &packet).is_none());
        }
    }
    for length in 0..=255 {
        let mut data = vec![255; length];
        for seed in 0..64u32 {
            let mut x = seed + 1;
            for b in &mut data {
                x = x.wrapping_mul(1664525).wrapping_add(1013904223);
                *b = (x >> 24) as u8;
            }
            config.classify([1; 6], false, &data);
        }
    }
}

#[test]
fn all_page_lengths_and_battery_values_stay_inside_the_matrix() {
    for n in 1..=16 {
        for byte in b' '..=b'~' {
            let pages = Pages::new(&vec![byte; n]).unwrap();
            assert!((1..=2).contains(&pages.count));
            for p in 0..3 {
                assert!(pages.frame(p, &FONT).iter().all(|x| x & !0x7ff == 0));
            }
        }
    }
    for raw in 0..=u16::MAX {
        let reading = frogalert_core::boot::battery(raw);
        assert!(reading.percent <= 100);
        assert!(reading.millivolts <= 5921);
    }
    let p = Pages::new(b"P").unwrap().frame(0, &FONT);
    assert_eq!(
        &p[19..24],
        &[0x7f << 2, 0x09 << 2, 0x09 << 2, 0x09 << 2, 0x06 << 2]
    );
}

#[test]
fn upload_padding_resynchronization_disconnect_and_bounds() {
    for columns in 0..256u16 {
        let total = 64 + 11 * usize::from(columns);
        let mut t = Transfer::new();
        let mut bytes = vec![0; total.div_ceil(16) * 16];
        bytes[..6].copy_from_slice(b"wang\0\0");
        bytes[16..18].copy_from_slice(&columns.to_be_bytes());
        let mut committed = None;
        for (i, packet) in bytes.chunks(16).enumerate() {
            let write = t.accept(packet, 32767).unwrap();
            assert_eq!(write.offset, i * 16);
            assert!(write.offset + 16 <= write.capacity);
            if let Some(n) = write.total {
                assert_eq!(n, total);
                committed = Some(n);
            }
        }
        assert_eq!(committed, Some(total));
        assert!(t.accept(&[0; 16], 32767).is_none());
        for interrupted in 1..bytes.len() / 16 {
            let mut t = Transfer::new();
            for packet in bytes[..interrupted * 16].chunks(16) {
                t.accept(packet, 32767).unwrap();
            }
            t.reset();
            assert!(t.accept(&[0; 16], 32767).is_none());
            assert!(t.accept(&bytes[..16], 32767).unwrap().restart);
        }
    }
    let mut t = Transfer::new();
    let mut header = [0; 16];
    header[..6].copy_from_slice(b"wang\0\0");
    t.accept(&header, 32767).unwrap();
    assert!(t.accept(&[255; 16], 32767).is_none());
    t.accept(&header, 32767).unwrap();
    assert!(t.accept(&[0; 15], 32767).is_none());
    assert!(t.accept(&[0; 16], 32767).is_none());
    assert!(transfer::clock([0; 6]).is_none());
    assert!(transfer::clock([208, 2, 29, 23, 59, 59]).is_some());
    assert!(transfer::clock([209, 2, 29, 23, 59, 59]).is_none());
}
