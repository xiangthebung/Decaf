#!/usr/bin/env node
/**
 * Asks a running Chrome why the toolbar button does nothing.
 *
 *   chrome --remote-debugging-port=9222 --user-data-dir=<scratch profile>
 *   node tools/popup-why.js
 *
 * A popup that does not appear at all is a different fault from a popup that is
 * slow, and none of the timing probes here can see it: they load popup.html as a
 * page, which always works. What decides whether the real button opens anything
 * is the action's own per-tab state, so that is what this reads —
 * `getPopup`, `isEnabled`, the registered commands, and whatever the worker last
 * logged.
 *
 * Reads only. It never navigates, clicks or types.
 */
"use strict";

const ENDPOINT = process.env.DECAF_CDP || "http://127.0.0.1:9222";

async function targets() {
  const response = await fetch(`${ENDPOINT}/json/list`);
  return response.json();
}

let nextId = 1;

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("cannot connect")), { once: true });
  });
  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    return { __error: result.exceptionDetails.exception?.description || result.exceptionDetails.text };
  }
  return result.result.value;
}

async function main() {
  const list = await targets();
  const workers = list.filter((target) => target.type === "service_worker");

  let decaf = null;
  for (const worker of workers) {
    const session = connect(worker.webSocketDebuggerUrl);
    try {
      await session.ready;
      const name = await evaluate(session, "chrome.runtime.getManifest().name");
      if (name === "Decaf") {
        decaf = { worker, session };
        break;
      }
      session.close();
    } catch (_) {
      session.close();
    }
  }

  if (!decaf) {
    console.log("Decaf's service worker is not running in this Chrome.");
    console.log("Extensions with a worker right now:");
    for (const worker of workers) console.log(`  ${worker.url}`);
    process.exit(1);
  }

  const { session } = decaf;
  const id = new URL(decaf.worker.url).hostname;
  console.log(`Decaf is ${id}\n`);

  const report = await evaluate(session, `(async () => {
    const manifest = chrome.runtime.getManifest();
    const tabs = await chrome.tabs.query({});
    const active = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0] || null;
    const perTab = [];
    for (const tab of tabs.slice(0, 12)) {
      perTab.push({
        id: tab.id,
        url: String(tab.url || "").slice(0, 60),
        active: Boolean(tab.active),
        popup: await chrome.action.getPopup({ tabId: tab.id }),
        enabled: await chrome.action.isEnabled(tab.id),
        title: await chrome.action.getTitle({ tabId: tab.id })
      });
    }
    let commands = [];
    try { commands = (await chrome.commands.getAll()).map((c) => c.name + ' = ' + (c.shortcut || '(unassigned)')); } catch (_) {}
    return {
      version: manifest.version,
      defaultPopup: manifest.action && manifest.action.default_popup,
      globalPopup: await chrome.action.getPopup({}),
      globalEnabled: await chrome.action.isEnabled(),
      activeTab: active ? { id: active.id, url: String(active.url || '').slice(0, 60) } : null,
      tabCount: tabs.length,
      perTab,
      commands
    };
  })()`);

  if (report?.__error) {
    console.log(`the worker threw: ${report.__error}`);
    process.exit(1);
  }

  console.log(`version           ${report.version}`);
  console.log(`manifest popup    ${report.defaultPopup}`);
  console.log(`action popup      ${JSON.stringify(report.globalPopup)}`);
  console.log(`action enabled    ${report.globalEnabled}`);
  console.log(`open tabs         ${report.tabCount}`);
  console.log(`active tab        ${report.activeTab ? report.activeTab.url : "(none)"}`);
  console.log(`\ncommands`);
  for (const command of report.commands) console.log(`  ${command}`);
  console.log(`\nper tab`);
  for (const tab of report.perTab) {
    const flag = tab.popup && tab.enabled ? "ok  " : "BAD ";
    console.log(`  ${flag} enabled=${String(tab.enabled).padEnd(5)} popup=${(tab.popup || "(empty)").split("/").pop().padEnd(12)} ${tab.active ? "*" : " "} ${tab.url}`);
  }

  // Whatever the worker has complained about since it started.
  const logs = await evaluate(session, "String(globalThis.__decafWarnings || '')");
  if (logs) console.log(`\nworker warnings: ${logs}`);

  session.close();
}

main().catch((error) => {
  console.error(`could not reach Chrome at ${ENDPOINT}: ${error.message}`);
  process.exit(2);
});
