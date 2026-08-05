# Factory-confirmed physical button roles

The owner tested factory firmware on both exact USB-C boards on 2026-08-05.
Both `B1144C_260404_USB_C` and `B1144C_250901_USB_C` use the same physical
roles: the bottom button controls brightness, while the top button enters
Bluetooth listening and then turns the screen off. This supersedes the beta.10
assumption that `250901` physical-top KEY1 should own brightness.

`0.2.0-beta.11` keeps compile-time physical mapping. On `260404`, physical
bottom KEY1 retains the upstream 25-sample long action. On `250901`, physical
bottom KEY2 has two uses: a short press changes the name/count view; release
after 25 through 99 samples queues brightness; a continued hold remains free
for the unchanged 200 ms, more-than-ten-sample KEY2-to-ISP task. Physical-top
KEY1 has no brightness handler. The deliberate upper bound leaves margin
before the roughly 2.2-second ISP threshold.

The linked disassembly audit now requires `btn_brightness_key()` to return KEY1
for `260404` and KEY2 for `250901`. It also requires the bottom build's
optimized 25-through-99-sample release window and rejects the discarded
125-sample KEY1 threshold.

Pre-CI local candidate receipts:

- counter top/`260404`: 200,344 bytes,
  `34f80b9b28fd81cd43298a1ee03bb23e4a410e4b19cc88e20fdca248db7bd68a`
- counter bottom/`250901`: 200,376 bytes,
  `97923b1f120dfd41b92ed483df6dbfe528b520593e41d076a78f603c992d9e33`
- frogs top/`260404`: 200,416 bytes,
  `ca33c4a9deee7c11fd8c75034387b3b11d7c86025d3f54c1b274fd6c7c4b1bc7`
- frogs bottom/`250901`: 200,448 bytes,
  `48a48978d48796e45d808aa8d17eaebeb96059d01ee8a4c6e4cb3e93f3877d4c`

All four builds passed their source/toolchain/vector/symbol/button/ELF/BIN/RAM
candidate audits. They remain hardware-unverified. Before this correction,
beta.10 publication workflow `31054218095` was cancelled during artifact
materialization; the publish and Pages jobs never started, no beta.10 GitHub
Release exists, and remote `main` did not advance.
