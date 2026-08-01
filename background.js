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

/**
 * Puts the toolbar in `state`.
 *
 * The icon and the title are applied independently, and neither can prevent the
 * other. They used to sit in one `try` with the rest of `sync`, which meant a
 * single unreadable icon file took the title down with it and the toolbar quietly
 * stopped tracking Decaf altogether — quietly because the surrounding `catch` is
 * there to keep a failed sync from being noisy. A build that dropped one 32px PNG
 * did exactly that: switching Decaf off left the toolbar still saying "on", and
 * nothing anywhere said why. The title is the part a screen reader announces, so
 * it is the last thing that should be lost to a missing picture.
 */
async function show(state) {
  const problems = [];
  try {
    await chrome.action.setIcon({ path: ICONS[state] });
  } catch (error) {
    problems.push(`icon: ${error?.message || error}`);
  }
  try {
    await chrome.action.setTitle({ title: TITLES[state] });
  } catch (error) {
    problems.push(`title: ${error?.message || error}`);
  }
  // Said out loud in the worker's own console. A toolbar that has stopped
  // reporting the truth is worth one line in a log nobody has to read.
  if (problems.length) console.warn(`Decaf: the toolbar could not be set to "${state}" — ${problems.join("; ")}`);
}

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
      /*
       * A running Lock makes `mergeSettings` report `enabled` as true whatever is
       * actually stored, so a stored `enabled: false` looks identical to a stored
       * `enabled: true` on both sides of the patch above and never gets written
       * back. While the Lock ran that was harmless — every reader saw Decaf as on.
       * The moment it ended the masking stopped, the stale `false` surfaced, and
       * Decaf switched itself off everywhere: the exact opposite of what a Lock
       * promises, arriving hours after the thing that caused it. So the stored
       * value is put right explicitly.
       */
      if (repaired.enabled && stored.enabled !== true) patch.enabled = true;
      if (Object.keys(patch).length) await chrome.storage.local.set(patch);
      settings = repaired;
    } else if (baselineRaw) {
      await chrome.storage.local.remove(D.LOCK_BASELINE_KEY);
    }

    const state = D.isLocked(settings) ? "locked" : settings.enabled ? "on" : "off";
    await show(state);

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
