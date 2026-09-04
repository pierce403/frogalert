//! C owns startup/interrupts and calls this ABI only on the cooperative TMOS
//! thread. Every pointer must be valid for its declared length; outputs must
//! not alias inputs. No pointer is retained, and Rust never calls back into C.
//! The emulator tests the safe core; the C conformance executable tests this ABI.
#![cfg_attr(target_os = "none", no_std)]
#![deny(unsafe_op_in_unsafe_fn)]
// All exports share the caller contract above, also recorded in frogalert-rust.h.
#![allow(clippy::missing_safety_doc)]

use core::{cell::UnsafeCell, ptr, slice};
use frogalert_core::{
    boot::{self, Battery},
    config::{self, Config},
    render::{self, Font},
    runtime::{Event, Inputs, Runtime},
    transfer::Transfer,
};

const PROFILE: u8 = env!("FROGALERT_PROFILE_ID").as_bytes()[0] - b'0';
const FULL_VERSION: &str = concat!(env!("FROGALERT_VERSION"), "\0");
const DISPLAY_VERSION: &str = concat!(env!("FROGALERT_DISPLAY_VERSION"), "\0");

#[repr(C, align(4))]
pub struct Blob([u8; config::SIZE]);
#[used]
#[no_mangle]
#[link_section = ".rodata.frogalert_config"]
pub static frogalert_monitor_config: Blob = Blob(config::default_blob(PROFILE));

struct Session {
    runtime: Runtime,
    transfer: Transfer,
}
struct SingleThread(UnsafeCell<Session>);
// SAFETY: only the TMOS thread enters this module; the display ISR reads C's
// separately committed framebuffer and never enters Rust or accesses Session.
unsafe impl Sync for SingleThread {}
static SESSION: SingleThread = SingleThread(UnsafeCell::new(Session {
    runtime: Runtime::new(None, false),
    transfer: Transfer::new(),
}));

#[repr(C)]
pub struct Input {
    allowed: u8,
    connected: u8,
    advertising: u8,
    wants_advertising: u8,
    counter_view: u8,
}
#[repr(C)]
pub struct Output {
    actions: u32,
    wake_after: u32,
    owned: u8,
    radio_idle: u8,
    frame_changed: u8,
    reserved: u8,
    frame: [u16; 44],
}
const _: () = assert!(core::mem::size_of::<Output>() == 100);

#[no_mangle]
pub extern "C" fn frogalert_rust_abi() -> u32 {
    0x0003_0001
}

#[no_mangle]
pub unsafe extern "C" fn frogalert_runtime_init(frogs: u8) {
    let mut blob = [0; config::SIZE];
    // Volatile reads prevent LTO from substituting the default constant for a
    // profile-bound configuration patched into the BIN by the existing codec.
    for (i, b) in blob.iter_mut().enumerate() {
        *b = unsafe {
            ptr::read_volatile(
                ptr::addr_of!(frogalert_monitor_config.0)
                    .cast::<u8>()
                    .add(i),
            )
        };
    }
    unsafe {
        *SESSION.0.get() = Session {
            runtime: Runtime::new(Config::parse(&blob, PROFILE), frogs != 0),
            transfer: Transfer::new(),
        }
    };
}

#[no_mangle]
pub unsafe extern "C" fn frogalert_runtime_step(
    now: u32,
    event: u8,
    value: u8,
    input: *const Input,
    address: *const u8,
    data: *const u8,
    length: u16,
    font: *const Font,
    output: *mut Output,
) {
    if input.is_null() || font.is_null() || output.is_null() {
        return;
    }
    let input = unsafe { &*input };
    let bytes = if data.is_null() {
        &[][..]
    } else {
        unsafe { slice::from_raw_parts(data, usize::from(length)) }
    };
    let event = match event {
        1 => Event::Ready(value != 0),
        2 => Event::StartResult(value != 0),
        3 => Event::CancelResult { idle: value != 0 },
        4 => Event::Complete(value != 0),
        5 if !address.is_null() && (length == 0 || !data.is_null()) => Event::Report {
            address: unsafe { ptr::read_unaligned(address.cast::<[u8; 6]>()) },
            address_type: value,
            data: bytes,
        },
        6 => Event::Suspend {
            advertise_after: value != 0,
        },
        7 => Event::Shutdown,
        8 => Event::Resume,
        9 => Event::View,
        _ => Event::Tick,
    };
    let input = Inputs {
        allowed: input.allowed != 0,
        connected: input.connected != 0,
        advertising: match input.advertising {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        },
        wants_advertising: input.wants_advertising != 0,
        counter_view: input.counter_view != 0,
    };
    let result = unsafe { &mut *SESSION.0.get() }
        .runtime
        .step(now, input, event, unsafe { &*font });
    let actions = u32::from(result.start_role)
        | (u32::from(result.stop_advertising) << 1)
        | (u32::from(result.start_scan) << 2)
        | (u32::from(result.cancel_scan) << 3)
        | (u32::from(result.advertise) << 4)
        | (u32::from(result.shutdown_idle) << 5)
        | (u32::from(result.disconnect) << 6);
    unsafe {
        output.write(Output {
            actions,
            wake_after: result.wake_after.unwrap_or(0),
            owned: u8::from(result.owned),
            radio_idle: u8::from(result.radio_idle),
            frame_changed: u8::from(result.frame.is_some()),
            reserved: 0,
            frame: result.frame.unwrap_or([0; 44]),
        })
    };
}

