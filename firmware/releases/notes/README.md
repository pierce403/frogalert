# Firmware release notes

Use one Markdown file per firmware tag, for example `v0.2.0-beta.2.md`, and
reference it from every exact-board descriptor grouped under that tag. The
automatic standard-release recorder creates safe default notes when that file
does not already exist; a source commit may provide more specific reviewed
notes in advance.

Describe user-visible changes, known limitations, and hardware support. Do not
copy raw device identifiers or private bench data into this public file. The
release planner appends the exact BIN/ELF identities, CI-audited or
hardware-tested status, irreversible OEM-replacement warning, browser flasher
link, and `wchisp` fallback automatically; hardware-evidence links appear only
when they exist.

Treat notes as immutable after the GitHub Release is published. A later commit
that changes the body or any uploaded asset causes publication reconciliation
to fail rather than silently editing the existing release.
