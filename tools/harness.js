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
function createChrome({
  storage = {},
  tabUrl = "",
  deferGet = false,
  failIcon = false,
  tabs = null,
  failSet = false
} = {}) {
  const store = copy(storage) || {};
  const listeners = [];
  const calls = {
    icons: [],
    titles: [],
    alarms: [],
    openedOptions: 0,
    injected: [],
    badges: [],
    messages: [],
    registered: [],
    permissions: []
  };
  const events = {};
  const event = (name) => {
    if (!events[name]) {
      events[name] = {
        handlers: [],
        addListener(handler) { this.handlers.push(handler); },
        removeListener(handler) {
          const index = this.handlers.indexOf(handler);
          if (index >= 0) this.handlers.splice(index, 1);
        }
      };
    }
    return events[name];
  };
  calls.fire = (name, ...args) => {
    const results = [];
    for (const handler of event(name).handlers.slice()) results.push(handler(...args));
    return results;
  };
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
          if (failSet) throw new Error("Extension context invalidated.");
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
      lastError: undefined,
      getManifest: () => JSON.parse(read("manifest.json")),
      openOptionsPage: () => {
        calls.openedOptions += 1;
      },
      async sendMessage(message) {
        calls.messages.push(message);
        return calls.fire("message", message, { id: "decaf-test" }, () => {})[0];
      },
      onInstalled: event("installed"),
      onStartup: event("startup"),
      onMessage: event("message")
    },
    tabs: {
      async query(request = {}) {
        const list = tabs || [{ url: chrome.__tabUrl, id: 1, active: true }];
        if (!request.url) return copy(list);
        return copy(list.filter((tab) => tab.url));
      },
      async get(tabId) {
        const list = tabs || [{ url: chrome.__tabUrl, id: 1, active: true }];
        return copy(list.find((tab) => tab.id === tabId)) || { id: tabId, url: chrome.__tabUrl };
      },
      async sendMessage(tabId, message) {
        calls.messages.push({ tabId, message });
        if (chrome.__tabReply === undefined) throw new Error("Receiving end does not exist.");
        return copy(chrome.__tabReply);
      },
      onActivated: event("tabActivated"),
      onUpdated: event("tabUpdated"),
      onRemoved: event("tabRemoved")
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: event("windowFocus"),
      async getLastFocused() {
        return { id: 1 };
      }
    },
    scripting: {
      async executeScript(details) {
        calls.injected.push(details);
        return [{ result: null }];
      },
      async insertCSS(details) {
        calls.injected.push(details);
      },
      async registerContentScripts(list) {
        calls.registered.push(...list);
      },
      async unregisterContentScripts() {},
      async getRegisteredContentScripts() {
        return copy(calls.registered);
      }
    },
    permissions: {
      async request(request) {
        calls.permissions.push(request);
        return chrome.__grantPermissions !== false;
      },
      async remove() {
        return true;
      },
      async contains() {
        return chrome.__grantPermissions !== false;
      }
    },
    action: {
      async setIcon(details) {
        if (failIcon) throw new Error(`Could not load icon '${details.path?.[32] || "?"}' specified in 'icons'.`);
        calls.icons.push(details.path?.[16] || "");
      },
      async setTitle(details) {
        calls.titles.push(details.title);
      },
      async setBadgeText(details) {
        calls.badges.push(details.text);
      },
      async setBadgeBackgroundColor() {}
    },
    alarms: {
      async create(name, info) {
        calls.alarms.push({ name, info });
      },
      async clear() {},
      onAlarm: event("alarm")
    },
    __tabUrl: tabUrl,
    __tabReply: undefined,
    __grantPermissions: true,
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
async function launchPage({
  url,
  storage = {},
  html = PAGE,
  deferGet = false,
  trustEvents = true,
  topFrame = true
} = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.chrome = createChrome({ storage, deferGet });
  window.eval(read("core.js"));
  window.eval(read("content.js"));
  // Decaf refuses events a script dispatched, and everything jsdom can dispatch
  // is one. A test standing in for a person says so; a test proving the guard
  // works calls `api.trustSynthetic(false)` first.
  if (trustEvents) window.__decaf?.trustSynthetic(true);
  // jsdom's window.top cannot be redefined and its iframes have no URL of their
  // own, so a subframe is stood in for through the same isolated-world hook.
  if (!topFrame) window.__decaf?.setTopFrame(false);
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
async function launchExtensionPage(page, { storage = {}, tabUrl = "", failSet = false, tabReply } = {}) {
  const html = read(page).replace(/<script[^>]*><\/script>/g, "");
  const scripts = Array.from(read(page).matchAll(/<script src="([^"]+)"><\/script>/g)).map((match) => match[1]);
  const dom = new JSDOM(html, {
    url: `chrome-extension://decaf-test/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.chrome = createChrome({ storage, tabUrl, failSet });
  window.chrome.__tabReply = tabReply;
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
function launchWorker({ storage = {}, failIcon = false, tabs = null, tabUrl = "" } = {}) {
  const vm = require("node:vm");
  const chrome = createChrome({ storage, failIcon, tabs, tabUrl });
  const warnings = [];
  const logger = { ...console, warn: (...args) => warnings.push(args.join(" ")) };
  // A fresh vm context has the ECMAScript built-ins and nothing else. A service
  // worker has the web platform's too, and core.js parses URLs.
  const context = vm.createContext({
    chrome,
    console: logger,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    structuredClone
  });
  vm.runInContext(`this.importScripts = () => {};`, context);
  vm.runInContext(read("core.js"), context);
  vm.runInContext(read("background.js"), context);
  return { chrome, context, warnings };
}

/**
 * Decaf refuses events a page synthesised — its elements live in the page, so a
 * site could otherwise dispatch a `pointerdown` on the hold button, wait three
 * seconds and hand itself a pass. jsdom dispatches with `isTrusted: false` like
 * any script would, so a test standing in for a person has to say so.
 */
function asUserEvent(event) {
  // jsdom defines `isTrusted` as a non-configurable own property, so it cannot
  // be faked on the event itself. `launchPage` tells content.js to accept
  // synthetic events instead, through the isolated-world hook a page cannot
  // reach. This wrapper stays so the intent is readable at the call site.
  return event;
}

function click(element, init = {}) {
  const view = element.ownerDocument.defaultView;
  element.dispatchEvent(asUserEvent(new view.MouseEvent("click", { bubbles: true, detail: 1, ...init })));
}

/** A click with no press behind it, which is how assistive technology activates. */
function activate(element) {
  click(element, { detail: 0 });
}

/** A click a page made, which Decaf must ignore. */
function scriptedClick(element) {
  const view = element.ownerDocument.defaultView;
  element.dispatchEvent(new view.MouseEvent("click", { bubbles: true, detail: 1 }));
}

function toggle(input, value) {
  input.checked = value;
  input.dispatchEvent(asUserEvent(new input.ownerDocument.defaultView.Event("change", { bubbles: true })));
}

module.exports = { root, read, createChrome, settle, wait, until, launchPage, launchExtensionPage, launchWorker, click, activate, scriptedClick, asUserEvent, toggle, PAGE };
