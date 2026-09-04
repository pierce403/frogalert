//! Fixed-point battery reporting and compact, bounded boot cards.
use crate::render::Frame;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Battery {
    pub millivolts: u16,
    pub percent: u8,
}

pub fn battery(raw: u16) -> Battery {
    // The ADC is 12 bit. Clamp before multiplication, including invalid SDK input.
    let mv = (u32::from(raw.min(4095)) * 2100 * 282 + 204800) / 409600;
    let percent = ((mv.saturating_sub(3300) * 100 + 450) / 900).min(100) as u8;
    Battery {
        millivolts: mv as u16,
        percent,
    }
}
pub fn battery_text(reading: Battery) -> [u8; 11] {
    let cv = ((u32::from(reading.millivolts) + 5) / 10).min(599);
    let p = reading.percent.min(100);
    let mut text = [0; 11];
    text[..6].copy_from_slice(&[
        b'0' + (cv / 100) as u8,
        b'.',
        b'0' + (cv / 10 % 10) as u8,
        b'0' + (cv % 10) as u8,
        b'V',
        b' ',
    ]);
    let mut i = 6;
    if p == 100 {
        text[i..i + 3].copy_from_slice(b"100");
        i += 3;
    } else {
        if p >= 10 {
            text[i] = b'0' + p / 10;
            i += 1;
        }
        text[i] = b'0' + p % 10;
        i += 1;
    }
    text[i] = b'%';
    text
}
const GLYPHS: &[(u8, [u8; 5])] = &[
    (b' ', [0, 0, 0, 0, 0]),
    (b'%', [5, 1, 2, 4, 5]),
    (b'.', [0, 0, 0, 0, 2]),
    (b'0', [7, 5, 5, 5, 7]),
    (b'1', [2, 6, 2, 2, 7]),
    (b'2', [7, 1, 7, 4, 7]),
    (b'3', [7, 1, 7, 1, 7]),
    (b'4', [5, 5, 7, 1, 1]),
    (b'5', [7, 4, 7, 1, 7]),
    (b'6', [7, 4, 7, 5, 7]),
    (b'7', [7, 1, 1, 1, 1]),
    (b'8', [7, 5, 7, 5, 7]),
    (b'9', [7, 5, 7, 1, 7]),
    (b'A', [2, 5, 7, 5, 5]),
    (b'F', [7, 4, 6, 4, 4]),
    (b'I', [7, 2, 2, 2, 7]),
    (b'O', [7, 5, 5, 5, 7]),
    (b'S', [7, 4, 7, 1, 7]),
    (b'V', [5, 5, 5, 5, 2]),
    (b'a', [0, 3, 5, 5, 3]),
    (b'b', [4, 4, 6, 5, 6]),
    (b'r', [0, 0, 6, 4, 4]),
    (b'v', [0, 5, 5, 5, 2]),
];
fn glyph(frame: &mut Frame, rows: [u8; 5], column: usize, row: usize) {
    for (y, bits) in rows.iter().enumerate() {
        for x in 0..3 {
            if bits & (1 << (2 - x)) != 0 {
                if let Some(value) = frame.get_mut(column + x) {
                    *value |= 1 << (row + y);
                }
            }
        }
    }
}
fn text(frame: &mut Frame, text: &[u8], column: usize, row: usize) {
    for (i, ch) in text.iter().enumerate() {
        let rows = GLYPHS
            .iter()
            .find(|(c, _)| c == ch)
            .map_or([0; 5], |(_, r)| *r);
        glyph(frame, rows, column + i * 4, row);
    }
}
pub fn credit(version: &[u8], profile: u8) -> Frame {
    let mut frame = [0; 44];
    if version.is_empty() || version.len() > 10 || !matches!(profile, 1 | 2) {
        return frame;
    }
    text(&mut frame, b"FOSSASIA", 6, 0);
    let width = version.len() * 4 - 1;
    let start = (44 - (width + 5)) / 2;
    text(&mut frame, version, start, 6);
    glyph(
        &mut frame,
        if profile == 2 {
            [2, 7, 2, 2, 2]
        } else {
            [2, 2, 2, 7, 2]
        },
        start + width + 2,
        6,
    );
    frame
}
pub fn battery_frame(reading: Battery) -> Frame {
    let mut frame = [0; 44];
    let bytes = battery_text(reading);
    let n = bytes.iter().position(|&b| b == 0).unwrap_or(10);
    text(&mut frame, &bytes[..n], (44 - (n * 4 - 1)) / 2, 3);
    frame
}
