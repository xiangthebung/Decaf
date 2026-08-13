"use strict";

/**
 * Optional end-to-end checks in a real Chromium with the extension loaded.
 * Playwright is not a dependency of this project, so these skip unless you opt in:
 *
 *   npm run build
 *   npm install --no-save playwright && npx playwright install chromium
 *   DECAF_BROWSER=1 npm test          # against a local fixture
 *   DECAF_LIVE=1 npm test             # also against the real sites (network)
 *
 * They load `dist/`, not the repository root. Both work — the manifest sits at the
 * root as well — but `dist/` is what `npm run zip` packages, what the README tells a
 * person to load, and what a reviewer installs. Pointed at the root, these tests
 * were the only thing in the project that never once exercised the artifact being
 * shipped: a build that assembled the wrong file list, or dropped one, would have
 * passed every check here.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
/** The built extension: what gets zipped, and so what gets tested. */
const dist = path.join(root, "dist");
const D = require("../core.js");

let playwright = null;
try {
  playwright = require("playwright");
} catch (_) {
  playwright = null;
}

const missing = !playwright ? "playwright is not installed" : false;
/* Said out loud rather than skipped quietly: somebody who set DECAF_BROWSER=1 asked
   for this test, and "no dist/" is a different answer from "not today". */
const unbuilt = fs.existsSync(path.join(dist, "manifest.json"))
  ? false
  : "dist/ is not built — run `npm run build` first";
const skipFixture = missing || unbuilt || (process.env.DECAF_BROWSER !== "1" && process.env.DECAF_LIVE !== "1"
  ? "set DECAF_BROWSER=1 to run the browser test"
  : false);
