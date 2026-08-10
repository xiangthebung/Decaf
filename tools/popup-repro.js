#!/usr/bin/env node
/**
 * Reproduces a reported sequence: open the popup, click the page, open it again.
 *
 *   npm run build && node tools/popup-repro.js
 *
 * The page under it is deliberately heavy and deliberately noisy — thousands of
 * nodes with counts in them, mutating continuously — because a quiet fixture
 * cannot show a cost that only appears on a real feed. Each popup open is timed
 * to *first paint of real content*, not to load: the popup renders before it
 * asks the tab anything, so "the popup appeared" and "the popup is useful" are
 * different moments and only the first one is the one a person waits for.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const playwright = require("playwright");

const dist = path.join(__dirname, "..", "dist");
const ORIGIN = "https://www.facebook.com";

/* A stand-in for a busy feed: deep, wide, full of counts, and never still. */
const HEAVY = `<!doctype html>
<html><head><title>(3) Facebook</title></head><body>
  <header id="masthead"><input id="site-search" type="search"></header>
  <div role="main" id="page-main">
    <div role="feed" id="feed"></div>
  </div>
  <div role="dialog" aria-label="Chat with Denise" id="dock">
    <div role="main" id="dock-main"></div>
  </div>
  <script>
    const feed = document.getElementById('feed');
    const dock = document.getElementById('dock-main');
    function post(index) {
      const article = document.createElement('div');
      article.setAttribute('role', 'article');
      article.innerHTML =
        '<div class="body"><p>Post ' + index + '</p></div>' +
        '<div class="bar">' +
          '<button aria-label="Like"><span>' + (1000 + index) + '</span></button>' +
          '<button aria-label="Comment"><span>' + index + '</span></button>' +
          '<span>' + (index * 7) + ' shares</span>' +
        '</div>';
      return article;
    }
    for (let index = 0; index < 400; index += 1) feed.append(post(index));
    for (let index = 0; index < 40; index += 1) {
      const message = document.createElement('div');
      message.setAttribute('role', 'article');
      message.className = 'msg';
      message.textContent = 'Message ' + index;
      dock.append(message);
    }
    /*
     * A real feed keeps changing, but at a human rate. An earlier version of
     * this appended eight posts a second forever and rewrote every count four
     * times a second; it hung the probe outright, which says more about the
     * fixture than about the extension. This is closer to a feed that is being
     * scrolled: a new item roughly once a second, counts ticking every few.
     */
    let next = 400;
    setInterval(() => { feed.append(post(next++)); }, 900);
    setInterval(() => {
      for (const span of feed.querySelectorAll('.bar span')) {
        span.textContent = String(Number(span.textContent.replace(/\\D/g, '') || 0) + 1);
      }
    }, 3000);
  </script>
</body></html>`;

async function openPopup(context, extensionId, label) {
  const page = await context.newPage();
  const at = Date.now();
  let painted = null;
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // First useful paint: the lock card is rendered from settings, so its presence
  // means the popup has read storage and drawn itself.
  try {
    await page.locator("#lock-button").waitFor({ state: "visible", timeout: 20000 });
    painted = Date.now() - at;
  } catch (_) {
    painted = null;
  }
  // Then the part that needs the tab to answer.
  let probed = null;
  try {
    await page.locator("#site-card").waitFor({ state: "visible", timeout: 20000 });
    probed = Date.now() - at;
  } catch (_) {
    probed = null;
  }
  console.log(`  ${label.padEnd(34)} painted ${String(painted === null ? "TIMEOUT" : painted).padStart(7)} ms   site card ${probed === null ? "never" : `${probed} ms`}`);
  await page.close();
  return painted;
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-repro-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).hostname;
    await context.route(`${ORIGIN}/**`, (route) => route.fulfill({
      status: 200, contentType: "text/html; charset=utf-8", body: HEAVY
    }));

    const page = await context.newPage();
    await page.goto(`${ORIGIN}/`);
    await page.locator(".decaf-notice").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log("\nthe reported sequence, on a heavy mutating feed\n");
    await openPopup(context, extensionId, "1. first open");

    await page.bringToFront();
    await page.mouse.click(400, 300);
    await page.waitForTimeout(300);
    await openPopup(context, extensionId, "2. after clicking the page");

    await page.bringToFront();
    await page.mouse.click(420, 320);
    await page.waitForTimeout(300);
    await openPopup(context, extensionId, "3. click, open again");

    console.log("\nrepeated opens with no clicking in between\n");
    for (let index = 0; index < 3; index += 1) {
      await openPopup(context, extensionId, `   open ${index + 1}`);
    }

    /*
     * The measurement the popup timings above cannot make.
     *
     * Opening popup.html as a tab means its own `chrome.tabs.query({active:true})`
     * finds *itself*, not the feed — so the popup never reaches the branch that
     * asks the tab anything, and "site card never" above is that artefact rather
     * than a fault. The service worker has no such problem: it can address the
     * feed's tab directly, and the round trip it measures is exactly the one the
     * real popup awaits.
     */
    console.log("\nthe health call the popup waits on (worker -> the feed's tab)\n");
    const ask = async (label) => {
      /*
       * Wake the worker first, and time that separately. A first reading of this
       * reported 11.4 seconds and every later one 1-30ms, which looks exactly
       * like the reported fault and is not it: the worker had idled out, and
       * what was being measured was Playwright reviving it. The real popup never
       * waits on the worker — popup.js talks to chrome.storage and chrome.tabs
       * directly — so the wake has to be charged separately or it reads as a
       * delay a person would feel when it is not one.
       */
      const wakeAt = Date.now();
      await worker.evaluate(() => 1);
      const wake = Date.now() - wakeAt;

      const result = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: "https://www.facebook.com/*" });
        if (!tab) return { error: "no tab" };
        const at = Date.now();
        try {
          const answer = await chrome.tabs.sendMessage(tab.id, { type: "decaf-health" });
          return { ms: Date.now() - at, answered: Boolean(answer) };
        } catch (error) {
          return { ms: Date.now() - at, error: String(error.message).slice(0, 40) };
        }
      });
      console.log(
        `  ${label.padEnd(34)} ${result.error ? `error: ${result.error}` : `${String(result.ms).padStart(5)} ms  answered=${result.answered}`}` +
        `   (worker wake ${wake} ms)`
      );
    };

    /*
     * The variable that matters turned out to be whether the feed's tab is the
     * one in front, not how long anything had been idle. A first reading blamed
     * idleness because the only slow sample happened to be the one taken while
     * a popup tab was covering the feed.
     */
    const blank = await context.newPage();
    await blank.goto("about:blank");

    await page.bringToFront();
    await ask("in front, just used");
    await page.waitForTimeout(6000);
    await ask("in front, idle 6s");
    await page.waitForTimeout(12000);
    await ask("in front, idle 18s");

    await blank.bringToFront();
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await ask("behind another tab, idle 6s");
    await new Promise((resolve) => setTimeout(resolve, 12000));
    await ask("behind another tab, idle 18s");

    await page.bringToFront();
    await ask("brought back to the front");
    await blank.close();

    // How long the tab takes to answer at all is the thing the popup waits on.
    console.log("\nhow busy the page is\n");
    const samples = [];
    for (let index = 0; index < 12; index += 1) {
      const at = Date.now();
      await page.evaluate("1");
      samples.push(Date.now() - at);
      await page.waitForTimeout(100);
    }
    samples.sort((a, b) => a - b);
    console.log(`  main-thread lateness  median ${samples[6]} ms   worst ${samples.at(-1)} ms`);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
