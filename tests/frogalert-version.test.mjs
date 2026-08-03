import assert from "node:assert/strict";
import test from "node:test";

import {
  compactFirmwareVersion,
  loadFirmwareVersion,
  validateFirmwareVersion,
} from "../scripts/frogalert-version.mjs";

test("firmware version metadata drives the exact full and compact versions", async () => {
  const metadata = await loadFirmwareVersion();
  assert.equal(metadata.schema_version, 1);
  assert.equal(
    metadata.display_version,
    compactFirmwareVersion(metadata.version),
  );
  assert.match(
    metadata.version,
    /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/,
  );
});

test("compact firmware versions are lossless for supported release channels", () => {
  assert.equal(compactFirmwareVersion("1.2.3"), "v1.2.3");
  assert.equal(compactFirmwareVersion("1.2.3-alpha.4"), "v1.2.3a4");
  assert.equal(compactFirmwareVersion("1.2.3-beta.4"), "v1.2.3b4");
  assert.equal(compactFirmwareVersion("1.2.3-rc.4"), "v1.2.3r4");
  assert.throws(() => compactFirmwareVersion("1.2"), /semver/);
  assert.throws(() => compactFirmwareVersion("1.2.3-dev.4"), /semver/);
});

test("firmware version metadata rejects aliases and display overflow", () => {
  assert.throws(
    () =>
      validateFirmwareVersion({
        schema_version: 1,
        version: "0.2.0-beta.1",
        display_version: "v0.2.0",
      }),
    /lossless compact form/,
  );
  assert.throws(
    () =>
      validateFirmwareVersion({
        schema_version: 1,
        version: "123.45.6-beta.78",
        display_version: "v123.45.6b78",
      }),
    /does not fit/,
  );
});
