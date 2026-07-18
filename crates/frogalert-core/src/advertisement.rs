//! Small, allocation-free helpers for BLE advertising data.

const SHORTENED_LOCAL_NAME: u8 = 0x08;
const COMPLETE_LOCAL_NAME: u8 = 0x09;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdvertisementError {
    TruncatedField,
}

/// Finds the best local-name field in a legacy BLE advertising payload.
///
/// A Complete Local Name wins over a Shortened Local Name regardless of field
/// order. A zero-length field terminates the payload, as required by the AD
/// structure format.
pub fn local_name(data: &[u8]) -> Result<Option<&[u8]>, AdvertisementError> {
    let mut offset = 0;
    let mut shortened = None;

    while offset < data.len() {
        let field_len = data[offset] as usize;
        offset += 1;
        if field_len == 0 {
            break;
        }
        if field_len > data.len() - offset {
            return Err(AdvertisementError::TruncatedField);
        }

        let field_type = data[offset];
        let value = &data[offset + 1..offset + field_len];
        match field_type {
            COMPLETE_LOCAL_NAME => return Ok(Some(value)),
            SHORTENED_LOCAL_NAME => shortened = Some(value),
            _ => {}
        }
        offset += field_len;
    }

    Ok(shortened)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_name_wins_over_shortened_name() {
        let data = [
            4,
            SHORTENED_LOCAL_NAME,
            b'F',
            b'r',
            b'o',
            6,
            COMPLETE_LOCAL_NAME,
            b'F',
            b'r',
            b'o',
            b'g',
            b'!',
        ];
        assert_eq!(local_name(&data), Ok(Some(&b"Frog!"[..])));
    }

    #[test]
    fn returns_shortened_name_when_complete_name_is_absent() {
        let data = [2, 0x01, 0x06, 4, SHORTENED_LOCAL_NAME, b'B', b'L', b'E'];
        assert_eq!(local_name(&data), Ok(Some(&b"BLE"[..])));
    }

    #[test]
    fn rejects_truncated_fields_without_panicking() {
        assert_eq!(
            local_name(&[5, COMPLETE_LOCAL_NAME, b'B']),
            Err(AdvertisementError::TruncatedField)
        );
    }

    #[test]
    fn zero_length_field_terminates_payload() {
        assert_eq!(
            local_name(&[0, 4, COMPLETE_LOCAL_NAME, b'B', b'L', b'E']),
            Ok(None)
        );
    }
}
