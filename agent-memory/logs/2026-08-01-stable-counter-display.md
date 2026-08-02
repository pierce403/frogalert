# Stable counter display after physical observation

The bottom-profile survey image was physically observed to stay blank for
about ten seconds, then appear to alternate between `11` and a value that
looked like it was in the hundreds before a `FLIPPER DETECTED` overlay restored
`11`.

The counter cannot exceed 64 unique addresses. The apparent `115` was the
completed count `11` followed by the live scan-phase suffix `S`, whose 5x7
shape can read as a third digit. The firmware also redrew each partial count
while a scan was active. The ten-second interruption came from the counter
lane keeping the BadgeMagic readiness animation visible for the entire radio
attention window; the frog lane had already separated its one-second display
cue from the ten-second advertising window.

The replacement keeps the last completed count unchanged throughout the next
scan and atomically publishes only the next completed result. Initialization,
scan, error, and timeout state remains in debug output and is never appended to
the count. Both counter and frog lanes now show the app-readiness cue for one
second while leaving the radio window open for ten seconds. Alert overlays
still preempt the counter and restore the same completed result afterward.

Locked build results:

- top / `B1144C_260404_USB_C` survey: 206,216 bytes,
  `a3cb748194965c2f2aa54ec541df02e66c3f38f8e375179f620a2cae9bcc444e`
- bottom / `B1144C_250901_USB_C` survey: 206,216 bytes,
  `cb2780b1f11818f4560fd14d01dfa1e32ab7317766cb9dc876d428fc7df0706a`
- top frogs: 206,304 bytes,
  `5c69637a12a9da0f63e76f2844e9f29a1b23cd7ce4a2174ec77c4269500ea8ce`
- bottom frogs: 206,304 bytes,
  `5634194f7276e4c8734486a5fde013152160fb8ececf95a9902b1470d57964bd`

These are audited build candidates, not hardware-verified releases. Reflash
the matching bottom survey image and confirm initial `00`, a steady value
during scans, atomic updates no greater than `64+`, one-second readiness cue,
alert restoration, BadgeMagic upload, and KEY2-only ISP recovery.
