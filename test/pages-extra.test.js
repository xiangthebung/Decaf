"use strict";

/**
 * The newer contracts of the two extension pages: the snooze, the sites someone
 * adds themselves, the first-run panel, the reset, and the accessibility rules
 * that the older tests took on trust.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const { JSDOM } = require("jsdom");

const { launchExtensionPage, settle, click, toggle, read } = require("../tools/harness.js");
const D = require("../core.js");

const siteRow = (page, key) => page.document.querySelector(`.site[data-site="${key}"]`);

/* ------------------------------------------------------------------ popup -- */

/*
 * The realistic failure is not that someone defeats Decaf — it is that they need
 * a site for forty minutes, switch it off, and it stays off for eight months.
 * The state you fall into by accident used to be the permanently weak one, with
 * nothing to repair it and no screen anywhere saying so.
 */
test("a site can be set aside for a while rather than switched off for good", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.reddit.com/" });
  try {
    assert.equal(page.$("site-off").hidden, false);
    const choices = Array.from(page.$("snooze-choices").children, (button) => button.textContent);
    assert.deepEqual(choices, D.SNOOZE_DURATIONS.map((option) => option.label));

    click(page.$("snooze-choices").children[0]);
    await settle();
    const until = page.chrome.__store.snoozes.reddit;
    assert.ok(Math.abs(until - (Date.now() + 30 * 60000)) < 5000, "off for half an hour");
    assert.equal(page.$("site-badge").textContent, "Snoozed");
    assert.match(page.$("site-detail").textContent, /behaves normally until then/);
  } finally {
    page.close();
  }
});

test("the popup can turn Decaf off for the site you are looking at", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.reddit.com/" });
  try {
    click(page.$("site-disable"));
    await settle();
    assert.equal(page.chrome.__store.sites.reddit, false);
    assert.equal(page.$("site-badge").textContent, "Off");
    assert.equal(page.$("site-enable").hidden, false, "and back on again from the same place");
  } finally {
    page.close();
  }
});

/*
 * The popup used to assert "This feed is paused" from the URL alone, with no
 * idea whether it actually was. When a redesign outruns a selector, that reads
 * as the tool lying — and it is also the only channel there is, because nothing
 * here reports anything anywhere.
 */
test("the popup says so when the page could not find its feed", async () => {
  const page = await launchExtensionPage("popup.html", {
    tabUrl: "https://www.youtube.com/",
    tabReply: { anchor: "none", route: "feed", active: true, hidingFeed: true, placed: false }
  });
  try {
    assert.equal(page.$("site-health").hidden, false);
    assert.match(page.$("site-health").textContent, /could not find the feed/);
  } finally {
    page.close();
  }
});

test("the popup keeps quiet when the feed was found", async () => {
  const page = await launchExtensionPage("popup.html", {
    tabUrl: "https://www.youtube.com/",
    tabReply: { anchor: "selector", route: "feed", active: true, hidingFeed: true, placed: true }
  });
  try {
    assert.equal(page.$("site-health").hidden, true);
  } finally {
    page.close();
  }
});

test("the lock duration group is one tab stop and moves with the arrow keys", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/" });
  try {
    const group = page.$("lock-choices");
    const stops = () => Array.from(group.children).filter((button) => button.tabIndex === 0);
    assert.equal(stops().length, 1);
    assert.equal(group.children[0].getAttribute("aria-checked"), "true");

    group.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    assert.equal(group.children[1].getAttribute("aria-checked"), "true");
    assert.equal(stops().length, 1);

    group.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    group.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle();
    const last = group.children[group.children.length - 1];
    assert.equal(last.getAttribute("aria-checked"), "true", "and it wraps");
  } finally {
    page.close();
  }
});

/*
 * A write can fail: the extension is reloaded under the page, or the profile is
 * out of room. The switch was left showing what the person had just dragged it
 * to while storage said otherwise — and it disagreed in the dangerous direction,
 * with the page claiming Decaf was weaker than it actually was.
 */
test("a save that fails puts the page back rather than lying about it", async () => {
  const page = await launchExtensionPage("options.html", { failSet: true });
  try {
    const input = page.document.querySelector('input[data-setting="pauseFeeds"]');
    toggle(input, false);
    await settle();
    assert.equal(input.checked, true, "the switch is back where storage actually is");
    assert.match(page.$("toast").textContent, /Not saved/);
  } finally {
    page.close();
  }
});

/* ---------------------------------------------------------------- options -- */

