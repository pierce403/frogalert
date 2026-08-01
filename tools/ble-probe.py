#!/usr/bin/env python3
"""Compare Linux BLE discovery methods without retaining device identifiers.

BlueZ mode is the convenient, non-root path and normally performs active LE
discovery. Raw mode requires root/CAP_NET_RAW and lets us compare passive and
active controller scans, including whether useful fields arrive in a scan
response. Results exist only in memory and Bluetooth addresses are replaced by
run-local labels before anything is printed.
"""

from __future__ import annotations

import argparse
import select
import socket
import struct
import sys
import time
from dataclasses import dataclass, field
from typing import Iterable

META_COMPANY_IDS = {
    0x01AB: "Meta Platforms, Inc.",
    0x058E: "Meta Platforms Technologies, LLC",
}
META_SERVICE_UUIDS = {
    0xFD5F: "Meta Platforms Technologies, LLC",
    0xFEB7: "Meta Platforms, Inc.",
    0xFEB8: "Meta Platforms, Inc.",
}
NAME_FIRMWARE_HINTS = ("ray-ban", "ray ban")
NAME_RESEARCH_HINTS = ("meta", "view")

HCI_COMMAND_PKT = 0x01
HCI_EVENT_PKT = 0x04
EVT_CMD_COMPLETE = 0x0E
EVT_CMD_STATUS = 0x0F
EVT_LE_META = 0x3E
EVT_LE_ADVERTISING_REPORT = 0x02
EVT_LE_EXTENDED_ADVERTISING_REPORT = 0x0D

OP_LE_SET_SCAN_PARAMETERS = 0x200B
OP_LE_SET_SCAN_ENABLE = 0x200C
OP_LE_SET_EXTENDED_SCAN_PARAMETERS = 0x2041
OP_LE_SET_EXTENDED_SCAN_ENABLE = 0x2042

AD_SHORT_NAME = 0x08
AD_COMPLETE_NAME = 0x09
AD_UUID16_SOME = 0x02
AD_UUID16_ALL = 0x03
AD_SERVICE_DATA16 = 0x16
AD_MANUFACTURER = 0xFF


@dataclass
class Fields:
    name: str | None = None
    services16: set[int] = field(default_factory=set)
    company_ids: set[int] = field(default_factory=set)
    ad_types: set[int] = field(default_factory=set)

    def merge(self, other: "Fields") -> None:
        if other.name:
            self.name = other.name
        self.services16.update(other.services16)
        self.company_ids.update(other.company_ids)
        self.ad_types.update(other.ad_types)


@dataclass
class Observation:
    address: bytes
    address_type: int
    rssi: int
    advertisement: Fields = field(default_factory=Fields)
    scan_response: Fields = field(default_factory=Fields)
    saw_scan_response: bool = False

    def merged(self) -> Fields:
        result = Fields()
        result.merge(self.advertisement)
        result.merge(self.scan_response)
        return result


class AnonymousLabels:
    def __init__(self) -> None:
        self._labels: dict[tuple[int, bytes], str] = {}

    def get(self, address_type: int, address: bytes) -> str:
        key = (address_type, address)
        if key not in self._labels:
            self._labels[key] = f"D{len(self._labels) + 1:02d}"
        return self._labels[key]

    def clear(self) -> None:
        self._labels.clear()


def parse_ad_structures(data: bytes) -> Fields:
    result = Fields()
    offset = 0
    while offset < len(data):
        length = data[offset]
        offset += 1
        if length == 0:
            break
        end = offset + length
        if end > len(data):
            break
        ad_type = data[offset]
        value = data[offset + 1 : end]
        result.ad_types.add(ad_type)
        if ad_type in (AD_SHORT_NAME, AD_COMPLETE_NAME):
            decoded = value.rstrip(b"\0").decode("utf-8", errors="replace")
            if decoded:
                result.name = decoded
        elif ad_type in (AD_UUID16_SOME, AD_UUID16_ALL):
            result.services16.update(
                int.from_bytes(value[index : index + 2], "little")
                for index in range(0, len(value) - 1, 2)
            )
        elif ad_type == AD_SERVICE_DATA16 and len(value) >= 2:
            result.services16.add(int.from_bytes(value[:2], "little"))
        elif ad_type == AD_MANUFACTURER and len(value) >= 2:
            result.company_ids.add(int.from_bytes(value[:2], "little"))
        offset = end
    return result


