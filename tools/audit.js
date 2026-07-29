#!/usr/bin/env node
/**
 * Dev-only helper: checks every friction Decaf applies, on every supported site,
 * in a real signed-in Chrome you started yourself:
 *
 *   chrome --remote-debugging-port=9222 --user-data-dir=~/.chrome-debug
 *   node tools/audit.js            # all sites
 *   node tools/audit.js reddit x   # just these
 *
 * It only reads. It never clicks anything on a site, and the only page it opens
 * beyond the feed is one post or video, found by reading a link off a profile.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { version, openTab, reloadExtension } = require("./cdp.js");
const D = require("../core.js");

const shots = path.join(os.tmpdir(), "decaf-audit");

/**
 * `open` is a content route (never a feed) that lists links to single posts, and
 * `link` picks one out. `comments` is what must not be showing on a post: on most
 * sites that is the thread itself, on Reddit only the part of it Decaf caps, since
 * a Reddit thread is the answer someone came for and stays visible.
 */
const SITES = {
  youtube: {
    feed: "https://www.youtube.com/",
    open: "https://www.youtube.com/results?search_query=lofi",
    link: "a[href^='/watch']",
    comments: "#comments, ytd-comments",
    media: "#movie_player video",
    rails: "#related, ytd-watch-next-secondary-results-renderer"
  },
  instagram: {
    feed: "https://www.instagram.com/",
    open: "https://www.instagram.com/natgeo/",
    link: "a[href*='/p/'], a[href*='/reel/']",
    comments: "main article ul > li + li, [aria-label='Add a comment…']",
    // A post page has no <article>: the widest image in <main> is the photo.
    media: "main img, main video"
  },
  tiktok: {
    feed: "https://www.tiktok.com/",
    open: "https://www.tiktok.com/@tiktok",
    link: "a[href*='/video/']",
    comments: "[data-e2e='comment-list'], [data-e2e='browse-comment'], [data-e2e='comment-level-1']",
    media: "video"
  },
  x: {
    feed: "https://x.com/home",
    open: "https://x.com/X",
    link: "a[href*='/status/']",
    comments: "div[aria-label^='Timeline: Conversation'] > div > div:nth-child(n+2)",
    media: "[data-testid='tweetPhoto'] img, article video"
  },
  reddit: {
    feed: "https://www.reddit.com/",
    open: "https://www.reddit.com/r/aww/",
    link: "a[href*='/comments/']",
    // Deep replies and the loader that fetches a thousand more. Top-level
    // comments are meant to still be here, so they are checked separately below.
    comments: "shreddit-comment:not([depth='0']):not([depth='1'])," +
      " shreddit-comment faceplate-partial[src*='/svc/shreddit/more-comments/']," +
      " .commentarea .child .child .comment",
    kept: "shreddit-comment[depth='0'], .commentarea > .sitetable > .comment",
    media: "shreddit-post img, [slot='post-media-container'] img"
  },
  facebook: {
    feed: "https://www.facebook.com/",
    open: "https://www.facebook.com/natgeo/photos",
    link: "a[href*='/photo'], a[href*='/posts/'], a[href*='/videos/']",
    comments: "[role='article'] [role='article']",
    media: "[data-visualcompletion='media-vc-image'], video"
  },
  threads: {
    feed: "https://www.threads.com/",
    open: "https://www.threads.com/@natgeo",
    link: "a[href*='/post/']",
    comments: null,
    media: "main video, main img"
  },
  bluesky: {
    feed: "https://bsky.app/",
    open: "https://bsky.app/profile/nasa.gov",
    link: "a[href*='/post/']",
    comments: null,
    media: "img[src*='feed_fullsize'], video"
  },
  twitch: {
    feed: "https://www.twitch.tv/",
    open: null,
    single: "https://www.twitch.tv/twitch",
    comments: "#live-chat-frame, [data-a-target='chat-shell'], section[aria-label*='Chat']",
    media: "video"
  },
  pinterest: {
    feed: "https://www.pinterest.com/",
    open: "https://www.pinterest.com/search/pins/?q=oak%20desk",
    link: "a[href^='/pin/']",
    comments: null,
    media: "[data-test-id*='closeup' i] img, img",
    rails: "[data-test-id='related-pins'], [data-test-id='closeup-related-modules']"
  },
  linkedin: {
    feed: "https://www.linkedin.com/feed/",
    open: "https://www.linkedin.com/company/natgeo/posts/",
    link: "a[href*='/posts/'], a[href*='/feed/update/']",
    comments: ".comments-comments-list, .comments-comment-list__container",
    media: "[class*='update-components-image'] img, video",
    rails: "#feed-news-module, .news-module"
  },
  googlenews: {
    feed: "https://news.google.com/",
    open: "https://news.google.com/search?q=climate",
    link: "a[href*='/read/'], a[href*='/articles/']",
    comments: null,
    media: "main img"
  }
};

