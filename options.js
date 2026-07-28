(() => {
  "use strict";

  const D = globalThis.Decaf;
  const $ = (id) => document.getElementById(id);

  const NOTES = {
    pauseFeeds: ["Feeds are paused.", "Feeds stay visible, just quieter."],
    hideComments: ["Comment threads are hidden.", "Comment threads are back."],
    upsideDown: ["Media is turned over.", "Media is the right way up again."],
    hideBadges: ["Notification counts are hidden.", "Notification counts are muted, not hidden."]
  };

  let settings = null;
  let chosenHours = D.DEFAULT_LOCK_HOURS;
  let confirmingLock = false;
  let toastTimer = null;
  let ticker = null;
  const siteInputs = new Map();
  const switchInputs = new Map();

  function toast(text = "") {
    $("toast").textContent = text;
    clearTimeout(toastTimer);
    if (text) toastTimer = setTimeout(() => { $("toast").textContent = ""; }, 3200);
  }

  async function read() {
    return D.mergeSettings(await chrome.storage.local.get(D.DEFAULT_SETTINGS));
  }

  async function save(next, note = "") {
    const latest = await read();
    const requested = { ...latest, ...next };
    const candidate = D.mergeSettings(requested);
    if (D.isLocked(latest) && D.isWeakening(latest, requested)) {
      settings = latest;
      render();
      toast("Lock is on until it ends.");
      return false;
    }
    const patch = D.createStoragePatch(latest, candidate);
    if (Object.keys(patch).length) {
      if (Object.hasOwn(patch, "lockUntil") && patch.lockUntil) patch[D.LOCK_BASELINE_KEY] = candidate;
      await chrome.storage.local.set(patch);
    }
    settings = candidate;
    render();
    toast(note);
    return true;
  }

  function bindSwitches() {
    for (const input of document.querySelectorAll("input[data-setting]")) {
      const key = input.dataset.setting;
      switchInputs.set(key, input);
      input.addEventListener("change", () => {
        const [on, off] = NOTES[key] || ["Saved.", "Saved."];
        save({ [key]: input.checked }, input.checked ? on : off)
          .catch(() => toast("That change could not be saved."));
      });
    }
  }

  function buildSites() {
    const container = $("sites");
    for (const key of D.SITE_KEYS) {
      const definition = D.SITES[key];
      const row = document.createElement("label");
      row.className = "site";
      row.dataset.site = key;

      const copy = document.createElement("span");
      copy.className = "site-copy";
      const name = document.createElement("strong");
      name.textContent = definition.label;
      const summary = document.createElement("small");
      summary.textContent = `Pauses ${definition.feedSummary}`;
      copy.append(name, summary);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.site = key;
      input.setAttribute("aria-label", `Use Decaf on ${definition.label}`);
      input.addEventListener("change", () => {
        save(
          { sites: { ...settings.sites, [key]: input.checked } },
          input.checked ? `Decaf is on for ${definition.label}.` : `Decaf is off for ${definition.label}.`
        ).catch(() => toast("That change could not be saved."));
      });

      const track = document.createElement("span");
      track.className = "switch-track";
      track.setAttribute("aria-hidden", "true");

      row.append(copy, input, track);
      container.append(row);
      siteInputs.set(key, input);
    }
  }

  function buildLockChoices() {
    const container = $("lock-choices");
    for (const option of D.LOCK_DURATIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "radio";
      button.dataset.hours = String(option.hours);
      button.textContent = option.label;
      button.addEventListener("click", () => {
        chosenHours = option.hours;
        confirmingLock = false;
        render();
      });
      container.append(button);
    }
  }

  function render() {
    if (!settings) return;
    const locked = D.isLocked(settings);

    const master = $("master");
    master.checked = settings.enabled;
    master.disabled = locked;
    master.setAttribute("aria-label", settings.enabled ? "Turn Decaf off" : "Turn Decaf on");
    $("master-state").textContent = locked ? "Locked" : settings.enabled ? "On" : "Off";

    for (const [key, input] of switchInputs) {
      input.checked = Boolean(settings[key]);
      // A lock can be added to, never taken from.
      input.disabled = locked && Boolean(settings[key]);
    }

    for (const [key, input] of siteInputs) {
      input.checked = settings.sites[key];
      input.disabled = locked && settings.sites[key];
    }

    for (const button of $("lock-choices").children) {
      button.setAttribute("aria-checked", String(Number(button.dataset.hours) === chosenHours));
    }
    $("lock-choices").hidden = locked;
    $("lock-button").hidden = locked;
    $("lock-cancel").hidden = !confirmingLock;
    $("lock-badge").textContent = locked ? `${D.formatDuration(settings.lockUntil - Date.now())} left` : "Off";
    $("lock-badge").classList.toggle("on", locked);
    $("lock-button").textContent = confirmingLock ? "Confirm lock" : "Lock";
    $("lock-detail").textContent = locked
      ? `Ends ${D.formatEndTime(settings.lockUntil)}. Nothing above can be switched off until then.`
      : confirmingLock
        ? `Lock Decaf for ${D.LOCK_DURATIONS.find((option) => option.hours === chosenHours)?.label}? This cannot be undone.`
        : "Holds these switches in place. You can add, not remove.";
  }

  async function refresh() {
    settings = await read();
    render();
  }

  async function onLock() {
    if (!confirmingLock) {
      confirmingLock = true;
      render();
      return;
    }
    confirmingLock = false;
    const lockUntil = Date.now() + chosenHours * 3600000;
    await save({ enabled: true, lockUntil }, `Locked until ${D.formatEndTime(lockUntil)}.`);
  }

  function init() {
    $("version").textContent = `Version ${chrome.runtime.getManifest?.().version || ""}`.trim();
    bindSwitches();
    buildSites();
    buildLockChoices();

    $("master").addEventListener("change", (event) => {
      const enabled = event.target.checked;
      save({ enabled }, enabled ? "Decaf is on." : "Decaf is off everywhere.")
        .catch(() => toast("That change could not be saved."));
    });
    $("lock-button").addEventListener("click", () => {
      onLock().catch(() => toast("That change could not be saved."));
    });
    $("lock-cancel").addEventListener("click", () => {
      confirmingLock = false;
      render();
    });
    chrome.storage.onChanged.addListener(() => {
      refresh().catch(() => {});
    });
    ticker = setInterval(() => {
      if (settings && D.isLocked(settings)) render();
    }, 30000);
    window.addEventListener("pagehide", () => clearInterval(ticker), { once: true });
    refresh().catch(() => toast("Settings could not be loaded."));
  }

  init();
})();