const skipLive = missing || unbuilt || (process.env.DECAF_LIVE !== "1"
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
 * A Reddit thread as Reddit actually builds one, measured off live threads with
 * tools/probe.js. Reddit refuses automated browsers more often than not, so the
 * shape is reproduced here to keep the cap checkable without the network:
 *
 *   - comments are a flat run of <shreddit-comment> carrying their own `depth`,
 *     with the replies Reddit ships inline nested inside their parent;
 *   - the rest of the thread arrives through a partial that names itself in its
 *     `src` — 35 comments came with 35 of these, every one a "more replies";
 *   - the post is a separate element, and on a link post it is all there is
 *     besides the thread.
 */
const REDDIT_THREAD = `<!doctype html>
<html><head><title>Why is my dishwasher leaking? : r/fixit</title></head>
<body>
  <header id="nav">reddit <input id="site-search" type="search"></header>
  <main id="main-content">
    <shreddit-post id="post" post-title="Why is my dishwasher leaking?" style="display:block">
      <h1 id="post-title">Why is my dishwasher leaking?</h1>
    </shreddit-post>
    <shreddit-comment-tree id="comment-tree" style="display:block">
      <section>
        <shreddit-comment id="top-1" depth="0" style="display:block">
          <p>Check the drain filter first.</p>
          <shreddit-comment id="reply-1" depth="1" style="display:block">
            <p>That was it, thanks.</p>
            <shreddit-comment id="deep-1" depth="2" style="display:block">
              <p>Well actually, on my model...</p>
            </shreddit-comment>
          </shreddit-comment>
          <faceplate-partial id="more-1" style="display:block"
            src="/svc/shreddit/more-comments/fixit/t3_abc123?sort=CONFIDENCE&amp;start=5">
            <button id="more-button">789 more replies</button>
          </faceplate-partial>
        </shreddit-comment>
        <shreddit-comment id="top-2" depth="0" style="display:block">
          <p>Could be the door gasket.</p>
        </shreddit-comment>
        <shreddit-comment id="top-3" depth="0" style="display:block">
          <p>Mine did this when the tub cracked.</p>
        </shreddit-comment>
      </section>
    </shreddit-comment-tree>
  </main>
</body></html>`;

/**
 * The same thread on old Reddit, which has no depth attribute: it wraps each
 * level in a .child, so two of them is depth 2.
 */
const OLD_REDDIT_THREAD = `<!doctype html>
<html><head><title>Why is my dishwasher leaking? : fixit</title></head>
<body>
  <div id="siteTable"><div id="post" class="thing">Why is my dishwasher leaking?</div></div>
  <div class="commentarea">
    <div class="sitetable">
      <div id="old-top" class="comment">
        <p>Check the drain filter first.</p>
        <div class="child">
          <div class="sitetable">
            <div id="old-reply" class="comment">
              <p>That was it, thanks.</p>
              <div class="child">
                <div class="sitetable">
                  <div id="old-deep" class="comment"><p>Well actually, on my model...</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

/**
 * The fixture is answered from inside the browser rather than from a local
 * server. Decaf is keyed to real hostnames, and every hostname it supports is on
 * the HSTS preload list, so a plain-HTTP stand-in is force-upgraded to HTTPS and
 * never loads. Fulfilling the request instead keeps the real origin without
 * needing a certificate.
 */
async function serveFixture(context, origin, body = FIXTURE) {
  await context.route(`${origin}/**`, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body
  }));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-e2e-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`
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
    // The ring has to actually move, or the hold feels like a dead button.
    // Read from the dash rather than from a transform matrix: the indicator is an
    // SVG circle whose sweep is `stroke-dashoffset` counting down from the
    // circumference, and a circle has no transform of its own, so the old matrix
    // read returned a flat 1 and would have passed a completely frozen ring.
    const progress = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector(".decaf-notice-fill"));
      const circumference = parseFloat(style.strokeDasharray);
      const remaining = parseFloat(style.strokeDashoffset);
      return (circumference - remaining) / circumference;
    });
    assert.ok(progress > 0.15 && progress < 0.75, `ring should be part way round, was ${progress}`);
    await page.waitForTimeout(2600);
    await page.mouse.up();
    await page.waitForSelector(".decaf-notice", { state: "detached" });
    assert.equal(await page.locator("#post").isVisible(), true, "the feed is back");
    await page.waitForSelector(".decaf-chip");

    // 5. Quiet visuals and quiet numbers, applied by the browser itself.
    // Grayscale alone: the `contrast(0.96)` that used to ride along here applied
    // to screenshots of text too, and pushed anything already near the line
    // below 4.5:1.
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.getElementById("photo")).filter),
      "grayscale(1)"
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
 * On Reddit the thread is the page, so it is capped rather than hidden. Asking a
 * real engine is the only way to know: three of the selectors involved are
 * `:not([depth=...])`, a descendant chain, and an attribute substring match, and
 * a string in a stylesheet proves none of them work.
 *
 * What has to hold is both halves at once — the answer is still readable, and the
 * scroll is gone. Either one alone is a bug: hiding everything leaves a page with
 * no answer on it, and hiding nothing leaves an hour of argument.
 */
test("a Reddit thread is capped, not emptied", { skip: skipFixture }, async () => {
  let session = null;
  const failures = [];
  try {
    session = await launch();
    const { context } = session;
    await serveFixture(context, "https://www.reddit.com", REDDIT_THREAD);
    await serveFixture(context, "https://old.reddit.com", OLD_REDDIT_THREAD);

    const shown = (page, id) => page.evaluate((target) => {
      const element = document.getElementById(target);
      if (!element) return "absent";
      return getComputedStyle(element).display !== "none";
    }, id);

    // New Reddit.
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(String(error)));
    await page.goto("https://www.reddit.com/r/fixit/comments/abc123/why_is_my_dishwasher_leaking/");
    await page.waitForFunction(() => document.documentElement.classList.contains("decaf-hide-comments"));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("decaf-site-reddit")), true);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("decaf-media")), true);

    // The answer someone searched for is still on the page.
    assert.equal(await shown(page, "post"), true, "the post itself has to stay");
    assert.equal(await shown(page, "comment-tree"), true, "the thread is capped, never hidden outright");
    for (const id of ["top-1", "top-2", "top-3"]) {
      assert.equal(await shown(page, id), true, `${id}: a top-level comment is the answer`);
    }
    assert.equal(await shown(page, "reply-1"), true, "the reply that confirms the answer stays");
    assert.equal(
      await page.locator("#top-1").isVisible(), true,
      "a capped comment must still be laid out, not just undisplayed"
    );

    // The scroll is gone.
    assert.equal(await shown(page, "deep-1"), false, "depth 2 is where the argument starts");
    assert.equal(await shown(page, "more-1"), false, "the loader that grows the thread has to go");
    assert.equal(
      await page.locator("#more-button").isVisible(), false,
      "no dead button may be left to click at nothing"
    );

    // Old Reddit: same thread, no depth attribute, one .child per level.
    const old = await context.newPage();
    old.on("pageerror", (error) => failures.push(String(error)));
    await old.goto("https://old.reddit.com/r/fixit/comments/abc123/why_is_my_dishwasher_leaking/");
    await old.waitForFunction(() => document.documentElement.classList.contains("decaf-hide-comments"));
    assert.equal(await shown(old, "old-top"), true, "old Reddit keeps its top-level comments too");
    assert.equal(await shown(old, "old-reply"), true, "and the first reply");
    assert.equal(await shown(old, "old-deep"), false, "two .child wrappers deep is capped");

    // Neither page may be left frozen.
    for (const target of [page, old]) {
      assert.equal(await target.evaluate(() => getComputedStyle(document.documentElement).overflow), "visible");
    }
    assert.deepEqual(failures, [], "no page errors");
  } finally {
    await session?.context.close();
    if (session) fs.rmSync(session.profile, { recursive: true, force: true });
  }
});

