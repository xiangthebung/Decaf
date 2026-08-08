"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { launchWorker, settle } = require("../tools/harness.js");

test("the toolbar icon tells the truth about the current state", async () => {
  const on = launchWorker();
  await settle();
  assert.equal(on.chrome.__calls.icons.at(-1), "icons/icon16.png");
  assert.equal(on.chrome.__calls.titles.at(-1), "Decaf — on");

  const off = launchWorker({ storage: { enabled: false } });
  await settle();
  assert.equal(off.chrome.__calls.icons.at(-1), "icons/icon-off16.png");
  assert.equal(off.chrome.__calls.titles.at(-1), "Decaf — off");

  const lockUntil = Date.now() + 3600000;
  const locked = launchWorker({ storage: { lockUntil } });
  await settle();
  assert.equal(locked.chrome.__calls.icons.at(-1), "icons/icon-locked16.png");
  assert.equal(locked.chrome.__calls.titles.at(-1), "Decaf — locked");
  const alarm = locked.chrome.__calls.alarms.at(-1);
  assert.equal(alarm.name, "decaf-lock-expiry");
  assert.ok(alarm.info.when > lockUntil, "an alarm refreshes the icon when the lock ends");
});

test("settings weakened behind a lock's back are put right again", async () => {
  const lockUntil = Date.now() + 3600000;
  const worker = launchWorker({
    storage: {
      enabled: true,
      pauseFeeds: false,
      sites: { youtube: false, reddit: false },
      lockUntil,
      lockBaseline: { enabled: true, pauseFeeds: true, lockUntil, sites: { youtube: true, reddit: true } }
    }
  });
  await settle();
  const store = worker.chrome.__store;
  assert.equal(store.pauseFeeds, true);
  assert.equal(store.sites.youtube, true);
  assert.equal(store.sites.reddit, true);
  assert.equal(worker.chrome.__calls.icons.at(-1), "icons/icon-locked16.png");
});

test("a finished lock cleans up after itself", async () => {
  const worker = launchWorker({
    storage: {
      enabled: false,
      lockUntil: Date.now() - 1000,
      lockBaseline: { enabled: true, pauseFeeds: true, lockUntil: Date.now() - 1000 }
    }
  });
  await settle();
  assert.equal(Object.hasOwn(worker.chrome.__store, "lockBaseline"), false);
  assert.equal(worker.chrome.__store.enabled, false, "choices made after a lock are respected");
  assert.equal(worker.chrome.__calls.icons.at(-1), "icons/icon-off16.png");
});

/**
 * The repair pass has a blind spot that only shows up hours later.
 *
 * `mergeSettings` reports `enabled` as true for anything under a running Lock, so
 * a stored `enabled: false` written behind the Lock's back looks identical to a
 * stored `true` on both sides of the storage patch — and never gets corrected.
 * Nothing seems wrong while the Lock runs, because every reader sees Decaf as on.
 * Then the Lock ends, the masking stops, the stale `false` surfaces, and Decaf
 * switches itself off everywhere: the one thing a Lock is there to prevent,
 * arriving long after the write that caused it.
 */
test("a lock puts a stored `enabled: false` right, not just the switches", async () => {
  const lockUntil = Date.now() + 3600000;
  const worker = launchWorker({
    storage: {
      enabled: false,
      pauseFeeds: false,
      hideComments: false,
      lockUntil,
      lockBaseline: { enabled: true, pauseFeeds: true, hideComments: true, lockUntil }
    }
  });
  await settle();
  const store = worker.chrome.__store;
  assert.equal(store.enabled, true, "the stored value itself has to be corrected");
  assert.equal(store.pauseFeeds, true);
  assert.equal(store.hideComments, true);
  assert.equal(worker.chrome.__calls.titles.at(-1), "Decaf — locked");

  // The point of correcting storage: the end of the lock must not switch Decaf off.
  const D = require("../core.js");
  const afterLock = D.mergeSettings(store, lockUntil + 1000);
  assert.equal(afterLock.enabled, true, "Decaf is still on once the lock ends");
  assert.equal(D.isActiveForSite(afterLock, "youtube"), true);
});

