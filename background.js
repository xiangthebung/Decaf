/**
 * Decaf — service worker.
 *
 * Four jobs:
 *   1. Keep the toolbar honest about what Decaf is doing *on the tab you are
 *      looking at*, which is not the same thing as what it is doing globally.
 *   2. Make sure a running Lock cannot be weakened by a stale writer in a popup
 *      or settings tab, or by a clock that moved.
 *   3. Put Decaf into tabs that were already open when it was installed or
 *      updated, so it is not invisibly dead in the tab that prompted the install.
 *   4. Register content scripts for sites the person added themselves.
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
const CUSTOM_SCRIPT_ID = "decaf-custom";
const RUNTIME_FILES = { js: ["core.js", "content.js"], css: ["content.css"] };

/**
 * Puts the toolbar in `state`, for one tab or for every tab.
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
async function show(state, { tabId, title, badge = "" } = {}) {
  const scope = tabId === undefined ? {} : { tabId };
  const problems = [];
  try {
    await chrome.action.setIcon({ ...scope, path: ICONS[state] });
  } catch (error) {
    problems.push(`icon: ${error?.message || error}`);
  }
  try {
    await chrome.action.setTitle({ ...scope, title: title || TITLES[state] });
  } catch (error) {
    problems.push(`title: ${error?.message || error}`);
  }
  try {
    await chrome.action.setBadgeText({ ...scope, text: badge });
    if (badge) await chrome.action.setBadgeBackgroundColor({ ...scope, color: "#6f4e37" });
  } catch (_) {
    // A badge is the least important of the three.
  }
  // Said out loud in the worker's own console. A toolbar that has stopped
  // reporting the truth is worth one line in a log nobody has to read.
  if (problems.length) console.warn(`Decaf: the toolbar could not be set to "${state}" — ${problems.join("; ")}`);
}

/**
 * What the toolbar should say about one particular tab.
 *
 * The global state is the wrong answer nearly everywhere: it said "Decaf — on"
 * on a site the person had switched off, on every other page on the web where
 * the content script does not even run, and while a five-minute pass had the
 * feed wide open. The one always-visible surface Decaf has should be about the
 * page it is sitting above.
 */
function describeTab(settings, url, now = Date.now()) {
  const globalState = D.isLocked(settings, now) ? "locked" : settings.enabled ? "on" : "off";
  // No tab to describe — no window yet, or a URL Chrome will not share. The
  // global state is the only true thing left to say.
  if (!url) return { state: globalState, title: TITLES[globalState] };

  const site = D.getSite(url, settings);
  // Decaf does nothing here, so the toolbar should not imply that it does.
  if (!site) return { state: "off", title: "Decaf — not used on this page" };
  const label = D.siteLabel(site, settings);
  if (!settings.enabled) return { state: "off", title: "Decaf — off everywhere" };

  const snooze = D.snoozeUntil(settings, site, now);
  if (snooze) {
    return {
      state: "off",
      title: `Decaf — off for ${label} for another ${D.formatDuration(snooze - now)}`
    };
  }
  if (!D.siteEnabled(settings, site)) return { state: "off", title: `Decaf — off for ${label}` };

  const pass = D.passUntil(settings, site, now);
  if (pass) {
    return {
      state: "on",
      title: `Decaf — ${label} feed open, ${D.formatClock(pass - now)} left`,
      badge: String(Math.max(1, Math.ceil((pass - now) / 60000)))
    };
  }
  if (D.isLocked(settings, now)) return { state: "locked", title: `Decaf — locked, on for ${label}` };
  return { state: "on", title: `Decaf — on for ${label}` };
}

async function readSettings() {
  const stored = await chrome.storage.local.get({
    ...D.DEFAULT_SETTINGS,
    [D.LOCK_BASELINE_KEY]: null,
    [D.CLOCK_SEEN_KEY]: 0
  });
  const baselineRaw = stored[D.LOCK_BASELINE_KEY];
  const clockSeen = Number(stored[D.CLOCK_SEEN_KEY]) || 0;
  delete stored[D.LOCK_BASELINE_KEY];
  delete stored[D.CLOCK_SEEN_KEY];
  return { stored, baselineRaw, clockSeen };
}

async function paintTab(tabId, url, settings) {
  if (typeof tabId !== "number") return;
  const description = describeTab(settings, url);
  await show(description.state, { tabId, title: description.title, badge: description.badge });
}

/** Repaints the tab in front of the person, whichever that is. */
async function paintActiveTab(settings) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) await paintTab(tab.id, tab.url, settings);
  } catch (_) {
    // No window, or no permission to read this one. The default icon stands.
  }
}