/**
 * An Instagram post page as Instagram actually builds one: the photo sits in
 * <main> and there is no <article> anywhere on it. The colour rules named
 * `main article img` for years after that stopped being true, so "Show in color"
 * on Instagram set a class, withdrew the pill, said the words — and matched
 * nothing at all.
 */
const INSTAGRAM_POST = `<!doctype html>
<html><head><title>A photo on Instagram</title></head>
<body>
  <header id="nav">Instagram</header>
  <main role="main">
    <img id="photo" alt="A photo" style="width:320px;height:320px"
         src="data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACwAAAAAAQABAAACAkQBADs=">
    <div id="caption">A caption about the photo.</div>
  </main>
</body></html>`;

/**
 * The other way a granted colour never arrives, and the reason a rule naming the
 * video is not enough on its own: a filter drains everything beneath it, so a
 * wrapper carrying a background image keeps the video grey, and a poster held in
 * front of it stays grey over a video that is already in perfect colour. Both
 * shapes are ordinary — a blurred backdrop behind a vertical video, a still held
 * until playback starts — and both leave the person looking at a grey page after
 * pressing a button that reported success.
 */
const WRAPPED_VIDEO = `<!doctype html>
<html><head><title>A video on TikTok</title></head>
<body>
  <header id="nav">TikTok</header>
  <main>
    <span id="wrap" style="display:block;position:relative;width:300px;height:400px;
          background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACwAAAAAAQABAAACAkQBADs=)">
      <video id="player" style="width:300px;height:400px"></video>
      <img id="poster" alt="" style="position:absolute;inset:0;width:300px;height:400px"
           src="data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACwAAAAAAQABAAACAkQBADs=">
    </span>
  </main>
</body></html>`;

/**
 * Colour is granted to a *picture*, not to an element, and the two come apart in
 * every direction: the rule can name markup a site no longer ships, the drain can
 * sit on a wrapper above the picture, or on something painted across it. Every
 * one of those leaves the page grey while `getComputedStyle(video).filter` reads
 * `none` — which is exactly what the older checks here asked, and why they were
 * all passing while Instagram had never worked once.
 *
 * So this asks the question the person at the screen is asking: is there anything
 * left between this picture and the window that is still draining it?
 */