test("first run explains what Decaf just did, and goes away when told", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    assert.equal(page.$("intro").hidden, false);
    assert.match(page.$("intro").textContent, /puzzle-piece/, "the toolbar icon is hidden by default");
    assert.match(page.$("intro").textContent, /press and hold/i, "the one non-obvious interaction");
    assert.equal(page.$("intro-links").children.length, 3, "somewhere to go and see it work");

    click(page.$("intro-dismiss"));
    await settle();
    assert.equal(page.chrome.__store.seenIntro, true);
    assert.equal(page.$("intro").hidden, true);
  } finally {
    page.close();
  }
});

test("first run does not come back once it has been seen", async () => {
  const page = await launchExtensionPage("options.html", { storage: { seenIntro: true } });
  try {
    assert.equal(page.$("intro").hidden, true);
  } finally {
    page.close();
  }
});

test("every switch says its state in words, not only in colour", async () => {
  const page = await launchExtensionPage("options.html", { storage: { sites: { reddit: false } } });
  try {
    for (const key of D.STRENGTH_KEYS) {
      const state = page.document.querySelector(`[data-state="${key}"]`);
      assert.ok(state, `${key} has a text state`);
      assert.match(state.textContent, /^(On|Off)$/);
    }
    assert.equal(siteRow(page, "reddit").querySelector(".switch-label").textContent, "Off");
    assert.equal(siteRow(page, "youtube").querySelector(".switch-label").textContent, "On");
  } finally {
    page.close();
  }
});

test("a site can be added, and it asks Chrome for that one origin", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    page.$("add-host").value = "news.ycombinator.com";
    page.$("add-form").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(6);

    assert.equal(
      page.chrome.__calls.permissions.at(-1).origins.join(),
      "*://*.news.ycombinator.com/*",
      "one origin, asked for at the moment it is needed"
    );
    assert.deepEqual(Object.keys(page.chrome.__store.custom), ["news.ycombinator.com"]);
    assert.ok(siteRow(page, D.customKey("news.ycombinator.com")), "and it joins the list");
    assert.equal(page.$("add-host").value, "");
  } finally {
    page.close();
  }
});

test("a site Chrome refuses permission for is not added", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    page.chrome.__grantPermissions = false;
    page.$("add-host").value = "example.com";
    page.$("add-form").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(6);
    assert.equal(page.chrome.__store.custom, undefined);
    assert.match(page.$("add-error").textContent, /needs permission/);
  } finally {
    page.close();
  }
});

test("a site Decaf already covers cannot be added twice", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    page.$("add-host").value = "youtube.com";
    page.$("add-form").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(6);
    assert.equal(page.chrome.__calls.permissions.length, 0, "nothing was even asked for");
    assert.match(page.$("add-error").textContent, /already covers/);
  } finally {
    page.close();
  }
});

test("nonsense is refused before Chrome is bothered with it", async () => {
  const page = await launchExtensionPage("options.html");
  try {
    page.$("add-host").value = "not a website";
    page.$("add-form").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
    await settle(6);
    assert.equal(page.chrome.__calls.permissions.length, 0);
    assert.match(page.$("add-error").textContent, /does not look like/);
  } finally {
    page.close();
  }
});

test("an added site can be removed again", async () => {
  const page = await launchExtensionPage("options.html", {
    storage: { custom: { "news.ycombinator.com": { label: "HN", enabled: true } } }
  });
  try {
    const row = siteRow(page, D.customKey("news.ycombinator.com"));
    assert.ok(row, "it is in the list");
    click(row.querySelector(".remove"));
    await settle(6);
    assert.deepEqual(page.chrome.__store.custom, {});
    assert.equal(siteRow(page, D.customKey("news.ycombinator.com")), null);
  } finally {
    page.close();
  }
});

/*
 * A settings page with no Save button has no draft to abandon, so a change
 * regretted five screens ago had to be undone switch by switch.
 */
test("everything can be put back to the defaults, in two steps", async () => {
  const page = await launchExtensionPage("options.html", {
    storage: { pauseFeeds: false, upsideDown: true, sites: { reddit: false } }
  });
  try {
    click(page.$("reset"));
    await settle();
    assert.match(page.$("reset").textContent, /Confirm/, "not on one click");
    assert.equal(page.chrome.__store.pauseFeeds, false);

    click(page.$("reset"));
    await settle(6);
    assert.equal(page.chrome.__store.pauseFeeds, true);
    assert.equal(page.chrome.__store.upsideDown, false);
    assert.equal(page.chrome.__store.sites.reddit, true);
  } finally {
    page.close();
  }
});

test("a running lock refuses the reset too", async () => {
  const page = await launchExtensionPage("options.html", { storage: { lockUntil: Date.now() + 3600000 } });
  try {
    assert.equal(page.$("reset").disabled, true);
    click(page.$("reset"));
    await settle();
    assert.match(page.$("toast").textContent, /Lock is on/);
  } finally {
    page.close();
  }
});

