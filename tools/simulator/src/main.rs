use frogalert_core::display::{FrameBuffer, COLUMNS, ROWS};
use frogalert_core::{classify, Observation};

fn main() {
    let mut args = std::env::args().skip(1);
    let address_text = args.next().unwrap_or_else(|| usage());
    if address_text == "--count" {
        let count = args
            .next()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or_else(|| usage());
        let saturated = args.next().as_deref() == Some("--saturated");
        print_count(count, saturated);
        return;
    }
    let name = args.next();
    let address = parse_address(&address_text).unwrap_or_else(|| usage());
    // Locally administered bit means the address is not a reliable OUI.
    let public_address = address[0] & 0x02 == 0;
    let observation = Observation {
        address,
        public_address,
        name: name.as_deref().map(str::as_bytes),
        badge_magic_service: false,
    };

    match classify(&observation) {
        Some(found) => println!("{} ({})", found.kind.message(), found.label),
        None => println!("NO MATCH"),
    }
}

fn print_count(count: usize, saturated: bool) {
    let mut frame = FrameBuffer::new();
    frame.render_device_count(count, saturated);
    println!(
        "nearby BLE devices: {count}{}",
        if saturated { "+" } else { "" }
    );
    for row in 0..ROWS {
        for column in 0..COLUMNS {
            print!("{}", if frame.pixel(column, row) { '#' } else { '.' });
        }
        println!();
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
    eprintln!("usage:");
    eprintln!("  frogalert-simulator AA:BB:CC:DD:EE:FF [advertised-name]");
    eprintln!("  frogalert-simulator --count NUMBER [--saturated]");
    std::process::exit(2)
}