def candidate_reasons(fields: Fields) -> list[str]:
    reasons: list[str] = []
    lowered = (fields.name or "").casefold()
    if any(hint in lowered for hint in NAME_FIRMWARE_HINTS):
        reasons.append("current firmware Ray-Ban name match")
    elif any(hint in lowered for hint in NAME_RESEARCH_HINTS):
        reasons.append("research-only Meta/View name hint")
    for company_id in sorted(fields.company_ids & META_COMPANY_IDS.keys()):
        reasons.append(
            f"Meta-assigned manufacturer id 0x{company_id:04X}"
        )
    for service in sorted(fields.services16 & META_SERVICE_UUIDS.keys()):
        reasons.append(f"Meta-assigned service UUID 0x{service:04X}")
    return reasons


def format_fields(fields: Fields) -> str:
    name = repr(fields.name) if fields.name else "-"
    services = ",".join(f"{value:04X}" for value in sorted(fields.services16)) or "-"
    companies = ",".join(f"{value:04X}" for value in sorted(fields.company_ids)) or "-"
    types = ",".join(f"{value:02X}" for value in sorted(fields.ad_types)) or "-"
    return f"name={name} services16={services} companies={companies} ad_types={types}"


def print_observation(
    observation: Observation,
    labels: AnonymousLabels,
    *,
    method: str,
    candidates_only: bool,
) -> None:
    merged = observation.merged()
    reasons = candidate_reasons(merged)
    if candidates_only and not reasons:
        return
    label = labels.get(observation.address_type, observation.address)
    source = "scan-response" if observation.saw_scan_response else "advertisement"
    print(
        f"{method:<12} {label} rssi={observation.rssi:>4} "
        f"last={source:<13} {format_fields(merged)}"
    )
    for reason in reasons:
        print(f"{'':16} -> {reason}")


def hci_event_filter() -> bytes:
    # Linux struct hci_filter: type_mask, event_mask[2], opcode.
    return struct.pack("<IIIH", 1 << HCI_EVENT_PKT, 0xFFFFFFFF, 0xFFFFFFFF, 0)


def open_hci_socket(index: int) -> socket.socket:
    hci = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_RAW, socket.BTPROTO_HCI)
    try:
        hci.bind((index,))
    except TypeError:
        hci.bind((index, 0))
    hci.setsockopt(0, socket.HCI_FILTER, hci_event_filter())
    hci.setblocking(False)
    return hci


def send_hci_command(hci: socket.socket, opcode: int, parameters: bytes) -> int:
    packet = bytes((HCI_COMMAND_PKT,)) + struct.pack("<HB", opcode, len(parameters)) + parameters
    hci.send(packet)
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        readable, _, _ = select.select([hci], [], [], max(0.0, deadline - time.monotonic()))
        if not readable:
            continue
        packet = hci.recv(4096)
        if len(packet) < 3 or packet[0] != HCI_EVENT_PKT:
            continue
        event = packet[1]
        payload = packet[3:]
        if event == EVT_CMD_COMPLETE and len(payload) >= 4:
            returned_opcode = int.from_bytes(payload[1:3], "little")
            if returned_opcode == opcode:
                return payload[3]
        if event == EVT_CMD_STATUS and len(payload) >= 4:
            returned_opcode = int.from_bytes(payload[2:4], "little")
            if returned_opcode == opcode:
                return payload[0]
    raise TimeoutError(f"controller did not answer HCI command 0x{opcode:04X}")


def require_hci_success(hci: socket.socket, opcode: int, parameters: bytes) -> None:
    status = send_hci_command(hci, opcode, parameters)
    if status:
        raise RuntimeError(f"HCI command 0x{opcode:04X} failed with status 0x{status:02X}")


def configure_scan(hci: socket.socket, active: bool, extended: bool) -> tuple[int, bytes]:
    scan_type = 1 if active else 0
    interval = 0x0060  # 60 ms
    window = 0x0030  # 30 ms, intentionally leaves room for other radio work
    if extended:
        parameters = struct.pack("<BBBBHH", 0, 0, 0x01, scan_type, interval, window)
        require_hci_success(hci, OP_LE_SET_EXTENDED_SCAN_PARAMETERS, parameters)
        return OP_LE_SET_EXTENDED_SCAN_ENABLE, struct.pack("<BBHH", 1, 0, 0, 0)
    parameters = struct.pack("<BHHBB", scan_type, interval, window, 0, 0)
    require_hci_success(hci, OP_LE_SET_SCAN_PARAMETERS, parameters)
    return OP_LE_SET_SCAN_ENABLE, struct.pack("<BB", 1, 0)


