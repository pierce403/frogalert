// Restrict the rule to the two supported ROM bootloaders and the active desktop
// session. This text is copied, never executed by the website.
export const UDEV_COMMAND = `sudo sh -c 'cat > /etc/udev/rules.d/70-frogalert.rules <<EOF
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", ATTR{idVendor}=="4348", ATTR{idProduct}=="55e0", TAG+="uaccess"
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", ATTR{idVendor}=="1a86", ATTR{idProduct}=="55e0", TAG+="uaccess"
EOF
udevadm control --reload-rules'`;

export function usbOpenPermissionHelp(error, navigatorLike = {}) {
  if (!/access denied|permission denied|insufficient permissions/i.test(error?.message || "")) return null;
  const ua = String(navigatorLike.userAgent || "");
  const platform = String(navigatorLike.userAgentData?.platform || navigatorLike.platform || "");
  if (/Android/i.test(`${ua} ${platform}`)) {
    return { message: "Android denied USB access. Select the WCH bootloader again and accept Android’s additional USB permission popup. No firmware was written." };
  }
  // Android also says Linux; ChromeOS and unknown/mobile platforms must not get
  // host udev commands. Prefer an explicit OS hint when the browser provides one.
  const linux = !/CrOS|Chrome OS|Windows|Win32|Win64|Mac|iPhone|iPad|iPod/i.test(`${ua} ${platform}`)
    && navigatorLike.userAgentData?.mobile !== true
    && !/Mobile/i.test(ua)
    && /Linux/i.test(platform || ua);
  if (linux) {
    return {
      message: "Linux denied USB access. Browser permission alone is not enough; update your udev rules using the command below, then reconnect the bootloader. No firmware was written.",
      command: UDEV_COMMAND,
    };
  }
  return { message: "USB access was denied by the browser or operating system. Check this site’s USB permission and close other apps or tabs using the badge, then select the bootloader again. No firmware was written." };
}

export function showLinuxUsbHelp(status, command) {
  document.getElementById("usb-permission-help")?.remove();
  const panel = document.createElement("section");
  panel.id = "usb-permission-help";
  panel.className = "usb-permission-help";
  const heading = document.createElement("h3");
  heading.textContent = "Allow USB access on Linux";
  const explanation = document.createElement("p");
  explanation.textContent = "Run this once in a terminal. It uses sudo to grant your logged-in desktop session access to WCH bootloaders, without granting every user write access.";
  const pre = document.createElement("pre");
  pre.tabIndex = 0;
  const code = document.createElement("code");
  code.textContent = command;
  pre.append(code);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button button-secondary";
  copy.textContent = "Copy udev command";
  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(command);
      feedback.textContent = "Copied. Paste the command into your terminal.";
    } catch {
      feedback.textContent = "Clipboard access failed. Select and copy the command above manually.";
      pre.focus();
    }
  });
  const retry = document.createElement("p");
  retry.textContent = "After running it, unplug and reconnect the badge. Click Start watching, enter ISP with KEY2, then select WCH ISP. If access is still denied, check your browser’s sandbox permissions and close other USB tools or flasher tabs.";
  panel.append(heading, explanation, pre, copy, feedback, retry);
  (status.closest(".wizard-device-state") || status).after(panel);
}
