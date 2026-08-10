#!/usr/bin/env node
/**
 * Measures two things a functional test cannot see: how hard the content script
 * works while it sits on a page, and how long the popup takes to paint.
 *
 *   npm run build && node tools/perf-probe.js
 *
 * Both numbers are taken from the outside. Main-thread responsiveness is the
 * honest proxy for "the extension feels slow": a trivial expression is evaluated
 * in the page every 50ms and the lateness of each answer is recorded, so a
 * content script in a hot loop shows up as latency the same way a person feels
 * it. Storage writes are counted in the worker, because a write storm there
 * wakes every other context in the extension.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const playwright = require("playwright");
const { serveAll, url } = require("./fixture-site.js");

const dist = path.join(__dirname, "..", "dist");

async function measureLatency(page, ms) {
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < ms) {
    const at = Date.now();
    await page.evaluate("1");
    samples.push(Date.now() - at);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length / 2)] || 0,
    worst: samples.at(-1) || 0,
    over100: samples.filter((value) => value > 100).length
  };
}

async function main() {
  if (!fs.existsSync(dist)) throw new Error("run `npm run build` first");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-perf-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  });

  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).hostname;
    await serveAll(context);

    // Count every storage write the worker makes, from inside the worker.
    await worker.evaluate(() => {
      globalThis.__writes = 0;
      const real = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = (...args) => {
        globalThis.__writes += 1;
        return real(...args);
      };
    });

    const order = process.argv[2] === "reverse" ? -1 : 1;
    const cases = [
      ["facebook", "/", "Facebook home feed"],
      ["facebook", "/marketplace/", "Facebook Marketplace"],
      ["youtube", "/", "YouTube home feed"],
      ["reddit", "/r/fixit/", "a subreddit front page"]
    ];
    if (order < 0) cases.reverse();

    /*
     * One throwaway page first. The very first measured page otherwise absorbs
     * every one-off cost in the browser — worker start, route interception,
     * JIT — and reads as a site-specific problem when it is nothing of the kind.
     * That is exactly what a first run of this probe reported.
     */
    const warmup = await context.newPage();
    await warmup.goto(url("youtube", "/"));
    await warmup.waitForLoadState("domcontentloaded");
    await measureLatency(warmup, 2000);
    await warmup.close();

    console.log("main-thread lateness while the page just sits there (ms)\n");
    for (const [site, route, label] of cases) {
      const page = await context.newPage();
      await page.goto(url(site, route));
      await page.waitForLoadState("domcontentloaded");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const before = await worker.evaluate(() => globalThis.__writes);
      const latency = await measureLatency(page, 6000);
      const writes = (await worker.evaluate(() => globalThis.__writes)) - before;
      console.log(
        `  ${label.padEnd(26)} median ${String(latency.median).padStart(4)}  ` +
        `worst ${String(latency.worst).padStart(5)}  over100 ${String(latency.over100).padStart(3)}  ` +
        `worker writes ${writes}`
      );
      await page.close();
    }

    console.log("\nextension UI paint (ms)\n");
    const surfaces = [
      ["popup", "popup.html", "#lock-button"],
      ["popup", "popup.html", "#lock-button"],
      ["options", "options.html", "#lock-button"],
      ["options", "options.html", "#lock-button"]
    ];
    for (const [label, file, selector] of surfaces) {
      const page = await context.newPage();
      const at = Date.now();
      await page.goto(`chrome-extension://${extensionId}/${file}`);
      await page.locator(selector).waitFor({ state: "visible", timeout: 20000 });
      console.log(`  ${label.padEnd(8)} ${Date.now() - at} ms`);
      await page.close();
    }

    // The popup with the active tab on a supported site, which is the only
    // configuration where it talks to a content script at all.
    const feed = await context.newPage();
    await feed.goto(url("facebook", "/"));
    await feed.waitForLoadState("domcontentloaded");
    await feed.bringToFront();
    const popup = await context.newPage();
    const at = Date.now();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator("#lock-button").waitFor({ state: "visible", timeout: 20000 });
    console.log(`  ${"popup*".padEnd(8)} ${Date.now() - at} ms  (a Facebook feed tab in front)`);
    await popup.close();
    await feed.close();
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
