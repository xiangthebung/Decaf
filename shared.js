(() => {
  const SITE_LABELS = {
    instagram: "Instagram",
    discord: "Discord",
    reddit: "Reddit",
    youtube: "YouTube",
    tiktok: "TikTok",
    twitch: "Twitch",
    x: "X",
    facebook: "Facebook",
    google: "Google",
    pinterest: "Pinterest",
    linkedin: "LinkedIn",
    threads: "Threads",
    snapchat: "Snapchat",
    whatsapp: "WhatsApp",
    messenger: "Messenger"
  };

  const DEFAULT_SITE_SETTINGS = {
    instagram: {
      hideReels: true,
      hideComments: true
    },
    discord: {
      hideMedia: false
    },
    reddit: {
      hideComments: false
    },
    youtube: {
      hideShortsTab: true,
      hideComments: true,
      requireVideoApproval: true,
      sabotageOpenedVideos: false
    },
    tiktok: {
      hideLiveTab: true,
      hideShopTab: true,
      hideComments: true
    },
    twitch: {
      hideDiscovery: true,
      hideClips: true,
      hideChat: true
    },
    x: {
      hideExplore: true,
      hideSuggestedPosts: true,
      hideForYouTab: false
    },
    facebook: {
      hideReels: true,
      hideWatch: true,
      hideStories: true,
      hideSuggestedPosts: true
    },
    google: {
      hideDoodles: true,
      hideTrendingSearches: true,
      hideDiscover: true,
      hideNewsPanels: true
    },
    pinterest: {
      hideRecommendations: true,
      hideRelatedPins: true,
      hideSaveCounts: true
    },
    // LinkedIn uses the same global media and notification controls as every
    // other supported site. Keep this empty so optional feed heuristics do not
    // hide useful work-related posts by default.
    linkedin: {},
    threads: {
      hideForYouTab: false,
      hideSuggestedPosts: true
    },
    snapchat: {
      hideSpotlight: true,
      hideDiscover: true,
      hideStories: true
    },
    whatsapp: {
      hideStatus: true,
      hideChannels: true
    },
    messenger: {
      hideStories: true,
      hideSuggestedContent: true
    }
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    sites: {
      instagram: true,
      discord: false,
      reddit: true,
      youtube: true,
      tiktok: true,
      twitch: true,
      x: true,
      facebook: true,
      google: false,
      pinterest: true,
      linkedin: false,
      threads: true,
      snapchat: true,
      whatsapp: false,
      messenger: false
    },
    features: {
      monochrome: 75,
      upsideDownMedia: false,
      blurThumbnails: false,
      hideNotificationBadges: true,
      hideEngagementCounts: true,
      stripMedia: false
    },
    siteSettings: DEFAULT_SITE_SETTINGS,
    lockUntil: 0,
    bypassUntil: 0,
    bypassSite: "",
    bypassCooldownHours: 2,
    bypassDurationMinutes: 10,
    bypassLastGrantedAt: 0
  };

  const DEFAULT_LOCK_DURATION_HOURS = 24;

  const FEATURE_KEYS = Object.keys(DEFAULT_SETTINGS.features);
  const YOUTUBE_FOCUS_APPROVALS_KEY = "youtubeFocusApprovals";
  const MAX_YOUTUBE_FOCUS_APPROVALS = 100;
  const SITE_SETTING_KEYS = Object.fromEntries(
    Object.entries(DEFAULT_SITE_SETTINGS).map(([site, values]) => [site, Object.keys(values)])
  );

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

  function asPercent(value, fallback = 100) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : fallback;
  }

  function getYouTubeVideoId(url = "") {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "youtube.com" && !parsed.hostname.endsWith(".youtube.com")) return "";
      let videoId = "";
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
      else {
        const match = parsed.pathname.match(/^\/(?:embed|live)\/([^/?#]+)/);
        videoId = match?.[1] || "";
      }
      return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : "";
    } catch (_) {
      return "";
    }
  }

  function normalizeYouTubeFocusApprovals(raw = {}) {
    const lockUntil = Math.max(0, Number(raw?.lockUntil) || 0);
    const hasPlaybackModes = Array.isArray(raw?.normalVideoIds) || Array.isArray(raw?.frictionVideoIds);
    const entries = [];
    const seen = new Set();
    const collect = (values, mode) => {
      for (const value of Array.isArray(values) ? values : []) {
        const videoId = String(value || "").trim();
        if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        entries.push({ videoId, mode });
        if (entries.length >= MAX_YOUTUBE_FOCUS_APPROVALS) break;
      }
    };

    // Approvals created before playback modes existed are normal approvals.
    collect(hasPlaybackModes ? raw.normalVideoIds : raw.videoIds, "normal");
    if (entries.length < MAX_YOUTUBE_FOCUS_APPROVALS) collect(raw.frictionVideoIds, "friction");

    return {
      lockUntil,
      videoIds: entries.map(({ videoId }) => videoId),
      normalVideoIds: entries.filter(({ mode }) => mode === "normal").map(({ videoId }) => videoId),
      frictionVideoIds: entries.filter(({ mode }) => mode === "friction").map(({ videoId }) => videoId)
    };
  }

  function getYouTubeFocusApprovalMode(approvals, videoId) {
    const normalized = normalizeYouTubeFocusApprovals(approvals);
    if (normalized.normalVideoIds.includes(videoId)) return "normal";
    if (normalized.frictionVideoIds.includes(videoId)) return "friction";
    return "";
  }

  function isYouTubeVideoApproved(settings, approvals, videoId, now = Date.now()) {
    return Boolean(
      videoId &&
      isLocked(settings, now) &&
      normalizeYouTubeFocusApprovals(approvals).lockUntil === Number(settings?.lockUntil) &&
      getYouTubeFocusApprovalMode(approvals, videoId)
    );
  }

  function addYouTubeFocusApproval(approvals, lockUntil, videoId, mode = "normal") {
    const normalized = normalizeYouTubeFocusApprovals(approvals);
    const entries = normalized.lockUntil === Number(lockUntil)
      ? normalized.videoIds.map((id) => ({
        videoId: id,
        mode: normalized.normalVideoIds.includes(id) ? "normal" : "friction"
      }))
      : [];
    const validVideoId = /^[A-Za-z0-9_-]{6,20}$/.test(videoId);
    const playbackMode = mode === "friction" ? "friction" : "normal";
    const existingIndex = entries.findIndex(({ videoId: id }) => id === videoId);
    if (existingIndex >= 0) entries.splice(existingIndex, 1);
    if (validVideoId) entries.push({ videoId, mode: playbackMode });
    const limited = entries.slice(-MAX_YOUTUBE_FOCUS_APPROVALS);
    return {
      lockUntil: Math.max(0, Number(lockUntil) || 0),
      videoIds: limited.map(({ videoId: id }) => id),
      normalVideoIds: limited.filter(({ mode: entryMode }) => entryMode === "normal").map(({ videoId: id }) => id),
      frictionVideoIds: limited.filter(({ mode: entryMode }) => entryMode === "friction").map(({ videoId: id }) => id)
    };
  }

  function migrateLegacy(raw = {}) {
    const next = { ...raw };
    const oldFeatures = { ...(raw.features || {}) };
    const oldMode = raw.mode || raw.intensity;
    const features = {};

    if (typeof oldFeatures.monochrome !== "undefined") features.monochrome = oldFeatures.monochrome;
    else if (typeof raw.mediaGrayscale === "boolean") features.monochrome = raw.mediaGrayscale ? 100 : 0;
    else if (typeof oldFeatures.grayscale === "boolean") features.monochrome = oldFeatures.grayscale ? 100 : 0;

    if (typeof oldFeatures.upsideDownMedia === "boolean") features.upsideDownMedia = oldFeatures.upsideDownMedia;
    if (typeof oldFeatures.blurThumbnails === "boolean") features.blurThumbnails = oldFeatures.blurThumbnails;
    if (typeof oldFeatures.stripMedia === "boolean") features.stripMedia = oldFeatures.stripMedia;

    const oldHideEngagement = typeof oldFeatures.hideEngagement === "boolean"
      ? oldFeatures.hideEngagement
      : typeof raw.hideEngagement === "boolean" ? raw.hideEngagement : undefined;
    if (typeof oldHideEngagement === "boolean") {
      features.hideNotificationBadges = oldHideEngagement;
      features.hideEngagementCounts = oldHideEngagement;
    }

    // The old Essential profile maps to the new explicit media-removal toggle.
    if (oldMode === "essential") features.stripMedia = true;
    next.features = { ...oldFeatures, ...features };
    next.siteSettings = { ...(raw.siteSettings || {}) };
    const legacyYouTube = next.siteSettings.youtube || {};
    if (
      typeof legacyYouTube.sabotageOpenedVideos === "undefined" &&
      typeof legacyYouTube.keepPlayerNormal === "boolean"
    ) {
      next.siteSettings.youtube = {
        ...legacyYouTube,
        sabotageOpenedVideos: !legacyYouTube.keepPlayerNormal
      };
    }
    return next;
  }

  function mergeSettings(raw = {}) {
    const value = migrateLegacy(raw);
    const defaults = cloneDefaults();
    const features = { ...defaults.features, ...(value.features || {}) };
    for (const key of FEATURE_KEYS) {
      if (key === "monochrome") features[key] = asPercent(features[key], defaults.features[key]);
      else features[key] = asBoolean(features[key], defaults.features[key]);
    }
    for (const key of Object.keys(features)) {
      if (!FEATURE_KEYS.includes(key)) delete features[key];
    }

    const sites = { ...defaults.sites, ...(value.sites || {}) };
    for (const site of Object.keys(defaults.sites)) sites[site] = asBoolean(sites[site], defaults.sites[site]);

    const siteSettings = {};
    for (const [site, siteDefaults] of Object.entries(DEFAULT_SITE_SETTINGS)) {
      const incoming = value.siteSettings?.[site] || {};
      siteSettings[site] = {};
      for (const key of Object.keys(siteDefaults)) {
        siteSettings[site][key] = asBoolean(incoming[key], siteDefaults[key]);
      }
    }

    const merged = {
      ...defaults,
      ...value,
      enabled: asBoolean(value.enabled, defaults.enabled),
      sites,
      features,
      siteSettings
    };
    merged.lockUntil = Number(merged.lockUntil) || 0;
    merged.bypassUntil = Number(merged.bypassUntil) || 0;
    merged.bypassCooldownHours = [1, 2, 5, 24].includes(Number(value.bypassCooldownHours))
      ? Number(value.bypassCooldownHours)
      : defaults.bypassCooldownHours;
    merged.bypassDurationMinutes = defaults.bypassDurationMinutes;
    merged.bypassLastGrantedAt = Math.max(0, Number(value.bypassLastGrantedAt) || 0);

    // Keep removed prototype fields from reappearing in the live settings
    // object. They can remain in storage until the next normal save.
    for (const key of [
      "mode",
      "intensity",
      "mediaGrayscale",
      "randomColors",
      "hideEngagement",
      "stopAutoplay",
      "reduceMotion",
      "youtubeProtectEducational",
      "youtubeExceptions",
      "feedBatches",
      "feedBatchSize",
      "feedLoadDelay",
      "scrollGate",
      "scrollLimit",
      "bypassUsedOn",
      "bypassCount"
    ]) delete merged[key];
    return merged;
  }

  function getSiteFromUrl(url = "") {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const path = parsed.pathname || "/";
      const isHostOrSubdomain = (domain) => host === domain || host.endsWith(`.${domain}`);
      if (isHostOrSubdomain("instagram.com")) return "instagram";
      if (isHostOrSubdomain("discord.com") || isHostOrSubdomain("discordapp.com")) return "discord";
      if (isHostOrSubdomain("reddit.com")) return "reddit";
      if (isHostOrSubdomain("youtube.com")) return "youtube";
      if (isHostOrSubdomain("tiktok.com")) return "tiktok";
      if (isHostOrSubdomain("twitch.tv")) return "twitch";
      if (isHostOrSubdomain("x.com") || isHostOrSubdomain("twitter.com")) return "x";
      if (isHostOrSubdomain("facebook.com")) return "facebook";
      if (/^(?:www\.)?google\.(?:com|ca)$/.test(host) && (path === "/" || path.startsWith("/search") || path.startsWith("/webhp"))) return "google";
      if (/^(?:news|images)\.google\.(?:com|ca)$/.test(host)) return "google";
      if (isHostOrSubdomain("pinterest.com")) return "pinterest";
      if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
      if (isHostOrSubdomain("threads.net") || isHostOrSubdomain("threads.com")) return "threads";
      if (isHostOrSubdomain("snapchat.com")) return "snapchat";
      if (host === "web.whatsapp.com") return "whatsapp";
      if (isHostOrSubdomain("messenger.com")) return "messenger";
    } catch (_) {
      // Unsupported or unavailable tab URL.
    }
    return null;
  }

  function dayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  function isLocked(settings, now = Date.now()) {
    return Number(settings?.lockUntil) > now;
  }

  function isBypassed(settings, site, now = Date.now()) {
    return Boolean(site && settings?.bypassSite === site && Number(settings?.bypassUntil) > now);
  }

  function getBypassAvailableAt(settings) {
    const lastGrantedAt = Number(settings?.bypassLastGrantedAt) || 0;
    const cooldownHours = Number(settings?.bypassCooldownHours) || DEFAULT_SETTINGS.bypassCooldownHours;
    return lastGrantedAt ? lastGrantedAt + cooldownHours * 60 * 60 * 1000 : 0;
  }

  function isBypassAvailable(settings, now = Date.now()) {
    return getBypassAvailableAt(settings) <= now;
  }

  function isActiveForSite(settings, site, now = Date.now()) {
    return Boolean(site && settings?.enabled && settings?.sites?.[site] && !isBypassed(settings, site, now));
  }

  function isWeakeningChange(previous, next) {
    if (!previous || !next) return false;
    if (previous.enabled && !next.enabled) return true;
    for (const site of Object.keys(DEFAULT_SETTINGS.sites)) {
      if (previous.sites?.[site] && !next.sites?.[site]) return true;
    }
    if (Number(next.features?.monochrome) < Number(previous.features?.monochrome)) return true;
    if (Number(next.bypassCooldownHours) < Number(previous.bypassCooldownHours)) return true;
    for (const feature of FEATURE_KEYS.filter((key) => key !== "monochrome")) {
      if (previous.features?.[feature] && !next.features?.[feature]) return true;
    }
    for (const [site, keys] of Object.entries(SITE_SETTING_KEYS)) {
      for (const key of keys) {
        const previousValue = Boolean(previous.siteSettings?.[site]?.[key]);
        const nextValue = Boolean(next.siteSettings?.[site]?.[key]);
        if (previousValue && !nextValue) return true;
      }
    }
    return Number(next.lockUntil) < Number(previous.lockUntil) && isLocked(previous);
  }

  function formatUntil(timestamp) {
    if (!timestamp) return "Not locked";
    const date = new Date(timestamp);
    return `Locked until ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }

  globalThis.UnaddictifySettings = {
    DEFAULT_SETTINGS,
    DEFAULT_LOCK_DURATION_HOURS,
    DEFAULT_SITE_SETTINGS,
    FEATURE_KEYS,
    SITE_LABELS,
    YOUTUBE_FOCUS_APPROVALS_KEY,
    cloneDefaults,
    mergeSettings,
    getSiteFromUrl,
    getYouTubeVideoId,
    dayKey,
    isLocked,
    isBypassed,
    getBypassAvailableAt,
    isBypassAvailable,
    isActiveForSite,
    isWeakeningChange,
    normalizeYouTubeFocusApprovals,
    getYouTubeFocusApprovalMode,
    isYouTubeVideoApproved,
    addYouTubeFocusApproval,
    formatUntil,
    asPercent
  };
})();
