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

  const SWITCH_LABELS = {
    pauseFeeds: "Pause feeds",
    hideComments: "Hide comments and replies",
    upsideDown: "Turn media upside down",
    hideBadges: "Hide notification counts"
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
      try {
        await chrome.storage.local.set(patch);
      } catch (error) {
        // The switch is showing what the person just dragged it to and storage
        // disagrees. Put the page back rather than leave it claiming a change
        // that was never written.
        settings = latest;
        render();
        toast(`Not saved — ${error?.message || "storage is unavailable"}.`);
        return false;
      }
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
        if (D.isLocked(settings) && settings[key] && !input.checked) {
          render();
          toast("Lock is on until it ends.");
          return;
        }
        const [on, off] = NOTES[key] || ["Saved.", "Saved."];
        save({ [key]: input.checked }, input.checked ? on : off)
          .catch(() => toast("That change could not be saved."));
      });
    }
  }

  /** A row in the site list, for one of the twelve or one the person added. */
  function buildSiteRow(key, { label, summary, removable }) {
    const row = document.createElement("label");
    row.className = "site";
    row.dataset.site = key;

    const copy = document.createElement("span");
    copy.className = "site-copy";
    const name = document.createElement("strong");
    name.textContent = label;
    const detail = document.createElement("small");
    detail.textContent = summary;
    copy.append(name, detail);

    // A switch whose only state is a pale pill is invisible at low vision, and
    // the master switch was the only one that ever said "On" or "Off" in words.
    const state = document.createElement("span");
    state.className = "switch-label";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.site = key;
    input.setAttribute("aria-label", `Use Decaf on ${label}`);
    input.addEventListener("change", () => {
      if (D.isLocked(settings) && D.siteEnabled(settings, key) && !input.checked) {
        render();
        toast("Lock is on until it ends.");
        return;
      }
      save(sitePatch(key, input.checked), input.checked ? `Decaf is on for ${label}.` : `Decaf is off for ${label}.`)
        .catch(() => toast("That change could not be saved."));
    });

    const track = document.createElement("span");
    track.className = "switch-track";
    track.setAttribute("aria-hidden", "true");

    row.append(copy, state, input, track);
    if (removable) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button quiet remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        onRemoveCustom(key).catch(() => toast("That change could not be saved."));
      });
      row.append(remove);
    }
    siteInputs.set(key, { input, state });
    return row;
  }

  function sitePatch(key, value) {
    if (!D.isCustomKey(key)) return { sites: { ...settings.sites, [key]: value } };
    const host = D.customHost(key);
    return { custom: { ...settings.custom, [host]: { ...settings.custom[host], enabled: value } } };
  }

  function buildSites() {
    const container = $("sites");
    container.textContent = "";
    siteInputs.clear();
    for (const key of D.SITE_KEYS) {
      container.append(buildSiteRow(key, {
        label: D.SITES[key].label,
        summary: `Pauses ${D.SITES[key].feedSummary}`,
        removable: false
      }));
    }
    for (const host of Object.keys(settings?.custom || {})) {
      const key = D.customKey(host);
      container.append(buildSiteRow(key, {
        label: settings.custom[host].label,
        summary: `${host} — added by you, best-effort feed pausing`,
        removable: true
      }));
    }
  }

  /**
   * A radiogroup has one tab stop and the arrow keys move between its options.
   * These used to be three plain buttons, each its own tab stop, and the role was
   * assigned with `button.role = "radio"` — a JS property that reflects to the
   * attribute only from Chrome 119, fourteen versions above Decaf's floor. So on
   * a supported Chrome nothing announced which duration was about to be locked in
   * for thirty days.
   */
  function buildRadios(container, options, onChoose) {
    container.textContent = "";
    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.dataset.value = String(option.value);
      button.textContent = option.label;
      button.addEventListener("click", () => onChoose(option.value));
      container.append(button);
    }
    container.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(container.children);
      const current = buttons.findIndex((button) => button.getAttribute("aria-checked") === "true");
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      let index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current + step;
      if (index < 0) index = buttons.length - 1;
      if (index >= buttons.length) index = 0;
      onChoose(Number(buttons[index].dataset.value));
      container.children[index]?.focus();
    });
  }

  function paintRadios(container, value) {
    for (const button of container.children) {
      const checked = Number(button.dataset.value) === value;
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  }

  function lockSummary() {
    const keys = D.siteKeys(settings);
    const off = keys.filter((key) => !D.siteEnabled(settings, key)).map((key) => D.siteLabel(key, settings));
    const on = keys.length - off.length;
    return [
      settings.enabled ? "Decaf stays on" : "Decaf stays as it is",
      ...D.STRENGTH_KEYS.filter((key) => settings[key]).map((key) => `${SWITCH_LABELS[key]} stays on`),
      off.length ? `${on} of ${keys.length} sites — ${off.join(", ")} stay off` : `${on} of ${keys.length} sites`,
      "Every hold takes 4 seconds longer"
    ];
  }

  function render() {
    if (!settings) return;
    const locked = D.isLocked(settings);

    const master = $("master");
    master.checked = settings.enabled;
    master.setAttribute("aria-disabled", String(locked));
    master.setAttribute("aria-describedby", locked ? "lock-detail" : "");
    $("master-state").textContent = locked ? "Locked" : settings.enabled ? "On" : "Off";

    for (const [key, input] of switchInputs) {
      input.checked = Boolean(settings[key]);
      // A lock can be added to, never taken from. `aria-disabled` rather than
      // `disabled`, so the control stays in the tab order and carries its reason
      // instead of the page silently shrinking under a screen reader.
      const held = locked && Boolean(settings[key]);
      input.setAttribute("aria-disabled", String(held));
      input.setAttribute("aria-describedby", held ? "lock-detail" : "");
      const state = document.querySelector(`[data-state="${key}"]`);
      if (state) state.textContent = input.checked ? "On" : "Off";
    }

    for (const [key, { input, state }] of siteInputs) {
      input.checked = D.siteEnabled(settings, key);
      const held = locked && input.checked;
      input.setAttribute("aria-disabled", String(held));
      input.setAttribute("aria-describedby", held ? "lock-detail" : "");
      const snooze = D.snoozeUntil(settings, key);
      state.textContent = snooze
        ? `Off ${D.formatDuration(snooze - Date.now())}`
        : input.checked ? "On" : "Off";
    }

    paintRadios($("lock-choices"), chosenHours);
    $("lock-choices").hidden = locked;
    $("lock-button").hidden = locked;
    $("lock-cancel").hidden = !confirmingLock;
    $("lock-badge").textContent = locked ? `${D.formatDuration(settings.lockUntil - Date.now())} left` : "Off";
    $("lock-badge").classList.toggle("on", locked);
    $("lock-button").textContent = confirmingLock ? "Confirm lock" : "Lock";
    $("lock-detail").textContent = locked
      ? `Ends ${D.formatEndTime(settings.lockUntil)}. Nothing above can be switched off until then.`
      : confirmingLock
        ? `Lock Decaf for ${D.LOCK_DURATIONS.find((option) => option.hours === chosenHours)?.label}? This cannot be shortened or cancelled.`
        : "Holds these switches in place. You can add, not remove.";

    const summary = $("lock-summary");
    summary.hidden = !confirmingLock;
    if (confirmingLock) {
      summary.textContent = "";
      for (const line of lockSummary()) {
        const item = document.createElement("li");
        item.textContent = line;
        summary.append(item);
      }
    }

    const totals = D.passTotals(settings);
    $("meter").textContent = totals.week
      ? `${totals.today} today, ${totals.week} in the last seven days${totals.busiest ? ` · most on ${D.siteLabel(totals.busiest, settings)}` : ""}.`
      : "No passes yet.";

    $("intro").hidden = Boolean(settings.seenIntro);
    $("reset").disabled = locked;
  }

  async function refresh() {
    const next = await read();
    const sitesChanged = !settings ||
      Object.keys(next.custom).join() !== Object.keys(settings.custom).join();
    settings = next;
    if (sitesChanged) buildSites();
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

  /**
   * Adding a site asks Chrome for that one origin. The permission is optional and
   * per-origin on purpose: a blanket all-sites permission in the manifest would
   * show every person who installs Decaf a warning about every site they will
   * ever visit, for a feature most of them will never use.
   */
  async function onAddSite(event) {
    event.preventDefault();
    $("add-error").textContent = "";
    const raw = $("add-host").value;
    const host = D.asHost(raw);
    if (!host) {
      $("add-error").textContent = "That does not look like a website address.";
      return;
    }
    if (D.getSite(`https://${host}/`)) {
      $("add-error").textContent = "Decaf already covers that one — it is in the list above.";
      return;
    }
    if (Object.keys(settings.custom).length >= D.MAX_CUSTOM_SITES) {
      $("add-error").textContent = `Decaf holds ${D.MAX_CUSTOM_SITES} added sites at a time.`;
      return;
    }
    const origins = [D.customMatch(host)];
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins });
    } catch (error) {
      $("add-error").textContent = `Chrome refused that address — ${error?.message || "try another"}.`;
      return;
    }
    if (!granted) {
      $("add-error").textContent = "Decaf needs permission for that site to do anything on it.";
      return;
    }
    const next = D.addCustomSite(settings, host);
    if (!Object.hasOwn(next.custom, host)) {
      $("add-error").textContent = "That address could not be added.";
      return;
    }
    const saved = await save({ custom: next.custom }, `${host} added. Open it to see Decaf there.`);
    if (saved) {
      $("add-host").value = "";
      buildSites();
      render();
    }
  }

  async function onRemoveCustom(key) {
    const host = D.customHost(key);
    if (!host) return;
    const next = D.removeCustomSite(settings, host);
    const saved = await save({ custom: next.custom }, `${host} removed.`);
    if (!saved) return;
    try {
      await chrome.permissions.remove({ origins: [D.customMatch(host)] });
    } catch (_) {
      // Chrome keeps the grant; nothing runs there because the site is gone
      // from the list and the content script is unregistered with it.
    }
    buildSites();
    render();
  }

  /**
   * Back to the defaults, which is the one thing a settings page with no Save
   * button cannot otherwise offer: there is no draft to abandon, so a change
   * regretted five screens ago has to be undone switch by switch.
   */
  async function onReset() {
    if (D.isLocked(settings)) {
      toast("Lock is on until it ends.");
      return;
    }
    if ($("reset").dataset.confirming !== "true") {
      $("reset").dataset.confirming = "true";
      $("reset").textContent = "Confirm — this clears added sites too";
      return;
    }
    delete $("reset").dataset.confirming;
    $("reset").textContent = "Reset everything to defaults";
    const defaults = D.cloneDefaults();
    defaults.seenIntro = true;
    try {
      await chrome.storage.local.set(defaults);
    } catch (_) {
      toast("That change could not be saved.");
      return;
    }
    settings = D.mergeSettings(defaults);
    buildSites();
    render();
    toast("Back to the defaults.");
  }

  function buildIntroLinks() {
    const container = $("intro-links");
    for (const key of ["youtube", "instagram", "reddit"]) {
      const link = document.createElement("a");
      link.href = `https://${D.SITES[key].hosts.at(-1)}/`;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = D.SITES[key].label;
      container.append(link);
    }
  }

  function init() {
    $("version").textContent = `Version ${chrome.runtime.getManifest?.().version || ""}`.trim();
    bindSwitches();
    buildIntroLinks();
    buildRadios(
      $("lock-choices"),
      D.LOCK_DURATIONS.map((option) => ({ value: option.hours, label: option.label })),
      (value) => {
        chosenHours = value;
        confirmingLock = false;
        render();
      }
    );

    $("master").addEventListener("change", (event) => {
      const enabled = event.target.checked;
      if (D.isLocked(settings) && !enabled) {
        render();
        toast("Lock keeps Decaf on.");
        return;
      }
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
    $("add-form").addEventListener("submit", (event) => {
      onAddSite(event).catch(() => toast("That change could not be saved."));
    });
    $("reset").addEventListener("click", () => {
      onReset().catch(() => toast("That change could not be saved."));
    });
    $("intro-dismiss").addEventListener("click", () => {
      save({ seenIntro: true }).catch(() => toast("That change could not be saved."));
    });
    // Settings only: `clockSeen` and `lockBaseline` are bookkeeping this screen
    // never shows, and the worker rewrites the first on every run. See popup.js.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!Object.keys(changes).some((key) => Object.hasOwn(D.DEFAULT_SETTINGS, key))) return;
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
