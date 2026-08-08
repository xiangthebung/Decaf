#!/usr/bin/env node
/**
 * Deep end-to-end verification, in a real Chromium with the built extension
 * loaded.
 *
 *   npm run build
 *   npm install --no-save playwright && npx playwright install chromium
 *   node tools/verify-deep.js                # everything
 *   node tools/verify-deep.js settings crawl # named sections only
 *   node tools/verify-deep.js --headed       # watch it happen
 *
 * The existing suites answer "does each piece work". This answers a different
 * question: does the whole thing behave, from the outside, the way the settings
 * page promises — with every switch flipped, on every route of every site, while
 * somebody clicks around.
 *
 * Three rules it holds itself to:
 *
 *   1. Nothing is asserted from a string. Every claim is read back out of a real
 *      engine — `getComputedStyle`, `getClientRects`, real navigations, real
 *      pointer input — because most of Decaf is CSS, and a selector in a
 *      stylesheet proves nothing about whether it matches.
 *   2. Every setting is checked for what it does *and* for what it must leave
 *      alone. A switch that hides everything passes a one-sided test.
 *   3. What a page *should* look like is always recomputed from `core.js`, never
 *      written down twice. A fixture cannot quietly assert the wrong answer.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const D = require("../core.js");
const { SITES: FIXTURES, serveAll, url } = require("./fixture-site.js");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

let playwright = null;
try {
  playwright = require("playwright");
} catch (_) {
  playwright = null;
}

const argv = process.argv.slice(2);
const headed = argv.includes("--headed");
const only = argv.filter((value) => !value.startsWith("--"));

/* ------------------------------------------------------------- reporting -- */

const results = [];
let section = "";
let pageErrors = [];

function heading(name) {
  section = name;
  process.stdout.write(`\n── ${name}\n`);
}

/** Runs one check. A throw is a failure, and never stops the run. */
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ section, name, ok: true });
    process.stdout.write(`   ok    ${name}${detail ? `  (${detail})` : ""}\n`);
  } catch (error) {
    const message = String(error?.message || error).split("\n").slice(0, 4).join(" ").slice(0, 400);
    results.push({ section, name, ok: false, message });
    process.stdout.write(`   FAIL  ${name}\n         ${message}\n`);
  }
}

/* --------------------------------------------------------------- browser -- */

let context = null;
let extensionId = null;
let control = null;
let profile = null;

async function launch() {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-deep-"));
  context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).hostname;
  context.on("weberror", (error) => pageErrors.push(`weberror: ${String(error.error()).split("\n")[0]}`));
  await serveAll(context);
  // The options page doubles as the place settings are written from: it is an
  // extension page, so it can reach chrome.storage, and using it means every
  // write also exercises the cross-context storage.onChanged path.
  control = await newPage();
  await control.goto(`chrome-extension://${extensionId}/options.html`);
  await control.waitForSelector(".site");
}

async function newPage() {
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(`${new URL(page.url() || "https://x/").host}: ${String(error).split("\n")[0]}`));
  return page;
}

const extensionPage = (name) => `chrome-extension://${extensionId}/${name}`;

/* -------------------------------------------------------------- settings -- */

let current = D.cloneDefaults();

/**
 * Replaces stored settings outright. Writing the whole normalized object (rather
 * than a patch) keeps every check independent of the one before it.
 */
async function setSettings(overrides = {}, extra = null) {
  const next = D.mergeSettings({ ...D.cloneDefaults(), ...overrides });
  await control.evaluate(async ({ settings, more }) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(more ? { ...settings, ...more } : settings);
  }, { settings: next, more: extra });
  current = next;
  return next;
}

async function readSettings() {
  return control.evaluate(async () => chrome.storage.local.get(null));
}

/* ----------------------------------------------------------- page probes -- */

/** Runs in the page: what Decaf has actually done to it. */
const SNAPSHOT = () => {
  const seen = (el) => Boolean(el && el.getClientRects().length);
  const text = (id) => document.getElementById(id)?.textContent ?? null;
  const filterOf = (id) => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).filter : null;
  };
  const transformOf = (id) => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).transform : null;
  };
  const shown = (id) => {
    const el = document.getElementById(id);
    if (!el) return "absent";
    return getComputedStyle(el).display !== "none" && seen(el);
  };
  const notice = document.querySelector(".decaf-notice");
  const items = [...document.querySelectorAll(
    "article,[role='article'],shreddit-post,ytd-rich-item-renderer,[data-testid='cellInnerDiv']," +
    "[data-test-id='pin'],[data-pressable-container],[data-id^='urn:li:activity']"
  )].filter((el) => !notice?.contains(el) && !el.closest(".decaf-notice"));
  return {
    url: location.href,
    title: document.title,
    classes: [...document.documentElement.classList],
    notice: Boolean(notice) && seen(notice),
    noticeTitle: notice?.querySelector(".decaf-notice-title")?.textContent ?? null,
    noticeHint: notice?.querySelector(".decaf-notice-hint")?.textContent ?? null,
    noticeParent: notice?.parentElement?.id || notice?.parentElement?.localName || null,
    pill: Boolean(document.querySelector(".decaf-pill")),
    chip: document.querySelector(".decaf-chip")?.textContent ?? null,
    visibleItems: items.filter(seen).length,
    // Always-on work.
    views: text("views"),
    likeCount: text("like-count"),
    ariaLikes: document.getElementById("aria-likes")?.getAttribute("aria-label") ?? null,
    followers: text("followers"),
    price: text("price"),
    prose: text("prose"),
    ago: text("ago"),
    // Badges: which element carries the mark, and what the engine paints.
    namedBadgeMarked: document.getElementById("named-badge")?.classList.contains("decaf-badge") ?? null,
    namedBadgeShown: shown("named-badge"),
    namedBadgeFilter: filterOf("named-badge"),
    wrapPillMarked: document.getElementById("wrap-pill")?.classList.contains("decaf-badge") ?? null,
    wrapCountMarked: document.getElementById("wrap-count")?.classList.contains("decaf-badge") ?? null,
    wrapPillShown: shown("wrap-pill"),
    dotMarked: document.getElementById("alert-dot")?.classList.contains("decaf-badge") ?? null,
    dotShown: shown("alert-dot"),
    // The site's own furniture must survive everything.
    searchShown: shown("site-search"),
    headerShown: shown("nav"),
    scrollLocked: /hidden/.test(getComputedStyle(document.documentElement).overflow) ||
      /hidden/.test(getComputedStyle(document.body).overflow),
    inert: Boolean(document.body.inert),
    filters: {
      poster: filterOf("poster"),
      photo: filterOf("photo"),
      player: filterOf("player"),
      postImage: filterOf("post-image"),
      pinImage: filterOf("pin-image"),
      storyImage: filterOf("story-image"),
      crown: filterOf("crown"),
      face: filterOf("face")
    },
    transforms: {
      poster: transformOf("poster"),
      photo: transformOf("photo"),
      postImage: transformOf("post-image"),
      crown: transformOf("crown")
    }
  };
};

