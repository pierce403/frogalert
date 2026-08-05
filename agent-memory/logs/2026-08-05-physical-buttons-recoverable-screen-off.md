# Physical-position buttons and recoverable screen off

## Physical reports

Exact top `0.2.0-beta.8` routed the physical top button to name/count view
selection even though the bottom button is the required view control. The owner
also clarified that the top-button mode cycle must include a real dark screen
for battery and social comfort; beta.7/beta.8 had removed that state while
avoiding the beta.6 shutdown lockout.

## Root causes

The two exact boards use different electrical key numbers for the same physical
positions. `B1144C_260404_USB_C` has physical bottom on KEY1 and physical top on
KEY2. `B1144C_250901_USB_C` has physical bottom on KEY2 and physical top on KEY1.
Beta.8 standardized logical KEY roles instead of physical positions, so it
necessarily misrouted the top image.

The beta.6 black-screen lockout was not caused by blanking the display. It came
from calling upstream `poweroff()`, which enters `LowPower_Shutdown()` and stops
the application tasks. The failed physical KEY1 wake then also made the
application-level long-KEY2 ISP poll unavailable until USB caused a reboot.

## Fix

`0.2.0-beta.9` uses only the compiled exact profile:

- `260404`: KEY1 short selects name/count; KEY2 short is the system control.
- `250901`: KEY2 short selects name/count; KEY1 short is the system control.
- No runtime profile probe or cross-image compatibility behavior remains.
- The physical top/system cycle is normal → Bluetooth download → screen off →
  normal.
- The physical bottom/view transition never opens advertising or shows the
  Bluetooth animation.

Screen off is an application state, not CH58x shutdown. It disables advertising
and surveys, clears animation work and the framebuffer, disables the 16 kHz
TMR0 display interrupt/timer, and releases all 23 LED matrix pins. It preserves
TMR3's 50 Hz button scan, TMOS, USB, and the independent 200 ms KEY2 hold task,
so the physical top button can wake the screen and a continuous roughly
2.2-second KEY2 hold can still enter ISP without USB.

Asynchronous survey cancellation also clears or replaces its deferred
`advertise_when_idle` decision on every suspend request and rechecks the current
mode before enabling advertising. This prevents a quick download → screen-off
sequence from restoring Bluetooth after the panel goes dark. Normal-mode wake
restores explicitly configured always-on advertising through the same deferred
idle gate.

## Local verification

Focused transform tests assert both compile-time mappings, forbid radio/display
cue calls from either view wrapper, require the three-state system cycle, prove
that screen off never calls `poweroff()`/`LowPower_Shutdown()`, require TMR0 and
matrix release plus normal-mode re-enable, and retain the original long-KEY2
poll. Both profile disassemblies independently confirm the intended wrapper
binding.

All four final-version candidate builds passed source/toolchain/profile,
ELF/BIN identity, startup/vector, USB/BLE/display/KEY2, RAM, and calculated
receipt gates:

- counter top/`260404`: 200,340 bytes,
  `bb6d3f158320d1bcd6a8e05aa2f908edd32469c2d34d2faee6b362ae85a29259`
- counter bottom/`250901`: 200,340 bytes,
  `f0e4035586c9bf524b4456425af59e5bde84d1b5b3a65f8061aae433c343f059`
- frogs top/`260404`: 200,412 bytes,
  `f486da88eda13022f91f89cd2bbe77955e86cb4aee247e73cc54fa75040c9346`
- frogs bottom/`250901`: 200,412 bytes,
  `88fcea61bef699da5b2483087fbd9768f551b3075e6a7239a12ab3110f427b42`

These are source/build results, not physical proof. Both exact counter images
still need repeated bottom-only view presses, top-only download/off/wake, at
least one minute dark without USB, long-KEY2 ISP from the dark state, BadgeMagic
upload, passive counting/detection, and screen-off current measurement.
