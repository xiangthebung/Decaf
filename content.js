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
    ...D.SITE_KEYS.map((key) => `decaf-site-${key}`)
  ];

  const REWARD_WORDS = [
    "likes?", "views?", "comments?", "repl(?:y|ies)", "reposts?", "retweets?", "shares?",
    "followers?", "following", "subscribers?", "members?", "votes?", "upvotes?", "downvotes?",
    "points?", "karma", "saves?", "reactions?", "watching", "viewers?", "posts?", "bookmarks?",
    "favou?rites?", "quotes?", "impressions?"
  ].join("|");
  const COUNT_WITH_NOUN = new RegExp(`\\d[\\d.,]*\\s*[KkMmBb]?\\+?\\s*(?:${REWARD_WORDS})\\b`, "i");
  const BARE_COUNT = /^\s*[\d][\d.,\u202f\u00a0 ]*\s*[KkMmBb]?\+?\s*$/;
  // "1.8M" in one element, "Views" in the next: X writes the noun beside the
  // number rather than with it. Facebook writes it in front: "All reactions: 265".
  const REWARD_NOUN_FIRST = new RegExp(`^(?:${REWARD_WORDS})\\b`, "i");
  const REWARD_NOUN_LAST = new RegExp(`(?:${REWARD_WORDS})\\s*[:·•|,-]?\\s*$`, "i");
  const REWARD_CONTEXT = /like|view|comment|repl|repost|retweet|quote|share|follow|subscrib|member|vote|karma|save|bookmark|favou?rite|reaction|impression|watching|viewer|engagement|score/i;
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
    facebook: "[role='button']"
  };

  function countElementSelector() {
    const extra = SITE_COUNT_ELEMENTS[site];
    return extra ? `${COUNT_ELEMENT_SELECTOR},${extra}` : COUNT_ELEMENT_SELECTOR;
  }
  const OURS = ".decaf-notice,.decaf-chip,.decaf-pill";
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
    "time", "[datetime]", OURS
  ].join(",");
  // Where the "Show in color" pill may sit, in the order it tries them. The
  // offsets have to match the classes in content.css.
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
  const TITLE_BADGE = /^\s*[([]\s*\d[\d.,KkMmBb+]*\s*[)\]]\s*/;
  const GESTURE_WINDOW_MS = 1200;
  const MAX_TEXT_LENGTH = 48;
  const MAX_PENDING_ROOTS = 64;

  let settings = null;
  let site = D.getSite(location.href);
  let route = D.getRoute(location.href);
  let active = false;
  let hidingFeed = false;
  let colorGranted = false;
  let observedUrl = location.href;
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
  let lastGestureAt = 0;
  let originalTitle = "";
  let maskedTitle = "";
  let passEnded = false;

  let notice = null;
  let noticeParts = null;
  let chip = null;
  let pill = null;
  let hold = null;

  const touchedElements = new Set();
  const touchedTextNodes = new Set();
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
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.(OURS));
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
    return `${text} ${controlContext(element)}`.replace(/\bdecaf-[\w-]+/g, " ");
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
        if (text && !/[\d—]/.test(text)) return text.slice(-24);
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
    return label.length <= 24 && !/\d/.test(label) ? label : "";
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
    if (inside) return `${text} ${inside}`;
    let sibling = control.previousElementSibling;
    for (let hops = 0; sibling && hops < 2; hops += 1) {
      const label = iconLabel(sibling);
      if (label) return `${text} ${label}`;
      sibling = sibling.previousElementSibling;
    }
    return text;
  }

  // A number, optionally with a K/M/B suffix, but never eating the word after it.
  const NUMBER = /\d[\d.,\u202f\u00a0]*(?:\s?[KkMmBb](?![A-Za-z]))?\+?/g;

  function maskNumbers(value) {
    return value.replace(NUMBER, "—").replace(/\s{2,}/g, " ").trim();
  }

  function setText(node, value) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    touchedTextNodes.add(node);
    if (node.nodeValue !== value) node.nodeValue = value;
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

  /** A number on its own is a reward count if what surrounds it says so. */
  function isRewardCount(element) {
    return REWARD_CONTEXT.test(contextText(element)) ||
      REWARD_NOUN_FIRST.test(followingText(element)) ||
      REWARD_NOUN_LAST.test(precedingText(element));
  }

  function maskCounts(scope) {
    const start = scope.nodeType === Node.DOCUMENT_NODE ? scope.body : scope;
    if (!start || isOurs(start)) return;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue || "";
      if (value.length <= MAX_TEXT_LENGTH && /\d/.test(value)) {
        const parent = node.parentElement;
        if (parent && !parent.closest(SKIP_TEXT_PARENTS)) {
          if (COUNT_WITH_NOUN.test(value)) setText(node, maskNumbers(value));
          else if (BARE_COUNT.test(value) && isRewardCount(parent)) setText(node, "—");
        }
      }
      node = walker.nextNode();
    }
  }

  function maskAriaCounts(scope) {
    for (const element of queryWithin(scope, "[aria-label]")) {
      if (isOurs(element)) continue;
      const label = element.getAttribute("aria-label") || "";
      // Facebook labels each reaction "Love: 47 people" and leaves the word
      // "reactions" on the group they sit in, so the surroundings count too.
      if (!/\d/.test(label) || !(REWARD_CONTEXT.test(label) || REWARD_CONTEXT.test(contextText(element)))) continue;
      const masked = maskNumbers(label);
      if (masked === label) continue;
      if (!originalAria.has(element)) originalAria.set(element, label);
      touchedElements.add(element);
      element.setAttribute("aria-label", masked);
    }
  }

  function isInteractive(element) {
    return Boolean(element.matches?.("a,button,input,select,textarea,[role='button'],[role='link'],[role='tab'],[role='menuitem']"));
  }

  function markBadge(element) {
    const target = paintedBadge(element);
    if (target.classList.contains("decaf-badge")) return;
    target.classList.add("decaf-badge");
    touchedElements.add(target);
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

  function restoreQuiet() {
    for (const element of touchedElements) {
      element.classList?.remove("decaf-badge", "decaf-feed-container", "decaf-comment-list", "decaf-game-board");
      if (originalAria.has(element)) {
        const value = originalAria.get(element);
        if (value === null) element.removeAttribute("aria-label");
        else element.setAttribute("aria-label", value);
        originalAria.delete(element);
      }
    }
    touchedElements.clear();
    for (const node of touchedTextNodes) {
      if (originalText.has(node)) {
        const value = originalText.get(node);
        if (node.nodeValue !== value) node.nodeValue = value;
        originalText.delete(node);
      }
    }
    touchedTextNodes.clear();
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

  function noteGesture() {
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
    const list = Array.from(matches).filter((element) => element.parentElement);
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
    let parent = notice.parentElement;
    while (parent && parent !== root() && parent !== document.body) {
      parent.classList.add("decaf-feed-path");
      touchedElements.add(parent);
      parent = parent.parentElement;
    }
  }

  function setFeedHost(element) {
    for (const previous of document.querySelectorAll(".decaf-feed-host")) {
      if (previous !== element) previous.classList.remove("decaf-feed-host");
    }
    if (!element || element.classList.contains("decaf-feed-host")) return;
    element.classList.add("decaf-feed-host");
    touchedElements.add(element);
  }

  /**
   * If a site has redesigned past every selector in the table, find the feed the
   * hard way: the smallest thing that contains several feed items. Marking it
   * lets the same CSS hide it, so a redesign degrades to a small flash of feed
   * rather than a page that claims to be paused while it is not.
   */
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
      (item) => !isOurs(item) && !notice?.contains(item) && isRendered(item)
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
    touchedElements.add(element);
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
    const container = make("div", "decaf-notice");
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "Feed paused by Decaf");

    const title = make("p", "decaf-notice-title", `Decaf paused the ${D.siteLabel(site)} feed.`);
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

    container.append(title, body, button, hint, status);
    noticeParts = { container, title, body, button, label, hint, status };
    attachHold(button, label, status);
    return container;
  }

  function stopHold({ silent = false } = {}) {
    if (!hold) return;
    clearTimeout(hold.timer);
    const { button, label } = hold;
    button.dataset.holding = "false";
    button.classList.remove(hold.className);
    label.textContent = `Hold to open for ${D.PASS_MINUTES} minutes`;
    hold = null;
    if (noticeParts) noticeParts.hint.hidden = false;
    if (!silent && noticeParts) noticeParts.status.textContent = "";
  }

  function attachHold(button, label, status) {
    const begin = (event) => {
      if (hold) return;
      if (event.type === "pointerdown" && event.button > 0) return;
      const seconds = D.holdSeconds(D.passCount(settings, site), D.isLocked(settings));
      const className = `decaf-hold-${seconds}`;
      button.dataset.holding = "true";
      button.classList.add(className);
      label.textContent = "Keep holding…";
      // The hint and the announcement would otherwise say the same thing twice.
      if (noticeParts) noticeParts.hint.hidden = true;
      status.textContent = `Keep holding for ${seconds} seconds.`;
      hold = {
        button,
        label,
        className,
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
    for (const type of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
      button.addEventListener(type, () => stopHold());
    }
    button.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      begin(event);
    });
    button.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") stopHold();
    });
  }

  /**
   * A page that was scrolled before the feed was paused can leave the card above
   * the fold, which reads as a card that has been cut off. Bring it into view the
   * first time it is placed, and never fight the person's own scrolling after that.
   */
  function revealNotice() {
    if (!hasLayout() || typeof notice.scrollIntoView !== "function") return;
    const rect = notice.getBoundingClientRect();
    const height = window.innerHeight || root().clientHeight;
    if (rect.top >= 0 && rect.bottom <= height) return;
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
    if (!candidates.length) {
      // Nothing feed-shaped is on the page: an interstitial, a sign-in wall, or
      // markup Decaf no longer recognizes. Look for the feed by its items, and
      // if there is none, say nothing rather than claim a feed was paused.
      const shaped = findFeedByShape();
      if (!shaped) {
        removeNotice();
        return;
      }
      markFeedContainer(shaped);
      candidates.push(shaped);
    }

    if (!notice) notice = buildNotice();
    notice.classList.toggle("decaf-dark", pageIsDark());
    noticeParts.title.textContent = `Decaf paused the ${D.siteLabel(site)} feed.`;
    noticeParts.hint.textContent = holdHint();
    if (passEnded) noticeParts.status.textContent = `Your ${D.PASS_MINUTES} minutes are up.`;

    placeNotice(candidates);
    enforceEmptyFeed();
  }

  function removeNotice() {
    clearFeedContainers();
    if (!notice) return;
    stopHold({ silent: true });
    notice.remove();
    notice = null;
    noticeParts = null;
  }

  async function grantPass() {
    const next = D.grantPass(settings, site);
    const patch = D.createStoragePatch(settings, next);
    settings = next;
    passEnded = false;
    apply();
    showChip(`Feed open for ${D.PASS_MINUTES} minutes`);
    try {
      await chrome.storage.local.set(patch);
    } catch (_) {
      // The pass still applies to this tab even if storage is unavailable.
    }
  }

  /* -------------------------------------------------------- chip and pill -- */

  function showChip(message) {
    if (!document.body) return;
    if (!chip) {
      chip = make("div", "decaf-chip");
      chip.setAttribute("role", "status");
      chip.setAttribute("aria-live", "polite");
    }
    chip.textContent = message;
    if (!chip.isConnected) document.body.append(chip);
    clearTimeout(chipHideTimer);
    chipHideTimer = setTimeout(hideChip, 4200);
  }

  function hideChip() {
    clearTimeout(chipHideTimer);
    chipHideTimer = null;
    chip?.remove();
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
    // A video or image is a replaced element: it cannot render a button appended
    // to it. Fullscreen is already an explicit request to see that media, so use
    // the same one-page color grant rather than leaving the person no way to ask.
    if (
      active &&
      route === "media" &&
      !colorGranted &&
      document.fullscreenElement?.matches?.("video,img")
    ) {
      colorGranted = true;
      syncRootClasses();
    }
    const wanted = active && route === "media" && !colorGranted;
    if (!wanted || !document.body) {
      pill?.remove();
      return;
    }
    if (!pill) {
      pill = make("button", "decaf-pill", "Show in color");
      pill.type = "button";
      pill.title = "Show this page's video or photo in full color until you leave it";
      pill.addEventListener("click", () => {
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
    if (!pillCheckTimer) {
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
      touchedElements.add(element);
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
    if (!wanted || !hasLayout()) return;
    const main = document.querySelector("main") || document.body;
    if (!main || main.querySelector(".decaf-game-board")) return;

    const named = main.querySelector(GAME_BOARD_SELECTOR);
    if (named) {
      named.classList.add("decaf-game-board");
      touchedElements.add(named);
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
    touchedElements.add(best.element);
  }

  function syncSurfaces() {
    syncNotice();
    syncPill();
    syncCommentPanel();
    syncGameBoard();
  }

  /* ------------------------------------------------------------- lifecycle -- */

  function clearBoot() {
    clearTimeout(bootTimer);
    bootTimer = null;
    root().classList.remove("decaf-boot");
  }

  function expectedClasses() {
    if (!active || !site || !route) return [];
    const classes = ["decaf-on", `decaf-site-${site}`, `decaf-${route}`];
    if (settings.pauseFeeds) classes.push("decaf-calm");
    if (hidingFeed) classes.push("decaf-hide-feed");
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
    const nextSite = D.getSite(location.href);
    const nextRoute = D.getRoute(location.href);
    // Color is granted for one page at a time, so every move asks again.
    colorGranted = false;
    passEnded = false;
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

  function scheduleScan(scope) {
    if (!active) return;
    if (scope === document || pendingDocument) {
      pendingDocument = true;
      pendingRoots.clear();
    } else if (pendingRoots.size >= MAX_PENDING_ROOTS) {
      pendingDocument = true;
      pendingRoots.clear();
    } else {
      pendingRoots.add(scope);
    }
    requestScan();
  }

  function scanTargetFor(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
    return node.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  function onMutations(records) {
    // A real route change always redraws something, so this is the fastest and
    // most reliable signal available from an isolated world.
    if (location.href !== observedUrl) onLocationChange();
    // A feed container can be drawn long after load. Place the notice as soon as
    // that happens rather than waiting for the next idle scan.
    if (hidingFeed && (!notice || !notice.isConnected)) syncNotice();
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
        const target = scanTargetFor(record.target);
        if (target) scheduleScan(target);
        continue;
      }
      for (const node of record.addedNodes) {
        const target = scanTargetFor(node);
        if (target && !isOurs(target)) scheduleScan(target);
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

  function teardown() {
    observer?.disconnect();
    if (scanHandle !== null) globalThis.cancelIdleCallback?.(scanHandle);
    clearTimeout(scanTimer);
    clearTimeout(passTimer);
    clearTimeout(chipTimer);
    clearTimeout(chipHideTimer);
    clearTimeout(bootTimer);
    clearTimeout(pillCheckTimer);
    pillCheckTimer = null;
    removeNotice();
    hideChip();
    pill?.remove();
    restoreQuiet();
    unwatchNavigation();
    document.removeEventListener("play", onPlay, true);
    document.removeEventListener("pointerdown", noteGesture, true);
    document.removeEventListener("keydown", noteGesture, true);
    root().classList.remove("decaf-boot", ...ROOT_CLASSES);
  }

  async function init() {
    // A feed route stays blank for the few milliseconds it takes to read
    // settings, so the feed never gets a chance to paint before it is paused.
    if (route === "feed") {
      root().classList.add("decaf-boot");
      bootTimer = setTimeout(clearBoot, 1500);
    }

    try {
      settings = D.mergeSettings(await chrome.storage.local.get(D.DEFAULT_SETTINGS));
    } catch (_) {
      // If settings cannot be read, do nothing at all. Leaving a site untouched
      // is always the safe failure.
      clearBoot();
      return;
    }

    apply();

    observer = new MutationObserver(onMutations);
    observer.observe(root(), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-label", "title", "data-badge", "data-unread-count"]
    });

    watchNavigation();
    document.addEventListener("play", onPlay, true);
    document.addEventListener("pointerdown", noteGesture, true);
    document.addEventListener("keydown", noteGesture, true);
    chrome.storage.onChanged.addListener(onStorageChanged);
    window.addEventListener("pagehide", teardown, { once: true });
  }

  init().catch(() => clearBoot());

  // Exposed for the DOM tests. Content scripts run in an isolated world, so the
  // host page can never reach this object.
  globalThis.__decaf = {
    apply,
    onLocationChange,
    runScan: () => runScan([document]),
    teardown,
    notice: () => noticeParts,
    pill: () => pill,
    chip: () => chip,
    anchors: () => findFeedAnchors(),
    state: () => ({ site, route, active, hidingFeed, colorGranted, settings })
  };
})();
