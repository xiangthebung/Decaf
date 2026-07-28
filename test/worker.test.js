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
