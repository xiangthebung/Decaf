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
    // A watch page is its `v`. Bare /watch is YouTube's own error page.
    ["https://www.youtube.com/watch", "content"],
    ["https://www.youtube.com/live/aBcD1", "media"],
    ["https://www.youtube.com/feed/subscriptions", "content"],
    ["https://www.youtube.com/results?search_query=cats", "content"],
    ["https://www.instagram.com/", "feed"],
    ["https://www.instagram.com/reels/", "feed"],
    ["https://www.instagram.com/explore/", "feed"],
    ["https://www.instagram.com/explore/search/keyword/?q=a", "content"],
    // A hashtag and a location are things a person asked for by name.
    ["https://www.instagram.com/explore/tags/cats/", "content"],
    ["https://www.instagram.com/explore/locations/213/new-york/", "content"],
    ["https://www.instagram.com/explore/people/", "feed"],
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
    // A list you curated is still a timeline that does not end.
    ["https://x.com/i/lists/12345", "feed"],
    ["https://x.com/i/communities/999", "feed"],
    ["https://www.reddit.com/", "feed"],
    ["https://www.reddit.com/r/popular/", "feed"],
    // A subreddit front page is /r/all with a narrower source. The thread under a
    // post is not, and `isMedia` still wins there.
    ["https://www.reddit.com/r/webdev/", "feed"],
    ["https://www.reddit.com/r/webdev/top/", "feed"],
    ["https://www.reddit.com/user/someone/", "feed"],
    ["https://www.reddit.com/user/someone/m/mymulti/", "feed"],
    ["https://www.reddit.com/r/webdev/comments/abc/title/", "media"],
    ["https://www.reddit.com/settings/", "content"],
    ["https://www.facebook.com/", "feed"],
    ["https://www.facebook.com/watch", "feed"],
    // The permalink every shared Facebook video lands on.
    ["https://www.facebook.com/watch/?v=123456", "media"],
    ["https://www.facebook.com/watch?v=123456", "media"],
    ["https://www.facebook.com/reels/", "feed"],
    // One reel someone sent you, matching how Instagram's /reel/<id> is read.
    ["https://www.facebook.com/reel/123", "media"],
    ["https://www.facebook.com/marketplace/", "feed"],
    ["https://www.facebook.com/groups/feed/", "feed"],
    ["https://www.facebook.com/messages/t/", "content"],
    ["https://www.facebook.com/someone/videos/123", "media"],
    ["https://www.threads.com/", "feed"],
    ["https://www.threads.com/@someone/post/abc", "media"],
    ["https://bsky.app/", "feed"],
    // Custom feeds are where Bluesky's algorithm actually lives.
    ["https://bsky.app/profile/a.bsky.social/feed/whats-hot", "feed"],
    ["https://bsky.app/profile/a.bsky.social/post/xyz", "media"],
    ["https://bsky.app/profile/a.bsky.social", "content"],
    ["https://bsky.app/messages", "content"],
    ["https://www.twitch.tv/", "feed"],
    ["https://www.twitch.tv/directory/game/Chess", "feed"],
    ["https://www.twitch.tv/directory/following", "content"],
    ["https://www.twitch.tv/somestreamer", "media"],
    ["https://www.twitch.tv/videos/98765", "media"],
    ["https://www.twitch.tv/settings", "content"],
    // Application paths, not channels. Missing names here read as media.
    ["https://www.twitch.tv/login", "content"],
    ["https://www.twitch.tv/dashboard", "content"],
    ["https://www.twitch.tv/signup", "content"],
    ["https://www.pinterest.com/", "feed"],
    ["https://www.pinterest.com/today/", "feed"],
    ["https://www.pinterest.ca/pin/9911/", "media"],
    ["https://www.linkedin.com/feed/", "feed"],
    ["https://www.linkedin.com/feed/update/urn:li:activity:1/", "media"],
    ["https://www.linkedin.com/posts/someone-abc", "media"],
    ["https://www.linkedin.com/messaging/", "content"],
    ["https://www.linkedin.com/games/", "game"],
    ["https://www.linkedin.com/games/queens/", "game"],
    ["https://www.linkedin.com/games/queens/results/", "game"],
    // The page the launch page frames, which is also reachable on its own.
    ["https://www.linkedin.com/games/view/queens/desktop/", "game"],
    ["https://news.google.com/topstories", "feed"],
    // Every topic chip in Google News' own navigation points here.
    ["https://news.google.com/topics/CAAqBwgKMKTsCgw", "feed"],
    ["https://news.google.com/stories/CAAqNggK", "feed"],
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

