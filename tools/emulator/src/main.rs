fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let hours = match args.as_slice() {
        [] => 24,
        [flag, value] if flag == "--soak-hours" => value
            .parse::<u32>()
            .ok()
            .filter(|n| (1..=168).contains(n))
            .unwrap_or_else(|| usage()),
        _ => usage(),
    };
    let (scans, writes) = frogalert_emulator::soak(hours);
    println!("PASS: {hours} virtual hours per profile/lane; {scans} scans, {writes} complete display frames.");
    println!("The shipping Rust application ran with a virtual SDK; RF, current, USB, and physical recovery require badge testing.");
}
fn usage() -> ! {
    eprintln!("usage: frogalert-emulator [--soak-hours 1..168]");
    std::process::exit(2)
}