/* ------------------------------------------------------------ page probes -- */

const FEED_CHECK = (selectors) => {
  const seen = (el) => Boolean(el && el.getClientRects().length);
  const notice = document.querySelector(".decaf-notice");
  const items = [...document.querySelectorAll(
    "article,[role='article'],shreddit-post,ytd-rich-item-renderer,[data-testid='cellInnerDiv']," +
    "[data-test-id='pin'],[data-e2e='recommend-list-item-container'],[data-pressable-container]," +
    "[data-id^='urn:li:activity'],.thing"
  )];
  const result = {
    active: document.documentElement.classList.contains("decaf-on"),
    paused: document.documentElement.classList.contains("decaf-hide-feed"),
    card: Boolean(notice) && seen(notice),
    itemsVisible: items.filter(seen).length,
    matched: selectors.filter((selector) => document.querySelector(selector)).length,
    guessed: Boolean(document.querySelector(".decaf-feed-container")),
    scrollLocked: /hidden/.test(getComputedStyle(document.documentElement).overflow)
  };
  if (notice) {
    const rect = notice.getBoundingClientRect();
    const covering = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + 2));
    result.cardWidth = Math.round(rect.width);
    result.cardFits = rect.top >= 0 && rect.bottom <= innerHeight;
    result.cardCovered = !(covering === notice || notice.contains(covering));
  }
  return result;
};

/**
 * Reward counts, notification badges and stopped autoplay. Deliberately cheap:
 * a full pass over every element with getComputedStyle is enough to kill a tab on
 * a page as large as Instagram's.
 */
const QUIET_CHECK = () => {
  const seen = (el) => Boolean(el && el.getClientRects().length);
  const reward = /like|view|comment|repl|repost|share|follow|subscrib|vote|karma|save|reaction|watching|viewer/i;

  // Counts that are still showing next to reward words.
  const numbers = [];
  // Every other number that looks like a count, for a human to read.
  const loose = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  let scanned = 0;
  while ((node = walker.nextNode()) && scanned < 4000) {
    scanned += 1;
    const value = (node.nodeValue || "").trim();
    if (!value || value.length > 24 || !/\d/.test(value)) continue;
    const isCount = /^[\d.,]+[KkMmBb]?\+?$/.test(value);
    const withNoun = new RegExp(`\\d[\\d.,]*\\s*[KkMmBb]?\\s*(?:${reward.source})`, "i").test(value);
    if (!isCount && !withNoun) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(".decaf-notice,script,style,textarea,input,[contenteditable]")) continue;
    if (!seen(parent)) continue;
    let context = "";
    let el = parent;
    for (let i = 0; i < 4 && el; i += 1) {
      context += ` ${el.getAttribute?.("aria-label") || ""} ${typeof el.className === "string" ? el.className : ""} ${el.getAttribute?.("data-testid") || ""} ${el.localName}`;
      for (const icon of el.querySelectorAll?.("svg[aria-label],img[alt],[title]") || []) {
        context += ` ${icon.getAttribute("aria-label") || icon.getAttribute("alt") || icon.getAttribute("title") || ""}`;
      }
      el = el.parentElement;
    }
    if (withNoun || reward.test(context)) numbers.push(value.slice(0, 18));
    // Anything count-shaped, whatever the context says. Reported for a human to
    // look over: a leak Decaf's own rule cannot see would show up here.
    else if (isCount && value.replace(/\D/g, "").length > 1) loose.push(value.slice(0, 18));
  }

  // Badges: small, count-shaped, painted in a strong red. Only where badges live.
  const red = [];
  const candidates = document.querySelectorAll(
    "dynamic-badge,[class*='badge' i],[class*='unread' i],[data-badge]," +
    "header span,header div,nav span,nav div,[role='banner'] span,[role='navigation'] span"
  );
  for (const el of candidates) {
    if (el.children.length > 1) continue;
    const text = (el.textContent || el.shadowRoot?.textContent || "").trim();
    if (!/^\d+\+?$/.test(text)) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || rect.width > 70 || rect.height > 40) continue;
    let painted = el;
    for (let i = 0; i < 4 && painted; i += 1) {
      const style = getComputedStyle(painted);
      const parts = style.backgroundColor.match(/\d+(?:\.\d+)?/g);
      const opaque = parts && Number(parts[3] ?? 1) > 0.3;
      if (opaque && Number(parts[0]) > 140 && Number(parts[1]) < 100 && Number(parts[2]) < 100) {
        if (!style.filter.includes("grayscale") && !getComputedStyle(el).filter.includes("grayscale")) {
          red.push({ tag: el.localName, text: text.slice(0, 4), bg: style.backgroundColor });
        }
        break;
      }
      painted = painted.parentElement;
    }
  }

  const playing = [...document.querySelectorAll("video")].filter((v) => !v.paused && !v.ended);
  return {
    unmaskedCounts: numbers.slice(0, 8),
    unmaskedCount: numbers.length,
    looseNumbers: [...new Set(loose)].slice(0, 10),
    dashes: (document.body.innerText.match(/—/g) || []).length,
    redBadges: red.slice(0, 4),
    playingVideos: playing.length,
    playingMuted: playing.filter((v) => v.muted).length
  };
};

