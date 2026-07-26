(() => {
  const U = globalThis.UnaddictifySettings;
  let currentSite = U.getSiteFromUrl(location.href);

  // Keep the first paint neutral while settings and the current route resolve.
  // The lifecycle must remain installed even on a matched but unsupported path
  // so SPA navigation can later enter a supported surface.
  document.documentElement.classList.add("unaddictify-pending");

  const SITE_SETTING_CLASS_MAP = {
    instagram: { hideReels: "unaddictify-instagram-hide-reels", hideComments: "unaddictify-instagram-hide-comments" },
    discord: { hideMedia: "unaddictify-discord-hide-media" },
    reddit: { hideComments: "unaddictify-reddit-hide-comments" },
    youtube: {
      hideShortsTab: "unaddictify-youtube-hide-shorts-tab",
      hideComments: "unaddictify-youtube-hide-comments",
      requireVideoApproval: "unaddictify-youtube-require-video-approval",
      sabotageOpenedVideos: "unaddictify-youtube-sabotage-opened-videos"
    },
    tiktok: {
      hideLiveTab: "unaddictify-tiktok-hide-live-tab",
      hideShopTab: "unaddictify-tiktok-hide-shop-tab",
      hideComments: "unaddictify-tiktok-hide-comments"
    },
    twitch: {
      hideDiscovery: "unaddictify-twitch-hide-discovery",
      hideClips: "unaddictify-twitch-hide-clips",
      hideChat: "unaddictify-twitch-hide-chat"
    },
    x: {
      hideExplore: "unaddictify-x-hide-explore",
      hideSuggestedPosts: "unaddictify-x-hide-suggested-posts",
      hideForYouTab: "unaddictify-x-hide-for-you-tab"
    },
    facebook: {
      hideReels: "unaddictify-facebook-hide-reels",
      hideWatch: "unaddictify-facebook-hide-watch",
      hideStories: "unaddictify-facebook-hide-stories",
      hideSuggestedPosts: "unaddictify-facebook-hide-suggested-posts"
    },
    google: {
      hideDoodles: "unaddictify-google-hide-doodles",
      hideTrendingSearches: "unaddictify-google-hide-trending",
      hideDiscover: "unaddictify-google-hide-discover",
      hideNewsPanels: "unaddictify-google-hide-news"
    },
    pinterest: {
      hideRecommendations: "unaddictify-pinterest-hide-recommendations",
      hideRelatedPins: "unaddictify-pinterest-hide-related",
      hideSaveCounts: "unaddictify-pinterest-hide-save-counts"
    },
    threads: {
      hideForYouTab: "unaddictify-threads-hide-for-you-tab",
      hideSuggestedPosts: "unaddictify-threads-hide-suggested-posts"
    },
    snapchat: {
      hideSpotlight: "unaddictify-snapchat-hide-spotlight",
      hideDiscover: "unaddictify-snapchat-hide-discover",
      hideStories: "unaddictify-snapchat-hide-stories"
    },
    whatsapp: {
      hideStatus: "unaddictify-whatsapp-hide-status",
      hideChannels: "unaddictify-whatsapp-hide-channels"
    },
    messenger: {
      hideStories: "unaddictify-messenger-hide-stories",
      hideSuggestedContent: "unaddictify-messenger-hide-suggested"
    }
  };

  const SITE_SETTING_CLASSES = Object.values(SITE_SETTING_CLASS_MAP).flatMap((values) => Object.values(values));

  const ROOT_CLASSES = [
    "unaddictify-active",
    "unaddictify-site-instagram",
    "unaddictify-site-discord",
    "unaddictify-site-reddit",
    "unaddictify-site-youtube",
    "unaddictify-site-tiktok",
    "unaddictify-site-twitch",
    "unaddictify-site-x",
    "unaddictify-site-facebook",
    "unaddictify-site-google",
    "unaddictify-site-pinterest",
    "unaddictify-site-linkedin",
    "unaddictify-site-threads",
    "unaddictify-site-snapchat",
    "unaddictify-site-whatsapp",
    "unaddictify-site-messenger",
    "unaddictify-youtube-shorts",
    "unaddictify-youtube-video-approved",
    "unaddictify-monochrome",
    "unaddictify-upside-down-media",
    "unaddictify-blur-thumbnails",
    "unaddictify-hide-notification-badges",
    "unaddictify-hide-engagement-counts",
    "unaddictify-strip-media",
    "unaddictify-hide-profile-media",
    "unaddictify-instagram-hide-reels",
    "unaddictify-instagram-hide-comments",
    "unaddictify-discord-hide-media",
    "unaddictify-reddit-hide-comments",
    "unaddictify-youtube-hide-shorts-tab",
    "unaddictify-youtube-hide-comments",
    "unaddictify-youtube-require-video-approval",
    // Kept only so a page that was already running an older content script is
    // cleaned up correctly after the LinkedIn options are removed.
    "unaddictify-linkedin-hide-suggested-posts",
    "unaddictify-linkedin-hide-people-suggestions",
    "unaddictify-linkedin-hide-celebrations",
    ...SITE_SETTING_CLASSES
  ];

  const ROOT_FEATURE_CLASSES = {
    upsideDownMedia: "unaddictify-upside-down-media",
    blurThumbnails: "unaddictify-blur-thumbnails",
    hideNotificationBadges: "unaddictify-hide-notification-badges",
    hideEngagementCounts: "unaddictify-hide-engagement-counts",
    stripMedia: "unaddictify-strip-media",
    hideProfileMedia: "unaddictify-hide-profile-media"
  };

  const CARD_SELECTOR = [
    "article",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "yt-lockup-view-model",
    "ytm-rich-item-renderer",
    "ytm-video-with-context-renderer",
    "ytm-compact-video-renderer",
    "ytm-shorts-lockup-view-model",
    "yt-thumbnail-view-model",
    "[data-testid='post-container']",
    "shreddit-post",
    "div[role='article']",
    "[data-e2e='recommend-list-item-container']",
    "[data-e2e='video-item']",
    "[data-e2e='browse-card']",
    "[data-a-target='preview-card']",
    "[data-a-target='preview-card-image-link']",
    "[data-testid='cellInnerDiv']",
    "[data-testid='tweet']",
    "[data-testid='pin']",
    "[data-testid='pinWrapper']",
    ".feed-shared-update-v2",
    "[class*='feed-shared-update' i]",
    "[class*='update-components' i]",
    "[data-urn*='activity']",
    "[data-testid='post-container']",
    "[data-testid='msg-container']",
    "[data-testid='conversation-panel-messages']",
    "[class*='messageListItem']",
    "[data-list-item-id^='chat-messages']",
    "li[class*='message']"
  ].join(",");

  const MEDIA_WRAPPER_SELECTOR = [
    "[class*='thumbnail' i]",
    "[class*='media' i]",
    "[class*='attachment' i]",
    "[class*='visualMedia' i]",
    "[class*='imageWrapper' i]",
    "[class*='imageContainer' i]",
    "[class*='embedMedia' i]",
    "[data-testid*='media' i]",
    "[data-test-id*='media' i]"
  ].join(",");

  const SITE_MEDIA_FALLBACK_SELECTORS = {
    discord: [
      "[class*='attachment' i] img",
      "[class*='attachment' i] video",
      "[class*='visualMedia' i] img",
      "[class*='visualMedia' i] video",
      "[class*='imageWrapper' i] img",
      "[class*='imageWrapper' i] video",
      "[class*='embedMedia' i] img",
      "[class*='embedMedia' i] video"
    ],
    linkedin: [
      "[class*='feed-shared' i] img",
      "[class*='feed-shared' i] video",
      "[class*='update-components' i] img",
      "[class*='update-components' i] video",
      "[data-urn*='activity' i] img",
      "[data-urn*='activity' i] video",
      "img[src*='licdn.com' i]",
      "img[srcset*='licdn.com' i]"
    ]
  };

  const MEDIA_SURFACE_SELECTOR = [
    ".ytp-cued-thumbnail-overlay-image",
    ".ytp-thumbnail-overlay-image",
    "article [style*='background-image' i]",
    "[role='article'] [style*='background-image' i]",
    "[class*='thumbnail' i][style*='background-image' i]",
    "[class*='media' i][style*='background-image' i]",
    "[role='img'][style*='background-image' i]",
    "[class*='attachment' i] [style*='background-image' i]",
    "[class*='media' i] [style*='background-image' i]",
    "[data-testid='post-container'] [style*='background-image' i]",
    "[data-e2e='video-item'] [style*='background-image' i]",
    "[data-a-target='preview-card'] [style*='background-image' i]",
    "[data-testid='pin'] [style*='background-image' i]"
  ].join(",");

  const CARD_ONLY_IMAGE_SITES = new Set([
    "tiktok",
    "twitch",
    "x",
    "facebook",
    "google",
    "pinterest",
    "linkedin",
    "threads",
    "snapchat",
    "whatsapp",
    "messenger"
  ]);

  const BADGE_DESCENDANT_SELECTOR = [
    "[class~='badge' i]",
    "[class~='dot' i]",
    "[class~='unread' i]",
    "[class~='mention' i]",
    "[class~='notification-badge' i]",
    "[class~='notificationBadge' i]",
    "[class~='unread-badge' i]",
    "[class~='unreadBadge' i]",
    "[class~='mention-badge' i]",
    "[class~='mentionBadge' i]",
    "[data-badge]",
    "[data-unread-count]"
  ].join(",");

  const GENERIC_BADGE_SELECTORS = [
    "[class~='notificationBadge' i]",
    "[class~='notification-badge' i]",
    "[class~='notificationCount' i]",
    "[class~='notification-count' i]",
    "[class~='notification-dot' i]",
    "[class~='unreadBadge' i]",
    "[class~='unread-badge' i]",
    "[class~='unreadCount' i]",
    "[class~='unread-count' i]",
    "[class~='unread-dot' i]",
    "[class~='mentionBadge' i]",
    "[data-badge]",
    "[data-unread-count]"
  ];

  const BADGE_SELECTORS = {
    instagram: [
      "[aria-label*='unread' i]",
      "[aria-label*='notification' i]",
      "[aria-label*='mention' i]",
      "[class~='notificationBadge' i]",
      "[class~='notification-dot' i]",
      "[class~='notificationCount' i]",
      "[class~='unreadCount' i]"
    ],
    reddit: [
      "[aria-label*='notification' i]",
      "[aria-label*='mention' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationCount' i]",
      "[class~='unreadBadge' i]",
      "[class~='unreadCount' i]"
    ],
    youtube: [
      "[aria-label*='notification' i]",
      "[aria-label*='mention' i]",
      "[class~='notificationBadge' i]",
      "[class~='notification-dot' i]",
      "[class~='notificationCount' i]"
    ],
    discord: [
      "[aria-label*='unread' i]",
      "[aria-label*='mention' i]",
      "[class~='numberBadge' i]",
      "[class~='mentionBadge' i]",
      "[class~='unreadBadge' i]",
      "[class~='unreadCount' i]"
    ],
    tiktok: [
      "[aria-label*='notification' i]",
      "[aria-label*='inbox' i]",
      "[class~='badge' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]"
    ],
    twitch: [
      "[aria-label*='notification' i]",
      "[aria-label*='unread' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class~='badge' i]"
    ],
    x: [
      "[aria-label*='notification' i]",
      "[aria-label*='message' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class~='badge' i]",
      "[data-testid='AppTabBar_Notifications_Link'] span"
    ],
    facebook: [
      "[aria-label*='notification' i]",
      "[aria-label*='unread' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class~='badge' i]"
    ],
    google: [
      "[aria-label*='notification' i]",
      "[aria-label*='unread' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class~='badge' i]"
    ],
    pinterest: [
      "[aria-label*='notification' i]",
      "[aria-label*='message' i]",
      "[class~='badge' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]"
    ],
    linkedin: [
      "[aria-label*='notification' i]",
      "[aria-label*='unread' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class~='badge' i]",
      "[class*='global-nav__primary-link--notifications' i]",
      "a[href*='/notifications' i]"
    ],
    threads: [
      "[aria-label*='notification' i]",
      "[aria-label*='activity' i]",
      "[class~='badge' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]"
    ],
    snapchat: [
      "[aria-label*='notification' i]",
      "[aria-label*='message' i]",
      "[class~='badge' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]"
    ],
    whatsapp: [
      "[aria-label*='unread' i]",
      "[aria-label*='notification' i]",
      "[class~='badge' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class*='unread' i]"
    ],
    messenger: [
      "[aria-label*='unread' i]",
      "[aria-label*='notification' i]",
      "[class~='badge' i]",
      "[class~='notification-badge' i]",
      "[class~='notificationBadge' i]",
      "[class*='unread' i]"
    ]
  };

  const SHORTS_TAB_SELECTORS = [
    "a[href='/shorts']",
    "a[href='/shorts/']",
    "a[href^='/shorts?']",
    "[role='tab']",
    "yt-chip-cloud-chip-renderer",
    "ytm-search-filter-chip-renderer",
    "yt-search-filter-chip-renderer",
    "tp-yt-paper-tab",
    "ytd-guide-entry-renderer",
    "ytd-mini-guide-entry-renderer"
  ];

  const ENGAGEMENT_PATTERN = /\b\d[\d,.]*\s*(?:[KMB]+)?\s*(likes?|comments?|views?|followers?|following?|subscribers?|members?|votes?|shares?|reposts?|reactions?|saves?|upvotes?|points?|ratings?)\b/i;
  const COUNT_ONLY_PATTERN = /^\s*\d[\d,.]*\s*(?:[KMB]+)?\s*$/i;
  const DISCOVERY_COPY_PATTERN = /\b(?:recommended|suggested|for you|you might like|more like this|people you may know|who to follow|trending|discover|recommended for you|sponsored)\b/i;
  const DISCOVERY_TARGET_SELECTOR = [
    "[data-a-target='preview-card']",
    "[data-a-target='side-nav-card']",
    "[data-a-target='recommendations']",
    "[data-a-target='recommended-channels']",
    "[data-a-target='followed-channels']",
    "[data-testid*='recommend' i]",
    "[data-testid*='suggest' i]",
    "[data-pagelet*='suggest' i]",
    "[data-attrid]"
  ].join(",");
  const DISCOVERY_SCOPE_SELECTOR = `${DISCOVERY_TARGET_SELECTOR}, section, [role='region']`;
  const DISCOVERY_TEXT_SELECTOR = "a, li, h5, h6, span, div, p, small, label";
  const MUTATION_ATTRIBUTE_SCOPE_SELECTOR = [
    CARD_SELECTOR,
    DISCOVERY_TARGET_SELECTOR,
    "nav",
    "header",
    "[role='banner']",
    "[role='navigation']",
    "[role='tablist']",
    "[aria-label*='notification' i]",
    "[aria-label*='unread' i]",
    "[aria-label*='mention' i]"
  ].join(",");
  const MUTATION_CONTENT_SELECTOR = [
    CARD_SELECTOR,
    "img, video, canvas",
    "[role='img']",
    MEDIA_WRAPPER_SELECTOR,
    MEDIA_SURFACE_SELECTOR,
    DISCOVERY_TARGET_SELECTOR,
    "section, [role='region']",
    "h1, h2, h3, h4, h5, h6, [role='heading'], [aria-label], [title]",
    "nav a, header a, [role='tab']",
    "[aria-label*='notification' i], [aria-label*='unread' i], [aria-label*='mention' i]"
  ].join(",");
  const MUTATION_NESTED_ANCESTOR_SELECTOR = [
    "nav a",
    "header a",
    "[role='tab']",
    "h1, h2, h3, h4, h5, h6, [role='heading']",
    "[aria-label]",
    "[title]",
    "[data-testid*='recommend' i]",
    "[data-testid*='suggest' i]",
    "[data-pagelet*='suggest' i]",
    "[data-a-target]"
  ].join(",");
  const RESCAN_ATTRIBUTES = new Set([
    "aria-label", "title", "href", "data-testid", "data-test-id", "data-e2e",
    "data-a-target", "data-pagelet", "data-attrid", "data-list-item-id"
  ]);

  let settings = U.mergeSettings(U.cloneDefaults());
  let active = false;
  let observedUrl = location.href;
  let originalPushState = null;
  let originalReplaceState = null;
  let observer = null;
  let scanTimer = null;
  let scanIdleHandle = null;
  let bypassTimer = null;
  let focusLockTimer = null;
  let youtubeGateFrame = null;
  let youtubeGate = null;
  let youtubeGateRestoreFocus = null;
  let youtubeApprovedPlayer = null;
  let youtubeFocusApprovals = U.normalizeYouTubeFocusApprovals();
  const youtubeOpenedVideoChoices = new Map();
  let pendingDocumentScan = false;
  const MAX_PENDING_ROOTS = 96;
  const ROOTS_PER_SCAN = 24;
  const pendingRoots = new Set();
  const touched = new Set();
  const originalText = new WeakMap();
  const originalAria = new WeakMap();

  function addClass(element, className) {
    if (!element?.classList) return;
    element.classList.add(className);
    touched.add(element);
  }

  function queryWithin(root, selector) {
    const descendants = root?.querySelectorAll?.(selector) || [];
    return root?.matches?.(selector) ? [root, ...descendants] : descendants;
  }

  function isShortsPage() {
    return currentSite === "youtube" && (location.pathname === "/shorts" || location.pathname.startsWith("/shorts/"));
  }

  function isYouTubeShortsMedia(element) {
    if (currentSite !== "youtube") return false;
    return Boolean(
      (isShortsPage() && element.matches?.("video")) ||
      element.closest?.("ytd-reel-video-renderer, ytd-reel-item-renderer, ytd-shorts, a[href*='/shorts/']")
    );
  }

  function currentYouTubeVideoId() {
    return currentSite === "youtube" && !isShortsPage() ? U.getYouTubeVideoId(location.href) : "";
  }

  function getYouTubeGateMode(videoId = currentYouTubeVideoId()) {
    if (!active || !videoId) return "";
    if (U.isLocked(settings)) {
      if (!settings.siteSettings.youtube.requireVideoApproval) return "";
      return U.isYouTubeVideoApproved(settings, youtubeFocusApprovals, videoId) ? "" : "focus";
    }
    if (!settings.siteSettings.youtube.sabotageOpenedVideos) return "";
    return youtubeOpenedVideoChoices.has(videoId) ? "" : "opened";
  }

  function shouldGateYouTubeVideo(videoId = currentYouTubeVideoId()) {
    return Boolean(getYouTubeGateMode(videoId));
  }

  function getYouTubePlaybackMode(videoId) {
    if (U.isLocked(settings)) return U.getYouTubeFocusApprovalMode(youtubeFocusApprovals, videoId);
    return youtubeOpenedVideoChoices.get(videoId) || "";
  }

  function formatVideoDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours} hr${hours === 1 ? "" : "s"}${minutes ? ` ${minutes} min` : ""}` : `${minutes} min`;
  }

  function getYouTubeVideoDetails(player) {
    const rawTitle = document.querySelector(
      "ytd-watch-metadata h1 yt-formatted-string, ytd-watch-flexy h1 yt-formatted-string, #title h1"
    )?.textContent || document.title.replace(/\s*-\s*YouTube\s*$/i, "");
    const channel = document.querySelector(
      "ytd-watch-metadata ytd-channel-name a, ytd-video-owner-renderer ytd-channel-name a, #owner-name a"
    )?.textContent || "";
    const duration = formatVideoDuration(player?.querySelector("video")?.duration);
    return {
      title: rawTitle.replace(/\s+/g, " ").trim() || "This video",
      meta: [channel.replace(/\s+/g, " ").trim(), duration].filter(Boolean).join(" · ")
    };
  }

  function focusWithoutScroll(element) {
    if (!element?.isConnected || typeof element.focus !== "function") return false;
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      element.focus();
    }
    return true;
  }

  function removeYouTubeGate({ restoreFocus = true } = {}) {
    const restore = youtubeGateRestoreFocus;
    const player = youtubeGate?.parentElement;
    const hadGate = Boolean(youtubeGate);
    youtubeGate?.remove();
    youtubeGate = null;
    youtubeGateRestoreFocus = null;
    if (!restoreFocus || (!hadGate && !restore)) return;
    if (focusWithoutScroll(restore)) return;
    const fallback = player?.querySelector?.("video") || player || document.body;
    focusWithoutScroll(fallback);
  }

  function clearStaleYouTubeFocusApprovals() {
    if (!youtubeFocusApprovals.lockUntil) return;
    const currentLockUntil = U.isLocked(settings) ? Number(settings.lockUntil) : 0;
    if (youtubeFocusApprovals.lockUntil === currentLockUntil) return;
    youtubeFocusApprovals = U.normalizeYouTubeFocusApprovals();
    chrome.storage.local.remove(U.YOUTUBE_FOCUS_APPROVALS_KEY).catch(() => {});
  }

  function setApprovedYouTubePlayer(player = null) {
    if (youtubeApprovedPlayer && youtubeApprovedPlayer !== player) {
      youtubeApprovedPlayer.classList.remove("unaddictify-approved-player");
    }
    youtubeApprovedPlayer = player;
    youtubeApprovedPlayer?.classList.add("unaddictify-approved-player");
    document.documentElement.classList.toggle("unaddictify-youtube-video-approved", Boolean(player));
  }

  function createYouTubeGate(player, videoId, gateMode) {
    const frictionAvailable = Boolean(settings.siteSettings.youtube.sabotageOpenedVideos);
    const focusGate = gateMode === "focus";
    const gate = document.createElement("div");
    gate.className = "unaddictify-youtube-focus-gate";
    gate.dataset.frictionAvailable = String(frictionAvailable);
    gate.dataset.gateMode = gateMode;
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "unaddictify-youtube-gate-title");
    gate.setAttribute("aria-describedby", "unaddictify-youtube-gate-description");
    gate.tabIndex = -1;

    const sheet = document.createElement("div");
    sheet.className = "unaddictify-youtube-focus-sheet";

    const eyebrow = document.createElement("p");
    eyebrow.className = "unaddictify-youtube-focus-eyebrow";
    eyebrow.textContent = focusGate ? "Focus check" : "A quick check";

    const heading = document.createElement("h2");
    heading.id = "unaddictify-youtube-gate-title";
    heading.textContent = "Is this video educational?";

    const details = getYouTubeVideoDetails(player);
    const title = document.createElement("p");
    title.className = "unaddictify-youtube-focus-title";
    title.textContent = details.title;

    const meta = document.createElement("p");
    meta.className = "unaddictify-youtube-focus-meta";
    meta.textContent = details.meta;
    meta.hidden = !details.meta;

    const description = document.createElement("p");
    description.id = "unaddictify-youtube-gate-description";
    description.className = "unaddictify-youtube-focus-description";
    description.setAttribute("aria-live", "polite");
    description.textContent = focusGate
      ? frictionAvailable
        ? "If it is educational, let it play normally. Otherwise, keep your chosen friction in place."
        : "Choose whether to play it normally or leave it paused. This choice applies only to this video until Focus Lock ends."
      : frictionAvailable
        ? "If it is educational, let it play normally. Otherwise, keep your chosen friction in place for this video."
        : "Choose whether to play it normally or leave it paused for this video.";

    const actions = document.createElement("div");
    actions.className = "unaddictify-youtube-focus-actions";
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "Choose how to watch this video");

    const approve = async (mode, button) => {
      if (button.disabled) return;
      const buttons = [...actions.querySelectorAll(".unaddictify-youtube-focus-button")];
      buttons.forEach((item) => { item.disabled = true; });
      button.textContent = "Opening…";
      const previous = youtubeFocusApprovals;
      let next = null;
      if (focusGate) {
        next = U.addYouTubeFocusApproval(previous, settings.lockUntil, videoId, mode);
        youtubeFocusApprovals = next;
      } else {
        youtubeOpenedVideoChoices.set(videoId, mode);
      }
      syncYouTubeFocusGate();
      const playPromise = player.querySelector("video")?.play?.();
      playPromise?.catch?.(() => {});
      if (!focusGate) return;
      try {
        await chrome.storage.local.set({ [U.YOUTUBE_FOCUS_APPROVALS_KEY]: next });
      } catch (_) {
        youtubeFocusApprovals = previous;
        syncYouTubeFocusGate();
      }
    };

    const createChoiceButton = (label, mode, style = "") => {
      const button = document.createElement("button");
      button.className = `unaddictify-youtube-focus-button${style ? ` ${style}` : ""}`;
      button.type = "button";
      button.textContent = label;
      button.dataset.defaultLabel = label;
      button.addEventListener("click", () => approve(mode, button));
      return button;
    };

    actions.append(
      createChoiceButton("Yes — play normally", "normal"),
      ...(frictionAvailable
        ? [createChoiceButton("Keep it less rewarding", "friction", "unaddictify-youtube-focus-button-secondary")]
        : [])
    );

    const keepPausedButton = document.createElement("button");
    keepPausedButton.className = "unaddictify-youtube-focus-button unaddictify-youtube-focus-button-tertiary";
    keepPausedButton.type = "button";
    keepPausedButton.textContent = "Keep it paused";
    keepPausedButton.addEventListener("click", () => {
      if (keepPausedButton.disabled) return;
      keepPausedButton.disabled = true;
      keepPausedButton.textContent = "Video will stay paused";
      gate.classList.add("unaddictify-youtube-focus-kept-paused");
      description.textContent = "The video will stay paused. Choose a viewing mode whenever you are ready.";
      actions.querySelector("button:not(:disabled)")?.focus?.({ preventScroll: true });
    });
    actions.append(keepPausedButton);

    gate.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        keepPausedButton.click();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...gate.querySelectorAll("button:not(:disabled)")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    sheet.append(eyebrow, heading, title, meta, description, actions);
    gate.append(sheet);
    return gate;
  }

  function syncYouTubeFocusGate() {
    if (currentSite !== "youtube") {
      removeYouTubeGate({ restoreFocus: true });
      setApprovedYouTubePlayer();
      return;
    }

    const player = document.querySelector("#movie_player");
    const videoId = currentYouTubeVideoId();
    if (!player || !videoId || !active) {
      removeYouTubeGate({ restoreFocus: true });
      setApprovedYouTubePlayer();
      return;
    }

    const gateMode = getYouTubeGateMode(videoId);
    if (!gateMode) {
      removeYouTubeGate({ restoreFocus: true });
      const playbackMode = getYouTubePlaybackMode(videoId);
      const restoreNormalPlayer = !settings.siteSettings.youtube.sabotageOpenedVideos || playbackMode === "normal";
      setApprovedYouTubePlayer(restoreNormalPlayer ? player : null);
      return;
    }

    setApprovedYouTubePlayer();
    for (const video of player.querySelectorAll("video")) video.pause();
    const frictionAvailable = Boolean(settings.siteSettings.youtube.sabotageOpenedVideos);
    if (
      !youtubeGate ||
      youtubeGate.parentElement !== player ||
      youtubeGate.dataset.videoId !== videoId ||
      youtubeGate.dataset.gateMode !== gateMode ||
      youtubeGate.dataset.frictionAvailable !== String(frictionAvailable)
    ) {
      const previousFocus = document.activeElement;
      const focusToRestore = previousFocus && !youtubeGate?.contains(previousFocus) ? previousFocus : null;
      removeYouTubeGate({ restoreFocus: false });
      youtubeGateRestoreFocus = focusToRestore;
      youtubeGate = createYouTubeGate(player, videoId, gateMode);
      youtubeGate.dataset.videoId = videoId;
      player.append(youtubeGate);
      youtubeGate.querySelector(".unaddictify-youtube-focus-button")?.focus?.({ preventScroll: true });
    } else {
      const details = getYouTubeVideoDetails(player);
      const title = youtubeGate.querySelector(".unaddictify-youtube-focus-title");
      const meta = youtubeGate.querySelector(".unaddictify-youtube-focus-meta");
      if (title) title.textContent = details.title;
      if (meta) {
        meta.textContent = details.meta;
        meta.hidden = !details.meta;
      }
    }
  }

  function scheduleYouTubeGateSync() {
    if (youtubeGateFrame !== null) return;
    youtubeGateFrame = window.requestAnimationFrame(() => {
      youtubeGateFrame = null;
      syncYouTubeFocusGate();
    });
  }

  function guardYouTubePlayback(event) {
    if (event.target?.matches?.("video") && shouldGateYouTubeVideo()) {
      event.target.pause();
      scheduleYouTubeGateSync();
    }
  }

  function rememberText(node) {
    const state = originalText.get(node);
    if (!state) originalText.set(node, { original: node.nodeValue, masked: "" });
    else if (node.nodeValue !== state.masked) {
      state.original = node.nodeValue;
      state.masked = "";
    }
    touched.add(node);
  }

  function rememberAria(element) {
    const value = element.getAttribute("aria-label");
    const state = originalAria.get(element);
    if (!state) originalAria.set(element, { original: value, masked: "" });
    else if (value !== state.masked) {
      state.original = value;
      state.masked = "";
    }
    touched.add(element);
  }

  function isProfileMedia(element) {
    if (!element?.matches?.("img")) return false;
    if (isDiscordProfileImage(element)) return true;
    const source = [
      element.currentSrc,
      element.src,
      element.getAttribute("src"),
      element.getAttribute("srcset"),
      element.getAttribute("data-src"),
      element.getAttribute("data-lazy-src")
    ].filter(Boolean).join(" ");
    const alt = element.getAttribute("alt") || "";
    if (currentSite === "linkedin" &&
      /(?:licdn\.com|linkedin\.com\/dms\/image)/i.test(source) &&
      !element.closest(`${CARD_SELECTOR}, ${MEDIA_WRAPPER_SELECTOR}`)) return true;
    return Boolean(
      /(?:avatar|profile picture|profile photo|headshot|portrait)/i.test(alt) ||
      element.closest(
        "[class*='avatar' i], [class*='profile' i], [data-testid*='avatar' i], [data-testid*='profile' i], [aria-label*='avatar' i], [aria-label*='profile picture' i]"
      )
    );
  }

  function isVisualImage(element) {
    if (element.matches("canvas")) return Boolean(element.closest(`${CARD_SELECTOR}, ${MEDIA_WRAPPER_SELECTOR}`));
    if (element.matches("video")) {
      return Boolean(
        element.closest(`${CARD_SELECTOR}, ${MEDIA_WRAPPER_SELECTOR}`) ||
        (currentSite === "youtube" && element.closest("#movie_player") && settings.siteSettings.youtube.sabotageOpenedVideos)
      );
    }
    if (!element.matches("img")) return false;
    if (isProfileMedia(element)) return Boolean(settings.features.hideProfileMedia);
    if (isDiscordEmoji(element)) return false;
    if (element.closest("header, nav, [role='banner'], [role='navigation'], button, [role='button']")) return false;
    if (isYouTubeShortsMedia(element) || element.closest(CARD_SELECTOR)) return true;
    if (currentSite === "linkedin" &&
      element.closest(".feed-shared-update-v2, [class*='feed-shared' i], [class*='update-components' i], [data-urn*='activity' i]")) return true;
    // Search chrome, chat avatars, and utility logos should not be treated as
    // feed media just because they happen to be large images. A semantic media
    // wrapper is enough to include sites whose card markup is less stable.
    if (element.closest(`${MEDIA_WRAPPER_SELECTOR}, [role='img']`)) return true;
    if (CARD_ONLY_IMAGE_SITES.has(currentSite)) return false;
    return (element.naturalWidth || 0) >= 160 || (element.width || 0) >= 160;
  }

  function isDiscordProfileImage(element) {
    if (currentSite !== "discord" || !element?.matches?.("img")) return false;
    const source = [
      element.currentSrc,
      element.src,
      element.getAttribute("src"),
      element.getAttribute("srcset"),
      element.getAttribute("data-src"),
      element.getAttribute("data-lazy-src")
    ].filter(Boolean).join(" ");
    return Boolean(
      element.closest("[class*='avatar' i], [data-list-item-id^='guildsnav'], [class*='guildIcon' i], [class*='serverIcon' i]") ||
      /(?:discordapp\.com|discord\.com)\/(?:icons|avatars|team-icons|app-icons|banners)\//i.test(source)
    );
  }

  function isDiscordEmoji(element) {
    return currentSite === "discord" && Boolean(element?.closest?.("[class*='emoji' i], [data-type='emoji']"));
  }

  function isThumbnailMedia(element) {
    return isYouTubeShortsMedia(element) || Boolean(element.closest?.(`${CARD_SELECTOR}, ${MEDIA_WRAPPER_SELECTOR}`));
  }

  function isVisualMediaSurface(element) {
    if (element.matches(".ytp-cued-thumbnail-overlay-image, .ytp-thumbnail-overlay-image")) return true;
    return element.matches("[style*='background-image' i]") && Boolean(
      element.closest(`${CARD_SELECTOR}, ${MEDIA_WRAPPER_SELECTOR}`) ||
      element.matches(`${MEDIA_WRAPPER_SELECTOR}, [role='img']`)
    );
  }

  function isInteractiveControl(element) {
    return Boolean(element?.matches?.("a, button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem']"));
  }

  function isCompactBadge(element) {
    if (isInteractiveControl(element)) return false;
    const rect = element?.getBoundingClientRect?.();
    return !rect || (rect.width <= 80 && rect.height <= 40);
  }

  function markNotificationBadge(element) {
    if (isCompactBadge(element)) addClass(element, "unaddictify-notification-badge");
  }

  function setMediaClass(element, className, enabled) {
    if (!element?.classList) return;
    const hasClass = element.classList.contains(className);
    if (enabled === hasClass) return;
    if (enabled) element.classList.add(className);
    else element.classList.remove(className);
    touched.add(element);
  }

  function syncMediaElement(element) {
    const profile = isProfileMedia(element);
    const visual = profile ? Boolean(settings.features.hideProfileMedia) : isVisualImage(element);
    setMediaClass(element, "unaddictify-profile-media", profile);
    setMediaClass(element, "unaddictify-media", visual);
    setMediaClass(element, "unaddictify-thumbnail", visual && isThumbnailMedia(element));
    setMediaClass(element, "unaddictify-upside-down-media", visual && settings.features.upsideDownMedia);
  }

  function scanMedia(root = document) {
    const mediaSelectors = ["img, video, canvas, .unaddictify-media", ...(SITE_MEDIA_FALLBACK_SELECTORS[currentSite] || [])];
    const media = queryWithin(root, mediaSelectors.join(","));
    for (const element of media) {
      syncMediaElement(element);
    }

    for (const element of queryWithin(root, `${MEDIA_SURFACE_SELECTOR}, .unaddictify-media-surface`)) {
      const visual = settings.features.stripMedia || isVisualMediaSurface(element);
      setMediaClass(element, "unaddictify-media-surface", visual);
      setMediaClass(element, "unaddictify-thumbnail", visual);
      setMediaClass(element, "unaddictify-upside-down-media", visual && settings.features.upsideDownMedia);
    }
  }

  function hideShortsTabs(root = document) {
    if (currentSite !== "youtube" || !settings.siteSettings.youtube.hideShortsTab) return;
    for (const element of queryWithin(root, SHORTS_TAB_SELECTORS.join(","))) {
      const tab = element.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, yt-chip-cloud-chip-renderer, ytm-search-filter-chip-renderer, yt-search-filter-chip-renderer, tp-yt-paper-tab, [role='tab']") || element;
      const label = [tab.getAttribute?.("aria-label"), tab.getAttribute?.("title"), tab.textContent]
        .find((value) => value?.trim())?.trim().replace(/\s+/g, " ") || "";
      if (/^shorts(?:\s+tab)?$/i.test(label)) addClass(tab, "unaddictify-hidden-tab");
    }
  }

  function syncYouTubeContext() {
    if (currentSite !== "youtube") return;
    const root = document.documentElement;
    root.classList.toggle("unaddictify-youtube-shorts", isShortsPage());
    syncYouTubeFocusGate();
  }

  function scheduleBypassRefresh() {
    window.clearTimeout(bypassTimer);
    bypassTimer = null;
    const remaining = Number(settings?.bypassUntil) - Date.now();
    if (remaining <= 0) return;
    bypassTimer = window.setTimeout(() => {
      bypassTimer = null;
      applyRootState();
    }, Math.min(2147483647, remaining + 50));
  }

  function scheduleFocusLockRefresh() {
    window.clearTimeout(focusLockTimer);
    focusLockTimer = null;
    const remaining = Number(settings?.lockUntil) - Date.now();
    if (remaining <= 0) return;
    focusLockTimer = window.setTimeout(() => {
      focusLockTimer = null;
      clearStaleYouTubeFocusApprovals();
      syncYouTubeFocusGate();
    }, Math.min(2147483647, remaining + 50));
  }

  function hideNotificationCues(root = document) {
    if (!settings.features.hideNotificationBadges) return;
    const selectors = [...new Set([
      ...GENERIC_BADGE_SELECTORS,
      ...(BADGE_SELECTORS[currentSite] || [])
    ])];
    for (const element of queryWithin(root, selectors.join(","))) {
      const label = [element.getAttribute?.("aria-label"), element.getAttribute?.("title")]
        .filter(Boolean).join(" ");
      const text = element.textContent?.trim() || "";
      const className = element.className?.toString?.() || "";
      const badgeLike = /badge|dot|count/i.test(className) ||
        (/(unread|mention)/i.test(className) && (COUNT_ONLY_PATTERN.test(text) || text.length <= 8)) ||
        COUNT_ONLY_PATTERN.test(text) ||
        (/\d/.test(label) && /(badge|count|unread|mention)/i.test(label));
      if (badgeLike) markNotificationBadge(element);
      // Never hide a whole notification or conversation host. Only hide a
      // small numeric child when a site exposes the badge on its container.
      for (const child of element.children || []) {
        const childText = child.textContent?.trim() || "";
        if (childText.length <= 8 && COUNT_ONLY_PATTERN.test(childText)) markNotificationBadge(child);
      }
      for (const child of element.querySelectorAll?.(BADGE_DESCENDANT_SELECTOR) || []) {
        const childText = child.textContent?.trim() || "";
        if (childText.length <= 8 && COUNT_ONLY_PATTERN.test(childText)) markNotificationBadge(child);
      }
    }
    for (const element of queryWithin(root, "[aria-label*='notification' i], [aria-label*='unread' i], [aria-label*='mention' i]")) {
      const label = element.getAttribute("aria-label") || "";
      if (!/notification|unread|mention/i.test(label) || !/\d/.test(label)) continue;
      rememberAria(element);
      const masked = label.replace(/\d[\d,.]*\s*(?:[KMB]+)?/gi, "").replace(/\s{2,}/g, " ").trim();
      element.setAttribute("aria-label", masked);
      originalAria.get(element).masked = masked;
      for (const child of element.querySelectorAll?.(BADGE_DESCENDANT_SELECTOR) || []) {
        const childText = child.textContent?.trim() || "";
        if (childText.length <= 8 && COUNT_ONLY_PATTERN.test(childText)) markNotificationBadge(child);
      }
    }
  }

  function maskEngagementCounts(root = document) {
    if (!settings.features.hideEngagementCounts) return;
    const scope = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
    if (!scope) return;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !parent.closest(CARD_SELECTOR) || parent.closest("script, style, textarea, input, select, option, code, pre")) continue;
      const raw = node.nodeValue;
      if (!raw || raw.trim().length > 120 || !ENGAGEMENT_PATTERN.test(raw)) continue;
      rememberText(node);
      const state = originalText.get(node);
      state.masked = raw.replace(/\d[\d,.]*\s*(?:[KMB]+)?/gi, "—");
      node.nodeValue = state.masked;
    }
  }

  function updateAriaCounts(root = document) {
    if (!settings.features.hideEngagementCounts) return;
    for (const element of queryWithin(root, `${CARD_SELECTOR} [aria-label]`)) {
      const label = element.getAttribute("aria-label") || "";
      if (!/\d/.test(label) || !/(like|comment|view|follow|vote|share)/i.test(label)) continue;
      rememberAria(element);
      const masked = label.replace(/\d[\d,.]*\s*(?:[KMB]+)?/gi, "").replace(/\s{2,}/g, " ").trim();
      element.setAttribute("aria-label", masked);
      originalAria.get(element).masked = masked;
    }
  }

  function findSmallItem(element) {
    return element.closest("article, [role='article'], [data-testid='post-container'], li, [role='tab']") || element;
  }

  function findNavigationItem(element) {
    return element.closest("a, button, [role='tab'], [role='link'], li, [role='listitem']") || findSmallItem(element);
  }

  function findSection(element) {
    return element.closest("section, [role='region'], [data-attrid], [data-testid='cellInnerDiv'], article, li") || element;
  }

  function elementLabel(element) {
    return [element.getAttribute?.("aria-label"), element.getAttribute?.("title"), element.textContent]
      .find((value) => value?.trim())?.trim().replace(/\s+/g, " ") || "";
  }

  function hideLabeledItems(root, selectors, pattern, target = findNavigationItem) {
    for (const element of queryWithin(root, selectors.join(","))) {
      if (pattern.test(elementLabel(element))) addClass(target(element), "unaddictify-hidden-site-item");
    }
  }

  function getDiscoveryOwners(element) {
    const owners = [];
    let current = element;
    let depth = 0;
    while (current && depth < 6) {
      if (current.matches?.(DISCOVERY_TARGET_SELECTOR)) owners.push(current);
      current = current.parentElement;
      depth += 1;
    }
    const broadOwner = element.closest?.("section, [role='region']");
    if (broadOwner && !owners.includes(broadOwner)) owners.push(broadOwner);
    return owners;
  }

  function discoveryLabel(element, pattern = DISCOVERY_COPY_PATTERN) {
    const discoveryOwners = getDiscoveryOwners(element);
    const semanticNodes = [
      ...discoveryOwners,
      element,
      ...(element.querySelectorAll?.(
        "h1, h2, h3, h4, h5, h6, [role='heading'], [aria-label], [title], [data-testid*='recommend' i], [data-testid*='suggest' i], [data-pagelet*='suggest' i]"
      ) || [])
    ].slice(0, 48);
    const labels = [];
    const seen = new Set();
    const addLabel = (value) => {
      const text = value?.trim().replace(/\s+/g, " ") || "";
      if (text && !seen.has(text)) {
        seen.add(text);
        labels.push(text);
      }
    };

    for (const node of semanticNodes) {
      const semanticText = node.matches?.("h1, h2, h3, h4, h5, h6, [role='heading']") ? node.textContent : "";
      addLabel([
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("data-testid"),
        node.getAttribute?.("data-pagelet"),
        node.getAttribute?.("data-a-target"),
        node.getAttribute?.("data-attrid"),
        semanticText
      ].filter(Boolean).join(" "));
    }

    // Recommendation labels are often plain spans or divs with no semantic
    // attribute. Only retain short leaf-ish text that actually matches the
    // discovery vocabulary; never copy the whole card's text into the label.
    const ordinaryNodes = [
      ...discoveryOwners.filter((owner) => owner !== element && owner.matches?.(DISCOVERY_TEXT_SELECTOR)),
      ...(element.matches?.(DISCOVERY_TEXT_SELECTOR) ? [element] : []),
      ...(element.querySelectorAll?.(DISCOVERY_TEXT_SELECTOR) || [])
    ].slice(0, 96);
    for (const node of ordinaryNodes) {
      if (node.closest?.("script, style, textarea, input, select, option")) continue;
      if (node.children?.length > 2) continue;
      const text = node.textContent?.trim().replace(/\s+/g, " ") || "";
      if (text.length > 120 || !pattern.test(text)) continue;
      addLabel(text);
    }
    return labels.join(" ");
  }

  function hideCardsMatching(root, selectors, pattern) {
    for (const element of queryWithin(root, selectors)) {
      if (pattern.test(discoveryLabel(element, pattern))) addClass(findDiscoveryCard(element), "unaddictify-hidden-site-item");
    }
  }

  function findDiscoveryCard(element) {
    return element.closest(
      `article, [role='article'], [data-testid='cellInnerDiv'], [data-testid='post-container'], [data-test-id='pin'], [data-test-id='pinWrapper'], ${DISCOVERY_SCOPE_SELECTOR}, li`
    ) || element.parentElement || element;
  }

  function hideInstagramReels(root = document) {
    if (currentSite !== "instagram" || !settings.siteSettings.instagram.hideReels) return;
    const selectors = [
      "a[href='/reels']",
      "a[href='/reels/']",
      "a[href*='/reels/']",
      "[role='tab'][aria-label='Reels' i]",
      "[aria-label='Reels' i]"
    ];
    for (const element of queryWithin(root, selectors.join(","))) addClass(findSmallItem(element), "unaddictify-hidden-site-item");
  }

  function hideTikTokNavigation(root = document) {
    const options = settings.siteSettings.tiktok || {};
    if (options.hideLiveTab) {
      hideLabeledItems(root, [
        "a[href='/live']",
        "a[href='/live/']",
        "[data-e2e='nav-live']",
        "[data-e2e='nav-live-link']",
        "[role='tab'][aria-label*='live' i]"
      ], /^live(?:\s+now)?$/i);
    }
    if (options.hideShopTab) {
      hideLabeledItems(root, [
        "a[href='/shop']",
        "a[href='/shop/']",
        "[data-e2e='nav-shop']",
        "[data-e2e='nav-shop-link']",
        "[role='tab'][aria-label*='shop' i]"
      ], /^shop(?:ping)?$/i);
    }
  }

  function hideTwitchDiscovery(root = document) {
    const options = settings.siteSettings.twitch || {};
    if (options.hideDiscovery) {
      hideCardsMatching(root, "[data-a-target='preview-card'], [data-a-target='side-nav-card'], article", DISCOVERY_COPY_PATTERN);
      hideLabeledItems(root, [
        "[data-a-target='recommended-channels']",
        "[data-a-target='followed-channels']",
        "[aria-label*='recommended' i]"
      ], DISCOVERY_COPY_PATTERN, findSection);
    }
    if (options.hideClips) {
      for (const element of queryWithin(root, "[data-a-target='clips-carousel'], [aria-label*='clips' i], a[href*='/clip/' i]")) {
        addClass(element.closest("section, article, li") || element, "unaddictify-hidden-site-item");
      }
    }
    if (options.hideChat) {
      for (const element of queryWithin(root, "#live-chat-frame, [data-a-target='chat-room'], [data-a-target='chat-scroller']")) {
        addClass(element.closest("aside, section, [role='complementary']") || element, "unaddictify-hidden-site-item");
      }
    }
  }

  function hideXDiscovery(root = document) {
    const options = settings.siteSettings.x || {};
    if (options.hideExplore) {
      hideLabeledItems(root, [
        "a[href='/explore']",
        "a[href='/i/explore']",
        "[data-testid='AppTabBar_Explore_Link']",
        "[aria-label='Explore' i]"
      ], /^explore$/i);
    }
    if (options.hideForYouTab) {
      hideLabeledItems(root, [
        "a[href*='/for-you' i]",
        "[role='tab'][aria-label*='for you' i]"
      ], /for you/i);
    }
    if (options.hideSuggestedPosts) {
      hideCardsMatching(root, "[data-testid='cellInnerDiv'], article, [role='article']", DISCOVERY_COPY_PATTERN);
    }
  }

  function hideFacebookDiscovery(root = document) {
    const options = settings.siteSettings.facebook || {};
    if (options.hideReels) {
      hideLabeledItems(root, [
        "a[href*='/reels' i]",
        "[aria-label='Reels' i]",
        "[role='tab'][aria-label*='reels' i]"
      ], /reels/i);
    }
    if (options.hideWatch) {
      hideLabeledItems(root, [
        "a[href*='/watch' i]",
        "[aria-label='Watch' i]",
        "[role='tab'][aria-label*='watch' i]"
      ], /^watch$/i);
    }
    if (options.hideStories) {
      for (const element of queryWithin(root, "[aria-label*='stories' i], [data-pagelet*='story' i]")) {
        addClass(findSection(element), "unaddictify-hidden-site-item");
      }
    }
    if (options.hideSuggestedPosts) {
      hideCardsMatching(root, "div[role='article'], article", DISCOVERY_COPY_PATTERN);
    }
  }

  function hideGoogleDiscovery(root = document) {
    const options = settings.siteSettings.google || {};
    if (options.hideDoodles) {
      for (const element of queryWithin(root, "#hplogo, img[alt*='doodle' i], [aria-label*='doodle' i]")) addClass(element, "unaddictify-hidden-site-item");
    }
    if (options.hideTrendingSearches) {
      hideCardsMatching(root, "[data-attrid*='trending' i], [aria-label*='trending' i], [role='heading'], h2, h3", /trending searches|popular searches/i);
    }
    if (options.hideDiscover) {
      for (const element of queryWithin(root, "[data-attrid*='discover' i], a[href*='discover.google' i], [aria-label*='discover' i]")) addClass(findSection(element), "unaddictify-hidden-site-item");
    }
    if (options.hideNewsPanels) {
      for (const element of queryWithin(root, "[data-attrid*='news' i], a[href*='news.google' i], [aria-label*='top stories' i]")) addClass(findSection(element), "unaddictify-hidden-site-item");
    }
  }

  function hidePinterestDiscovery(root = document) {
    const options = settings.siteSettings.pinterest || {};
    if (options.hideRecommendations) {
      hideLabeledItems(root, [
        "[aria-label*='recommended' i]",
        "[data-test-id*='recommend' i]",
        "[data-test-id*='suggest' i]"
      ], /recommended|suggested/i, findSection);
      hideCardsMatching(root, "[data-test-id='pin'], [data-test-id='pinWrapper'], article", DISCOVERY_COPY_PATTERN);
    }
    if (options.hideRelatedPins) {
      for (const element of queryWithin(root, "[data-test-id='relatedPins'], [data-test-id='more-like-this'], [aria-label*='related pins' i]")) addClass(findSection(element), "unaddictify-hidden-site-item");
    }
    if (options.hideSaveCounts) {
      for (const element of queryWithin(root, "[aria-label*='save' i], [data-test-id*='save' i], [class*='saveCount' i]")) {
        const label = element.getAttribute?.("aria-label") || "";
        if (/\d/.test(label) && /save/i.test(label)) {
          rememberAria(element);
          const masked = label.replace(/\d[\d,.]*\s*(?:[KMB]+)?/gi, "").replace(/\s{2,}/g, " ").trim();
          element.setAttribute("aria-label", masked);
          originalAria.get(element).masked = masked;
        }
        for (const child of element.querySelectorAll?.("span, div") || []) {
          if (COUNT_ONLY_PATTERN.test(child.textContent || "")) addClass(child, "unaddictify-site-count");
        }
      }
    }
  }

  function hideThreadsDiscovery(root = document) {
    const options = settings.siteSettings.threads || {};
    if (options.hideForYouTab) {
      hideLabeledItems(root, ["a[href*='/for-you' i]", "[role='tab'][aria-label*='for you' i]"], /for you/i);
    }
    if (options.hideSuggestedPosts) hideCardsMatching(root, "article, [role='article']", DISCOVERY_COPY_PATTERN);
  }

  function hideSnapchatDiscovery(root = document) {
    const options = settings.siteSettings.snapchat || {};
    if (options.hideSpotlight) hideLabeledItems(root, ["a[href*='/spotlight' i]", "[aria-label*='spotlight' i]"], /spotlight/i);
    if (options.hideDiscover) hideLabeledItems(root, ["a[href*='/discover' i]", "[aria-label*='discover' i]"], /discover/i);
    if (options.hideStories) hideLabeledItems(root, ["a[href*='/stories' i]", "[aria-label*='stories' i]"], /stories/i);
  }

  function hideWhatsAppDiscovery(root = document) {
    const options = settings.siteSettings.whatsapp || {};
    if (options.hideStatus) hideLabeledItems(root, ["[data-testid='status-v3']", "[aria-label*='status' i]", "[aria-label*='updates' i]"], /status|updates/i);
    if (options.hideChannels) hideLabeledItems(root, ["[data-testid='channels']", "[aria-label*='channels' i]"], /channels/i);
  }

  function hideMessengerDiscovery(root = document) {
    const options = settings.siteSettings.messenger || {};
    if (options.hideStories) {
      for (const element of queryWithin(root, "[aria-label*='stories' i], [data-testid*='story' i]")) addClass(findSection(element), "unaddictify-hidden-site-item");
    }
    if (options.hideSuggestedContent) hideCardsMatching(root, "[role='article'], article", DISCOVERY_COPY_PATTERN);
  }

  function hideComments(root = document) {
    const options = settings.siteSettings[currentSite] || {};
    if (!options.hideComments) return;
    const selectors = {
      instagram: "article [data-testid*='comment' i], article [aria-label*='comment' i]",
      reddit: "shreddit-comment-tree, [data-testid='comment-tree'], .CommentTree",
      youtube: "ytd-comments, #comments, ytd-comment-thread-renderer",
      tiktok: "[data-e2e='comment-list'], [data-e2e='comment-container'], [data-e2e='comment-item']"
    }[currentSite];
    if (!selectors) return;
    for (const element of queryWithin(root, selectors)) addClass(element, "unaddictify-hidden-comments");
  }

  function hideSiteSpecific(root = document) {
    hideInstagramReels(root);
    hideComments(root);
    if (currentSite === "tiktok") hideTikTokNavigation(root);
    if (currentSite === "twitch") hideTwitchDiscovery(root);
    if (currentSite === "x") hideXDiscovery(root);
    if (currentSite === "facebook") hideFacebookDiscovery(root);
    if (currentSite === "google") hideGoogleDiscovery(root);
    if (currentSite === "pinterest") hidePinterestDiscovery(root);
    if (currentSite === "threads") hideThreadsDiscovery(root);
    if (currentSite === "snapchat") hideSnapchatDiscovery(root);
    if (currentSite === "whatsapp") hideWhatsAppDiscovery(root);
    if (currentSite === "messenger") hideMessengerDiscovery(root);
  }

  function rootStateNeedsRepair() {
    const root = document.documentElement;
    if (!active) {
      return ROOT_CLASSES.some((className) => root.classList.contains(className)) ||
        root.style.getPropertyValue("--unaddictify-monochrome");
    }

    const required = ["unaddictify-active", `unaddictify-site-${currentSite}`];
    const monochrome = U.asPercent(settings.features.monochrome, 0);
    if (monochrome > 0) required.push("unaddictify-monochrome");
    for (const [feature, className] of Object.entries(ROOT_FEATURE_CLASSES)) {
      if (settings.features[feature]) required.push(className);
    }
    const siteOptions = settings.siteSettings[currentSite] || {};
    for (const [key, className] of Object.entries(SITE_SETTING_CLASS_MAP[currentSite] || {})) {
      if (siteOptions[key]) required.push(className);
    }
    const expectedMonochrome = monochrome > 0 ? `${monochrome}%` : "";
    return required.some((className) => !root.classList.contains(className)) ||
      root.style.getPropertyValue("--unaddictify-monochrome") !== expectedMonochrome;
  }

  function applyRootState() {
    const root = document.documentElement;
    root.classList.remove("unaddictify-pending", ...ROOT_CLASSES);
    root.style.removeProperty("--unaddictify-monochrome");
    const shouldBeActive = U.isActiveForSite(settings, currentSite);
    if (!shouldBeActive) {
      active = false;
      removeYouTubeGate({ restoreFocus: true });
      setApprovedYouTubePlayer();
      cleanupTouched();
      scheduleBypassRefresh();
      scheduleFocusLockRefresh();
      return;
    }

    active = true;
    root.classList.add("unaddictify-active", `unaddictify-site-${currentSite}`);
    const monochrome = U.asPercent(settings.features.monochrome, 0);
    root.style.setProperty("--unaddictify-monochrome", `${monochrome}%`);
    if (monochrome > 0) root.classList.add("unaddictify-monochrome");
    for (const [feature, className] of Object.entries(ROOT_FEATURE_CLASSES)) {
      if (settings.features[feature]) root.classList.add(className);
    }
    const siteOptions = settings.siteSettings[currentSite] || {};
    for (const [key, className] of Object.entries(SITE_SETTING_CLASS_MAP[currentSite] || {})) {
      if (siteOptions[key]) root.classList.add(className);
    }
    syncYouTubeContext();
    // CSS handles common media immediately. Defer the broad discovery scan
    // until idle time so page startup and player initialization stay fluid.
    scheduleBypassRefresh();
    scheduleFocusLockRefresh();
    scheduleScan(document);
  }

  function notifyLocationChange() {
    window.dispatchEvent(new Event("unaddictify-location-change"));
  }

  function installHistoryListeners() {
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      notifyLocationChange();
      return result;
    };
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      notifyLocationChange();
      return result;
    };
  }

  function removeHistoryListeners() {
    if (originalPushState && history.pushState !== originalPushState) history.pushState = originalPushState;
    if (originalReplaceState && history.replaceState !== originalReplaceState) history.replaceState = originalReplaceState;
    originalPushState = null;
    originalReplaceState = null;
  }

  function syncSiteContext() {
    if (location.href === observedUrl) return;
    observedUrl = location.href;
    const nextSite = U.getSiteFromUrl(location.href);
    if (nextSite === currentSite) {
      cleanupTouched();
      applyRootState();
      return;
    }
    currentSite = nextSite;
    window.clearTimeout(bypassTimer);
    bypassTimer = null;
    window.clearTimeout(focusLockTimer);
    focusLockTimer = null;
    removeYouTubeGate({ restoreFocus: true });
    setApprovedYouTubePlayer();
    cleanupTouched();
    const root = document.documentElement;
    root.classList.remove("unaddictify-pending", ...ROOT_CLASSES);
    root.style.removeProperty("--unaddictify-monochrome");
    active = false;
    if (currentSite) root.classList.add("unaddictify-pending");
    applyRootState();
  }

  function scanDocument(roots = [document]) {
    syncSiteContext();
    if (!active) return;
    if (roots.includes(document)) syncYouTubeContext();
    for (const root of roots) {
      hideShortsTabs(root);
      scanMedia(root);
      hideNotificationCues(root);
      maskEngagementCounts(root);
      updateAriaCounts(root);
      hideSiteSpecific(root);
    }
  }

  function cleanupTouched() {
    for (const element of touched) {
      if (!element || !element.isConnected || element.nodeType === Node.TEXT_NODE) continue;
      element.classList.remove(
        "unaddictify-media",
        "unaddictify-thumbnail",
        "unaddictify-media-surface",
        "unaddictify-profile-media",
        "unaddictify-upside-down-media",
        "unaddictify-notification-badge",
        "unaddictify-notification-host",
        "unaddictify-site-count",
        "unaddictify-hidden-tab",
        "unaddictify-hidden-site-item",
        "unaddictify-hidden-comments"
      );
      const aria = originalAria.get(element);
      if (aria && element.getAttribute("aria-label") === aria.masked) {
        if (aria.original === null) element.removeAttribute("aria-label");
        else element.setAttribute("aria-label", aria.original);
      }
    }
    for (const node of touched) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const state = originalText.get(node);
      if (state && node.nodeValue === state.masked) node.nodeValue = state.original;
    }
    touched.clear();
  }

  function requestScanPass() {
    if (scanTimer !== null || scanIdleHandle !== null) return;
    const run = () => {
      scanTimer = null;
      scanIdleHandle = null;
      if (!active) {
        pendingRoots.clear();
        pendingDocumentScan = false;
        return;
      }

      const roots = pendingDocumentScan
        ? [document]
        : [...pendingRoots].slice(0, ROOTS_PER_SCAN);
      pendingDocumentScan = false;
      for (const root of roots) pendingRoots.delete(root);
      scanDocument(roots.length ? roots : [document]);
      if (pendingRoots.size || pendingDocumentScan) requestScanPass();
    };

    if (typeof window.requestIdleCallback === "function") {
      scanIdleHandle = window.requestIdleCallback(run, { timeout: 500 });
    } else {
      scanTimer = window.setTimeout(run, 240);
    }
  }

  function scheduleScan(root = document) {
    if (!active) return;
    if (root === document) {
      pendingDocumentScan = true;
      pendingRoots.clear();
    } else {
      const scope = root.closest?.(CARD_SELECTOR);
      if (scope) {
        if (pendingRoots.size < MAX_PENDING_ROOTS) pendingRoots.add(scope);
      } else {
        // Feed frameworks sometimes append a batch wrapper instead of a
        // single card. Queue its cards individually so we never rescan the
        // entire feed container for one small update.
        const cards = root.matches?.(CARD_SELECTOR)
          ? [root]
          : [...(root.querySelectorAll?.(CARD_SELECTOR) || [])].slice(0, MAX_PENDING_ROOTS);
        if (cards.length) {
          for (const card of cards) {
            if (pendingRoots.size >= MAX_PENDING_ROOTS) break;
            pendingRoots.add(card);
          }
        } else if (pendingRoots.size < MAX_PENDING_ROOTS) {
          pendingRoots.add(root);
        }
      }
    }
    requestScanPass();
  }

  function hasBoundedDiscoveryText(element) {
    const text = element?.textContent?.trim().replace(/\s+/g, " ") || "";
    return text.length <= 120 && DISCOVERY_COPY_PATTERN.test(text);
  }

  function findMutationScanRoot(node, includeDescendants = false) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!element) return null;
    const card = element.closest?.(CARD_SELECTOR);
    if (card) return card;
    const relevantAncestor = element.closest?.(MUTATION_NESTED_ANCESTOR_SELECTOR);
    const relevant = isPotentialMediaTarget(element) ||
      element.matches?.(MUTATION_CONTENT_SELECTOR) ||
      relevantAncestor ||
      (includeDescendants && element.querySelector?.(MUTATION_CONTENT_SELECTOR));
    const discoveryText = hasBoundedDiscoveryText(element);
    if (!relevant && !discoveryText) return null;
    if (discoveryText) {
      return element.closest?.(DISCOVERY_TARGET_SELECTOR) || relevantAncestor || element;
    }
    return relevantAncestor || element;
  }

  function scheduleMutationScan(node, includeDescendants = false) {
    const root = findMutationScanRoot(node, includeDescendants);
    if (root) scheduleScan(root);
  }

  function shouldRescanMutationAttribute(target, attributeName) {
    if (isPotentialMediaTarget(target)) return true;
    if (attributeName === "class" && target.matches?.(CARD_SELECTOR)) return true;
    if (!RESCAN_ATTRIBUTES.has(attributeName)) return false;
    return Boolean(target.matches?.(MUTATION_ATTRIBUTE_SCOPE_SELECTOR) || target.closest?.(MUTATION_ATTRIBUTE_SCOPE_SELECTOR));
  }

  function isPotentialMediaTarget(element) {
    return Boolean(element?.matches?.(
      `img, video, canvas, [role='img'], [style*='background-image' i], ${MEDIA_WRAPPER_SELECTOR}, .unaddictify-media, .unaddictify-media-surface, .unaddictify-profile-media`
    ));
  }

  function handleMediaLoad(event) {
    if (!active || !event.target?.matches?.("img, video, canvas")) return;
    scheduleScan(event.target);
    if (currentSite === "youtube" && event.target.closest?.("#movie_player")) scheduleYouTubeGateSync();
  }

  function handleYouTubeNavigateFinish() {
    syncSiteContext();
    syncYouTubeContext();
    scheduleScan(document);
  }

  async function init() {
    // Keep the pending state visually neutral until stored settings arrive.
    // Applying defaults first creates a visible flash for users who have
    // disabled the extension or chosen a gentler configuration.
    const stored = await chrome.storage.local.get({
      ...U.DEFAULT_SETTINGS,
      [U.YOUTUBE_FOCUS_APPROVALS_KEY]: U.normalizeYouTubeFocusApprovals()
    });
    youtubeFocusApprovals = U.normalizeYouTubeFocusApprovals(stored[U.YOUTUBE_FOCUS_APPROVALS_KEY]);
    delete stored[U.YOUTUBE_FOCUS_APPROVALS_KEY];
    settings = U.mergeSettings(stored);
    clearStaleYouTubeFocusApprovals();
    syncSiteContext();
    applyRootState();
    observer = new MutationObserver((records) => {
      let shouldSyncYouTubeGate = false;
      for (const record of records) {
        if (record.type === "characterData") {
          scheduleMutationScan(record.target);
          continue;
        }
        if (record.type === "attributes") {
          const target = record.target;
          if (target === document.documentElement && (record.attributeName === "class" || record.attributeName === "style")) {
            if (rootStateNeedsRepair()) applyRootState();
            continue;
          }
          if (shouldRescanMutationAttribute(target, record.attributeName)) {
            scheduleMutationScan(target);
          }
          if (currentSite === "youtube" && target.matches?.("video, #movie_player")) shouldSyncYouTubeGate = true;
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            scheduleMutationScan(record.target);
            continue;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          scheduleMutationScan(node, true);
          if (
            currentSite === "youtube" &&
            (node.matches?.("video, #movie_player, ytd-watch-metadata, ytd-watch-flexy") ||
              node.querySelector?.("video, #movie_player, ytd-watch-metadata"))
          ) {
            shouldSyncYouTubeGate = true;
          }
        }
      }
      if (shouldSyncYouTubeGate) scheduleYouTubeGateSync();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        "class", "style", "src", "srcset", "data-src", "data-lazy-src", "poster",
        "aria-label", "title", "href", "data-testid", "data-test-id", "data-e2e",
        "data-a-target", "data-pagelet", "data-attrid", "data-list-item-id"
      ],
      characterData: true,
      childList: true,
      subtree: true
    });
    installHistoryListeners();
    window.addEventListener("popstate", syncSiteContext);
    window.addEventListener("hashchange", syncSiteContext);
    window.addEventListener("unaddictify-location-change", syncSiteContext);
    document.addEventListener("load", handleMediaLoad, true);
    document.addEventListener("loadeddata", handleMediaLoad, true);
    document.addEventListener("play", guardYouTubePlayback, true);
    document.addEventListener("yt-navigate-start", scheduleYouTubeGateSync);
    document.addEventListener("yt-navigate-finish", handleYouTubeNavigateFinish);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[U.YOUTUBE_FOCUS_APPROVALS_KEY]) {
        youtubeFocusApprovals = U.normalizeYouTubeFocusApprovals(
          changes[U.YOUTUBE_FOCUS_APPROVALS_KEY].newValue
        );
      }
      const next = { ...settings };
      for (const key of Object.keys(U.DEFAULT_SETTINGS)) if (changes[key]) next[key] = changes[key].newValue;
      settings = U.mergeSettings(next);
      clearStaleYouTubeFocusApprovals();
      cleanupTouched();
      applyRootState();
    });
  }

  function cleanupBeforeUnload() {
    observer?.disconnect();
    window.clearTimeout(scanTimer);
    window.cancelIdleCallback?.(scanIdleHandle);
    window.cancelAnimationFrame?.(youtubeGateFrame);
    window.clearTimeout(bypassTimer);
    window.clearTimeout(focusLockTimer);
    pendingRoots.clear();
    pendingDocumentScan = false;
    window.removeEventListener("popstate", syncSiteContext);
    window.removeEventListener("hashchange", syncSiteContext);
    window.removeEventListener("unaddictify-location-change", syncSiteContext);
    removeHistoryListeners();
    document.removeEventListener("load", handleMediaLoad, true);
    document.removeEventListener("loadeddata", handleMediaLoad, true);
    document.removeEventListener("play", guardYouTubePlayback, true);
    document.removeEventListener("yt-navigate-start", scheduleYouTubeGateSync);
    document.removeEventListener("yt-navigate-finish", handleYouTubeNavigateFinish);
    removeYouTubeGate({ restoreFocus: false });
    setApprovedYouTubePlayer();
    cleanupTouched();
  }

  window.addEventListener("pagehide", cleanupBeforeUnload, { once: true });
  init().catch(() => document.documentElement.classList.remove("unaddictify-pending"));
})();
