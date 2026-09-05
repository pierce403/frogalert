import assert from "node:assert/strict";
import test from "node:test";
import { UDEV_COMMAND, usbOpenPermissionHelp, showLinuxUsbHelp } from "../site/usb-permission-help.js";

const denied = new Error("Failed to execute 'open' on 'USBDevice': Access denied.");
test("udev guidance requires desktop Linux and an actual access denial", () => {
  for (const nav of [
    { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/151" },
    { userAgentData: { platform: "Linux", mobile: false } },
    { platform: "Linux x86_64" },
  ]) assert.equal(usbOpenPermissionHelp(denied, nav).command, UDEV_COMMAND);
  for (const nav of [
    {}, { platform: "Win32" }, { platform: "MacIntel" },
    { userAgent: "Mozilla/5.0 (X11; CrOS x86_64)" },
    { userAgentData: { platform: "Chrome OS" }, platform: "Linux x86_64" },
    { userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/150 Mobile", platform: "Linux armv8l" },
    { userAgentData: { platform: "Android", mobile: false }, userAgent: "Linux x86_64" },
    { userAgentData: { platform: "Linux", mobile: true } },
    { userAgent: "iPad", platform: "Linux" },
  ]) assert.equal(usbOpenPermissionHelp(denied, nav).command, undefined);
  assert.match(usbOpenPermissionHelp(denied, { userAgent: "Android" }).message, /additional USB permission popup/);
  for (const message of ["The device was disconnected", "No device selected", "Unable to claim interface", "USB write timed out"]) {
    assert.equal(usbOpenPermissionHelp(new Error(message), { platform: "Linux" }), null);
  }
  assert.equal((UDEV_COMMAND.match(/TAG\+="uaccess"/g) || []).length, 2);
  assert.doesNotMatch(UDEV_COMMAND, /0666|chmod|sudo.*brave/);
});

test("copy button copies the displayed command and handles denied clipboard access", async (t) => {
  const nodes = [];
  const doc = {
    getElementById: () => null,
    createElement(tag) {
      const node = { tag, children: [], append(...items) { this.children.push(...items); },
        setAttribute() {}, addEventListener(type, callback) { this[type] = callback; },
        focus() { this.focused = true; } };
      nodes.push(node);
      return node;
    },
  };
  let copied;
  const oldDoc = Object.getOwnPropertyDescriptor(globalThis, "document");
  const oldNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const clipboard = { async writeText(text) { copied = text; } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });
  t.after(() => {
    if (oldDoc) Object.defineProperty(globalThis, "document", oldDoc); else delete globalThis.document;
    if (oldNav) Object.defineProperty(globalThis, "navigator", oldNav); else delete globalThis.navigator;
  });
  let panel;
  showLinuxUsbHelp({ closest: () => ({ after(value) { panel = value; } }) }, UDEV_COMMAND);
  assert.equal(panel.id, "usb-permission-help");
  const button = nodes.find(n => n.tag === "button");
  await button.click();
  assert.equal(copied, nodes.find(n => n.tag === "code").textContent);
  assert.equal(copied, UDEV_COMMAND);
  clipboard.writeText = async () => { throw new Error("denied"); };
  await button.click();
  assert.ok(nodes.some(n => n.textContent?.includes("copy the command above manually")));
  assert.equal(nodes.find(n => n.tag === "pre").focused, true);
});
