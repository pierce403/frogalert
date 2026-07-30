# 2026-07-29 blank nametag fallback

- FOSSASIA always retains an allocated bitmap node even when no valid nametag
  exists, so list presence alone cannot distinguish a visible name.
- Survey builds now scan every loaded bitmap at boot and after BadgeMagic
  uploads. If every pixel is zero, they collapse the empty list and render
  scrolling `503.PARTY` into the retained RAM bitmap.
- The fallback does not write data flash. Any nonblank BadgeMagic upload
  replaces it through the existing reload path.
- Source tests assert both call sites, five real font columns, and vertical
  placement. Locked build evidence:
  - counter top: 206,176 bytes,
    `8073d031722193828c7864677f7b6669835658617fade4e3eefaca34855fdec0`
  - counter bottom: 206,176 bytes,
    `a93972f4decd7c950d5d2616c5c87b6925a3f8a27e1ec58a81061e3ea1ff6f8d`
  - frog-view top: 206,360 bytes,
    `475a9a60983bb909451556cfb234abe6e89ce0515855d6fc05d86fc61c9f6b00`
  - frog-view bottom: 206,360 bytes,
    `fc3d30b48453e28d8131206e631af11fc0d71c3eeda97097887f6bf65b46a7b6`
- All four remain hardware-unverified pending blank/nonblank BadgeMagic tests.
