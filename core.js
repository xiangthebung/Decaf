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
  /*
   * A Lock you can only take for a whole day is a Lock most people never take.
   * The short durations are the same mechanism at a price someone will actually
   * pay: an hour of protection is a focus session that never freezes you — the
   * feed is still seven seconds away, it just costs more, and no switch can be
   * flipped to get out of it. The default is the cheapest one for that reason.
   */
  const LOCK_DURATIONS = [
    { hours: 1, label: "1 hour" },
    { hours: 4, label: "4 hours" },
    { hours: 24, label: "1 day" },
    { hours: 168, label: "1 week" },
    { hours: 720, label: "30 days" }
  ];
  const DEFAULT_LOCK_HOURS = 1;

  /**
   * Turning a site off is the state people fall into by accident and never come
   * back from: "I need Instagram for forty minutes" becomes eight months off.
   * A snooze is the same relief with an end to it, and it is the option the UI
   * offers first. A permanent off is still there for anyone who means it.
   */
  const SNOOZE_DURATIONS = [
    { minutes: 30, label: "30 min" },
    { minutes: 120, label: "2 hours" }
  ];

  /** How many days of pass counts are kept. Long enough to see a week move. */
  const PASS_HISTORY_DAYS = 14;
  /** A snooze is measured in hours. Anything longer is a decision, not a pause. */
  const MAX_SNOOZE_MS = 8 * 3600000;
  const MAX_CUSTOM_SITES = 30;

  const TWITCH_APP_PATHS = new Set([
    "directory", "videos", "settings", "subscriptions", "wallet", "drops", "friends",
    "inventory", "downloads", "prime", "turbo", "jobs", "search", "following",
    "popout", "moderator", "u", "p", "team", "products", "store", "broadcast",
    // Anything that is plainly the application rather than a channel. A missing
    // name here used to mean /login and /dashboard were read as "one thing the
    // person opened on purpose", which is how a sign-in page came to be treated
    // as media.
    "login", "signup", "logout", "dashboard", "creatorcamp", "collections",
    "payments", "subscriptions-manage", "friends-requests", "directory-following",
    "activate", "bits", "redeem", "gift", "privacy", "terms", "about", "help",
    "legal", "security", "checkout", "user"
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
      // A watch page is identified by its `v`, not by its path: bare /watch is an
      // error page, and treating it as media used to hand it a colour offer.
      isMedia: ({ path, search }) =>
        (/^\/watch\/?$/.test(path) && Boolean(param(search, "v"))) ||
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
      // Explore itself is algorithmic. A hashtag and a location are not: they are
      // things a person typed or tapped, the same case as /explore/search, and
      // emptying them left the card claiming a feed was paused on a page someone
      // had asked for by name.
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/reels(\/|$)/.test(path) ||
        /^\/explore\/?$/.test(path) ||
        /^\/explore\/people(\/|$)/.test(path),
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
      hosts: ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
      matches: [
        "*://x.com/*", "*://www.x.com/*", "*://mobile.x.com/*",
        "*://twitter.com/*", "*://www.twitter.com/*", "*://mobile.twitter.com/*"
      ],
      feedSummary: "Home, Explore",
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/home\/?$/.test(path) ||
        /^\/explore(\/|$)/.test(path) ||
        /^\/i\/trending(\/|$)/.test(path) ||
        // A list and a community are timelines like any other. Curating one does
        // not make it end.
        /^\/i\/(lists|communities)\/[^/]+/.test(path),
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
      feedSummary: "Home, Popular, All, subreddits",
      /*
       * A subreddit front page is structurally identical to /r/all: an endless,
       * ranked list of posts. That is where a Reddit habit actually lives, so
       * pausing reddit.com/ and leaving r/pics to scroll forever paused the
       * smaller half of the problem. The thread underneath a post is a different
       * thing entirely and stays — `isMedia` wins, and /r/<sub>/comments/... is
       * what someone who searched for a problem came for. See the cap in the
       * README for why that thread is trimmed rather than hidden.
       */
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/(best|hot|new|top|rising)\/?$/.test(path) ||
        /^\/r\/[^/]+\/?$/.test(path) ||
        /^\/r\/[^/]+\/(hot|new|top|rising|best|controversial)\/?$/.test(path) ||
        /^\/user\/[^/]+\/?$/.test(path) ||
        /^\/user\/[^/]+\/m\/[^/]+/.test(path),
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
      feedSummary: "News Feed, Reels, Watch, Marketplace",
      /*
       * Marketplace is named surface by surface rather than by its prefix.
       *
       * `/marketplace(/|$)` looked like the whole of Marketplace and was in fact
       * the whole of it: `/marketplace/inbox`, an individual conversation at
       * `/marketplace/inbox/<id>`, `/marketplace/you/selling` and a listing
       * permalink at `/marketplace/item/<id>` were all read as an endless feed
       * and emptied. Someone answering a buyer lost the conversation. Decaf is
       * not allowed to come between anyone and a message, so what counts as the
       * Marketplace feed is listed rather than assumed, and anything unlisted
       * falls through to `content` — a surface Decaf leaves alone is a far
       * cheaper mistake than a conversation it empties.
       */
      isFeed: ({ path }) =>
        path === "/" ||
        path === "/home.php" ||
        /^\/reels?(\/|$)/.test(path) ||
        /^\/watch(\/|$)/.test(path) ||
        /^\/groups\/feed(\/|$)/.test(path) ||
        /^\/marketplace\/?$/.test(path) ||
        /^\/marketplace\/categor(?:y|ies)\/[^/]+/.test(path) ||
        // The browse surface for a place: /marketplace/109502275730/vehicles
        /^\/marketplace\/\d+\/[^/]+/.test(path),
      /*
       * `/watch/?v=<id>` is the permalink every shared Facebook video and every
       * fb.watch link lands on, and the path alone cannot tell it apart from the
       * Watch feed. So the identity is read from the query — the same `v` that
       * IDENTITY_PARAMS already uses to tell one video from another. Bare /watch
       * stays a feed.
       */
      isMedia: ({ path, search }) =>
        (/^\/watch(\/|$)/.test(path) && Boolean(param(search, "v"))) ||
        /^\/(photo|photo\.php|permalink\.php|story\.php|share)(\/|$)/.test(path) ||
        /^\/marketplace\/item\/[^/]+/.test(path) ||
        /\/(videos|posts|reel)\/[^/]+/.test(path),
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
      feedSummary: "Home feed, custom feeds",
      // Custom feeds are Bluesky's product — Discover lives at
      // /profile/<did>/feed/<name> — so pausing only the home timeline paused the
      // surface people spend least time on.
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/profile\/[^/]+\/feed\/[^/]+/.test(path),
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
      /*
       * Pinterest sells the same product on about thirty country domains, and
       * covering six of them meant Decaf simply did not exist for most of the
       * world. These are the ones with meaningful traffic; the pattern below is
       * what actually decides, and it only accepts a country code or `www`, so
       * business.pinterest.com is left alone.
       */
      matches: [
        "*://pinterest.com/*", "*://*.pinterest.com/*",
        "*://pinterest.ca/*", "*://*.pinterest.ca/*",
        "*://pinterest.co.uk/*", "*://*.pinterest.co.uk/*",
        "*://pinterest.com.au/*", "*://*.pinterest.com.au/*",
        "*://pinterest.co.kr/*", "*://*.pinterest.co.kr/*",
        "*://pinterest.com.mx/*", "*://*.pinterest.com.mx/*",
        "*://pinterest.de/*", "*://*.pinterest.de/*",
        "*://pinterest.fr/*", "*://*.pinterest.fr/*",
        "*://pinterest.es/*", "*://*.pinterest.es/*",
        "*://pinterest.it/*", "*://*.pinterest.it/*",
        "*://pinterest.jp/*", "*://*.pinterest.jp/*",
        "*://pinterest.nz/*", "*://*.pinterest.nz/*",
        "*://pinterest.ie/*", "*://*.pinterest.ie/*",
        "*://pinterest.se/*", "*://*.pinterest.se/*",
        "*://pinterest.dk/*", "*://*.pinterest.dk/*",
        "*://pinterest.ch/*", "*://*.pinterest.ch/*",
        "*://pinterest.at/*", "*://*.pinterest.at/*",
        "*://pinterest.pt/*", "*://*.pinterest.pt/*",
        "*://pinterest.ph/*", "*://*.pinterest.ph/*",
        "*://pinterest.cl/*", "*://*.pinterest.cl/*",
        "*://pinterest.co/*", "*://*.pinterest.co/*",
        "*://pinterest.ru/*", "*://*.pinterest.ru/*"
      ],
      hostPattern: /^(?:(?:[a-z]{2}|[a-z]{2}-[a-z]{2}|www)\.)?pinterest\.(?:com|ca|co\.uk|com\.au|co\.kr|com\.mx|de|fr|es|it|jp|nz|ie|se|dk|ch|at|pt|ph|cl|co|ru)$/,
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
      feedSummary: "Top stories, For you, Topics",
      // Every topic chip in Google News' own navigation points at /topics/<id>,
      // so leaving those out meant one tap took you straight past Decaf.
      isFeed: ({ path }) =>
        path === "/" ||
        /^\/(home|topstories|foryou)\/?$/.test(path) ||
        /^\/topics\/[^/]+/.test(path) ||
        /^\/stories\/[^/]+/.test(path),
      isMedia: ({ path }) => /^\/(articles|read)\//.test(path),
      feedSelectors: ["main c-wiz", "main", "[role='main']"]
    }
  };

  /**
   * One query parameter, read from the `search` string `getRoute` already builds.
   * Two sites serve every video they have from one path and put the identity in
   * the query, so a route rule that only ever looked at the path could not tell
   * a permalink from the feed it was served beside.
   */
  function param(search, name) {
    try {
      return new URLSearchParams(search || "").get(name) || "";
    } catch (_) {
      return "";
    }
  }

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
    // Sites the person added themselves, keyed by hostname. These get the
    // treatment that needs no site table — grayscale, counts, badges — and a
    // best-effort feed pause found by shape. See `CUSTOM_PREFIX`.
    custom: {},
    // site key -> timestamp. Decaf is off there until then, and comes back on
    // its own afterwards.
    snoozes: {},
    lockUntil: 0,
    passes: {},
    // "YYYY-MM-DD" -> { siteKey: count }, trimmed to PASS_HISTORY_DAYS.
    passHistory: {},
    seenIntro: false
  };

  const LOCK_BASELINE_KEY = "lockBaseline";
  /** Advanced whenever the worker runs, so a clock rolled backwards is visible. */
  const CLOCK_SEEN_KEY = "clockSeen";
  const CUSTOM_PREFIX = "custom:";

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

  /** A hostname, lowercased, with nothing else in it. "" if it is not one. */
  function asHost(value) {
    const text = String(value || "").trim().toLowerCase().replace(/^\w+:\/\//, "").split("/")[0];
    if (!text || text.length > 253 || !/^[a-z0-9.-]+$/.test(text)) return "";
    if (!text.includes(".") || text.startsWith(".") || text.endsWith(".")) return "";
    return text;
  }

  function asLabel(value, fallback) {
    const text = String(value ?? "").trim().slice(0, 40);
    return text || fallback;
  }

  function customKey(host) {
    return `${CUSTOM_PREFIX}${host}`;
  }

  function isCustomKey(key) {
    return typeof key === "string" && key.startsWith(CUSTOM_PREFIX);
  }

  function customHost(key) {
    return isCustomKey(key) ? key.slice(CUSTOM_PREFIX.length) : "";
  }

  /** The twelve built-in keys plus whatever the person added, in that order. */
  function siteKeys(settings) {
    return [...SITE_KEYS, ...Object.keys(settings?.custom || {}).map(customKey)];
  }

  function normalizeCustom(raw) {
    const custom = {};
    const source = raw && typeof raw === "object" ? raw : {};
    // Bounded so a corrupted or hostile write cannot make every later loop
    // over the site list unbounded work.
    for (const [rawHost, value] of Object.entries(source).slice(0, MAX_CUSTOM_SITES)) {
      const host = asHost(rawHost);
      if (!host || SITE_KEYS.some((key) => matchesSite(SITES[key], host))) continue;
      custom[host] = {
        label: asLabel(value?.label, host.replace(/^www\./, "")),
        enabled: asBoolean(value?.enabled, true)
      };
    }
    return custom;
  }

  /**
   * The last PASS_HISTORY_DAYS days of pass counts, newest kept. Nothing here is
   * a record of where anyone has been — it is one integer per site per day, and
   * the oldest one falls off on its own.
   */
  function normalizeHistory(raw, keys, now) {
    const source = raw && typeof raw === "object" ? raw : {};
    const cutoff = dayKey(new Date(now - (PASS_HISTORY_DAYS - 1) * 86400000));
    const today = dayKey(new Date(now));
    const history = {};
    for (const day of Object.keys(source).sort().reverse()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < cutoff || day > today) continue;
      const counts = {};
      for (const key of keys) {
        const count = asCount(source[day]?.[key]);
        if (count) counts[key] = count;
      }
      if (Object.keys(counts).length) history[day] = counts;
    }
    return history;
  }

  /**
   * Normalizes anything that may be sitting in storage — including values
   * written by an older version — into the exact current settings shape.
   */
  function mergeSettings(raw = {}, now = Date.now()) {
    const defaults = cloneDefaults();
    const custom = normalizeCustom(raw?.custom);
    const keys = [...SITE_KEYS, ...Object.keys(custom).map(customKey)];

    const sites = {};
    for (const key of SITE_KEYS) sites[key] = asBoolean(raw?.sites?.[key], defaults.sites[key]);

    const passes = {};
    const snoozes = {};
    for (const key of keys) {
      const until = asTime(raw?.passes?.[key]);
      // A pass can never be longer than a pass. Without this a hand-written
      // timestamp is an unbounded hole in an otherwise honest mechanism.
      if (until > now) passes[key] = Math.min(until, now + PASS_MS);
      const snooze = asTime(raw?.snoozes?.[key]);
      if (snooze > now) snoozes[key] = Math.min(snooze, now + MAX_SNOOZE_MS);
    }

    // Storage written before pass history existed kept one day in two flat keys.
    const legacy = raw?.passDay && raw?.passCounts ? { [raw.passDay]: raw.passCounts } : {};
    const passHistory = normalizeHistory(
      raw?.passHistory && Object.keys(raw.passHistory).length ? raw.passHistory : legacy,
      keys,
      now
    );

    const settings = {
      enabled: asBoolean(raw?.enabled, defaults.enabled),
      sites,
      custom,
      snoozes,
      lockUntil: asTime(raw?.lockUntil),
      passes,
      passHistory,
      seenIntro: asBoolean(raw?.seenIntro, defaults.seenIntro)
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

  function matchesSite(site, host) {
    return Boolean(site && (site.hosts.includes(host) || site.hostPattern?.test(host)));
  }

  /**
   * Which site this is. A built-in key for the twelve in the table, or
   * `custom:<host>` for one the person added — `settings` has to be passed for
   * the second kind to be found at all, and every caller that has settings
   * passes them.
   */
  function getSite(url = "", settings = null) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      for (const [key, site] of Object.entries(SITES)) {
        if (matchesSite(site, host)) return key;
      }
      const custom = settings?.custom;
      if (custom) {
        if (custom[host]) return customKey(host);
        // www.example.com should find an entry added as example.com.
        const bare = host.replace(/^www\./, "");
        if (custom[bare]) return customKey(bare);
      }
    } catch (_) {
      // Not a URL Decaf can act on (new tab, extension page, file, ...).
    }
    return null;
  }

  /** "feed" | "media" | "game" | "content" for supported sites, "" otherwise. */
  function getRoute(url = "", settings = null) {
    const site = getSite(url, settings);
    if (!site) return "";
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/{2,}/g, "/") || "/";
      const context = { path, search: parsed.search || "", hash: parsed.hash || "" };
      // A site Decaf has no table for gets the one route rule that is true of
      // nearly every site on the web and wrong about none of them: the front
      // page is the feed, and everything you navigated to is not. Anything
      // stronger would need selectors Decaf does not have.
      if (isCustomKey(site)) return path === "/" ? "feed" : "content";
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
   * Each part is percent-encoded before the parts are joined on a NUL. The
   * encoding is what makes the separator safe, not the URL grammar: a NUL can
   * reach here, because `new URL("https://x.com/%00")` keeps the escape in
   * `pathname` and a query value can decode to one — so without encoding, two
   * different pages could still agree on a key. "" for anything Decaf does not
   * act on.
   */
  function getPageKey(url = "", settings = null) {
    const site = getSite(url, settings);
    if (!site) return "";
    try {
      const parsed = new URL(url);
      // A trailing slash is the same page: /watch and /watch/ are both `media`.
      const path = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
      const identity = (IDENTITY_PARAMS[site] || []).map((name) => parsed.searchParams.get(name) ?? "");
      return [site, path, ...identity].map(encodeURIComponent).join("\u0000");
    } catch (_) {
      return "";
    }
  }

  function siteLabel(site, settings = null) {
    if (isCustomKey(site)) {
      const host = customHost(site);
      return settings?.custom?.[host]?.label || host;
    }
    return SITES[site]?.label || "";
  }

  function feedSummary(site, settings = null) {
    if (isCustomKey(site)) return "the front page";
    return SITES[site]?.feedSummary || "";
  }

  function feedSelectors(site) {
    // A site the person added has no table. `findFeedByShape` in content.js is
    // the whole of its feed detection, which is exactly what the options page
    // promises when the site is added.
    return SITES[site]?.feedSelectors || [];
  }

  /** Whether the site's own switch is on, ignoring any snooze. */
  function siteEnabled(settings, site) {
    if (!site) return false;
    if (isCustomKey(site)) return Boolean(settings?.custom?.[customHost(site)]?.enabled);
    return Boolean(settings?.sites?.[site]);
  }

  function snoozeUntil(settings, site, now = Date.now()) {
    const until = asTime(settings?.snoozes?.[site]);
    return until > now ? until : 0;
  }

  function isSnoozed(settings, site, now = Date.now()) {
    return snoozeUntil(settings, site, now) > 0;
  }

  function isActiveForSite(settings, site, now = Date.now()) {
    return Boolean(site && settings?.enabled && siteEnabled(settings, site) && !isSnoozed(settings, site, now));
  }

  /** Sets a site aside for a while. It comes back on its own. */
  function snoozeSite(settings, site, minutes, now = Date.now()) {
    const current = mergeSettings(settings, now);
    if (!siteKeys(current).includes(site)) return current;
    const span = Math.min(MAX_SNOOZE_MS, Math.max(0, Number(minutes) || 0) * 60000);
    if (!span) return current;
    return mergeSettings({ ...current, snoozes: { ...current.snoozes, [site]: now + span } }, now);
  }

  function wakeSite(settings, site, now = Date.now()) {
    const current = mergeSettings(settings, now);
    const snoozes = { ...current.snoozes };
    delete snoozes[site];
    return mergeSettings({ ...current, snoozes }, now);
  }

  function addCustomSite(settings, host, label = "", now = Date.now()) {
    const current = mergeSettings(settings, now);
    const clean = asHost(host);
    if (!clean) return current;
    if (Object.keys(current.custom).length >= MAX_CUSTOM_SITES && !current.custom[clean]) return current;
    return mergeSettings({
      ...current,
      custom: { ...current.custom, [clean]: { label: asLabel(label, clean.replace(/^www\./, "")), enabled: true } }
    }, now);
  }

  function removeCustomSite(settings, host, now = Date.now()) {
    const current = mergeSettings(settings, now);
    const custom = { ...current.custom };
    delete custom[asHost(host)];
    return mergeSettings({ ...current, custom }, now);
  }

  /** The match pattern a custom site needs, for optional host permissions. */
  function customMatch(host) {
    const clean = asHost(host);
    return clean ? `*://*.${clean.replace(/^www\./, "")}/*` : "";
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
    return asCount(settings?.passHistory?.[dayKey(new Date(now))]?.[site]);
  }

  /**
   * Today's and this week's passes, across every site. One meter reading, kept so
   * that after a month-long Lock Decaf can say something true about whether it
   * helped — and deliberately not a streak, a score or a goal.
   */
  function passTotals(settings, now = Date.now()) {
    const history = settings?.passHistory || {};
    const today = dayKey(new Date(now));
    const weekStart = dayKey(new Date(now - 6 * 86400000));
    const sum = (counts) => Object.values(counts || {}).reduce((total, value) => total + asCount(value), 0);
    let week = 0;
    let busiest = null;
    const perSite = {};
    for (const [day, counts] of Object.entries(history)) {
      if (day < weekStart || day > today) continue;
      week += sum(counts);
      for (const [key, value] of Object.entries(counts)) {
        perSite[key] = (perSite[key] || 0) + asCount(value);
      }
    }
    for (const [key, value] of Object.entries(perSite)) {
      if (!busiest || value > perSite[busiest]) busiest = key;
    }
    return { today: sum(history[today]), week, perSite, busiest };
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
    if (route !== "feed" || !isActiveForSite(settings, site, now)) return false;
    if (!settings.pauseFeeds) return false;
    return !isPassActive(settings, site, now);
  }

  function grantPass(settings, site, now = Date.now()) {
    const current = mergeSettings(settings, now);
    if (!siteKeys(current).includes(site)) return current;
    const today = dayKey(new Date(now));
    const counts = { ...(current.passHistory[today] || {}) };
    counts[site] = asCount(counts[site]) + 1;
    return mergeSettings({
      ...current,
      passes: { ...current.passes, [site]: now + PASS_MS },
      passHistory: { ...current.passHistory, [today]: counts }
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
    for (const key of siteKeys(before)) {
      if (siteEnabled(before, key) && !siteEnabled(after, key)) return true;
      // A snooze is an off switch with a timer on it, so a Lock has to see it as
      // one. Starting or lengthening one is weakening; letting one run out is not.
      if (snoozeUntil(after, key, now) > snoozeUntil(before, key, now)) return true;
    }
    // Today's counts set the length of the next hold. Clearing them is the
    // cheapest way to take the escalation back to three seconds, so it counts.
    const today = dayKey(new Date(now));
    for (const key of siteKeys(before)) {
      const wasCount = asCount(before.passHistory?.[today]?.[key]);
      if (wasCount > asCount(after.passHistory?.[today]?.[key])) return true;
    }
    // Granting a pass is not weakening — it is the mechanism working — and a
    // pass longer than a pass is impossible, because mergeSettings caps it.
    return isLocked(before, now) && after.lockUntil < before.lockUntil;
  }

  /**
   * The floor a running Lock holds, moved up to wherever settings are now.
   *
   * The baseline used to be frozen at the moment the Lock was taken, so anything
   * switched *on* during a Lock was not protected by it — turn on "Hide
   * notification counts" on Monday and it could be turned off again on Tuesday
   * while the Lock still claimed to be holding everything. A Lock can be added
   * to; what is added is then held too.
   */
  function raiseBaseline(baseline = {}, current = {}, now = Date.now()) {
    const floor = mergeSettings(baseline, now);
    if (!isLocked(floor, now)) return floor;
    return repairLocked(floor, current, now);
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
    for (const [host, entry] of Object.entries(floor.custom)) {
      if (!entry.enabled) continue;
      next.custom[host] = { ...(next.custom[host] || entry), enabled: true };
    }
    // A site the Lock was holding cannot be set aside for the afternoon either.
    for (const key of siteKeys(floor)) {
      if (siteEnabled(floor, key)) delete next.snoozes[key];
    }
    const today = dayKey(new Date(now));
    const floorCounts = floor.passHistory?.[today] || {};
    if (Object.keys(floorCounts).length) {
      const counts = { ...(next.passHistory[today] || {}) };
      for (const [key, value] of Object.entries(floorCounts)) {
        if (asCount(value) > asCount(counts[key])) counts[key] = asCount(value);
      }
      next.passHistory = { ...next.passHistory, [today]: counts };
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
    CLOCK_SEEN_KEY,
    CUSTOM_PREFIX,
    SNOOZE_DURATIONS,
    PASS_HISTORY_DAYS,
    MAX_CUSTOM_SITES,
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
    feedSummary,
    feedSelectors,
    siteKeys,
    siteEnabled,
    isCustomKey,
    customHost,
    customKey,
    customMatch,
    asHost,
    addCustomSite,
    removeCustomSite,
    snoozeUntil,
    isSnoozed,
    snoozeSite,
    wakeSite,
    isActiveForSite,
    isLocked,
    passUntil,
    isPassActive,
    passCount,
    passTotals,
    raiseBaseline,
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
