# Upstream button roles replace profile-position compatibility

Date: 2026-08-05

The user requested behavior as close as possible to pinned FOSSASIA firmware,
with FrogAlert count/detection added only to the non-pairing display button.
Physical testing of exact `0.2.0-beta.5` on the bottom badge had produced
inconsistent download, power-off, brightness, and counter results. The prior
profile-dependent callback wrappers were therefore removed rather than adapted
again for cross-profile flashing.

Both exact profiles now retain the upstream logical roles:

- KEY1 short: system/download/power mode;
- KEY1 long: brightness;
- KEY2 short: bitmap selection extended with the FrogAlert count view and
  bounded BadgeMagic app-attention window;
- KEY2 long: existing dot-to-ROM-ISP recovery task.

The exact artifacts still differ where the hardware actually differs: KEY1
pressed polarity, pull configuration, and shutdown wake edge. Firmware does
not reinterpret button roles by physical position and does not attempt to make
a cross-profile image behave like its target profile.

Local calculated candidate receipts:

- counter top/`260404`: 200,420 bytes,
  `4388b70f1d8752aa5821c28264c7a7c8e4f988ceee3a68b739481914548db2be`;
- counter bottom/`250901`: 200,420 bytes,
  `dafaba93d1e9cd4ce94ab93a9dc71b60db3b2b365b60f86447c70e2ef78cd7ad`;
- frogs top/`260404`: 200,508 bytes,
  `889306ca0dc8743868f9122fb9189f1c53119445abffb82386f141bd340d238a`;
- frogs bottom/`250901`: 200,508 bytes,
  `90c28cc4e5f1266ffc65938b28e5fa6a5df5771f14441382b6a9f64911ba3430`.

All four passed the pinned source/toolchain, ELF/BIN identity, vector, runtime,
RAM, profile, and calculated-receipt gates. They remain hardware-unverified.
The complete local verifier's source and test phases passed, but final site
assembly could not run because previously published beta.3 and later BINs were
not materialized in this checkout.
