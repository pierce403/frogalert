//! Small, allocation-free helpers for BLE advertising data.

const SHORTENED_LOCAL_NAME: u8 = 0x08;
const COMPLETE_LOCAL_NAME: u8 = 0x09;
const UUID16_MORE: u8 = 0x02;
const UUID16_COMPLETE: u8 = 0x03;
const MANUFACTURER_SPECIFIC: u8 = 0xff;

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

/// Returns whether a little-endian 16-bit UUID list contains `service`.
pub fn has_service16(data: &[u8], service: u16) -> Result<bool, AdvertisementError> {
    let mut offset = 0;

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
        if matches!(field_type, UUID16_MORE | UUID16_COMPLETE) {
            let value = &data[offset + 1..offset + field_len];
            if value
                .chunks_exact(2)
                .any(|uuid| u16::from_le_bytes([uuid[0], uuid[1]]) == service)
            {
                return Ok(true);
            }
        }
        offset += field_len;
    }
    Ok(false)
}

/// Returns whether manufacturer-specific data begins with `company`.
pub fn has_company_id(data: &[u8], company: u16) -> Result<bool, AdvertisementError> {
    let mut offset = 0;

    while offset < data.len() {
        let field_len = data[offset] as usize;
        offset += 1;
        if field_len == 0 {
            break;
        }
        if field_len > data.len() - offset {
            return Err(AdvertisementError::TruncatedField);
        }
        if data[offset] == MANUFACTURER_SPECIFIC && field_len >= 3 {
            let current = u16::from_le_bytes([data[offset + 1], data[offset + 2]]);
            if current == company {
                return Ok(true);
            }
        }
        offset += field_len;
    }
    Ok(false)
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

    #[test]
    fn finds_meta_company_and_service_in_passive_payload() {
        let data = [
            2,
            0x01,
            0x06,
            3,
            UUID16_COMPLETE,
            0x5f,
            0xfd,
            5,
            MANUFACTURER_SPECIFIC,
            0xab,
            0x01,
            0x12,
            0x34,
        ];
        assert_eq!(has_service16(&data, 0xfd5f), Ok(true));
        assert_eq!(has_company_id(&data, 0x01ab), Ok(true));
        assert_eq!(has_company_id(&data, 0x0d53), Ok(false));
    }

    #[test]
    fn field_helpers_fail_closed_on_truncated_data() {
        let data = [4, MANUFACTURER_SPECIFIC, 0xab];
        assert_eq!(
            has_company_id(&data, 0x01ab),
            Err(AdvertisementError::TruncatedField)
        );
        assert_eq!(
            has_service16(&data, 0xfd5f),
            Err(AdvertisementError::TruncatedField)
        );
    }
}
