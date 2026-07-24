import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("successful active-firmware commits build a private candidate before CI completes", () => {
  assert.match(workflow, /firmware_candidate_required:/);
  for (const path of [
    "crates/frogalert-core/*",
    "firmware/fossasia-usbc/*",
    "scripts/build-fossasia-usbc",
    "scripts/firmware-candidate.mjs",
  ]) {
    assert.ok(workflow.includes(path), `candidate scope should include ${path}`);
  }
  assert.match(
    workflow,
    /needs: verify[\s\S]*if: needs\.verify\.outputs\.firmware_candidate_required == 'true'/,
  );
  assert.match(
    workflow,
    /\.\/scripts\/build-fossasia-usbc B1144C_250901_USB_C survey --check/,
  );
  assert.match(
    workflow,
    /FROGALERT_CANDIDATE_COMMIT: \$\{\{ github\.sha \}\}/,
  );
});

test("candidate output is an expiring Actions artifact, not release or Pages input", () => {
  assert.match(workflow, /name: frogalert-candidate-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /path: tmp\/firmware-candidate/);
  assert.match(workflow, /retention-days: 30/);
  assert.doesNotMatch(workflow, /firmware\/releases\/.*candidate/);
  assert.doesNotMatch(workflow, /_site\/.*candidate/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /deploy-pages/);
});

test("candidate job uses only read permission and a hash-keyed pinned toolchain cache", () => {
  assert.match(
    workflow,
    /firmware-candidate:[\s\S]*permissions:\s+contents: read/,
  );
  assert.match(
    workflow,
    /hashFiles\('firmware\/fossasia-usbc\/upstream-lock\.json'\)/,
  );
  assert.match(workflow, /tmp\/fossasia-usbc\/cache/);
  assert.match(workflow, /tmp\/fossasia-usbc\/toolchains/);
});
