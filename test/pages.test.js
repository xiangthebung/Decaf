"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { launchExtensionPage, settle, click, toggle } = require("../tools/harness.js");
const D = require("../core.js");

/** A *local* day key, the same one Decaf writes — see the note in content.test.js. */
const today = () => D.dayKey();
const switchFor = (page, key) => page.document.querySelector(`input[data-setting="${key}"]`);
const siteSwitch = (page, key) => page.document.querySelector(`.site[data-site="${key}"] input`);

/* ------------------------------------------------------------------ popup -- */

test("the popup shows what Decaf is doing on this page", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/" });
  try {
    assert.equal(page.$("master").checked, true);
    assert.equal(page.$("master-state").textContent, "On");
    assert.equal(page.$("site-name").textContent, "YouTube");
    assert.equal(page.$("site-badge").textContent, "On");
    assert.match(page.$("site-detail").textContent, /This feed is paused/);
    assert.equal(page.$("site-enable").hidden, true);
    assert.equal(page.$("pass-row").hidden, true);
    assert.equal(page.$("unsupported").hidden, true);
    assert.equal(page.$("lock-button").textContent, "Lock");
    assert.deepEqual(
      Array.from(page.$("lock-choices").children, (button) => button.textContent),
      ["1 hour", "4 hours", "1 day", "1 week", "30 days"]
    );
    assert.equal(page.$("lock-choices").children[0].getAttribute("aria-checked"), "true");
    // The role has to be on the attribute, not a JS property: reflection for
    // `element.role` only arrived in Chrome 119 and the floor here is 105.
    assert.equal(page.$("lock-choices").children[0].getAttribute("role"), "radio");
    assert.equal(
      Array.from(page.$("lock-choices").children).filter((button) => button.tabIndex === 0).length,
      1,
      "a radiogroup has exactly one tab stop"
    );
  } finally {
    page.close();
  }
});

test("the popup is honest on a page Decaf does not touch", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://example.com/" });
  try {
    assert.equal(page.$("site-card").hidden, true);
    assert.equal(page.$("unsupported").hidden, false);
  } finally {
    page.close();
  }
});

test("the popup describes a media page without claiming it is paused", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/watch?v=abc123" });
  try {
    assert.equal(page.$("site-badge").textContent, "On");
    assert.match(page.$("site-detail").textContent, /^Paused: Home, Shorts, Explore\.$/);
  } finally {
    page.close();
  }
});

test("the popup can switch Decaf off and back on", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/" });
  try {
    toggle(page.$("master"), false);
    await settle();
    assert.equal(page.chrome.__store.enabled, false);
    assert.equal(page.$("master-state").textContent, "Off");
    assert.match(page.$("message").textContent, /off everywhere/);

    toggle(page.$("master"), true);
    await settle();
    assert.equal(page.chrome.__store.enabled, true);
  } finally {
    page.close();
  }
});

test("the popup turns Decaf on for the site you are looking at", async () => {
  const page = await launchExtensionPage("popup.html", {
    tabUrl: "https://www.reddit.com/",
    storage: { sites: { reddit: false } }
  });
  try {
    assert.equal(page.$("site-badge").textContent, "Off");
    assert.equal(page.$("site-enable").hidden, false);
    click(page.$("site-enable"));
    await settle();
    assert.equal(page.chrome.__store.sites.reddit, true);
    assert.equal(page.$("site-badge").textContent, "On");
  } finally {
    page.close();
  }
});

test("locking takes two deliberate steps and records a baseline", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/" });
  try {
    click(page.$("lock-button"));
    await settle();
    assert.equal(page.$("lock-button").textContent, "Confirm lock");
    assert.match(page.$("lock-detail").textContent, /Lock Decaf for 1 hour\?/);
    assert.match(page.$("lock-detail").textContent, /cannot be shortened or cancelled/);
    assert.equal(page.chrome.__store.lockUntil, undefined);
    // The confirm step says what is about to be frozen, not just for how long.
    assert.match(page.$("lock-summary").textContent, /Decaf stays on/);
    assert.match(page.$("lock-summary").textContent, /12 of 12 sites/);
    assert.match(page.$("lock-summary").textContent, /4 seconds/);

    click(page.$("lock-choices").children[3]);
    await settle();
    assert.equal(page.$("lock-choices").children[3].getAttribute("aria-checked"), "true");
    assert.equal(page.$("lock-button").textContent, "Lock", "changing the duration starts over");

    click(page.$("lock-button"));
    await settle();
    assert.match(page.$("lock-detail").textContent, /Lock Decaf for 1 week\?/);
    click(page.$("lock-button"));
    await settle();

    const store = page.chrome.__store;
    const expected = Date.now() + 168 * 3600000;
    assert.ok(Math.abs(store.lockUntil - expected) < 5000, "locked for the chosen week");
    assert.ok(store.lockBaseline, "a baseline is stored so the lock can be enforced");
    assert.equal(store.lockBaseline.pauseFeeds, true);
    assert.equal(page.$("master").getAttribute("aria-disabled"), "true");
    assert.equal(page.$("master-state").textContent, "Locked");
    assert.equal(page.$("lock-choices").hidden, true);
    assert.match(page.$("lock-title").textContent, /^Locked · 7 days left$/);
  } finally {
    page.close();
  }
});

test("a running lock refuses to be switched off", async () => {
  const page = await launchExtensionPage("popup.html", {
    tabUrl: "https://www.youtube.com/",
    storage: { lockUntil: Date.now() + 3600000 }
  });
  try {
    toggle(page.$("master"), false);
    await settle();
    assert.equal(page.chrome.__store.enabled, undefined, "nothing was written");
    assert.equal(page.$("master").checked, true);
    assert.match(page.$("message").textContent, /Lock keeps Decaf on/);
  } finally {
    page.close();
  }
});

