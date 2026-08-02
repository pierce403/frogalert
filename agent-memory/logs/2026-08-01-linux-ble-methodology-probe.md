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
- The next root attempt proved integer binding worked and failed specifically
  at `HCI_FILTER`. The installed BlueZ header defines three `uint32_t` fields
  plus one `uint16_t` field, but C reports `sizeof(struct hci_filter) == 16` due
  to trailing alignment. Python had emitted only 14 bytes. The filter now uses
  native layout plus explicit `2x` padding, with a test locking the 16-byte ABI;
  physical rerun remains pending.
- The physical rerun succeeded in raw passive mode. Its first candidate report
  carried service `0xFD5F` and company `0x01AB` together at RSSI -69 with AD
  types `01,03,FF`; `--stop-on-candidate` ended the comparison before an active
  scan. No controller address was recorded.
- The survey classifier now treats only that same-report pair as the Meta
  glasses hint. `0x01AB` or `0xFD5F` alone does not match. This is conservative
  evidence that the CH582M passive methodology can see the fields, not proof of
  device identity or physical validation of a newly built badge image.
- Audited counter candidates are 206,296 bytes: top/`260404`
  `07ca9cf9087103ee56e47782039d130f50e2477d8eb3f19b413f21ac4f087e20`
  and bottom/`250901`
  `029868f3f2207f70882b3bb02deef79a5603a9c3efe1e1782a5aa9455a779f08`.
  Audited frog-view candidates are 206,480 bytes: top/`260404`
  `ede110927fc672480dc927b5ae670359a3a6c71f73671782f3be892d3f2bdeff`
  and bottom/`250901`
  `771f03e9e28b7941517a84ff87445c376482ca1a8191d56d45703dc2f2803062`.
  All four remain under ignored `tmp/` and hardware-unverified.
