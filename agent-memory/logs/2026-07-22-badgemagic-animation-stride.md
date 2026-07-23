# BadgeMagic 48-column animation stride diagnosis

## Observation

The user reported that an app-sent nametag animation sometimes appeared two
columns to the right, with the first two physical columns blank. This report is
not yet bound to a captured `wang` payload or an exact programmed firmware
hash, so it is a strong diagnosis rather than completed hardware acceptance
evidence.

## Source evidence

The official BadgeMagic app has the same bitmap conversion behavior in stable
tag `v1.18.15` and development commit
`42c98bc8c7d24459c5145d1b2efdda26c8aaf27e`:

- `Converters.convertBitmapToLEDHex(image, false)` receives an 11×44 bitmap;
- it pads the width to the protocol's next eight-column boundary;
- the four padding columns are split evenly, producing two blank columns
  before and two after the 44 content columns;
- the development special-animation transfer helpers use this untrimmed
  conversion path, while the stable draw and GIF paths also expose the
  44-versus-48 convention.

The pinned FOSSASIA source `9ce885d682b5c56c3ac7595c09e009a210885221`
decodes every 11-byte chunk into eight framebuffer columns, so the stored
bitmap is correctly measured as 48 columns. Its frame-based animation helper
then advances each frame by `LED_COLS`, which is 44, instead of by the
48-column wire stride.

For source columns `c0` through `c43`, the mismatch is:

```text
app wire frame:      0 0 c0 c1 ... c42 c43 0 0     (48 columns)
firmware frame 0:    0 0 c0 c1 ... c40 c41         (first 44 columns)
firmware frame 1:    c42 c43 0 0 ...                (next 44-column slice)
```

That reproduces the two blank leading columns and two-column right shift
exactly. With concatenated animation frames, the four-column stride mismatch
also makes later slices drift across wire-frame boundaries.

## Scope and separate finding

This is a compatibility mismatch between the BadgeMagic wire representation
and FOSSASIA's frame slicing, not a charlieplex pin-map problem. A global
framebuffer shift would break FrogAlert overlays and ordinary scrolling text.
Normal text has a separate app encoder path and must be covered by regression
fixtures before changing frame interpretation.

The same source audit found that `legacy_usb_rx()` frees a completed transfer
buffer without resetting its static `rx_len` and `data_len`. A second USB
upload in the same boot can therefore reuse stale counters and a freed
pointer. That parser defect does not explain the exact two-column BLE/app
symptom, but repeated USB upload must be hardened separately.

## Safest next step

Capture golden `wang` payloads from the official app for:

1. short and 48-column fixed text;
2. a 44-column drawing;
3. a multi-frame GIF;
4. at least one current special animation.

Add a host decoder test that proves stored width, per-frame stride, and the
44 visible columns. Then change only qualifying frame-based modes to advance
by the 48-column wire stride and copy its inner columns 2 through 45. Preserve
the existing 44-column physical framebuffer, scrolling behavior, upload
format, FrogAlert overlays, and recovery task.
