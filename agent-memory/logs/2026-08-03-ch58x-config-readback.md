# CH582 canonical configuration readback

Date: 2026-08-03

## Physical report

On Android Chrome, the owner successfully completed the immediate read-only
`wchisp info` equivalent against a bottom-button BadgeMagic badge with CH582
bootloader 02.40. The later Bottom action sent the first destructive `0xA8`
configuration reset, but the browser stopped at the follow-up `0xA7` with
“configuration reset did not match readback.” The session stopped before
`0xA4`, so it changed configuration but did not erase or program application
flash.

The failure came from comparing the post-write register bytes byte-for-byte
with the request. FrogAlert sent:

```text
ff ff ff ff ff ff ff ff 4f ff 0f d5
```

[FOSSASIA BadgeMagic issue #110](https://github.com/fossasia/badgemagic-firmware/issues/110)
records the same CH582/BTVER 02.40 family accepting that reset and returning:

```text
ff ff ff ff ff ff ff ff 4f 3f 0f 45
```

That physical transcript then completed erase, program, and verify. The two
cleared groups are reserved/signature normalization, not evidence that the
reset failed.

## Upstream comparison

Pinned `ch32-rs/wchisp` commit
[`cefd8707df345f1fbd7795e15367281f440bbf05`](https://github.com/ch32-rs/wchisp/commit/cefd8707df345f1fbd7795e15367281f440bbf05)
implements `reset_config` by reading the current `0x07` group, applying the
CH58x reset values, sending `0xA8`, and reading `0x07` again. It requires
successful command responses but does not compare the returned register bytes:

- [`src/flashing.rs`](https://github.com/ch32-rs/wchisp/blob/cefd8707df345f1fbd7795e15367281f440bbf05/src/flashing.rs)
- [`devices/0x16-CH58x.yaml`](https://github.com/ch32-rs/wchisp/blob/cefd8707df345f1fbd7795e15367281f440bbf05/devices/0x16-CH58x.yaml)

## Decision

FrogAlert remains narrower than upstream. After validating the `0xA8` and
`0xA7` response envelopes and success statuses, the pre-erase gate accepts
only:

1. the exact requested 12 bytes; or
2. the documented CH582/BTVER 02.40 canonical 12 bytes above.

Every other readback stops before `0xA4` erase. Tests must cover both accepted
values and at least one unrecognized value that proves erase is not sent.
