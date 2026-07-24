# Latest survey image physical observation

Date: 2026-07-23

The user reports that the latest image they flashed is working well on the
photographed USB-C badge. This is useful positive feedback, but it is not bound
to exact programmed bytes.

The two plausible artifacts are:

- animation-fix candidate from source `32c0b30d28422be734d1ce32f780e36ad3882734`,
  201,628 bytes, SHA-256
  `8dff996d2170c24dc30aa781f27ff47fae6ab1ea7a6f53eac777d40edf19ebf7`;
- current KARR-capable candidate from source
  `09c688c2fd9aaa2cca1966646cf68b986ddf4a5f`, 201,788 bytes, SHA-256
  `9d35de6a3bf7cdf90b2a4fe05fa25d0a85a3f9b18da42228b5e25908a92c51a7`.

The first image was explicitly built immediately before the user praised the
animation correction. The second was built later, but no subsequent flash was
recorded. The current source reproducibly rebuilds the second BIN and an ELF at
SHA-256 `2d6170cb68795bf03c68fcfb92aebef5bb80353d72cfdee72cbdaa51312fddca`;
the Make BIN and fresh ELF-derived BIN are byte-identical.

Do not infer which image is on the badge or promote either one from this report.
A release still needs an exact hash-bound CLI program/verify, WebUSB
program/verify, application USB and BadgeMagic checks, KEY1 and short-KEY2
checks, KEY2-only dot-to-ISP recovery, power-cycle results, and the known-good
FOSSASIA reflash transcript required by `firmware/evidence/README.md`.