async function sync() {
  try {
    const { stored, baselineRaw, clockSeen } = await readSettings();
    const now = Date.now();

    let settings = D.mergeSettings(stored, now);
    const baseline = baselineRaw ? D.mergeSettings(baselineRaw, now) : null;

    /*
     * A clock rolled forward past `lockUntil` and back again used to end the Lock
     * permanently: the baseline was deleted the moment it looked expired, every
     * switch could then be turned off, and when the clock came back the Lock was
     * "running" again with no floor left to enforce — still claiming to hold
     * everything, holding nothing. So the high-water mark of every time the
     * worker has run is kept, the Lock is only over once real time has passed
     * it, and the baseline is never deleted while the Lock is live.
     */
    const seen = Math.max(clockSeen, now);
    const lockOver = settings.lockUntil > 0 && now >= settings.lockUntil && seen >= settings.lockUntil;

    if (baseline && D.isLocked(baseline, now)) {
      const repaired = D.repairLocked(baseline, settings, now);
      const patch = D.createStoragePatch(settings, repaired, now);
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
      // A Lock can be added to, and what is added is then held too — otherwise a
      // switch turned on during a Lock was the one thing the Lock did not cover.
      const raised = D.raiseBaseline(baseline, repaired, now);
      if (JSON.stringify(raised) !== JSON.stringify(baseline)) patch[D.LOCK_BASELINE_KEY] = raised;
      if (Object.keys(patch).length) await chrome.storage.local.set(patch);
      settings = repaired;
    } else if (lockOver) {
      // Only once the Lock is genuinely over: zero the timestamp so a clock that
      // moves backwards cannot resurrect it, and let the baseline go with it.
      await chrome.storage.local.set({ lockUntil: 0 });
      await chrome.storage.local.remove(D.LOCK_BASELINE_KEY);
      settings = D.mergeSettings({ ...stored, lockUntil: 0 }, now);
    } else if (baselineRaw && !settings.lockUntil) {
      await chrome.storage.local.remove(D.LOCK_BASELINE_KEY);
    }

    if (seen !== clockSeen) await chrome.storage.local.set({ [D.CLOCK_SEEN_KEY]: seen });

    /*
     * Global first, then the tab in front. The per-tab painting only ever
     * reaches tabs whose events the worker was awake to see; the global state
     * is what every other context shows, and skipping it left the toolbar on
     * the manifest's bare "Decaf" — a title that says nothing — everywhere the
     * per-tab pass had not been.
     */
    const globalState = D.isLocked(settings, now) ? "locked" : settings.enabled ? "on" : "off";
    await show(globalState);
    await paintActiveTab(settings);

    await chrome.alarms.clear(LOCK_ALARM);
    if (D.isLocked(settings, now)) {
      await chrome.alarms.create(LOCK_ALARM, { when: settings.lockUntil + 250 });
    }
    return settings;
  } catch (error) {
    // The popup and settings page always show the real state on open, so this is
    // never the only chance to be right — but silence here is how a failed Lock
    // repair used to go unnoticed until the next write.
    console.warn(`Decaf: could not sync — ${error?.message || error}`);
    return null;
  }
}

/**
 * Puts Decaf into pages that are already open.
 *
 * Without this, installing Decaf from a YouTube tab does nothing to that tab —
 * the extension works perfectly and looks completely broken, at the one moment
 * someone decides whether to keep it. The same gap opens after every update,
 * when Chrome tears the old content script out of every tab and puts nothing
 * back until the next navigation.
 */
async function injectExistingTabs(settings) {
  const patterns = [...D.MATCHES, ...Object.keys(settings?.custom || {}).map(D.customMatch).filter(Boolean)];
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: patterns });
  } catch (_) {
    return;
  }
  for (const tab of tabs) {
    if (typeof tab.id !== "number") continue;
    try {
      // CSS first: the stylesheet is what actually empties a feed, and arriving
      // after the runtime would show one frame of the thing being hidden.
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: RUNTIME_FILES.css });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: RUNTIME_FILES.js });
    } catch (_) {
      // A tab that is discarded, or on a page Chrome will not script, is simply
      // left for its next navigation to pick up.
    }
  }
}

/**
 * Content scripts for sites the person added. These are registered at runtime
 * because the manifest cannot know them, and they carry no site table — the
 * shape-based feed finder in content.js is the whole of their feed detection.
 */
async function syncCustomScripts(settings) {
  const matches = Object.keys(settings?.custom || {}).map(D.customMatch).filter(Boolean);
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
    if (!matches.length) return;
    await chrome.scripting.registerContentScripts([{
      id: CUSTOM_SCRIPT_ID,
      matches,
      js: RUNTIME_FILES.js,
      css: RUNTIME_FILES.css,
      runAt: "document_start",
      allFrames: false
    }]);
  } catch (_) {
    // A host the person has not granted, or a pattern Chrome refuses. The site
    // list in settings already tells them the permission is what makes it work.
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await sync();
  await syncCustomScripts(settings);
  if (details.reason === "install" || details.reason === "update") await injectExistingTabs(settings);
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await sync();
  await syncCustomScripts(settings);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // `clockSeen` is written by `sync` itself; reacting to it would loop forever.
  const keys = Object.keys(changes).filter((key) => key !== D.CLOCK_SEEN_KEY);
  if (!keys.length) return;
  sync().then((settings) => {
    if (Object.hasOwn(changes, "custom")) return syncCustomScripts(settings);
    return null;
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM) sync();
});

/** The toolbar follows the tab in front of you, so every way that changes counts. */
async function repaint(tabId, url) {
  try {
    const { stored } = await readSettings();
    const settings = D.mergeSettings(stored);
    if (tabId === undefined) await paintActiveTab(settings);
    else await paintTab(tabId, url, settings);
  } catch (_) {
    // Nothing to say about a tab that cannot be read.
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await repaint(tabId, tab?.url);
  } catch (_) {
    await repaint(tabId, "");
  }
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (!change.url && change.status !== "complete") return;
  repaint(tabId, change.url || tab?.url);
});

chrome.windows?.onFocusChanged?.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  repaint();
});

/**
 * The in-page card has no other way to reach the settings screen, and the card
 * is the only Decaf surface most people will ever see. Anyone who cannot sustain
 * a press needs one click from there to the switch that turns the site off.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "open-options") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return false;
});

chrome.commands?.onCommand?.addListener((command) => {
  if (command === "open-settings") chrome.runtime.openOptionsPage();
});

sync();
