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
- The host BlueZ path was exercised while another discovery was already in
  progress. Shared-scan handling worked, but no fresh reports arrived in the
  five-second observation window. Root raw-HCI comparison and a physical
  glasses observation remain pending.
