# Rust application and SDK emulation — 2026-09-04

The owner requested a minimal Rust rewrite, reliability emulation, a new release,
and a push to main. Version `0.3.0-beta.1` replaces the FrogAlert-owned C policy,
scan state, configuration, rendering, boot cards, and transfer validation with
an allocation-free Rust application. The established WCH/FOSSASIA hardware
shell and exact-board recovery boundary remain.

The application returns commands after completing each mutable state borrow.
The C adapter replaces its timer/display state before invoking reentrant SDK
calls. One wrapping deadline model removes competing page/wake timers. Scan
cancellation waits for confirmed idle, and shutdown additionally waits for
advertising and an app connection to stop. Completed counts remain stable;
typed-address storage is wiped even if the controller never answers. Parsing
validates the entire AD packet before matching, so malformed trailing data
cannot bypass validation.

The emulator exercises both profiles and views with the real core, lost/failed
SDK operations, mode races, late events, clock wrap, malformed input, and a
24-hour-per-configuration soak (17,280 scans). C tests link the actual Rust
archive for both profile ABIs, original config/render golden vectors, and the
production upload receiver with guarded allocations and failed flash writes.
The full local verification suite and all four embedded build audits passed.

Rust 1.98.1's object attributes are too new for MRS V1.92. LLVM objcopy can
remove the non-loadable `.riscv.attributes` section without changing executable
code; WCH objcopy fails on an unsupported relocation in unused Rust builtins.
The original linked instruction/vector/RAM checks and exact ELF/BIN equality
remain the final gates. Compiler commit and library hash join the candidate
receipt. A patchable configuration requires volatile reads, an inlined default
constructor, and immediate-word magic comparisons to keep exactly one marker
in the binary under LTO.

No badge was physically tested in this work. The new release stays
hardware-unverified. Historical standalone Rust vector failures remain
quarantined and still must not emit BINs.
