(() => {
  const U = globalThis.UnaddictifySettings;
  const $ = (selector) => document.querySelector(selector);
  const BREAK_CODE_LENGTH = 6;
  const BREAK_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let settings = null;
  let currentSite = null;
  let countdownTimer = null;
  let celebrationTimer = null;
  let breakCode = "";
  let breakCodeLockUntil = 0;

  function setMessage(message = "") {
    $("#message").textContent = message;
  }

  function formatDuration(timestamp) {
    const minutes = Math.max(1, Math.ceil((timestamp - Date.now()) / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours < 24) return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function formatRemaining(timestamp) {
    return `${formatDuration(timestamp)} left`;
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
    const banner = $("#focus-lock-banner");
    banner.classList.remove("just-locked");
    void banner.offsetWidth;
    banner.classList.add("just-locked");
    window.clearTimeout(celebrationTimer);
    celebrationTimer = window.setTimeout(() => banner.classList.remove("just-locked"), 900);
  }

  function createBreakCode() {
    const values = new Uint32Array(BREAK_CODE_LENGTH);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
    else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * 2 ** 32); });
    return Array.from(values, (value) => BREAK_CODE_ALPHABET[value % BREAK_CODE_ALPHABET.length]).join("");
  }

  function ensureBreakCode() {
    if (!settings || !U.isLocked(settings)) {
      breakCode = "";
      breakCodeLockUntil = 0;
      return;
    }
    if (!breakCode || breakCodeLockUntil !== settings.lockUntil) {
      breakCode = createBreakCode();
      breakCodeLockUntil = settings.lockUntil;
      const input = $("#break-code-input");
      if (input) input.value = "";
    }
    $("#break-code").textContent = breakCode;
  }

  function normalizeBreakCode(value = "") {
    return value.trim().toUpperCase();
  }

  function updateBreakButton() {
    const input = $("#break-code-input");
    const locked = Boolean(settings && U.isLocked(settings));
    const bypassed = Boolean(settings && U.isBypassed(settings, currentSite));
    const available = Boolean(settings && U.isBypassAvailable(settings));
    const valid = normalizeBreakCode(input?.value) === breakCode && normalizeBreakCode(input?.value).length === BREAK_CODE_LENGTH;
    $("#pass-button").disabled = !locked || bypassed || !available || !currentSite || !U.isActiveForSite(settings, currentSite) || !valid;
  }

  function render() {
    if (!settings) return;
    const active = U.isActiveForSite(settings, currentSite);
    const bypassed = U.isBypassed(settings, currentSite);
    const hasSite = Boolean(currentSite);
    const locked = U.isLocked(settings);
    const availableAt = U.getBypassAvailableAt(settings);
    const available = U.isBypassAvailable(settings);
    ensureBreakCode();
    $("#site-card").classList.toggle("hidden", !hasSite);
    $("#empty-site").classList.toggle("hidden", hasSite);
    $("#current-site").textContent = hasSite ? U.SITE_LABELS[currentSite] : "";
    $("#site-state").textContent = !hasSite
      ? ""
      : bypassed
        ? `Break is open on supported sites (${formatRemaining(settings.bypassUntil)}).`
        : active
          ? "These changes are active here."
          : "blokamine is off on this site.";
    const siteBadge = $("#site-badge");
    siteBadge.textContent = bypassed ? "Break" : active ? "On" : "Off";
    siteBadge.classList.toggle("active", active && !bypassed);
    siteBadge.classList.toggle("break", bypassed);
    const activation = $("#site-activation");
    const activationButton = $("#site-activation-button");
    const siteNeedsActivation = hasSite && !active && !bypassed;
    activation.classList.toggle("hidden", !siteNeedsActivation);
    if (siteNeedsActivation) {
      $("#site-activation-title").textContent = `Turn on ${U.SITE_LABELS[currentSite]}`;
      $("#site-activation-copy").textContent = !settings.enabled
        ? "blokamine is off everywhere. Turn it on here to start."
        : "This site is off in Settings. Turn it on here with one click.";
      activationButton.disabled = false;
    }
    const globalToggle = $("#global-enabled");
    globalToggle.checked = settings.enabled;
    const globalLocked = locked && settings.enabled;
    document.body.classList.toggle("mode-locked", globalLocked);
    document.body.classList.toggle("mode-off", !settings.enabled && !globalLocked);
    document.body.classList.toggle("mode-active", settings.enabled && !globalLocked);
    globalToggle.disabled = globalLocked;
    globalToggle.title = globalToggle.disabled
      ? "Focus Lock keeps blokamine enabled until it expires."
      : "Enable or disable blokamine on supported sites.";
    $("#global-enabled").closest(".popup-switch")?.classList.toggle("locked", globalLocked);
    $("#global-enabled-state").textContent = globalLocked ? "Locked" : settings.enabled ? "On" : "Off";
    $("#global-enabled-state").classList.toggle("locked", globalLocked);
    $("#global-enabled-state").classList.toggle("off", !globalLocked && !settings.enabled);
    $("#global-toggle-row").classList.toggle("hidden", globalLocked);

    $("#focus-lock-banner").classList.toggle("hidden", !locked);
    $("#focus-lock-countdown").textContent = locked ? `${formatDuration(settings.lockUntil)} remaining` : "—";
    $("#focus-lock-banner-copy").textContent = locked
      ? formatEndTime(settings.lockUntil)
      : "Your protections are active.";

    const showBreakStatus = locked && !available && !bypassed;
    $("#priority-card").classList.toggle("hidden", !showBreakStatus);
    $("#break-status").classList.toggle("hidden", !showBreakStatus);
    $("#break-time").textContent = !locked
      ? "—"
      : bypassed
        ? formatRemaining(settings.bypassUntil)
        : available ? "Available now" : `Available in ${formatDuration(availableAt)}`;

    $("#focus-card").classList.toggle("hidden", locked);
    $("#lock-copy").textContent = settings.sites.youtube && settings.siteSettings.youtube.requireVideoApproval
      ? "Your current friction settings will stay in place. YouTube will ask how you want to watch each video."
      : "Your current friction settings will stay in place until the lock ends.";
    if (!$("#lock-duration").value) $("#lock-duration").value = String(U.DEFAULT_LOCK_DURATION_HOURS);
    $("#lock-duration").disabled = false;
    $("#lock-button").disabled = Number($("#lock-duration").value) === 0;
    $("#lock-button").textContent = "Start Focus Lock";

    // Keep the break panel available during a lock even on an unsupported tab;
    // the user can see the cooldown and the exact path to a temporary break.
    $("#pass-section").classList.toggle("hidden", !locked || (!available && !bypassed));
    $("#settings-button").textContent = locked ? "View protection details" : "Open Settings";
    const codeRow = $("#break-code-row");
    codeRow.classList.toggle("hidden", !locked || bypassed || !available);
    $("#break-code-input").disabled = !locked || bypassed || !available || !currentSite || !active;
    if (bypassed) {
      $("#pass-title").textContent = "Break active";
      $("#pass-copy").textContent = `Break is open on supported sites (${formatRemaining(settings.bypassUntil)}).`;
      $("#pass-code-status").textContent = "";
    } else if (!available) {
      $("#pass-title").textContent = "Break cooling down";
      $("#pass-copy").textContent = `Available in ${formatDuration(availableAt)}.`;
      $("#pass-code-status").textContent = "The next break will be available after the cooldown.";
    } else if (!currentSite) {
      $("#pass-title").textContent = "Break available";
      $("#pass-copy").textContent = "Open a supported site, then type the code below.";
      $("#pass-code-status").textContent = "A supported site is required to open the break.";
    } else if (!active) {
      $("#pass-title").textContent = "Break available";
      $("#pass-copy").textContent = "This site is off in Site coverage.";
      $("#pass-code-status").textContent = "Turn this site on in settings before opening a break.";
    } else {
      $("#pass-title").textContent = "Open a global break for 10 minutes";
      $("#pass-copy").textContent = "Type or paste the 6-character code to open a break on all supported sites for 10 minutes.";
      const cooldownHours = Number(settings.bypassCooldownHours);
      $("#pass-code-status").textContent = `The break cooldown is ${cooldownHours} hour${cooldownHours === 1 ? "" : "s"}.`;
    }
    updateBreakButton();
  }

  async function readStoredSettings() {
    return U.mergeSettings(await chrome.storage.local.get(U.DEFAULT_SETTINGS));
  }

  async function refresh() {
    settings = await readStoredSettings();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentSite = U.getSiteFromUrl(activeTab?.url);
    render();
  }

  async function updateSettings(next, message = "Saved", { createLockBaseline = false } = {}) {
    const requested = U.mergeSettings(next);
    const patch = U.createSettingsPatch(settings, requested);
    const latest = await readStoredSettings();
    if (U.isLocked(latest) && Object.hasOwn(patch, "lockUntil") &&
      Number(patch.lockUntil) !== Number(latest.lockUntil)) {
      settings = latest;
      render();
      setMessage("Focus lock is active.");
      return false;
    }
    const merged = U.applySettingsPatch(latest, patch);
    const validationCandidate = {
      ...merged,
      enabled: Object.hasOwn(patch, "enabled") ? Boolean(patch.enabled) : merged.enabled
    };
    if (U.isLocked(latest) && U.isWeakeningChange(latest, validationCandidate)) {
      settings = latest;
      render();
      setMessage("Focus lock is active.");
      return false;
    }
    const storagePatch = U.createStoragePatch(latest, merged);
    if (createLockBaseline) storagePatch[U.LOCK_BASELINE_KEY] = merged;
    if (Object.keys(storagePatch).length) await chrome.storage.local.set(storagePatch);
    settings = merged;
    render();
    setMessage(message);
    return true;
  }

  async function enableHere() {
    if (!currentSite) return;
    await updateSettings({
      ...settings,
      enabled: true,
      sites: { ...settings.sites, [currentSite]: true }
    }, `blokamine enabled on ${U.SITE_LABELS[currentSite]}.`);
  }

  async function setGlobalEnabled(event) {
    const enabled = event.target.checked;
    if (!enabled) {
      if (U.isLocked(settings)) {
        render();
        setMessage("Focus Lock keeps blokamine enabled.");
        return;
      }
      const confirmed = window.confirm("Turn off blokamine on every supported site?");
      if (!confirmed) {
        render();
        return;
      }
    }
    await updateSettings({ ...settings, enabled }, enabled ? "blokamine enabled." : "blokamine disabled.");
  }

  async function setLock() {
    const hours = Number($("#lock-duration").value);
    if (!hours) {
      setMessage("Choose a lock duration.");
      return;
    }
    const youtubeApprovalEnabled = settings.sites.youtube && settings.siteSettings.youtube.requireVideoApproval;
    const confirmed = window.confirm(
      `Activate Focus Lock? Protected settings cannot be weakened until it expires.${
        youtubeApprovalEnabled ? " On YouTube, each video will ask whether to play normally, use your configured friction, or stay paused." : ""
      }`
    );
    if (!confirmed) return;
    const lockUntil = Date.now() + hours * 60 * 60 * 1000;
    const saved = await updateSettings(
      { ...settings, enabled: true, lockUntil },
      `Focus Lock enabled. You're protected until ${formatEndTime(lockUntil)}.`,
      { createLockBaseline: true }
    );
    if (saved) celebrateLock();
  }

  async function openBreak() {
    const latest = await readStoredSettings();
    settings = latest;
    ensureBreakCode();
    if (!currentSite || !U.isLocked(latest) || !U.isBypassAvailable(latest)) {
      settings = latest;
      setMessage("Break is not available yet.");
      render();
      return;
    }
    if (!U.isActiveForSite(latest, currentSite)) {
      settings = latest;
      setMessage("Turn this site on in settings first.");
      render();
      return;
    }
    if (normalizeBreakCode($("#break-code-input").value) !== breakCode) {
      setMessage("Type the code exactly as shown.");
      updateBreakButton();
      return;
    }
    const now = Date.now();
    const next = U.mergeSettings({
      ...latest,
      bypassUntil: now + latest.bypassDurationMinutes * 60 * 1000,
      bypassLastGrantedAt: now
    });
    await chrome.storage.local.set(U.createStoragePatch(latest, next));
    settings = next;
    breakCode = createBreakCode();
    setMessage("Break open for 10 minutes.");
    render();
  }

  async function init() {
    await refresh();
    $("#global-enabled").addEventListener("change", (event) => setGlobalEnabled(event).catch(() => setMessage("Settings could not be saved.")));
    $("#site-activation-button").addEventListener("click", () => enableHere().catch(() => setMessage("Could not enable this site.")));
    $("#settings-button").addEventListener("click", () => chrome.runtime.openOptionsPage());
    $("#lock-button").addEventListener("click", () => setLock().catch(() => setMessage("Settings could not be saved.")));
    $("#lock-duration").addEventListener("change", (event) => {
      $("#lock-button").disabled = Number(event.target.value) === 0;
    });
    const passButton = $("#pass-button");
    passButton.addEventListener("click", () => openBreak().catch(() => setMessage("Break could not be opened.")));
    const codeInput = $("#break-code-input");
    codeInput.addEventListener("input", () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, BREAK_CODE_LENGTH);
      updateBreakButton();
    });
    codeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !$("#pass-button").disabled) openBreak().catch(() => setMessage("Break could not be opened."));
    });
    chrome.storage.onChanged.addListener(refresh);
    countdownTimer = window.setInterval(() => { if (settings) render(); }, 1000);
  }

  init().catch(() => setMessage("Settings could not be loaded."));
})();
