const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const context = {};
context.globalThis = context;
context.URL = URL;
vm.runInNewContext(fs.readFileSync(new URL("../shared.js", `file://${__dirname}/`).pathname, "utf8"), context);
const U = context.UnaddictifySettings;

test("defaults are settings-first and conservative about playback", () => {
  const settings = U.mergeSettings();
  assert.equal(Object.hasOwn(settings, "mode"), false);
  assert.equal(settings.features.monochrome, 75);
  assert.equal(settings.features.upsideDownMedia, false);
  assert.equal(settings.features.hideNotificationBadges, true);
  assert.equal(settings.features.hideEngagementCounts, true);
  assert.equal(settings.features.stripMedia, false);
  assert.equal(settings.features.hideProfileMedia, false);
  assert.equal(Object.hasOwn(settings.features, "stopAutoplay"), false);
  assert.equal(settings.bypassCooldownHours, 2);
  assert.equal(settings.bypassDurationMinutes, 10);
  assert.equal(U.DEFAULT_LOCK_DURATION_HOURS, 24);
  assert.equal(settings.siteSettings.instagram.hideReels, true);
  assert.equal(settings.siteSettings.instagram.hideComments, true);
  assert.equal(settings.siteSettings.youtube.hideShortsTab, true);
  assert.equal(settings.siteSettings.youtube.hideComments, true);
  assert.equal(settings.siteSettings.youtube.requireVideoApproval, true);
  assert.equal(settings.siteSettings.youtube.sabotageOpenedVideos, false);
  assert.equal(settings.siteSettings.tiktok.hideLiveTab, true);
  assert.equal(settings.siteSettings.tiktok.hideComments, true);
  assert.equal(settings.siteSettings.twitch.hideDiscovery, true);
  assert.equal(settings.siteSettings.twitch.hideChat, true);
  assert.equal(settings.siteSettings.google.hideDoodles, true);
  assert.equal(settings.siteSettings.pinterest.hideSaveCounts, true);
  assert.equal(Object.keys(settings.siteSettings.linkedin).length, 0);
  assert.equal(settings.sites.google, false);
  assert.equal(settings.sites.linkedin, false);
  assert.equal(settings.sites.whatsapp, false);
});

test("legacy settings migrate without bringing old prototype fields forward", () => {
  const settings = U.mergeSettings({
    mode: "essential",
    mediaGrayscale: false,
    randomColors: true,
    features: { hideEngagement: true },
    siteSettings: { youtube: { preserveEducational: true } }
  });
  assert.equal(settings.features.monochrome, 0);
  assert.equal(settings.features.stripMedia, true);
  assert.equal(settings.features.hideNotificationBadges, true);
  assert.equal(settings.features.hideEngagementCounts, true);
  assert.equal(Object.hasOwn(settings, "mode"), false);
  assert.equal(Object.hasOwn(settings, "randomColors"), false);
  assert.equal(Object.hasOwn(settings.siteSettings.youtube, "preserveEducational"), false);
});

test("legacy YouTube playback wording migrates to friction-first wording", () => {
  const normal = U.mergeSettings({ siteSettings: { youtube: { keepPlayerNormal: true } } });
  const sabotaged = U.mergeSettings({ siteSettings: { youtube: { keepPlayerNormal: false } } });
  assert.equal(normal.siteSettings.youtube.sabotageOpenedVideos, false);
  assert.equal(sabotaged.siteSettings.youtube.sabotageOpenedVideos, true);
  assert.equal(Object.hasOwn(normal.siteSettings.youtube, "keepPlayerNormal"), false);
});

test("legacy LinkedIn discovery toggles are discarded in favor of global controls", () => {
  const settings = U.mergeSettings({
    siteSettings: {
      linkedin: {
        hideSuggestedPosts: false,
        hidePeopleSuggestions: false,
        hideCelebrations: false
      }
    }
  });
  assert.equal(Object.keys(settings.siteSettings.linkedin).length, 0);
});

test("lock blocks weaker visual and site-specific settings", () => {
  const locked = U.mergeSettings({
    lockUntil: Date.now() + 60_000,
    features: { monochrome: 100, upsideDownMedia: true },
    siteSettings: { instagram: { hideReels: true } }
  });
  assert.equal(U.isWeakeningChange(locked, { ...locked, enabled: false }), true);
  assert.equal(U.isWeakeningChange(locked, { ...locked, features: { ...locked.features, monochrome: 50 } }), true);
  assert.equal(U.isWeakeningChange(locked, {
    ...locked,
    siteSettings: { ...locked.siteSettings, instagram: { ...locked.siteSettings.instagram, hideReels: false } }
  }), true);
  assert.equal(U.isWeakeningChange(locked, { ...locked, bypassCooldownHours: 1 }), true);
  assert.equal(U.isWeakeningChange(locked, { ...locked, features: { ...locked.features, monochrome: 100, stripMedia: true } }), false);
  assert.equal(U.isWeakeningChange(locked, {
    ...locked,
    siteSettings: {
      ...locked.siteSettings,
      youtube: { ...locked.siteSettings.youtube, requireVideoApproval: false }
    }
  }), true);
});

