const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sharedSource = fs.readFileSync(path.join(root, "shared.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");

function createBackgroundHarness(initialStorage) {
  const storage = { ...initialStorage };
  const removed = [];
  const icons = [];
  const titles = [];
  const alarms = { cleared: [], created: [] };
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const event = () => ({ addListener() {} });
  const context = {
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    globalThis: null
  };
  context.globalThis = context;
  context.importScripts = () => vm.runInNewContext(sharedSource, context);
  context.chrome = {
    runtime: {
      onInstalled: event(),
      onStartup: event()
    },
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...storage }),
        set: async (patch) => Object.assign(storage, patch),
        remove: async (key) => {
          removed.push(key);
          delete storage[key];
        }
      },
      onChanged: event()
    },
    action: {
      setIcon: async (value) => icons.push(value),
      setTitle: async (value) => {
        titles.push(value);
        resolveReady();
      }
    },
    alarms: {
      clear: async (name) => alarms.cleared.push(name),
      create: async (name, details) => alarms.created.push({ name, details }),
      onAlarm: event()
    }
  };

  vm.runInNewContext(backgroundSource, context);
  return { context, storage, removed, icons, titles, alarms, ready };
}

test("Focus Lock baseline survives a stale expired-lock write", async () => {
  const context = {};
  context.globalThis = context;
  context.URL = URL;
  vm.runInNewContext(sharedSource, context);
  const U = context.UnaddictifySettings;
  const lockUntil = Date.now() + 60_000;
  const baseline = U.mergeSettings({
    enabled: true,
    lockUntil,
    features: { monochrome: 75, stripMedia: false }
  });
  const bypassUntil = Date.now() + 5_000;
  const harness = createBackgroundHarness({
    enabled: false,
    lockUntil: 0,
    bypassUntil,
    features: { monochrome: 100, stripMedia: true },
    [U.LOCK_BASELINE_KEY]: baseline
  });

  await harness.ready;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.storage.lockUntil, lockUntil);
  assert.equal(harness.storage.enabled, true);
  assert.equal(harness.storage[U.LOCK_BASELINE_KEY].lockUntil, lockUntil);
  assert.equal(harness.storage.features.monochrome, 100);
  assert.equal(harness.storage.features.stripMedia, true);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.storage[U.LOCK_BASELINE_KEY].features)), JSON.parse(JSON.stringify(baseline.features)));
  assert.equal(harness.storage.bypassUntil, bypassUntil);
  const expiryAlarm = harness.alarms.created.at(-1);
  assert.equal(expiryAlarm.name, "blokamine-focus-lock-expiry");
  assert.equal(expiryAlarm.details.when, lockUntil + 100);
  assert.equal(harness.removed.includes(U.LOCK_BASELINE_KEY), false);
  assert.match(harness.icons.at(-1).path[16], /icon-locked16\.png$/);
});

test("expired Focus Lock baselines are removed and do not schedule expiry alarms", async () => {
  const context = {};
  context.globalThis = context;
  context.URL = URL;
  vm.runInNewContext(sharedSource, context);
  const U = context.UnaddictifySettings;
  const baseline = U.mergeSettings({ lockUntil: Date.now() - 1_000 });
  const harness = createBackgroundHarness({
    lockUntil: 0,
    [U.LOCK_BASELINE_KEY]: baseline
  });

  await harness.ready;

  assert.equal(harness.storage[U.LOCK_BASELINE_KEY], undefined);
  assert.deepEqual(harness.removed, [U.LOCK_BASELINE_KEY]);
  assert.equal(harness.alarms.created.length, 0);
  assert.match(harness.icons.at(-1).path[16], /icon16\.png$/);
});