/** True once the first paint is released and the idle scan has had its turn. */
async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains("decaf-boot"), null,
    { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function snapshot(page) {
  return page.evaluate(SNAPSHOT);
}

async function open(key, pathOrRoute = "feed") {
  const target = FIXTURES[key][pathOrRoute] || pathOrRoute;
  const page = await newPage();
  await page.goto(url(key, target));
  await settle(page);
  return page;
}

/**
 * The exact set of root classes content.js should have settled on for this URL,
 * derived from core.js rather than written out again here.
 */
function expectedClasses(pageUrl, settings = current, { colorGranted = false } = {}) {
  const site = D.getSite(pageUrl);
  const route = D.getRoute(pageUrl);
  const active = D.isActiveForSite(settings, site);
  if (!active || !site || !route) return [];
  const classes = ["decaf-on", `decaf-site-${site}`, `decaf-${route}`];
  if (settings.pauseFeeds) classes.push("decaf-calm");
  if (D.shouldPauseFeed(settings, site, route)) classes.push("decaf-hide-feed");
  if (settings.hideComments) classes.push("decaf-hide-comments");
  if (settings.upsideDown) classes.push("decaf-upside-down");
  if (settings.hideBadges) classes.push("decaf-hide-badges");
  if (colorGranted) classes.push("decaf-color");
  return classes;
}

const sorted = (list) => [...list].filter((c) => c !== "decaf-boot").sort();

/**
 * Everything that must be true of any page at any time. Used after every single
 * step of the crawl, which is what makes clicking around worth doing.
 */
function assertInvariants(shot, settings = current, options = {}) {
  const site = D.getSite(shot.url);
  const route = D.getRoute(shot.url);
  const active = D.isActiveForSite(settings, site);
  const where = `${site || "unsupported"} ${route || "-"} ${new URL(shot.url).pathname}`;

  assert.deepEqual(sorted(shot.classes), sorted(expectedClasses(shot.url, settings, options)),
    `root classes on ${where}`);

  // The page is never taken away from the person.
  assert.equal(shot.scrollLocked, false, `scroll must stay free on ${where}`);
  assert.equal(shot.inert, false, `the page must never be inert on ${where}`);
  if (shot.headerShown !== "absent") assert.equal(shot.headerShown, true, `header on ${where}`);
  if (shot.searchShown !== "absent") assert.equal(shot.searchShown, true, `search on ${where}`);

  const pausing = D.shouldPauseFeed(settings, site, route);
  if (pausing) {
    assert.equal(shot.notice, true, `a paused feed must say so on ${where}`);
    assert.equal(shot.noticeTitle, `Decaf paused the ${D.siteLabel(site)} feed.`, `notice wording on ${where}`);
    assert.equal(shot.visibleItems, 0, `no feed item may still show on ${where}`);
  } else {
    assert.equal(shot.notice, false, `no notice belongs on ${where}`);
  }

  // The colour offer belongs on exactly the pages someone opened on purpose.
  const wantPill = active && route === "media" && !options.colorGranted;
  assert.equal(shot.pill, wantPill, `the colour pill on ${where}`);

  // Always-on work, wherever the fixture put something to check.
  if (shot.views !== null) assert.equal(shot.views, active ? "— views" : "45,000 views", `views on ${where}`);
  if (shot.likeCount !== null) assert.equal(shot.likeCount, active ? "—" : "1.2K", `like count on ${where}`);
  if (shot.followers !== null) {
    assert.equal(shot.followers, active ? "— followers" : "18.3K followers", `followers on ${where}`);
  }
  if (shot.ariaLikes !== null) {
    assert.equal(shot.ariaLikes, active ? "— likes" : "1,234 likes", `aria count on ${where}`);
  }
  // ...and nothing that is not a reward count.
  if (shot.price !== null) assert.equal(shot.price, "$42.50", `a price is not a count, on ${where}`);
  if (shot.prose !== null) {
    assert.equal(shot.prose, "In 2019 the team shipped 3 releases.", `prose is not a count, on ${where}`);
  }
  if (shot.ago !== null) assert.equal(shot.ago, "5m", `a timestamp is not a count, on ${where}`);

  // Badges: marked when Decaf is on, and the mark lands on the paint.
  if (shot.namedBadgeMarked !== null) {
    assert.equal(shot.namedBadgeMarked, active, `named badge marked on ${where}`);
  }
  if (shot.wrapPillMarked !== null && active) {
    assert.equal(shot.wrapPillMarked, true, `the painted wrapper is the badge on ${where}`);
    assert.equal(shot.wrapCountMarked, false, `the number inside the pill is not the thing marked, on ${where}`);
  }
  if (shot.dotMarked !== null) assert.equal(shot.dotMarked, active, `alert dot marked on ${where}`);

  const hideBadges = active && settings.hideBadges;
  if (shot.namedBadgeShown !== "absent") {
    assert.equal(shot.namedBadgeShown, !hideBadges, `badge visibility on ${where}`);
  }
  if (shot.dotShown !== "absent") assert.equal(shot.dotShown, !hideBadges, `dot visibility on ${where}`);

  // A title badge is stripped, and the rest of the title left alone.
  assert.ok(!(active && /^\s*\(\d/.test(shot.title)), `title still carries a count on ${where}: ${shot.title}`);
}

const GRAY = "grayscale(1)";
const UPSIDE_DOWN = "matrix(-1, 0, 0, -1, 0, 0)";

/* =========================================================== the sections = */

const sections = {};

/* -- 1. every site, every route ------------------------------------------- */

sections.routes = async () => {
  heading("every site, every route, with the shipped defaults");
  await setSettings();
  for (const key of D.SITE_KEYS) {
    const fixture = FIXTURES[key];
    const routes = ["feed", "media", "content", "game"].filter((r) => fixture[r]);
    await check(`${D.siteLabel(key)}: ${routes.join(", ")}`, async () => {
      for (const route of routes) {
        const page = await open(key, route);
        try {
          const shot = await snapshot(page);
          assert.equal(D.getRoute(shot.url), route, `${key} ${route} classified as ${D.getRoute(shot.url)}`);
          assertInvariants(shot);
        } finally {
          await page.close();
        }
      }
      return routes.length + " routes";
    });
  }
};

/* -- 2. each setting, on its own ------------------------------------------ */

sections.settings = async () => {
  heading("pauseFeeds");
  await check("on: the feed is emptied in place, the layout does not move", async () => {
    await setSettings({ pauseFeeds: true });
    const page = await open("youtube", "feed");
    try {
      const guideBefore = await page.locator("#guide").boundingBox();
      const shot = await snapshot(page);
      assertInvariants(shot);
      assert.equal(shot.noticeParent, "grid", "the notice goes inside the feed's own container");
      assert.equal(await page.locator("#grid").isVisible(), true, "the container keeps its place");
      assert.equal(await page.locator("#chips").isVisible(), false, "the filter bar goes with the feed");
      assert.ok(guideBefore.width > 0 && guideBefore.x >= 0, "the sidebar is still laid out");
      return `notice in #${shot.noticeParent}`;
    } finally {
      await page.close();
    }
  });

  await check("on: recommendation rails go too (decaf-calm)", async () => {
    await setSettings({ pauseFeeds: true });
    const page = await open("youtube", "media");
    try {
      assert.equal(await page.locator("#related").isVisible(), false, "the up-next rail is gone");
      assert.equal(await page.locator("#mix").isVisible(), false, "an algorithmic Mix panel is gone");
      assert.equal(await page.locator("#watch").isVisible(), true, "what you opened stays");
      const shot = await snapshot(page);
      assert.ok(shot.classes.includes("decaf-calm"));
    } finally {
      await page.close();
    }
  });

  await check("off: the feed stays, and the rails come back", async () => {
    await setSettings({ pauseFeeds: false });
    const feed = await open("youtube", "feed");
    const media = await open("youtube", "media");
    try {
      const shot = await snapshot(feed);
      assertInvariants(shot);
      assert.equal(shot.notice, false, "nothing is paused");
      assert.equal(shot.visibleItems, 3, "the feed is all there");
      assert.ok(!shot.classes.includes("decaf-calm"));
      assert.equal(await media.locator("#related").isVisible(), true, "the rail is back");
      // The always-on half is untouched by this switch. Read from the page that
      // has counts on it: a home feed has none of its own.
      const mediaShot = await snapshot(media);
      assert.equal(mediaShot.views, "— views", "counts are still quiet");
      assert.equal(shot.namedBadgeMarked, true, "badges are still muted");
      assert.equal(mediaShot.filters.poster, GRAY, "media is still grayscale");
    } finally {
      await feed.close();
      await media.close();
    }
  });

  heading("hideComments");
  await check("on: threads and live chat go, the post stays", async () => {
    await setSettings({ hideComments: true });
    const yt = await open("youtube", "media");
    const tw = await open("twitch", "media");
    const li = await open("linkedin", "media");
    const fb = await open("facebook", "media");
    const xx = await open("x", "media");
    const tt = await open("tiktok", "media");
    try {
      assert.equal(await yt.locator("#comments").isVisible(), false, "YouTube comments");
      assert.equal(await yt.locator("#watch h1").isVisible(), true, "the video's own page stays");
      assert.equal(await tw.locator("#chat").isVisible(), false, "Twitch chat");
      assert.equal(await tw.locator("#player").isVisible(), true, "the stream stays");
      assert.equal(await li.locator(".comments-comments-list").isVisible(), false, "LinkedIn comments");
      assert.equal(await fb.locator("#c1").isVisible(), false, "Facebook comments");
      assert.equal(await fb.locator("#post-body").isVisible(), true, "the Facebook post stays");
      assert.equal(await xx.locator("#reply-1").isVisible(), false, "X replies");
      assert.equal(await xx.locator("#root-post").isVisible(), true, "the X post stays");
      assert.equal(await tt.locator("[data-e2e='browse-comment']").isVisible(), false, "TikTok comments");
      return "6 sites";
    } finally {
      for (const p of [yt, tw, li, fb, xx, tt]) await p.close();
    }
  });

  await check("on: a Reddit thread is capped, not emptied", async () => {
    await setSettings({ hideComments: true });
    const page = await open("reddit", "media");
    try {
      assert.equal(await page.locator("#top-1").isVisible(), true, "the answer stays");
      assert.equal(await page.locator("#top-2").isVisible(), true, "so does the second opinion");
      assert.equal(await page.locator("#reply-1").isVisible(), true, "and the reply confirming it");
      assert.equal(await page.locator("#deep-1").isVisible(), false, "the argument below goes");
      assert.equal(await page.locator("#deep-2").isVisible(), false, "however deep");
      assert.equal(await page.locator("#more-1").isVisible(), false, "and the loader that fetches a thousand more");
      assert.equal(await page.locator("#post-title").isVisible(), true, "the post itself stays");
    } finally {
      await page.close();
    }
  });

  await check("on: Instagram's caption survives, its comment panel does not", async () => {
    await setSettings({ hideComments: true });
    const page = await open("instagram", "media");
    try {
      await page.waitForFunction(() => document.querySelector(".decaf-comment-list") !== null, null,
        { timeout: 6000 });
      assert.equal(await page.locator("#caption").isVisible(), true, "the caption is the post");
      assert.equal(await page.locator("#c1").isVisible(), false, "the comments after it are not");
      assert.equal(await page.locator("#c3").isVisible(), false);
      assert.equal(await page.locator("#photo").isVisible(), true, "the photo stays");
    } finally {
      await page.close();
    }
  });

  await check("off: every thread comes back, and the panel is unmarked", async () => {
    await setSettings({ hideComments: false });
    const yt = await open("youtube", "media");
    const rd = await open("reddit", "media");
    const ig = await open("instagram", "media");
    try {
      assert.equal(await yt.locator("#comments").isVisible(), true);
      assert.equal(await rd.locator("#deep-1").isVisible(), true);
      assert.equal(await rd.locator("#more-1").isVisible(), true);
      assert.equal(await ig.locator("#c1").isVisible(), true);
      assert.equal(await ig.evaluate(() => document.querySelectorAll(".decaf-comment-list").length), 0,
        "the panel mark is cleaned up");
      assert.ok(!(await snapshot(yt)).classes.includes("decaf-hide-comments"));
    } finally {
      for (const p of [yt, rd, ig]) await p.close();
    }
  });

  heading("upsideDown");
  await check("on: content media turns over, the site's own chrome does not", async () => {
    await setSettings({ upsideDown: true });
    const page = await open("youtube", "media");
    try {
      const shot = await snapshot(page);
      assertInvariants(shot);
      assert.equal(shot.transforms.poster, UPSIDE_DOWN, "the poster inside <article> is turned over");
      const navTransform = await page.evaluate(() =>
        getComputedStyle(document.getElementById("named-badge")).transform);
      assert.equal(navTransform, "none", "the header is left alone");
      return shot.transforms.poster;
    } finally {
      await page.close();
    }
  });

  await check("off: nothing is turned over", async () => {
    await setSettings({ upsideDown: false });
    const page = await open("youtube", "media");
    try {
      const shot = await snapshot(page);
      assertInvariants(shot);
      assert.equal(shot.transforms.poster, "none");
    } finally {
      await page.close();
    }
  });

  heading("hideBadges");
  await check("off (default): a badge keeps its number and loses the red", async () => {
    await setSettings({ hideBadges: false });
    const page = await open("youtube", "content");
    try {
      const shot = await snapshot(page);
      assertInvariants(shot);
      assert.equal(shot.namedBadgeShown, true, "a real message can still be noticed");
      assert.equal(await page.locator("#named-badge").innerText(), "7", "the number is still there");
      assert.match(shot.namedBadgeFilter, /grayscale\(1\)/, "but the colour is drained");
    } finally {
      await page.close();
    }
  });

  await check("on: badges disappear, and nothing else does", async () => {
    await setSettings({ hideBadges: true });
    const page = await open("youtube", "content");
    try {
      const shot = await snapshot(page);
      assertInvariants(shot);
      assert.equal(shot.namedBadgeShown, false, "the named badge is gone");
      assert.equal(shot.wrapPillShown, false, "so is the painted pill");
      assert.equal(shot.dotShown, false, "and the unnamed dot");
      // The controls the badges were riding on still work: a hidden count must
      // never take its link with it, or the notifications become unreachable.
      for (const index of [0, 1, 2]) {
        const link = page.locator(`#chrome-${index}`);
        assert.equal(await link.isVisible(), true, `header link ${index} is still reachable`);
        assert.ok((await link.innerText()).trim().length > 0, `header link ${index} still reads as something`);
      }
      assert.equal(shot.searchShown, true);
    } finally {
      await page.close();
    }
  });

  heading("sites (the per-site switch)");
  await check("one site off leaves that site alone and the others working", async () => {
    await setSettings({ sites: { ...D.cloneDefaults().sites, youtube: false } });
    const off = await open("youtube", "feed");
    const offContent = await open("youtube", "content");
    const on = await open("reddit", "feed");
    try {
      const offShot = await snapshot(off);
      assert.deepEqual(sorted(offShot.classes), [], "not one class is left on the site that is off");
      assert.equal(offShot.notice, false);
      assert.equal(offShot.visibleItems, 3, "the feed is untouched");
      assert.equal(offShot.namedBadgeMarked, false, "and the badges");
      assert.equal(offShot.title, "(4) YouTube", "and the title");
      assert.equal(await off.evaluate(() =>
        getComputedStyle(document.querySelector("#grid img")).filter), "none", "and the colour");
      const contentShot = await snapshot(offContent);
      assert.equal(contentShot.views, "45,000 views", "so are the counts");
      assert.equal(contentShot.likeCount, "1.2K");
      assertInvariants(await snapshot(on));
      assert.equal((await snapshot(on)).notice, true, "Reddit is still paused");
    } finally {
      await off.close();
      await offContent.close();
      await on.close();
    }
  });

  heading("enabled (the master switch)");
  await check("off: Decaf does nothing anywhere", async () => {
    await setSettings({ enabled: false });
    const pages = [];
    try {
      for (const key of ["youtube", "reddit", "instagram"]) {
        for (const route of ["feed", "content"]) {
          const page = await open(key, route);
          pages.push(page);
          const shot = await snapshot(page);
          assert.deepEqual(sorted(shot.classes), [], `${key} ${route} is untouched`);
          assert.equal(shot.notice, false, `${key} ${route}`);
          if (route === "feed") assert.equal(shot.visibleItems, 3, `${key} feed is all there`);
          if (shot.views !== null) assert.equal(shot.views, "45,000 views", `${key} ${route} counts`);
          if (shot.namedBadgeMarked !== null) {
            assert.equal(shot.namedBadgeMarked, false, `${key} ${route} badges`);
          }
        }
      }
      return "3 sites, feed and content";
    } finally {
      for (const p of pages) await p.close();
    }
  });

  heading("always on, whatever else is switched off");
  await check("media is grayscale on every site, and a game's board is not", async () => {
    await setSettings({ pauseFeeds: false, hideComments: false });
    const checked = [];
    for (const [key, ids] of Object.entries({
      youtube: ["poster"], reddit: ["postImage"], instagram: ["photo"], x: ["postImage"],
      pinterest: ["pinImage"], googlenews: ["storyImage"], linkedin: ["postImage"],
      threads: ["postImage"], bluesky: ["postImage"], facebook: ["postImage"]
    })) {
      const page = await open(key, "media");
      try {
        const { filters } = await snapshot(page);
        for (const id of ids) {
          assert.equal(filters[id], GRAY, `${key} ${id} should be grayscale, was ${filters[id]}`);
        }
        checked.push(key);
      } finally {
        await page.close();
      }
    }
    return `${checked.length} sites`;
  });

  await check("a game keeps its board in colour, and nothing else on the page", async () => {
    await setSettings();
    const page = await open("linkedin", "game");
    try {
      await page.waitForFunction(() => document.querySelector(".decaf-game-board") !== null, null,
        { timeout: 6000 });
      const shot = await snapshot(page);
      assertInvariants(shot);
      assert.ok(shot.classes.includes("decaf-game"), "the route is a game");
      assert.ok(!shot.classes.includes("decaf-hide-feed"), "a game is never paused");
      assert.equal(shot.filters.crown, "none", "the board's artwork keeps its colour");
      assert.equal(shot.filters.face, GRAY, "a face on the leaderboard does not");
      const cell = await page.evaluate(() =>
        getComputedStyle(document.querySelector("#queens-game-board .cell")).filter);
      assert.equal(cell, "none", "and neither do the coloured regions");
    } finally {
      await page.close();
    }
  });

  await check("the colour pill grants colour for one page, then asks again", async () => {
    await setSettings();
    const page = await open("youtube", "media");
    try {
      assert.equal((await snapshot(page)).filters.player, GRAY, "even what you opened starts grey");
      await page.locator(".decaf-pill").click();
      await page.waitForFunction(() => document.documentElement.classList.contains("decaf-color"));
      const granted = await snapshot(page);
      assertInvariants(granted, current, { colorGranted: true });
      assert.equal(granted.filters.player, "none", "asking for colour gives colour");
      assert.equal(granted.pill, false, "and the offer is withdrawn");
      assert.equal(granted.chip, "Full color, just for this page");
      // A move to another page asks again.
      await page.evaluate(() => history.pushState({}, "", "/watch?v=second"));
      await page.waitForSelector(".decaf-pill", { timeout: 6000 });
      const again = await snapshot(page);
      assert.equal(again.filters.player, GRAY, "the next page starts grey again");
      assert.ok(!again.classes.includes("decaf-color"));
    } finally {
      await page.close();
    }
  });

  await check("a paused feed does not play video behind it", async () => {
    await setSettings();
    const page = await open("youtube", "shorts");
    try {
      assert.ok((await snapshot(page)).notice, "Shorts is a feed, and it is paused");
      const playing = await page.evaluate(async () => {
        const video = document.querySelector("video");
        if (!video) return "no video";
        try {
          await video.play();
        } catch (_) {
          // A fixture video has no source; the play event still fires.
        }
        await new Promise((r) => setTimeout(r, 400));
        return video.paused;
      });
      assert.notEqual(playing, false, "nothing should be playing behind a paused feed");
    } finally {
      await page.close();
    }
  });
};

/* -- 3. the settings page ------------------------------------------------- */

sections.options = async () => {
  heading("the settings page");
  await setSettings();
  const page = await newPage();
  await page.goto(extensionPage("options.html"));
  await page.waitForSelector(".site");

  try {
    await check("it renders the real state: one switch per behaviour, every site", async () => {
      assert.equal(await page.locator("#master").isChecked(), true);
      assert.equal(await page.locator("#master-state").innerText(), "On");
      const switches = await page.locator("input[data-setting]").evaluateAll((list) =>
        list.map((input) => [input.dataset.setting, input.checked]));
      assert.deepEqual(switches.map(([key]) => key), D.STRENGTH_KEYS, "exactly the strength switches");
      assert.deepEqual(Object.fromEntries(switches), {
        pauseFeeds: true, hideComments: true, upsideDown: false, hideBadges: false
      }, "showing the shipped defaults");
      assert.equal(await page.locator(".site").count(), D.SITE_KEYS.length);
      assert.match(await page.locator("#version").innerText(), /^Version \d+\.\d+\.\d+$/);
      return `${D.SITE_KEYS.length} sites`;
    });

    await check("every site row names the site and what it pauses", async () => {
      for (const key of D.SITE_KEYS) {
        const row = page.locator(`.site[data-site="${key}"]`);
        assert.equal(await row.locator("strong").innerText(), D.SITES[key].label, key);
        assert.equal(await row.locator("small").innerText(), `Pauses ${D.SITES[key].feedSummary}`, key);
        assert.equal(await row.locator("input").isChecked(), true, key);
      }
      return `${D.SITE_KEYS.length} rows`;
    });

    await check("each of the four switches writes, toasts, and reaches an open page", async () => {
      const live = await open("youtube", "media");
      try {
        for (const key of D.STRENGTH_KEYS) {
          const input = page.locator(`input[data-setting="${key}"]`);
          const before = await input.isChecked();
          await input.evaluate((el) => el.click());
          await page.waitForFunction((k) => document.getElementById("toast").textContent !== "", key,
            { timeout: 4000 });
          const toast = await page.locator("#toast").innerText();
          assert.ok(toast.length > 0, `${key} says what it did`);
          const stored = await readSettings();
          assert.equal(stored[key], !before, `${key} was written as ${!before}`);
          // And the page already knows.
          const className = { pauseFeeds: "decaf-calm", hideComments: "decaf-hide-comments",
            upsideDown: "decaf-upside-down", hideBadges: "decaf-hide-badges" }[key];
          await live.waitForFunction(({ name, want }) =>
            document.documentElement.classList.contains(name) === want,
          { name: className, want: !before }, { timeout: 6000 });
          // Put it back.
          await input.evaluate((el) => el.click());
          await page.waitForFunction((k) => true, key);
          await live.waitForFunction(({ name, want }) =>
            document.documentElement.classList.contains(name) === want,
          { name: className, want: before }, { timeout: 6000 });
        }
        return "4 switches, both ways";
      } finally {
        await live.close();
      }
    });

    await check("every one of the twelve site switches works, both ways", async () => {
      for (const key of D.SITE_KEYS) {
        const input = page.locator(`.site[data-site="${key}"] input`);
        await input.evaluate((el) => el.click());
        await page.waitForFunction((k) => document.getElementById("toast").textContent.includes("off for"), key,
          { timeout: 4000 });
        let stored = await readSettings();
        assert.equal(stored.sites[key], false, `${key} switched off`);
        assert.equal(await page.locator("#toast").innerText(), `Decaf is off for ${D.SITES[key].label}.`);
        await input.evaluate((el) => el.click());
        await page.waitForFunction((k) => document.getElementById("toast").textContent.includes("on for"), key,
          { timeout: 4000 });
        stored = await readSettings();
        assert.equal(stored.sites[key], true, `${key} switched back on`);
      }
      return `${D.SITE_KEYS.length} sites`;
    });

    await check("the master switch turns everything off and back on", async () => {
      const live = await open("reddit", "feed");
      try {
        await page.locator("#master").evaluate((el) => el.click());
        await page.waitForFunction(() => document.getElementById("master-state").textContent === "Off");
        assert.equal((await readSettings()).enabled, false);
        await live.waitForFunction(() => document.documentElement.classList.length === 0, null, { timeout: 6000 });
        assert.equal((await snapshot(live)).notice, false, "the notice is withdrawn from an open page");
        await page.locator("#master").evaluate((el) => el.click());
        await page.waitForFunction(() => document.getElementById("master-state").textContent === "On");
        await live.waitForFunction(() => document.querySelector(".decaf-notice") !== null, null, { timeout: 6000 });
      } finally {
        await live.close();
      }
    });

    await check("the toast clears itself", async () => {
      await page.locator('input[data-setting="hideBadges"]').evaluate((el) => el.click());
      await page.waitForFunction(() => document.getElementById("toast").textContent !== "");
      await page.waitForFunction(() => document.getElementById("toast").textContent === "", null,
        { timeout: 6000 });
      await page.locator('input[data-setting="hideBadges"]').evaluate((el) => el.click());
      await page.waitForFunction(() => document.getElementById("toast").textContent !== "");
    });

    await check("it redraws when settings change somewhere else", async () => {
      await setSettings({ upsideDown: true, hideBadges: true });
      await page.waitForFunction(() =>
        document.querySelector('input[data-setting="upsideDown"]').checked === true &&
        document.querySelector('input[data-setting="hideBadges"]').checked === true,
      null, { timeout: 6000 });
      await setSettings();
      await page.waitForFunction(() =>
        document.querySelector('input[data-setting="upsideDown"]').checked === false,
      null, { timeout: 6000 });
    });

    await check("the lock choices are every duration, and picking one is remembered", async () => {
      const labels = await page.locator("#lock-choices button").evaluateAll((list) =>
        list.map((b) => [b.textContent, Number(b.dataset.value), b.getAttribute("aria-checked")]));
      assert.deepEqual(labels.map(([text, hours]) => ({ label: text, hours })),
        D.LOCK_DURATIONS.map(({ label, hours }) => ({ label, hours })));
      assert.deepEqual(
        labels.map(([, , checked]) => checked),
        D.LOCK_DURATIONS.map(({ hours }) => String(hours === D.DEFAULT_LOCK_HOURS)),
        "the cheapest commitment is the default choice");
      // A radiogroup has exactly one tab stop, and the arrows move between its
      // options. Three plain buttons in a row is not that.
      assert.equal(
        await page.locator("#lock-choices button").evaluateAll(
          (list) => list.filter((b) => b.tabIndex === 0).length),
        1,
        "one tab stop");
      assert.equal(
        await page.locator("#lock-choices button").first().getAttribute("role"),
        "radio",
        "the role is on the attribute, not a JS property");
      await page.locator('#lock-choices button[data-value="168"]').click();
      assert.deepEqual(
        await page.locator("#lock-choices button").evaluateAll((l) => l.map((b) => b.getAttribute("aria-checked"))),
        D.LOCK_DURATIONS.map(({ hours }) => String(hours === 168)));
      await page.locator('#lock-choices button[data-value="24"]').click();
    });

    await check("locking takes two deliberate steps, and can be backed out of", async () => {
      assert.equal(await page.locator("#lock-button").innerText(), "Lock");
      await page.locator("#lock-button").click();
      assert.equal(await page.locator("#lock-button").innerText(), "Confirm lock");
      assert.match(await page.locator("#lock-detail").innerText(), /^Lock Decaf for 1 day\?/);
      assert.equal(await page.locator("#lock-cancel").isVisible(), true);
      await page.locator("#lock-cancel").click();
      assert.equal(await page.locator("#lock-button").innerText(), "Lock");
      assert.equal((await readSettings()).lockUntil, 0, "nothing was locked");
    });
  } finally {
    await page.close();
  }
};

/* -- 4. the popup -------------------------------------------------------- */

sections.popup = async () => {
  heading("the popup");

  /**
   * A popup opened as an ordinary tab has no tab behind it, so
   * `chrome.tabs.query` is answered with the page being asked about. That is the
   * one thing about the popup that cannot be exercised as-is.
   */
  async function openPopup(tabUrl) {
    const page = await newPage();
    await page.addInitScript((pretend) => {
      const wait = setInterval(() => {
        if (!globalThis.chrome?.tabs) return;
        clearInterval(wait);
        chrome.tabs.query = async () => (pretend ? [{ url: pretend, id: 1 }] : []);
      }, 1);
    }, tabUrl);
    await page.goto(extensionPage("popup.html"));
    await page.waitForFunction(() => document.getElementById("master-state").textContent !== "");
    await page.waitForTimeout(150);
    return page;
  }

  await check("on a paused feed it says so, and how to open it", async () => {
    await setSettings();
    const page = await openPopup(url("youtube", "/"));
    try {
      assert.equal(await page.locator("#site-card").isVisible(), true);
      assert.equal(await page.locator("#site-name").innerText(), "YouTube");
      assert.equal(await page.locator("#site-badge").innerText(), "On");
      assert.equal(await page.locator("#site-detail").innerText(),
        "This feed is paused. Hold the button on the page to open it for 5 minutes.");
      assert.equal(await page.locator("#unsupported").isVisible(), false);
      assert.equal(await page.locator("#pass-row").isVisible(), false);
      assert.equal(await page.locator("#site-enable").isVisible(), false);
      assert.equal(await page.locator("#lock-button").innerText(), "Lock");
    } finally {
      await page.close();
    }
  });

  await check("on a page someone opened it does not claim anything is paused", async () => {
    await setSettings();
    const page = await openPopup(url("youtube", "/watch?v=abc"));
    try {
      assert.equal(await page.locator("#site-detail").innerText(), "Paused: Home, Shorts, Explore.");
      assert.equal(await page.locator("#site-badge").innerText(), "On");
    } finally {
      await page.close();
    }
  });

  await check("on a site Decaf does not know, it says so plainly", async () => {
    await setSettings();
    const page = await openPopup("https://example.com/");
    try {
      assert.equal(await page.locator("#unsupported").isVisible(), true);
      assert.equal(await page.locator("#site-card").isVisible(), false);
      assert.equal(await page.locator("#unsupported").innerText(),
        "Decaf works on 12 feed-driven sites, plus any you add yourself. Open one to see it here.");
    } finally {
      await page.close();
    }
  });

  await check("with no tab at all it still renders", async () => {
    await setSettings();
    const page = await openPopup(null);
    try {
      assert.equal(await page.locator("#unsupported").isVisible(), true);
      assert.equal(await page.locator("#master-state").innerText(), "On");
    } finally {
      await page.close();
    }
  });

  await check("it turns Decaf on for the site you are looking at", async () => {
    await setSettings({ sites: { ...D.cloneDefaults().sites, reddit: false } });
    const page = await openPopup(url("reddit", "/"));
    const live = await open("reddit", "feed");
    try {
      assert.equal(await page.locator("#site-badge").innerText(), "Off");
      assert.equal(await page.locator("#site-detail").innerText(),
        "Decaf is off here. Reddit behaves normally.");
      assert.equal(await page.locator("#site-enable").isVisible(), true);
      await page.locator("#site-enable").click();
      await page.waitForFunction(() => document.getElementById("site-badge").textContent === "On");
      assert.equal(await page.locator("#message").innerText(), "Decaf is on for Reddit.");
      assert.equal((await readSettings()).sites.reddit, true);
      await live.waitForFunction(() => document.querySelector(".decaf-notice") !== null, null, { timeout: 6000 });
    } finally {
      await page.close();
      await live.close();
    }
  });

  await check("the master switch works from the popup too", async () => {
    await setSettings();
    const page = await openPopup(url("youtube", "/"));
    try {
      await page.locator("#master").evaluate((el) => el.click());
      await page.waitForFunction(() => document.getElementById("master-state").textContent === "Off");
      assert.equal(await page.locator("#message").innerText(), "Decaf is off everywhere.");
      assert.equal((await readSettings()).enabled, false);
      await page.locator("#master").evaluate((el) => el.click());
      await page.waitForFunction(() => document.getElementById("master-state").textContent === "On");
      assert.equal(await page.locator("#message").innerText(), "Decaf is on.");
    } finally {
      await page.close();
    }
  });

  await check("an open feed is shown counting down, and can be handed back early", async () => {
    await setSettings({ passes: { youtube: Date.now() + 120_000 } });
    const page = await openPopup(url("youtube", "/"));
    const live = await open("youtube", "feed");
    try {
      assert.equal((await snapshot(live)).notice, false, "the feed really is open");
      assert.equal(await page.locator("#site-badge").innerText(), "Feed open");
      assert.equal(await page.locator("#pass-row").isVisible(), true);
      assert.match(await page.locator("#pass-time").innerText(), /^Feed open · [12]:\d\d left$/);
      assert.equal(await page.locator("#site-detail").innerText(), "Home, Shorts, Explore are open for now.");
      // The clock is running.
      const first = await page.locator("#pass-time").innerText();
      await page.waitForTimeout(1400);
      assert.notEqual(await page.locator("#pass-time").innerText(), first, "the countdown moves");
      await page.locator("#pass-end").click();
      await page.waitForFunction(() => document.getElementById("pass-row").hidden === true);
      assert.equal(await page.locator("#message").innerText(), "Feed paused again.");
      await live.waitForFunction(() => document.querySelector(".decaf-notice") !== null, null, { timeout: 6000 });
    } finally {
      await page.close();
      await live.close();
    }
  });

  await check("the Settings button opens the settings page", async () => {
    await setSettings();
    // Chrome focuses an already-open options tab rather than opening a second
    // one, and the page settings are written from is exactly that. Park it
    // somewhere else first, so a genuinely new tab is the only way to pass.
    await control.goto(extensionPage("popup.html"));
    const page = await openPopup(url("youtube", "/"));
    try {
      const opened = context.waitForEvent("page", { timeout: 10000 });
      await page.locator("#settings").click();
      const options = await opened;
      await options.waitForLoadState("domcontentloaded");
      assert.equal(new URL(options.url()).pathname, "/options.html");
      await options.waitForSelector(".site");
      assert.equal(await options.locator(".site").count(), D.SITE_KEYS.length, "and it is the real page");
      await options.close();
      return options.url();
    } finally {
      await page.close();
      await control.goto(extensionPage("options.html"));
      await control.waitForSelector(".site");
    }
  });

  await check("locking from the popup takes two steps and can be cancelled", async () => {
    await setSettings();
    const page = await openPopup(url("youtube", "/"));
    try {
      await page.locator("#lock-button").click();
      assert.equal(await page.locator("#lock-button").innerText(), "Confirm lock");
      await page.locator("#lock-cancel").click();
      assert.equal(await page.locator("#lock-button").innerText(), "Lock");
      assert.equal((await readSettings()).lockUntil, 0);
    } finally {
      await page.close();
    }
  });
};

/* -- 5. the hold, and the five minutes it buys --------------------------- */

sections.hold = async () => {
  heading("the hold, and the pass it earns");

  await check("a real three second hold opens the feed, and a short one does not", async () => {
    await setSettings();
    const page = await open("youtube", "feed");
    try {
      const hold = page.locator(".decaf-notice-hold");
      assert.equal(await page.locator(".decaf-notice-hint").innerText(), "Hold for 3 seconds");
      const box = await hold.boundingBox();
      const centre = [box.x + box.width / 2, box.y + box.height / 2];

      // Letting go early keeps the feed paused.
      await page.mouse.move(...centre);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
      await page.waitForTimeout(400);
      assert.equal(await page.locator(".decaf-notice").count(), 1, "a short hold changes nothing");
      assert.equal(await page.locator(".decaf-notice-label").innerText(), "Hold to open for 5 minutes");
      assert.deepEqual((await readSettings()).passes, {}, "and nothing was granted");

      // The full hold does.
      await page.mouse.down();
      await page.waitForTimeout(1100);
      assert.equal(await page.locator(".decaf-notice-label").innerText(), "Keep holding…");
      const progress = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector(".decaf-notice-fill"));
        const circumference = parseFloat(style.strokeDasharray);
        return (circumference - parseFloat(style.strokeDashoffset)) / circumference;
      });
      assert.ok(progress > 0.15 && progress < 0.75, `the ring should be part way round, was ${progress}`);
      await page.waitForTimeout(2400);
      await page.mouse.up();
      await page.waitForSelector(".decaf-notice", { state: "detached", timeout: 6000 });
      await page.waitForSelector(".decaf-chip");
      assert.equal(await page.locator(".decaf-chip").innerText(), "Feed open for 5 minutes");
      assert.equal(await page.locator("#grid ytd-rich-item-renderer").first().isVisible(), true, "the feed is back");

      const stored = await readSettings();
      assert.ok(stored.passes.youtube > Date.now() + 4 * 60_000, "five minutes were granted");
      assert.equal(stored.passHistory[D.dayKey()].youtube, 1, "and counted");
      assert.ok(stored.passHistory[D.dayKey()], "against today");
      return `ring at ${(progress * 100).toFixed(0)}%`;
    } finally {
      await page.close();
    }
  });

  await check("the hold gets longer each time, and the page says so", async () => {
    for (const [count, seconds, ordinal] of [[0, 3, null], [1, 7, "2nd"], [2, 11, "3rd"], [3, 15, "4th"], [9, 15, "10th"]]) {
      await setSettings(count ? { passHistory: { [D.dayKey()]: { youtube: count } } } : {});
      const page = await open("youtube", "feed");
      try {
        const expected = ordinal ? `Hold for ${seconds} seconds · ${ordinal} time today` : `Hold for ${seconds} seconds`;
        assert.equal(await page.locator(".decaf-notice-hint").innerText(), expected, `after ${count} passes`);
        // The animation has to actually last that long, or the words are a lie.
        await page.locator(".decaf-notice-hold").hover();
        await page.mouse.down();
        await page.waitForTimeout(120);
        const duration = await page.evaluate(() =>
          getComputedStyle(document.querySelector(".decaf-notice-fill")).animationDuration);
        await page.mouse.up();
        assert.equal(duration, `${seconds}s`, `the ring should take ${seconds}s`);
      } finally {
        await page.close();
      }
    }
    return "3s, 7s, 11s, 15s, capped";
  });

  await check("a lock adds four seconds to the hold", async () => {
    await setSettings({ lockUntil: Date.now() + 3600_000 });
    const page = await open("youtube", "feed");
    try {
      assert.equal(await page.locator(".decaf-notice-hint").innerText(), "Hold for 7 seconds");
      await page.locator(".decaf-notice-hold").hover();
      await page.mouse.down();
      await page.waitForTimeout(120);
      const duration = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".decaf-notice-fill")).animationDuration);
      await page.mouse.up();
      assert.equal(duration, "7s");
    } finally {
      await page.close();
    }
  });

  await check("when the pass runs out the feed pauses again and says why", async () => {
    await setSettings({ passes: { youtube: Date.now() + 2500 } });
    const page = await open("youtube", "feed");
    try {
      assert.equal((await snapshot(page)).notice, false, "the feed starts open");
      await page.waitForSelector(".decaf-notice", { timeout: 12000 });
      const shot = await snapshot(page);
      assert.equal(shot.visibleItems, 0, "the feed is paused again");
      const status = await page.locator(".decaf-notice-status").innerText();
      assert.equal(status, "Your 5 minutes are up.", "and it says why");
      return status;
    } finally {
      await page.close();
    }
  });

  await check("the notice is reachable and operable by keyboard alone", async () => {
    await setSettings();
    const page = await open("youtube", "feed");
    try {
      const focused = await page.evaluate(() => {
        const button = document.querySelector(".decaf-notice-hold");
        button.focus();
        return document.activeElement === button;
      });
      assert.equal(focused, true, "the button takes focus");
      assert.equal(await page.evaluate(() =>
        document.querySelector(".decaf-notice-hold").getAttribute("aria-describedby")), "decaf-notice-hint");
      await page.keyboard.down("Space");
      await page.waitForTimeout(150);
      assert.equal(await page.locator(".decaf-notice-label").innerText(), "Keep holding…");
      assert.equal(await page.locator(".decaf-notice-status").innerText(), "Keep holding for 3 seconds.");
      await page.waitForTimeout(3200);
      await page.keyboard.up("Space");
      await page.waitForSelector(".decaf-notice", { state: "detached", timeout: 6000 });
      assert.ok((await readSettings()).passes.youtube > Date.now(), "a keyboard hold earns the same pass");
    } finally {
      await page.close();
    }
  });

  await check("a pass is per site: opening one feed does not open another", async () => {
    await setSettings({ passes: { youtube: Date.now() + 120_000 } });
    const yt = await open("youtube", "feed");
    const rd = await open("reddit", "feed");
    try {
      assert.equal((await snapshot(yt)).notice, false, "YouTube is open");
      assert.equal((await snapshot(rd)).notice, true, "Reddit is not");
    } finally {
      await yt.close();
      await rd.close();
    }
  });
};