test("lock treats opened-video friction like every other boolean", () => {
  const now = Date.now();
  const normalPlayer = U.mergeSettings({
    lockUntil: now + 60_000,
    siteSettings: { youtube: { sabotageOpenedVideos: false } }
  });
  const sabotagedPlayer = U.mergeSettings({
    ...normalPlayer,
    siteSettings: {
      ...normalPlayer.siteSettings,
      youtube: { ...normalPlayer.siteSettings.youtube, sabotageOpenedVideos: true }
    }
  });
  assert.equal(U.isWeakeningChange(normalPlayer, sabotagedPlayer), false);
  assert.equal(U.isWeakeningChange(sabotagedPlayer, normalPlayer), true);
});

test("site activity respects the global temporary break", () => {
  const settings = U.mergeSettings({ bypassUntil: Date.now() + 60_000, bypassLastGrantedAt: Date.now() });
  assert.equal(U.isActiveForSite(settings, "reddit"), false);
  assert.equal(U.isActiveForSite(settings, "youtube"), false);
});

test("break cooldown is configurable and enforced", () => {
  const lastGrantedAt = Date.now() - 90 * 60 * 1000;
  const settings = U.mergeSettings({ bypassCooldownHours: 2, bypassLastGrantedAt: lastGrantedAt });
  assert.equal(U.isBypassAvailable(settings), false);
  assert.equal(U.getBypassAvailableAt(settings), lastGrantedAt + 2 * 60 * 60 * 1000);
  assert.equal(U.isBypassAvailable(U.mergeSettings({ bypassCooldownHours: 1, bypassLastGrantedAt: lastGrantedAt })), true);
});

test("percent values are clamped and unknown feature flags are dropped", () => {
  const settings = U.mergeSettings({ features: { monochrome: 240, oldFlag: true }, unknownTopLevel: true, sites: { unknownSite: true } });
  assert.equal(Object.hasOwn(settings.features, "oldFlag"), false);
  assert.equal(Object.hasOwn(settings, "unknownTopLevel"), false);
  assert.equal(Object.hasOwn(settings.sites, "unknownSite"), false);
});

test("settings patches preserve unrelated current state", () => {
  const previous = U.mergeSettings({
    sites: { reddit: true, youtube: true },
    features: { monochrome: 75, stripMedia: false }
  });
  const next = U.mergeSettings({
    ...previous,
    features: { ...previous.features, monochrome: 50 },
    sites: { ...previous.sites, reddit: false }
  });
  const patch = U.createSettingsPatch(previous, next);
  assert.equal(patch.sites.reddit, false);
  assert.equal(Object.keys(patch.sites).length, 1);
  assert.equal(patch.features.monochrome, 50);
  assert.equal(Object.keys(patch.features).length, 1);
  const current = U.mergeSettings({ sites: { youtube: false }, features: { stripMedia: true } });
  const applied = U.applySettingsPatch(current, patch);
  assert.equal(applied.sites.reddit, false);
  assert.equal(applied.sites.youtube, false);
  assert.equal(applied.features.monochrome, 50);
  assert.equal(applied.features.stripMedia, true);
  const storagePatch = U.createStoragePatch(previous, next);
  assert.equal(storagePatch.features.stripMedia, false);
  assert.equal(storagePatch.sites.youtube, true);
});

test("active Focus Lock normalizes the extension back on", () => {
  const settings = U.mergeSettings({ enabled: false, lockUntil: Date.now() + 60_000 });
  assert.equal(settings.enabled, true);
});
test("new site coverage resolves only the intended surfaces", () => {
  const urls = {
    "https://www.tiktok.com/foryou": "tiktok",
    "https://www.twitch.tv/directory": "twitch",
    "https://x.com/home": "x",
    "https://www.facebook.com/": "facebook",
    "https://www.google.ca/search?q=focus": "google",
    "https://news.google.com/": "google",
    "https://www.pinterest.com/": "pinterest",
    "https://www.linkedin.com/feed/": "linkedin",
    "https://www.threads.net/": "threads",
    "https://www.threads.com/": "threads",
    "https://web.snapchat.com/": "snapchat",
    "https://web.whatsapp.com/": "whatsapp",
    "https://www.messenger.com/": "messenger"
  };
  for (const [url, site] of Object.entries(urls)) assert.equal(U.getSiteFromUrl(url), site, url);
  assert.equal(U.getSiteFromUrl("https://docs.google.com/document/u/0/"), null);
  assert.equal(U.getSiteFromUrl("https://www.linkedin.com/in/example/"), "linkedin");
  assert.equal(U.getSiteFromUrl("https://www.linkedin.com/company/example/"), "linkedin");
});

