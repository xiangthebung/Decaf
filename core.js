/**
 * Decaf — shared model.
 *
 * Everything in this file is pure data and pure functions: the site table, the
 * settings shape, and the rules for passes and Lock. The content script, popup,
 * options page, and service worker all read from here so there is exactly one
 * definition of "what Decaf does" in the extension.
 */
(() => {
  "use strict";

  const PASS_MINUTES = 5;
  const PASS_MS = PASS_MINUTES * 60 * 1000;
  const HOLD_BASE_MS = 3000;
  const HOLD_STEP_MS = 4000;
  const HOLD_MAX_MS = 15000;
  const HOLD_LOCK_BONUS_MS = 4000;
  const LOCK_DURATIONS = [
    { hours: 24, label: "1 day" },
    { hours: 168, label: "1 week" },
    { hours: 720, label: "30 days" }
  ];
  const DEFAULT_LOCK_HOURS = 24;

  const TWITCH_APP_PATHS = new Set([
    "directory", "videos", "settings", "subscriptions", "wallet", "drops", "friends",
    "inventory", "downloads", "prime", "turbo", "jobs", "search", "following",
    "popout", "moderator", "u", "p", "team", "products", "store", "broadcast"
  ]);

  /**
   * Four kinds of route:
   *   feed     an endless, algorithmically supplied surface
   *   media    one thing the person opened on purpose
   *   game     a puzzle: bounded, and it ends on its own
   *   content  everything else — search, messages, profiles, settings
   *
   * `media` wins over `feed` so a permalink is never mistaken for a feed, and
   * `game` is settled before `feed` for the same reason. A game is the one
   * surface Decaf leaves in colour — see the note in content.css.
   *
   * `feedSelectors` are the containers that hold the feed, narrowest first.
   * While a feed is paused content.css empties every one of them — it hides their
   * children rather than the containers themselves — so the container keeps its
   * place in the site's own grid or flex layout and nothing else on the page
   * moves. The content script puts its notice inside the outermost match. A test
   * keeps the table and the stylesheet in step.
   */
  const SITES = {
    youtube: {
      label: "YouTube",
      hosts: ["youtube.com", "www.youtube.com", "m.youtube.com"],
      matches: ["*://youtube.com/*", "*://www.youtube.com/*", "*://m.youtube.com/*"],
      feedSummary: "Home, Shorts, Explore",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/shorts(\/|$)/.test(path) ||
        /^\/feed\/(explore|trending)\/?$/.test(path) ||
        /^\/gaming\/?$/.test(path),
      isMedia: ({ path }) =>
        /^\/watch\/?$/.test(path) ||
        /^\/(live|embed|clip)\/[^/]+/.test(path),
      feedSelectors: [
        "ytd-browse[page-subtype='home'] ytd-rich-grid-renderer",
        "ytd-shorts",
        "ytd-browse[page-subtype='trending'] #contents",
        "ytd-browse[page-subtype='gaming'] #contents",
        "ytd-rich-grid-renderer"
      ]
    },
    instagram: {
      label: "Instagram",
      hosts: ["instagram.com", "www.instagram.com"],
      matches: ["*://instagram.com/*", "*://www.instagram.com/*"],
      feedSummary: "Home, Reels, Explore",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/reels(\/|$)/.test(path) ||
        (/^\/explore(\/|$)/.test(path) && !/^\/explore\/search(\/|$)/.test(path)),
      // A post permalink may carry the account name: /natgeo/p/Abc123/
      isMedia: ({ path }) => /^\/(?:[^/]+\/)?(?:p|reel|tv)\/[^/]+/.test(path),
      feedSelectors: ["main[role='main']", "main", "[role='main']", "section > div > div"]
    },
    tiktok: {
      label: "TikTok",
      hosts: ["tiktok.com", "www.tiktok.com"],
      matches: ["*://tiktok.com/*", "*://www.tiktok.com/*"],
      feedSummary: "For You, Explore, Live",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/(foryou|explore|live)\/?$/.test(path),
      isMedia: ({ path }) => /^\/@[^/]+\/(video|photo)\/[^/]+/.test(path),
      feedSelectors: [
        "#main-content-homepage_hot",
        "#main-content-explore_page",
        "#main-content-live",
        "main"
      ]
    },
    x: {
      label: "X",
      hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
      matches: ["*://x.com/*", "*://www.x.com/*", "*://twitter.com/*", "*://www.twitter.com/*", "*://mobile.twitter.com/*"],
      feedSummary: "Home, Explore",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/home\/?$/.test(path) ||
        /^\/explore(\/|$)/.test(path) ||
        /^\/i\/trending(\/|$)/.test(path),
      isMedia: ({ path }) => /^\/[^/]+\/status\/[^/]+/.test(path),
      feedSelectors: [
        "div[aria-label^='Timeline'][role='region']",
        "[data-testid='primaryColumn']"
      ]
    },
    reddit: {
      label: "Reddit",
      hosts: ["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "np.reddit.com"],
      matches: ["*://reddit.com/*", "*://*.reddit.com/*"],
      // www, old, new, np, sh
      hostPattern: /^(?:(?:www|old|new|np|sh)\.)?reddit\.com$/,
      feedSummary: "Home, Popular, All",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/(best|hot|new|top|rising)\/?$/.test(path) ||
        /^\/r\/(popular|all)(\/|$)/.test(path),
      isMedia: ({ path }) => /\/comments\/[^/]+/.test(path),
      feedSelectors: [
        "shreddit-feed",
        "#siteTable",
        ".ListingLayout-outerContainer",
        "main#main-content",
        "#main-content",
        "[role='main']",
        "main"
      ]
    },
    facebook: {
      label: "Facebook",
      hosts: ["facebook.com", "www.facebook.com", "web.facebook.com", "m.facebook.com"],
      matches: ["*://facebook.com/*", "*://*.facebook.com/*"],
      // www, web, m, mbasic and locale subdomains such as en-gb
      hostPattern: /^(?:(?:www|web|m|mbasic|[a-z]{2}-[a-z]{2})\.)?facebook\.com$/,
      feedSummary: "News Feed, Reels, Watch",
      isFeed: ({ path }) =>
        path === "/" ||
        path === "/home.php" ||
        /^\/reels?(\/|$)/.test(path) ||
        /^\/watch(\/|$)/.test(path),
      isMedia: ({ path }) =>
        /^\/(photo|photo\.php|permalink\.php|story\.php|share)(\/|$)/.test(path) ||
        /\/(videos|posts)\/[^/]+/.test(path),
      feedSelectors: ["[role='feed']", "[data-pagelet='MainFeed']", "[role='main']"]
    },
    threads: {
      label: "Threads",
      hosts: ["threads.net", "www.threads.net", "threads.com", "www.threads.com"],
      matches: ["*://threads.net/*", "*://www.threads.net/*", "*://threads.com/*", "*://www.threads.com/*"],
      feedSummary: "Home feed",
      isFeed: ({ path }) => path === "/",
      isMedia: ({ path }) => /^\/@[^/]+\/post\/[^/]+/.test(path) || /^\/t\/[^/]+/.test(path),
      // Threads ships hashed class names and no <main>, so the feed is described
      // by its shape: the element that directly holds the posts.
      feedSelectors: ["main[role='main']", "main", "div:has(> [data-pressable-container])"]
    },
    bluesky: {
      label: "Bluesky",
      hosts: ["bsky.app", "www.bsky.app"],
      matches: ["*://bsky.app/*", "*://www.bsky.app/*"],
      feedSummary: "Home feed",
      isFeed: ({ path }) => path === "/",
      isMedia: ({ path }) => /^\/profile\/[^/]+\/post\/[^/]+/.test(path),
      feedSelectors: ["main", "[data-testid='homeScreenFeedTabs'] ~ div", "[role='main']"]
    },
    twitch: {
      label: "Twitch",
      hosts: ["twitch.tv", "www.twitch.tv", "m.twitch.tv"],
      matches: ["*://twitch.tv/*", "*://www.twitch.tv/*", "*://m.twitch.tv/*"],
      feedSummary: "Home, Browse",
      isFeed: ({ path }) =>
        path === "/" ||
        (/^\/directory(\/|$)/.test(path) && !/^\/directory\/following(\/|$)/.test(path)),
      isMedia: ({ path }) => {
        if (/^\/videos\/[^/]+/.test(path) || /^\/[^/]+\/clip\/[^/]+/.test(path)) return true;
        const segments = path.split("/").filter(Boolean);
        return segments.length === 1 && !TWITCH_APP_PATHS.has(segments[0].toLowerCase());
      },
      feedSelectors: ["main", "[data-a-target='directory-container']", "[role='main']"]
    },
    pinterest: {
      label: "Pinterest",
      hosts: ["pinterest.com", "www.pinterest.com", "pinterest.ca", "www.pinterest.ca"],
      matches: [
        "*://pinterest.com/*", "*://*.pinterest.com/*",
        "*://pinterest.ca/*", "*://*.pinterest.ca/*",
        "*://pinterest.co.uk/*", "*://*.pinterest.co.uk/*",
        "*://pinterest.com.au/*", "*://*.pinterest.com.au/*",
        "*://pinterest.de/*", "*://*.pinterest.de/*",
        "*://pinterest.fr/*", "*://*.pinterest.fr/*"
      ],
      // Pinterest sends people to a country subdomain: ca.pinterest.com, uk.pinterest.com.
      // Only a country code or www may match, so business.pinterest.com is left alone.
      hostPattern: /^(?:(?:[a-z]{2}|[a-z]{2}-[a-z]{2}|www)\.)?pinterest\.(?:com|ca|co\.uk|com\.au|de|fr)$/,
      feedSummary: "Home, Ideas, Today",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/(ideas|today)(\/|$)/.test(path),
      isMedia: ({ path }) => /^\/pin\/[^/]+/.test(path),
      feedSelectors: [
        "[data-test-id='homefeed-feed']",
        "div[data-test-id='homefeed']",
        "[role='main']",
        "main"
      ]
    },
    linkedin: {
      label: "LinkedIn",
      hosts: ["linkedin.com", "www.linkedin.com"],
      matches: ["*://linkedin.com/*", "*://*.linkedin.com/*"],
      // www and country subdomains such as ca.linkedin.com
      hostPattern: /^(?:(?:www|[a-z]{2})\.)?linkedin\.com$/,
      feedSummary: "Home feed",
      isFeed: ({ path }) => path === "/" || /^\/feed\/?$/.test(path),
      isMedia: ({ path }) => /^\/posts\/[^/]+/.test(path) || /^\/feed\/update\/[^/]+/.test(path),
      // The games hub, a game's launch page and its results, and the surface the
      // game itself is served on: /games/, /games/queens/results/,
      // /games/view/queens/desktop/. LinkedIn frames the last one inside the
      // second, so both have to count.
      isGame: ({ path }) => /^\/games(\/|$)/.test(path),
      feedSelectors: [
        "main .scaffold-finite-scroll",
        "main[aria-label='Main Feed']",
        "main",
        "[role='main']"
      ]
    },
    googlenews: {
      label: "Google News",
      hosts: ["news.google.com"],
      matches: ["*://news.google.com/*"],
      feedSummary: "Top stories, For you",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/(home|topstories|foryou)\/?$/.test(path),
      isMedia: ({ path }) => /^\/(articles|read)\//.test(path),
      feedSelectors: ["main c-wiz", "main", "[role='main']"]
    }
  };

  const SITE_KEYS = Object.keys(SITES);

  /** Every host pattern the content script must be injected into. */
  const MATCHES = SITE_KEYS.flatMap((key) => SITES[key].matches);

  /**
   * The switches that make Decaf stronger. A running Lock protects every one of
   * them, and the repair pass restores any that were switched off behind its back.
   */
  const STRENGTH_KEYS = ["pauseFeeds", "hideComments", "upsideDown", "hideBadges"];

  const DEFAULT_SETTINGS = {
    enabled: true,
    pauseFeeds: true,
    hideComments: true,
    upsideDown: false,
    hideBadges: false,
    sites: Object.fromEntries(SITE_KEYS.map((key) => [key, true])),
    lockUntil: 0,
    passes: {},
    passDay: "",
    passCounts: {}
  };

  const LOCK_BASELINE_KEY = "lockBaseline";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cloneDefaults() {
    return clone(DEFAULT_SETTINGS);
  }

  function asBoolean(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
    return fallback;
  }

  function asTime(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function asCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.min(999, Math.floor(number)) : 0;
  }

  function dayKey(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
  }

  /**
   * Normalizes anything that may be sitting in storage — including values
   * written by an older version — into the exact current settings shape.
   */
  function mergeSettings(raw = {}, now = Date.now()) {
    const defaults = cloneDefaults();
    const sites = {};
    for (const key of SITE_KEYS) sites[key] = asBoolean(raw?.sites?.[key], defaults.sites[key]);

    const passes = {};
    for (const key of SITE_KEYS) {
      const until = asTime(raw?.passes?.[key]);
      if (until > now) passes[key] = until;
    }

    const today = dayKey(new Date(now));
    const sameDay = raw?.passDay === today;
    const passCounts = {};
    if (sameDay) {
      for (const key of SITE_KEYS) {
        const count = asCount(raw?.passCounts?.[key]);
        if (count) passCounts[key] = count;
      }
    }

    const settings = {
      enabled: asBoolean(raw?.enabled, defaults.enabled),
      sites,
      lockUntil: asTime(raw?.lockUntil),
      passes,
      passDay: Object.keys(passCounts).length ? today : "",
      passCounts
    };
    for (const key of STRENGTH_KEYS) settings[key] = asBoolean(raw?.[key], defaults[key]);
    // A Lock always implies Decaf is on; storage can never express otherwise.
    if (settings.lockUntil > now) settings.enabled = true;
    return settings;
  }

  const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

  /** Only the keys that actually changed, so writers never clobber each other. */
  function createStoragePatch(previous = {}, next = {}, now = Date.now()) {
    const before = mergeSettings(previous, now);
    const after = mergeSettings(next, now);
    const patch = {};
    for (const key of SETTINGS_KEYS) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key];
    }
    return patch;
  }

  function getSite(url = "") {
    try {
      const host = new URL(url).hostname.toLowerCase();
      for (const [key, site] of Object.entries(SITES)) {
        if (site.hosts.includes(host)) return key;
        if (site.hostPattern?.test(host)) return key;
      }
    } catch (_) {
      // Not a URL Decaf can act on (new tab, extension page, file, ...).
    }
    return null;
  }

  /** "feed" | "media" | "game" | "content" for supported sites, "" otherwise. */
  function getRoute(url = "") {
    const site = getSite(url);
    if (!site) return "";
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/{2,}/g, "/") || "/";
      const context = { path, search: parsed.search || "", hash: parsed.hash || "" };
      const definition = SITES[site];
      if (definition.isMedia?.(context)) return "media";
      if (definition.isGame?.(context)) return "game";
      return definition.isFeed(context) ? "feed" : "content";
    } catch (_) {
      return "";
    }
  }

  /**
   * Which query params say *what* you are looking at rather than how. Almost every
   * site puts that in the path; these two serve every video or photo they have
   * from a single path and put the identity in the query.
   */
  const IDENTITY_PARAMS = {
    youtube: ["v"],
    facebook: ["v", "fbid", "story_fbid", "photo_id", "id"]
  };

  /**
   * What identifies the page someone opened, as opposed to whatever happens to be
   * in the address bar right now.
   *
   * Sites rewrite their own URL constantly while a person sits still on one page:
   * YouTube drops the `si` share token a second after load and writes the playhead
   * into `t`, Instagram counts carousel slides in `img_index`, and following any
   * in-page anchor adds a `#hash`. None of those is a move to another page, so
   * none of them may take back something granted for this one — see
   * `onLocationChange` in content.js, where a full-href comparison used to revoke
   * the colour grant a second after it was asked for.
   *
   * Joined on a NUL, which cannot appear in a URL, so two different pages can
   * never collide on one key. "" for anything Decaf does not act on.
   */
  function getPageKey(url = "") {
    const site = getSite(url);
    if (!site) return "";
    try {
      const parsed = new URL(url);
      // A trailing slash is the same page: /watch and /watch/ are both `media`.
      const path = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
      const identity = (IDENTITY_PARAMS[site] || []).map((name) => parsed.searchParams.get(name) ?? "");
      return [site, path, ...identity].join("\u0000");
    } catch (_) {
      return "";
    }
  }

  function siteLabel(site) {
    return SITES[site]?.label || "";
  }

  function feedSelectors(site) {
    return SITES[site]?.feedSelectors || [];
  }

  function isActiveForSite(settings, site) {
    return Boolean(site && settings?.enabled && settings?.sites?.[site]);
  }

  function isLocked(settings, now = Date.now()) {
    return asTime(settings?.lockUntil) > now;
  }

  function passUntil(settings, site, now = Date.now()) {
    const until = asTime(settings?.passes?.[site]);
    return until > now ? until : 0;
  }

  function isPassActive(settings, site, now = Date.now()) {
    return passUntil(settings, site, now) > 0;
  }

  function passCount(settings, site, now = Date.now()) {
    return settings?.passDay === dayKey(new Date(now)) ? asCount(settings?.passCounts?.[site]) : 0;
  }

  /**
   * Each pass on the same site takes a little longer to earn, and a Lock adds a
   * little more. No caps, no punishment — just an honest, growing pause.
   */
  function holdMs(count = 0, locked = false) {
    const base = Math.min(HOLD_MAX_MS, HOLD_BASE_MS + HOLD_STEP_MS * Math.max(0, count));
    return base + (locked ? HOLD_LOCK_BONUS_MS : 0);
  }

  function holdSeconds(count = 0, locked = false) {
    return Math.round(holdMs(count, locked) / 1000);
  }

  /** A feed is paused unless Decaf is off for the site, feeds are not paused, or a pass is running. */
  function shouldPauseFeed(settings, site, route, now = Date.now()) {
    if (route !== "feed" || !isActiveForSite(settings, site)) return false;
    if (!settings.pauseFeeds) return false;
    return !isPassActive(settings, site, now);
  }

  function grantPass(settings, site, now = Date.now()) {
    const current = mergeSettings(settings, now);
    if (!SITE_KEYS.includes(site)) return current;
    const today = dayKey(new Date(now));
    const counts = current.passDay === today ? { ...current.passCounts } : {};
    counts[site] = asCount(counts[site]) + 1;
    return mergeSettings({
      ...current,
      passes: { ...current.passes, [site]: now + PASS_MS },
      passDay: today,
      passCounts: counts
    }, now);
  }

  function endPass(settings, site, now = Date.now()) {
    const current = mergeSettings(settings, now);
    const passes = { ...current.passes };
    delete passes[site];
    return mergeSettings({ ...current, passes }, now);
  }

  /** True when `next` would make Decaf do less than `previous` did. */
  function isWeakening(previous, next, now = Date.now()) {
    const before = mergeSettings(previous, now);
    const after = mergeSettings(next, now);
    // `mergeSettings` forces `enabled` on during a lock, so read the request
    // itself to catch an attempt to switch Decaf off.
    const requestedEnabled = asBoolean(next?.enabled, after.enabled);
    if (before.enabled && !requestedEnabled) return true;
    for (const key of STRENGTH_KEYS) {
      if (before[key] && !after[key]) return true;
    }
    for (const key of SITE_KEYS) {
      if (before.sites[key] && !after.sites[key]) return true;
    }
    return isLocked(before, now) && after.lockUntil < before.lockUntil;
  }

  /** Restores anything a stale writer weakened while a Lock was running. */
  function repairLocked(baseline = {}, current = {}, now = Date.now()) {
    const floor = mergeSettings(baseline, now);
    const next = mergeSettings(current, now);
    if (!isLocked(floor, now)) return next;
    if (floor.enabled) next.enabled = true;
    for (const key of STRENGTH_KEYS) {
      if (floor[key]) next[key] = true;
    }
    for (const key of SITE_KEYS) {
      if (floor.sites[key]) next.sites[key] = true;
    }
    if (next.lockUntil < floor.lockUntil) next.lockUntil = floor.lockUntil;
    return mergeSettings(next, now);
  }

  /** "4 min", "2 hr 10 min", "6 days" — always rounded up, never zero. */
  function formatDuration(ms) {
    const minutes = Math.max(1, Math.ceil(Math.max(0, ms) / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours < 24) return restMinutes ? `${hours} hr ${restMinutes} min` : `${hours} hr`;
    const days = Math.round(hours / 24);
    return days === 1 ? "1 day" : `${days} days`;
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(Math.max(0, ms) / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function formatEndTime(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "";
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) return `today at ${time}`;
    if (date.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
  }

  function ordinal(count) {
    const value = Math.max(1, Math.floor(count));
    const rest = value % 100;
    if (rest >= 11 && rest <= 13) return `${value}th`;
    return `${value}${["th", "st", "nd", "rd"][value % 10] || "th"}`;
  }

  const api = {
    PASS_MINUTES,
    PASS_MS,
    HOLD_MAX_MS,
    LOCK_DURATIONS,
    DEFAULT_LOCK_HOURS,
    LOCK_BASELINE_KEY,
    SITES,
    SITE_KEYS,
    MATCHES,
    STRENGTH_KEYS,
    DEFAULT_SETTINGS,
    cloneDefaults,
    mergeSettings,
    createStoragePatch,
    dayKey,
    getSite,
    getRoute,
    getPageKey,
    siteLabel,
    feedSelectors,
    isActiveForSite,
    isLocked,
    passUntil,
    isPassActive,
    passCount,
    holdMs,
    holdSeconds,
    shouldPauseFeed,
    grantPass,
    endPass,
    isWeakening,
    repairLocked,
    formatDuration,
    formatClock,
    formatEndTime,
    ordinal
  };

  globalThis.Decaf = api;
  // Content scripts run in an isolated world, so this only ever runs under Node
  // during tests; page globals can never reach it.
  if (typeof module === "object" && module !== null && typeof module.exports === "object") {
    module.exports = api;
  }
})();
