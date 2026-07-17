# FrogAlert

FrogAlert is an experimental firmware project for the FOSSASIA BadgeMagic
CH582M badge. The badge remains a Bluetooth-programmable nametag, but briefly
scans nearby BLE advertisements about once a minute and displays an alert when
a configured signature is observed.

The first prototype is written in Rust. It currently contains the portable,
`no_std` detection engine, tests, a desktop scan simulator, and the CH582M
firmware integration plan. It does **not** yet produce a safe-to-flash image;
the display driver and dual-role BLE state machine must be ported and tested on
physical hardware first.

## Hardware gate

Do not flash a badge until you have opened it and verified all of the following:

- MCU marking: **CH582M**
- display: **11 rows x 44 columns**
- a recoverable ISP connection has been tested

The factory firmware is read-protected. Flashing an incompatible badge can be
irreversible. See [docs/HARDWARE.md](docs/HARDWARE.md).

## Try the detection logic

```sh
cargo test --workspace
cargo run -p frogalert-simulator -- "00:25:DF:12:34:56" "Axon Body 4"
```

Expected output:

```text
COP DETECTED (Axon OUI)
```

Other useful examples:

```sh
cargo run -p frogalert-simulator -- "C2:00:00:00:00:01" "Flipper Zero"
cargo run -p frogalert-simulator -- "B4:1E:52:00:00:01" ""
```

## Design target

The intended radio schedule is:

1. advertise as `LED Badge Magic` with legacy service `FEE0/FEE1` so the
   BadgeMagic app can upload normal nametag content;
2. every 60 seconds, when disconnected, pause advertising and passively scan
   for 3 seconds;
3. match public BLE addresses and advertised names locally (nothing is logged
   or transmitted);
4. temporarily override the nametag animation with `COP DETECTED` or
   `HAX DETECTED`, then return to the uploaded content;
5. resume BadgeMagic advertising immediately.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/UPSTREAM.md](docs/UPSTREAM.md) for implementation details and sources.

## Project status

- [x] Hardware and upstream protocol research
- [x] Rust `no_std` signature engine with tests
- [x] Host simulator for test observations
- [ ] Port the 11x44 charlieplexed display driver to Rust
- [ ] Implement BadgeMagic-compatible `FEE0/FEE1` writes
- [ ] Implement safe peripheral/observer radio role switching
- [ ] Build and flash only after physical badge identification
- [ ] Verify upload compatibility with the BadgeMagic app

## License

Apache-2.0; see [LICENSE](LICENSE). Upstream projects retain their own licenses.

