# 2026-07-23 KARR detection rule

## Rule

The user reports that KARR backdoor devices advertise Bluetooth local names
beginning with `QT ` followed by a serial number. FrogAlert implements this as
a case-insensitive start-of-name match with at least one non-whitespace,
non-NUL suffix byte. `QT 123456` and `qt SN-42` match; `QT ` and
`My QT 123456` do not.

The alert is `KARR DETECTED`. Like every name rule, this is a spoofable hint,
not authenticated device identity. Passive discovery can also miss a name
carried only in a scan response.

## Implementation boundary

The allocation-free Rust policy core and the temporary bounded C classifier in
the private FOSSASIA-shell survey candidate implement the same rule. The C
shell renders the new alert for three seconds and then restores the selected
nametag or Bluetooth-counter view. The Rust ABI canary and physical survey
smoke remain separate gates.

## Artifact status

The rebuilt survey BIN stays under ignored `tmp/`:

- size: 201,788 bytes;
- SHA-256:
  `9d35de6a3bf7cdf90b2a4fe05fa25d0a85a3f9b18da42228b5e25908a92c51a7`;
- text/data/BSS: 193,296/8,492/4,588 bytes;
- measured static-RAM-to-stack headroom: 9,788 bytes.

The previous 201,628-byte `8dff996d…19ebf7` animation-alignment candidate
remains historical build evidence and is superseded by this rule-bearing
candidate. A successful compile, vector audit, and locked hash establish build
evidence only; they do not make the image flash-approved, published, or
hardware-verified.
