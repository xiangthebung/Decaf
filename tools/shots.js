#!/usr/bin/env node
/**
 * Dev-only helper: screenshots the paused feed, the popup and the settings page
 * from a real Chromium with the extension loaded.
 * Requires `npm install --no-save playwright`.
 *
 *   node tools/shots.js /tmp/decaf-shots
 */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const playwright = require("playwright");

const root = path.resolve(__dirname, "..");
const out = process.argv[2] || path.join(os.tmpdir(), "decaf-shots");

/** A stand-in for a feed page: site chrome around a feed container. */
const FIXTURE = `<!doctype html><html><head><title>YouTube</title>
<style>
  :root { color-scheme: light dark }
  body { margin:0; font:15px system-ui; background:#fff; color:#0f0f0f }
  header { border-bottom:1px solid #ddd }
  @media (prefers-color-scheme: dark) {
    body { background:#0f0f0f; color:#f1f1f1 }
    header { border-color:#303030 }
    input { background:#121212; border-color:#303030; color:#f1f1f1 }
  }
</style></head>
<body>
  <header style="display:flex;gap:16px;align-items:center;height:56px;padding:0 16px">
    <strong>YouTube</strong>
    <input type="search" placeholder="Search" style="flex:0 0 420px;padding:8px 12px;border:1px solid #ccc;border-radius:999px">
  </header>
  <div style="display:flex">
    <nav style="width:200px;padding:16px;color:#444">Home<br><br>Subscriptions<br><br>You<br><br>History</nav>
    <div id="page-manager" style="flex:1;padding:16px">
      <ytd-browse page-subtype="home">
        <ytd-rich-grid-renderer style="display:block">
          <article>Feed content that should never be seen.</article>
        </ytd-rich-grid-renderer>
      </ytd-browse>
    </div>
  </div>
  <div id="movie_player" style="display:none"><video></video></div>
</body></html>`;

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(FIXTURE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-shots-"));

  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 700 },
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      "--host-resolver-rules=MAP www.youtube.com 127.0.0.1,EXCLUDE localhost"
    ]
  });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname;

  for (const scheme of ["light", "dark"]) {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`http://www.youtube.com:${port}/`);
    await page.waitForSelector(".decaf-notice");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `paused-${scheme}.png`) });
    await page.close();

    const options = await context.newPage();
    await options.emulateMedia({ colorScheme: scheme });
    await options.goto(`chrome-extension://${id}/options.html`);
    // Let the switches finish sliding, or the shot shows every one of them off.
    await options.waitForTimeout(500);
    await options.screenshot({ path: path.join(out, `options-${scheme}.png`), fullPage: true });
    await options.close();

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 328, height: 460 });
    await popup.emulateMedia({ colorScheme: scheme });
    // The popup normally reads the tab behind it; there is no toolbar here.
    await popup.addInitScript(() => {
      chrome.tabs.query = async () => [{ url: "https://www.youtube.com/", id: 1 }];
    });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForTimeout(500);
    await popup.screenshot({ path: path.join(out, `popup-${scheme}.png`) });
    await popup.close();
  }

  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`screenshots in ${out}\n`);
}

main();
