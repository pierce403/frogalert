import importlib.util
import pathlib
import struct
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ble_probe", ROOT / "tools" / "ble-probe.py")
assert SPEC and SPEC.loader
ble_probe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ble_probe
SPEC.loader.exec_module(ble_probe)


class BleProbeTests(unittest.TestCase):
    def test_parses_name_meta_service_and_company_without_payload_logging(self):
        data = bytes(
            [
                8,
                0x09,
                *b"Ray-Ban",
                3,
                0x03,
                0x5F,
                0xFD,
                4,
                0xFF,
                0x8E,
                0x05,
                0xAA,
            ]
        )
        fields = ble_probe.parse_ad_structures(data)
        self.assertEqual(fields.name, "Ray-Ban")
        self.assertEqual(fields.services16, {0xFD5F})
        self.assertEqual(fields.company_ids, {0x058E})
        reasons = ble_probe.candidate_reasons(fields)
        self.assertIn("current firmware Ray-Ban name match", reasons)
        self.assertIn(
            "research company id 0x058E (Meta Platforms Technologies, LLC)",
            reasons,
        )
        self.assertIn("Meta-assigned service UUID 0xFD5F", reasons)

    def test_parses_luxottica_company_id_from_little_endian_wire_bytes(self):
        fields = ble_probe.parse_ad_structures(bytes([3, 0xFF, 0x53, 0x0D]))
        self.assertEqual(fields.company_ids, {0x0D53})
        self.assertIn(
            "research company id 0x0D53 (Luxottica Group S.p.A)",
            ble_probe.candidate_reasons(fields),
        )

    def test_truncated_ad_structure_fails_closed(self):
        fields = ble_probe.parse_ad_structures(bytes([10, 0x09, *b"Ray"]))
        self.assertIsNone(fields.name)
        self.assertEqual(fields.ad_types, set())

    def test_legacy_scan_response_is_distinguished(self):
        ad = bytes([8, 0x09, *b"Ray-Ban"])
        address = bytes.fromhex("010203040506")
        report = bytes([1, 4, 1]) + address + bytes([len(ad)]) + ad + struct.pack("b", -42)
        parsed = ble_probe.parse_legacy_reports(report)
        self.assertEqual(parsed, [(True, 1, address, -42, ad)])

    def test_extended_scan_response_is_distinguished(self):
        ad = bytes([3, 0x03, 0x5F, 0xFD])
        address = bytes.fromhex("010203040506")
        fixed = (
            (0x0008).to_bytes(2, "little")
            + bytes([1])
            + address
            + bytes([1, 0, 0, 0x7F])
            + struct.pack("b", -51)
            + bytes([0, 0, 0, *bytes(6), len(ad)])
        )
        parsed = ble_probe.parse_extended_reports(bytes([1]) + fixed + ad)
        self.assertEqual(parsed, [(True, 1, address, -51, ad)])

    def test_run_local_labels_do_not_expose_addresses(self):
        labels = ble_probe.AnonymousLabels()
        address = bytes.fromhex("010203040506")
        self.assertEqual(labels.get(1, address), "D01")
        self.assertEqual(labels.get(1, address), "D01")
        labels.clear()
        self.assertEqual(labels.get(1, address), "D01")

    def test_address_like_bluez_names_are_suppressed(self):
        self.assertIsNone(ble_probe.safe_advertised_name("7C-87-E0-80-B8-4D"))
        self.assertIsNone(ble_probe.safe_advertised_name("7c:87:e0:80:b8:4d"))
        self.assertEqual(ble_probe.safe_advertised_name("Ray-Ban Meta"), "Ray-Ban Meta")

    def test_stop_flag_requires_both_opt_in_and_a_candidate(self):
        candidate = ble_probe.Fields(company_ids={0x0D53})
        unrelated = ble_probe.Fields(company_ids={0x004C})
        self.assertTrue(ble_probe.should_stop_on_candidate(candidate, True))
        self.assertFalse(ble_probe.should_stop_on_candidate(candidate, False))
        self.assertFalse(ble_probe.should_stop_on_candidate(unrelated, True))

    def test_raw_hci_socket_prefers_direct_device_id_binding(self):
        hci = mock.Mock()
        with mock.patch.object(ble_probe.socket, "socket", return_value=hci):
            self.assertIs(ble_probe.open_hci_socket(3), hci)
        hci.bind.assert_called_once_with(3)
        hci.setsockopt.assert_called_once_with(
            ble_probe.socket.SOL_HCI,
            ble_probe.socket.HCI_FILTER,
            ble_probe.hci_event_filter(),
        )
        hci.setblocking.assert_called_once_with(False)

    def test_linux_hci_filter_includes_trailing_struct_padding(self):
        event_filter = ble_probe.hci_event_filter()
        self.assertEqual(len(event_filter), 16)
        self.assertEqual(
            struct.unpack("@IIIH2x", event_filter),
            (1 << ble_probe.HCI_EVENT_PKT, 0xFFFFFFFF, 0xFFFFFFFF, 0),
        )

    def test_raw_hci_bind_error_names_the_failed_stage(self):
        hci = mock.Mock()
        hci.bind.side_effect = OSError(22, "Invalid argument")
        with mock.patch.object(ble_probe.socket, "socket", return_value=hci):
            with self.assertRaisesRegex(OSError, "bind hci3 raw channel"):
                ble_probe.open_hci_socket(3)
        hci.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