def disable_scan(hci: socket.socket, extended: bool) -> None:
    opcode = OP_LE_SET_EXTENDED_SCAN_ENABLE if extended else OP_LE_SET_SCAN_ENABLE
    parameters = struct.pack("<BBHH", 0, 0, 0, 0) if extended else struct.pack("<BB", 0, 0)
    status = send_hci_command(hci, opcode, parameters)
    if status not in (0x00, 0x0C):  # Command Disallowed also means no active scan.
        raise RuntimeError(f"could not disable scan: HCI status 0x{status:02X}")


def parse_legacy_reports(payload: bytes) -> list[tuple[bool, int, bytes, int, bytes]]:
    if not payload:
        return []
    reports: list[tuple[bool, int, bytes, int, bytes]] = []
    offset = 1
    for _ in range(payload[0]):
        if offset + 10 > len(payload):
            break
        event_type = payload[offset]
        address_type = payload[offset + 1]
        address = bytes(payload[offset + 2 : offset + 8])
        data_length = payload[offset + 8]
        data_start = offset + 9
        data_end = data_start + data_length
        if data_end >= len(payload):
            break
        rssi = struct.unpack("b", payload[data_end : data_end + 1])[0]
        reports.append((event_type == 0x04, address_type, address, rssi, bytes(payload[data_start:data_end])))
        offset = data_end + 1
    return reports


def parse_extended_reports(payload: bytes) -> list[tuple[bool, int, bytes, int, bytes]]:
    if not payload:
        return []
    reports: list[tuple[bool, int, bytes, int, bytes]] = []
    offset = 1
    for _ in range(payload[0]):
        if offset + 24 > len(payload):
            break
        event_type = int.from_bytes(payload[offset : offset + 2], "little")
        address_type = payload[offset + 2]
        address = bytes(payload[offset + 3 : offset + 9])
        rssi = struct.unpack("b", payload[offset + 13 : offset + 14])[0]
        data_length = payload[offset + 23]
        data_start = offset + 24
        data_end = data_start + data_length
        if data_end > len(payload):
            break
        reports.append((bool(event_type & 0x0008), address_type, address, rssi, bytes(payload[data_start:data_end])))
        offset = data_end
    return reports


def reports_from_hci_packet(packet: bytes) -> list[tuple[bool, int, bytes, int, bytes]]:
    if len(packet) < 5 or packet[0] != HCI_EVENT_PKT or packet[1] != EVT_LE_META:
        return []
    payload = packet[3:]
    if not payload:
        return []
    if payload[0] == EVT_LE_ADVERTISING_REPORT:
        return parse_legacy_reports(payload[1:])
    if payload[0] == EVT_LE_EXTENDED_ADVERTISING_REPORT:
        return parse_extended_reports(payload[1:])
    return []


def raw_scan(
    index: int,
    seconds: float,
    active: bool,
    labels: AnonymousLabels,
    candidates_only: bool,
) -> dict[tuple[int, bytes], Observation]:
    observations: dict[tuple[int, bytes], Observation] = {}
    signatures: dict[tuple[int, bytes], tuple[object, ...]] = {}
    hci = open_hci_socket(index)
    extended = True
    try:
        try:
            disable_scan(hci, extended=True)
            opcode, enable = configure_scan(hci, active, extended=True)
        except RuntimeError as error:
            print(f"raw setup: extended scan unavailable ({error}); using legacy HCI scan", file=sys.stderr)
            extended = False
            disable_scan(hci, extended=False)
            opcode, enable = configure_scan(hci, active, extended=False)
        require_hci_success(hci, opcode, enable)
        deadline = time.monotonic() + seconds
        method = "raw-active" if active else "raw-passive"
        while time.monotonic() < deadline:
            readable, _, _ = select.select([hci], [], [], min(0.5, deadline - time.monotonic()))
            if not readable:
                continue
            for scan_response, address_type, address, rssi, data in reports_from_hci_packet(hci.recv(4096)):
                key = (address_type, address)
                observation = observations.setdefault(
                    key, Observation(address=address, address_type=address_type, rssi=rssi)
                )
                observation.rssi = rssi
                fields = parse_ad_structures(data)
                if scan_response:
                    observation.scan_response.merge(fields)
                    observation.saw_scan_response = True
                else:
                    observation.advertisement.merge(fields)
                merged = observation.merged()
                signature = (
                    merged.name,
                    tuple(sorted(merged.services16)),
                    tuple(sorted(merged.company_ids)),
                    tuple(sorted(merged.ad_types)),
                    observation.saw_scan_response,
                )
                if signatures.get(key) != signature:
                    signatures[key] = signature
                    print_observation(
                        observation,
                        labels,
                        method=method,
                        candidates_only=candidates_only,
                    )
    finally:
        try:
            disable_scan(hci, extended=extended)
        except Exception as error:  # Best-effort cleanup without masking the scan result.
            print(f"warning: {error}", file=sys.stderr)
        hci.close()
    return observations


