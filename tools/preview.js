/**
 * A dev server for the two extension pages, so their design can be seen and
 * iterated on in an ordinary browser tab without loading the extension.
 *
 *   node tools/preview.js            # http://localhost:8990/popup.html
 *                                    # http://localhost:8990/options.html
 *
 * The pages run against a small in-memory `chrome` stub injected ahead of
 * core.js, so every state is reachable from the address bar:
 *
 *   /popup.html?tab=https://www.reddit.com/          which tab the popup sees
 *   /popup.html?store={"enabled":false}              initial storage, as JSON
 *   /popup.html?tab=...&store={"lockUntil":...}      combined
 *
 * Nothing here ships: the build's allowlist copies none of tools/.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8990;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

/**
 * The stub mirrors tools/harness.js's createChrome, minus everything the two
 * pages never call. State lives in this tab; a reload starts clean.
 */
const STUB = `
(() => {
  const params = new URLSearchParams(location.search);
  let store = {};
  try { store = JSON.parse(params.get("store") || "{}"); } catch (_) {}
  const tabUrl = params.get("tab") || "https://www.youtube.com/";
  const listeners = [];
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.chrome = {
    storage: {
      local: {
        async get(request) {
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
          for (const listener of listeners.slice()) listener(changes, "local");
        },
        async remove(keys) {
          for (const key of [].concat(keys)) delete store[key];
        }
      },
      onChanged: { addListener: (l) => listeners.push(l), removeListener: () => {} }
    },
    runtime: {
      id: "decaf-preview",
      getManifest: () => ({ version: "preview" }),
      openOptionsPage: () => { location.href = "/options.html" + location.search; },
      async sendMessage() { return undefined; }
    },
    tabs: {
      async query() { return [{ url: tabUrl, id: 1, active: true }]; },
      async sendMessage() { throw new Error("no content script in a preview"); }
    },
    permissions: {
      async request() { return true; },
      async remove() { return true; }
    }
  };
})();
`;

http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://x").pathname;
  const file = path.join(root, pathname === "/" ? "popup.html" : pathname.slice(1));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("not found");
    return;
  }
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  let body = fs.readFileSync(file);
  if (file.endsWith(".html")) {
    body = body.toString().replace("<head>", "<head><script>" + STUB + "</script>");
  }
  response.writeHead(200, { "content-type": type }).end(body);
}).listen(PORT, () => {
  console.log(`preview: http://localhost:${PORT}/popup.html and /options.html`);
  console.log("state via query: ?tab=https://www.reddit.com/ and ?store={...}");
});
