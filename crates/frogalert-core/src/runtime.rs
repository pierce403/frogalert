//! One reducer owns scan lifecycle and display deadlines; it never calls hardware.
//!
//! Time is WCH's wrapping 625-us TMOS clock. The adapter executes returned
//! commands only after this mutable borrow ends, so SDK callbacks may reenter.

use crate::{
    config::{Config, Detection},
    render::{self, Font, Frame, Pages},
    scan::ScanCounter,
    AlertKind,
};

pub const SECOND: u32 = 1600;
const FIRST: u32 = 15 * SECOND;
const RETRY: u32 = 10 * SECOND;
const QUIET: u32 = SECOND / 4;
const NEXT: u32 = 20 * SECOND - 3 * SECOND - QUIET;

#[derive(Clone, Copy, Debug, Default)]
pub struct Inputs {
    pub allowed: bool,
    pub connected: bool,
    /// None means the controller state read failed: never start discovery.
    pub advertising: Option<bool>,
    pub wants_advertising: bool,
    pub counter_view: bool,
}

#[derive(Clone, Copy, Debug)]
pub enum Event<'a> {
    Tick,
    Ready(bool),
    StartResult(bool),
    CancelResult {
        idle: bool,
    },
    Report {
        address: [u8; 6],
        address_type: u8,
        data: &'a [u8],
    },
    Complete(bool),
    Suspend {
        advertise_after: bool,
    },
    Shutdown,
    Resume,
    View,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Phase {
    Offline(u32),
    Waiting(u32),
    Quiet(u32),
    Scanning(u32),
    Cancelling(u32),
    PowerWait(u32),
    Stopped,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Output {
    pub start_role: bool,
    pub stop_advertising: bool,
    pub start_scan: bool,
    pub cancel_scan: bool,
    pub advertise: bool,
    pub shutdown_idle: bool,
    pub reset_off: bool,
    pub disconnect: bool,
    pub radio_idle: bool,
    pub owned: bool,
    pub frame: Option<Frame>,
    pub wake_after: Option<u32>,
}

pub struct Runtime {
    phase: Phase,
    config: Option<Config>,
    counter: ScanCounter<64>,
    completed: (u8, bool),
    detected: Option<Detection>,
    alert: Option<(Detection, Pages, u32)>,
    last_frame: Option<Frame>,
    restore_advertising: bool,
    advertise_after: bool,
    shutdown: bool,
    shutdown_deadline: Option<u32>,
    ready: bool,
    frogs: bool,
    frog_epoch: u32,
}

fn due(now: u32, deadline: u32) -> bool {
    now.wrapping_sub(deadline) < 0x8000_0000
}

impl Runtime {
    pub const fn new(config: Option<Config>, frogs: bool) -> Self {
        Self {
            phase: Phase::Stopped,
            config,
            counter: ScanCounter::new(),
            completed: (0, false),
            detected: None,
            alert: None,
            last_frame: None,
            restore_advertising: false,
            advertise_after: false,
            shutdown: false,
            shutdown_deadline: None,
            ready: false,
            frogs,
            frog_epoch: 0,
        }
    }

    pub fn completed(&self) -> (u8, bool) {
        self.completed
    }
    pub fn retained_addresses(&self) -> usize {
        self.counter.count()
    }
    pub fn scanning(&self) -> bool {
        matches!(self.phase, Phase::Scanning(_) | Phase::Cancelling(_))
    }

    fn finish(&mut self, now: u32, success: bool, input: Inputs, out: &mut Output) {
        if success {
            self.completed = (self.counter.count() as u8, self.counter.is_saturated());
        }
        self.counter.clear();
        if self.shutdown {
            if input.advertising == Some(false) && !input.connected {
                self.phase = Phase::Stopped;
                out.shutdown_idle = true;
                self.shutdown_deadline = None;
            } else {
                self.phase = Phase::PowerWait(now.wrapping_add(QUIET));
                out.stop_advertising = true;
                out.disconnect = input.connected;
            }
        } else {
            self.phase = if self.ready {
                Phase::Waiting(now.wrapping_add(if success { NEXT } else { RETRY }))
            } else {
                Phase::Offline(now.wrapping_add(RETRY))
            };
            out.advertise = (self.restore_advertising || self.advertise_after)
                && input.wants_advertising
                && !input.connected;
        }
        self.restore_advertising = false;
        self.advertise_after = false;
    }

    fn suspend(&mut self, now: u32, advertise_after: bool, input: Inputs, out: &mut Output) {
        self.alert = None;
        self.counter.clear(); // Wipe on request, even if the controller never answers.
        self.restore_advertising = false;
        self.advertise_after = advertise_after && !self.shutdown;
        if self.scanning() {
            self.phase = Phase::Cancelling(now.wrapping_add(RETRY));
            out.cancel_scan = true;
        } else {
            self.finish(now, false, input, out);
            // An idle suspend returns ownership to the mode caller, which starts
            // advertising itself. Only asynchronous cancellation restores it here.
            out.advertise = false;
        }
    }

    pub fn step(&mut self, now: u32, input: Inputs, event: Event<'_>, font: &Font) -> Output {
        let mut out = Output::default();
        match event {
            Event::Ready(success) => {
                if success && !self.ready && !self.shutdown && !self.scanning() {
                    self.phase = Phase::Waiting(now.wrapping_add(FIRST));
                }
                self.ready = success;
                if !success {
                    if self.scanning() {
                        self.suspend(now, false, input, &mut out);
                    } else if !self.shutdown {
                        self.phase = Phase::Offline(now.wrapping_add(RETRY));
                    }
                }
            }
            Event::StartResult(false) if matches!(self.phase, Phase::Scanning(_)) => {
                self.finish(now, false, input, &mut out)
            }
            Event::CancelResult { idle: true } if matches!(self.phase, Phase::Cancelling(_)) => {
                self.finish(now, false, input, &mut out)
            }
            Event::Complete(success) if self.scanning() => {
                let valid = success
                    && matches!(self.phase, Phase::Scanning(_))
                    && input.allowed
                    && !input.connected;
                self.finish(now, valid, input, &mut out);
            }
            Event::Report {
                address,
                address_type,
                data,
            } if matches!(self.phase, Phase::Scanning(_)) && input.allowed && !input.connected => {
                self.counter.observe_typed(address, address_type);
                if let Some(found) = self
                    .config
                    .as_ref()
                    .and_then(|c| c.classify(address, address_type == 0, data))
                {
                    if self
                        .detected
                        .is_none_or(|old| found.priority() > old.priority())
                    {
                        self.detected = Some(found);
                        if let Some(pages) = Pages::new(&found.message[..usize::from(found.length)])
                        {
                            self.alert = Some((found, pages, now));
                        }
                    }
                }
            }
            Event::Suspend { advertise_after } => {
                self.suspend(now, advertise_after, input, &mut out)
            }
            Event::Shutdown => {
                if !self.shutdown {
                    self.shutdown_deadline = Some(now.wrapping_add(30 * SECOND));
                }
                self.shutdown = true;
                self.suspend(now, false, input, &mut out);
            }
            Event::Resume => {
                self.shutdown = false;
                self.shutdown_deadline = None;
                self.advertise_after = false;
                if self.ready && !self.scanning() {
                    self.phase = Phase::Waiting(now.wrapping_add(QUIET));
                }
            }
            Event::View => {
                self.frog_epoch = now;
                self.last_frame = None;
            }
            _ => {}
        }

        // A lost SDK acknowledgement is not proof of idle. Reset the controller
        // into a marked-off cold boot instead of draining the battery forever.
        if self.shutdown_deadline.is_some_and(|at| due(now, at)) {
            self.counter.clear();
            self.alert = None;
            self.last_frame = None;
            self.shutdown_deadline = None;
            self.phase = Phase::Stopped;
            return Output {
                reset_off: true,
                ..Output::default()
            };
        }

        // Event bits may already be queued when a task is stopped. Only actual
        // deadlines can advance state, so a stale wake cannot start an early scan.
        if matches!(event, Event::Tick) {
            match self.phase {
                Phase::Offline(at) if due(now, at) && !self.shutdown => {
                    out.start_role = true;
                    self.phase = Phase::Offline(now.wrapping_add(RETRY));
                }
                Phase::Waiting(at) if due(now, at) && !self.shutdown => {
                    if self.ready
                        && input.allowed
                        && !input.connected
                        && input.advertising.is_some()
                    {
                        self.counter.clear();
                        self.detected = None;
                        self.alert = None;
                        self.restore_advertising = input.advertising == Some(true);
                        out.stop_advertising = self.restore_advertising;
                        self.phase = Phase::Quiet(now.wrapping_add(QUIET));
                    } else {
                        self.phase = Phase::Waiting(now.wrapping_add(RETRY));
                    }
                }
                Phase::Quiet(at) if due(now, at) => {
                    if input.allowed
                        && !input.connected
                        && input.advertising == Some(false)
                        && !self.shutdown
                    {
                        self.phase = Phase::Scanning(now.wrapping_add(5 * SECOND));
                        out.start_scan = true;
                    } else {
                        self.finish(now, false, input, &mut out);
                    }
                }
                Phase::Scanning(at) if due(now, at) => {
                    self.counter.clear();
                    self.phase = Phase::Cancelling(now.wrapping_add(RETRY));
                    out.cancel_scan = true;
                }
                Phase::Cancelling(at) if due(now, at) => {
                    // Never pretend a stuck controller is idle. Retry cancellation
                    // while keeping advertising, new scans, and shutdown blocked.
                    self.phase = Phase::Cancelling(now.wrapping_add(RETRY));
                    out.cancel_scan = true;
                }
                Phase::PowerWait(at) if due(now, at) => self.finish(now, false, input, &mut out),
                _ => {}
            }
        }

        if self.scanning()
            && matches!(self.phase, Phase::Scanning(_))
            && (!input.allowed || input.connected || self.shutdown)
        {
            self.suspend(now, input.wants_advertising, input, &mut out);
        }
        let mut next = match self.phase {
            Phase::Offline(at)
            | Phase::Waiting(at)
            | Phase::Quiet(at)
            | Phase::Scanning(at)
            | Phase::Cancelling(at)
            | Phase::PowerWait(at) => Some(at),
            Phase::Stopped => None,
        };
        if let Some(at) = self.shutdown_deadline {
            earlier(now, &mut next, at);
        }
        let mut frame = None;
        if input.allowed && !self.shutdown {
            if let Some((found, pages, start)) = self.alert {
                let page = now.wrapping_sub(start) / SECOND;
                let count = if found.kind == AlertKind::FrogDance {
                    3
                } else {
                    u32::from(pages.count)
                };
                if page < count {
                    frame = Some(if found.kind == AlertKind::FrogDance {
                        render::frogs(page as u8)
                    } else {
                        pages.frame(page as u8, font)
                    });
                    earlier(now, &mut next, start.wrapping_add((page + 1) * SECOND));
                } else {
                    self.alert = None;
                }
            }
            if frame.is_none() && input.counter_view {
                frame = Some(if self.frogs {
                    let step = now.wrapping_sub(self.frog_epoch) / (SECOND / 2);
                    earlier(
                        now,
                        &mut next,
                        now.wrapping_add(
                            SECOND / 2 - now.wrapping_sub(self.frog_epoch) % (SECOND / 2),
                        ),
                    );
                    render::frogs(step as u8)
                } else {
                    render::count(self.completed.0, self.completed.1, font)
                });
            }
        } else {
            self.alert = None;
        }
        out.owned = frame.is_some();
        if frame != self.last_frame {
            out.frame = frame;
        }
        self.last_frame = frame;
        out.radio_idle = !self.scanning() && !matches!(self.phase, Phase::PowerWait(_));
        out.wake_after = next.map(|at| {
            if due(now, at) {
                1
            } else {
                at.wrapping_sub(now)
            }
        });
        out
    }
}

fn earlier(now: u32, next: &mut Option<u32>, at: u32) {
    if next.is_none_or(|old| at.wrapping_sub(now) < old.wrapping_sub(now)) {
        *next = Some(at);
    }
}
