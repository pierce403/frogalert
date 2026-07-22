import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  auditCh58xVectors,
  parseLlvmReadobjHexDump,
  parseLlvmReadobjSymbols,
} from "../scripts/audit-ch58x-vectors.mjs";

function symbol(name, value, size, section, index) {
  return `  Symbol {
    Name: ${name} (${index})
    Value: ${value}
    Size: ${size}
    Binding: Global (0x1)
    Type: Object (0x1)
    Other: 0
    Section: ${section} (0x2)
  }`;
}

const validSymbols = [
  symbol("_highcode_vma_start", "0x20000000", 0, ".highcode", 1),
  symbol("__CORE_INTERRUPTS", "0x20000004", 60, ".highcode", 2),
  symbol("__EXTERNAL_INTERRUPTS", "0x20000040", 80, ".highcode", 3),
  symbol("__EXCEPTIONS", "0x20000090", 48, ".highcode", 4),
  symbol("TMR0", "0x20000100", 0, ".highcode", 5),
  symbol("DefaultInterruptHandler", "0x1360", 2, ".text", 6),
].join("\n");

const validHighcode = `
Hex dump of section '.highcode':
0x20000030 00000000 00000000 00000000 00000000 ................
0x20000040 00010020 00000000 00000000 00000000 ... ............
`;

test("accepts a contiguous RAM vector table whose TMR0 slot targets TMR0", () => {
  const result = auditCh58xVectors(
    parseLlvmReadobjSymbols(validSymbols),
    parseLlvmReadobjHexDump(validHighcode),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.facts.tmr0Vector, 0x20000100n);
});

test("rejects the PAC 0.3/qingke-rt 0.5 layout found in both FrogAlert ELFs", () => {
  const brokenSymbols = [
    symbol("_highcode_vma_start", "0x20000000", 0, ".highcode", 1),
    symbol("__CORE_INTERRUPTS", "0x20000004", 60, ".highcode", 2),
    symbol("__EXTERNAL_INTERRUPTS", "0x1474", 144, ".rodata", 3),
    symbol("__EXCEPTIONS", "0x20000040", 48, ".highcode", 4),
    symbol("TMR0", "0x20000070", 0, ".highcode", 5),
    symbol("DefaultInterruptHandler", "0x1360", 2, ".text", 6),
  ].join("\n");
  const brokenHighcode = `
Hex dump of section '.highcode':
0x20000030 60130000 00000000 60130000 00000000 \`.......\`.......
0x20000040 60130000 60130000 60130000 60130000 \`...\`...\`...\`...
`;

  const result = auditCh58xVectors(
    parseLlvmReadobjSymbols(brokenSymbols),
    parseLlvmReadobjHexDump(brokenHighcode),
  );
  const codes = result.issues.map(({ code }) => code);

  assert.equal(result.ok, false);
  assert.ok(codes.includes("external-section"));
  assert.ok(codes.includes("external-address"));
  assert.ok(codes.includes("exceptions-address"));
  assert.ok(codes.includes("tmr0-vector-target"));
  assert.match(
    result.issues.find(({ code }) => code === "tmr0-vector-target").message,
    /DefaultInterruptHandler/,
  );
});

test("standalone Rust builders audit vectors before creating BIN files", async () => {
  for (const script of ["scripts/build-display-bringup", "scripts/build-count-firmware"]) {
    const source = await readFile(new URL(`../${script}`, import.meta.url), "utf8");
    const audit = source.indexOf("audit-ch58x-vectors.mjs");
    const objcopy = source.indexOf('llvm-objcopy\" -O binary');

    assert.ok(audit !== -1, `${script} must invoke the vector audit`);
    assert.ok(objcopy !== -1, `${script} must contain the BIN conversion`);
    assert.ok(audit < objcopy, `${script} must audit before BIN conversion`);
  }
});
