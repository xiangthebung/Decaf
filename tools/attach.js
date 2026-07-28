#!/usr/bin/env node
/**
 * Dev-only helper: checks Decaf on the real, signed-in sites by attaching over CDP
 * to a Chrome you started yourself with:
 *
 *   chrome --remote-debugging-port=9222 --user-data-dir=~/.chrome-debug
 *
 * It only navigates and measures. It never clicks anything on the site.
 *
 *   node tools/attach.js               # every supported site
 *   node tools/attach.js youtube x     # just these
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { version, openTab, reloadExtension } = require("./cdp.js");

const D = require("../core.js");
const shots = path.join(os.tmpdir(), "decaf-live");
const ENDPOINT = process.env.DECAF_CDP || "http://127.0.0.1:9222";

const FEED_URL = {
  youtube: "https://www.youtube.com/",
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/",
  x: "https://x.com/home",
  reddit: "https://www.reddit.com/",
  facebook: "https://www.facebook.com/",
  threads: "https://www.threads.com/",
  bluesky: "https://bsky.app/",
  twitch: "https://www.twitch.tv/",
  pinterest: "https://www.pinterest.com/",
  linkedin: "https://www.linkedin.com/feed/",
  googlenews: "https://news.google.com/"
};

const MEASURE = (selectors) => {
  const seen = (element) => Boolean(element && element.getClientRects().length);
  const notice = document.querySelector(".decaf-notice");
  const items = [...document.querySelectorAll(
    "article,[role='article'],shreddit-post,ytd-rich-item-renderer,[data-testid='cellInnerDiv']," +
    "[data-test-id='pin'],[data-e2e='recommend-list-item-container'],[data-pressable-container]," +
    "[data-id^='urn:li:activity'],.thing"
  )];
  const describe = (element) => element
    ? `${element.localName}${element.id ? `#${element.id}` : ""}${element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`.slice(0, 70)
    : null;

  const result = {
    url: location.href,
    root: [...document.documentElement.classList].filter((name) => name.startsWith("decaf-")),
    matched: selectors.filter((selector) => document.querySelector(selector)),
    notice: Boolean(notice),
    noticeVisible: seen(notice),
    host: describe(document.querySelector(".decaf-feed-host")),
    guessedByShape: describe(document.querySelector(".decaf-feed-container")),
    itemsTotal: items.length,
    itemsVisible: items.filter(seen).length,
    scrolls: getComputedStyle(document.documentElement).overflow,
    dark: notice?.classList.contains("decaf-dark") ?? null
  };

  if (notice) {
    const rect = notice.getBoundingClientRect();
    result.card = {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left)
    };
    result.fitsWindow = rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
    let clipped = false;
    let walk = notice.parentElement;
    while (walk && walk !== document.documentElement && walk !== document.body) {
      const style = getComputedStyle(walk);
      if (style.overflowX === "hidden" || style.overflowY === "hidden") {
        const box = walk.getBoundingClientRect();
        if (rect.top < box.top - 1 || rect.left < box.left - 1 || rect.right > box.right + 1) clipped = true;
      }
      walk = walk.parentElement;
    }
    result.clipped = clipped;
  }
  return result;
};

function verdict(report) {
  const issues = [];
  if (!report.root.includes("decaf-on")) issues.push("Decaf not active (site switched off, or not a feed route)");
  if (report.root.includes("decaf-hide-feed")) {
    if (!report.notice) issues.push("feed paused but no notice");
    else if (!report.noticeVisible) issues.push("notice is not visible");
    if (report.itemsVisible) issues.push(`${report.itemsVisible} of ${report.itemsTotal} feed item(s) still visible`);
    if (report.clipped) issues.push("card is clipped by an ancestor");
    if (report.fitsWindow === false) issues.push("card does not fit the window");
    if (report.card && (report.card.w < 300 || report.card.w > 560)) issues.push(`card width ${report.card.w}px`);
    // Guessing works, but it means a brief flash of feed before the card lands.
    if (report.guessedByShape) warnings.push(`guessed the container: ${report.guessedByShape}`);
  }
  // Sites set their own overflow; only Decaf adding "hidden" would be a problem.
  if (/hidden/.test(report.scrolls)) issues.push(`page cannot scroll (overflow: ${report.scrolls})`);
  return issues;
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const only = process.argv.slice(2);
  const keys = (only.length ? only : Object.keys(FEED_URL)).filter((key) => FEED_URL[key]);

  const info = await version();
  process.stdout.write(`attached to ${info.Browser}\n`);
  if (process.env.DECAF_RELOAD !== "0") {
    try {
      process.stdout.write(`reloaded extension ${await reloadExtension(path.resolve(__dirname, '..'))}\n`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      process.stdout.write(`could not reload the extension: ${error.message}\n`);
    }
  }
  process.stdout.write("\n");

  const tab = await openTab();
  const problems = [];

  for (const key of keys) {
    let report = {};
    let issues = [];
    try {
      await tab.goto(FEED_URL[key]);
      await tab.wait(5000);
      report = await tab.evaluate(MEASURE, D.feedSelectors(key));
      issues = verdict(report);
      await tab.screenshot(path.join(shots, `${key}.png`));
    } catch (error) {
      issues = [error.message.split("\n")[0]];
    }
    if (issues.length) problems.push(key);
    process.stdout.write(`${issues.length ? "FAIL" : "ok  "} ${key.padEnd(11)} ${JSON.stringify(report)}\n`);
    if (issues.length) process.stdout.write(`      → ${issues.join("; ")}\n`);
  }

  await tab.close();
  process.stdout.write(`\n${problems.length ? `problems: ${problems.join(", ")}` : "all sites fine"} · screenshots in ${shots}\n`);
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
