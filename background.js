importScripts("shared.js");

const ACTION_ICONS = {
  active: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png"
  },
  off: {
    16: "icons/icon-off16.png",
    32: "icons/icon-off32.png",
    48: "icons/icon-off48.png",
    128: "icons/icon-off128.png"
  },
  locked: {
    16: "icons/icon-locked16.png",
    32: "icons/icon-locked32.png",
    48: "icons/icon-locked48.png",
    128: "icons/icon-locked128.png"
  }
};
let iconTimer = null;

async function syncActionIcon() {
  try {
    const settings = UnaddictifySettings.mergeSettings(
      await chrome.storage.local.get(UnaddictifySettings.DEFAULT_SETTINGS)
    );
    const locked = UnaddictifySettings.isLocked(settings);
    const state = locked && settings.enabled ? "locked" : settings.enabled ? "active" : "off";
    await chrome.action.setIcon({ path: ACTION_ICONS[state] });
    await chrome.action.setTitle({
      title: state === "locked"
        ? "blokamine — Focus Lock active"
        : state === "active"
          ? "blokamine — Active"
          : "blokamine — Off"
    });
    if (iconTimer) clearTimeout(iconTimer);
    iconTimer = locked
      ? setTimeout(syncActionIcon, Math.min(2147483647, Math.max(100, settings.lockUntil - Date.now() + 100)))
      : null;
  } catch (_) {
    // The popup and settings page still provide the current state.
  }
}

chrome.runtime.onInstalled.addListener(syncActionIcon);
chrome.runtime.onStartup.addListener(syncActionIcon);
chrome.storage.onChanged.addListener(() => syncActionIcon());
syncActionIcon();
