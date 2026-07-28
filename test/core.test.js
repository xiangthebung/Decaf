"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const D = require("../core.js");

test("every supported host resolves to its site", () => {
  for (const [key, site] of Object.entries(D.SITES)) {
    for (const host of site.hosts) {
      assert.equal(D.getSite(`https://${host}/`), key, host);
    }
  }
  assert.equal(D.getSite("https://mail.google.com/"), null);
  assert.equal(D.getSite("chrome://extensions"), null);
  assert.equal(D.getSite(""), null);
  assert.equal(D.getSite(undefined), null);
});

test("routes separate endless feeds from things opened on purpose", () => {
  const cases = [
    ["https://www.youtube.com/", "feed"],
    ["https://www.youtube.com/shorts/aBcD1", "feed"],
    ["https://www.youtube.com/feed/trending", "feed"],
    ["https://www.youtube.com/watch?v=aBcD1", "media"],
    ["https://www.youtube.com/live/aBcD1", "media"],
    ["https://www.youtube.com/feed/subscriptions", "content"],
    ["https://www.youtube.com/results?search_query=cats", "content"],
    ["https://www.instagram.com/", "feed"],
    ["https://www.instagram.com/reels/", "feed"],
    ["https://www.instagram.com/explore/", "feed"],
    ["https://www.instagram.com/explore/search/keyword/?q=a", "content"],
    ["https://www.instagram.com/reel/Cx123/", "media"],
    ["https://www.instagram.com/p/Cx123/", "media"],
    ["https://www.instagram.com/direct/inbox/", "content"],
    ["https://www.tiktok.com/", "feed"],
    ["https://www.tiktok.com/foryou", "feed"],
    ["https://www.tiktok.com/following", "content"],
    ["https://www.tiktok.com/@someone/video/7123", "media"],
    ["https://x.com/", "feed"],
    ["https://x.com/home", "feed"],
    ["https://x.com/explore", "feed"],
    ["https://x.com/someone", "content"],
    ["https://x.com/someone/status/123", "media"],
    ["https://x.com/messages", "content"],
    ["https://www.reddit.com/", "feed"],
    ["https://www.reddit.com/r/popular/", "feed"],
    ["https://www.reddit.com/r/webdev/", "content"],
    ["https://www.reddit.com/r/webdev/comments/abc/title/", "media"],
    ["https://www.facebook.com/", "feed"],
    ["https://www.facebook.com/watch", "feed"],
    ["https://www.facebook.com/reel/123", "feed"],
    ["https://www.facebook.com/messages/t/", "content"],
    ["https://www.facebook.com/someone/videos/123", "media"],
    ["https://www.threads.com/", "feed"],
    ["https://www.threads.com/@someone/post/abc", "media"],
    ["https://bsky.app/", "feed"],
    ["https://bsky.app/profile/a.bsky.social/post/xyz", "media"],
    ["https://bsky.app/messages", "content"],
    ["https://www.twitch.tv/", "feed"],
    ["https://www.twitch.tv/directory/game/Chess", "feed"],
    ["https://www.twitch.tv/directory/following", "content"],
    ["https://www.twitch.tv/somestreamer", "media"],
    ["https://www.twitch.tv/videos/98765", "media"],
    ["https://www.twitch.tv/settings", "content"],
    ["https://www.pinterest.com/", "feed"],
    ["https://www.pinterest.com/today/", "feed"],
    ["https://www.pinterest.ca/pin/9911/", "media"],
    ["https://www.linkedin.com/feed/", "feed"],
    ["https://www.linkedin.com/feed/update/urn:li:activity:1/", "media"],
    ["https://www.linkedin.com/posts/someone-abc", "media"],
    ["https://www.linkedin.com/messaging/", "content"],
    ["https://news.google.com/topstories", "feed"],
    ["https://news.google.com/articles/xyz", "media"],
    ["https://news.google.com/search?q=a", "content"],
    ["https://example.com/", ""]
  ];
  for (const [url, expected] of cases) {
    assert.equal(D.getRoute(url), expected, url);
  }
});

test("double slashes and query strings do not confuse routing", () => {
  assert.equal(D.getRoute("https://www.youtube.com//"), "feed");
  assert.equal(D.getRoute("https://www.youtube.com/?gl=CA"), "feed");
  assert.equal(D.getRoute("https://www.youtube.com/watch?v=a&t=10"), "media");
});