/* -- 6. the lock --------------------------------------------------------- */

sections.lock = async () => {
  heading("the lock");

  await check("locking writes a baseline and holds every switch in place", async () => {
    await setSettings();
    const page = await newPage();
    try {
      await page.goto(extensionPage("options.html"));
      await page.waitForSelector(".site");
      // The default is now the cheapest commitment, so a day has to be chosen.
      await page.locator('#lock-choices button[data-value="24"]').click();
      await page.locator("#lock-button").click();
      // The confirm step lists what is about to be frozen, not just for how long.
      assert.match(await page.locator("#lock-summary").innerText(), /12 of 12 sites/);
      assert.match(await page.locator("#lock-summary").innerText(), /4 seconds longer/);
      await page.locator("#lock-button").click();
      await page.waitForFunction(() => document.getElementById("lock-button").hidden === true, null,
        { timeout: 6000 });

      const stored = await readSettings();
      assert.ok(stored.lockUntil > Date.now() + 23 * 3600_000, "a day was locked");
      assert.ok(stored[D.LOCK_BASELINE_KEY], "a baseline was recorded");
      assert.equal(stored[D.LOCK_BASELINE_KEY].pauseFeeds, true);
      assert.match(await page.locator("#lock-badge").innerText(), /^(1 day|23 hr \d+ min) left$/);
      assert.equal(await page.locator("#lock-choices").isVisible(), false, "no more durations to pick");

      // What is on cannot be switched off; what is off can still be added.
      assert.equal(await page.locator('input[data-setting="pauseFeeds"]').getAttribute("aria-disabled"), "true");
      assert.equal(await page.locator('input[data-setting="hideComments"]').getAttribute("aria-disabled"), "true");
      assert.equal(await page.locator('input[data-setting="upsideDown"]').getAttribute("aria-disabled"), "false");
      assert.equal(await page.locator("#master").getAttribute("aria-disabled"), "true");
      assert.equal(await page.locator("#master-state").innerText(), "Locked");
      for (const key of D.SITE_KEYS) {
        assert.equal(await page.locator(`.site[data-site="${key}"] input`).isDisabled(), true, key);
      }
      await page.locator('input[data-setting="upsideDown"]').evaluate((el) => el.click());
      await page.waitForFunction(() => document.getElementById("toast").textContent !== "");
      assert.equal((await readSettings()).upsideDown, true, "a lock can be added to");
      return await page.locator("#lock-badge").innerText();
    } finally {
      await page.close();
    }
  });

  await check("a stale writer cannot weaken a running lock", async () => {
    const lockUntil = Date.now() + 24 * 3600_000;
    const baseline = D.mergeSettings({ ...D.cloneDefaults(), lockUntil });
    await setSettings({ lockUntil }, { [D.LOCK_BASELINE_KEY]: baseline });
    const page = await newPage();
    try {
      await page.goto(extensionPage("options.html"));
      await page.waitForSelector(".site");
      // The popup and settings page both refuse in the UI, so go behind them.
      await control.evaluate(async () => {
        await chrome.storage.local.set({ enabled: false, pauseFeeds: false, hideComments: false });
      });
      // The service worker puts it back.
      await page.waitForFunction(() => true);
      const repaired = await (async () => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const stored = await readSettings();
          if (stored.enabled && stored.pauseFeeds && stored.hideComments) return stored;
          await new Promise((r) => setTimeout(r, 250));
        }
        return readSettings();
      })();
      assert.equal(repaired.enabled, true, "Decaf was switched back on");
      assert.equal(repaired.pauseFeeds, true, "and so were the switches");
      assert.equal(repaired.hideComments, true);
      assert.ok(repaired.lockUntil >= lockUntil, "and the lock was not shortened");
    } finally {
      await page.close();
    }
  });

  await check("the settings page refuses to weaken a lock, and says so", async () => {
    const lockUntil = Date.now() + 24 * 3600_000;
    await setSettings({ lockUntil }, {
      [D.LOCK_BASELINE_KEY]: D.mergeSettings({ ...D.cloneDefaults(), lockUntil })
    });
    const page = await newPage();
    try {
      await page.goto(extensionPage("options.html"));
      await page.waitForSelector(".site");
      // Reach past the disabled attribute the way a determined person would.
      await page.evaluate(() => {
        document.querySelector('input[data-setting="pauseFeeds"]').click();
      });
      await page.waitForFunction(() => document.getElementById("toast").textContent !== "", null,
        { timeout: 6000 });
      assert.equal(await page.locator("#toast").innerText(), "Lock is on until it ends.");
      assert.equal((await readSettings()).pauseFeeds, true, "and nothing was written");
      assert.equal(await page.locator('input[data-setting="pauseFeeds"]').isChecked(), true, "the switch snaps back");
    } finally {
      await page.close();
    }
  });

  await check("the popup refuses too", async () => {
    const lockUntil = Date.now() + 24 * 3600_000;
    await setSettings({ lockUntil }, {
      [D.LOCK_BASELINE_KEY]: D.mergeSettings({ ...D.cloneDefaults(), lockUntil })
    });
    const page = await newPage();
    try {
      await page.addInitScript((pretend) => {
        const wait = setInterval(() => {
          if (!globalThis.chrome?.tabs) return;
          clearInterval(wait);
          chrome.tabs.query = async () => [{ url: pretend, id: 1 }];
        }, 1);
      }, url("youtube", "/"));
      await page.goto(extensionPage("popup.html"));
      await page.waitForFunction(() => document.getElementById("master-state").textContent === "Locked");
      assert.equal(await page.locator("#master").getAttribute("aria-disabled"), "true");
      assert.equal(await page.locator("#lock-button").isVisible(), false);
      assert.match(await page.locator("#lock-title").innerText(), /^Locked · /);
      await page.evaluate(() => {
        document.getElementById("master").click();
      });
      await page.waitForFunction(() => document.getElementById("message").textContent !== "", null,
        { timeout: 6000 });
      assert.equal(await page.locator("#message").innerText(), "Lock keeps Decaf on.");
      assert.equal((await readSettings()).enabled, true);
    } finally {
      await page.close();
    }
  });

  await check("a finished lock lets go, and cleans up after itself", async () => {
    const lockUntil = Date.now() + 1200;
    await setSettings({ lockUntil }, {
      [D.LOCK_BASELINE_KEY]: D.mergeSettings({ ...D.cloneDefaults(), lockUntil })
    });
    const page = await newPage();
    try {
      await page.goto(extensionPage("options.html"));
      await page.waitForSelector(".site");
      // The alarm the worker sets is what wakes it; nudge storage as a backstop
      // so this does not depend on alarm granularity.
      await new Promise((r) => setTimeout(r, 2000));
      await control.evaluate(async () => chrome.storage.local.set({ passHistory: {} }));
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const stored = await readSettings();
        if (!(D.LOCK_BASELINE_KEY in stored)) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const stored = await readSettings();
      assert.equal(D.LOCK_BASELINE_KEY in stored, false, "the baseline is gone");
      assert.equal(D.isLocked(stored), false, "and the lock is over");
      await page.reload();
      await page.waitForSelector(".site");
      assert.equal(await page.locator('input[data-setting="pauseFeeds"]').isDisabled(), false,
        "the switches are free again");
      assert.equal(await page.locator("#lock-badge").innerText(), "Off");
    } finally {
      await page.close();
    }
  });
};

