fn main() {
    for key in [
        "FROGALERT_PROFILE_ID",
        "FROGALERT_VERSION",
        "FROGALERT_DISPLAY_VERSION",
    ] {
        println!("cargo:rerun-if-env-changed={key}");
        let default = match key {
            "FROGALERT_PROFILE_ID" => "2",
            "FROGALERT_VERSION" => "0.3.0",
            _ => "v0.3.0",
        };
        let value = std::env::var(key).unwrap_or_else(|_| default.into());
        assert!(value.is_ascii() && !value.contains('\0'));
        if key == "FROGALERT_PROFILE_ID" {
            assert!(value == "1" || value == "2");
        }
        if key == "FROGALERT_DISPLAY_VERSION" {
            assert!(!value.is_empty() && value.len() <= 10);
        }
        println!("cargo:rustc-env={key}={value}");
    }
}
