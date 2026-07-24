# Firmware release notes

Add one reviewed Markdown file per firmware tag, for example
`v0.1.0-alpha.1.md`, and reference it from every exact-board descriptor grouped
under that tag.

Describe user-visible changes, known limitations, and hardware support. Do not
copy raw device identifiers or private bench data into this public file. The
release planner appends the exact BIN/ELF identities, physical-evidence links,
irreversible OEM-replacement warning, browser flasher link, and `wchisp`
fallback automatically.

Treat notes as immutable after the GitHub Release is published. A later commit
that changes the body or any uploaded asset causes publication reconciliation
to fail rather than silently editing the existing release.
