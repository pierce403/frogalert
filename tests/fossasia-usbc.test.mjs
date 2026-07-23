import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canaryText,
  loadLock,
  sha256File,
  validateLock,
  verifyBinary,
  verifyDisassembly,
  verifyLockedFile,
  verifyRamLayout,
  verifySymbolTable,
  verifyVectorTable,
} from "../scripts/audit-fossasia-usbc.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const scaffoldDirectory = path.join(
  repositoryRoot,
  "firmware/fossasia-usbc",
);

function utf16LittleEndian(text) {
  const result = Buffer.alloc(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    result.writeUInt16LE(text.charCodeAt(index), index * 2);
  }
  return result;
}

test("FOSSASIA USB-C lock pins source, toolchain, and known-good baseline", async () => {
  const lock = await loadLock();
  assert.equal(
    lock.upstream.commit,
    "9ce885d682b5c56c3ac7595c09e009a210885221",
  );
  assert.equal(
    lock.upstream.archive_sha256,
    "982e36ade508545487c3282a7fd12c35a4f4df12e5b1959a8f0b2065553e9d50",
  );
  assert.equal(
    lock.toolchain.archive_sha256,
    "33e0dd7581a2eea25bc5d1aa2c31f5c8b316e543b954d84f9e1ffc5999e93fea",
  );
  assert.equal(
    lock.toolchain.embedded_gcc_tree_sha256,
    "d5ad9627c1045e7c45e13a4ec909d6424ba0e2d9e42692e48208b78ad2886eef",
  );
  assert.equal(
    lock.build.known_good_baseline_sha256,
    "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2",
  );
  assert.equal(lock.build.known_good_baseline_size, 177704);
  assert.equal(lock.build.known_good_canary_size, 177788);
  assert.equal(lock.build.minimum_stack_headroom, 8192);
  assert.equal(lock.build.known_good_survey_size, 199788);
  assert.equal(
    lock.build.known_good_survey_sha256,
    "610aeb1ddb8aefdd3ab74d7e67c41b63033620fb3b2c17a625ad0f16434d4475",
  );
  assert.equal(
    lock.build.known_good_canary_sha256,
    "6591f55f6035721384dd2780cb66c03d58e5e08817a1b4e5808a9d2821503e87",
  );
  assert.deepEqual(lock.known_good_upstream_elf, {
    bin_commit: "b56cd9495738e8e3170bf723e70b445de936a5d2",
    path: "usb-c/badgemagic-ch582.elf",
    url: "https://raw.githubusercontent.com/fossasia/badgemagic-firmware/b56cd9495738e8e3170bf723e70b445de936a5d2/usb-c/badgemagic-ch582.elf",
    size: 250072,
    sha256:
      "d13cc219ae21824b8de45f476e2e348a57d0d7b39def72972bb2e977197838df",
    objcopy_arguments: ["-O", "binary", "-S"],
    objcopy_output_size: 177704,
    objcopy_output_sha256:
      "2049eb587844c0ea87eb7c8eddd12dc2c7a3bd5ac1cdee1ede2dba8fc5f670a2",
  });
});

test("lock validation rejects a moving source ref", async () => {
  const lock = structuredClone(await loadLock());
  lock.upstream.archive_url =
    "https://codeload.github.com/fossasia/badgemagic-firmware/tar.gz/master";
  assert.throws(() => validateLock(lock), /exact commit/);

  const escapingLock = structuredClone(await loadLock());
  escapingLock.upstream.extracted_directory = "../../outside";
  assert.throws(
    () => validateLock(escapingLock),
    /Expected values to be strictly equal/,
  );
});

test("canary is inert C metadata and overlay only appends it", async () => {
  const canary = await readFile(
    path.join(scaffoldDirectory, "frogalert-canary.c"),
    "utf8",
  );
  const overlay = await readFile(
    path.join(scaffoldDirectory, "frogalert-canary.mk"),
    "utf8",
  );
  const codeWithoutComments = canary.replace(/\/\*[\s\S]*?\*\//g, "");
  const declarationsOnly = codeWithoutComments.replace(
    /"(?:\\.|[^"\\])*"/g,
    '""',
  );

  assert.match(codeWithoutComments, /const char frogalert_build_canary\[\]/);
  assert.match(codeWithoutComments, new RegExp(canaryText));
  assert.doesNotMatch(
    declarationsOnly,
    /\b(main|_start|handle_reset|IRQHandler|GPIO|TMR|USB|BLE|KEY|reset_jump|asm)\b/,
  );
  assert.match(overlay, /^C_SOURCES \+= src\/frogalert_canary\.c$/m);
  assert.match(
    overlay,
    /^LDFLAGS \+= -Wl,--undefined=frogalert_build_canary$/m,
  );
  assert.match(
    overlay,
    /^\$\(BUILD_DIR\)\/\$\(TARGET\)\.elf: \$\(BUILD_DIR\)\/src\/frogalert_canary\.o$/m,
  );
  assert.doesNotMatch(overlay, /^(OBJECTS|C_SOURCES|LDFLAGS)\s*=/m);
});

