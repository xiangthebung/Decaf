(() => {
  "use strict";

  const D = globalThis.Decaf;
  const $ = (id) => document.getElementById(id);

  let settings = null;
  let site = null;
  let route = "";
  let health = null;
  /*
   * Set when Chrome could not say what the current tab is. Distinct from "this
   * is not a site Decaf covers", which is what the popup used to show for it —
   * turning a failure to find anything out into a confident statement about the
   * page in front of you.
   */
  let tabUnknown = false;
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
   *
   * `next` may be an object, or a function handed the state just read back. It
   * has to be a function whenever the change is *inside* an object-valued
   * setting — `sites`, `custom`, `snoozes` — because a patch names whole
   * top-level keys and `createStoragePatch` compares them whole. Building one of
   * those from the page's own in-memory copy meant writing every entry it held,
   * including entries another surface had changed since this page last read:
   * turn Reddit off in the popup, then LinkedIn off in a settings tab opened ten
   * minutes earlier, and the settings tab wrote back its own stale `sites` with
   * Reddit still on. Re-reading `latest` never fixed that on its own, because
   * the stale object arrived already built.
   */
  async function save(next, note = "") {
    let latest;
    try {
      latest = await read();
    } catch (_) {
      /*
       * The read failed, so there is nothing to compare against and nothing was
       * written. The switch is still showing whatever it was just dragged to, and
       * this is the same dangerous direction as a failed write: put the page back
       * rather than leave it claiming a change that did not happen. This used to
       * sit outside the try below, so it rejected past the revert and only the
       * caller's generic note appeared.
       */
      render();
      message("Not saved — Decaf could not read its settings. Try again.");
      return false;
    }
    const requested = { ...latest, ...(typeof next === "function" ? next(latest) : next) };
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
      try {
        await chrome.storage.local.set(patch);
      } catch (error) {
        /*
         * The write failed — the extension was reloaded under this page, or the
         * profile is out of room. The switch is still showing whatever the person
         * just dragged it to, and storage disagrees. Putting the UI back is the
         * only honest thing to do: it used to be left claiming a change that was
         * never made, which is the dangerous direction for a tool about self-trust.
         */
        settings = latest;
        render();
        message("Not saved — Decaf could not write to storage. Try again, or reopen this page.");
        return false;
      }
    }
    settings = candidate;
    render();
    message(note);
    return true;
  }

  /**
   * A radiogroup has one tab stop, and the arrow keys move between its options.
   * These used to be three plain buttons in a row: every one a tab stop, none of
   * them announcing which was chosen, and `button.role = "radio"` setting a JS
   * property rather than the attribute on every Chrome before 119 — which is
   * fourteen versions below the floor Decaf declares.
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
    if (!Array.from(container.children).some((button) => button.tabIndex === 0)) {
      const first = container.firstElementChild;
      if (first) first.tabIndex = 0;
    }
  }

  /**
   * A row of plain buttons that each do something once. The snooze choices are
   * not a radiogroup — nothing is ever "selected", pressing one acts — and
   * dressing them as radios left a group where every option announced itself
   * as an unchecked radio forever.
   */
  function buildActions(container, options, onChoose) {
    container.textContent = "";
    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.value = String(option.value);
      button.textContent = option.label;
      button.addEventListener("click", () => onChoose(option.value));
      container.append(button);
    }
  }

  /**
   * What a Lock is about to freeze, in the person's own current settings.
   *
   * The confirm step used to change one sentence and a button label, so someone
   * who had switched Pinterest off five minutes earlier locked Pinterest off for
   * a month without being told, and nobody was warned that every hold gains four
   * seconds for the whole duration.
   */
  function lockSummary() {
    const on = D.SITE_KEYS.filter((key) => settings.sites[key]).length;
    const total = D.SITE_KEYS.length;
    const off = D.SITE_KEYS.filter((key) => !settings.sites[key]).map((key) => D.siteLabel(key));
    const switches = D.STRENGTH_KEYS.filter((key) => settings[key]).map((key) => ({
      pauseFeeds: "Pause feeds",
      hideComments: "Hide comments and replies",
      upsideDown: "Turn media upside down",
      hideBadges: "Hide notification counts"
    })[key]);
    const lines = [
      settings.enabled ? "Decaf stays on" : "Decaf stays as it is",
      ...switches.map((label) => `${label} stays on`),
      off.length ? `${on} of ${total} sites — ${off.join(", ")} stay${off.length === 1 ? "s" : ""} off` : `${on} of ${total} sites`,
      "Every hold takes 4 seconds longer"
    ];
    return lines;
  }

  function renderLock() {
    const locked = D.isLocked(settings);
    paintRadios($("lock-choices"), chosenHours);
    $("lock-choices").hidden = locked;
    $("lock-button").hidden = locked;
    $("lock-cancel").hidden = !confirmingLock;

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

    if (locked) {
      $("lock-title").textContent = `Locked · ${D.formatDuration(settings.lockUntil - Date.now())} left`;
      $("lock-detail").textContent = `Ends ${D.formatEndTime(settings.lockUntil)}. Decaf stays on until then.`;
      return;
    }
    $("lock-title").textContent = "Lock";
    const label = D.LOCK_DURATIONS.find((option) => option.hours === chosenHours)?.label;
    $("lock-detail").textContent = confirmingLock
      ? `Lock Decaf for ${label}? This cannot be shortened or cancelled.`
      : "Holds every Decaf setting in place until it ends.";
    $("lock-button").textContent = confirmingLock ? "Confirm lock" : "Lock";
  }


  /** On the page, and not inside anything that is hidden. */
  function reachable(element) {
    return Boolean(element?.isConnected && !element.closest("[hidden]"));
  }

  /**
   * Move the keyboard on when the control it was on has just hidden itself.
   *
   * Several controls here do their job by ceasing to exist: turning Decaf on for
   * a site takes away "Turn on here", confirming a Lock takes away the Lock
   * button, removing an added site takes away the row it was in. `[hidden]` is
   * `display: none`, so focus falls to `<body>` — a keyboard user is dropped at
   * the top of the page, mid-task, with nothing said about why, and on the
   * settings page that is a long way from where they were.
   *
   * Each of those controls names its successor in the markup, so the answer lives
   * beside the thing it is about rather than in a table here. Called at the end
   * of every render, which is the only moment the page knows something has gone.
   */
  function passFocus(had) {
    if (!had || had === document.body || reachable(had)) return;
    // `dataset` survives removal from the document, so a rebuilt row still knows
    // where its keyboard should go.
    const next = had.dataset?.focusNext ? $(had.dataset.focusNext) : null;
    if (reachable(next)) next.focus();
  }

  function render() {
    if (!settings) return;
    const hadFocus = document.activeElement;
    const locked = D.isLocked(settings);
    const supported = Boolean(site);
    const active = D.isActiveForSite(settings, site);
    const passUntil = supported ? D.passUntil(settings, site) : 0;
    const snoozeUntil = supported ? D.snoozeUntil(settings, site) : 0;

    const master = $("master");
    master.checked = settings.enabled;
    // `aria-disabled` rather than `disabled`: a disabled control is skipped by
    // the tab order and announced with no reason, so a screen reader user under
    // a 30-day Lock simply never met the switch and was never told why.
    master.setAttribute("aria-disabled", String(locked));
    master.setAttribute("aria-describedby", locked ? "lock-detail" : "");
    $("master-state").textContent = locked ? "Locked" : settings.enabled ? "On" : "Off";

    $("site-card").hidden = !supported;
    $("unsupported").hidden = supported;
    // Written here rather than in the markup so the count cannot fall behind the
    // site table, and so the failure case gets to say something true.
    $("unsupported").textContent = tabUnknown
      ? "Decaf could not tell which page this is. Close this and open it again."
      : `Decaf works on ${D.SITE_KEYS.length} feed-driven sites, plus any you add yourself. Open one to see it here.`;
    if (supported) {
      const label = D.siteLabel(site, settings);
      const summary = D.feedSummary(site, settings);
      $("site-name").textContent = label;
      const badge = $("site-badge");
      badge.textContent = passUntil ? "Feed open" : snoozeUntil ? "Snoozed" : active ? "On" : "Off";
      badge.classList.toggle("on", active && !passUntil);
      badge.classList.toggle("pass", Boolean(passUntil || snoozeUntil));
      /*
       * Whether Decaf is actually running in that tab, which is not the same
       * question as whether it is switched on for the site. A tab opened before
       * Decaf was installed, or one left over from before an update, carries no
       * content script and no reload has happened yet — see the note on the
       * probe in `refresh`.
       */
      const silent = health?.anchor === "unreachable";
      $("site-detail").textContent = snoozeUntil
        ? `Off for another ${D.formatDuration(snoozeUntil - Date.now())}. ${label} behaves normally until then.`
        : !active
          ? `Decaf is off here. ${label} behaves normally.`
          : silent
            ? `Decaf has not started on this tab, so ${label} is behaving normally.`
            : !settings.pauseFeeds
              ? "Grayscale media, no reward counts, calm badges."
              : passUntil
                ? `${summary} are open for now.`
                : route === "feed"
                  ? "This feed is paused. Hold the button on the page to open it for 5 minutes."
                  : `Paused: ${summary}.`;
      $("site-enable").hidden = active;
      // A snooze is a weakening, so a running Lock would only refuse it — do not
      // offer buttons that exist to be declined.
      $("site-off").hidden = !active || Boolean(passUntil) || locked;
      $("pass-row").hidden = !passUntil;
      if (passUntil) $("pass-time").textContent = `Feed open · ${D.formatClock(passUntil - Date.now())} left`;

      /*
       * The popup used to assert "This feed is paused" from the URL alone, with
       * no idea whether it actually was. When a site redesign outruns a selector
       * that reads as Decaf lying to your face — and it is also the only channel
       * there is, because nothing here reports anything anywhere.
       *
       * There are three answers to that question and the first version of this
       * only handled two. A tab that says `anchor: "none"` has Decaf running in
       * it and cannot find the feed. A tab that says nothing at all has no Decaf
       * in it — and that case fell through to the reassuring branch, so the one
       * page where Decaf was demonstrably doing nothing was also the page the
       * popup was most confident about. It is the commoner of the two, because
       * every tab open at the moment of an install or an update is in it until
       * it is reloaded once.
       */
      const missing = active && route === "feed" && settings.pauseFeeds && !passUntil && health?.anchor === "none";
      const guessed = health?.anchor === "shape";
      $("site-health").hidden = !(missing || guessed || silent);
      $("site-health").textContent = silent
        ? `Reload this tab to start Decaf on it. It was open before Decaf was.`
        : missing
          ? `Decaf could not find the feed on this page. ${label} may have changed.`
          : "Found this feed by its shape — the site may have changed.";
    }

    const totals = D.passTotals(settings);
    $("passes").textContent = totals.week
      ? `Passes: ${totals.today} today, ${totals.week} this week.`
      : "";

    renderLock();
    passFocus(hadFocus);
  }

  async function refresh() {
    settings = await read();
    let tab = null;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      site = D.getSite(tab?.url, settings);
      route = D.getRoute(tab?.url, settings);
      tabUnknown = false;
    } catch (_) {
      site = null;
      route = "";
      tabUnknown = true;
    }
    /*
     * Paint before asking the tab anything. The health probe answers on the
     * content script's event loop, and a tab that is busy — a feed mid-load is
     * exactly that — used to hold the popup's first paint hostage: click the
     * icon, see nothing. The probe fills in afterwards.
     */
    health = null;
    render();
    if (site && typeof tab?.id === "number") {
      try {
        health = await chrome.tabs.sendMessage(tab.id, { type: "decaf-health" });
        if (health) render();
      } catch (_) {
        /*
         * No content script in that tab: a page opened before Decaf was
         * installed or updated, or one Chrome will not script. That is worth
         * reporting rather than discarding, because it is the difference
         * between "this feed is paused" and "nothing is running here" — and
         * the popup used to say the first about a tab in the second state.
         * A reload fixes it, so the message says so.
         */
        health = { anchor: "unreachable" };
        render();
      }
    }
  }

  async function onMaster(event) {
    const enabled = event.target.checked;
    if (D.isLocked(settings)) {
      render();
      message("Lock keeps Decaf on.");
      return;
    }
    await save({ enabled }, enabled ? "Decaf is on." : "Decaf is off everywhere.");
  }

  async function onEnableHere() {
    if (!site) return;
    await save(
      (from) => ({ enabled: true, snoozes: D.wakeSite(from, site).snoozes, ...siteOn(site, true)(from) }),
      `Decaf is on for ${D.siteLabel(site, settings)}.`
    );
  }

  /**
   * The patch that turns one site on or off, built or custom. Takes the state to
   * build on rather than reading `settings`, so it can be applied to whatever
   * `save` just read back instead of to this page's older copy.
   */
  function siteOn(key, value) {
    return (from) => {
      if (!D.isCustomKey(key)) return { sites: { ...from.sites, [key]: value } };
      const host = D.customHost(key);
      return { custom: { ...from.custom, [host]: { ...from.custom[host], enabled: value } } };
    };
  }

  async function onDisableHere() {
    if (!site) return;
    await save(siteOn(site, false), `Decaf is off for ${D.siteLabel(site, settings)}.`);
  }

  async function onSnooze(minutes) {
    if (!site) return;
    await save(
      (from) => ({ snoozes: D.snoozeSite(from, site, minutes).snoozes }),
      `${D.siteLabel(site, settings)} is normal for ${D.formatDuration(minutes * 60000)}.`
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
    try {
      await chrome.storage.local.set(D.createStoragePatch(settings, next));
    } catch (_) {
      message("That change could not be saved.");
      return;
    }
    settings = next;
    render();
    message("Feed paused again.");
  }

  function init() {
    buildRadios(
      $("lock-choices"),
      D.LOCK_DURATIONS.map((option) => ({ value: option.hours, label: option.label })),
      (value) => {
        chosenHours = value;
        confirmingLock = false;
        render();
      }
    );
    buildActions(
      $("snooze-choices"),
      D.SNOOZE_DURATIONS.map((option) => ({ value: option.minutes, label: option.label })),
      (value) => {
        onSnooze(value).catch(() => message("That change could not be saved."));
      }
    );

    $("master").addEventListener("change", (event) => {
      onMaster(event).catch(() => message("That change could not be saved."));
    });
    $("site-enable").addEventListener("click", () => {
      onEnableHere().catch(() => message("That change could not be saved."));
    });
    $("site-disable").addEventListener("click", () => {
      onDisableHere().catch(() => message("That change could not be saved."));
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
    /*
     * Only settings redraw this. `clockSeen` is bookkeeping the worker rewrites
     * on every run of `sync`, and `lockBaseline` is internal to the Lock — and a
     * refresh is not free: it re-reads storage, queries the active tab, and asks
     * that tab's content script whether it actually found a feed. Reacting to
     * every key meant a routine worker wake queued a round trip to a page that
     * may be busy, for a change no part of this screen shows. background.js
     * filters the same key for the same reason.
     */
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!Object.keys(changes).some((key) => Object.hasOwn(D.DEFAULT_SETTINGS, key))) return;
      refresh().catch(() => {});
    });
    ticker = setInterval(() => {
      if (!settings) return;
      if (D.isLocked(settings) || (site && (D.passUntil(settings, site) || D.snoozeUntil(settings, site)))) render();
    }, 1000);
    window.addEventListener("pagehide", () => clearInterval(ticker), { once: true });
    refresh().catch(() => message("Settings could not be loaded."));
  }

  init();
})();
