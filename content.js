/**
 * Decaf — page runtime.
 *
 * Four jobs, in order of importance:
 *   1. Empty a paused feed in place and say so, without touching the rest of the
 *      site. The page keeps scrolling, the header and search keep working.
 *   2. Take the color out of media, and the numbers out of reward counts.
 *   3. Offer full color for the one thing being watched, one page at a time.
 *   4. Stay out of the way of everything else.
 *
 * Decaf's own elements live in the page DOM and are styled from content.css,
 * which Chrome injects for the extension. That is deliberate: a site's own CSS
 * cannot reach them, and no styles are ever built at runtime.
 */
(() => {
  "use strict";

  const D = globalThis.Decaf;
  if (!D) return;

  /*
   * Never run twice in one world. The manifest injects this file on navigation
   * and the service worker injects it into already-open tabs on install and
   * update; a tab that navigates in the moment between those two gets both. A
   * second copy would mean two observers, two cards and two owners of the root
   * classes disagreeing with each other.
   *
   * An owner whose extension has died is a different matter: yield to a living
   * owner, succeed a dead one. In practice Chrome gives a reloaded extension a
   * fresh isolated world, so the dead-owner branch should never run — but that
   * is Chrome's behaviour, not Chrome's contract, and the wrong branch here is
   * the difference between one working card and none.
   */
  const previous = globalThis.__decaf;
  if (previous) {
    if (previous.alive?.()) return;
    try {
      previous.teardown();
    } catch (_) {
      // A dead copy that cannot even clean up cannot fight either.
    }
  }

  const ROOT_CLASSES = [
    "decaf-on",
    "decaf-calm",
    "decaf-feed",
    "decaf-media",
    "decaf-game",
    "decaf-content",
    "decaf-hide-feed",
    "decaf-hide-comments",
    "decaf-upside-down",
    "decaf-hide-badges",
    "decaf-color",
    "decaf-site-custom",
    ...D.SITE_KEYS.map((key) => `decaf-site-${key}`)
  ];

  /*
   * The words that make a number a reward count, in the languages these twelve
   * sites actually ship.
   *
   * This used to be twenty-five English words, which meant the second-biggest
   * thing Decaf promises quietly did nothing for most of the people using these
   * sites: a German YouTube page writes "1.234.567 Aufrufe", nothing matched it,
   * and the number stayed. Where masking did work in another language it was by
   * accident - YouTube's like button was caught only because `contextText` found
   * the English substring "like" inside `id="segmented-like-button"`.
   *
   * Attribute text is a different matter and stays English below: `data-testid`,
   * `class` and `id` are written by a site's engineers, not translated.
   */
  const REWARD_WORDS = [
    // English
    "likes?", "views?", "comments?", "repl(?:y|ies)", "reposts?", "retweets?", "shares?",
    "followers?", "following", "subscribers?", "members?", "votes?", "upvotes?", "downvotes?",
    "points?", "karma", "saves?", "reactions?", "watching", "viewers?", "posts?", "bookmarks?",
    "favou?rites?", "quotes?", "impressions?",
    // Spanish and Portuguese
    "me gusta", "reproducciones", "visualizaciones", "vistas", "comentarios?", "compartidos?",
    "seguidores?", "siguiendo", "suscriptores?", "miembros?", "guardados?", "respuestas?",
    "curtidas?", "visualiza(?:\\u00e7|c)(?:\\u00f5|o)es", "coment(?:\\u00e1|a)rios?",
    "compartilhamentos?", "inscritos?", "membros?", "salvos?", "respostas?",
    // French
    "j'aime", "vues?", "commentaires?", "partages?", "abonn(?:\\u00e9|e)s?", "abonnements?",
    "membres?", "r(?:\\u00e9|e)ponses?", "enregistr(?:\\u00e9|e)s?",
    // German
    "gef(?:\\u00e4|a)llt mir", "aufrufe", "kommentare?", "geteilt", "abonnenten", "abonniert",
    "mitglieder", "antworten", "gespeichert", "zuschauer", "bewertungen",
    // Italian, Dutch, Polish, Turkish, Indonesian
    "mi piace", "visualizzazioni", "commenti", "condivisioni", "iscritti", "membri", "risposte",
    "vind-ik-leuks?", "weergaven", "reacties", "gedeeld", "abonnees", "leden",
    "polubie(?:\\u0144|n)\\w*", "wy(?:\\u015b|s)wietle(?:\\u0144|n)\\w*", "komentarz\\w*",
    "udost(?:\\u0119|e)pnie(?:\\u0144|n)\\w*", "subskrybent\\w*", "cz(?:\\u0142|l)onk\\w*",
    "odpowiedzi",
    "be(?:\\u011f|g)enme", "g(?:\\u00f6|o)r(?:\\u00fc|u)nt(?:\\u00fc|u)lenme", "yorum(?:lar)?",
    "payla(?:\\u015f|s)(?:\\u0131|i)m", "abone", "(?:\\u00fc|u)ye", "yan(?:\\u0131|i)t(?:lar)?",
    "izleyici",
    "suka", "tayangan", "komentar", "bagikan", "pengikut", "anggota", "balasan",
    // Russian and Ukrainian
    "\\u043f\\u0440\\u043e\\u0441\\u043c\\u043e\\u0442\\u0440\\w*",
    "\\u043a\\u043e\\u043c\\u043c\\u0435\\u043d\\u0442\\w*",
    "\\u043f\\u043e\\u0434\\u043f\\u0438\\u0441\\w*",
    "\\u0443\\u0447\\u0430\\u0441\\u0442\\u043d\\u0438\\u043a\\w*",
    "\\u043e\\u0442\\u0432\\u0435\\u0442\\w*",
    "\\u043d\\u0440\\u0430\\u0432\\u0438\\u0442\\u0441\\u044f",
    "\\u0437\\u0440\\u0438\\u0442\\u0435\\u043b\\w*",
    "\\u043f\\u0435\\u0440\\u0435\\u0433\\u043b\\u044f\\u0434\\w*",
    // Japanese, Korean, Chinese
    "\\u56de\\u8996\\u8074", "\\u56de\\u518d\\u751f", "\\u4ef6\\u306e\\u30b3\\u30e1\\u30f3\\u30c8",
    "\\u30d5\\u30a9\\u30ed\\u30ef\\u30fc", "\\u3044\\u3044\\u306d", "\\u4ef6\\u306e\\u8fd4\\u4fe1",
    "\\u8996\\u8074\\u56de\\u6570",
    "\\uc870\\ud68c\\uc218", "\\ub313\\uae00", "\\ud314\\ub85c\\uc6cc", "\\uad6c\\ub3c5\\uc790",
    "\\uc88b\\uc544\\uc694", "\\ub2f5\\uae00",
    "\\u6b21\\u89c2\\u770b", "\\u6b21\\u64ad\\u653e", "\\u6761\\u8bc4\\u8bba", "\\u4f4d\\u7c89\\u4e1d",
    "\\u70b9\\u8d5e", "\\u6b21\\u89c0\\u770b", "\\u5247\\u7559\\u8a00", "\\u4f4d\\u8ffd\\u8e64\\u8005",
    // Arabic and Hindi
    "\\u0645\\u0634\\u0627\\u0647\\u062f\\u0629", "\\u0625\\u0639\\u062c\\u0627\\u0628",
    "\\u062a\\u0639\\u0644\\u064a\\u0642(?:\\u0627\\u062a)?",
    "\\u0645\\u062a\\u0627\\u0628\\u0639\\w*", "\\u0645\\u0634\\u062a\\u0631\\u0643\\w*",
    "\\u0935\\u094d\\u092f\\u0942", "\\u092a\\u0938\\u0902\\u0926",
    "\\u091f\\u093f\\u092a\\u094d\\u092a\\u0923\\u093f\\u092f\\u093e\\u0901"
  ].join("|");

  /*
   * Numbers, in the shapes the world writes them. `\p{Nd}` rather than `\d`,
   * because Arabic-Indic and Devanagari digits are digits; and the grouping class
   * carries the separators a locale puts *inside* one number - the German full
   * stop, the French narrow no-break space, the Arabic thousands mark.
   */
  const DIGITS = "\\p{Nd}";
  /** Any digit in any script, so a gate written for ASCII does not skip Arabic. */
  const ANY_DIGIT = /\p{Nd}/u;
  const GROUPED = "[\\p{Nd}.,'\\u202f\\u00a0\\u2009\\u066b\\u066c\\u2019 ]";
  /*
   * A magnitude suffix. The Latin ones may not be followed by another letter, so
   * "5M" is a count and "5Mbps" is not.
   */
  const MAGNITUDE = "(?:(?:[KkMmBbTt]|Tsd|Mio|Mrd|mln|mld|mil|tys|lakh|crore|" +
    "\\u0442\\u044b\\u0441|\\u043c\\u043b\\u043d|\\u043c\\u043b\\u0440\\u0434)(?!\\p{L})|" +
    "\\u4e07|\\u5104|\\u4ebf|\\ucc9c|\\ub9cc|\\uc5b5)\\.?";

  const COUNT_WITH_NOUN = new RegExp(
    `${DIGITS}${GROUPED}*\\s*(?:${MAGNITUDE})?\\+?\\s*(?:${REWARD_WORDS})`,
    "iu"
  );
  const BARE_COUNT = new RegExp(`^\\s*${DIGITS}${GROUPED}*\\s*(?:${MAGNITUDE})?\\+?\\s*$`, "u");
  // "1.8M" in one element, "Views" in the next: X writes the noun beside the
  // number rather than with it. Facebook writes it in front: "All reactions: 265".
  const REWARD_NOUN_FIRST = new RegExp(`^(?:${REWARD_WORDS})`, "iu");
  const REWARD_NOUN_LAST = new RegExp(`(?:${REWARD_WORDS})\\s*[:\u00b7\u2022|,-]?\\s*$`, "iu");
  /*
   * Evidence found in *attributes* - class names, ids, test hooks - which sites
   * write in English whatever language they render in.
   *
   * Every entry is now bounded. Unanchored, `share` matched every LinkedIn
   * `feed-shared-*` class in the document and `view` matched `preview` and
   * `overview`, so a post whose own line was the year 2019 came out as a dash.
   */
  const REWARD_CONTEXT = new RegExp(
    "(?:^|[^a-z])(?:like|view|comment|repl(?:y|ies|ie)|repost|retweet|quote|share|follow|" +
    "subscrib|member|vote|karma|save|bookmark|favou?rite|reaction|impression|watching|viewer|" +
    "engagement|score)(?:s|d|r|rs|ing|ed|es)?(?![a-z])",
    "i"
  );
  const CONTEXT_ATTRIBUTES = [
    "aria-label", "title", "class", "id", "data-testid", "data-test-id", "data-e2e",
    "data-a-target", "data-post-click-location", "data-view-name", "slot", "name"
  ];
  // Some badges live in a shadow root (Reddit's <dynamic-badge>). Marking the host
  // works anyway: a filter on the host applies to everything inside it.
  const BADGE_SELECTOR = [
    "dynamic-badge",
    "[class*='badge' i]",
    "[class*='unread' i]",
    "[class*='notificationcount' i]",
    "[class*='notification-count' i]",
    "[class*='notification-dot' i]",
    "[class*='mentioncount' i]",
    // The red "live now" dot. Twitch writes the class in camel case, which the
    // i flag takes care of: ScChannelStatusIndicator.
    "[class*='statusindicator' i]",
    "[class*='status-indicator' i]",
    "[data-badge]",
    "[data-unread-count]"
  ].join(",");
  const BADGE_REGION_SELECTOR = "nav,header,[role='navigation'],[role='tablist'],[role='banner']";
  const CONTROL_SELECTOR = "a,button,[role='button'],[role='link'],[role='tab'],[role='menuitem']";
  // Where a badge a site never names may be looked for: on a control, or in a
  // region a site does mark as navigation.
  const PAINT_HOST_SELECTOR = `${CONTROL_SELECTOR},${BADGE_REGION_SELECTOR}`;
  // Reading style for every element on a page the size of Instagram's is enough
  // to make it stutter, so the search for a painted badge is bounded. Badges sit
  // in site furniture, which is small and near the top of the document, so a
  // bound this size has never been reached on a real page.
  const PAINT_STYLE_BUDGET = 500;
  const PAINT_HOST_BUDGET = 600;
  const MAX_BADGE_TEXT = 5;
  // A game board, where the site happens to name one. Queens is the only game
  // that does, so the rest are found by shape: see syncGameBoard.
  const GAME_BOARD_SELECTOR = "#queens-game-board,#queens-grid,#trail-grid";
  const MIN_BOARD_CELLS = 16;
  const MIN_CELL_PX = 24;
  const GAME_BOARD_BUDGET = 600;
  // Elements that exist only to show a count, whatever surrounds them. Every
  // number inside one is a count, however deeply it is wrapped.
  const COUNT_ELEMENT_SELECTOR = "faceplate-number,shreddit-score";
  // Twitch labels its viewer counts nowhere: the number sits in a div named
  // after the sidebar it lives in.
  const SITE_COUNT_ELEMENTS = {
    twitch: "[data-a-target='side-nav-live-status'],[data-a-target*='viewers-count'],[data-a-target*='viewer-count']",
    // Reddit's community card: members, people online, rank. Every number in it
    // is social proof, and none of them is labelled anywhere near the number.
    reddit: "shreddit-subreddit-header",
    // Facebook's comment and share counts are bare numbers in unnamed buttons,
    // with the icon drawn in CSS. A button whose whole text is a number is a
    // counter; a button with words in it keeps them.
    facebook: "[role='button']",
    /*
     * TikTok writes each count in a `<strong>` that is a *sibling* of its icon
     * button rather than inside it, so there is no control around the number and
     * nothing above it says what it is except this attribute. A structural hook
     * is the right answer for it anyway: `data-e2e` is the same in every
     * language TikTok ships, where the prose Decaf otherwise reads is not.
     */
    tiktok: "[data-e2e$='-count'],[data-e2e$='-count-container']"
  };

  /**
   * An element the site itself names as a count — `data-e2e="like-count"`,
   * `class="view-count"`.
   *
   * This is deliberately narrower than REWARD_CONTEXT on its own. A reward word
   * anywhere in an ancestor's classes is what made LinkedIn's `feed-shared-text`
   * look like a share counter and turned a year inside a post into a dash. The
   * word "count" alongside it is the site saying so on purpose, which is
   * evidence enough to mask a number that belongs to no control.
   */
  const NAMED_COUNT = /count/i;

  function countElementSelector() {
    const extra = SITE_COUNT_ELEMENTS[site];
    return extra ? `${COUNT_ELEMENT_SELECTOR},${extra}` : COUNT_ELEMENT_SELECTOR;
  }
  /*
   * How Decaf recognises its own elements.
   *
   * This used to be a list of class names, which a page could simply put on its
   * own markup: `class="decaf-notice"` around a like count was enough to opt that
   * subtree out of masking entirely. The attribute is still only a selector — it
   * has to be, because content.css needs to reach these elements and CSS can only
   * match the document — but every check is verified against a set held in the
   * isolated world, which a page cannot add to.
   */
  const OWN_ATTRIBUTE = "data-decaf-own";
  const OURS = `[${OWN_ATTRIBUTE}]`;

  /**
   * Surfaces Decaf may never empty, treat as a feed, or count feed items inside,
   * whatever the route says.
   *
   * "Messaging apps are deliberately out of scope. A conversation is not a feed,
   * and Decaf should never come between you and a message." That was written as
   * a route rule and nothing else, which left it true only for as long as every
   * route rule was right. It was not: Facebook's Marketplace prefix swept in
   * `/marketplace/inbox`, and the page-level `[role='main']` selector reaches
   * into the Messenger window Facebook docks on *every* page — including the
   * home feed, where the promise had quietly never held. Emptying that window
   * leaves its container behind holding Messenger's own gradient, which is what
   * a person sees instead of their conversation.
   *
   * So the promise is a structural guarantee now: a region that announces itself
   * as a conversation, a chat or a dialog is off limits at the point Decaf
   * decides what to touch, and no future mistake in the route table can reach
   * past it. Named by role and accessible name rather than by class, because
   * those are what these sites keep stable — and a false positive here costs a
   * feed Decaf failed to pause, which is the safe direction.
   */
  const PROTECTED_SELECTOR = [
    "[role='dialog']",
    "[role='alertdialog']",
    "[aria-label*='messenger' i]",
    "[aria-label*='message' i]",
    "[aria-label*='chat' i]",
    "[aria-label*='conversation' i]",
    "[data-pagelet*='Message' i]",
    "[data-pagelet*='Chat' i]",
    "#msg-overlay",
    ".msg-overlay-list-bubble"
  ].join(",");

  /** True for anything inside a conversation, however Decaf arrived at it. */
  function isProtected(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.(PROTECTED_SELECTOR));
  }
  const ourElements = new WeakSet();
  // What one item in a feed looks like. Used to find a feed whose container Decaf
  // no longer recognizes, and to check afterwards that no item is left showing.
  // Nothing in here may match a *part* of a single post, or Decaf would mistake
  // the inside of one post for the whole feed.
  const FEED_ITEM_SELECTOR = [
    "article",
    "[role='article']",
    "shreddit-post",
    "ytd-rich-item-renderer",
    "[data-testid='cellInnerDiv']",
    "[data-e2e='recommend-list-item-container']",
    "[data-test-id='pin']",
    "[data-id^='urn:li:activity']",
    ".thing"
  ].join(",");
  const SITE_FEED_ITEMS = {
    threads: "[data-pressable-container]",
    bluesky: "[data-testid^='feedItem']"
  };

  function feedItemSelector() {
    const extra = SITE_FEED_ITEMS[site];
    return extra ? `${FEED_ITEM_SELECTOR},${extra}` : FEED_ITEM_SELECTOR;
  }
  // Never touch text the person is writing, text that is not really text, a
  // time - "5m" reads like a count - or Decaf's own words.
  const SKIP_TEXT_PARENTS = [
    "script", "style", "textarea", "input", "select", "option", "code", "pre", "title",
    "noscript", "[contenteditable='true']", "[contenteditable='']", "[role='textbox']",
    // Decaf's own words are excluded by `isOurs` at each call site rather than
    // by this list: a selector is something a page can put on its own markup,
    // and `class="decaf-notice"` around a like count was enough to opt that
    // whole subtree out of masking.
    "time", "[datetime]"
  ].join(",");
  // Where the "Show in color" pill may sit, in the order it tries them. The
  // offsets have to match the classes in content.css.
  /** How many times the pill re-checks for site furniture that arrived late. */
  const PILL_CHECKS = 4;
  const PILL_SPOTS = [
    { right: 20, bottom: 20, classes: [] },
    { right: 20, bottom: 96, classes: ["decaf-pill-high"] },
    { right: 96, bottom: 20, classes: ["decaf-pill-aside"] },
    { right: 96, bottom: 96, classes: ["decaf-pill-high", "decaf-pill-aside"] }
  ];
  const ICON_SELECTOR = "svg[aria-label],img[alt]";
  // How far a number may sit inside a control and still be read as its count.
  // Threads nests the number five elements below its like button.
  const CONTROL_DEPTH = 6;
  const TITLE_BADGE = new RegExp(`^\\s*[([]\\s*${DIGITS}${GROUPED}*\\s*(?:${MAGNITUDE})?\\+?\\s*[)\\]]\\s*`, "u");
  const GESTURE_WINDOW_MS = 1200;
  const MAX_TEXT_LENGTH = 48;
  const MAX_PENDING_ROOTS = 64;
  /*
   * A whole-document text walk on a timeline that has been scrolled for an hour
   * is hundreds of thousands of nodes, and it happened on a 400ms cadence.
   * Anything past this bound is picked up by the next scan, which starts from
   * whatever actually changed rather than from the top.
   */
  const TEXT_NODE_BUDGET = 12000;
  /** How long to leave a feed-less page alone after a search that found nothing. */
  const NOTICE_REST_MS = 400;

  /*
   * Decaf's own elements live in the page rather than a shadow root, so that the
   * stylesheet Chrome injects for the extension is the only one that can reach
   * them. The cost is that the page's own scripts can reach them too: a site
   * could dispatch a `pointerdown` at the hold button, wait three seconds, and
   * hand itself a pass — defeating the one mechanism the whole product rests on.
   * So only a press the browser reports as real counts.
   *
   * jsdom cannot produce a trusted event at all (`isTrusted` is a non-writable
   * own property, false for anything dispatched from script), so the DOM tests
   * turn this on through `__decaf`, which lives in the isolated world and is
   * unreachable from the page. A browser test still holds the button for real.
   */
  let trustSynthetic = false;

  function fromPerson(event) {
    return Boolean(event?.isTrusted) || trustSynthetic;
  }
  /*
   * What Decaf has touched is written *in the document* rather than kept in a Set
   * here. Two Sets used to hold every masked node strongly, and every virtualized
   * feed on the list recycles post DOM as you scroll: a node the site detached
   * could never be collected, and a detached text node drags its whole ancestor
   * subtree - pictures and video included - along with it. A mark in the document
   * goes when the document lets it go.
   */
  const MASKED_TEXT_CLASS = "decaf-masked";
  const MASKED_ARIA_ATTRIBUTE = "data-decaf-aria";
  const MARK_CLASSES = [
    "decaf-badge", "decaf-feed-container", "decaf-feed-host", "decaf-feed-path",
    "decaf-comment-list", "decaf-game-board", MASKED_TEXT_CLASS
  ];

  /*
   * With `all_frames: true` a same-origin subframe gets the stylesheet and the
   * runtime too - YouTube's live chat is one, and it used to sit in full colour
   * with live counts beside a grayscaled player. Everything that must exist once
   * per tab is guarded on this: the card, the colour offer, the chip, the tab
   * title, the boot blank and the route watcher. Masking and grayscale run
   * everywhere, because they are per-document by nature.
   */
  /*
   * `let`, not `const`, only so the DOM tests can stand in for a subframe:
   * jsdom's `window.top` is non-configurable, so the comparison below cannot be
   * faked from outside, and its iframes have no URL of their own to route on.
   * Set through `__decaf`, which lives in the isolated world and is unreachable
   * from the page. The browser tests use a real frame.
   */
  let isTopFrame = (() => {
    try {
      return window.top === window;
    } catch (_) {
      // A cross-origin ancestor. Not the top frame as far as we can act.
      return false;
    }
  })();

  let settings = null;
  let site = D.getSite(location.href);
  let route = D.getRoute(location.href);
  let active = false;
  let hidingFeed = false;
  let colorGranted = false;
  let observedUrl = location.href;
  // Which page this is, ignoring the params and hashes a site rewrites while you
  // stay on it. See D.getPageKey.
  let pageKey = D.getPageKey(location.href);
  let observer = null;
  let scanHandle = null;
  let scanTimer = null;
  let pendingDocument = false;
  const pendingRoots = new Set();
  let passTimer = null;
  let chipTimer = null;
  let chipHideTimer = null;
  let bootTimer = null;
  let urlTimer = null;
  let pillCheckTimer = null;
  let pillChecks = 0;
  let lastGestureAt = 0;
  let originalTitle = "";
  let maskedTitle = "";
  let passEnded = false;

  let notice = null;
  let noticeParts = null;
  let chip = null;
  let pill = null;
  let hold = null;
  let counter = null;
  let counterParts = null;
  let counterTicker = null;
  let orphanTimer = null;
  let noticeFrame = null;
  let noticeSearchFailedAt = 0;
  let revealed = false;
  /*
   * How the feed on this page was found: by a selector from the table, by its
   * shape, or not at all. The popup used to assert "This feed is paused" purely
   * from the URL, so when a redesign outran a selector it stated something the
   * runtime knew to be false. Nothing is stored and nothing is sent anywhere —
   * the popup asks this tab, and only while it is open.
   */
  let anchorKind = "none";

  const originalText = new WeakMap();
  const originalAria = new WeakMap();

  /* ------------------------------------------------------------- helpers -- */

  const root = () => document.documentElement;

  function queryWithin(node, selector) {
    if (!node) return [];
    const found = node.querySelectorAll?.(selector);
    const list = found ? Array.from(found) : [];
    if (node.matches?.(selector)) list.unshift(node);
    return list;
  }

  function isOurs(node) {
    let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (element) {
      if (ourElements.has(element)) return true;
      // Only climb through elements claiming to be ours; anything else means the
      // subtree above belongs to the site.
      element = element.closest?.(OURS);
      if (!element) return false;
      if (ourElements.has(element)) return true;
      element = element.parentElement;
    }
    return false;
  }

  /** Claims an element as Decaf's, in the document and in the isolated world. */
  function own(element) {
    element.setAttribute(OWN_ATTRIBUTE, "");
    ourElements.add(element);
    return element;
  }

  /**
   * The notice lives inside the site, so it should match the site rather than the
   * operating system: plenty of people run a dark OS with a light YouTube.
   */
  function pageIsDark() {
    for (const element of [document.body, root()]) {
      if (!element) continue;
      const parts = getComputedStyle(element).backgroundColor?.match(/\d+(?:\.\d+)?/g);
      if (!parts || parts.length < 3) continue;
      if (parts[3] !== undefined && Number(parts[3]) < 0.5) continue;
      const [red, green, blue] = parts.slice(0, 3).map(Number);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 128;
    }
    return Boolean(globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  }

  function make(tag, className, text = "") {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  /**
   * SVG needs its own namespace, so `make` cannot build it: `createElement("svg")`
   * produces an unknown HTML element that lays out but never paints.
   *
   * `className` is set through `setAttribute` for the same reason — `className` on
   * an SVG element is a read-only `SVGAnimatedString`, and assigning to it silently
   * does nothing.
   */
  function makeSvg(tag, className, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    if (className) element.setAttribute("class", className);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
    }
    return element;
  }

  /* -------------------------------------------------------- quiet visuals -- */

  function contextText(element) {
    let current = element;
    let depth = 0;
    let text = "";
    // Stop before <html>: Decaf's own state classes live there and must never
    // count as evidence that a number is a reward count.
    while (current && depth < 4 && current !== root()) {
      for (const name of CONTEXT_ATTRIBUTES) {
        const value = current.getAttribute?.(name);
        if (value) text += ` ${value}`;
      }
      text += ` ${current.localName || ""}`;
      current = current.parentElement;
      depth += 1;
    }
    return readable(`${text} ${controlContext(element)}`.replace(/\bdecaf-[\w-]+/g, " "));
  }

  /** The control a number belongs to, if it belongs to one at all. */
  function controlAround(element) {
    let current = element;
    for (let depth = 0; current && depth < CONTROL_DEPTH && current !== root(); depth += 1) {
      if (isInteractive(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  /**
   * The first words that follow a number, even when the site keeps them in a
   * separate element: <span>1.8M</span><span>Views</span>.
   */
  function followingText(element) {
    let node = element;
    for (let depth = 0; node && depth < CONTROL_DEPTH && node !== root(); depth += 1) {
      let sibling = node.nextSibling;
      for (let hops = 0; sibling && hops < 3; hops += 1) {
        const text = (sibling.textContent || "").trim();
        if (text) return text.slice(0, 24);
        sibling = sibling.nextSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  /**
   * The words just before a number: "All reactions:" sits in its own element on
   * Facebook. Text that carries a number of its own ends the search, so the
   * count next door is never taken for this one's label.
   */
  function precedingText(element) {
    let node = element;
    for (let depth = 0; node && depth < CONTROL_DEPTH && node !== root(); depth += 1) {
      let sibling = node.previousSibling;
      for (let hops = 0; sibling && hops < 3; hops += 1) {
        const text = (sibling.textContent || "").trim();
        // Text with a number of its own - or a dash, which is a number Decaf
        // has already masked - is another count, not this one's label.
        if (text && !ANY_DIGIT.test(text) && !text.includes("—")) return text.slice(-24);
        sibling = sibling.previousSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  /** The label of the first icon in or just before a node, if it reads like a word. */
  function iconLabel(node) {
    const icon = node.matches?.(ICON_SELECTOR) ? node : node.querySelector?.(ICON_SELECTOR);
    const label = icon?.getAttribute("aria-label") || icon?.getAttribute("alt") || "";
    return label.length <= 24 && !ANY_DIGIT.test(label) ? label : "";
  }

  /**
   * What a number means is written on the control it belongs to, not on the
   * handful of wrappers around the number itself:
   *   <button data-testid="like" aria-label="5.8K Likes"><span>…5.8K</span>   X
   *   <div role="button"><svg aria-label="Like"><span>…1.5K</span></div>      Threads
   *   <span><svg aria-label="Like"></span><span role="button">17.6K</span>    Instagram
   * So the control is found first, then read: its own labels, then the label of
   * an icon inside it or just before it. A number that belongs to no control -
   * a price, a date, a score in an article - is left alone.
   */
  function controlContext(element) {
    const control = controlAround(element);
    if (!control) return "";
    let text = "";
    for (const name of CONTEXT_ATTRIBUTES) {
      const value = control.getAttribute?.(name);
      if (value) text += ` ${value}`;
    }
    const inside = iconLabel(control);
    if (inside) return readable(`${text} ${inside}`);
    let sibling = control.previousElementSibling;
    for (let hops = 0; sibling && hops < 2; hops += 1) {
      const label = iconLabel(sibling);
      if (label) return readable(`${text} ${label}`);
      sibling = sibling.previousElementSibling;
    }
    return readable(text);
  }

  // A number, optionally with a K/M/B suffix, but never eating the word after it.
  /*
   * One number, and never the word after it. The grouping class has to contain a
   * plain space, because French writes "1 234" — so the pattern is bracketed by
   * digits: a separator only counts when it has a digit on both sides. Without
   * that, "1,204 views" lost its space and came out as "—views".
   */
  const NUMBER = new RegExp(`${DIGITS}(?:${GROUPED}*${DIGITS})?(?:\\s?(?:${MAGNITUDE}))?\\+?`, "gu");

  function maskNumbers(value) {
    return value.replace(NUMBER, "—").replace(/\s{2,}/g, " ").trim();
  }

  /**
   * Replaces a text node's value and remembers what was there.
   *
   * The parent is *marked*, not collected into a Set. The Sets that used to hold
   * every touched node held them strongly, and every virtualized feed on the
   * list recycles post DOM constantly: a masked node detached by the site could
   * never be collected, and a detached text node keeps its whole ancestor
   * subtree — pictures and video included — alive with it. An hour of scrolling
   * grew the tab's heap and nothing ever brought it back down. A mark in the
   * document goes when the document lets it go.
   */
  function setText(node, value) {
    const stored = originalText.get(node);
    // The site may have rewritten a value Decaf already masked. Anything that is
    // not Decaf's own dash is the new original.
    if (stored === undefined || (node.nodeValue !== value && node.nodeValue !== stored && !isMasked(node.nodeValue))) {
      originalText.set(node, node.nodeValue);
    }
    node.parentElement?.classList.add(MASKED_TEXT_CLASS);
    if (node.nodeValue !== value) node.nodeValue = value;
  }

  /** Text Decaf itself put there: a dash, or dashes and the words around them. */
  function isMasked(value) {
    return typeof value === "string" && value.includes("—") && !ANY_DIGIT.test(value);
  }

  /** Counts inside elements that exist only to show a count, however nested. */
  function maskCountElements(scope) {
    for (const element of queryWithin(scope, countElementSelector())) {
      if (isOurs(element)) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue || "";
        if (value.length <= MAX_TEXT_LENGTH && BARE_COUNT.test(value)) setText(node, "—");
        node = walker.nextNode();
      }
    }
  }

  /**
   * A number on its own is a reward count if what surrounds it says so — and if
   * it belongs to a control at all.
   *
   * The control used to be optional, and it is the whole rule. The README states
   * it correctly ("a bare number that belongs to no control is left alone, which
   * is what keeps prices, dates and anything you are typing untouched"), but the
   * code accepted a reward word found anywhere in any attribute of any of four
   * ancestors. LinkedIn's post markup is `feed-shared-update-v2` wrapping
   * `feed-shared-text`, so a post whose own line was `2019` or `1,299` was
   * rewritten to a dash: Decaf corrupting the content instead of the count.
   *
   * A label sitting immediately beside the number is different evidence, and a
   * good one — "1.8M" then "Views" — so those two keep working without a control.
   */
  function isRewardCount(element) {
    if (REWARD_NOUN_FIRST.test(followingText(element))) return true;
    if (REWARD_NOUN_LAST.test(precedingText(element))) return true;
    /*
     * A number the site has named a count needs no control around it. TikTok
     * hangs its counts off the icon button as siblings rather than children, so
     * requiring a control left every one of them showing — fourteen on a single
     * video page. Both halves have to match: `like` *and* `count`, on the
     * element's own attributes, which is what keeps LinkedIn's `feed-shared-text`
     * from qualifying a year inside a post.
     */
    const own = ownContext(element);
    if (REWARD_CONTEXT.test(own) && (NAMED_COUNT.test(own) || holdsNothingButACount(element))) return true;
    const control = controlAround(element);
    if (!control) return false;
    return REWARD_CONTEXT.test(controlContext(element)) || REWARD_CONTEXT.test(own);
  }

  /**
   * An element that exists to show one number and nothing else.
   *
   * This is what separates TikTok's `DivLikeInfo`, whose whole content is
   * `3927`, from LinkedIn's `feed-shared-text`, which wraps the body of a post
   * and merely happens to contain the word "shared". Both put a reward word in
   * their own class, so the class alone cannot tell them apart; what can is that
   * one of them holds a count and the other holds prose that contains a year.
   */
  function holdsNothingButACount(element) {
    const text = (element.textContent || "").trim();
    return text.length <= MAX_TEXT_LENGTH && BARE_COUNT.test(text);
  }

  /**
   * Puts a space at every camelCase seam, so a bounded word match can see the
   * words inside a run-together name: `DivLikeInfo` becomes `Div Like Info`.
   *
   * Bounding REWARD_CONTEXT is what stopped `view` matching `preview` and
   * `overview`, and it has to stay. But `[^a-z]` under an `i` flag excludes
   * capitals as well, so the same change blinded Decaf to every name written in
   * camelCase — which is how styled-components name things, and how TikTok
   * labels each of the fourteen counts on a video page. Separating first keeps
   * both: `Div Like Info` matches, `preview` still does not, because splitting
   * on capitals never creates a seam inside an all-lowercase word.
   */
  function readable(text) {
    return text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2");
  }

  /** The element's own attributes, without climbing into its ancestors' classes. */
  function ownContext(element) {
    let text = "";
    for (const name of CONTEXT_ATTRIBUTES) {
      const value = element.getAttribute?.(name);
      if (value) text += ` ${value}`;
    }
    return readable(text.replace(/\bdecaf-[\w-]+/g, " "));
  }

  function maskCounts(scope) {
    const start = scope.nodeType === Node.DOCUMENT_NODE ? scope.body : scope;
    if (!start || isOurs(start)) return;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    // A whole-document walk on a timeline that has been scrolled for an hour is
    // hundreds of thousands of nodes. Anything past this bound is reached by the
    // next scan, which starts from whatever actually changed.
    let budget = TEXT_NODE_BUDGET;
    while (node && budget-- > 0) {
      const value = node.nodeValue || "";
      if (value.length <= MAX_TEXT_LENGTH && ANY_DIGIT.test(value)) {
        const parent = node.parentElement;
        // `isOurs` is checked separately from the selector, and verified against
        // the isolated world: the selector alone was spoofable, so a page could
        // wrap its own counts in Decaf's marker and be skipped entirely.
        if (parent && !parent.closest(SKIP_TEXT_PARENTS) && !isOurs(parent)) {
          if (COUNT_WITH_NOUN.test(value)) setText(node, maskNumbers(value));
          else if (BARE_COUNT.test(value) && isRewardCount(parent)) {
            setText(node, "—");
            nameMaskedControl(node);
          }
        }
      }
      node = walker.nextNode();
    }
  }

  /**
   * Position labels - "3 of 5", "Photo 2 / 4". A carousel tells a screen reader
   * user where they are with exactly this shape, and masking it left them with
   * "Preview image - of -": Decaf making the page less usable for assistive
   * technology than the untouched site was.
   */
  const POSITION_LABEL = new RegExp(`${DIGITS}+\\s*(?:of|/|von|de|di|van|z)\\s*${DIGITS}+`, "iu");

  function maskAriaCounts(scope) {
    for (const element of queryWithin(scope, "[aria-label]")) {
      if (isOurs(element)) continue;
      const label = element.getAttribute("aria-label") || "";
      if (!ANY_DIGIT.test(label) || POSITION_LABEL.test(label)) continue;
      /*
       * The reward word has to sit against the number, not merely somewhere in
       * the string. Unanchored, `view` matched "Preview image 3 of 5" and
       * `share` matched "shared", so ordinary labels came back full of dashes
       * and a screen reader user lost the one thing the label was there to say.
       *
       * Facebook labels each reaction "Love: 47 people" and leaves the word
       * "reactions" on the group they sit in, so the element's own attributes
       * still count as evidence - but only its own, not four ancestors' worth.
       */
      const beside = COUNT_WITH_NOUN.test(label) ||
        REWARD_NOUN_FIRST.test(label) ||
        REWARD_NOUN_LAST.test(label.replace(new RegExp(`${DIGITS}${GROUPED}*\\s*$`, "u"), ""));
      if (!beside && !REWARD_CONTEXT.test(ownContext(element))) continue;
      const masked = maskNumbers(label);
      if (masked === label) continue;
      if (!originalAria.has(element)) originalAria.set(element, label);
      element.setAttribute(MASKED_ARIA_ATTRIBUTE, "");
      element.setAttribute("aria-label", masked);
    }
  }

  /**
   * A control whose whole name was its count is left called "-", and most screen
   * readers do not speak an em dash at their default punctuation level: the
   * announcement collapses to "button", an unnamed control. Instagram's like
   * count, Facebook's comment and share buttons and Reddit's score all land
   * there. Decaf knows what the control is - that is how it decided to mask it -
   * so it can say so instead.
   */
  function nameMaskedControl(node) {
    const control = controlAround(node.parentElement);
    if (!control || control.getAttribute("aria-label")) return;
    if ((control.textContent || "").replace(/[\u2014\s]/g, "")) return;
    const match = `${ownContext(control)} ${controlContext(control)}`.match(REWARD_CONTEXT);
    const noun = match ? match[0].replace(/[^a-z]/gi, "").toLowerCase() : "";
    if (!originalAria.has(control)) originalAria.set(control, null);
    control.setAttribute(MASKED_ARIA_ATTRIBUTE, "");
    control.setAttribute("aria-label", noun ? `${noun} count hidden by Decaf` : "count hidden by Decaf");
  }

  function isInteractive(element) {
    return Boolean(element.matches?.("a,button,input,select,textarea,[role='button'],[role='link'],[role='tab'],[role='menuitem']"));
  }

  /*
   * Nothing on a game board is a notification badge.
   *
   * A Queens cell meets every test for one and does so honestly: it is 45x45,
   * holds a single crown and no text, and is painted a strong colour — because
   * the colour *is* the puzzle. The board is already exempt from the grayscale,
   * but the badge mark is a second, separate treatment, and "Hide notification
   * counts" turns it into `display: none`. That takes the crowns off the board
   * and the regions with them, which is not a calmer game, it is a broken one.
   */
  function onGameBoard(element) {
    // Both forms, because the two are available at different moments: the named
    // board can be recognised immediately, while the marked class only exists
    // after `syncGameBoard` has run — and badges are marked before it, so a
    // guard that trusted the class alone would be inert on the first pass.
    return Boolean(element?.closest?.(`${GAME_BOARD_SELECTOR},.decaf-game-board`));
  }

  function markBadge(element) {
    if (route === "game" && onGameBoard(element)) return;
    const target = paintedBadge(element);
    if (target.classList.contains("decaf-badge")) return;
    if (route === "game" && onGameBoard(target)) return;
    target.classList.add("decaf-badge");
  }

  /** Badge-sized: a nudge in the corner of an icon, not a region of the page. */
  function badgeSized(element) {
    const rect = element.getBoundingClientRect?.();
    return !(rect && (rect.width > 90 || rect.height > 46));
  }

  /**
   * An element a site itself calls a badge. The name is the evidence, so the
   * text is not examined: LinkedIn's badge holds "1" for the eye and "1 new
   * notification" for a screen reader, and its red dot holds only the words.
   */
  function looksLikeBadge(element) {
    if (isInteractive(element) || isOurs(element)) return false;
    return badgeSized(element);
  }

  /**
   * A background a site chose to be noticed. Hue is not the signal, saturation
   * is: Instagram and Twitch paint an unread count red, X and YouTube paint the
   * same idea blue. Grey, white and black are the page's own furniture, so a
   * strongly coloured background is what tells a badge apart from a wrapper.
   */
  function alarmingBackground(value) {
    const [red, green, blue, alpha = 1] = (String(value).match(/[\d.]+/g) || []).map(Number);
    if (![red, green, blue].every(Number.isFinite)) return false;
    if (!(alpha > 0.3)) return false;
    const brightest = Math.max(red, green, blue);
    return brightest > 100 && brightest - Math.min(red, green, blue) > 40;
  }

  /**
   * The element that actually carries a badge's colour. A filter applies to an
   * element and everything inside it, never to what is around it, so marking the
   * number inside a coloured pill would drain the number and leave the pill lit.
   * Instagram wraps its count in exactly that shape, so the mark climbs to the
   * paint — but never past the control, which must keep working and looking
   * like itself.
   */
  function paintedBadge(element) {
    let found = element;
    let current = element;
    for (let depth = 0; current && depth < 4 && current !== root(); depth += 1) {
      if (isInteractive(current) || isOurs(current)) break;
      if (badgeSized(current) && alarmingBackground(getComputedStyle(current).backgroundColor)) found = current;
      current = current.parentElement;
    }
    return found;
  }

  /**
   * A coloured dot with no number in it. LinkedIn draws one over the Home icon
   * with nothing to identify it: hashed class names, no text, no attributes.
   * Its colour and its size are the only things left to go on.
   */
  function looksLikeAlertDot(element) {
    if (isInteractive(element) || isOurs(element) || element.children.length) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 4 || rect.width > 24 || rect.height < 4 || rect.height > 24) return false;
    return alarmingBackground(getComputedStyle(element).backgroundColor);
  }

  /** An unnamed span in a navigation control, holding nothing but a count. */
  function looksLikeCountBadge(element) {
    if (isInteractive(element) || isOurs(element) || element.children.length) return false;
    const text = element.textContent?.trim() || "";
    // A dash is a count Decaf masked a moment ago, still a badge.
    if (!text || text.length > MAX_BADGE_TEXT || !(BARE_COUNT.test(text) || text === "—")) return false;
    return badgeSized(element);
  }

  /**
   * The shape of a badge, before its colour is looked at. Everything here is
   * cheap, because it decides whether measuring the element's style is worth it.
   *
   * One child is allowed, which is the point: a site that wraps the number in a
   * span — Instagram does — paints the wrapper, not the number, and the wrapper
   * is the element that has to be marked.
   */
  function badgeShaped(element) {
    if (isInteractive(element) || isOurs(element)) return false;
    if (element.children.length > 1) return false;
    const text = element.textContent?.trim() || "";
    if (text.length > MAX_BADGE_TEXT) return false;
    // Empty is a dot; anything with words in it is a label, a tooltip or a
    // button, and none of those is a badge.
    if (text && !(BARE_COUNT.test(text) || text === "—")) return false;
    return badgeSized(element) && isRendered(element);
  }

  /**
   * A badge a site paints but never names.
   *
   * Instagram's sidebar is a stack of plain divs with hashed class names and no
   * landmark of any kind, so nothing in the markup says "badge" and nothing says
   * "navigation" either. What is left is what it looks like: a small shape,
   * painted to be noticed, holding nothing but a short count, sitting on
   * something clickable. A reward count is plain text on the page's own
   * background, so it can never be mistaken for one of these.
   */
  function markPaintedBadges(scope) {
    let styleBudget = PAINT_STYLE_BUDGET;
    let hostBudget = PAINT_HOST_BUDGET;
    for (const host of queryWithin(scope, PAINT_HOST_SELECTOR)) {
      if (styleBudget <= 0 || hostBudget-- <= 0) return;
      if (isOurs(host) || !isRendered(host)) continue;
      // A badge rides on a piece of site furniture. Something this small inside
      // a container the size of a post is the site's own artwork, so only a
      // region a site itself calls navigation is allowed to be large.
      const rect = host.getBoundingClientRect?.();
      const oversized = rect && (rect.width > 400 || rect.height > 160);
      if (oversized && !host.matches?.(BADGE_REGION_SELECTOR)) continue;
      for (const element of host.querySelectorAll("span,div,em,strong,i,b")) {
        if (!badgeShaped(element)) continue;
        if (styleBudget-- <= 0) return;
        if (alarmingBackground(getComputedStyle(element).backgroundColor)) markBadge(element);
      }
    }
  }

  /**
   * Badges are marked, not removed. By default content.css only drains the color
   * out of them so a real message still gets noticed; "Hide notification counts"
   * turns the same mark into display: none.
   */
  function markBadges(scope) {
    for (const element of queryWithin(scope, BADGE_SELECTOR)) {
      if (looksLikeBadge(element)) markBadge(element);
    }
    // A small number inside a navigation control is a nudge, never content.
    // Anything longer, or not inside a control, is left alone: page numbers and
    // labels in a nav are real information.
    for (const region of queryWithin(scope, BADGE_REGION_SELECTOR)) {
      for (const element of region.querySelectorAll("span,div,em,strong,i,b")) {
        if (!looksLikeCountBadge(element) && !looksLikeAlertDot(element)) continue;
        if (!element.closest(CONTROL_SELECTOR)) continue;
        markBadge(element);
      }
    }
    // Sites that name nothing and mark up no landmarks are left. They still
    // paint, so the colour is what finds the badge.
    markPaintedBadges(scope);
  }

  function quietTitle() {
    const title = document.title || "";
    if (!TITLE_BADGE.test(title)) {
      if (title !== maskedTitle) {
        originalTitle = "";
        maskedTitle = "";
      }
      return;
    }
    originalTitle = title;
    maskedTitle = title.replace(TITLE_BADGE, "");
    document.title = maskedTitle;
  }

  /**
   * Puts the page back exactly as it was, reading what to undo out of the
   * document rather than out of a list Decaf kept. Anything the site has since
   * thrown away simply is not found, which is the point.
   */
  function restoreQuiet() {
    for (const element of document.querySelectorAll(MARK_CLASSES.map((name) => `.${name}`).join(","))) {
      element.classList.remove(...MARK_CLASSES);
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !originalText.has(node)) continue;
        const value = originalText.get(node);
        if (node.nodeValue !== value) node.nodeValue = value;
        originalText.delete(node);
      }
    }
    for (const element of document.querySelectorAll(`[${MASKED_ARIA_ATTRIBUTE}]`)) {
      element.removeAttribute(MASKED_ARIA_ATTRIBUTE);
      if (!originalAria.has(element)) continue;
      const value = originalAria.get(element);
      if (value === null) element.removeAttribute("aria-label");
      else element.setAttribute("aria-label", value);
      originalAria.delete(element);
    }
    if (maskedTitle && document.title === maskedTitle && originalTitle) document.title = originalTitle;
    originalTitle = "";
    maskedTitle = "";
  }

  /* -------------------------------------------------------- autoplay guard -- */

  function isGuardedPlayback() {
    if (!active || !settings?.pauseFeeds) return false;
    if (route === "media") return false;
    return !(route === "feed" && D.isPassActive(settings, site));
  }

  function onPlay(event) {
    const video = event.target;
    if (!video?.matches?.("video") || !active) return;
    if (hidingFeed) {
      // Nothing on a paused feed should be playing, in view or not.
      video.pause();
      return;
    }
    if (!isGuardedPlayback()) return;
    // Audible playback, or playback right after a click, is intentional.
    if (!video.muted) return;
    if (Date.now() - lastGestureAt < GESTURE_WINDOW_MS) return;
    video.pause();
    video.removeAttribute("autoplay");
  }

  function pauseEveryVideo() {
    for (const video of document.querySelectorAll("video")) {
      try {
        video.pause();
      } catch (_) {
        // Some players wrap pause(); nothing to do if it refuses.
      }
    }
  }

  function noteGesture(event) {
    // A page dispatching its own pointerdown could otherwise keep this window
    // permanently open and play muted video behind a paused feed.
    if (!fromPerson(event)) return;
    lastGestureAt = Date.now();
  }

  /* --------------------------------------------------------- paused feeds -- */

  /**
   * The containers content.css is emptying, outermost first. The notice goes
   * inside one of them, which is why the stylesheet empties a container rather
   * than hiding it: the container keeps its place in the site's layout, so
   * nothing around it moves.
   */
  function findFeedAnchors() {
    const matches = new Set();
    // A container already found by shape stays the anchor: once it is hidden its
    // items stop being rendered, so it could never be found a second time.
    for (const element of document.querySelectorAll(".decaf-feed-container")) matches.add(element);
    for (const selector of D.feedSelectors(site)) {
      let found = [];
      try {
        found = document.querySelectorAll(selector);
      } catch (_) {
        continue;
      }
      for (const element of found) matches.add(element);
    }
    // A conversation is never a feed, whatever the selector table matched.
    const list = Array.from(matches).filter((element) => element.parentElement && !isProtected(element));
    const outermost = list.filter((element) => !list.some((other) => other !== element && other.contains(element)));
    // Document order, so the notice lands where the feed started.
    outermost.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return outermost;
  }

  /**
   * A container can be too narrow to hold the card, or sit inside something the
   * site clips. Either way the card would be unreadable, so the placement is
   * checked and the next container tried instead.
   */
  function isPlacedWell(element) {
    if (!isRendered(element)) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return true;
    if (!rect.width && !rect.height) return !hasLayout();
    if (rect.width < 240) return false;
    let parent = element.parentElement;
    while (parent && parent !== root() && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (style.overflowX === "hidden" || style.overflowY === "hidden") {
        const box = parent.getBoundingClientRect();
        // Clipped at the top or the sides is unreachable; below the fold is fine,
        // because the page can be scrolled.
        if (rect.top < box.top - 1 || rect.left < box.left - 1 || rect.right > box.right + 1) return false;
      }
      parent = parent.parentElement;
    }
    return true;
  }

  /**
   * Marks the elements between the notice and the page root. While a feed is
   * paused they must not clip it: a container sized for a feed can be shorter
   * than the card in a small window, and the card would be cut off.
   */
  function markNoticePath() {
    for (const element of document.querySelectorAll(".decaf-feed-path")) {
      element.classList.remove("decaf-feed-path");
    }
    if (!notice?.isConnected) return;
    const card = notice.getBoundingClientRect?.();
    let parent = notice.parentElement;
    while (parent && parent !== root() && parent !== document.body) {
      /*
       * Only unclip what is actually clipping.
       *
       * This used to force `overflow: visible` on every ancestor up to <body>,
       * which on an app-shell layout — Twitch's scrollable root, the React Native
       * Web shells Threads and Bluesky use — includes the element the site
       * scrolls. An element with `overflow: visible` is not a scroll container,
       * so the page stopped scrolling at all.
       */
      const style = hasLayout() ? getComputedStyle(parent) : null;
      const clips = !style || /hidden|clip/.test(`${style.overflowX} ${style.overflowY}`);
      const scrolls = style && /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`) &&
        parent.scrollHeight > parent.clientHeight + 1;
      if (clips && !scrolls && cutsOff(parent, card)) parent.classList.add("decaf-feed-path");
      parent = parent.parentElement;
    }
  }

  /** True when this box would cut the card off, rather than merely contain it. */
  function cutsOff(element, card) {
    if (!card || (!card.width && !card.height)) return true;
    const box = element.getBoundingClientRect?.();
    if (!box) return true;
    // Below the fold is fine: the page can be scrolled to it.
    return card.top < box.top - 1 || card.left < box.left - 1 || card.right > box.right + 1 ||
      box.height < card.height - 1;
  }

  function setFeedHost(element) {
    for (const previous of document.querySelectorAll(".decaf-feed-host")) {
      if (previous !== element) previous.classList.remove("decaf-feed-host");
    }
    if (!element || element.classList.contains("decaf-feed-host")) return;
    element.classList.add("decaf-feed-host");
  }

  /** False in a layout-less environment (tests, print), where nothing can be measured. */
  function hasLayout() {
    return Boolean(document.body?.getClientRects?.().length);
  }

  function isRendered(element) {
    const rects = element.getClientRects?.();
    if (!rects) return true;
    if (rects.length) return true;
    // Somewhere with no layout at all should still get the fallback rather than
    // nothing.
    return !hasLayout();
  }

  /** Feed items that are still on screen, ignoring anything inside the notice. */
  function visibleFeedItems() {
    const selector = feedItemSelector();
    return Array.from(document.querySelectorAll(selector)).filter(
      // Messages carry `[role='article']` on some of these sites, so without the
      // guard `enforceEmptyFeed` would find a conversation's messages, decide
      // they were the feed it had failed to empty, and empty the conversation.
      (item) => !isOurs(item) && !isProtected(item) && !notice?.contains(item) && isRendered(item)
    );
  }

  function commonAncestor(elements) {
    let ancestor = elements[0];
    for (const element of elements.slice(1)) {
      while (ancestor && !ancestor.contains(element)) ancestor = ancestor.parentElement;
      if (!ancestor) return null;
    }
    return ancestor;
  }

  /**
   * The container of a set of feed items — and never a piece of one item. Without
   * that rule the wrapper around a single post can be mistaken for the whole feed,
   * which leaves one post on screen with a hole where its picture was. Climbing
   * any higher is left to `enforceEmptyFeed`, so a header or sidebar that happens
   * to sit above the feed is never swallowed.
   */
  function containerFor(items) {
    const selector = feedItemSelector();
    let ancestor = commonAncestor(items);
    while (ancestor && ancestor !== document.body && ancestor !== root()) {
      const inside = ancestor.closest?.(selector);
      if (!inside) break;
      ancestor = inside.parentElement;
    }
    if (!ancestor || ancestor === document.body || ancestor === root() || !ancestor.parentElement) return null;
    return ancestor;
  }

  /**
   * If a site has redesigned past every selector in the table, find the feed the
   * hard way: the container holding several feed items. Marking it lets the same
   * CSS empty it, so a redesign degrades to a brief flash of feed rather than a
   * notice claiming a feed is paused while it is not.
   */
  function findFeedByShape() {
    const items = visibleFeedItems().slice(0, 12);
    if (items.length < 3) return null;
    return containerFor(items);
  }

  function markFeedContainer(element) {
    if (!element || element.classList.contains("decaf-feed-container")) return;
    element.classList.add("decaf-feed-container");
  }

  function clearFeedContainers() {
    for (const element of document.querySelectorAll(".decaf-feed-container,.decaf-feed-host,.decaf-feed-path")) {
      element.classList.remove("decaf-feed-container", "decaf-feed-host", "decaf-feed-path");
    }
  }

  function holdHint() {
    const count = D.passCount(settings, site);
    const seconds = D.holdSeconds(count, D.isLocked(settings));
    const parts = [`Hold for ${seconds} seconds`];
    if (count > 0) parts.push(`${D.ordinal(count + 1)} time today`);
    return parts.join(" · ");
  }

  function buildNotice() {
    const container = own(make("div", "decaf-notice"));
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Feed paused by Decaf");
    container.tabIndex = -1;
    /*
     * A screen reader picks its voice and its pronunciation rules from the
     * inherited `lang`. On a French, German or Japanese page the one piece of UI
     * that explains what just happened to the feed was being read out by a
     * synthesiser using the wrong language's phonemes, which for English words is
     * close to unintelligible. The direction is stated for the same reason: these
     * strings are left-to-right whatever the page around them is doing.
     */
    container.lang = "en";
    container.dir = "ltr";

    const title = make("h2", "decaf-notice-title", `Decaf paused the ${D.siteLabel(site, settings)} feed.`);
    const body = make("p", "decaf-notice-body", "Search, messages and anything you open on purpose still work.");

    const button = make("button", "decaf-notice-hold");
    button.type = "button";
    button.setAttribute("aria-describedby", "decaf-notice-hint");

    /*
     * The progress ring.
     *
     * This was a bar that wiped across the whole button, which worked but looked
     * like a download. A ring reads as a deliberate wait — the same shape a camera
     * shutter or a "hold to confirm" uses — and it leaves the button's own surface
     * alone, so the label stays legible the whole way through instead of being
     * overrun by a moving background.
     *
     * The ring keeps `.decaf-notice-fill` as its class. The name is still accurate,
     * and the browser test that proves the hold is not a dead button finds the
     * animating element by it.
     */
    const ring = makeSvg("svg", "decaf-notice-ring", {
      viewBox: "0 0 44 44",
      "aria-hidden": "true",
      focusable: "false"
    });
    ring.append(
      makeSvg("circle", "decaf-notice-track", { cx: 22, cy: 22, r: 19 }),
      makeSvg("circle", "decaf-notice-fill", { cx: 22, cy: 22, r: 19 })
    );

    const label = make("span", "decaf-notice-label", `Hold to open for ${D.PASS_MINUTES} minutes`);
    button.append(ring, label);

    const hint = make("p", "decaf-notice-hint", holdHint());
    hint.id = "decaf-notice-hint";
    const status = make("p", "decaf-notice-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    /*
     * The one way out of the card that is not the hold.
     *
     * The card is the only Decaf surface most people will ever see, and it was a
     * closed room: someone who cannot sustain a press — a tremor, a trackpad that
     * drops contact, switch access — was told nothing about the alternative the
     * README says exists, and reaching it meant knowing a toolbar icon existed at
     * all, finding it behind Chrome's puzzle menu, opening the popup, opening
     * settings and scrolling to the site list. This is not a skip button: the
     * hold is still the only way to open the feed.
     */
    const escape = make("button", "decaf-notice-escape", "Can't hold? Open Decaf settings");
    escape.type = "button";
    escape.addEventListener("click", (event) => {
      if (!fromPerson(event)) return;
      try {
        chrome.runtime.sendMessage({ type: "open-options" });
      } catch (_) {
        // The extension was reloaded under this page. Nothing useful to say.
      }
    });

    container.append(title, body, button, hint, status, escape);
    noticeParts = { container, title, body, button, label, hint, status, escape };
    attachHold(button, label, status);
    return container;
  }

  /** How many steps the ring is drawn in when the person asked for no motion. */
  const HOLD_STEPS = 8;

  function stopHold({ silent = false } = {}) {
    if (!hold) return;
    clearTimeout(hold.timer);
    clearInterval(hold.ticker);
    const { button, label, startedAt, seconds } = hold;
    button.dataset.holding = "false";
    delete button.dataset.progress;
    button.classList.remove(hold.className);
    label.textContent = `Hold to open for ${D.PASS_MINUTES} minutes`;
    hold = null;
    if (noticeParts) noticeParts.hint.hidden = false;
    if (silent || !noticeParts) return;
    /*
     * The most likely first interaction with Decaf is a *click* on this button:
     * a hundred-millisecond hold. Everything used to snap back to exactly the
     * pre-click state with no message at all, which is indistinguishable from a
     * broken extension — on the very first feed someone opens. The same silence
     * covered a hold that slipped and a trackpad that lost contact.
     */
    const held = Date.now() - startedAt;
    noticeParts.status.textContent = held < seconds * 1000
      ? `Not quite — keep holding until the ring fills (${seconds} seconds).`
      : "";
  }

  function attachHold(button, label, status) {
    const begin = (event) => {
      if (hold) return;
      /*
       * A page can reach into this button — Decaf's elements live in the page so
       * the extension's own stylesheet is the only one that can style them — and
       * a synthetic `pointerdown` followed by three seconds of waiting was enough
       * for a site to hand itself a pass. Only a real press counts.
       */
      if (!fromPerson(event)) return;
      if (event.type === "pointerdown" && event.button > 0) return;
      const seconds = D.holdSeconds(D.passCount(settings, site), D.isLocked(settings));
      const className = `decaf-hold-${seconds}`;
      button.dataset.holding = "true";
      button.dataset.progress = "0";
      button.classList.add(className);
      label.textContent = "Keep holding…";
      // The hint and the announcement would otherwise say the same thing twice.
      if (noticeParts) noticeParts.hint.hidden = true;
      status.textContent = `Keep holding for ${seconds} seconds.`;
      hold = {
        button,
        label,
        className,
        seconds,
        startedAt: Date.now(),
        /*
         * Reduced motion means "do not animate", not "do not tell me what is
         * happening". Under that setting the ring is drawn at a fixed state, so
         * without this the one graphic on screen showed *finished* for the whole
         * wait — up to nineteen seconds of no feedback at all, which most people
         * read as a dead button. The steps are classes, not styles: content.js
         * never writes CSS.
         */
        ticker: setInterval(() => {
          if (!hold) return;
          const done = Math.min(HOLD_STEPS, Math.round((Date.now() - hold.startedAt) / (seconds * 1000 / HOLD_STEPS)));
          button.dataset.progress = String(done);
          const left = Math.max(0, Math.ceil(seconds - (Date.now() - hold.startedAt) / 1000));
          if (left) status.textContent = `Keep holding — ${left}…`;
        }, Math.max(200, (seconds * 1000) / HOLD_STEPS)),
        timer: setTimeout(() => {
          stopHold({ silent: true });
          grantPass();
        }, seconds * 1000)
      };
    };

    button.addEventListener("pointerdown", (event) => {
      button.setPointerCapture?.(event.pointerId);
      begin(event);
    });
    // `lostpointercapture` covers the cases the others miss: the tab being
    // backgrounded mid-hold, and a drag that leaves the window entirely.
    for (const type of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture", "blur"]) {
      button.addEventListener(type, () => stopHold());
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopHold();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      begin(event);
    });
    button.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") stopHold();
    });
    /*
     * Assistive technology activates a control by dispatching a click, not by
     * synthesising a pointer or key sequence: NVDA and JAWS in browse mode,
     * Voice Control, Dragon and switch access all do. None of them produced
     * anything here, so the only in-page way to open a feed did nothing at all
     * and said nothing about why. A real press is already swallowed above — a
     * keyboard press is `preventDefault`ed and a mouse click arrives with
     * `detail > 0` after a pointerdown this code saw — so what is left is an
     * activation with no press behind it. It gets the same wait, spent once
     * rather than held.
     */
    button.addEventListener("click", (event) => {
      if (!fromPerson(event) || hold || event.detail > 0) return;
      if (button.dataset.confirming === "ready") {
        delete button.dataset.confirming;
        grantPass();
        return;
      }
      if (button.dataset.confirming === "waiting") return;
      const seconds = D.holdSeconds(D.passCount(settings, site), D.isLocked(settings));
      button.dataset.confirming = "waiting";
      label.textContent = `Press again in ${seconds} seconds`;
      status.textContent = `Press this button again in ${seconds} seconds to open the feed.`;
      setTimeout(() => {
        if (!noticeParts || button.dataset.confirming !== "waiting") return;
        button.dataset.confirming = "ready";
        label.textContent = "Press again to open the feed";
        status.textContent = "Ready — press again to open the feed.";
      }, seconds * 1000);
    });
  }

  /**
   * A page that was scrolled before the feed was paused can leave the card above
   * the fold, which reads as a card that has been cut off. Bring it into view the
   * first time it is placed, and never fight the person's own scrolling after that.
   */
  function revealNotice() {
    // Once, when the card first lands. `placeNotice` recomputes placement
    // whenever the site redraws around it, and scrolling the page each time
    // fights whoever is reading it.
    if (revealed || !hasLayout() || typeof notice.scrollIntoView !== "function") return;
    const rect = notice.getBoundingClientRect();
    const height = window.innerHeight || root().clientHeight;
    if (rect.top >= 0 && rect.bottom <= height) return;
    revealed = true;
    try {
      notice.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (_) {
      notice.scrollIntoView();
    }
  }

  const DROP_CLASSES = ["decaf-drop-1", "decaf-drop-2", "decaf-drop-3", "decaf-drop-4"];

  /**
   * Sites put translucent overlays under their fixed header — YouTube's
   * #frosted-glass reaches 56px below the masthead — and they paint over the top
   * of the card. Step the card down until its top edge is in the clear.
   */
  function clearTopOverlay() {
    if (!hasLayout() || !notice) return;
    notice.classList.remove(...DROP_CLASSES);
    for (const className of DROP_CLASSES) {
      const rect = notice.getBoundingClientRect();
      if (rect.top < 0) return;
      const covering = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + 2));
      if (!covering || covering === notice || notice.contains(covering)) return;
      let element = covering;
      let overlay = null;
      while (element && element !== root()) {
        const position = getComputedStyle(element).position;
        if (position === "fixed" || position === "sticky") {
          overlay = element;
          break;
        }
        element = element.parentElement;
      }
      if (!overlay) return;
      notice.classList.add(className);
    }
  }

  function placeNotice(candidates) {
    if (notice.isConnected && candidates.includes(notice.parentElement) && isPlacedWell(notice)) {
      setFeedHost(notice.parentElement);
      markNoticePath();
      clearTopOverlay();
      return true;
    }
    // A container can sit inside something the site hides or clips, so try each
    // one and keep the placement that is genuinely readable.
    for (const candidate of candidates) {
      candidate.prepend(notice);
      setFeedHost(candidate);
      markNoticePath();
      if (isPlacedWell(notice)) {
        revealNotice();
        clearTopOverlay();
        return true;
      }
    }
    setFeedHost(null);
    document.body.prepend(notice);
    markNoticePath();
    revealNotice();
    clearTopOverlay();
    return false;
  }

  /**
   * Last line of defence: if any feed item is still on screen after the notice is
   * placed, the container Decaf chose was the wrong one. Empty the container those
   * leftovers actually live in and place the notice again.
   */
  function enforceEmptyFeed() {
    // Without layout there is no way to tell what is on screen, and the check
    // would escalate against elements the stylesheet has already dealt with.
    if (!hasLayout()) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const leftovers = visibleFeedItems();
      if (!leftovers.length) return;
      const container = containerFor(leftovers.slice(0, 12));
      if (!container) return;
      // Never hide the card itself, and never loop on a container that has
      // already been emptied.
      if (notice.contains(container)) return;
      if (container.classList.contains("decaf-feed-container")) return;
      markFeedContainer(container);
      placeNotice(findFeedAnchors());
    }
  }

  function syncNotice() {
    if (!hidingFeed) {
      removeNotice();
      return;
    }
    if (!document.body) return;

    const candidates = findFeedAnchors();
    anchorKind = "selector";
    if (!candidates.length) {
      // Nothing feed-shaped is on the page: an interstitial, a sign-in wall, or
      // markup Decaf no longer recognizes. Look for the feed by its items, and
      // if there is none, say nothing rather than claim a feed was paused.
      const shaped = findFeedByShape();
      if (!shaped) {
        anchorKind = "none";
        removeNotice();
        return;
      }
      anchorKind = "shape";
      markFeedContainer(shaped);
      candidates.push(shaped);
    }

    const first = !notice;
    if (!notice) notice = buildNotice();
    notice.classList.toggle("decaf-dark", pageIsDark());
    noticeParts.title.textContent = `Decaf paused the ${D.siteLabel(site, settings)} feed.`;
    if (!hold) noticeParts.hint.textContent = holdHint();
    if (passEnded) noticeParts.status.textContent = `Your ${D.PASS_MINUTES} minutes are up.`;

    placeNotice(candidates);
    enforceEmptyFeed();

    /*
     * The feed the person was reading has just been emptied underneath them. If
     * their focus was inside it, it is now on a detached node and their next Tab
     * starts at the top of the site. Move it to the card, which explains what
     * happened and holds the only control that matters.
     */
    if (!first || !hasLayout()) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body && !notice.contains(focused) && !focused.isConnected) {
      try {
        notice.focus({ preventScroll: true });
      } catch (_) {
        notice.focus();
      }
    }
  }

  function removeNotice() {
    clearFeedContainers();
    revealed = false;
    if (!notice) return;
    stopHold({ silent: true });
    notice.remove();
    notice = null;
    noticeParts = null;
  }

  async function grantPass() {
    /*
     * The button about to be detached is the element that currently has focus.
     * Chrome resets focus to <body> when that happens, so a keyboard user who
     * just spent fifteen seconds earning the feed had their next Tab start at the
     * very top of the site — through the whole masthead and sidebar to reach the
     * thing they had earned.
     */
    const hadFocus = noticeParts?.button === document.activeElement ||
      noticeParts?.container?.contains(document.activeElement);
    const next = D.grantPass(settings, site);
    const patch = D.createStoragePatch(settings, next);
    settings = next;
    passEnded = false;
    apply();
    showChip(`Feed open for ${D.PASS_MINUTES} minutes`);
    if (hadFocus) focusFeed();
    try {
      await chrome.storage.local.set(patch);
    } catch (_) {
      // The pass still applies to this tab even if storage is unavailable.
    }
  }

  /** Puts focus on the first thing in the feed that was just opened. */
  function focusFeed() {
    if (!hasLayout()) return;
    const target = document.querySelector(feedItemSelector()) ||
      document.querySelector(".decaf-feed-host") ||
      document.querySelector("main");
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }
  }

  /* -------------------------------------------------------- chip and pill -- */

  /**
   * A live region only announces when it was already in the accessibility tree
   * and its contents *then* change. The chip used to be created with its text
   * already set and appended in that state, so none of the three things it says —
   * that the feed is open, that thirty seconds are left, that colour was granted
   * — was ever spoken. It now lives in the page from the first need onwards and
   * only its text moves.
   */
  function ensureChip() {
    if (!isTopFrame || !document.body) return null;
    if (!chip) {
      chip = own(make("div", "decaf-chip"));
      chip.setAttribute("role", "status");
      chip.setAttribute("aria-live", "polite");
      chip.lang = "en";
      chip.dir = "ltr";
    }
    if (!chip.isConnected) document.body.append(chip);
    return chip;
  }

  function showChip(message) {
    const element = ensureChip();
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    clearTimeout(chipHideTimer);
    chipHideTimer = setTimeout(hideChip, 4200);
  }

  function hideChip() {
    clearTimeout(chipHideTimer);
    chipHideTimer = null;
    if (!chip) return;
    chip.textContent = "";
    chip.hidden = true;
  }

  /**
   * DOM fullscreen only paints the fullscreen element and its descendants. Keep
   * the offer inside that subtree while a site has a player or photo fullscreen;
   * otherwise it is still outside the fullscreen surface and cannot be used.
   */
  function pillHost() {
    const fullscreen = document.fullscreenElement;
    if (fullscreen && fullscreen !== pill && !pill?.contains(fullscreen)) return fullscreen;
    return document.body;
  }

  /**
   * Everything is grayscale, including what you opened. Some things genuinely
   * need color, so this offers it for this one page — and asks again next time.
   */
  function syncPill() {
    if (!isTopFrame) return;
    /*
     * A video or image is a replaced element: it cannot render a button appended
     * to it. Fullscreen is already an explicit request to see that media, so use
     * the same one-page color grant rather than leaving the person no way to ask.
     *
     * Picture-in-Picture is the same request by a different route, and it escapes
     * the grayscale entirely — the filter applies to the element in the document,
     * and the PiP window is painted by the browser from the raw frames. Granting
     * colour there keeps the page and the little window agreeing with each other
     * rather than silently disagreeing.
     */
    const escaped = document.fullscreenElement?.matches?.("video,img") ||
      (document.pictureInPictureElement && document.pictureInPictureElement !== null);
    if (active && route === "media" && !colorGranted && escaped) {
      colorGranted = true;
      syncRootClasses();
    }
    const wanted = active && route === "media" && !colorGranted;
    if (!wanted || !document.body) {
      pill?.remove();
      return;
    }
    if (!pill) {
      pillChecks = 0;
      pill = own(make("button", "decaf-pill", "Show in color"));
      pill.type = "button";
      pill.lang = "en";
      pill.dir = "ltr";
      pill.title = "Show this page's video or photo in full color until you leave it";
      pill.addEventListener("click", (event) => {
        if (!fromPerson(event)) return;
        colorGranted = true;
        apply();
        showChip("Full color, just for this page");
      });
    }
    const host = pillHost();
    if (pill.parentElement !== host) host.append(pill);
    placePill();
  }

  /**
   * While a pass is running the card is gone, and with it every sign that this is
   * temporary. The five minutes used to run invisibly and then take the feed away
   * mid-scroll; and the moment that matters most — "okay, I'm done" — required
   * finding a toolbar icon Chrome hides by default, which is more work than
   * carrying on scrolling. This is the only control in Decaf that lets someone
   * spend less than they asked for.
   */
  function syncPassCounter() {
    const until = active && route === "feed" && settings?.pauseFeeds ? D.passUntil(settings, site) : 0;
    if (!isTopFrame || !until || !document.body) {
      counter?.remove();
      counter = null;
      clearInterval(counterTicker);
      counterTicker = null;
      return;
    }
    if (!counter) {
      counter = own(make("div", "decaf-counter"));
      counter.lang = "en";
      counter.dir = "ltr";
      const time = make("span", "decaf-counter-time");
      const end = make("button", "decaf-counter-end", "Pause it again");
      end.type = "button";
      end.addEventListener("click", (event) => {
        if (!fromPerson(event)) return;
        endPassNow();
      });
      counter.append(time, end);
      counterParts = { time, end };
    }
    if (!counter.isConnected) document.body.append(counter);
    const draw = () => {
      const left = D.passUntil(settings, site) - Date.now();
      if (left <= 0) return;
      counterParts.time.textContent = `Feed open · ${D.formatClock(left)}`;
      counter.classList.toggle("decaf-counter-ending", left <= 30000);
    };
    draw();
    if (!counterTicker) counterTicker = setInterval(draw, 1000);
  }

  async function endPassNow() {
    const next = D.endPass(settings, site);
    const patch = D.createStoragePatch(settings, next);
    settings = next;
    apply();
    showChip("Feed paused again");
    try {
      await chrome.storage.local.set(patch);
    } catch (_) {
      // It still applies to this tab.
    }
  }

  /**
   * True when a site keeps something of its own at this point: anything pinned
   * to the window, or a small control floating over the page. A big link is not
   * counted, because a photo or a pin fills the window wherever the pill goes.
   */
  function siteFurnitureAt(x, y) {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
    return document.elementsFromPoint(x, y).some((element) => {
      if (isOurs(element) || element === document.body || element === root()) return false;
      const position = getComputedStyle(element).position;
      if (position === "fixed" || position === "sticky") return true;
      if (!isInteractive(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width <= 200 && rect.height <= 200;
    });
  }

  /**
   * Sites park their own furniture in the bottom-right corner: Instagram's
   * message dock, Threads' compose button, X's pair of round buttons, Twitch's
   * promo bar. The pill tries the corner first, then above it, then beside it,
   * and settles in the first place nothing of the site's is already sitting.
   * Docks often arrive after the page does, so the answer is checked again a
   * moment later.
   */
  function placePill() {
    if (!pill?.isConnected || !hasLayout() || !document.elementsFromPoint) return;
    const rect = pill.getBoundingClientRect();
    if (rect.width) {
      const spot = PILL_SPOTS.find(({ right, bottom }) => {
        const top = innerHeight - bottom - rect.height;
        const left = innerWidth - right - rect.width;
        // Three points across the pill: a dock can be narrow or wide.
        return ![0.1, 0.5, 0.9].some((along) =>
          siteFurnitureAt(left + rect.width * along, top + rect.height / 2));
      }) || PILL_SPOTS[PILL_SPOTS.length - 1];
      for (const candidate of PILL_SPOTS) {
        for (const name of candidate.classes) pill.classList.toggle(name, spot.classes.includes(name));
      }
    }
    /*
     * Docks often arrive after the page does, so the answer is checked again a
     * moment later — but only a few times. This used to reschedule itself for as
     * long as the pill existed, which on a video someone leaves open is a timer
     * reading layout every 2.5 seconds all afternoon.
     */
    if (!pillCheckTimer && pillChecks < PILL_CHECKS) {
      pillChecks += 1;
      pillCheckTimer = setTimeout(() => {
        pillCheckTimer = null;
        if (pill?.isConnected) placePill();
      }, 2500);
    }
  }

  /**
   * Instagram's post page has no <article> and no comment hook: the caption and the
   * comments share one scrolling panel. Mark the panel so the stylesheet can hide
   * everything after the caption.
   */
  function syncCommentPanel() {
    const wanted = active && settings.hideComments && site === "instagram" && route === "media";
    for (const element of document.querySelectorAll(".decaf-comment-list")) {
      if (!wanted) element.classList.remove("decaf-comment-list");
    }
    if (!wanted || !hasLayout()) return;
    const main = document.querySelector("main");
    if (!main || main.querySelector(".decaf-comment-list")) return;
    let looked = 0;
    for (const element of main.querySelectorAll("div")) {
      if (looked > 600) return;
      looked += 1;
      // Cheap tests first: reading style for every div on this page is enough to
      // make Instagram stutter.
      if (element.children.length !== 1) continue;
      if (element.scrollHeight <= element.clientHeight + 20) continue;
      if (isOurs(element)) continue;
      if (!/auto|scroll/.test(getComputedStyle(element).overflowY)) continue;
      if (element.querySelectorAll("a[href^='/']").length < 3) continue;
      element.classList.add("decaf-comment-list");
      return;
    }
  }

  /**
   * Mark a game's board so the stylesheet can leave it in colour.
   *
   * Everything else on a games page is drained like any other page: the nav, the
   * notification badges, the confetti, the streak artwork, and the photos of the
   * people on the leaderboard. The board is the exception, because the colour in
   * it is the puzzle — Queens is played by reading the coloured regions, and its
   * crowns are gold — and a grey board is a broken game rather than a calm one.
   *
   * LinkedIn names the board on Queens and nowhere else, and every class on the
   * page is a build hash, so the board is found by its shape instead: the square
   * grid of equally sized square cells. Only ever looked for on a game route, so
   * a grid of photos on a feed can never be mistaken for one.
   */
  function syncGameBoard() {
    const wanted = active && route === "game";
    for (const element of document.querySelectorAll(".decaf-game-board")) {
      if (!wanted) element.classList.remove("decaf-game-board");
    }
    if (!wanted) return;
    /*
     * A frame whose whole job is the game is the board.
     *
     * LinkedIn serves the playable board in an iframe, and the markup there is
     * not the launch page's: the named selector misses, and the shape search can
     * miss too. Nothing was then exempt, so the crowns were drained along with
     * everything else — and a gold crown and a pastel cell differ by about
     * 1.2:1 in luminance, which is to say they are told apart by hue and nothing
     * else. Grayscale removes exactly that, so the crowns did not dim, they
     * vanished, on a board still showing all its colours.
     *
     * The reasoning that drains the rest of a games page does not apply in here.
     * There is no nav in this frame, no leaderboard, no streak artwork — it is
     * the game, so all of it keeps its colour. Checked before `hasLayout`,
     * because this needs no measurement.
     */
    if (!isTopFrame && document.body) {
      if (!document.body.classList.contains("decaf-game-board")) {
        document.body.classList.add("decaf-game-board");
        clearBadgesOn(document.body);
      }
      return;
    }
    if (!hasLayout()) return;
    const main = document.querySelector("main") || document.body;
    if (!main || main.querySelector(".decaf-game-board")) return;

    const named = main.querySelector(GAME_BOARD_SELECTOR);
    if (named) {
      named.classList.add("decaf-game-board");
      clearBadgesOn(named);
      return;
    }

    let looked = 0;
    let best = null;
    for (const element of main.querySelectorAll("div,section,table,ul")) {
      if (looked > GAME_BOARD_BUDGET) break;
      looked += 1;
      if (isOurs(element)) continue;
      const cells = Array.from(element.children).filter(isRendered);
      if (cells.length < MIN_BOARD_CELLS) continue;
      const first = cells[0].getBoundingClientRect();
      // Cells are square, and big enough to be played on rather than decoration.
      if (first.width < MIN_CELL_PX || Math.abs(first.width - first.height) > 4) continue;
      if (!cells.every((cell) => Math.abs(cell.getBoundingClientRect().width - first.width) < 2)) continue;
      if (!best || cells.length > best.cells) best = { element, cells: cells.length };
    }
    if (!best) return;
    best.element.classList.add("decaf-game-board");
    clearBadgesOn(best.element);
  }

  /**
   * Takes the badge mark off anything inside a board that has just been found.
   *
   * A board found by shape only becomes recognisable once it has been measured,
   * which happens after the badge pass has already run over it. Marking it is
   * therefore always one step behind, and this is the step that catches up.
   */
  function clearBadgesOn(board) {
    for (const marked of board.querySelectorAll(".decaf-badge")) {
      marked.classList.remove("decaf-badge");
    }
  }

  function syncSurfaces() {
    // A subframe is part of the page, not a page: it gets the grayscale and the
    // masking, and none of the furniture that must exist once per tab.
    if (isTopFrame) syncNotice();
    syncPill();
    syncPassCounter();
    syncCommentPanel();
    syncGameBoard();
  }

  /* ------------------------------------------------------------- lifecycle -- */

  function clearBoot() {
    clearTimeout(bootTimer);
    bootTimer = null;
    root().classList.remove("decaf-boot");
  }

  /**
   * The class for the current site. A site the person added has no table and no
   * per-site rules, so they all share one class rather than minting a class name
   * out of a hostname — which would not be a valid one anyway.
   */
  function siteClass() {
    return D.isCustomKey(site) ? "decaf-site-custom" : `decaf-site-${site}`;
  }

  function expectedClasses() {
    if (!active || !site || !route) return [];
    const classes = ["decaf-on", siteClass(), `decaf-${route}`];
    if (settings.pauseFeeds) classes.push("decaf-calm");
    // Emptying a "feed" found inside a subframe would take out a chat panel or an
    // embedded player. The card only ever exists in the top frame, so the class
    // that empties containers belongs there too.
    if (hidingFeed && isTopFrame) classes.push("decaf-hide-feed");
    if (settings.hideComments) classes.push("decaf-hide-comments");
    if (settings.upsideDown) classes.push("decaf-upside-down");
    if (settings.hideBadges) classes.push("decaf-hide-badges");
    if (colorGranted) classes.push("decaf-color");
    return classes;
  }

  function syncRootClasses() {
    const element = root();
    const expected = expectedClasses();
    for (const className of ROOT_CLASSES) {
      if (!expected.includes(className)) element.classList.remove(className);
    }
    for (const className of expected) element.classList.add(className);
  }

  function schedulePassRefresh() {
    clearTimeout(passTimer);
    clearTimeout(chipTimer);
    passTimer = null;
    chipTimer = null;
    if (!active || !settings?.pauseFeeds) return;
    const until = D.passUntil(settings, site);
    if (!until) return;
    const remaining = until - Date.now();
    passTimer = setTimeout(() => {
      passTimer = null;
      passEnded = true;
      apply();
    }, Math.min(2147483000, remaining + 60));
    if (remaining > 30000) {
      chipTimer = setTimeout(() => {
        chipTimer = null;
        if (D.isPassActive(settings, site)) showChip("30 seconds left");
      }, remaining - 30000);
    }
  }

  function apply() {
    if (!settings) return;
    active = D.isActiveForSite(settings, site);
    hidingFeed = active && D.shouldPauseFeed(settings, site, route);
    if (!active) {
      removeNotice();
      hideChip();
      pill?.remove();
      syncPassCounter();
      restoreQuiet();
      syncRootClasses();
      clearBoot();
      schedulePassRefresh();
      return;
    }

    syncRootClasses();
    syncSurfaces();
    if (hidingFeed) pauseEveryVideo();
    clearBoot();
    schedulePassRefresh();
    scheduleScan(document);
  }

  function onLocationChange() {
    if (location.href === observedUrl) return;
    observedUrl = location.href;
    const nextSite = D.getSite(location.href, settings);
    const nextRoute = D.getRoute(location.href, settings);
    const nextKey = D.getPageKey(location.href, settings);
    const moved = nextKey !== pageKey;
    pageKey = nextKey;
    // Color is granted for one page at a time, so every move asks again — but a
    // site rewriting its own URL is not a move. YouTube strips the `si` share
    // token a second after a shared link opens, which is exactly when someone
    // asks for color, and comparing the whole href took the color straight back
    // again. The same went for a playhead in `t`, an Instagram carousel counting
    // slides in `img_index`, and any in-page anchor adding a `#hash`.
    if (moved) {
      colorGranted = false;
      passEnded = false;
    }
    if (nextSite === site && nextRoute === route) {
      apply();
      return;
    }
    site = nextSite;
    route = nextRoute;
    restoreQuiet();
    removeNotice();
    apply();
  }

  /* ----------------------------------------------------------------- scans -- */

  function runScan(roots) {
    if (!active) return;
    for (const scope of roots) {
      if (scope !== document && !scope.isConnected) continue;
      maskCounts(scope);
      maskCountElements(scope);
      maskAriaCounts(scope);
      markBadges(scope);
    }
    quietTitle();
    syncSurfaces();
  }

  function requestScan() {
    if (scanHandle !== null || scanTimer !== null) return;
    const run = () => {
      scanHandle = null;
      scanTimer = null;
      if (!active) {
        pendingRoots.clear();
        pendingDocument = false;
        return;
      }
      const roots = pendingDocument ? [document] : Array.from(pendingRoots);
      pendingDocument = false;
      pendingRoots.clear();
      runScan(roots.length ? roots : [document]);
      if (pendingDocument || pendingRoots.size) requestScan();
    };
    if (typeof globalThis.requestIdleCallback === "function") {
      scanHandle = globalThis.requestIdleCallback(run, { timeout: 400 });
    } else {
      scanTimer = setTimeout(run, 200);
    }
  }

  /**
   * Queues a scope for the next idle scan.
   *
   * Overflowing used to escalate to the whole document, and on any real feed the
   * sixty-fourth root arrives inside the first mutation batch — so in practice
   * almost every scan walked every text node on the page, on a 400ms cadence. The
   * roots are folded into their common ancestors instead, which keeps the cost
   * proportional to what actually changed.
   */
  function scheduleScan(scope) {
    if (!active) return;
    if (scope === document || pendingDocument) {
      pendingDocument = true;
      pendingRoots.clear();
    } else {
      pendingRoots.add(scope);
      if (pendingRoots.size >= MAX_PENDING_ROOTS) foldPendingRoots();
    }
    requestScan();
  }

  /** Drops any pending root that another pending root already contains. */
  function foldPendingRoots() {
    const roots = Array.from(pendingRoots).filter((node) => node.isConnected);
    pendingRoots.clear();
    for (const node of roots) {
      if (roots.some((other) => other !== node && other.contains(node))) continue;
      pendingRoots.add(node);
    }
    // Still nothing gained: the changes really are all over the page.
    if (pendingRoots.size >= MAX_PENDING_ROOTS) {
      pendingDocument = true;
      pendingRoots.clear();
    }
  }

  function scanTargetFor(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
    return node.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  /**
   * Placing the card used to run synchronously inside this callback for every
   * mutation batch — which is the situation during load on every feed site, and
   * permanently on any feed route where no feed is ever found: a sign-in wall, a
   * bot check, or a redesign past the whole selector table. Each attempt searches
   * seven selectors, filters for outermost, and interleaves class writes with
   * `getBoundingClientRect` and `elementFromPoint`, so each pass forced a fresh
   * layout. One attempt per frame, and a short rest after one that found nothing.
   */
  function requestNotice() {
    if (noticeFrame !== null) return;
    const run = () => {
      noticeFrame = null;
      if (!hidingFeed || (notice && notice.isConnected)) return;
      syncNotice();
      if (!notice || !notice.isConnected) noticeSearchFailedAt = Date.now();
    };
    // After a search that found nothing, wait out the rest of the rest period —
    // but always schedule, so a feed that arrives during it is still picked up.
    const rest = NOTICE_REST_MS - (Date.now() - noticeSearchFailedAt);
    if (rest > 0) {
      noticeFrame = setTimeout(run, rest);
      return;
    }
    noticeFrame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(run)
      : setTimeout(run, 16);
  }

  function onMutations(records) {
    try {
      // A real route change always redraws something, so this is the fastest and
      // most reliable signal available from an isolated world.
      if (location.href !== observedUrl) onLocationChange();
      // A feed container can be drawn long after load. Place the notice as soon
      // as that happens rather than waiting for the next idle scan.
      if (hidingFeed && (!notice || !notice.isConnected)) requestNotice();
      for (const record of records) {
        if (isOurs(record.target)) continue;
        if (record.type === "attributes") {
          if (record.target === root()) {
            const expected = expectedClasses();
            if (expected.some((className) => !root().classList.contains(className))) syncRootClasses();
            continue;
          }
          // Sites rewrite `class` constantly. Only a change that could reveal a
          // badge is worth a look; label changes always are.
          if (record.attributeName === "class" && !record.target.matches?.(BADGE_SELECTOR)) continue;
          scheduleScan(record.target);
          continue;
        }
        if (record.type === "characterData") {
          /*
           * A live chat, a player's elapsed-time readout and a "typing…"
           * indicator all fire characterData continuously. None of them can
           * produce a mask, and each one used to queue a scan — which on a busy
           * page meant Decaf never stopped walking the document.
           */
          const value = record.target.nodeValue || "";
          if (value.length > MAX_TEXT_LENGTH || !ANY_DIGIT.test(value)) continue;
          const target = scanTargetFor(record.target);
          if (target) scheduleScan(target);
          continue;
        }
        for (const node of record.addedNodes) {
          const target = scanTargetFor(node);
          if (target && !isOurs(target)) scheduleScan(target);
        }
      }
    } catch (error) {
      /*
       * An exception thrown out of an observer callback loses the whole batch,
       * and there is no way to know which records were missed. Decaf is not worth
       * a page's console being flooded either, so this is said once.
       */
      if (!onMutations.warned) {
        onMutations.warned = true;
        console.warn("Decaf: a page update could not be processed —", error?.message || error);
      }
    }
  }

  /* ------------------------------------------------------------------ init -- */

  /**
   * Single-page apps change route without a load event. A content script runs in
   * an isolated world, so patching `history.pushState` would only ever see calls
   * made by the extension itself — never the site's own. Three signals cover it
   * instead: the Navigation API, the history events, and the fact that any real
   * route change also mutates the DOM. The slow interval is a last resort.
   */
  function watchNavigation() {
    globalThis.navigation?.addEventListener?.("navigatesuccess", onLocationChange);
    globalThis.navigation?.addEventListener?.("currententrychange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    window.addEventListener("hashchange", onLocationChange);
    document.addEventListener("yt-navigate-finish", onLocationChange);
    document.addEventListener("fullscreenchange", syncPill);
    urlTimer = setInterval(onLocationChange, 1000);
  }

  function unwatchNavigation() {
    globalThis.navigation?.removeEventListener?.("navigatesuccess", onLocationChange);
    globalThis.navigation?.removeEventListener?.("currententrychange", onLocationChange);
    window.removeEventListener("popstate", onLocationChange);
    window.removeEventListener("hashchange", onLocationChange);
    document.removeEventListener("yt-navigate-finish", onLocationChange);
    document.removeEventListener("fullscreenchange", syncPill);
    clearInterval(urlTimer);
    urlTimer = null;
  }

  function onStorageChanged(changes, area) {
    if (area !== "local") return;
    const next = { ...settings };
    let changed = false;
    for (const key of Object.keys(D.DEFAULT_SETTINGS)) {
      if (changes[key]) {
        next[key] = changes[key].newValue;
        changed = true;
      }
    }
    if (!changed) return;
    settings = D.mergeSettings(next);
    apply();
  }

  /**
   * True while this copy of the script still belongs to a living extension.
   *
   * When the extension is reloaded, updated or removed, Chrome does not stop
   * the content scripts it has already injected — it only cuts their chrome.*
   * bindings, which is visible as `chrome.runtime.id` becoming undefined. A
   * copy that outlives its extension used to keep running forever on whatever
   * settings it had last read: it kept re-emptying the feed after the *new*
   * copy had granted a pass, so holding the button appeared to do nothing.
   * "Reload every tab after updating" is not an instruction anyone should need.
   */
  function contextAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  /** Starts watching the page. Paired with `detach`, and safe to call twice. */
  function attach() {
    if (observer) return;
    observer = new MutationObserver(onMutations);
    observer.observe(root(), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-label", "title", "data-badge", "data-unread-count"]
    });
    if (isTopFrame) watchNavigation();
    // Every copy, in every frame, checks once a second that its extension is
    // still alive, and takes everything down the moment it is not. An orphan
    // that lingers is an orphan enforcing stale settings against the live copy.
    orphanTimer = setInterval(() => {
      if (!contextAlive()) teardown();
    }, 1000);
    document.addEventListener("play", onPlay, true);
    document.addEventListener("pointerdown", noteGesture, true);
    document.addEventListener("keydown", noteGesture, true);
  }

  /** Stops watching, and cancels everything outstanding. Leaves the page marked. */
  function detach() {
    observer?.disconnect();
    observer = null;
    if (scanHandle !== null) globalThis.cancelIdleCallback?.(scanHandle);
    scanHandle = null;
    if (noticeFrame !== null) globalThis.cancelAnimationFrame?.(noticeFrame);
    noticeFrame = null;
    clearTimeout(scanTimer);
    clearTimeout(passTimer);
    clearTimeout(chipTimer);
    clearTimeout(chipHideTimer);
    clearTimeout(bootTimer);
    clearTimeout(pillCheckTimer);
    clearInterval(counterTicker);
    clearInterval(orphanTimer);
    counterTicker = null;
    orphanTimer = null;
    pillCheckTimer = null;
    scanTimer = null;
    unwatchNavigation();
    document.removeEventListener("play", onPlay, true);
    document.removeEventListener("pointerdown", noteGesture, true);
    document.removeEventListener("keydown", noteGesture, true);
  }

  function teardown() {
    detach();
    removeNotice();
    hideChip();
    chip?.remove();
    chip = null;
    pill?.remove();
    counter?.remove();
    counter = null;
    restoreQuiet();
    try {
      chrome.storage?.onChanged?.removeListener?.(onStorageChanged);
    } catch (_) {
      // A dead extension context throws on any chrome.* access. The listener is
      // already gone with the context, and the DOM cleanup below must still run.
    }
    root().classList.remove("decaf-boot", ...ROOT_CLASSES);
  }

  /**
   * `pagehide` fires with `persisted: true` when the document goes into Chrome's
   * back/forward cache. The isolated world is frozen, not destroyed, and Chrome
   * does not re-inject content scripts when the page comes back — so tearing down
   * unconditionally meant that opening a feed, clicking away, and pressing Back
   * restored the page with every Decaf class stripped, no observer, and the full
   * feed in colour, for good. Back-navigation is one of the most common ways
   * anyone arrives at a feed, so that was the whole product failing quietly.
   */
  function onPageHide(event) {
    if (event.persisted) detach();
    else teardown();
  }

  function onPageShow(event) {
    if (!event.persisted) return;
    observedUrl = location.href;
    site = D.getSite(location.href, settings);
    route = D.getRoute(location.href, settings);
    pageKey = D.getPageKey(location.href, settings);
    // Whatever was granted belonged to the visit that has just ended.
    colorGranted = false;
    passEnded = false;
    attach();
    apply();
  }

  async function init() {
    // A feed route stays blank for the few milliseconds it takes to read
    // settings, so the feed never gets a chance to paint before it is paused.
    // Only the top frame: hiding a subframe's body would blank an embed.
    if (route === "feed" && isTopFrame) {
      root().classList.add("decaf-boot");
      bootTimer = setTimeout(clearBoot, 1500);
      // The site class is known from the URL alone, so the boot blank can be
      // aimed at this site's own feed containers rather than the whole page.
      root().classList.add(siteClass());
    }

    try {
      settings = D.mergeSettings(await chrome.storage.local.get(D.DEFAULT_SETTINGS));
    } catch (_) {
      // If settings cannot be read, do nothing at all. Leaving a site untouched
      // is always the safe failure.
      clearBoot();
      root().classList.remove(...ROOT_CLASSES);
      return;
    }

    // A site the person added is only known once settings are in hand.
    site = D.getSite(location.href, settings);
    route = D.getRoute(location.href, settings);
    pageKey = D.getPageKey(location.href, settings);

    apply();
    attach();
    chrome.storage.onChanged.addListener(onStorageChanged);
    if (isTopFrame) chrome.runtime.onMessage.addListener(onMessage);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
  }

  /** The popup asking this tab what is actually happening on it. */
  function onMessage(message, _sender, sendResponse) {
    if (message?.type !== "decaf-health") return false;
    sendResponse({
      anchor: hidingFeed ? anchorKind : "",
      route,
      active,
      hidingFeed,
      placed: Boolean(notice?.isConnected)
    });
    return false;
  }

  init().catch(() => clearBoot());

  // Exposed for the DOM tests. Content scripts run in an isolated world, so the
  // host page can never reach this object.
  globalThis.__decaf = {
    apply,
    onLocationChange,
    runScan: () => runScan([document]),
    teardown,
    alive: contextAlive,
    notice: () => noticeParts,
    pill: () => pill,
    chip: () => chip,
    counter: () => counter,
    anchors: () => findFeedAnchors(),
    // jsdom cannot dispatch a trusted event, so a test standing in for a person
    // says so here. See `fromPerson`.
    trustSynthetic: (value = true) => { trustSynthetic = Boolean(value); },
    // See `isTopFrame`. Re-applies, because the frame's identity changes what
    // the surfaces should be.
    setTopFrame: (value) => { isTopFrame = Boolean(value); apply(); },
    state: () => ({ site, route, active, hidingFeed, colorGranted, settings, isTopFrame })
  };
})();
