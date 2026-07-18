//! Hardware-independent 11x44 framebuffer and small bitmap font rendering.

pub const ROWS: usize = 11;
pub const COLUMNS: usize = 44;
const GLYPH_WIDTH: usize = 5;
const GLYPH_HEIGHT: usize = 7;
const GLYPH_ADVANCE: usize = 6;
const ROW_MASK: u16 = (1 << ROWS) - 1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FrameBuffer {
    columns: [u16; COLUMNS],
}

impl FrameBuffer {
    pub const fn new() -> Self {
        Self {
            columns: [0; COLUMNS],
        }
    }

    pub fn clear(&mut self) {
        self.columns.fill(0);
    }

    pub fn set_pixel(&mut self, column: usize, row: usize, on: bool) {
        if column >= COLUMNS || row >= ROWS {
            return;
        }
        let bit = 1_u16 << row;
        if on {
            self.columns[column] |= bit;
        } else {
            self.columns[column] &= !bit;
        }
    }

    pub fn pixel(&self, column: usize, row: usize) -> bool {
        column < COLUMNS && row < ROWS && self.columns[column] & (1_u16 << row) != 0
    }

    pub const fn columns(&self) -> &[u16; COLUMNS] {
        &self.columns
    }

    pub fn render_device_count(&mut self, count: usize, saturated: bool) {
        self.clear();
        let value = count.min(99);
        let digits = if value >= 10 { 2 } else { 1 };
        let glyphs = digits + usize::from(saturated || count > 99);
        let width = glyphs * GLYPH_WIDTH + (glyphs - 1) * (GLYPH_ADVANCE - GLYPH_WIDTH);
        let mut x = (COLUMNS - width) / 2;
        let y = (ROWS - GLYPH_HEIGHT) / 2;

        if digits == 2 {
            self.draw_glyph(digit((value / 10) as u8), x as isize, y);
            x += GLYPH_ADVANCE;
        }
        self.draw_glyph(digit((value % 10) as u8), x as isize, y);
        if saturated || count > 99 {
            self.draw_glyph(glyph(b'+'), (x + GLYPH_ADVANCE) as isize, y);
        }
    }

    /// Renders a clipped 44-column window into a longer 5x7 text strip.
    pub fn render_text_window(&mut self, text: &[u8], offset: usize) {
        self.clear();
        let y = (ROWS - GLYPH_HEIGHT) / 2;
        for (index, byte) in text.iter().copied().enumerate() {
            let x = index * GLYPH_ADVANCE;
            self.draw_glyph(glyph(byte), x as isize - offset as isize, y);
        }
    }

    fn draw_glyph(&mut self, glyph: [u8; GLYPH_WIDTH], x: isize, y: usize) {
        for (glyph_column, bits) in glyph.into_iter().enumerate() {
            let destination = x + glyph_column as isize;
            if !(0..COLUMNS as isize).contains(&destination) {
                continue;
            }
            let shifted = ((bits as u16) << y) & ROW_MASK;
            self.columns[destination as usize] |= shifted;
        }
    }
}

impl Default for FrameBuffer {
    fn default() -> Self {
        Self::new()
    }
}

const fn digit(value: u8) -> [u8; GLYPH_WIDTH] {
    glyph(b'0' + value)
}

