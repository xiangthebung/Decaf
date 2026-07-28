(() => {
  "use strict";

  const D = globalThis.Decaf;
  const $ = (id) => document.getElementById(id);

  let settings = null;
  let site = null;
  let route = "";
  let chosenHours = D.DEFAULT_LOCK_HOURS;
  let confirmingLock = false;
  let ticker = null;

  function message(text = "") {
    $("message").textContent = text;
  }

  async function read() {
    return D.mergeSettings(await chrome.storage.local.get(D.DEFAULT_SETTINGS));
  }

  /**
   * Writes only what changed, and refuses anything a running Lock protects.
   * Returns true when the change was saved.
   */
  async function save(next, note = "") {
    const latest = await read();
    const requested = { ...latest, ...next };
    const candidate = D.mergeSettings(requested);
    if (D.isLocked(latest) && D.isWeakening(latest, requested)) {
      settings = latest;
      render();
      message("Lock is on until it ends.");
      return false;
    }
    const patch = D.createStoragePatch(latest, candidate);
    if (Object.keys(patch).length) {
      if (Object.hasOwn(patch, "lockUntil") && patch.lockUntil) patch[D.LOCK_BASELINE_KEY] = candidate;
      await chrome.storage.local.set(patch);
    }
    settings = candidate;
    render();
    message(note);
    return true;
  }

  function renderLockChoices() {
    const container = $("lock-choices");
    if (container.children.length) {
      for (const button of container.children) {
        button.setAttribute("aria-checked", String(Number(button.dataset.hours) === chosenHours));
      }
      return;
    }
    for (const option of D.LOCK_DURATIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "radio";
      button.dataset.hours = String(option.hours);
      button.textContent = option.label;
      button.setAttribute("aria-checked", String(option.hours === chosenHours));
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
    const supported = Boolean(site);
    const active = D.isActiveForSite(settings, site);
    const passUntil = supported ? D.passUntil(settings, site) : 0;

    const master = $("master");
    master.checked = settings.enabled;
    master.disabled = locked;
    master.setAttribute("aria-label", settings.enabled ? "Turn Decaf off" : "Turn Decaf on");
    $("master-state").textContent = locked ? "Locked" : settings.enabled ? "On" : "Off";

    $("site-card").hidden = !supported;
    $("unsupported").hidden = supported;
    if (supported) {
      const definition = D.SITES[site];
      $("site-name").textContent = definition.label;
      const badge = $("site-badge");
      badge.textContent = passUntil ? "Feed open" : active ? "On" : "Off";
      badge.classList.toggle("on", active && !passUntil);
      badge.classList.toggle("pass", Boolean(passUntil));
      $("site-detail").textContent = !active
        ? `Decaf is off here. ${definition.label} behaves normally.`
        : !settings.pauseFeeds
          ? "Grayscale media, no reward counts, calm badges."
          : passUntil
            ? `${definition.feedSummary} are open for now.`
            : route === "feed"
              ? "This feed is paused. Hold the button on the page to open it for 5 minutes."
              : `Paused: ${definition.feedSummary}.`;
      $("site-enable").hidden = active;
      $("pass-row").hidden = !passUntil;
      if (passUntil) $("pass-time").textContent = `Feed open · ${D.formatClock(passUntil - Date.now())} left`;
    }

    renderLockChoices();
    $("lock-choices").hidden = locked;
    $("lock-button").hidden = locked;
    $("lock-cancel").hidden = !confirmingLock;
    if (locked) {
      $("lock-title").textContent = `Locked · ${D.formatDuration(settings.lockUntil - Date.now())} left`;
      $("lock-detail").textContent = `Ends ${D.formatEndTime(settings.lockUntil)}. Decaf stays on until then.`;
    } else {
      $("lock-title").textContent = "Lock";
      $("lock-detail").textContent = confirmingLock
        ? `Lock Decaf for ${D.LOCK_DURATIONS.find((option) => option.hours === chosenHours)?.label}? This cannot be shortened.`
        : "Holds every Decaf setting in place until it ends.";
      $("lock-button").textContent = confirmingLock ? "Confirm lock" : "Lock";
    }
  }

  async function refresh() {
    settings = await read();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      site = D.getSite(tab?.url);
      route = D.getRoute(tab?.url);
    } catch (_) {
      site = null;
      route = "";
    }
    render();
  }

  async function onMaster(event) {
    const enabled = event.target.checked;
    if (!enabled && D.isLocked(settings)) {
      render();
      message("Lock keeps Decaf on.");
      return;
    }
    await save({ enabled }, enabled ? "Decaf is on." : "Decaf is off everywhere.");
  }

  async function onEnableHere() {
    if (!site) return;
    await save(
      { enabled: true, sites: { ...settings.sites, [site]: true } },
      `Decaf is on for ${D.siteLabel(site)}.`
    );
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

  async function onEndPass() {
    if (!site) return;
    const next = D.endPass(settings, site);
    await chrome.storage.local.set(D.createStoragePatch(settings, next));
    settings = next;
    render();
    message("Feed paused again.");
  }

  function init() {
    $("master").addEventListener("change", (event) => {
      onMaster(event).catch(() => message("That change could not be saved."));
    });
    $("site-enable").addEventListener("click", () => {
      onEnableHere().catch(() => message("That change could not be saved."));
    });
    $("pass-end").addEventListener("click", () => {
      onEndPass().catch(() => message("That change could not be saved."));
    });
    $("lock-button").addEventListener("click", () => {
      onLock().catch(() => message("That change could not be saved."));
    });
    $("lock-cancel").addEventListener("click", () => {
      confirmingLock = false;
      render();
    });
    $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
    chrome.storage.onChanged.addListener(() => {
      refresh().catch(() => {});
    });
    ticker = setInterval(() => {
      if (settings && (D.isLocked(settings) || (site && D.passUntil(settings, site)))) render();
    }, 1000);
    window.addEventListener("pagehide", () => clearInterval(ticker), { once: true });
    refresh().catch(() => message("Settings could not be loaded."));
  }

  init();
})();
