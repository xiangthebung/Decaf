"use strict";

/**
 * Optional end-to-end checks in a real Chromium with the extension loaded.
 * Playwright is not a dependency of this project, so these skip unless you opt in:
 *
 *   npm install --no-save playwright && npx playwright install chromium
 *   DECAF_BROWSER=1 npm test          # against a local fixture
 *   DECAF_LIVE=1 npm test             # also against the real sites (network)
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const D = require("../core.js");

let playwright = null;
try {
  playwright = require("playwright");
} catch (_) {
  playwright = null;
}

const missing = !playwright ? "playwright is not installed" : false;
const skipFixture = missing || (process.env.DECAF_BROWSER !== "1" && process.env.DECAF_LIVE !== "1"
  ? "set DECAF_BROWSER=1 to run the browser test"
  : false);
const skipLive = missing || (process.env.DECAF_LIVE !== "1"
  ? "set DECAF_LIVE=1 to check the real sites over the network"
  : false);

const FIXTURE = `<!doctype html>
<html><head><title>(4) Fixture</title></head>
<body>
  <header id="masthead">
    <input id="site-search" type="search">
    <nav>
      <a href="/feed/subscriptions">Subs<span id="badge">7</span></a>
      <!-- A badge a site paints and never names, with the count wrapped the way
           Instagram wraps it: the pill carries the colour, not the number. -->
      <a href="/inbox" id="inbox"><span id="pill"
         style="display:inline-block;width:22px;height:22px;background:rgb(255,48,64)"><span
         id="pill-count">1</span></span></a>
    </nav>
  </header>
  <div id="page-manager">
    <ytd-browse page-subtype="home">
      <ytd-feed-filter-chip-bar-renderer id="chips">chips</ytd-feed-filter-chip-bar-renderer>
      <ytd-rich-grid-renderer id="grid" style="display:block;height:4000px">
        <article id="post" aria-label="Post">
          <div id="views">45,000 views</div>
          <img id="photo" width="200" height="120" alt="Photo"
               src="data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACwAAAAAAQABAAACAkQBADs=">
        </article>
      </ytd-rich-grid-renderer>
    </ytd-browse>
  </div>
  <div id="movie_player"><video id="player"></video></div>
</body></html>`;

/**
 * The fixture is answered from inside the browser rather than from a local
 * server. Decaf is keyed to real hostnames, and every hostname it supports is on
 * the HSTS preload list, so a plain-HTTP stand-in is force-upgraded to HTTPS and
 * never loads. Fulfilling the request instead keeps the real origin without
 * needing a certificate.
 */