/**
 * A missing icon file must not take the title with it.
 *
 * These two used to share one `try`, inside a `catch` written to keep a failed
 * sync quiet. So a build that dropped a single 32px PNG made `setIcon` reject,
 * `setTitle` never run, and the toolbar stop reporting Decaf's state entirely —
 * switching Decaf off left it still saying "on", with nothing logged anywhere.
 * The title is what a screen reader announces, so it is the last thing that
 * should be lost to a picture that will not load.
 */
test("the toolbar title survives an icon that will not load", async () => {
  const worker = launchWorker({ storage: { enabled: false }, failIcon: true });
  await settle();
  assert.deepEqual(worker.chrome.__calls.icons, [], "the icon really did fail");
  assert.equal(worker.chrome.__calls.titles.at(-1), "Decaf — off", "the title is still correct");
  // One warning per paint — the global pass and the per-tab pass both say so.
  assert.ok(worker.warnings.length >= 1, "and the failure is not silent");
  assert.match(worker.warnings[0], /toolbar could not be set to "off"/);
  assert.match(worker.warnings[0], /icon:/);
});

test("an icon that will not load does not stop the lock alarm either", async () => {
  const lockUntil = Date.now() + 3600000;
  const worker = launchWorker({ storage: { lockUntil }, failIcon: true });
  await settle();
  assert.equal(worker.chrome.__calls.titles.at(-1), "Decaf — locked");
  const alarm = worker.chrome.__calls.alarms.at(-1);
  assert.equal(alarm.name, "decaf-lock-expiry");
  assert.ok(alarm.info.when > lockUntil);
});

/**
 * The toolbar is the only always-visible surface Decaf has, and it used to
 * report the global state on every page in the browser: "Decaf — on" while
 * sitting above a site the person had switched off, above the 99% of the web
 * where the content script never runs, and while a five-minute pass had the feed
 * wide open. None of those is a useful thing to be told.
 */
test("the toolbar describes the tab in front of you, not the whole browser", async () => {
  const D = require("../core.js");

  const on = launchWorker({ tabUrl: "https://www.youtube.com/" });
  await settle();
  assert.equal(on.chrome.__calls.titles.at(-1), "Decaf — on for YouTube");
  assert.equal(on.chrome.__calls.icons.at(-1), "icons/icon16.png");
  // The global state is painted first, so a context the per-tab pass has not
  // reached still tells the truth instead of the manifest's bare "Decaf".
  assert.equal(on.chrome.__calls.titles[0], "Decaf — on");

  const elsewhere = launchWorker({ tabUrl: "https://example.com/" });
  await settle();
  assert.equal(elsewhere.chrome.__calls.titles.at(-1), "Decaf — not used on this page");
  assert.equal(elsewhere.chrome.__calls.icons.at(-1), "icons/icon-off16.png", "not acting here is not 'on'");

  const siteOff = launchWorker({
    tabUrl: "https://www.reddit.com/",
    storage: { sites: { reddit: false } }
  });
  await settle();
  assert.equal(siteOff.chrome.__calls.titles.at(-1), "Decaf — off for Reddit");

  const snoozed = launchWorker({
    tabUrl: "https://www.reddit.com/",
    storage: { snoozes: { reddit: Date.now() + 25 * 60000 } }
  });
  await settle();
  assert.match(snoozed.chrome.__calls.titles.at(-1), /^Decaf — off for Reddit for another \d+ min$/);

  // A running pass is the state most worth being reminded of.
  const pass = launchWorker({
    tabUrl: "https://www.youtube.com/",
    storage: { passes: { youtube: Date.now() + 120000 } }
  });
  await settle();
  assert.match(pass.chrome.__calls.titles.at(-1), /YouTube feed open, [12]:\d\d left/);
  assert.equal(pass.chrome.__calls.badges.at(-1), "2");

  // With no tab to describe, the global state is the only honest answer.
  const blank = launchWorker({ storage: { enabled: false } });
  await settle();
  assert.equal(blank.chrome.__calls.titles.at(-1), "Decaf — off");
  assert.equal(D.getSite("https://example.com/"), null);
});

