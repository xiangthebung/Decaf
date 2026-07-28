/**
 * A very small Chrome DevTools Protocol client, built on Node's own WebSocket.
 * Enough to open a tab, navigate, run a function in the page, and screenshot it —
 * and independent of any Playwright/Chrome version pairing.
 */
"use strict";

const ENDPOINT = process.env.DECAF_CDP || "http://127.0.0.1:9222";

async function http(path, method = "GET") {
  const response = await fetch(`${ENDPOINT}${path}`, { method });
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

class Tab {
  constructor(socket, id) {
    this.socket = socket;
    this.id = id;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}`));
        else resolve(message.result);
        return;
      }
      const waiting = this.events.get(message.method);
      if (waiting) {
        this.events.delete(message.method);
        waiting(message.params);
      }
    });
    // A page can take its renderer down with it. Without this, every pending
    // command would hang and Node would exit quietly mid-run.
    socket.addEventListener("close", () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error("the page closed the connection"));
      this.pending.clear();
      for (const resolve of this.events.values()) resolve(null);
      this.events.clear();
    });
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("the page closed the connection"));
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 45000);
    });
  }

  once(method, timeout = 45000) {
    return new Promise((resolve) => {
      this.events.set(method, resolve);
      setTimeout(() => {
        if (this.events.get(method) === resolve) this.events.delete(method);
        resolve(null);
      }, timeout);
    });
  }

  async goto(url) {
    await this.send("Page.enable");
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
  }

  /** Runs `fn(...args)` in the page and returns its value. */
  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map((value) => JSON.stringify(value)).join(",")})`;
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || "page threw");
    }
    return result.result?.value;
  }

  async screenshot(file) {
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    require("node:fs").writeFileSync(file, Buffer.from(shot.data, "base64"));
  }

  async wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close() {
    try {
      this.socket.close();
      await http(`/json/close/${this.id}`);
    } catch (_) {
      // The tab may already be gone.
    }
  }
}

async function version() {
  return http("/json/version");
}

async function targets() {
  return http("/json/list");
}

/** The id of the unpacked extension loaded from `root`, if it can be found. */
async function extensionId(root) {
  const list = await targets();
  const target = list.find((entry) => entry.url?.startsWith("chrome-extension://"));
  if (target) return new URL(target.url).hostname;
  // A sleeping service worker is not a target, so fall back to the profile.
  const fs = require("node:fs");
  const path = require("node:path");
  const dirs = [process.env.DECAF_PROFILE, path.join(require("node:os").homedir(), ".chrome-debug")].filter(Boolean);
  // Unpacked extensions are recorded in "Secure Preferences", not "Preferences".
  const files = dirs.flatMap((dir) => ["Secure Preferences", "Preferences"].map((name) =>
    path.join(dir, "Default", name)));
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(file, "utf8"))?.extensions?.settings || {};
    } catch (_) {
      continue;
    }
    for (const [id, value] of Object.entries(settings)) {
      if (value?.path && path.resolve(value.path) === path.resolve(root)) return id;
    }
  }
  return process.env.DECAF_EXT_ID || null;
}

/**
 * Reloads the unpacked extension, which is the only way a manifest change reaches
 * a running Chrome. Done from the extension's own options page, because an idle
 * MV3 service worker is not a debuggable target.
 */
async function reloadExtension(root) {
  const id = await extensionId(root);
  if (!id) throw new Error("could not find the extension — is it loaded in this Chrome?");
  const tab = await openTab(`chrome-extension://${id}/options.html`);
  try {
    await tab.goto(`chrome-extension://${id}/options.html`);
    await tab.evaluate(() => chrome.runtime.reload());
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await tab.close();
  }
  return id;
}

/** Opens a fresh tab and connects to it. */
async function openTab(url = "about:blank") {
  const target = await http(`/json/new?${encodeURIComponent(url)}`, "PUT");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("could not connect to the tab")), { once: true });
  });
  return new Tab(socket, target.id);
}

module.exports = { version, openTab, targets, extensionId, reloadExtension, ENDPOINT };