test("passes are reported as a meter reading, not a scoreboard", async () => {
  const day = (offset) => D.dayKey(new Date(Date.now() - offset * 86400000));
  const page = await launchExtensionPage("options.html", {
    storage: {
      passHistory: {
        [day(0)]: { youtube: 2, reddit: 1 },
        [day(3)]: { youtube: 4 }
      }
    }
  });
  try {
    assert.match(page.$("meter").textContent, /^3 today, 7 in the last seven days/);
    assert.match(page.$("meter").textContent, /most on YouTube/);
    // No streaks, no goals, no praise: the tone is a meter, not a game.
    assert.doesNotMatch(page.$("meter").textContent, /streak|goal|well done|great/i);
  } finally {
    page.close();
  }
});

test("the lock summary says what is about to be frozen", async () => {
  const page = await launchExtensionPage("options.html", {
    storage: { sites: { pinterest: false }, upsideDown: true }
  });
  try {
    click(page.$("lock-button"));
    await settle();
    const summary = page.$("lock-summary").textContent;
    assert.match(summary, /Turn media upside down stays on/);
    assert.match(summary, /11 of 12 sites/);
    assert.match(summary, /Pinterest stay off/);
    assert.match(summary, /4 seconds longer/);
  } finally {
    page.close();
  }
});

/*
 * The popup's job is to say what Decaf is doing on the page in front of you, so
 * the one thing it may never do is describe work it is not doing. Three states
 * were being collapsed into one reassuring sentence.
 */
test("a tab with no Decaf in it is told so, not told its feed is paused", async () => {
  // No `tabReply`: the harness throws "Receiving end does not exist", which is
  // exactly what Chrome does for a tab that was already open when Decaf was
  // installed or updated. Every such tab is in this state until it is reloaded
  // once, so it is the commonest failure there is — and it used to be the one
  // the popup was most confident about.
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/" });
  try {
    assert.equal(page.$("site-health").hidden, false, "the state is reported at all");
    assert.match(page.$("site-health").textContent, /Reload this tab/);
    assert.doesNotMatch(
      page.$("site-detail").textContent,
      /This feed is paused/,
      "nothing is paused here, because nothing is running here"
    );
    assert.match(page.$("site-detail").textContent, /has not started on this tab/);
  } finally {
    page.close();
  }
});

/*
 * A tab Chrome would not identify is not a tab on an unsupported site, and
 * saying so turned a failure to find anything out into a confident claim about
 * the page. The two need different words because they need different actions.
 */
test("a tab Chrome will not identify is not called an unsupported site", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://www.youtube.com/" });
  try {
    page.chrome.tabs.query = async () => {
      throw new Error("Tabs cannot be queried");
    };
    // A settings write is the popup's own re-render trigger, so this exercises
    // the same `refresh` the page runs on open rather than a private hook.
    await page.chrome.storage.local.set({ upsideDown: true });
    await settle(4);
    assert.equal(page.$("unsupported").hidden, false);
    assert.match(page.$("unsupported").textContent, /could not tell which page this is/);
  } finally {
    page.close();
  }
});

/* The count in that sentence is read off the site table rather than typed out. */
test("the unsupported line counts the sites Decaf actually has", async () => {
  const page = await launchExtensionPage("popup.html", { tabUrl: "https://example.com/" });
  try {
    assert.equal(page.$("unsupported").hidden, false);
    // A plain substring rather than a built regex: inside a template literal a
    // backslash-b is the backspace character, not a word boundary, so the
    // pattern silently stopped being the one that was written.
    assert.ok(
      page.$("unsupported").textContent.includes(`${D.SITE_KEYS.length} feed-driven sites`),
      page.$("unsupported").textContent
    );
  } finally {
    page.close();
  }
});

/*
 * Before the settings have been read back, the popup knows nothing about the tab
 * — so it must not draw a card that says otherwise. It used to open on a site
 * called "Site" that was "Off", beside a switch labelled "On" that was unchecked.
 */
test("the popup asserts nothing about a page before it has read anything", () => {
  const markup = read("popup.html");
  const dom = new JSDOM(markup, { url: "chrome-extension://decaf-test/popup.html" });
  const doc = dom.window.document;
  try {
    assert.equal(doc.getElementById("site-card").hasAttribute("hidden"), true,
      "the site card starts hidden, exactly as #unsupported does");
    assert.equal(doc.getElementById("unsupported").hasAttribute("hidden"), true);
    for (const id of ["site-name", "site-badge", "master-state", "unsupported"]) {
      assert.equal(doc.getElementById(id).textContent.trim(), "",
        `#${id} states nothing until the settings arrive`);
    }
    for (const box of doc.querySelectorAll("input[type=checkbox]")) {
      assert.equal(box.hasAttribute("checked"), false,
        "no switch claims to be on before it is known to be");
    }
  } finally {
    dom.window.close();
  }
});
