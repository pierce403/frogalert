//! Pure 44-column rendering. The adapter supplies FOSSASIA's unchanged 5x7 font.

pub type Frame = [u16; 44];
pub type Font = [[u8; 6]; 95];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Pages {
    text: [u8; 16],
    ranges: [(u8, u8); 2],
    pub count: u8,
}

impl Pages {
    pub fn new(text: &[u8]) -> Option<Self> {
        if text.is_empty() || text.len() > 16 || text.iter().any(|b| !(b' '..=b'~').contains(b)) {
            return None;
        }
        let mut pages = Self {
            text: [0; 16],
            ranges: [(0, text.len() as u8), (0, 0)],
            count: 1,
        };
        pages.text[..text.len()].copy_from_slice(text);
        if text.len() > 8 {
            let split = (1..8)
                .rfind(|&i| text[i] == b' ' && text.len() - i - 1 <= 8)
                .unwrap_or(8);
            let start = (split..text.len())
                .find(|&i| text[i] != b' ')
                .unwrap_or(text.len());
            pages.ranges = [(0, split as u8), (start as u8, (text.len() - start) as u8)];
            // A trailing run of spaces must not underflow centered glyph placement.
            pages.count = if start == text.len() { 1 } else { 2 };
        }
        Some(pages)
    }

    pub fn frame(&self, page: u8, font: &Font) -> Frame {
        let mut frame = [0; 44];
        if page >= self.count {
            return frame;
        }
        let (start, n) = self.ranges[usize::from(page)];
        let n = usize::from(n);
        if n == 0 {
            return frame;
        }
        let stride = if n == 8 { 5 } else { 6 };
        let width = n * stride - usize::from(stride == 6);
        text_at(
            &mut frame,
            &self.text[usize::from(start)..usize::from(start) + n],
            (44 - width) / 2,
            stride,
            font,
        );
        frame
    }
}

fn text_at(frame: &mut Frame, text: &[u8], start: usize, stride: usize, font: &Font) {
    for (i, &ch) in text.iter().enumerate() {
        for (x, &bits) in font[usize::from(ch - b' ')][1..6].iter().enumerate() {
            // Upstream column zero is padding; five glyph columns begin at one.
            if let Some(column) = frame.get_mut(start + i * stride + x) {
                *column = u16::from(bits & 0x7f) << 2;
            }
        }
    }
}

pub fn count(count: u8, saturated: bool, font: &Font) -> Frame {
    let mut frame = [0; 44];
    let count = count.min(64);
    let text = [b'0' + count / 10, b'0' + count % 10, b'+'];
    let n = if saturated { 3 } else { 2 };
    let start = (44 - (8 + n * 6 - 1)) / 2;
    frame[start..start + 6].copy_from_slice(&[0x088, 0x050, 0x7ff, 0x222, 0x154, 0x088]);
    text_at(&mut frame, &text[..n], start + 8, 6, font);
    frame
}

pub fn frogs(pose: u8) -> Frame {
    const POSES: [[u16; 9]; 2] = [
        [
            0x11c, 0x0b6, 0x07e, 0x3f4, 0x1f4, 0x3f4, 0x07e, 0x0b6, 0x11c,
        ],
        [
            0x09c, 0x136, 0x27e, 0x1f4, 0x1f4, 0x1f4, 0x27e, 0x136, 0x09c,
        ],
    ];
    let mut frame = [0; 44];
    for start in [1, 17, 33] {
        frame[start..start + 9].copy_from_slice(&POSES[usize::from(pose & 1)]);
    }
    frame
}

pub fn padded(bitmap: &[u16]) -> bool {
    !bitmap.is_empty()
        && bitmap.len().is_multiple_of(48)
        && bitmap
            .as_chunks::<48>()
            .0
            .iter()
            .all(|f| f[0] == 0 && f[1] == 0 && f[46] == 0 && f[47] == 0)
}
pub fn frame_count(bitmap: &[u16]) -> usize {
    bitmap.len().div_ceil(if padded(bitmap) { 48 } else { 44 })
}
pub fn visible(bitmap: &[u16], frame: u16) -> Frame {
    let padded = padded(bitmap);
    let base = usize::from(frame) * if padded { 48 } else { 44 } + if padded { 2 } else { 0 };
    core::array::from_fn(|i| bitmap.get(base + i).copied().unwrap_or(0))
}
