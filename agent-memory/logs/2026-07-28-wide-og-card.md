# Wide 11×44 social preview

Date: 2026-07-28

The first FrogAlert social card used a portrait 410×492 illustrated shell and
a 342×204 LED field. Although the JPEG itself was correctly 1200×630, the
device looked square or phone-like rather than like the physical long
BadgeMagic nametag.

The editable `site/og-card.svg` now draws a 1060×250 horizontal shell and an
820×205 LED field. The latter is exactly 4:1, matching 44 columns by 11 rows at
square pitch, and `COP DETECTED` appears on one line. Static tests bind the
shell and matrix geometry through `badge-shell` and `badge-matrix` ids.

Both pages moved to `site/og-card-v2.jpg` rather than replacing the metadata
URL in place. Social crawlers cache image URLs aggressively, so material art
changes should advance the filename and retain the preceding asset for
existing unfurls. Regenerate the current JPEG from the SVG with:

```bash
./scripts/render-og-card
```

## Physical-face correction

The first horizontal redraw still invented a left-side control rail with a
visible `11×44` label and left a wide section of the shell without LEDs. The
physical badge face is almost entirely matrix. The corrected v3 card removes
all face labels and controls, expands the exact 4:1 matrix to 1064×266 inside a
1092×270 shell, and keeps only the message in the LED field.
