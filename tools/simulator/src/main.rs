use frogalert_core::{classify, Observation};

fn main() {
    let mut args = std::env::args().skip(1);
    let address_text = args.next().unwrap_or_else(|| usage());
    let name = args.next();
    let address = parse_address(&address_text).unwrap_or_else(|| usage());
    // Locally administered bit means the address is not a reliable OUI.
    let public_address = address[0] & 0x02 == 0;
    let observation = Observation {
        address,
        public_address,
        name: name.as_deref().map(str::as_bytes),
    };

    match classify(&observation) {
        Some(found) => println!("{} ({})", found.kind.message(), found.label),
        None => println!("NO MATCH"),
    }
}

fn parse_address(input: &str) -> Option<[u8; 6]> {
    let mut address = [0; 6];
    let mut parts = input.split(':');
    for byte in &mut address {
        *byte = u8::from_str_radix(parts.next()?, 16).ok()?;
    }
    if parts.next().is_some() {
        None
    } else {
        Some(address)
    }
}

fn usage() -> ! {
    eprintln!("usage: frogalert-simulator AA:BB:CC:DD:EE:FF [advertised-name]");
    std::process::exit(2)
}
