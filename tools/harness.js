/**
 * Test harness: a small chrome.* stub plus helpers that run the real extension
 * sources inside jsdom. Nothing here mocks Decaf's own logic.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * `failIcon` makes `chrome.action.setIcon` reject, the way Chrome does when an
 * icon file named in the manifest or in background.js is not actually in the
 * build. It exists so a test can prove the toolbar's title survives a missing
 * picture — a build that dropped one PNG once stopped the icon *and* the title
 * from tracking Decaf's state at all.
 */
function createChrome({ storage = {}, tabUrl = "", deferGet = false, failIcon = false } = {}) {
  const store = copy(storage) || {};
  const listeners = [];
  const calls = { icons: [], titles: [], alarms: [], openedOptions: 0 };
  let gate = deferGet ? new Promise((resolve) => { calls.release = resolve; }) : null;

  const notify = (changes) => {
    for (const listener of listeners.slice()) listener(changes, "local");
  };

  const chrome = {
    storage: {
      local: {
        async get(request) {
          if (gate) {
            await gate;
            gate = null;
          }
          const keys = typeof request === "string" ? { [request]: undefined } : request || {};
          const result = {};
          for (const [key, fallback] of Object.entries(keys)) {
            result[key] = Object.hasOwn(store, key) ? copy(store[key]) : copy(fallback);
          }
          return result;
        },
        async set(patch) {
          const changes = {};
          for (const [key, value] of Object.entries(patch)) {
            changes[key] = { oldValue: copy(store[key]), newValue: copy(value) };
            store[key] = copy(value);
          }
          notify(changes);
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          const changes = {};
          for (const key of list) {
            if (!Object.hasOwn(store, key)) continue;
            changes[key] = { oldValue: copy(store[key]), newValue: undefined };
            delete store[key];
          }
          if (Object.keys(changes).length) notify(changes);
        },
        async clear() {
          for (const key of Object.keys(store)) delete store[key];
        }
      },
      onChanged: {
        addListener: (listener) => listeners.push(listener),
        removeListener: (listener) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        }
      }
    },
    runtime: {
      id: "decaf-test",
      getManifest: () => JSON.parse(read("manifest.json")),
      openOptionsPage: () => {
        calls.openedOptions += 1;
      },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} }
    },
    tabs: {
      async query() {
        return [{ url: chrome.__tabUrl, id: 1, active: true }];
      }
    },
    action: {
      async setIcon(details) {
        if (failIcon) throw new Error(`Could not load icon '${details.path?.[32] || "?"}' specified in 'icons'.`);
        calls.icons.push(details.path?.[16] || "");
      },
      async setTitle(details) {
        calls.titles.push(details.title);
      }
    },
    alarms: {
      async create(name, info) {
        calls.alarms.push({ name, info });
      },
      async clear() {},
      onAlarm: { addListener: () => {} }
    },
    __tabUrl: tabUrl,
    __store: store,
    __calls: calls
  };
  return chrome;
}

/** Lets pending promises, timers and observer callbacks run. */
async function settle(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(predicate, { timeout = 2000, interval = 10 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await wait(interval);
  }
}

const PAGE = `<!doctype html><html><head><title>Test page</title></head><body></body></html>`;

/** Boots core.js + content.js against a jsdom page, exactly as Chrome would. */
async function launchPage({ url, storage = {}, html = PAGE, deferGet = false } = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.chrome = createChrome({ storage, deferGet });
  window.eval(read("core.js"));
  window.eval(read("content.js"));
  await settle();
  return {
    dom,
    window,
    document: window.document,
    chrome: window.chrome,
    decaf: window.Decaf,
    api: window.__decaf,
    state: () => window.__decaf.state(),
    close: () => {
      try {
        window.__decaf.teardown();
      } catch (_) {
        // Already torn down.
      }
      window.close();
    }
  };
}

/** Boots one of the extension's own pages (popup or options) inside jsdom. */
async function launchExtensionPage(page, { storage = {}, tabUrl = "" } = {}) {
  const html = read(page).replace(/<script[^>]*><\/script>/g, "");
  const scripts = Array.from(read(page).matchAll(/<script src="([^"]+)"><\/script>/g)).map((match) => match[1]);
  const dom = new JSDOM(html, {
    url: `chrome-extension://decaf-test/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.chrome = createChrome({ storage, tabUrl });
  for (const script of scripts) window.eval(read(script));
  await settle();
  return {
    dom,
    window,
    document: window.document,
    chrome: window.chrome,
    decaf: window.Decaf,
    $: (id) => window.document.getElementById(id),
    close: () => window.close()
  };
}

/** Runs background.js in a service-worker-like context. */
function launchWorker({ storage = {}, failIcon = false } = {}) {
  const vm = require("node:vm");
  const chrome = createChrome({ storage, failIcon });
  const warnings = [];
  const logger = { ...console, warn: (...args) => warnings.push(args.join(" ")) };
  const context = vm.createContext({ chrome, console: logger });
  vm.runInContext(`this.importScripts = () => {};`, context);
  vm.runInContext(read("core.js"), context);
  vm.runInContext(read("background.js"), context);
  return { chrome, context, warnings };
}

function click(element) {
  element.dispatchEvent(new element.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }));
}

function toggle(input, value) {
  input.checked = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

module.exports = { root, read, createChrome, settle, wait, until, launchPage, launchExtensionPage, launchWorker, click, toggle, PAGE };
