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
  assert.equal(worker.warnings.length, 1, "and the failure is not silent");
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