async function serveFixture(context, origin) {
  await context.route(`${origin}/**`, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: FIXTURE
  }));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-e2e-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`
    ]
  });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  return { context, profile, worker, extensionId: new URL(worker.url()).hostname };
}

test("Decaf works in a real Chromium", { skip: skipFixture }, async () => {
  const failures = [];
  let session = null;

  try {
    session = await launch();
    const { context, extensionId } = session;
    context.on("weberror", (error) => failures.push(String(error.error())));
    const origin = "https://www.youtube.com";
    await serveFixture(context, origin);
    const url = (route) => `${origin}${route}`;

    // 1. The feed is emptied in place, and the page still works.
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(String(error)));
    await page.goto(url("/"));
    const notice = page.locator(".decaf-notice");
    await notice.waitFor({ state: "visible" });
    assert.equal(await notice.locator(".decaf-notice-title").innerText(), "Decaf paused the YouTube feed.");
    // The container keeps its place in the layout; only its contents go.
    assert.equal(await page.locator("#grid").isVisible(), true, "the feed's container stays in the layout");
    assert.equal(await page.evaluate(() => document.querySelector(".decaf-notice").parentElement.id), "grid");
    assert.equal(await page.locator("#post").isVisible(), false, "the feed itself is gone");
    assert.equal(await page.locator("#chips").isVisible(), false, "so is the feed's filter bar");
    assert.equal(await page.locator("#masthead").isVisible(), true, "the site's own header stays");
    assert.equal(await page.locator("#site-search").isVisible(), true);

    // 2. Nothing about the page is frozen.
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), "visible");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "visible");
    assert.equal(await page.evaluate(() => document.body.inert), false);
    assert.equal(await page.evaluate(() => {
      document.body.style.height = "4000px";
      scrollTo(0, 500);
      const scrolled = scrollY;
      document.body.style.height = "";
      return scrolled;
    }), 500, "the page scrolls");

    // 3. The notice is reachable by keyboard without hunting for it.
    assert.equal(await page.evaluate(() => {
      const button = document.querySelector(".decaf-notice-hold");
      button.focus();
      return document.activeElement === button;
    }), true);

    // 4. A real three second hold opens the feed.
    const hold = notice.locator(".decaf-notice-hold");
    const box = await hold.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1000);
    assert.equal(await notice.count(), 1, "one second is not enough");
    // The progress bar has to actually move, or the hold feels like a dead button.
    const progress = await page.evaluate(() => {
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector(".decaf-notice-fill")).transform);
      return matrix.a;
    });
    assert.ok(progress > 0.15 && progress < 0.75, `progress bar should be part way across, was ${progress}`);
    await page.waitForTimeout(2600);
    await page.mouse.up();
    await page.waitForSelector(".decaf-notice", { state: "detached" });
    assert.equal(await page.locator("#post").isVisible(), true, "the feed is back");
    await page.waitForSelector(".decaf-chip");

    // 5. Quiet visuals and quiet numbers, applied by the browser itself.
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.getElementById("photo")).filter),
      "grayscale(1) contrast(0.96)"
    );
    await page.waitForFunction(() => document.getElementById("views")?.textContent === "— views");
    await page.waitForFunction(() => document.title === "Fixture");
    // The badge keeps its number but loses the urgency.
    await page.waitForFunction(() => document.getElementById("badge")?.classList.contains("decaf-badge"));
    assert.equal(await page.locator("#badge").isVisible(), true, "a real message can still be noticed");
    assert.match(await page.evaluate(() => getComputedStyle(document.getElementById("badge")).filter), /grayscale\(1\)/);

    // A badge the site only paints. The mark has to land on the pill, because a
    // filter on the number inside it would leave the colour untouched — which is
    // something only a real engine can be asked about.
    await page.waitForFunction(() => document.getElementById("pill")?.classList.contains("decaf-badge"));
    assert.equal(
      await page.evaluate(() => document.getElementById("pill-count").classList.contains("decaf-badge")),
      false,
      "the number inside the pill is not the thing marked"
    );
    assert.match(
      await page.evaluate(() => getComputedStyle(document.getElementById("pill")).filter),
      /grayscale\(1\)/,
      "the colour itself is drained, not just the digit"
    );

    // 6. Full color, on request, for one page only.
    await page.goto(url("/watch?v=abc123"));
    await page.waitForFunction(() => document.documentElement.classList.contains("decaf-media"));
    assert.equal(await page.locator(".decaf-notice").count(), 0);
    const player = () => page.evaluate(() => getComputedStyle(document.querySelector("#movie_player video")).filter);
    assert.match(await player(), /grayscale\(1\)/, "even the video you opened is grayscale");
    await page.locator(".decaf-pill").click();
    await page.waitForFunction(() => document.documentElement.classList.contains("decaf-color"));
    assert.equal(await player(), "none", "asking for color gives color");
    assert.equal(await page.locator(".decaf-pill").count(), 0);

    // 7. In-page navigation is followed, and color is asked for again.
    await page.evaluate(() => history.pushState({}, "", "/watch?v=second"));
    await page.waitForSelector(".decaf-pill");
    assert.match(await player(), /grayscale\(1\)/);

    // 8. Settings written elsewhere reach the page.
    const options = await context.newPage();
    options.on("pageerror", (error) => failures.push(String(error)));
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    assert.equal(await options.locator(".site").count(), D.SITE_KEYS.length);
    await options.locator('input[data-setting="upsideDown"]').evaluate((input) => input.click());
    await page.waitForFunction(() => document.documentElement.classList.contains("decaf-upside-down"));
    assert.match(
      await page.evaluate(() => getComputedStyle(document.querySelector("#page-manager img")).transform),
      /matrix\(-1, 0, 0, -1, 0, 0\)/
    );
    await options.locator('.site[data-site="youtube"] input').evaluate((input) => input.click());
    await page.waitForFunction(() => document.documentElement.classList.length === 0);

    // 9. The popup renders with the real state.
    const popup = await context.newPage();
    popup.on("pageerror", (error) => failures.push(String(error)));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    assert.equal(await popup.locator("#lock-button").innerText(), "Lock");
    assert.equal(await popup.locator("#unsupported").isVisible(), true);
    assert.equal(await popup.locator("#site-card").isVisible(), false);
    assert.equal(await popup.locator("#pass-row").isVisible(), false);

    assert.deepEqual(failures, [], "no page or worker errors");
  } finally {
    await session?.context.close();
    if (session) fs.rmSync(session.profile, { recursive: true, force: true });
  }
});

/**
 * The selectors in core.js describe real pages, so the only honest way to check
 * them is against real pages. Some sites refuse automated browsers and serve an
 * interstitial instead; that is reported rather than treated as a failure, but at
 * least one site has to be checkable or this test has told us nothing.
 */
test("a real video page is quiet, and color can be asked for", { skip: skipLive }, async () => {
  let session = null;
  try {
    session = await launch();
    const page = await session.context.newPage();
    // "Me at the zoo": the oldest and most stable video on YouTube.
    await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForFunction(() => document.documentElement.classList.contains("decaf-media"), undefined, { timeout: 30000 });
    await page.waitForSelector("#movie_player video", { state: "attached", timeout: 30000 });

    const playerFilter = () => page.evaluate(() => getComputedStyle(document.querySelector("#movie_player video")).filter);
    assert.match(await playerFilter(), /grayscale\(1\)/, "the video you opened is grayscale too");
    assert.equal(await page.locator(".decaf-notice").count(), 0, "a video is not a feed");

    await page.locator(".decaf-pill").click();
    await page.waitForFunction(() => document.documentElement.classList.contains("decaf-color"));
    assert.equal(await playerFilter(), "none", "asking for color gives color");

    const quiet = await page.evaluate(() => {
      const hiddenIfPresent = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).display === "none" : "absent";
      };
      return {
        comments: hiddenIfPresent("#comments"),
        related: hiddenIfPresent("#related"),
        scrolls: getComputedStyle(document.documentElement).overflow
      };
    });
    assert.notEqual(quiet.comments, false, "comments should be hidden");
    assert.notEqual(quiet.related, false, "the up-next rail should be hidden");
    assert.equal(quiet.scrolls, "visible");
  } finally {
    await session?.context.close();
    if (session) fs.rmSync(session.profile, { recursive: true, force: true });
  }
});

test("the feed selectors match the sites as they ship today", { skip: skipLive }, async () => {
  const LIVE = [
    ["youtube", "https://www.youtube.com/"],
    ["reddit", "https://www.reddit.com/"],
    ["pinterest", "https://www.pinterest.com/"]
  ];
  let session = null;
  const verified = [];
  const inconclusive = [];

  try {
    session = await launch();
    const { context } = session;
    for (const [site, url] of LIVE) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForFunction(
          () => document.documentElement.classList.contains("decaf-hide-feed"),
          undefined,
          { timeout: 30000 }
        );
        await page.waitForTimeout(2500);

        const report = await page.evaluate((selectors) => {
          const visible = (element) => Boolean(element.getClientRects().length);
          const found = selectors.filter((selector) => document.querySelector(selector));
          const notice = document.querySelector(".decaf-notice");
          const items = [...document.querySelectorAll(
            "article,[role='article'],shreddit-post,ytd-rich-item-renderer,[data-test-id='pin'],[data-testid='cellInnerDiv']"
          )];
          return {
            title: document.title,
            found,
            // The container has to stay in the layout, holding the notice.
            noticeInsideContainer: Boolean(notice && [...document.querySelectorAll(selectors.join(",") || "nothing")]
              .includes(notice.parentElement)),
            hostVisible: Boolean(notice && visible(notice.parentElement)),
            fallbackUsed: Boolean(document.querySelector(".decaf-feed-container")),
            items: items.length,
            visibleItems: items.filter(visible).length,
            noticeVisible: Boolean(notice && visible(notice)),
            noticeText: notice?.textContent || "",
            htmlOverflow: getComputedStyle(document.documentElement).overflow,
            scrollable: document.documentElement.scrollHeight >= document.documentElement.clientHeight
          };
        }, D.feedSelectors(site));

        // Always true, interstitial or not: the page must stay usable.
        assert.equal(report.htmlOverflow, "visible", `${site}: the page cannot scroll`);
        assert.equal(report.scrollable, true, `${site}: the page layout collapsed`);

        if (!report.found.length && !report.fallbackUsed) {
          // No feed was served to an automated browser. Decaf must not pretend.
          assert.equal(report.noticeVisible, false, `${site}: claims to pause a feed that is not there`);
          inconclusive.push(`${site} (served "${report.title}", ${report.items} feed items)`);
        } else {
          assert.equal(report.noticeVisible, true, `${site}: the notice is not visible`);
          assert.match(report.noticeText, /Decaf paused the/, `${site}: the notice says nothing`);
          assert.equal(report.visibleItems, 0, `${site}: ${report.visibleItems} feed item(s) still visible`);
          assert.equal(report.hostVisible, true, `${site}: the container left the layout`);
          if (report.found.length) {
            assert.equal(report.noticeInsideContainer, true, `${site}: the notice is not inside the feed's container`);
          }
          verified.push(report.found.length ? `${site} by selector` : `${site} by shape`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await session?.context.close();
    if (session) fs.rmSync(session.profile, { recursive: true, force: true });
  }

  assert.ok(verified.length, `no site could be checked live: ${inconclusive.join("; ")}`);
  if (inconclusive.length) {
    process.stdout.write(`# verified: ${verified.join(", ")}\n# inconclusive: ${inconclusive.join("; ")}\n`);
  }
});