/* -- 7. the toolbar icon ------------------------------------------------- */

sections.worker = async () => {
  heading("the toolbar icon");

  async function title() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const worker = context.serviceWorkers().find((w) => w.url().includes(extensionId));
      if (worker) {
        try {
          const value = await worker.evaluate(() => chrome.action.getTitle({}));
          if (value) return value;
        } catch (_) {
          // The worker can be replaced mid-question; ask again.
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  async function expectTitle(want) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if ((await title()) === want) return want;
      await new Promise((r) => setTimeout(r, 250));
    }
    const got = await title();
    assert.equal(got, want);
    return got;
  }

  await check("it says on when Decaf is on", async () => {
    await setSettings();
    return expectTitle("Decaf — on");
  });

  await check("it says off when Decaf is off", async () => {
    await setSettings({ enabled: false });
    return expectTitle("Decaf — off");
  });

  await check("it says locked while a lock runs", async () => {
    const lockUntil = Date.now() + 3600_000;
    await setSettings({ lockUntil }, {
      [D.LOCK_BASELINE_KEY]: D.mergeSettings({ ...D.cloneDefaults(), lockUntil })
    });
    return expectTitle("Decaf — locked");
  });

  await check("and goes back to on once the lock ends", async () => {
    await setSettings();
    return expectTitle("Decaf — on");
  });
};

