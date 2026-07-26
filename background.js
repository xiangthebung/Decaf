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
const LOCK_EXPIRY_ALARM = "blokamine-focus-lock-expiry";

async function syncActionIcon() {
  try {
    const stored = await chrome.storage.local.get({
      ...UnaddictifySettings.DEFAULT_SETTINGS,
      [UnaddictifySettings.LOCK_BASELINE_KEY]: null
    });
    let settings = UnaddictifySettings.mergeSettings(stored);
    let locked = UnaddictifySettings.isLocked(settings);
    const baseline = stored[UnaddictifySettings.LOCK_BASELINE_KEY];
    const baselineSettings = baseline ? UnaddictifySettings.mergeSettings(baseline) : null;

    // The baseline is authoritative while its own lock is still valid. This
    // also repairs a stale popup/options writer that briefly persisted an old
    // lockUntil value before the service worker observed the update.
    if (baselineSettings && UnaddictifySettings.isLocked(baselineSettings) &&
      (!locked || UnaddictifySettings.isWeakeningChange(baselineSettings, settings))) {
      const repaired = UnaddictifySettings.repairLockedSettings(baselineSettings, settings);
      settings = repaired;
      locked = true;
      await chrome.storage.local.set({
        ...UnaddictifySettings.createStoragePatch(
          UnaddictifySettings.mergeSettings(stored),
          repaired
        ),
        [UnaddictifySettings.LOCK_BASELINE_KEY]: baselineSettings
      });
    } else if (!locked && baseline) {
      await chrome.storage.local.remove(UnaddictifySettings.LOCK_BASELINE_KEY);
    }

    if (locked && settings.enabled !== true) {
      await chrome.storage.local.set({ enabled: true });
      settings.enabled = true;
    }
    const state = locked && settings.enabled ? "locked" : settings.enabled ? "active" : "off";
    await chrome.action.setIcon({ path: ACTION_ICONS[state] });
    await chrome.action.setTitle({
      title: state === "locked"
        ? "blokamine — Focus Lock active"
        : state === "active"
          ? "blokamine — Active"
          : "blokamine — Off"
    });
    await chrome.alarms.clear(LOCK_EXPIRY_ALARM);
    if (locked) {
      await chrome.alarms.create(LOCK_EXPIRY_ALARM, { when: settings.lockUntil + 100 });
    }
  } catch (_) {
    // The popup and settings page still provide the current state.
  }
}

chrome.runtime.onInstalled.addListener(syncActionIcon);
chrome.runtime.onStartup.addListener(syncActionIcon);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_EXPIRY_ALARM) syncActionIcon();
});
chrome.storage.onChanged.addListener(() => syncActionIcon());
syncActionIcon();