test("build wrappers gate the exact profile and keep outputs local", async () => {
  const prepare = await readFile(
    path.join(repositoryRoot, "scripts/prepare-fossasia-usbc"),
    "utf8",
  );
  const build = await readFile(
    path.join(repositoryRoot, "scripts/build-fossasia-usbc"),
    "utf8",
  );

  assert.match(build, /B1144C_250901_USB_C/);
  assert.match(build, /baseline\|canary/);
  assert.match(build, /USBC_VERSION=1/);
  assert.match(build, /tmp\/fossasia-usbc\/build/);
  assert.match(build, /audit-fossasia-usbc\.mjs/);
  assert.match(build, /objcopy" -O binary -S "\$elf" "\$elf_bin"/);
  assert.match(build, /cmp -s "\$bin" "\$elf_bin"/);
  assert.match(prepare, /FROGALERT_FOSSASIA_OFFLINE/);
  assert.match(prepare, /sha256sum/);
  assert.match(prepare, /stat -c %s/);

  for (const script of [prepare, build]) {
    assert.doesNotMatch(script, /firmware\/releases/);
    assert.doesNotMatch(script, /\bwchisp\b/);
    assert.doesNotMatch(script, /\bsudo\b/);
  }
});

test("locked file helper rejects size and digest drift", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "frogalert-fossasia-lock-"),
  );
  const file = path.join(temporaryDirectory, "fixture.bin");
  try {
    await writeFile(file, "frog");
    const sha256 = await sha256File(file);
    await verifyLockedFile(file, { size: 4, sha256 }, "fixture");
    await assert.rejects(
      verifyLockedFile(file, { size: 5, sha256 }, "fixture"),
      /size differs/,
    );
    await assert.rejects(
      verifyLockedFile(file, { size: 4, sha256: "0".repeat(64) }, "fixture"),
      /SHA-256 differs/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("symbol and instruction audits fail closed", async () => {
  const lock = await loadLock();
  const baselineSymbols = lock.build.required_symbols
    .map((symbol, index) => `${index.toString(16).padStart(8, "0")} T ${symbol}`)
    .join("\n");
  verifySymbolTable(baselineSymbols, "baseline", lock);
  verifySymbolTable(
    `${baselineSymbols}\n00000100 R frogalert_build_canary\n`,
    "canary",
    lock,
  );
  assert.throws(
    () => verifySymbolTable(baselineSymbols, "canary", lock),
    /canary symbol mismatch/,
  );

  const surveySymbols = lock.build.required_survey_symbols
    .map((symbol, index) => `${(index + 0x200).toString(16)} T ${symbol}`)
    .join("\n");
  verifySymbolTable(
    `${baselineSymbols}\n${surveySymbols}\n00000300 R frogalert_survey_identity\n`,
    "survey",
    lock,
  );
  assert.throws(
    () =>
      verifySymbolTable(
        `${baselineSymbols}\n00000300 R frogalert_survey_identity\n`,
        "survey",
        lock,
      ),
    /required survey symbol missing/,
  );
  assert.throws(
    () =>
      verifySymbolTable(
        baselineSymbols.replace(/.* USB_IRQHandler\n/, ""),
        "baseline",
        lock,
      ),
    /required runtime symbol missing: USB_IRQHandler/,
  );
  verifyDisassembly("00000000 <main>:\n   0: 8082 ret\n");
  assert.throws(
    () => verifyDisassembly("0: 1001202f lr.w zero,(sp)\n"),
    /AMO\/LR\/SC/,
  );
});

test("RAM audit reserves stack headroom", async () => {
  const lock = await loadLock();
  verifyRamLayout(
    "2000913c B _ebss\n2000b800 B _eusrstack\n",
    lock,
  );
  assert.throws(
    () =>
      verifyRamLayout(
        "2000a000 B _ebss\n2000b800 B _eusrstack\n",
        lock,
      ),
    /RAM headroom/,
  );
  assert.throws(
    () => verifyRamLayout("2000913c B _ebss\n", lock),
    /RAM audit symbol missing/,
  );
});

test("vector audit binds active RAM slots to timer and USB handlers", async () => {
  const highcode = Buffer.alloc(0x5c, 0);
  highcode.writeUInt32LE(0xf5f9bda9, 0x10);
  highcode.writeUInt32LE(0x20003ed2, 16 * 4);
  highcode.writeUInt32LE(0x200040cc, (16 + 6) * 4);
  const symbols = [
    "20003800 T _highcode_vma_start",
    "20003800 t _vector_base",
    "20003ed2 T TMR0_IRQHandler",
    "200040cc T USB_IRQHandler",
  ].join("\n");
  verifyVectorTable(highcode, symbols);

  const brokenTimer = Buffer.from(highcode);
  brokenTimer.writeUInt32LE(0x00001360, 16 * 4);
  assert.throws(
    () => verifyVectorTable(brokenTimer, symbols),
    /TMR0 vector slot/,
  );
  const brokenUsb = Buffer.from(highcode);
  brokenUsb.writeUInt32LE(0x00001360, (16 + 6) * 4);
  assert.throws(
    () => verifyVectorTable(brokenUsb, symbols),
    /USB vector slot/,
  );
});

test("canary BIN audit requires the exact reproducible image, not marker fragments", async () => {
  const lock = await loadLock();
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "frogalert-fossasia-bin-"),
  );
  const file = path.join(temporaryDirectory, "canary.bin");
  try {
    const image = Buffer.alloc(256, 0);
    Buffer.from(lock.build.startup_sentinel_hex, "hex").copy(
      image,
      lock.build.startup_sentinel_offset,
    );
    const evidence = Buffer.concat([
      image,
      utf16LittleEndian("FOSSASIA WAS HERE"),
      utf16LittleEndian("LED Badge Magic"),
      utf16LittleEndian("BM1144-C fw: "),
      Buffer.from(lock.build.version, "ascii"),
      Buffer.from(canaryText, "ascii"),
    ]);
    await writeFile(file, evidence);
    await assert.rejects(
      verifyBinary(file, "canary", lock),
      /locked FOSSASIA USB-C canary size differs/,
    );

    evidence.fill(0, lock.build.startup_sentinel_offset, 24);
    await writeFile(file, evidence);
    await assert.rejects(
      verifyBinary(file, "canary", lock),
      /startup sentinel/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
