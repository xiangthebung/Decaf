(() => {
  const U = globalThis.UnaddictifySettings;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  let savedSettings = null;
  let draftSettings = null;
  let dirty = false;
  let toastTimer = null;
  let lockTimer = null;
  let countdownTimer = null;
  let celebrationTimer = null;
  let expectedStorage = null;

  const SITE_CONTROL_GROUPS = [
    {
      title: "Social feeds",
      description: "Reduce the most common feed, recommendation, and comment cues.",
      sites: ["instagram", "reddit", "x", "facebook", "threads"]
    },
    {
      title: "Video & live",
      description: "Reduce short-form discovery and live-stream pull while keeping intentional viewing available.",
      sites: ["youtube", "tiktok", "twitch"]
    },
    {
      title: "Visual discovery",
      description: "Reduce recommendation loops and popularity signals in image-first products.",
      sites: ["pinterest", "snapchat"]
    },
    {
      title: "Work & messaging",
      description: "These controls are off by default because the sites can also be useful for direct tasks and communication.",
      sites: ["discord", "google", "linkedin", "whatsapp", "messenger"]
    }
  ];

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("visible");
      toast.textContent = "";
    }, 3500);
  }

  function settingsKey(value) {
    return JSON.stringify(U.mergeSettings(value));
  }

  function setNested(target, path, value) {
    const [site, key] = path.split(".");
    return {
      ...target,
      siteSettings: {
        ...target.siteSettings,
        [site]: { ...target.siteSettings[site], [key]: value }
      }
    };
  }

  function formatCountdown(timestamp) {
    const minutes = Math.max(1, Math.ceil((timestamp - Date.now()) / 60_000));
    if (minutes < 60) return `${minutes}m remaining`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours < 24) return remainder ? `${hours}h ${remainder}m remaining` : `${hours}h remaining`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours ? `${days}d ${remainingHours}h remaining` : `${days}d remaining`;
  }

  function formatEndTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const dateLabel = date.toDateString() === now.toDateString()
      ? "today"
      : date.toDateString() === tomorrow.toDateString()
        ? "tomorrow"
        : date.toLocaleDateString([], { month: "short", day: "numeric" });
    const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `Ends ${dateLabel} at ${timeLabel}`;
  }

  function celebrateLock() {
    const status = $("#focus-lock-header");
    status.classList.remove("just-locked");
    void status.offsetWidth;
    status.classList.add("just-locked");
    window.clearTimeout(celebrationTimer);
    celebrationTimer = window.setTimeout(() => status.classList.remove("just-locked"), 900);
  }

  function groupSiteSpecificControls() {
    const container = $$(".site-details .site-panels").find((element) => element.querySelector("[data-site-panel]"));
    if (!container || container.dataset.grouped === "true") return;
    const panels = new Map([...container.querySelectorAll("[data-site-panel]")].map((panel) => [panel.dataset.sitePanel, panel]));
    container.replaceChildren();
    for (const group of SITE_CONTROL_GROUPS) {
      const section = document.createElement("section");
      section.className = "site-control-group";
      const heading = document.createElement("h3");
      heading.textContent = group.title;
      const description = document.createElement("p");
      description.className = "site-control-description";
      description.textContent = group.description;
      const grid = document.createElement("div");
      grid.className = "site-control-grid";
      for (const site of group.sites) {
        const panel = panels.get(site);
        if (panel) {
          const summary = panel.querySelector(":scope > summary");
          const mark = summary?.querySelector(".summary-mark");
          if (summary && mark && !summary.querySelector(".site-panel-state")) {
            const state = document.createElement("span");
            state.className = "site-panel-state";
            state.dataset.sitePanelState = site;
            summary.insertBefore(state, mark);
          }
          grid.append(panel);
        }
      }
      section.append(heading, description, grid);
      container.append(section);
    }
    container.dataset.grouped = "true";
  }

  function updateDraft(next) {
    if (!savedSettings) return false;
    const merged = U.mergeSettings(next);
    if (U.isLocked(savedSettings) && U.isWeakeningChange(savedSettings, merged)) {
      render();
      return false;
    }
    draftSettings = merged;
    dirty = settingsKey(draftSettings) !== settingsKey(savedSettings);
    render();
    return true;
  }

  function setLockedAppearance(input, locked, protectedValue) {
    const label = input.closest?.("label");
    const isProtected = locked && Boolean(protectedValue);
    input.disabled = isProtected;
    label?.classList.toggle("locked-control", isProtected);
    if (isProtected) {
      input.title = "Protected by Focus lock until it expires.";
      input.setAttribute("aria-describedby", "lock-description focus-lock-header");
      if (label) label.title = input.title;
    } else {
      input.removeAttribute?.("title");
      input.removeAttribute?.("aria-describedby");
      if (label) label.removeAttribute?.("title");
    }
  }

  function applyLockedAppearance(locked) {
    setLockedAppearance($("#global-enabled"), locked, savedSettings.enabled);
    for (const input of $$('[data-site]')) setLockedAppearance(input, locked, savedSettings.sites[input.dataset.site]);
    for (const input of $$('[data-feature]')) {
      if (input.type === "range") continue;
      setLockedAppearance(input, locked, savedSettings.features[input.dataset.feature]);
    }
    for (const input of $$('[data-site-setting]')) {
      const [site, key] = input.dataset.siteSetting.split(".");
      const value = Boolean(savedSettings.siteSettings?.[site]?.[key]);
      setLockedAppearance(input, locked, value);
    }

    const monochrome = Number(savedSettings.features.monochrome) || 0;
    const range = $("#monochrome");
    const rangeRow = range.closest?.(".range-row");
    const defaultMin = range.dataset.defaultMin || range.min || "0";
    range.dataset.defaultMin = defaultMin;
    range.min = locked ? String(monochrome) : defaultMin;
    const monochromeFullyProtected = locked && monochrome >= 100;
    range.disabled = monochromeFullyProtected;
    rangeRow?.classList.toggle("locked-control", monochromeFullyProtected);
    rangeRow?.classList.toggle("locked-floor", locked && monochrome > 0);
    range.title = locked && monochrome > 0
      ? "Monochrome cannot be lowered while Focus lock is active."
      : "";

    const cooldown = $("#bypass-cooldown");
    for (const option of cooldown.options || []) {
      option.disabled = locked && Number(option.value) < Number(savedSettings.bypassCooldownHours);
    }
    cooldown.classList.toggle("locked-floor", locked);
    cooldown.title = locked ? "Shorter break cooldowns are protected until the lock expires." : "";
  }

  function render() {
    if (!draftSettings || !savedSettings) return;

    $("#global-enabled").checked = draftSettings.enabled;
    $("#global-enabled-state").textContent = draftSettings.enabled ? "On" : "Off";
    $("#global-enabled-state").classList.toggle("off", !draftSettings.enabled);
    const enabledSiteCount = Object.values(draftSettings.sites).filter(Boolean).length;
    const totalSiteCount = Object.keys(draftSettings.sites).length;
    $("#site-coverage-summary").textContent = `${enabledSiteCount} of ${totalSiteCount} sites selected`;
    for (const input of $$('[data-site]')) input.checked = Boolean(draftSettings.sites[input.dataset.site]);
    for (const input of $$('[data-feature]')) {
      const value = draftSettings.features[input.dataset.feature];
      if (input.type === "range") {
        input.value = String(value);
        $("#monochrome-value").textContent = `${value}%`;
      } else {
        input.checked = Boolean(value);
      }
    }
    for (const input of $$('[data-site-setting]')) {
      const [site, key] = input.dataset.siteSetting.split(".");
      input.checked = Boolean(draftSettings.siteSettings?.[site]?.[key]);
    }
    for (const panel of $$('[data-site-panel]')) {
      const site = panel.dataset.sitePanel;
      const active = Boolean(draftSettings.sites[site]);
      const state = panel.querySelector(".site-panel-state");
      if (state) {
        state.textContent = active ? "On" : "Off";
        state.classList.toggle("off", !active);
      }
      panel.classList.toggle("site-panel-off", !active);
    }

    const locked = U.isLocked(savedSettings);
    const modeEnabled = Boolean(draftSettings.enabled);
    const modeLocked = locked && Boolean(savedSettings.enabled);
    const modeStatus = $("#focus-lock-header");
    const modeIcon = $("#focus-lock-header-icon");
    const modeTitle = $("#focus-lock-header-title");
    document.body.classList.toggle("mode-active", modeEnabled && !modeLocked);
    document.body.classList.toggle("mode-off", !modeEnabled && !modeLocked);
    document.body.classList.toggle("mode-locked", modeLocked);
    modeStatus.classList.toggle("active", modeEnabled && !modeLocked);
    modeStatus.classList.toggle("off", !modeEnabled && !modeLocked);
    modeStatus.classList.toggle("locked", modeLocked);
    modeStatus.classList.toggle("pending", dirty && !modeLocked);
    if (modeLocked) {
      modeIcon.textContent = "🔒";
      modeTitle.textContent = "Focus Lock active";
      $("#focus-lock-header-countdown").textContent = formatCountdown(savedSettings.lockUntil);
      $("#focus-lock-header-copy").textContent = `${formatEndTime(savedSettings.lockUntil)} · Cannot be disabled.`;
    } else if (modeEnabled) {
      modeIcon.textContent = "✓";
      modeTitle.textContent = dirty ? "blokamine ready to save" : "blokamine active";
      $("#focus-lock-header-countdown").textContent = "";
      $("#focus-lock-header-copy").textContent = dirty
        ? "Save changes to apply this mode."
        : "Focus Lock can protect these settings.";
    } else {
      modeIcon.textContent = "○";
      modeTitle.textContent = "blokamine off";
      $("#focus-lock-header-countdown").textContent = "";
      $("#focus-lock-header-copy").textContent = dirty
        ? "Save changes to turn it off."
        : "Turn it on to start reducing reward cues.";
    }
    if (!$("#lock-duration").value) $("#lock-duration").value = String(U.DEFAULT_LOCK_DURATION_HOURS);
    const pendingDuration = Number($("#lock-duration").value) || 0;
    $("#lock-badge").textContent = locked ? "locked" : "unlocked";
    $("#lock-badge").classList.toggle("locked", locked);
    $("#lock-description").textContent = locked
      ? `${U.formatUntil(savedSettings.lockUntil)} Focus Lock is active. blokamine cannot be disabled or weakened until it expires. You can still add friction.`
      : "Keep your current settings in place until a chosen time. YouTube videos can be approved with one click in the player.";
    $("#bypass-cooldown").value = String(draftSettings.bypassCooldownHours);
    // Configuration remains editable while locked; only activation is disabled.
    $("#lock-duration").disabled = false;
    $("#bypass-cooldown").disabled = false;
    $("#lock-button").textContent = locked ? "Focus lock active" : "Activate focus lock";
    $("#lock-button").disabled = locked || pendingDuration === 0;
    $("#lock-button").title = locked ? "This Focus lock is already active." : "";
    applyLockedAppearance(locked);
    const globalLocked = modeLocked;
    $("#global-enabled-state").textContent = globalLocked ? "Locked" : draftSettings.enabled ? "On" : "Off";
    $("#global-enabled-state").classList.toggle("locked", globalLocked);
    $("#global-enabled-state").classList.toggle("off", !globalLocked && !draftSettings.enabled);

    $("#save-state").textContent = dirty ? "Unsaved changes" : "All changes saved";
    // Keep one stable action label; the status text communicates whether it is needed.
    $("#save-button").textContent = "Save changes";
    $("#save-button").disabled = !dirty;
    $("#save-button").classList.toggle("dirty", dirty);
    document.title = dirty ? "Unsaved changes · blokamine" : "blokamine settings";

    let warning = "";
    if (locked) {
      warning = "Focus Lock is active. Blokamine cannot be disabled or weakened until it expires; you can still add friction.";
    } else if (pendingDuration) {
      warning = "When activated, settings you save cannot be weakened until the lock expires.";
    } else if (dirty) {
      warning = "You have unsaved changes. Save before leaving this page.";
    }
    $("#save-warning").textContent = warning;

    window.clearTimeout(lockTimer);
    lockTimer = locked
      ? window.setTimeout(readSettings, Math.min(2147483647, Math.max(50, savedSettings.lockUntil - Date.now() + 50)))
      : null;
  }

  async function readSettings() {
    const next = U.mergeSettings(await chrome.storage.local.get(U.DEFAULT_SETTINGS));
    const nextKey = settingsKey(next);
    const expected = expectedStorage;
    expectedStorage = null;
    if (expected && expected === nextKey) {
      savedSettings = next;
      draftSettings = U.mergeSettings(next);
      dirty = false;
      render();
      return;
    }
    if (dirty && savedSettings && nextKey !== settingsKey(savedSettings)) {
      dirty = false;
      showToast("Settings changed elsewhere; your draft was reset.");
      savedSettings = next;
      draftSettings = U.mergeSettings(next);
      render();
      return;
    }
    savedSettings = next;
    if (!dirty) draftSettings = U.mergeSettings(next);
    render();
  }

  async function saveDraft({ activateLock = false } = {}) {
    if (!draftSettings || !savedSettings) return false;
    const locked = U.isLocked(savedSettings);
    const next = U.mergeSettings(draftSettings);
    if (locked && U.isWeakeningChange(savedSettings, next)) {
      render();
      return false;
    }

    if (activateLock) {
      if (locked) {
        showToast("Focus lock is already active.");
        return false;
      }
      const hours = Number($("#lock-duration").value);
      if (!hours) {
        showToast("Choose a lock duration first.");
        return false;
      }
      const youtubeApprovalEnabled = next.sites.youtube && next.siteSettings.youtube.requireVideoApproval;
      next.enabled = true;
      const confirmed = window.confirm(
        `Activate Focus Lock? Protected settings cannot be weakened until it expires.${
          youtubeApprovalEnabled ? " On YouTube, each video will pause with a one-click option to play it." : ""
        }`
      );
      if (!confirmed) return false;
      next.lockUntil = Date.now() + hours * 60 * 60 * 1000;
    } else {
      // The normal Save button never changes an already-active lock.
      next.lockUntil = savedSettings.lockUntil;
    }

    if (locked && U.isWeakeningChange(savedSettings, next)) {
      render();
      return false;
    }

    const normalized = U.mergeSettings(next);
    expectedStorage = settingsKey(normalized);
    try {
      await chrome.storage.local.set(normalized);
    } catch (_) {
      expectedStorage = null;
      showToast("Changes could not be saved.");
      return false;
    }
    expectedStorage = null;
    savedSettings = normalized;
    draftSettings = U.mergeSettings(normalized);
    dirty = false;
    render();
    if (activateLock) celebrateLock();
    showToast(activateLock ? `Focus Lock enabled. You're protected until ${formatEndTime(normalized.lockUntil)}.` : "Changes saved.");
    return true;
  }

  function setFeature(input) {
    const value = input.type === "range" ? Number(input.value) : input.checked;
    updateDraft({ ...draftSettings, features: { ...draftSettings.features, [input.dataset.feature]: value } });
  }

  function setSite(input) {
    updateDraft({ ...draftSettings, sites: { ...draftSettings.sites, [input.dataset.site]: input.checked } });
  }

  function setSiteSetting(input) {
    updateDraft(setNested(draftSettings, input.dataset.siteSetting, input.checked));
  }

  function setBypassCooldown(input) {
    updateDraft({ ...draftSettings, bypassCooldownHours: Number(input.value) });
  }

  async function init() {
    groupSiteSpecificControls();
    await readSettings();
    $("#global-enabled").addEventListener("change", (event) => {
      if (!event.target.checked && !window.confirm("Turn off blokamine on every supported site?")) {
        render();
        return;
      }
      updateDraft({ ...draftSettings, enabled: event.target.checked });
    });
    for (const input of $$('[data-feature]')) {
      if (input.type === "range") {
        input.addEventListener("input", () => {
          $("#monochrome-value").textContent = `${input.value}%`;
        });
      }
      input.addEventListener("change", () => setFeature(input));
    }
    for (const input of $$('[data-site]')) input.addEventListener("change", () => setSite(input));
    for (const input of $$('[data-site-setting]')) input.addEventListener("change", () => setSiteSetting(input));
    $("#lock-duration").addEventListener("change", () => render());
    $("#bypass-cooldown").addEventListener("change", (event) => setBypassCooldown(event.target));
    $("#lock-button").addEventListener("click", () => saveDraft({ activateLock: true }));
    $("#save-button").addEventListener("click", () => saveDraft());
    window.addEventListener("beforeunload", (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    chrome.storage.onChanged.addListener(readSettings);
    countdownTimer = window.setInterval(() => {
      if (savedSettings && U.isLocked(savedSettings)) render();
    }, 1000);
  }

  init().catch(() => showToast("Settings could not be loaded."));
})();