def bluez_scan(adapter_name: str, seconds: float, labels: AnonymousLabels, candidates_only: bool) -> None:
    try:
        import dbus
        from dbus.mainloop.glib import DBusGMainLoop
        from gi.repository import GLib
    except ImportError as error:
        raise RuntimeError("BlueZ mode needs the system dbus-python and PyGObject packages") from error

    DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    manager = dbus.Interface(bus.get_object("org.bluez", "/"), "org.freedesktop.DBus.ObjectManager")
    objects = manager.GetManagedObjects()
    adapter_path = next(
        (
            str(path)
            for path, interfaces in objects.items()
            if "org.bluez.Adapter1" in interfaces and str(path).endswith(f"/{adapter_name}")
        ),
        None,
    )
    if not adapter_path:
        raise RuntimeError(f"BlueZ adapter {adapter_name!r} was not found")
    adapter = dbus.Interface(bus.get_object("org.bluez", adapter_path), "org.bluez.Adapter1")
    baseline = set(objects)
    initial_devices = {
        str(path): dict(interfaces["org.bluez.Device1"])
        for path, interfaces in objects.items()
        if "org.bluez.Device1" in interfaces
    }
    observations: dict[str, Observation] = {}
    signatures: dict[str, tuple[object, ...]] = {}

    def consume(path: str, properties: dict[object, object]) -> None:
        if not str(path).startswith(adapter_path + "/dev_"):
            return
        address_text = str(properties.get("Address", ""))
        if not address_text:
            return
        address = bytes.fromhex(address_text.replace(":", ""))[::-1]
        address_type = 1 if str(properties.get("AddressType", "public")) == "random" else 0
        observation = observations.setdefault(
            str(path), Observation(address=address, address_type=address_type, rssi=int(properties.get("RSSI", -127)))
        )
        observation.rssi = int(properties.get("RSSI", observation.rssi))
        fields = Fields()
        name = properties.get("Name") or properties.get("Alias")
        if name:
            fields.name = str(name)
        for uuid in properties.get("UUIDs", []):
            text = str(uuid).lower()
            if text.startswith("0000") and text.endswith("-0000-1000-8000-00805f9b34fb"):
                fields.services16.add(int(text[4:8], 16))
        fields.company_ids.update(int(value) for value in properties.get("ManufacturerData", {}).keys())
        for uuid in properties.get("ServiceData", {}).keys():
            text = str(uuid).lower()
            if text.startswith("0000") and text.endswith("-0000-1000-8000-00805f9b34fb"):
                fields.services16.add(int(text[4:8], 16))
        observation.advertisement.merge(fields)
        merged = observation.merged()
        signature = (
            merged.name,
            tuple(sorted(merged.services16)),
            tuple(sorted(merged.company_ids)),
        )
        if signatures.get(str(path)) != signature:
            signatures[str(path)] = signature
            print_observation(
                observation,
                labels,
                method="bluez-merged",
                candidates_only=candidates_only,
            )

    def interfaces_added(path: object, interfaces: dict[object, object]) -> None:
        properties = interfaces.get("org.bluez.Device1")
        if properties:
            consume(str(path), properties)

    def properties_changed(
        interface: str,
        changed: dict[object, object],
        _invalidated: Iterable[str],
        *,
        path: str,
    ) -> None:
        if interface != "org.bluez.Device1":
            return
        current = {**initial_devices.get(path, {}), **dict(changed)}
        consume(path, current)

    bus.add_signal_receiver(
        interfaces_added,
        dbus_interface="org.freedesktop.DBus.ObjectManager",
        signal_name="InterfacesAdded",
    )
    bus.add_signal_receiver(
        properties_changed,
        dbus_interface="org.freedesktop.DBus.Properties",
        signal_name="PropertiesChanged",
        path_keyword="path",
    )
    adapter.SetDiscoveryFilter(
        {
            "Transport": dbus.String("le"),
            "DuplicateData": dbus.Boolean(True),
        }
    )
    loop = GLib.MainLoop()
    GLib.timeout_add(int(seconds * 1000), lambda: (loop.quit(), False)[1])
    started_discovery = False
    try:
        try:
            adapter.StartDiscovery()
            started_discovery = True
        except dbus.DBusException as error:
            if error.get_dbus_name() != "org.bluez.Error.InProgress":
                raise RuntimeError(f"BlueZ could not start discovery: {error}") from error
            print("BlueZ discovery was already running; observing the shared scan")
        # Existing Device1 objects can receive fresh PropertiesChanged signals;
        # do not print the cache merely because it existed before this run.
        print(f"BlueZ active discovery on {adapter_name} for {seconds:g}s ({len(baseline)} cached objects ignored)")
        loop.run()
        candidate_count = sum(
            bool(candidate_reasons(observation.merged()))
            for observation in observations.values()
        )
        print(
            f"BlueZ summary: {len(observations)} fresh devices, "
            f"{candidate_count} with Ray-Ban/Meta indicators"
        )
        if not observations:
            print(
                "No fresh reports arrived. Stop another active scan or keep the "
                "glasses awake and retry."
            )
    finally:
        if started_discovery:
            try:
                adapter.StopDiscovery()
            except dbus.DBusException:
                pass
        observations.clear()


