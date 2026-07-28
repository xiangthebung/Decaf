#!/usr/bin/env node
/**
 * Dev-only helper: reports how a live page is actually built, so the feed
 * selectors in core.js can be checked against reality.
 *
 *   node tools/probe.js https://www.reddit.com/
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const playwright = require("playwright");

const root = path.resolve(__dirname, "..");
const D = require("../core.js");

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("usage: node tools/probe.js <url>");
  const site = D.getSite(url);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-probe-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(Number(process.argv[4] || 4000));

  const report = await page.evaluate(({ selectors }) => {
    const describe = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        tag: element.localName,
        id: element.id || "",
        classes: (element.className || "").toString().slice(0, 120),
        size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        children: element.children.length
      };
    };
    const tallest = [...document.querySelectorAll("body *")]
      .filter((element) => element.getClientRects().length && element.children.length > 2)
      .map((element) => ({ element, height: element.scrollHeight }))
      .sort((a, b) => b.height - a.height)
      .slice(0, 8)
      .map(({ element, height }) => ({ ...describe(element), scrollHeight: height }));

    return {
      title: document.title,
      url: location.href,
      rootClasses: [...document.documentElement.classList],
      bodyChildren: [...document.body.children].map(describe),
      selectorHits: selectors.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
        visible: [...document.querySelectorAll(selector)].filter((element) => element.getClientRects().length).length
      })),
      candidates: {
        main: describe(document.querySelector("main")),
        roleMain: describe(document.querySelector("[role='main']")),
        roleFeed: describe(document.querySelector("[role='feed']")),
        shredditFeed: describe(document.querySelector("shreddit-feed")),
        appRoot: describe(document.querySelector("#AppRouter-main-content, #app, #root, #__next"))
      },
      tallest,
      noticePresent: Boolean(document.querySelector(".decaf-notice")),
      noticeParent: describe(document.querySelector(".decaf-notice")?.parentElement),
      noticeVisible: Boolean(document.querySelector(".decaf-notice")?.getClientRects().length)
    };
  }, { selectors: D.feedSelectors(site) });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: false });
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

main();