/**
 * A page key answers "is this still the same page?", which is not the same
 * question as "is this the same URL?". Sites rewrite their own URL while a person
 * sits still on one page, and anything granted for that page has to survive it.
 */
test("a site rewriting its own URL is still the same page", () => {
  const same = (a, b) => assert.equal(D.getPageKey(a), D.getPageKey(b), `${a} vs ${b}`);
  const differs = (a, b) => assert.notEqual(D.getPageKey(a), D.getPageKey(b), `${a} vs ${b}`);

  const watch = "https://www.youtube.com/watch?v=aBcD1";
  // YouTube drops the share token a second after a shared link opens, writes the
  // playhead into `t`, and adds a playlist without changing what is playing.
  same(watch, "https://www.youtube.com/watch?v=aBcD1&si=share-token");
  same(watch, "https://www.youtube.com/watch?v=aBcD1&t=42s");
  same(watch, "https://www.youtube.com/watch?v=aBcD1&list=PL1&index=3");
  same(watch, "https://www.youtube.com/watch/?v=aBcD1");
  same(watch, "https://www.youtube.com/watch?v=aBcD1#comments");
  // The video itself is the one query param that says which page this is.
  differs(watch, "https://www.youtube.com/watch?v=other");

  // Instagram counts carousel slides in the query.
  same("https://www.instagram.com/p/Abc123/", "https://www.instagram.com/p/Abc123/?img_index=3");
  differs("https://www.instagram.com/p/Abc123/", "https://www.instagram.com/p/Xyz789/");

  // Facebook serves every video from one path, so its ids count too.
  differs("https://www.facebook.com/watch/?v=1", "https://www.facebook.com/watch/?v=2");
  same("https://www.facebook.com/watch/?v=1", "https://www.facebook.com/watch/?v=1&ref=sharing");

  // Tracking params a share link carries are never part of the answer.
  same(
    "https://www.reddit.com/r/x/comments/abc/title/",
    "https://www.reddit.com/r/x/comments/abc/title/?utm_source=share&utm_medium=web"
  );

  differs("https://www.youtube.com/", watch);
  assert.equal(D.getPageKey("https://example.com/"), "", "an unsupported page has no key");
  assert.equal(D.getPageKey("not a url"), "");
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
    passHistory: { "1999-01-01": { youtube: 3 }, "not-a-day": { reddit: 1 } },
    snoozes: { youtube: 1 },
    custom: { "NOT A HOST": {}, "youtube.com": {}, "news.ycombinator.com": { label: "  HN  " } },
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
  assert.deepEqual(merged.snoozes, {}, "expired snoozes are dropped");
  assert.deepEqual(merged.passHistory, {}, "stale and malformed days are dropped");
  assert.deepEqual(
    Object.keys(merged.custom),
    ["news.ycombinator.com"],
    "a bad host, and one Decaf already covers, are both refused"
  );
  assert.equal(merged.custom["news.ycombinator.com"].label, "HN");
  assert.deepEqual(Object.keys(D.mergeSettings({})).sort(), Object.keys(D.DEFAULT_SETTINGS).sort());
});

/**
 * Storage written before pass history existed kept one day of counts in two flat
 * keys. Someone updating mid-day should not have their hold escalation handed
 * back to three seconds.
 */
test("a day of counts written by an older version is carried forward", () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const today = D.dayKey(new Date(now));
  const merged = D.mergeSettings({ passDay: today, passCounts: { youtube: 2 } }, now);
  assert.equal(D.passCount(merged, "youtube", now), 2);
  assert.equal(D.holdSeconds(D.passCount(merged, "youtube", now)), 11);
  // Yesterday's still goes.
  const stale = D.mergeSettings({ passDay: "1999-01-01", passCounts: { youtube: 2 } }, now);
  assert.equal(D.passCount(stale, "youtube", now), 0);
});