#[no_mangle]
pub unsafe extern "C" fn frogalert_monitor_config_validate(config: *const u8, profile: u8) -> u8 {
    if config.is_null() {
        return 0;
    }
    u8::from(
        Config::parse(
            unsafe { slice::from_raw_parts(config, config::SIZE) },
            profile,
        )
        .is_some(),
    )
}

#[repr(C)]
pub struct TransferWrite {
    offset: u32,
    capacity: u32,
    total: u32,
    restart: u32,
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_transfer_reset() {
    unsafe { &mut *SESSION.0.get() }.transfer.reset();
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_transfer_clock(timestamp: *const u8, output: *mut u16) -> u8 {
    if timestamp.is_null() || output.is_null() {
        return 0;
    }
    let bytes = unsafe { ptr::read_unaligned(timestamp.cast::<[u8; 6]>()) };
    if let Some(clock) = frogalert_core::transfer::clock(bytes) {
        unsafe { ptr::copy_nonoverlapping(clock.as_ptr(), output, 6) };
        1
    } else {
        0
    }
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_transfer_accept(
    data: *const u8,
    length: u16,
    max_data: u32,
    output: *mut TransferWrite,
) -> u8 {
    let session = unsafe { &mut *SESSION.0.get() };
    if data.is_null() || output.is_null() {
        session.transfer.reset();
        return 0;
    }
    let result = session.transfer.accept(
        unsafe { slice::from_raw_parts(data, usize::from(length)) },
        max_data as usize,
    );
    if let Some(w) = result {
        unsafe {
            output.write(TransferWrite {
                offset: w.offset as u32,
                capacity: w.capacity as u32,
                total: w.total.unwrap_or(0) as u32,
                restart: u32::from(w.restart),
            })
        };
        1
    } else {
        0
    }
}

unsafe fn bitmap<'a>(data: *const u16, width: u16) -> &'a [u16] {
    if data.is_null() {
        &[]
    } else {
        unsafe { slice::from_raw_parts(data, usize::from(width)) }
    }
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_animation_has_padded_frames(data: *const u16, width: u16) -> u8 {
    u8::from(render::padded(unsafe { bitmap(data, width) }))
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_animation_frame_count(data: *const u16, width: u16) -> u16 {
    render::frame_count(unsafe { bitmap(data, width) }) as u16
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_animation_copy_visible_frame(
    data: *const u16,
    width: u16,
    frame: u16,
    output: *mut u16,
) {
    let frame = render::visible(unsafe { bitmap(data, width) }, frame);
    if !output.is_null() {
        unsafe { ptr::copy_nonoverlapping(frame.as_ptr(), output, 44) }
    }
}
#[no_mangle]
pub extern "C" fn frogalert_boot_full_version() -> *const u8 {
    FULL_VERSION.as_ptr()
}
#[no_mangle]
pub extern "C" fn frogalert_boot_display_version() -> *const u8 {
    DISPLAY_VERSION.as_ptr()
}
#[no_mangle]
pub extern "C" fn frogalert_battery_from_raw(raw: u16) -> Battery {
    boot::battery(raw)
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_boot_format_battery(output: *mut u8, reading: Battery) {
    if !output.is_null() {
        unsafe { ptr::copy_nonoverlapping(boot::battery_text(reading).as_ptr(), output, 11) }
    }
}
unsafe fn write_frame(output: *mut u16, frame: render::Frame) {
    if !output.is_null() {
        for (i, value) in frame.iter().enumerate() {
            unsafe { ptr::write_volatile(output.add(i), *value) }
        }
    }
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_boot_render_credit(output: *mut u16) {
    unsafe {
        write_frame(
            output,
            boot::credit(env!("FROGALERT_DISPLAY_VERSION").as_bytes(), PROFILE),
        )
    }
}
#[no_mangle]
pub unsafe extern "C" fn frogalert_boot_render_battery(output: *mut u16, reading: Battery) {
    unsafe { write_frame(output, boot::battery_frame(reading)) }
}

#[cfg(target_os = "none")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    // Never unwind across C or leave the badge frozen before its KEY2 task.
    extern "C" {
        fn SYS_ResetExecute();
    }
    unsafe {
        SYS_ResetExecute();
    }
    loop {
        core::hint::spin_loop()
    }
}