test("a granted colour reaches the picture, not just the element named", { skip: skipFixture }, async () => {
  let session = null;
  const failures = [];

  /** Everything from the picture up to <html> that is still filtered. */
  const drainedAbove = (page, selector) => page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return "absent";
    const found = [];
    for (let node = element; node; node = node.parentElement) {
      const filter = getComputedStyle(node).filter;
      if (filter && filter !== "none") found.push(`${node.localName}#${node.id || "?"}: ${filter}`);
    }
    return found;
  }, selector);

  try {
    session = await launch();
    const { context } = session;
    await serveFixture(context, "https://www.instagram.com", INSTAGRAM_POST);
    await serveFixture(context, "https://www.tiktok.com", WRAPPED_VIDEO);

    // 1. A post page whose markup the stylesheet's rule no longer describes.
    const insta = await context.newPage();
    insta.on("pageerror", (error) => failures.push(String(error)));
    await insta.goto("https://www.instagram.com/p/Abc123/");
    await insta.waitForFunction(() => document.documentElement.classList.contains("decaf-media"));
    assert.equal(await insta.locator("main article").count(), 0, "the fixture has to have the shape the site has");
    assert.equal(
      (await drainedAbove(insta, "#photo")).length, 1,
      "the photo starts drained, like everything else"
    );

    await insta.locator(".decaf-pill").click();
    await insta.waitForFunction(() => document.documentElement.classList.contains("decaf-color"));
    assert.deepEqual(
      await drainedAbove(insta, "#photo"), [],
      "asking for colour on Instagram has to actually show the photo"
    );

    // 2. A video with a drained wrapper above it and a drained poster across it.
    const tiktok = await context.newPage();
    tiktok.on("pageerror", (error) => failures.push(String(error)));
    await tiktok.goto("https://www.tiktok.com/@someone/video/1234567890");
    await tiktok.waitForFunction(() => document.documentElement.classList.contains("decaf-media"));
    await tiktok.locator(".decaf-pill").click();
    await tiktok.waitForFunction(() => document.documentElement.classList.contains("decaf-color"));

    assert.deepEqual(
      await drainedAbove(tiktok, "#player"), [],
      "a wrapper above the video drains the video with it"
    );
    assert.deepEqual(
      await drainedAbove(tiktok, "#poster"), [],
      "and a poster across it is what the person is actually looking at"
    );
    assert.deepEqual(failures, [], "no page errors");
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

/*
 * The conversation guard, checked where it actually lives.
 *
 * This has to be a browser test and cannot be a jsdom one: the emptying is done
 * entirely by content.css, the jsdom harness never loads that stylesheet, and
 * jsdom does not implement `:has()` — which the emptying rule depends on. A
 * jsdom test written for this passed identically with the guard reverted, which
 * is worth more as a warning than the test was as a test.
 *
 * Facebook docks a Messenger window on every page, and its conversation pane is
 * a `role="main"` of its own, so `[role='main'] > *` reached in and hid every
 * message — leaving the container behind holding Messenger's own gradient.
 */
const MESSENGER_DOCK = `<!doctype html>
<html><head><title>Facebook</title></head><body>
  <header id="masthead"><input id="site-search" type="search"></header>
  <div role="main" id="page-main">
    <div role="feed" id="feed">
      <div role="article" class="post" id="post1">A post</div>
      <div role="article" class="post" id="post2">Another post</div>
      <div role="article" class="post" id="post3">A third post</div>
    </div>
  </div>
  <div role="dialog" aria-label="Chat with Denise" id="dock">
    <div id="dock-head">Denise</div>
    <div role="main" id="dock-main">
      <div role="article" class="msg" id="m1">Is it still available?</div>
      <div role="article" class="msg" id="m2">Yes, it is.</div>
    </div>
    <div id="dock-composer"><input aria-label="Aa"></div>
  </div>
</body></html>`;

test("a docked conversation survives a paused feed", { skip: skipFixture }, async () => {
  let session = null;
  try {
    session = await launch();
    const { context } = session;
    const origin = "https://www.facebook.com";
    await serveFixture(context, origin, MESSENGER_DOCK);

    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.locator(".decaf-notice").waitFor({ state: "visible" });

    // The feed really is paused — otherwise this proves nothing.
    assert.equal(await page.locator("#post1").isVisible(), false, "the feed is emptied");
    assert.equal(await page.locator("#page-main").isVisible(), true, "the page's own main keeps its place");
    assert.equal(
      await page.evaluate(() => Boolean(document.querySelector(".decaf-notice").closest("#page-main"))),
      true,
      "and the card is in it"
    );

    // And the conversation is completely untouched.
    assert.equal(await page.locator("#m1").isVisible(), true, "the message is still there");
    assert.equal(await page.locator("#m2").isVisible(), true);
    assert.equal(await page.locator("#dock-head").isVisible(), true);
    assert.equal(await page.locator("#dock-composer").isVisible(), true);
    assert.equal(
      await page.evaluate(() => document.querySelector(".decaf-notice").closest("#dock")),
      null,
      "and the card did not land inside it"
    );
  } finally {
    await session?.context.close();
    if (session) fs.rmSync(session.profile, { recursive: true, force: true });
  }
});
