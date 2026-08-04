import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("successful active-firmware commits build a private candidate before CI completes", () => {
  assert.match(workflow, /workflow_dispatch:/);
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
    /BASE_COMMIT: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  );
  assert.match(
    workflow,
    /published_counter_pair_exists\(\)[\s\S]*release\.version === process\.env\.CURRENT_VERSION[\s\S]*release\.firmware_variant === "counter"[\s\S]*release\.flash_approved === true[\s\S]*releases\.length === 2/,
  );
  assert.match(
    workflow,
    /if \[\[ "\$EVENT_NAME" == "workflow_dispatch" \]\]; then[\s\S]*if published_counter_pair_exists "\$current_version"; then[\s\S]*required=false[\s\S]*else\s+required=true/,
  );
  assert.doesNotMatch(
    workflow,
    /Detect active firmware input changes[\s\S]{0,120}if: github\.event_name == 'push'/,
  );
  assert.match(
    workflow,
    /\.\/scripts\/build-fossasia-usbc B1144C_250901_USB_C survey --candidate/,
  );
  assert.match(workflow, /\.\/scripts\/build-fossasia-usbc frogs --candidate/);
  assert.match(
    workflow,
    /\.\/scripts\/build-fossasia-usbc B1144C_250901_USB_C frogs --candidate/,
  );
  assert.match(
    workflow,
    /FROGALERT_CANDIDATE_COMMIT: \$\{\{ github\.sha \}\}/,
  );
  assert.match(
    workflow,
    /Require active firmware changes to advance the release version[\s\S]*steps\.firmware_candidate_scope\.outputs\.version_bump_required == 'true'/,
  );
  assert.match(
    workflow,
    /EVENT_NAME" == "push"[\s\S]*published_counter_pair_exists[\s\S]*interrupted publication/,
  );
  assert.match(
    workflow,
    /node scripts\/require-firmware-version-bump\.mjs \\\s+tmp\/previous-firmware-version\.json \\\s+firmware\/fossasia-usbc\/version\.json/,
  );
});

test("candidate output is retained while CI itself remains publication-free", () => {
  assert.match(workflow, /name: frogalert-candidate-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /path: tmp\/firmware-candidate/);
  assert.match(workflow, /retention-days: 90/);
  assert.doesNotMatch(workflow, /firmware\/releases\/.*candidate/);
  assert.doesNotMatch(workflow, /_site\/.*candidate/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /deploy-pages/);
});

test("candidate build job keeps source access read-only", () => {
  assert.match(
    workflow,
    /firmware-candidate:[\s\S]*permissions:\s+contents: read/,
  );
  assert.doesNotMatch(
    workflow,
    /firmware-candidate:[\s\S]*?permissions:[\s\S]*?contents: write/,
  );
  assert.match(
    workflow,
    /hashFiles\('firmware\/fossasia-usbc\/upstream-lock\.json'\)/,
  );
  assert.match(workflow, /tmp\/fossasia-usbc\/cache/);
  assert.match(workflow, /tmp\/fossasia-usbc\/toolchains/);
});

test("candidate metadata records the exact GitHub Actions execution", () => {
  for (const [name, value] of [
    ["FROGALERT_CANDIDATE_GITHUB_REPOSITORY", "github.repository"],
    ["FROGALERT_CANDIDATE_GITHUB_RUN_ID", "github.run_id"],
    ["FROGALERT_CANDIDATE_GITHUB_WORKFLOW", "github.workflow_ref"],
    ["FROGALERT_CANDIDATE_GITHUB_RUN_ATTEMPT", "github.run_attempt"],
  ]) {
    assert.match(
      workflow,
      new RegExp(`${name}: \\$\\{\\{ ${value.replaceAll(".", "\\.")} \\}\\}`),
    );
  }
  assert.match(
    workflow,
    /FROGALERT_CANDIDATE_GITHUB_JOB: firmware-candidate/,
  );
  assert.doesNotMatch(
    workflow,
    /FROGALERT_CANDIDATE_GITHUB_JOB:.*github\.job/,
  );
});

test("a separate non-PR job gives cloud candidates scoped provenance attestations", () => {
  assert.match(workflow, /attest-candidate:\s+needs: firmware-candidate/);
  assert.match(
    workflow,
    /attest-candidate:[\s\S]*if: github\.event_name != 'pull_request'/,
  );
  assert.match(
    workflow,
    /attest-candidate:[\s\S]*permissions:\s+contents: read\s+attestations: write\s+artifact-metadata: write\s+id-token: write/,
  );
  assert.match(workflow, /uses: actions\/download-artifact@v4/);
  assert.match(workflow, /name: Attest cloud-built candidate provenance/);
  assert.match(workflow, /uses: actions\/attest@v4/);
  assert.match(workflow, /tmp\/firmware-candidate\/\*\*\/\*\.bin/);
  assert.match(workflow, /tmp\/firmware-candidate\/\*\*\/\*\.elf/);
  assert.match(workflow, /id: candidate_upload/);
  assert.match(workflow, /steps\.candidate_upload\.outputs\.artifact-digest/);
  assert.match(workflow, /steps\.candidate_upload\.outputs\.artifact-url/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /manifest_digest="sha256:\$manifest_digest"/);
  assert.match(workflow, /Archive digest for manifest provenance/);
});

test("trusted main CI validates approved cloud-backed release bytes", () => {
  assert.match(workflow, /publication-assets:\s+needs: verify/);
  assert.match(
    workflow,
    /publication-assets:[\s\S]*if: github\.event_name != 'pull_request'/,
  );
  assert.match(
    workflow,
    /publication-assets:[\s\S]*permissions:\s+actions: read\s+attestations: read\s+contents: read/,
  );
  assert.match(
    workflow,
    /node scripts\/materialize-firmware-artifacts\.mjs tmp\/release-artifacts/,
  );
  assert.match(workflow, /FROGALERT_RELEASE_ASSET_ROOT: tmp\/release-artifacts/);
  assert.match(workflow, /FROGALERT_SKIP_PUBLICATION_ASSETS: "1"/);
});
