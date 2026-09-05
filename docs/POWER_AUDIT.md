# Power and wake audit — 0.3.0

The owner reports that the Rust firmware works on actual hardware, but can
turn on spontaneously, including seconds after shutdown. This audit found a
specific source-level wake-routing defect and several hardening opportunities.
It does not establish which electrical event caused an individual observed
wake, or claim measured battery-life improvement.

## Findings and changes

| Finding | Evidence and change |
| --- | --- |
| **Wrong GPIO interrupt input** | Pinned WCH `CH58x_gpio.c` maps PB22's interrupt flag to bit 8 but does not set `RB_PIN_INTX`. `CH583SFR.h` says the default mux selects PB8/PB9, while remapping selects PB22/PB23. No prior application call selected the mux. PB8 is an LED net floated at shutdown. Explicitly remap before arming KEY2. |
| **Single-sample wake acceptance** | The prior early boot accepted one asserted input, even if it disappeared immediately. Caller-owned Rust state now requires 100 ms continuously asserted, then 60 ms released. KEY2 wins simultaneous presses; 2.2 seconds continuously held enters ROM ISP. Brief bottom/recovery presses on 250901 remain dark. |
| **Shutdown entry could inherit activity** | OR-enabling GPIO wake left prior wake bits intact. Only one charger flag was masked. Shutdown now disables both PFIC banks and all GPIO enables, detaches USB and stops its DMA, disables USB/USB2/RTC/battery wake, selects only profile buttons, and clears GPIO/PFIC pending flags after input settling. |
| **Button release and stuck input** | Shutdown waits for 60 ms released, bounded at 300 ms. A stuck button still reaches edge-triggered shutdown; releasing it is not a wake edge. The accepted wake release is consumed before ordinary button polling starts. |
| **Reset could forget off intent** | Only two reset reasons qualified as off wakes. The retained marker now gates all non-power-on resets and is cleared only after an intentional wake/ISP decision. A genuine power-on still boots normally. No flash writes are added. |
| **Radio fault could drain the battery while dark** | Missing cancellation/advertising/disconnect acknowledgement blocked shutdown indefinitely. Rust now allows 30 seconds, then requests a controller reset with the off marker set. Early boot enters shutdown without starting peripherals when no button qualifies. Reset is separate from confirmed idle; resume cancels the deadline, and repeated off requests cannot extend it. Missing scheduler registration takes this reset path too. |
| **ADC remained powered** | `ADC_ExtSingleChSampInit` enables converter and input buffer, and the old code left both on. Calibration is retained; each read powers up, settles, discards the first conversion, averages calibrated samples, then powers down. |
| **Duplicate welcome cost** | A static credit/battery pair preceded the stored default animated FOSSASIA splash. Two 500 ms static cards now replace the default animation, including a default saved by old firmware. Dimension and row-padded byte comparison preserves custom splashes. Attribution and USB/BLE manufacturer identity remain. |

The register evidence comes from the exact pinned FOSSASIA SDK at
`9ce885d682b5c56c3ac7595c09e009a210885221`, specifically
`CH5xx_ble_firmware_library/StdPeriphDriver/{CH58x_gpio.c,CH58x_pwr.c,CH58x_adc.c}`
and `inc/CH583SFR.h`. WCH's [CH582/CH583 source and documentation](https://github.com/openwch/ch583)
is the primary vendor reference. Builds still use the pinned source, not the
latest vendor SDK.

## Low-power boundary and remaining opportunities

Normal off first blanks and releases the panel, disables its refresh timer,
and asynchronously stops discovery, advertising, and app connections. The
common TMOS task stops button polling before handing off. The pinned
`LowPower_Shutdown(0)` switches clocks, selects deep sleep with no SRAM
retention, disables battery monitoring, executes WFI, then resets on return.
The application cannot fall through and resume with shutdown clocks.

The running display remains at the proven 16 kHz scan interrupt rate (about
182 complete frames/second). Normal advertising is off; passive discovery is
three seconds about every twenty seconds; unchanged frames are not recopied.
Release builds do not enable UART debug printing. These paths were reviewed
and retained.

The foreground still services TMOS at 60 MHz. A slower clock, generic WFI,
BLE sleep callback, or altered LED scan rate needs timing and USB/BLE hardware
measurement before adoption. Blindly sleeping or gating clocks can break
radio deadlines and recovery. DCDC must not be enabled without confirming the
board's supporting components. The battery divider and charger consume power
outside software control. A true rail brownout can lose the retained off
marker and appear as power-on; this patch does not claim to prevent that.

## Validation and physical follow-up

Host tests execute the shipping Rust policy and C ABI. A C fixture compiles the
production-transformed shutdown code with simulated SDK/register operations,
checking both profiles, mux selection, exclusive wake sources, pending flags,
USB/ADC shutdown, 60/300 ms release bounds, reset reasons, and spurious IRQs.
Radio emulation tests lost acknowledgements, deadline wrap, repeated requests,
and resume cancellation. The fixture's WFI is a boundary assertion, not
instruction or electrical emulation.

The embedded gate builds both profiles and views and checks linked vectors,
forbidden atomic instructions, RAM headroom, recovery symbols, and exact
ELF-to-BIN identity. Stable publication retains truthful exact-image hardware
status; the channel is selected at the owner's request.

Physical follow-up should compare battery-only and USB-connected operation:
repeat off/wake with ordinary and bouncing/brief presses, hold KEY2 into ISP
from off on each profile, verify BadgeMagic uploads after wake, and observe an
off badge beyond the previously reported intervals. Measure off current and
running current at fixed brightness before quoting savings. Do not alter the
soldered battery or charger wiring to perform this software verification.
