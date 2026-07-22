#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HIGHCODE_SECTION = ".highcode";
const CH58X_TMR0_IRQ = 16n;
const VECTOR_WORD_BYTES = 4n;

function parseInteger(value, field) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`invalid ${field} integer: ${value}`);
  }
}

export function parseLlvmReadobjSymbols(output) {
  const symbols = new Map();
  const blocks = output.matchAll(/(?:^|\n)\s*Symbol \{\n([\s\S]*?)\n\s*\}/g);

  for (const match of blocks) {
    const fields = new Map();
    for (const line of match[1].split("\n")) {
      const field = line.trim().match(/^([A-Za-z]+):\s+(.+)$/);
      if (field) {
        fields.set(field[1], field[2]);
      }
    }

    const rawName = fields.get("Name");
    const rawValue = fields.get("Value");
    const rawSize = fields.get("Size");
    const rawSection = fields.get("Section");
    if (!rawName || !rawValue || !rawSize || !rawSection) {
      continue;
    }

    const name = rawName.replace(/\s+\(\d+\)$/, "");
    const section = rawSection.replace(/\s+\(0x[0-9a-f]+\)$/i, "");
    const symbol = {
      name,
      value: parseInteger(rawValue, `${name} value`),
      size: parseInteger(rawSize, `${name} size`),
      section,
    };

    const previous = symbols.get(name);
    if (!previous || previous.section === "Undefined") {
      symbols.set(name, symbol);
    }
  }

  return symbols;
}

export function parseLlvmReadobjHexDump(output, section = HIGHCODE_SECTION) {
  const marker = `Hex dump of section '${section}':`;
  const markerIndex = output.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`llvm-readobj output has no ${section} hex dump`);
  }

  const bytes = new Map();
  const lines = output.slice(markerIndex + marker.length).split("\n");
  for (const line of lines) {
    const row = line.match(/^0x([0-9a-f]+)\s+((?:[0-9a-f]{8}\s+){3}[0-9a-f]{8})(?:\s|$)/i);
    if (!row) {
      continue;
    }

    let address = parseInteger(`0x${row[1]}`, "hex-dump address");
    for (const group of row[2].trim().split(/\s+/)) {
      for (let index = 0; index < group.length; index += 2) {
        bytes.set(address, Number.parseInt(group.slice(index, index + 2), 16));
        address += 1n;
      }
    }
  }

  if (bytes.size === 0) {
    throw new Error(`llvm-readobj ${section} hex dump contains no bytes`);
  }
  return bytes;
}

function readLittleEndianU32(bytes, address) {
  let value = 0n;
  for (let index = 0n; index < VECTOR_WORD_BYTES; index += 1n) {
    const byte = bytes.get(address + index);
    if (byte === undefined) {
      return null;
    }
    value |= BigInt(byte) << (index * 8n);
  }
  return value;
}

function hex(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

export function auditCh58xVectors(symbols, highcodeBytes) {
  const issues = [];
  const requireSymbol = (name) => {
    const symbol = symbols.get(name);
    if (!symbol) {
      issues.push({
        code: "missing-symbol",
        message: `required linker symbol ${name} is missing`,
      });
    }
    return symbol;
  };

  const highcodeStart = requireSymbol("_highcode_vma_start");
  const core = requireSymbol("__CORE_INTERRUPTS");
  const external = requireSymbol("__EXTERNAL_INTERRUPTS");
  const exceptions = requireSymbol("__EXCEPTIONS");
  const tmr0 = requireSymbol("TMR0");
  const defaultHandler = symbols.get("DefaultInterruptHandler");

  for (const symbol of [core, external, exceptions, tmr0]) {
    if (symbol && symbol.section !== HIGHCODE_SECTION) {
      issues.push({
        code: `${symbol.name === "__EXTERNAL_INTERRUPTS" ? "external" : symbol.name.toLowerCase()}-section`,
        message: `${symbol.name} is in ${symbol.section}, expected ${HIGHCODE_SECTION}`,
      });
    }
  }

  if (highcodeStart && core) {
    const expectedCore = highcodeStart.value + VECTOR_WORD_BYTES;
    if (core.value !== expectedCore) {
      issues.push({
        code: "core-address",
        message: `__CORE_INTERRUPTS starts at ${hex(core.value)}, expected ${hex(expectedCore)}`,
      });
    }
  }

  if (core && external) {
    const expectedExternal = core.value + core.size;
    if (external.value !== expectedExternal) {
      issues.push({
        code: "external-address",
        message: `__EXTERNAL_INTERRUPTS starts at ${hex(external.value)}, expected ${hex(expectedExternal)} immediately after the core table`,
      });
    }
    if (external.size === 0n || external.size % VECTOR_WORD_BYTES !== 0n) {
      issues.push({
        code: "external-size",
        message: `__EXTERNAL_INTERRUPTS has invalid byte size ${external.size}`,
      });
    }
  }

  if (external && exceptions) {
    const expectedExceptions = external.value + external.size;
    if (exceptions.value !== expectedExceptions) {
      issues.push({
        code: "exceptions-address",
        message: `__EXCEPTIONS starts at ${hex(exceptions.value)}, expected ${hex(expectedExceptions)} immediately after the external table`,
      });
    }
  }

  let tmr0Vector = null;
  if (highcodeStart && tmr0) {
    const vectorAddress = highcodeStart.value + CH58X_TMR0_IRQ * VECTOR_WORD_BYTES;
    tmr0Vector = readLittleEndianU32(highcodeBytes, vectorAddress);
    if (tmr0Vector === null) {
      issues.push({
        code: "tmr0-vector-missing",
        message: `TMR0 vector bytes are missing at ${hex(vectorAddress)}`,
      });
    } else if (tmr0Vector !== tmr0.value) {
      const defaultDetail =
        defaultHandler && tmr0Vector === defaultHandler.value
          ? " (it resolves to DefaultInterruptHandler)"
          : "";
      issues.push({
        code: "tmr0-vector-target",
        message: `IRQ16/TMR0 vector at ${hex(vectorAddress)} contains ${hex(tmr0Vector)}, expected TMR0 at ${hex(tmr0.value)}${defaultDetail}`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    facts: {
      tmr0Vector,
      tmr0Handler: tmr0?.value ?? null,
      externalSection: external?.section ?? null,
    },
  };
}

export function auditCh58xReadobjOutput(output) {
  return auditCh58xVectors(
    parseLlvmReadobjSymbols(output),
    parseLlvmReadobjHexDump(output),
  );
}

function main() {
  const [elfPath, reportPath] = process.argv.slice(2);
  if (!elfPath || !reportPath || process.argv.length > 4) {
    console.error(
      "usage: node scripts/audit-ch58x-vectors.mjs PATH.elf PATH_TO_LLVM_READOBJ_REPORT",
    );
    process.exitCode = 2;
    return;
  }

  try {
    const result = auditCh58xReadobjOutput(readFileSync(reportPath, "utf8"));
    if (!result.ok) {
      console.error(`CH58x vector audit failed for ${elfPath}:`);
      for (const issue of result.issues) {
        console.error(`- [${issue.code}] ${issue.message}`);
      }
      console.error("refusing to create a flashable BIN from this ELF");
      process.exitCode = 1;
      return;
    }

    console.log(
      `CH58x vector audit passed: IRQ16/TMR0 -> ${hex(result.facts.tmr0Vector)}; external table is in ${result.facts.externalSection}`,
    );
  } catch (error) {
    console.error(`CH58x vector audit could not inspect ${elfPath}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