// Columns are encoded least-significant bit first, matching the upstream
// BadgeMagic framebuffer convention. This deliberately covers the prototype's
// numeric display and alert vocabulary without carrying a large font table.
const fn glyph(byte: u8) -> [u8; GLYPH_WIDTH] {
    match byte.to_ascii_uppercase() {
        b' ' => [0x00, 0x00, 0x00, 0x00, 0x00],
        b'+' => [0x08, 0x08, 0x3e, 0x08, 0x08],
        b'-' => [0x08, 0x08, 0x08, 0x08, 0x08],
        b'0' => [0x3e, 0x51, 0x49, 0x45, 0x3e],
        b'1' => [0x00, 0x42, 0x7f, 0x40, 0x00],
        b'2' => [0x62, 0x51, 0x49, 0x49, 0x46],
        b'3' => [0x22, 0x49, 0x49, 0x49, 0x36],
        b'4' => [0x18, 0x14, 0x12, 0x7f, 0x10],
        b'5' => [0x2f, 0x49, 0x49, 0x49, 0x31],
        b'6' => [0x3e, 0x49, 0x49, 0x49, 0x32],
        b'7' => [0x01, 0x71, 0x09, 0x05, 0x03],
        b'8' => [0x36, 0x49, 0x49, 0x49, 0x36],
        b'9' => [0x26, 0x49, 0x49, 0x49, 0x3e],
        b'A' => [0x7e, 0x09, 0x09, 0x09, 0x7e],
        b'B' => [0x7f, 0x49, 0x49, 0x49, 0x36],
        b'C' => [0x3e, 0x41, 0x41, 0x41, 0x22],
        b'D' => [0x7f, 0x41, 0x41, 0x22, 0x1c],
        b'E' => [0x7f, 0x49, 0x49, 0x49, 0x41],
        b'F' => [0x7f, 0x09, 0x09, 0x09, 0x01],
        b'G' => [0x3e, 0x41, 0x49, 0x49, 0x7a],
        b'H' => [0x7f, 0x08, 0x08, 0x08, 0x7f],
        b'I' => [0x00, 0x41, 0x7f, 0x41, 0x00],
        b'J' => [0x20, 0x40, 0x41, 0x3f, 0x01],
        b'K' => [0x7f, 0x08, 0x14, 0x22, 0x41],
        b'L' => [0x7f, 0x40, 0x40, 0x40, 0x40],
        b'M' => [0x7f, 0x02, 0x0c, 0x02, 0x7f],
        b'N' => [0x7f, 0x04, 0x08, 0x10, 0x7f],
        b'O' => [0x3e, 0x41, 0x41, 0x41, 0x3e],
        b'P' => [0x7f, 0x09, 0x09, 0x09, 0x06],
        b'Q' => [0x3e, 0x41, 0x51, 0x21, 0x5e],
        b'R' => [0x7f, 0x09, 0x19, 0x29, 0x46],
        b'S' => [0x46, 0x49, 0x49, 0x49, 0x31],
        b'T' => [0x01, 0x01, 0x7f, 0x01, 0x01],
        b'U' => [0x3f, 0x40, 0x40, 0x40, 0x3f],
        b'V' => [0x1f, 0x20, 0x40, 0x20, 0x1f],
        b'W' => [0x7f, 0x20, 0x18, 0x20, 0x7f],
        b'X' => [0x63, 0x14, 0x08, 0x14, 0x63],
        b'Y' => [0x03, 0x04, 0x78, 0x04, 0x03],
        b'Z' => [0x61, 0x51, 0x49, 0x45, 0x43],
        _ => [0x02, 0x01, 0x51, 0x09, 0x06],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_is_centered_and_visible() {
        let mut frame = FrameBuffer::new();
        frame.render_device_count(42, false);
        assert!(frame.pixel(19, 2));
        assert!(frame.pixel(23, 2));
        assert_eq!(
            frame
                .columns()
                .iter()
                .filter(|column| **column != 0)
                .count(),
            10
        );
    }

    #[test]
    fn saturated_count_gets_a_visible_plus() {
        let mut frame = FrameBuffer::new();
        frame.render_device_count(64, true);
        assert!(
            frame
                .columns()
                .iter()
                .filter(|column| **column != 0)
                .count()
                >= 13
        );
    }

    #[test]
    fn long_alert_text_can_scroll_through_the_viewport() {
        let mut first = FrameBuffer::new();
        let mut later = FrameBuffer::new();
        first.render_text_window(b"COP DETECTED", 0);
        later.render_text_window(b"COP DETECTED", 18);
        assert_ne!(first, later);
        assert!(first.columns().iter().any(|column| *column != 0));
        assert!(later.columns().iter().any(|column| *column != 0));
    }

    #[test]
    fn out_of_bounds_pixels_are_ignored() {
        let mut frame = FrameBuffer::new();
        frame.set_pixel(COLUMNS, ROWS, true);
        assert!(frame.columns().iter().all(|column| *column == 0));
    }
}
