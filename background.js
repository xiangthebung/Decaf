/**
 * Decaf — service worker.
 *
 * Keeps the toolbar icon honest about the current state and makes sure a running
 * Lock cannot be weakened by a stale writer in a popup or settings tab.
 */
importScripts("core.js");

const D = globalThis.Decaf;

const ICONS = {
  on: {
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

const TITLES = {
  on: "Decaf — on",
  off: "Decaf — off",
  locked: "Decaf — locked"
};

const LOCK_ALARM = "decaf-lock-expiry";

async function sync() {
  try {
    const stored = await chrome.storage.local.get({
      ...D.DEFAULT_SETTINGS,
      [D.LOCK_BASELINE_KEY]: null
    });
    const baselineRaw = stored[D.LOCK_BASELINE_KEY];
    delete stored[D.LOCK_BASELINE_KEY];

    let settings = D.mergeSettings(stored);
    const baseline = baselineRaw ? D.mergeSettings(baselineRaw) : null;

    if (baseline && D.isLocked(baseline)) {
      const repaired = D.repairLocked(baseline, settings);
      const patch = D.createStoragePatch(settings, repaired);
      if (Object.keys(patch).length) await chrome.storage.local.set(patch);
      settings = repaired;
    } else if (baselineRaw) {
      await chrome.storage.local.remove(D.LOCK_BASELINE_KEY);
    }

    const state = D.isLocked(settings) ? "locked" : settings.enabled ? "on" : "off";
    await chrome.action.setIcon({ path: ICONS[state] });
    await chrome.action.setTitle({ title: TITLES[state] });

    await chrome.alarms.clear(LOCK_ALARM);
    if (D.isLocked(settings)) {
      await chrome.alarms.create(LOCK_ALARM, { when: settings.lockUntil + 250 });
    }
  } catch (_) {
    // The popup and settings page always show the real state on open.
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await sync();
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") sync();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM) sync();
});

sync();