def summarize_comparison(
    passive: dict[tuple[int, bytes], Observation],
    active: dict[tuple[int, bytes], Observation],
    labels: AnonymousLabels,
) -> None:
    print("\nComparison:")
    keys = set(passive) | set(active)
    candidates = 0
    for key in sorted(keys, key=lambda item: labels.get(*item)):
        passive_fields = passive[key].merged() if key in passive else Fields()
        active_fields = active[key].merged() if key in active else Fields()
        reasons = candidate_reasons(active_fields) or candidate_reasons(passive_fields)
        gained_name = not passive_fields.name and bool(active_fields.name)
        gained_meta = not candidate_reasons(passive_fields) and bool(candidate_reasons(active_fields))
        if reasons or gained_name:
            candidates += 1
            label = labels.get(*key)
            print(f"  {label}: passive_name={passive_fields.name!r} active_name={active_fields.name!r}")
            if gained_name or gained_meta or (key in active and active[key].saw_scan_response):
                print("      active scan obtained additional scan-response evidence")
            for reason in reasons:
                print(f"      -> {reason}")
    if not candidates:
        print("  No named or Meta-hinted device could be correlated across the two windows.")
        print("  Keep the glasses awake/in pairing mode and repeat with longer windows.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Probe BLE advertisement versus scan-response detection for FrogAlert."
    )
    parser.add_argument("mode", choices=("bluez", "passive", "active", "compare"))
    parser.add_argument("--adapter", default="hci0", help="BlueZ adapter name (default: hci0)")
    parser.add_argument("--seconds", type=float, default=15.0, help="seconds per scan window")
    parser.add_argument(
        "--candidates-only",
        action="store_true",
        help="hide devices without a Ray-Ban/Meta indicator",
    )
    args = parser.parse_args()
    if args.seconds <= 0 or args.seconds > 300:
        parser.error("--seconds must be greater than 0 and at most 300")
    if not args.adapter.startswith("hci") or not args.adapter[3:].isdigit():
        parser.error("--adapter must look like hci0")
    return args


def main() -> int:
    args = parse_args()
    labels = AnonymousLabels()
    try:
        if args.mode == "bluez":
            bluez_scan(args.adapter, args.seconds, labels, args.candidates_only)
            return 0
        index = int(args.adapter[3:])
        if args.mode == "passive":
            raw_scan(index, args.seconds, False, labels, args.candidates_only).clear()
        elif args.mode == "active":
            raw_scan(index, args.seconds, True, labels, args.candidates_only).clear()
        else:
            print(f"Raw passive scan on {args.adapter} for {args.seconds:g}s")
            passive = raw_scan(index, args.seconds, False, labels, args.candidates_only)
            time.sleep(1.0)
            print(f"\nRaw active scan on {args.adapter} for {args.seconds:g}s")
            active = raw_scan(index, args.seconds, True, labels, args.candidates_only)
            summarize_comparison(passive, active, labels)
            passive.clear()
            active.clear()
        return 0
    except PermissionError as error:
        if args.mode == "bluez":
            print(f"error: BlueZ access was denied: {error}", file=sys.stderr)
            return 1
        print(
            "raw HCI scanning needs root (or CAP_NET_RAW/CAP_NET_ADMIN); "
            f"run: sudo {sys.executable} {sys.argv[0]} {' '.join(sys.argv[1:])}",
            file=sys.stderr,
        )
        return 2
    except (OSError, RuntimeError, TimeoutError) as error:
        print(f"error: {error}", file=sys.stderr)
        if args.mode != "bluez":
            print(
                "If the controller reports Command Disallowed, stop other scans "
                "(`bluetoothctl scan off`) and retry. Do not stop bluetoothd unless necessary.",
                file=sys.stderr,
            )
        return 1
    finally:
        labels.clear()


if __name__ == "__main__":
    raise SystemExit(main())
