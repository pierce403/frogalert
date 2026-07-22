# Recoverable USB-C lab image publication

Source commit `f794974584b67f8809f5ab8cb2c52269aab7509b` added the shared
KEY2 recovery state machine/trampoline, exact USB-C display profile, WCH startup
sentinel finalizer, hosted-lab manifest path, and fail-closed browser policy.

The first hosted FrogAlert image is:

- manifest id: `frogalert-pixel-walk-b1144c-250901-usbc-f794974`
- version: `0.1.0-dev.f794974`
- profile: `B1144C_250901_USB_C`
- required physical marking: `B1144C_250901`
- size: 5,632 bytes
- SHA-256: `02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22`
- hardware verification: false

Build evidence passed host recovery tests, both display-profile links, the
Rev1 count link, ELF32 RISC-V IMC and AMO/LR/SC audits, the `jr zero` recovery
symbol audit, raw startup sentinel verification, browser tests, static HTML
validation, and assembled-site manifest/hash validation.

This is not a release and direct manifest-managed programming stays locked.
The site supports inspect/download, followed by deliberate reselection through
the separate local developer BIN route for the first physical test. Promotion
requires a full 484-pixel walk, short-press safety, roughly 2.2-second KEY2 ISP
entry as `4348:55e0`, reflash/verify, and cold power-cycle repetition.

Rev1 outputs were not hosted because no exact physical Rev1 marking was
available to bind. A USB-C BLE-count image was not built or hosted because the
vendored HAL still assumes external LSE while this board requires calibrated
internal LSI.

## Live publication evidence

- GitHub [CI run 29950784822](https://github.com/pierce403/frogalert/actions/runs/29950784822)
  passed for site head `ca4e6ce`.
- GitHub [Pages run 29950854766](https://github.com/pierce403/frogalert/actions/runs/29950854766)
  then deployed that head successfully.
- `https://frogalert.org/flash/` exposed the one USB-C lab descriptor. Entering
  `B1144C_250901` and `B1144C_250901_USB_C` loaded the exact file, size,
  SHA-256, and source provenance, exposed the same-origin download, and kept
  the destructive program control disabled.
- A fresh download from the public artifact URL was 5,632 bytes, byte-for-byte
  identical to the repository artifact, and hashed to
  `02b4497a9179ef2ce9dc88b9ef4c06b8adf7049391568cea78e019a2361cfb22`.