/**
 * Installing Decaf from a YouTube tab used to do nothing to that tab, and every
 * update tore the content script out of every open tab and put nothing back
 * until the next navigation. Both times the extension is working perfectly and
 * looks completely broken.
 */
test("install and update put Decaf into tabs that are already open", async () => {
  for (const reason of ["install", "update"]) {
    const worker = launchWorker({
      tabs: [
        { id: 7, url: "https://www.youtube.com/" },
        { id: 9, url: "https://www.reddit.com/r/all/" }
      ]
    });
    await settle();
    worker.chrome.__calls.fire("installed", { reason });
    await settle(6);

    const injected = worker.chrome.__calls.injected;
    assert.equal(injected.length, 4, `${reason}: css and js for both tabs`);
    assert.equal(injected[0].files.join(), "content.css", "the stylesheet lands first");
    assert.equal(injected[1].files.join(), "core.js,content.js");
    assert.equal(injected.map((call) => call.target.tabId).sort().join(), "7,7,9,9");
    assert.equal(worker.chrome.__calls.openedOptions, reason === "install" ? 1 : 0);
  }
});

test("a site the person added gets a content script registered for it", async () => {
  const worker = launchWorker({ storage: { custom: { "news.ycombinator.com": { label: "HN", enabled: true } } } });
  await settle();
  worker.chrome.__calls.fire("installed", { reason: "update" });
  await settle(6);
  const registered = worker.chrome.__calls.registered;
  assert.equal(registered.length, 1);
  assert.equal(registered[0].id, "decaf-custom");
  assert.equal(registered[0].matches.join(), "*://*.news.ycombinator.com/*");
  assert.equal(registered[0].js.join(), "core.js,content.js");
  assert.equal(registered[0].runAt, "document_start");
});

/**
 * A clock rolled forward past a Lock's end and back again used to defeat it
 * permanently: the baseline was deleted the moment it looked expired, every
 * switch could then be turned off, and when the clock came back the Lock was
 * "running" again with nothing left to enforce — still claiming to hold
 * everything, holding nothing.
 */
test("a lock is not ended by a clock that moved", async () => {
  const D = require("../core.js");
  const lockUntil = Date.now() + 3600000;
  const worker = launchWorker({
    storage: {
      lockUntil,
      pauseFeeds: false,
      lockBaseline: { lockUntil, enabled: true, pauseFeeds: true },
      // The worker has already seen a moment well past the lock's end: the clock
      // was wound forward and back.
      clockSeen: lockUntil + 86400000
    }
  });
  await settle();
  const store = worker.chrome.__store;
  assert.equal(store.pauseFeeds, true, "the floor still repairs");
  assert.ok(store.lockBaseline, "and the baseline is still there to repair from");
  assert.equal(D.isLocked(D.mergeSettings(store)), true);
});

/**
 * A Lock can be added to. What is added has to be held too, or a switch turned
 * on during a Lock is the one thing the Lock does not cover.
 */
test("a lock's floor rises to meet settings that got stronger", async () => {
  const lockUntil = Date.now() + 3600000;
  const worker = launchWorker({
    storage: {
      lockUntil,
      upsideDown: true,
      lockBaseline: { lockUntil, enabled: true, pauseFeeds: true, upsideDown: false }
    }
  });
  await settle();
  assert.equal(worker.chrome.__store.lockBaseline.upsideDown, true, "the new switch joins the floor");
});

test("the card can ask for the settings page, because nothing else on it can", async () => {
  const worker = launchWorker();
  await settle();
  worker.chrome.__calls.fire("message", { type: "open-options" }, {}, () => {});
  assert.equal(worker.chrome.__calls.openedOptions, 1);
});
