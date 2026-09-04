//! Validate the entire AD payload before trusting any field, including a match.

const SHORTENED_LOCAL_NAME: u8 = 0x08;
const COMPLETE_LOCAL_NAME: u8 = 0x09;
const UUID16_MORE: u8 = 0x02;
const UUID16_COMPLETE: u8 = 0x03;
const MANUFACTURER_SPECIFIC: u8 = 0xff;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdvertisementError {
    TruncatedField,
}

fn fields(data: &[u8], mut visit: impl FnMut(u8, &[u8])) -> Result<(), AdvertisementError> {
    let mut rest = data;
    while let Some((&length, tail)) = rest.split_first() {
        if length == 0 {
            break;
        }
        let n = usize::from(length);
        if n > tail.len() {
            return Err(AdvertisementError::TruncatedField);
        }
        let (field, next) = tail.split_at(n);
        let kind = field[0];
        let value = &field[1..];
        if matches!(kind, UUID16_MORE | UUID16_COMPLETE) && !value.len().is_multiple_of(2) {
            return Err(AdvertisementError::TruncatedField);
        }
        visit(kind, value);
        rest = next;
    }
    Ok(())
}

pub fn local_name(data: &[u8]) -> Result<Option<&[u8]>, AdvertisementError> {
    // The iterator validates every byte; then borrow the winning field directly.
    fields(data, |_, _| {})?;
    let mut rest = data;
    let (mut shortened, mut complete) = (None, None);
    while let Some((&length, tail)) = rest.split_first() {
        if length == 0 {
            break;
        }
        let (field, next) = tail.split_at(usize::from(length));
        match field[0] {
            COMPLETE_LOCAL_NAME => complete = Some(&field[1..]),
            SHORTENED_LOCAL_NAME => shortened = Some(&field[1..]),
            _ => {}
        }
        rest = next;
    }
    Ok(complete.or(shortened))
}

pub fn has_service16(data: &[u8], service: u16) -> Result<bool, AdvertisementError> {
    let mut found = false;
    fields(data, |kind, value| {
        if matches!(kind, UUID16_MORE | UUID16_COMPLETE) {
            found |= value
                .as_chunks::<2>()
                .0
                .iter()
                .any(|uuid| u16::from_le_bytes(*uuid) == service);
        }
    })?;
    Ok(found)
}

pub fn has_company_id(data: &[u8], company: u16) -> Result<bool, AdvertisementError> {
    let mut found = false;
    fields(data, |kind, value| {
        if kind == MANUFACTURER_SPECIFIC && value.len() >= 2 {
            found |= u16::from_le_bytes([value[0], value[1]]) == company;
        }
    })?;
    Ok(found)
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

    #[test]
    fn service_helper_rejects_an_incomplete_uuid() {
        let data = [2, UUID16_COMPLETE, 0x81];
        assert_eq!(
            has_service16(&data, 0x3081),
            Err(AdvertisementError::TruncatedField)
        );
    }
}
