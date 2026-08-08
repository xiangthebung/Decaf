#!/usr/bin/env node
/**
 * Reports the markup around every reward count Decaf left showing on a page.
 *
 *   chrome --remote-debugging-port=9222 --user-data-dir=<scratch profile>
 *   node tools/count-probe.js https://www.tiktok.com/@someone/video/123
 *
 * `tools/audit.js` says how many counts survived; this says what they look like,
 * which is what you need to write the rule. Reads only — no clicks, no typing.
 */
"use strict";

const ENDPOINT = process.env.DECAF_CDP || "http://127.0.0.1:9222";
const url = process.argv[2];
const wait = Number(process.argv[3] || 9000);
const mode = process.argv.includes("--masked");

if (!url) {
  console.error("usage: node tools/count-probe.js <url> [wait-ms]");
  process.exit(2);
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

/* Runs in the page. Kept as a function so no escaping is involved. */
function survey(masked) {
  const BARE = masked ? /^\s*—\s*$/ :/^\s*\d[\d.,   ]*\s*[KkMmBb]?\+?\s*$/;
  const ATTRS = ["data-e2e", "data-testid", "data-a-target", "class", "id", "aria-label", "title"];
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = (node.nodeValue || "").trim();
    const element = node.parentElement;
    if (value && (masked || value !== "—") && BARE.test(value) && element && !element.closest("[data-decaf-own]")) {
      const chain = [];
      let current = element;
      for (let depth = 0; depth < 4 && current && current !== document.documentElement; depth += 1) {
        const parts = [current.localName];
        for (const name of ATTRS) {
          const attribute = current.getAttribute && current.getAttribute(name);
          if (attribute) parts.push(`${name}="${String(attribute).slice(0, 46)}"`);
        }
        chain.push(parts.join(" "));
        current = current.parentElement;
      }
      const control = element.closest("a,button,[role='button'],[role='link']");
      found.push({ value, chain, hasControl: Boolean(control) });
      if (found.length >= 10) break;
    }
    node = walker.nextNode();
  }
  return JSON.stringify({
    classes: Array.from(document.documentElement.classList).filter((name) => name.startsWith("decaf-")),
    dashes: document.body.innerText.split("—").length - 1,
    found
  });
}

async function main() {
  const target = await (await fetch(`${ENDPOINT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const session = connect(target.webSocketDebuggerUrl);
  try {
    await session.ready;
    await new Promise((resolve) => setTimeout(resolve, wait));
    const result = await session.send("Runtime.evaluate", {
      expression: `(${survey.toString()})(${JSON.stringify(mode)})`,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      console.log("page threw:", result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return;
    }
    const report = JSON.parse(result.result.value);
    console.log(`root classes : ${report.classes.join(" ") || "(none — Decaf is not running here)"}`);
    console.log(`dashes on page: ${report.dashes}`);
    console.log(`${mode ? "masked found " : "counts left  "} : ${report.found.length}${report.found.length >= 10 ? "+ (capped)" : ""}\n`);
    for (const item of report.found) {
      console.log(`  "${item.value}"   control=${item.hasControl}`);
      item.chain.forEach((line, index) => console.log(`      ${index === 0 ? "self " : `  ^${index} `} ${line}`));
      console.log("");
    }
  } finally {
    session.close();
    await fetch(`${ENDPOINT}/json/close/${target.id}`).catch(() => null);
  }
}

main().catch((error) => {
  console.error(`could not reach Chrome at ${ENDPOINT}: ${error.message}`);
  process.exit(2);
});