/* -- 8. clicking around ------------------------------------------------- */

sections.crawl = async () => {
  heading("clicking around");

  /** A fixed seed, so a failure can be reproduced exactly. */
  function random(seed) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  /**
   * Walks a site by clicking links a person could actually reach, checking the
   * full set of invariants after every step. What makes this worth doing is that
   * it exercises route *changes*: the same tab moving between a paused feed, a
   * post, a search page and back.
   *
   * Unvisited destinations are preferred over ones already seen. Left purely
   * random the walk pinballed around the header — on a paused feed the feed's own
   * links are gone, so the navigation bar is most of what is clickable — and
   * several runs never reached a post at all, which is a shallow walk wearing a
   * seed. `expect` then requires the walk to have actually covered the route
   * kinds it was supposed to, so it cannot go shallow again without failing.
   */
  async function crawl(key, {
    steps = 6, seed = 7, settings = current, start = "feed", expect = ["media", "content"]
  } = {}) {
    const page = await open(key, start);
    const here = () => {
      const { pathname, search } = new URL(page.url());
      return pathname + search;
    };
    const trail = [here()];
    const seen = new Set(trail);
    const routes = new Set([D.getRoute(page.url())]);
    const next = random(seed);
    try {
      assertInvariants(await snapshot(page), settings);
      for (let step = 0; step < steps; step += 1) {
        // Only links a person could actually click: on screen, same site, and
        // somewhere other than here.
        const links = [];
        for (const handle of await page.$$("a[href]")) {
          const href = await handle.evaluate((a) => {
            if (!a.getClientRects().length) return null;
            try {
              const target = new URL(a.href, location.href);
              if (target.host !== location.host || target.protocol !== "https:") return null;
              if (target.pathname + target.search === location.pathname + location.search) return null;
              return target.href;
            } catch (_) {
              return null;
            }
          });
          if (href) links.push({ handle, href, where: new URL(href).pathname + new URL(href).search });
        }
        if (!links.length) break;
        const fresh = links.filter((link) => !seen.has(link.where));
        const pool = fresh.length ? fresh : links;
        const { handle, href, where } = pool[Math.floor(next() * pool.length)];

        const arrived = page.waitForURL(href, { timeout: 15000 }).catch(() => {});
        await handle.click({ timeout: 8000 }).catch(() => handle.evaluate((a) => a.click()));
        await arrived;
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await settle(page);

        trail.push(where);
        seen.add(where);
        routes.add(D.getRoute(page.url()));
        assertInvariants(await snapshot(page), settings);
      }
      for (const route of expect) {
        assert.ok(routes.has(route), `the walk never reached a ${route} route: ${trail.join(" → ")}`);
      }
      return trail.join(" → ");
    } finally {
      await page.close();
    }
  }

  // Every site, so no site's route table is only ever checked by a direct visit.
  for (const key of D.SITE_KEYS) {
    await check(`${D.siteLabel(key)}: eight clicks with the shipped defaults`, async () => {
      await setSettings();
      return crawl(key, { steps: 8, seed: 11 + key.length });
    });
  }

  await check("LinkedIn: a walk that has to pass through a game", async () => {
    await setSettings();
    return crawl("linkedin", { steps: 8, seed: 4, expect: ["media", "content", "game", "feed"] });
  });

  await check("YouTube: eight clicks with an open feed, so the feed's own links are reachable", async () => {
    await setSettings({ passes: { youtube: Date.now() + 10 * 60_000 } });
    return crawl("youtube", { steps: 8, seed: 5 });
  });

  await check("Reddit: eight clicks with every switch on", async () => {
    await setSettings({ upsideDown: true, hideBadges: true });
    return crawl("reddit", { steps: 8, seed: 3 });
  });

  await check("LinkedIn: eight clicks with Decaf off for LinkedIn only", async () => {
    await setSettings({ sites: { ...D.cloneDefaults().sites, linkedin: false } });
    return crawl("linkedin", { steps: 8, seed: 9 });
  });

  await check("Twitch: eight clicks with feeds unpaused, so the directory is walkable", async () => {
    await setSettings({ pauseFeeds: false });
    return crawl("twitch", { steps: 8, seed: 6 });
  });

  await check("a single-page route change is followed without a reload", async () => {
    await setSettings();
    const page = await open("youtube", "media");
    try {
      assertInvariants(await snapshot(page), current);
      // media → feed, in place.
      await page.evaluate(() => history.pushState({}, "", "/"));
      await page.waitForFunction(() => document.documentElement.classList.contains("decaf-hide-feed"), null,
        { timeout: 8000 });
      let shot = await snapshot(page);
      assert.ok(shot.classes.includes("decaf-feed"));
      assert.equal(shot.pill, false, "the colour offer belongs to the page that had media");
      // feed → content, in place.
      await page.evaluate(() => history.pushState({}, "", "/results?search_query=lofi"));
      await page.waitForFunction(() => document.documentElement.classList.contains("decaf-content"), null,
        { timeout: 8000 });
      shot = await snapshot(page);
      assert.ok(!shot.classes.includes("decaf-hide-feed"), "a search page is not a feed");
      assert.equal(shot.notice, false);
      // and back.
      await page.goBack();
      await page.waitForTimeout(600);
      return "media → feed → content → back";
    } finally {
      await page.close();
    }
  });

  await check("the back button lands on a correctly treated page", async () => {
    await setSettings();
    const page = await open("reddit", "feed");
    try {
      // A subreddit front page is a feed of its own now, so following the
      // sidebar link out of one paused feed lands on another paused feed — its
      // posts are not there to be clicked, which is the entire point.
      await page.locator("#to-sub").click();
      await page.waitForLoadState("domcontentloaded");
      await settle(page);
      const sub = await snapshot(page);
      assertInvariants(sub, current);
      assert.equal(sub.notice, true, "a subreddit front page is paused too");
      // The thread is reached the way a person actually reaches one from a
      // paused world: a link from search, a share, the address bar.
      await page.goto(url("reddit", "/r/fixit/comments/abc123/leaking_dishwasher/"));
      await page.waitForLoadState("domcontentloaded");
      await settle(page);
      assertInvariants(await snapshot(page), current);
      await page.goBack();
      await settle(page);
      assertInvariants(await snapshot(page), current);
      await page.goBack();
      await settle(page);
      const shot = await snapshot(page);
      assertInvariants(shot, current);
      assert.equal(shot.notice, true, "back on the feed, still paused");
      return "feed → r/fixit (paused) → thread by address → back → back";
    } finally {
      await page.close();
    }
  });
};