test("pass history keeps a fortnight and no more", () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const day = (offset) => D.dayKey(new Date(now - offset * 86400000));
  const raw = { passHistory: {} };
  for (let offset = 0; offset < 30; offset += 1) raw.passHistory[day(offset)] = { youtube: 1 };
  const merged = D.mergeSettings(raw, now);
  assert.equal(Object.keys(merged.passHistory).length, D.PASS_HISTORY_DAYS);
  assert.equal(Object.hasOwn(merged.passHistory, day(0)), true);
  assert.equal(Object.hasOwn(merged.passHistory, day(D.PASS_HISTORY_DAYS)), false);

  const totals = D.passTotals(merged, now);
  assert.equal(totals.today, 1);
  assert.equal(totals.week, 7, "a week is today plus the six before it");
  assert.equal(totals.busiest, "youtube");
});

test("a snooze sets a site aside and gives it back on its own", () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const base = D.mergeSettings({}, now);
  assert.equal(D.isActiveForSite(base, "youtube", now), true);

  const snoozed = D.snoozeSite(base, "youtube", 30, now);
  assert.equal(D.isActiveForSite(snoozed, "youtube", now), false);
  assert.equal(D.isActiveForSite(snoozed, "reddit", now), true, "one site only");
  assert.equal(D.shouldPauseFeed(snoozed, "youtube", "feed", now), false);
  assert.equal(D.snoozeUntil(snoozed, "youtube", now), now + 30 * 60000);

  // It ends by itself, with nothing having to run.
  assert.equal(D.isActiveForSite(snoozed, "youtube", now + 31 * 60000), true);
  assert.equal(D.isSnoozed(snoozed, "youtube", now + 31 * 60000), false);

  const woken = D.wakeSite(snoozed, "youtube", now);
  assert.equal(D.isActiveForSite(woken, "youtube", now), true);

  // Nothing may hold a site aside for a day; that is a decision, not a pause.
  const overlong = D.mergeSettings({ snoozes: { youtube: now + 86400000 * 5 } }, now);
  assert.equal(D.snoozeUntil(overlong, "youtube", now) <= now + 8 * 3600000, true);
});

test("a site the person added gets the general treatment", () => {
  const now = Date.UTC(2026, 6, 28, 12, 0, 0);
  const added = D.addCustomSite(D.mergeSettings({}, now), "news.ycombinator.com", "", now);
  const key = D.customKey("news.ycombinator.com");
  assert.equal(D.getSite("https://news.ycombinator.com/", added), key);
  assert.equal(D.getSite("https://www.news.ycombinator.com/", added), key, "www finds the bare entry");
  assert.equal(D.getSite("https://news.ycombinator.com/", null), null, "custom sites need settings to be found");
  assert.equal(D.isCustomKey(key), true);
  assert.equal(D.customHost(key), "news.ycombinator.com");
  assert.equal(D.siteLabel(key, added), "news.ycombinator.com");
  // The front page is the feed; anything navigated to is not. There is no table
  // for these, so nothing stronger can be claimed.
  assert.equal(D.getRoute("https://news.ycombinator.com/", added), "feed");
  assert.equal(D.getRoute("https://news.ycombinator.com/item?id=1", added), "content");
  assert.deepEqual(D.feedSelectors(key), [], "no selectors: the shape finder is the whole of it");
  assert.equal(D.isActiveForSite(added, key, now), true);
  assert.equal(D.siteKeys(added).includes(key), true);

  const granted = D.grantPass(added, key, now);
  assert.equal(D.passCount(granted, key, now), 1, "a custom site earns passes like any other");

  const removed = D.removeCustomSite(added, "news.ycombinator.com", now);
  assert.equal(D.getSite("https://news.ycombinator.com/", removed), null);

  // A site Decaf already covers cannot be shadowed by a custom entry.
  const shadow = D.addCustomSite(D.mergeSettings({}, now), "youtube.com", "", now);
  assert.deepEqual(shadow.custom, {});
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