test("an open feed can be handed back early", async () => {
  const page = await launchExtensionPage("popup.html", {
    tabUrl: "https://www.youtube.com/",
    storage: { passes: { youtube: Date.now() + 120_000 }, passHistory: { [today()]: { youtube: 1 } } }
  });
  try {
    assert.equal(page.$("site-badge").textContent, "Feed open");
    assert.match(page.$("pass-time").textContent, /^Feed open · [12]:\d\d left$/);
    click(page.$("pass-end"));
    await settle();
    assert.deepEqual(page.chrome.__store.passes, {});
    assert.equal(page.$("pass-row").hidden, true);
    assert.match(page.$("message").textContent, /paused again/);
  } finally {
    page.close();
  }
});

/* ---------------------------------------------------------------- options -- */

test("settings expose one switch per behaviour, and nothing more", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    const keys = Array.from(page.document.querySelectorAll("input[data-setting]"), (input) => input.dataset.setting);
    assert.equal(keys.join(","), page.decaf.STRENGTH_KEYS.join(","));
    assert.equal(switchFor(page, "pauseFeeds").checked, true);
    assert.equal(switchFor(page, "hideComments").checked, true);
    assert.equal(switchFor(page, "upsideDown").checked, false);
    assert.equal(switchFor(page, "hideBadges").checked, false);
    assert.match(page.$("version").textContent, /^Version \d+\.\d+\.\d+$/);
  } finally {
    page.close();
  }
});

test("settings lists every supported site with what it pauses", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    const rows = Array.from(page.document.querySelectorAll(".site"));
    assert.equal(rows.length, page.decaf.SITE_KEYS.length);
    for (const key of page.decaf.SITE_KEYS) {
      const row = page.document.querySelector(`.site[data-site="${key}"]`);
      assert.ok(row, key);
      assert.equal(row.querySelector("strong").textContent, page.decaf.SITES[key].label);
      assert.equal(row.querySelector("small").textContent, `Pauses ${page.decaf.SITES[key].feedSummary}`);
      assert.equal(row.querySelector("input").checked, true);
    }
  } finally {
    page.close();
  }
});

test("settings apply the moment they change", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    toggle(siteSwitch(page, "linkedin"), false);
    await settle();
    assert.equal(page.chrome.__store.sites.linkedin, false);
    assert.equal(page.chrome.__store.sites.youtube, true);
    assert.match(page.$("toast").textContent, /off for LinkedIn/);

    toggle(switchFor(page, "pauseFeeds"), false);
    await settle();
    assert.equal(page.chrome.__store.pauseFeeds, false);
    assert.match(page.$("toast").textContent, /just quieter/);

    toggle(switchFor(page, "upsideDown"), true);
    await settle();
    assert.equal(page.chrome.__store.upsideDown, true);
    assert.match(page.$("toast").textContent, /turned over/);

    toggle(switchFor(page, "hideBadges"), true);
    await settle();
    assert.equal(page.chrome.__store.hideBadges, true);

    toggle(switchFor(page, "hideComments"), false);
    await settle();
    assert.equal(page.chrome.__store.hideComments, false);
  } finally {
    page.close();
  }
});

test("a running lock keeps settings from being weakened", async () => {
  const page = await launchExtensionPage("options.html", { storage: { lockUntil: Date.now() + 7200000 } });
  try {
    assert.equal(page.$("master").getAttribute("aria-disabled"), "true");
    assert.equal(switchFor(page, "pauseFeeds").getAttribute("aria-disabled"), "true");
    assert.equal(switchFor(page, "hideComments").getAttribute("aria-disabled"), "true");
    assert.equal(switchFor(page, "upsideDown").getAttribute("aria-disabled"), "false", "friction can still be added");
    assert.match(page.$("lock-badge").textContent, /2 hr left$/);
    for (const key of page.decaf.SITE_KEYS) {
      assert.equal(siteSwitch(page, key).getAttribute("aria-disabled"), "true", key);
    }

    // Even if a disabled control is forced, the write is refused.
    toggle(siteSwitch(page, "youtube"), false);
    await settle();
    assert.equal(page.chrome.__store.sites, undefined);
    assert.match(page.$("toast").textContent, /Lock is on until it ends/);
    assert.equal(siteSwitch(page, "youtube").checked, true);

    toggle(switchFor(page, "pauseFeeds"), false);
    await settle();
    assert.equal(page.chrome.__store.pauseFeeds, undefined);
    assert.equal(switchFor(page, "pauseFeeds").checked, true);
  } finally {
    page.close();
  }
});

test("a lock still allows adding sites and friction", async () => {
  const page = await launchExtensionPage("options.html", {
    storage: { lockUntil: Date.now() + 7200000, sites: { pinterest: false } }
  });
  try {
    const site = siteSwitch(page, "pinterest");
    assert.equal(site.getAttribute("aria-disabled"), "false", "a site that is off can still be added");
    toggle(site, true);
    await settle();
    assert.equal(page.chrome.__store.sites.pinterest, true);

    toggle(switchFor(page, "hideBadges"), true);
    await settle();
    assert.equal(page.chrome.__store.hideBadges, true);
  } finally {
    page.close();
  }
});

test("settings react to changes made somewhere else", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    await page.chrome.storage.local.set({ pauseFeeds: false, upsideDown: true });
    await settle();
    assert.equal(switchFor(page, "pauseFeeds").checked, false);
    assert.equal(switchFor(page, "upsideDown").checked, true);
  } finally {
    page.close();
  }
});
