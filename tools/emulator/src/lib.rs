//! Virtual clock, radio, and display around the actual firmware reducer.
//! This models SDK events, not CH582 instructions or electrical behavior.

use frogalert_core::{
    config::{default_blob, Config},
    render::Frame,
    runtime::{Event, Inputs, Output, Runtime, SECOND},
};
pub mod font;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Cancel {
    Confirm,
    AlreadyIdle,
    Lost,
}

pub struct Badge {
    pub runtime: Runtime,
    pub input: Inputs,
    pub now: u64,
    pub panel: Option<Frame>,
    pub scans: u32,
    pub writes: u32,
    pub shutdowns: u32,
    pub off_resets: u32,
    pub role_starts: u32,
    pub start_ok: bool,
    pub lost_completion: bool,
    pub cancel: Cancel,
    pub radio_busy: bool,
    wake: Option<u64>,
    complete: Option<u64>,
}

impl Badge {
    pub fn new(profile: u8, frogs: bool, now: u64) -> Self {
        let mut badge = Self {
            runtime: Runtime::new(Config::parse(&default_blob(profile), profile), frogs),
            input: Inputs {
                allowed: true,
                connected: false,
                advertising: Some(false),
                wants_advertising: false,
                counter_view: true,
            },
            now,
            panel: None,
            scans: 0,
            writes: 0,
            shutdowns: 0,
            off_resets: 0,
            role_starts: 0,
            start_ok: true,
            lost_completion: false,
            cancel: Cancel::Confirm,
            radio_busy: false,
            wake: None,
            complete: None,
        };
        badge.event(Event::Ready(true));
        badge
    }

    pub fn event(&mut self, event: Event<'_>) -> Output {
        let output = self
            .runtime
            .step(self.now as u32, self.input, event, &font::FONT);
        self.wake = output.wake_after.map(|delay| self.now + u64::from(delay));
        if !output.owned {
            self.panel = None;
        }
        if let Some(frame) = output.frame {
            self.panel = Some(frame);
            self.writes += 1;
        }
        if output.start_role {
            self.role_starts += 1;
        }
        if output.stop_advertising {
            self.input.advertising = Some(false);
        }
        if output.start_scan {
            assert!(!self.radio_busy && !self.input.connected && self.input.allowed);
            assert_eq!(self.input.advertising, Some(false));
            self.scans += 1;
            if self.start_ok {
                self.radio_busy = true;
                if !self.lost_completion {
                    self.complete = Some(self.now + u64::from(3 * SECOND));
                }
            }
            self.event(Event::StartResult(self.start_ok));
        }
        if output.cancel_scan {
            let idle = self.cancel == Cancel::AlreadyIdle;
            if idle {
                self.radio_busy = false;
                self.complete = None;
            } else if self.cancel == Cancel::Confirm {
                self.complete = Some(self.now + 160);
            }
            self.event(Event::CancelResult { idle });
        }
        if output.advertise {
            assert!(!self.radio_busy && !self.input.connected && self.input.wants_advertising);
            self.input.advertising = Some(true);
        }
        if output.reset_off {
            // Model the reset boundary separately from a confirmed-idle handoff.
            self.off_resets += 1;
            self.radio_busy = false;
            self.complete = None;
            self.input.connected = false;
            self.input.advertising = Some(false);
        }
        if output.shutdown_idle {
            assert!(!self.radio_busy);
            self.shutdowns += 1;
        }
        assert!(self.runtime.retained_addresses() <= 64);
        if let Some(frame) = self.panel {
            assert!(frame.iter().all(|p| p & !0x7ff == 0));
        }
        output
    }

    /// Jump to each scheduled event; no sleeps or wall-clock nondeterminism.
    pub fn advance(&mut self, ticks: u64) {
        let end = self.now.checked_add(ticks).expect("virtual clock overflow");
        let mut events = 0;
        loop {
            let next = self.wake.into_iter().chain(self.complete).min();
            let Some(next) = next.filter(|&at| at <= end) else {
                break;
            };
            self.now = next;
            events += 1;
            assert!(events < 1_000_000, "event loop failed to make progress");
            if self.complete == Some(next) {
                self.complete = None;
                self.radio_busy = false;
                self.event(Event::Complete(true));
            } else {
                self.wake = None;
                self.event(Event::Tick);
            }
        }
        self.now = end;
    }

    pub fn report(&mut self, address: [u8; 6], address_type: u8, data: &[u8]) {
        self.event(Event::Report {
            address,
            address_type,
            data,
        });
    }
    pub fn name(&mut self, name: &str) {
        assert!(name.len() < 254);
        let mut data = vec![(name.len() + 1) as u8, 9];
        data.extend_from_slice(name.as_bytes());
        self.report([1; 6], 1, &data);
    }
    pub fn download(&mut self) {
        self.input.allowed = false;
        self.input.wants_advertising = true;
        let out = self.event(Event::Suspend {
            advertise_after: true,
        });
        // Match the C mode caller's immediate-idle handoff.
        if out.radio_idle {
            assert!(!self.radio_busy && !self.input.connected);
            self.input.advertising = Some(true);
        }
    }
    pub fn off(&mut self) {
        self.input.allowed = false;
        self.input.wants_advertising = false;
        self.input.advertising = Some(false);
        self.event(Event::Shutdown);
    }
    pub fn normal(&mut self) {
        self.input.allowed = true;
        self.input.wants_advertising = false;
        self.input.advertising = Some(false);
        self.event(Event::Resume);
    }
}

/// Deterministic scan-count soak. Identifiers never appear in its output.
pub fn soak(hours: u32) -> (u32, u32) {
    let mut total = (0, 0);
    for profile in [1, 2] {
        for frogs in [false, true] {
            let mut badge = Badge::new(profile, frogs, u64::from(u32::MAX) - 8000);
            let end = badge.now + u64::from(hours) * 3600 * u64::from(SECOND);
            let mut previous_scan = 0;
            while badge.now < end {
                badge.advance(u64::from(SECOND / 4));
                if badge.radio_busy && badge.scans != previous_scan {
                    previous_scan = badge.scans;
                    for id in 0u8..72 {
                        badge.report([id; 6], 1, &[]);
                    }
                    badge.name("Flipper Zero");
                }
            }
            assert_eq!(badge.runtime.completed(), (64, true));
            total.0 += badge.scans;
            total.1 += badge.writes;
        }
    }
    total
}