test("site matching does not accept look-alike domains", () => {
  const lookAlikes = [
    "https://notinstagram.com/",
    "https://notdiscord.com/",
    "https://notreddit.com/",
    "https://notyoutube.com/",
    "https://nottiktok.com/",
    "https://nottwitch.tv/",
    "https://notx.com/",
    "https://notfacebook.com/",
    "https://notpinterest.com/",
    "https://notthreads.net/",
    "https://notthreads.com/",
    "https://notsnapchat.com/",
    "https://notmessenger.com/",
    "https://studio.youtube.com/",
    "https://business.facebook.com/",
    "https://player.twitch.tv/",
    "https://docs.google.com/document/u/0/"
  ];
  for (const url of lookAlikes) assert.equal(U.getSiteFromUrl(url), null, url);
  assert.equal(U.getSiteFromUrl("https://sub.instagram.com/"), null);
  assert.equal(U.getSiteFromUrl("https://sub.youtube.com/"), null);
});

test("YouTube video IDs resolve only from supported watch surfaces", () => {
  assert.equal(U.getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(U.getYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(U.getYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(U.getYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "");
  assert.equal(U.getYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), "");
  assert.equal(U.getYouTubeVideoId("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), "");
});

test("YouTube approvals are scoped to one active Focus Lock", () => {
  const now = Date.now();
  const firstLock = U.mergeSettings({ lockUntil: now + 60_000 });
  const approvals = U.addYouTubeFocusApproval({}, firstLock.lockUntil, "dQw4w9WgXcQ");
  assert.equal(U.isYouTubeVideoApproved(firstLock, approvals, "dQw4w9WgXcQ", now), true);
  assert.equal(U.isYouTubeVideoApproved(firstLock, approvals, "otherVid123", now), false);
  assert.equal(U.isYouTubeVideoApproved(firstLock, approvals, "dQw4w9WgXcQ", now + 60_001), false);

  const nextLock = U.mergeSettings({ lockUntil: now + 120_000 });
  assert.equal(U.isYouTubeVideoApproved(nextLock, approvals, "dQw4w9WgXcQ", now), false);
});

test("YouTube approval storage removes invalid and duplicate video IDs", () => {
  const normalized = U.normalizeYouTubeFocusApprovals({
    lockUntil: "1234",
    videoIds: ["dQw4w9WgXcQ", "bad id", "dQw4w9WgXcQ", "another_123"]
  });
  assert.equal(normalized.lockUntil, 1234);
  assert.deepEqual([...normalized.videoIds], ["dQw4w9WgXcQ", "another_123"]);
});

test("YouTube approvals retain normal and friction playback modes", () => {
  const now = Date.now();
  const settings = U.mergeSettings({ lockUntil: now + 60_000 });
  const normal = U.addYouTubeFocusApproval({}, settings.lockUntil, "dQw4w9WgXcQ", "normal");
  const mixed = U.addYouTubeFocusApproval(normal, settings.lockUntil, "another_123", "friction");

  assert.equal(U.getYouTubeFocusApprovalMode(mixed, "dQw4w9WgXcQ"), "normal");
  assert.equal(U.getYouTubeFocusApprovalMode(mixed, "another_123"), "friction");
  assert.equal(U.isYouTubeVideoApproved(settings, mixed, "another_123", now), true);
  assert.deepEqual([...mixed.normalVideoIds], ["dQw4w9WgXcQ"]);
  assert.deepEqual([...mixed.frictionVideoIds], ["another_123"]);

  const legacy = U.normalizeYouTubeFocusApprovals({ lockUntil: settings.lockUntil, videoIds: ["dQw4w9WgXcQ"] });
  assert.equal(U.getYouTubeFocusApprovalMode(legacy, "dQw4w9WgXcQ"), "normal");
});

test("lock repair restores only weaker fields and preserves strengthening changes", () => {
  const now = Date.now();
  const baseline = U.mergeSettings({
    lockUntil: now + 60_000,
    sites: { reddit: true },
    features: { monochrome: 75, stripMedia: false },
    siteSettings: { instagram: { hideReels: true } }
  });
  const current = U.mergeSettings({
    ...baseline,
    enabled: false,
    lockUntil: 0,
    bypassUntil: now + 5_000,
    sites: { ...baseline.sites, reddit: false },
    features: { ...baseline.features, monochrome: 100, stripMedia: true },
    siteSettings: {
      ...baseline.siteSettings,
      instagram: { ...baseline.siteSettings.instagram, hideReels: false }
    }
  });
  const repaired = U.repairLockedSettings(baseline, current);

  assert.equal(repaired.enabled, true);
  assert.equal(repaired.lockUntil, baseline.lockUntil);
  assert.equal(repaired.sites.reddit, true);
  assert.equal(repaired.features.monochrome, 100);
  assert.equal(repaired.features.stripMedia, true);
  assert.equal(repaired.siteSettings.instagram.hideReels, true);
  assert.equal(repaired.bypassUntil, current.bypassUntil);
});
