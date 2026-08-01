# 2026-08-01 Linux BLE methodology probe

- Added `tools/ble-probe.py` to compare non-root BlueZ discovery with direct
  raw-HCI passive and active scan windows. The passive/active comparison is the
  closest host-side experiment for testing whether the CH582M's passive survey
  misses a name or service that exists only in a scan response.
- Raw mode supports legacy and extended LE advertising reports and falls back
  to the legacy scan commands when extended scanning is unavailable.
- Output replaces controller addresses with run-local labels, retains data only
  in memory, and prints parsed names, 16-bit services, company IDs, AD types,
  RSSI, and whether scan-response evidence was observed.
- Bluetooth SIG assignments `0x01AB` and `0x058E` (company IDs) and `0xFD5F`,
  `0xFEB7`, and `0xFEB8` (16-bit services) are included only as Meta research
  hints. They do not uniquely prove that a device is smart glasses.
- Bluetooth SIG's current public YAML assigns company ID `0x0D53` to
  Luxottica Group S.p.A. The manufacturer-data wire bytes are little-endian
  `53 0D`; the host probe includes this as another research hint, not proof of
  a specific glasses model.
- The host BlueZ path was exercised while another discovery was already in
  progress. Shared-scan handling worked, but no fresh reports arrived in the
  five-second observation window. Root raw-HCI comparison and a physical
  glasses observation remain pending.
- A later 30-second BlueZ run observed 83 fresh devices but none of the
  configured Meta/Luxottica indicators. It also exposed that BlueZ `Alias`
  defaults to a formatted Bluetooth address. The probe now ignores `Alias` and
  suppresses address-shaped `Name` values; a regression test locks that privacy
  boundary.
- Added opt-in `--stop-on-candidate` behavior for BlueZ and raw-HCI modes. It
  prints the matched observation and reasons before exiting; a passive match in
  `compare` mode skips the active window.
- The first root `compare` attempt on Python 3.14 failed before scanning with a
  bare `EINVAL`. Python 3.14 documents direct integer HCI `device_id` binding;
  the probe had tried the historical one-element tuple first. It now prefers
  the integer form, falls back only on `TypeError`, and gives distinct raw
  socket, bind/filter, and command-send errors. Physical rerun is pending.