const MEDIA_CHECK = ({ media, comments, kept, rails }) => {
  const seen = (el) => Boolean(el && el.getClientRects().length);
  const pick = (selector) => {
    if (!selector) return null;
    const list = [...document.querySelectorAll(selector)].filter(seen);
    return list.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
  };
  const primary = pick(media);
  const pill = document.querySelector(".decaf-pill");
  return {
    route: [...document.documentElement.classList].find((c) => /^decaf-(feed|media|content)$/.test(c)) || null,
    grayscale: primary ? getComputedStyle(primary).filter : "no media found",
    colorPill: Boolean(pill) && seen(pill),
    commentsVisible: comments ? [...document.querySelectorAll(comments)].filter(seen).length : "n/a",
    // What the cap is supposed to leave behind. Only set where hiding a thread
    // outright would take the answer with it.
    keptVisible: kept ? [...document.querySelectorAll(kept)].filter(seen).length : "n/a",
    railsVisible: rails ? [...document.querySelectorAll(rails)].filter(seen).length : "n/a"
  };
};

const FIND_LINK = (selector) => {
  const seen = (el) => Boolean(el && el.getClientRects().length);
  const link = [...document.querySelectorAll(selector)].filter(seen)[0];
  return link ? link.href : null;
};

/* ------------------------------------------------------------------ main -- */

const logFile = path.join(os.tmpdir(), "decaf-audit.log");

/** Written to a file as well: a lost pipe should not lose the findings. */
function log(text) {
  process.stdout.write(`${text}\n`);
  try {
    fs.appendFileSync(logFile, `${text}\n`);
  } catch (_) {
    // Reporting is best effort.
  }
}