/* ------------------------------------------------------------------- main -- */

async function main() {
  if (!playwright) {
    process.stdout.write("playwright is not installed — run: npm install --no-save playwright\n");
    process.exit(2);
  }
  if (!fs.existsSync(path.join(dist, "manifest.json"))) {
    process.stdout.write("dist/ is not built — run: npm run build\n");
    process.exit(2);
  }

  await launch();
  process.stdout.write(`Decaf loaded as ${extensionId}\n`);

  const chosen = only.length ? only : Object.keys(sections);
  const unknown = chosen.filter((name) => !sections[name]);
  if (unknown.length) {
    process.stdout.write(`unknown section(s): ${unknown.join(", ")}\n`);
    process.stdout.write(`available: ${Object.keys(sections).join(", ")}\n`);
    process.exit(2);
  }

  for (const name of chosen) {
    pageErrors = [];
    await sections[name]();
    heading(`${name}: page health`);
    await check("no page or worker threw anything", () => {
      assert.deepEqual([...new Set(pageErrors)], []);
    });
  }

  const failed = results.filter((entry) => !entry.ok);
  process.stdout.write(`\n${"─".repeat(64)}\n`);
  process.stdout.write(`${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length) {
    process.stdout.write(`\n${failed.length} failing:\n`);
    for (const entry of failed) process.stdout.write(`  · [${entry.section}] ${entry.name}\n    ${entry.message}\n`);
  }

  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  process.stdout.write(`\nthe run itself failed: ${error?.stack || error}\n`);
  try {
    await context?.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  } catch (_) {
    // Shutting down is best effort.
  }
  process.exit(2);
});
