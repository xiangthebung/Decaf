#!/usr/bin/env node
/**
 * Checks the one promise Decaf must never break, on the real signed-in sites:
 * that it does not come between you and a message.
 *
 *   chrome --remote-debugging-port=9222 --user-data-dir=~/.chrome-debug
 *   node tools/live-chat-check.js
 *
 * Start that Chrome yourself and sign in yourself — this tool never sees, asks
 * for or types a credential. It attaches over the DevTools protocol to the
 * browser you already trust.
 *
 * It reads and navigates only. It never clicks, never types, never opens a
 * conversation, and never reads the text of a message: every number it prints is
 * a count of elements or a boolean about layout. What it answers is
 *
 *   - is a messaging surface being treated as a feed, and
 *   - on a page where Decaf *is* pausing a feed, has anything inside a docked
 *     conversation been emptied?
 *
 * The second question is the one that matters, because a docked conversation
 * rides on top of pages Decaf is legitimately acting on. Facebook's Messenger
 * window is a `role="main"` of its own, which is how the page-level selector
 * came to hide every message in it.
 */
"use strict";

const { openTab, reloadExtension, ENDPOINT } = require("./cdp.js");
const D = require("../core.js");

const path = require("node:path");

/**
 * Surfaces that must never be paused. Each is a page you reach by choosing a
 * conversation, not by scrolling — so `route` must not be "feed" and no card may
 * be placed.
 */
const CONVERSATIONS = [
  ["Facebook · Marketplace inbox", "https://www.facebook.com/marketplace/inbox"],
  ["Facebook · Messages", "https://www.facebook.com/messages/t/"],
  ["Instagram · Direct", "https://www.instagram.com/direct/inbox/"],
  ["X · Messages", "https://x.com/messages"],
  ["LinkedIn · Messaging", "https://www.linkedin.com/messaging/"],
  ["Reddit · Chat", "https://www.reddit.com/chat/"],
  ["Twitch · Whispers", "https://www.twitch.tv/directory/following"]
];

/**
 * Pages where Decaf *should* pause a feed. A docked conversation on any of these
 * is the case that broke: the feed goes, the chat must not.
 */
const PAUSED = [
  ["Facebook · News Feed", "https://www.facebook.com/"],
  ["Facebook · Marketplace browse", "https://www.facebook.com/marketplace/"],
  ["LinkedIn · Home feed", "https://www.linkedin.com/feed/"]
];

/* Counts only. No message text is read, returned or printed. */
const PROBE = () => {
  const PROTECTED = [
    "[role='dialog']",
    "[role='alertdialog']",
    "[aria-label*='messenger' i]",
    "[aria-label*='message' i]",
    "[aria-label*='chat' i]",
    "[aria-label*='conversation' i]",
    "#msg-overlay",
    ".msg-overlay-list-bubble"
  ].join(",");

  const rendered = (element) => Boolean(element.getClientRects().length);
  const regions = Array.from(document.querySelectorAll(PROTECTED)).filter(rendered);

  let emptied = 0;
  let inspected = 0;
  for (const region of regions) {
    for (const child of region.querySelectorAll("*")) {
      // An element the page laid out but which now paints nothing is what an
      // emptied container looks like from the outside.
      if (child.children.length) continue;
      inspected += 1;
      if (getComputedStyle(child).display === "none") emptied += 1;
    }
  }

  return {
    classes: Array.from(document.documentElement.classList).filter((name) => name.startsWith("decaf-")),
    card: Boolean(document.querySelector(".decaf-notice")),
    regions: regions.length,
    // A region Decaf marked as a feed is the fault itself, whatever it looks like.
    markedAsFeed: regions.filter((region) =>
      region.matches(".decaf-feed-container,.decaf-feed-host") ||
      region.querySelector(".decaf-feed-container,.decaf-feed-host") ||
      region.closest(".decaf-feed-container,.decaf-feed-host")).length,
    hiddenLeaves: emptied,
    leaves: inspected
  };
};

async function look(url) {
  const tab = await openTab(url);
  try {
    await tab.wait(4500);
    return await tab.evaluate(PROBE);
  } finally {
    await tab.close();
  }
}

async function main() {
  try {
    await reloadExtension(path.join(__dirname, "..", "dist"));
  } catch (_) {
    // Not fatal: it only means the running Chrome keeps the build it already has.
    console.log("note: could not reload the extension — make sure dist/ is the one loaded\n");
  }

  let failures = 0;
  // A check that could not run is not a check that passed. Without this, a
  // browser that was not listening printed "all clear" and exited 0.
  let unreachable = 0;

  console.log("a conversation is never a feed\n");
  for (const [label, url] of CONVERSATIONS) {
    const route = D.getRoute(url);
    let report = null;
    try {
      report = await look(url);
    } catch (error) {
      unreachable += 1;
      console.log(`   ??  ${label.padEnd(30)} could not be opened (${String(error.message).slice(0, 40)})`);
      continue;
    }
    const paused = route === "feed" || report.card || report.classes.includes("decaf-hide-feed");
    if (paused) failures += 1;
    console.log(
      `   ${paused ? "FAIL" : "ok  "} ${label.padEnd(30)} route=${route || "-"} card=${report.card}`
    );
  }

  console.log("\na docked conversation survives a paused feed\n");
  for (const [label, url] of PAUSED) {
    let report = null;
    try {
      report = await look(url);
    } catch (error) {
      unreachable += 1;
      console.log(`   ??  ${label.padEnd(30)} could not be opened (${String(error.message).slice(0, 40)})`);
      continue;
    }
    if (!report.regions) {
      console.log(`   --  ${label.padEnd(30)} no conversation open here — open a chat and run again`);
      continue;
    }
    // Some of a conversation's own furniture is legitimately hidden by the site.
    // A conversation Decaf emptied is not subtle: nearly everything in it goes.
    const share = report.leaves ? report.hiddenLeaves / report.leaves : 0;
    const bad = report.markedAsFeed > 0 || share > 0.5;
    if (bad) failures += 1;
    console.log(
      `   ${bad ? "FAIL" : "ok  "} ${label.padEnd(30)} ` +
      `regions=${report.regions} markedAsFeed=${report.markedAsFeed} ` +
      `hidden=${report.hiddenLeaves}/${report.leaves} card=${report.card}`
    );
  }

  if (failures) console.log(`\n${failures} failing`);
  if (unreachable) {
    console.log(`\n${unreachable} page(s) could not be opened — inconclusive, not a pass.`);
    console.log("Is Chrome running with --remote-debugging-port=9222, and are you signed in?");
  }
  if (!failures && !unreachable) console.log("\nall clear");
  process.exit(failures || unreachable ? 1 : 0);
}

main().catch((error) => {
  console.error(`\ncould not reach Chrome at ${ENDPOINT}`);
  console.error("start it with:  chrome --remote-debugging-port=9222 --user-data-dir=<a scratch profile>");
  console.error(String(error.message || error));
  process.exit(2);
});