process.on("exit", (code) => {
  if (!global.__decafAuditDone) log(`the run ended early (exit ${code})`);
});
process.on("unhandledRejection", (error) => {
  log(`unhandled: ${String(error?.message || error).split("\n")[0]}`);
});

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  try {
    fs.writeFileSync(logFile, "");
  } catch (_) {
    // Reporting is best effort.
  }
  const only = process.argv.slice(2);
  const keys = (only.length ? only : Object.keys(SITES)).filter((key) => SITES[key]);

  log(`attached to ${(await version()).Browser}`);
  try {
    await reloadExtension(path.resolve(__dirname, ".."));
    log("extension reloaded");
  } catch (error) {
    log(`could not reload the extension: ${error.message}`);
  }

  const failures = [];

  for (const key of keys) {
    const site = SITES[key];
    log(`\n── ${D.siteLabel(key)}`);
    // One tab per site: a page that takes its renderer down cannot end the run.
    const tab = await openTab();
    try {

    // 1. The feed itself.
    try {
      await tab.goto(site.feed);
      await tab.wait(5500);
      const feed = await tab.evaluate(FEED_CHECK, D.feedSelectors(key));
      const quiet = await tab.evaluate(QUIET_CHECK);
      const problems = [];
      if (!feed.active) problems.push("Decaf inactive");
      if (!feed.paused) problems.push("feed not paused");
      if (!feed.card) problems.push("no card");
      if (feed.itemsVisible) problems.push(`${feed.itemsVisible} feed items visible`);
      if (feed.cardCovered) problems.push("card covered by an overlay");
      if (feed.cardFits === false) problems.push("card does not fit the window");
      if (feed.scrollLocked) problems.push("scroll locked");
      if (feed.guessed) problems.push("container guessed by shape");
      if (quiet.redBadges.length) problems.push(`red badge: ${JSON.stringify(quiet.redBadges[0])}`);
      if (quiet.unmaskedCount) problems.push(`${quiet.unmaskedCount} unmasked count(s): ${quiet.unmaskedCounts.join(", ")}`);
      if (quiet.playingMuted) problems.push(`${quiet.playingMuted} muted video(s) playing`);
      log(`   feed      ${problems.length ? "FAIL" : "ok"}  card ${feed.cardWidth}px · items ${feed.itemsVisible} · dashes ${quiet.dashes}`);
      for (const problem of problems) log(`             → ${problem}`);
      if (quiet.looseNumbers.length) log(`             · numbers left: ${quiet.looseNumbers.join(", ")}`);
      if (problems.length) failures.push(`${key} feed`);
      await tab.screenshot(path.join(shots, `${key}-feed.png`));
    } catch (error) {
      log(`   feed      FAIL  ${error.message.split("\n")[0]}`);
      failures.push(`${key} feed`);
    }

    // 2. One post or video, opened on purpose.
    let target = site.single || null;
    if (!target && site.open) {
      try {
        await tab.goto(site.open);
        await tab.wait(5000);
        target = await tab.evaluate(FIND_LINK, site.link);
      } catch (_) {
        target = null;
      }
    }
    if (!target) {
      log("   opened    skipped (no post link found)");
      await tab.close();
      continue;
    }
    try {
      await tab.goto(target);
      await tab.wait(6000);
      const media = await tab.evaluate(MEDIA_CHECK, {
        media: site.media,
        comments: site.comments,
        kept: site.kept,
        rails: site.rails
      });
      const quiet = await tab.evaluate(QUIET_CHECK);
      const problems = [];
      const notes = [];
      // Some links leave the site — Google News sends you to the publisher.
      const landed = await tab.evaluate(() => location.href);
      if (!D.getSite(landed)) {
        log(`   opened    skipped (the link left the site: ${new URL(landed).hostname})`);
        continue;
      }
      if (media.route !== "decaf-media" && media.route !== "decaf-content") problems.push(`route is ${media.route}`);
      const hasMedia = media.grayscale !== "no media found";
      if (site.media && hasMedia && !/grayscale/.test(media.grayscale)) {
        problems.push(`media not grayscale (${media.grayscale})`);
      }
      if (media.route === "decaf-media" && !media.colorPill) problems.push("no colour pill offered");
      if (site.media && !hasMedia) notes.push("no media on this post");
      if (typeof media.commentsVisible === "number" && media.commentsVisible > 0) {
        problems.push(`${media.commentsVisible} comment thread(s) visible`);
      }
      // A cap that leaves nothing behind has hidden the answer, which is the
      // failure it exists to prevent. Reported as loudly as a leak.
      if (typeof media.keptVisible === "number" && media.keptVisible === 0) {
        problems.push("the cap took the whole thread: no comment left to read");
      }
      if (typeof media.railsVisible === "number" && media.railsVisible > 0) {
        problems.push(`${media.railsVisible} recommendation rail(s) visible`);
      }
      if (quiet.redBadges.length) problems.push(`red badge: ${JSON.stringify(quiet.redBadges[0])}`);
      if (quiet.unmaskedCount) problems.push(`${quiet.unmaskedCount} unmasked count(s): ${quiet.unmaskedCounts.join(", ")}`);
      log(`   opened    ${problems.length ? "FAIL" : "ok"}  ${media.route} · comments ${media.commentsVisible} · kept ${media.keptVisible} · rails ${media.railsVisible} · dashes ${quiet.dashes}`);
      log(`             ${new URL(target).pathname.slice(0, 60)}`);
      for (const problem of problems) log(`             → ${problem}`);
      for (const note of notes) log(`             · ${note}`);
      if (quiet.looseNumbers.length) log(`             · numbers left: ${quiet.looseNumbers.join(", ")}`);
      if (problems.length) failures.push(`${key} opened`);
      await tab.screenshot(path.join(shots, `${key}-opened.png`));
    } catch (error) {
      log(`   opened    FAIL  ${error.message.split("\n")[0]}`);
      failures.push(`${key} opened`);
    }
    } finally {
      await tab.close();
    }
  }

  global.__decafAuditDone = true;
  log(`\n${failures.length ? `problems: ${failures.join(", ")}` : "every check passed"} · screenshots in ${shots}`);
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
