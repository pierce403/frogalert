# Automatic button image selection

The public `/flash/` wizard no longer exposes a firmware file input, hardware
profile selector, or PCB-marking field. After it observes a normal-mode badge,
the bottom-button path records `B1144C_250901_USB_C` and the top-button path
records `B1144C_260404_USB_C`. A successful read-only CH582 ISP probe then
loads the newest approved matching release from the same-origin schema-v4
manifest and reuses the existing descriptor, size, hash, embedded-profile,
quarantine, and hardware-evidence checks.

If the manifest has no approved matching release, the wizard stops with a
single message and does not expose a local developer-file fallback. It also
stops if the page encounters an ISP device without first observing the guided
button path. Destructive confirmation and the final program action remain
separate; automatic artifact preparation is not permission to erase.

At implementation time the public manifest had no approved USB-C release, so
the safe production outcome for both button paths was the explicit no-release
stop. The legacy hidden developer lab retains local-file tooling for qualified
bench work.