test("every site describes what it pauses and where the feed lives", () => {
  for (const [key, site] of Object.entries(D.SITES)) {
    assert.ok(site.label.length, key);
    assert.ok(site.feedSummary.length, key);
    assert.ok(site.hosts.length, key);
    assert.ok(site.feedSelectors.length, `${key} needs at least one feed container`);
    assert.deepEqual(D.feedSelectors(key), site.feedSelectors);
    for (const selector of site.feedSelectors) {
      assert.equal(typeof selector, "string");
      assert.doesNotMatch(selector, /^\s|\s$/, `${key}: "${selector}" has stray whitespace`);
      assert.doesNotMatch(selector, /"/, `${key}: "${selector}" must use single quotes`);
    }
  }
  assert.deepEqual(D.feedSelectors("nonsense"), []);
});

test("the default settings are the opinionated ones", () => {
  const defaults = D.mergeSettings({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.pauseFeeds, true);
  assert.equal(defaults.hideComments, true);
  assert.equal(defaults.upsideDown, false, "extra friction is opt in");
  assert.equal(defaults.hideBadges, false, "badges are muted, not hidden, by default");
  for (const key of D.SITE_KEYS) assert.equal(defaults.sites[key], true, key);
  assert.deepEqual(D.STRENGTH_KEYS, ["pauseFeeds", "hideComments", "upsideDown", "hideBadges"]);
});

test("settings normalize anything found in storage", () => {
  const merged = D.mergeSettings({
    enabled: "false",
    pauseFeeds: 1,
    hideComments: 0,
    upsideDown: "true",
    sites: { youtube: 0, nonsense: true },
    lockUntil: "not a number",
    passes: { youtube: 1 },
    passCounts: { youtube: 3 },
    passDay: "1999-01-01",
    strayKey: "ignored"
  });
  assert.equal(merged.enabled, false);
  assert.equal(merged.pauseFeeds, true);
  assert.equal(merged.hideComments, false);
  assert.equal(merged.upsideDown, true);
  assert.equal(merged.hideBadges, false);
  assert.equal(merged.sites.youtube, false);
  assert.equal(merged.sites.reddit, true);
  assert.equal(Object.hasOwn(merged.sites, "nonsense"), false);
  assert.equal(Object.hasOwn(merged, "strayKey"), false);
  assert.equal(merged.lockUntil, 0);
  assert.deepEqual(merged.passes, {}, "expired passes are dropped");
  assert.deepEqual(merged.passCounts, {}, "yesterday's counts are dropped");
  assert.equal(merged.passDay, "");
  assert.deepEqual(Object.keys(D.mergeSettings({})).sort(), Object.keys(D.DEFAULT_SETTINGS).sort());
});

test("a running lock always implies Decaf is on", () => {
  const merged = D.mergeSettings({ enabled: false, lockUntil: Date.now() + 60000 });
  assert.equal(merged.enabled, true);
});

test("storage patches only carry what changed", () => {
  const now = Date.now();
  const before = D.mergeSettings({}, now);
  const after = D.mergeSettings({ ...before, pauseFeeds: false }, now);
  assert.deepEqual(D.createStoragePatch(before, after, now), { pauseFeeds: false });
  assert.deepEqual(D.createStoragePatch(before, before, now), {});
});

test("passes are per site, five minutes long, and counted for the day", () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const start = D.mergeSettings({}, now);
  const first = D.grantPass(start, "youtube", now);
  assert.equal(first.passes.youtube, now + D.PASS_MS);
  assert.equal(D.passCount(first, "youtube", now), 1);
  assert.equal(D.passCount(first, "reddit", now), 0);
  assert.equal(D.isPassActive(first, "youtube", now), true);
  assert.equal(D.isPassActive(first, "youtube", now + D.PASS_MS + 1), false);

  const second = D.grantPass(first, "youtube", now + 60000);
  assert.equal(D.passCount(second, "youtube", now + 60000), 2);
  const other = D.grantPass(second, "reddit", now + 60000);
  assert.equal(D.passCount(other, "reddit", now + 60000), 1);
  assert.equal(D.passCount(other, "youtube", now + 60000), 2);

  const ended = D.endPass(other, "youtube", now + 60000);
  assert.equal(D.isPassActive(ended, "youtube", now + 60000), false);
  assert.equal(D.isPassActive(ended, "reddit", now + 60000), true);
  assert.equal(D.passCount(ended, "youtube", now + 60000), 2, "ending a pass does not erase the count");
});

test("an unknown site cannot be granted a pass", () => {
  const settings = D.grantPass(D.mergeSettings({}), "nonsense");
  assert.deepEqual(settings.passes, {});
});

test("each extra pass takes longer to earn", () => {
  assert.deepEqual([0, 1, 2, 3, 9].map((count) => D.holdSeconds(count)), [3, 7, 11, 15, 15]);
  assert.equal(D.holdSeconds(0, true), 7);
  assert.equal(D.holdMs(0) < D.holdMs(1), true);
  assert.equal(D.holdMs(9, true), D.HOLD_MAX_MS + 4000);
  // Every possible hold has a matching animation class in content.css.
  const seconds = new Set();
  for (const count of [0, 1, 2, 3, 4]) {
    for (const locked of [false, true]) seconds.add(D.holdSeconds(count, locked));
  }
  assert.deepEqual([...seconds].sort((a, b) => a - b), [3, 7, 11, 15, 19]);
});

test("feeds are paused only when they should be", () => {
  const now = Date.now();
  const base = D.mergeSettings({}, now);
  assert.equal(D.shouldPauseFeed(base, "youtube", "feed", now), true);
  assert.equal(D.shouldPauseFeed(base, "youtube", "media", now), false);
  assert.equal(D.shouldPauseFeed(base, "youtube", "content", now), false);
  assert.equal(D.shouldPauseFeed({ ...base, pauseFeeds: false }, "youtube", "feed", now), false);
  assert.equal(D.shouldPauseFeed({ ...base, enabled: false }, "youtube", "feed", now), false);
  assert.equal(D.shouldPauseFeed({ ...base, sites: { ...base.sites, youtube: false } }, "youtube", "feed", now), false);

  const withPass = D.grantPass(base, "youtube", now);
  assert.equal(D.shouldPauseFeed(withPass, "youtube", "feed", now), false);
  assert.equal(D.shouldPauseFeed(withPass, "reddit", "feed", now), true, "a pass covers one site only");
  assert.equal(D.shouldPauseFeed(withPass, "youtube", "feed", now + D.PASS_MS + 1), true);
});

test("weakening is recognized in every form a lock protects", () => {
  const now = Date.now();
  const locked = D.mergeSettings({ lockUntil: now + 3600000, upsideDown: true, hideBadges: true }, now);
  assert.equal(D.isWeakening(locked, { ...locked, enabled: false }, now), true);
  for (const key of D.STRENGTH_KEYS) {
    assert.equal(D.isWeakening(locked, { ...locked, [key]: false }, now), true, key);
  }
  assert.equal(D.isWeakening(locked, { ...locked, sites: { ...locked.sites, youtube: false } }, now), true);
  assert.equal(D.isWeakening(locked, { ...locked, lockUntil: now + 60000 }, now), true);
  assert.equal(D.isWeakening(locked, { ...locked, lockUntil: now + 7200000 }, now), false);
  const partly = D.mergeSettings({ sites: { youtube: false } }, now);
  assert.equal(D.isWeakening(partly, { ...partly, sites: { ...partly.sites, youtube: true } }, now), false);
  assert.equal(D.isWeakening(partly, { ...partly, upsideDown: true }, now), false, "adding friction is not weakening");
  assert.equal(D.isWeakening(partly, partly, now), false);
});

test("a lock repairs settings that were weakened behind its back", () => {
  const now = Date.now();
  const baseline = D.mergeSettings({ lockUntil: now + 3600000, upsideDown: true, hideBadges: true }, now);
  const tampered = D.mergeSettings({
    ...baseline,
    enabled: false,
    pauseFeeds: false,
    hideComments: false,
    upsideDown: false,
    hideBadges: false,
    sites: Object.fromEntries(D.SITE_KEYS.map((key) => [key, false])),
    lockUntil: now + 1000
  }, now);
  const repaired = D.repairLocked(baseline, tampered, now);
  assert.equal(repaired.enabled, true);
  for (const key of D.STRENGTH_KEYS) assert.equal(repaired[key], true, key);
  assert.equal(repaired.lockUntil, baseline.lockUntil);
  for (const key of D.SITE_KEYS) assert.equal(repaired.sites[key], true, key);
});

test("an expired baseline stops repairing", () => {
  const now = Date.now();
  const baseline = D.mergeSettings({ lockUntil: now - 1000 }, now);
  const current = D.mergeSettings({ enabled: false }, now);
  assert.equal(D.repairLocked(baseline, current, now).enabled, false);
});

test("a lock only raises the floor, never lowers a stronger setting", () => {
  const now = Date.now();
  const baseline = D.mergeSettings({ lockUntil: now + 3600000, sites: { youtube: false } }, now);
  const stronger = D.mergeSettings({ ...baseline, sites: { ...baseline.sites, youtube: true }, upsideDown: true }, now);
  const repaired = D.repairLocked(baseline, stronger, now);
  assert.equal(repaired.sites.youtube, true);
  assert.equal(repaired.upsideDown, true);
});

test("durations and counters read like a person wrote them", () => {
  assert.equal(D.formatDuration(0), "1 min");
  assert.equal(D.formatDuration(59_000), "1 min");
  assert.equal(D.formatDuration(20 * 60_000), "20 min");
  assert.equal(D.formatDuration(90 * 60_000), "1 hr 30 min");
  assert.equal(D.formatDuration(2 * 3_600_000), "2 hr");
  assert.equal(D.formatDuration(24 * 3_600_000), "1 day");
  assert.equal(D.formatDuration(7 * 24 * 3_600_000), "7 days");
  assert.equal(D.formatClock(0), "0:00");
  assert.equal(D.formatClock(65_000), "1:05");
  assert.equal(D.formatClock(5 * 60_000), "5:00");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(D.ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
  assert.equal(D.dayKey(new Date(2026, 0, 5)), "2026-01-05");
});
