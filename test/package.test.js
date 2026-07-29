"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { root, read } = require("../tools/harness.js");
const D = require("../core.js");

const manifest = JSON.parse(read("manifest.json"));
const contentCss = read("content.css");
const exists = (file) => fs.existsSync(path.join(root, file));
const EXTENSION_FILES = [
  "core.js", "content.js", "content.css", "background.js",
  "popup.html", "popup.css", "popup.js",
  "options.html", "options.css", "options.js"
];

test("the manifest is ready to package", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Decaf");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length >= 25 && manifest.description.length <= 132, "store description length");
  assert.deepEqual(manifest.permissions, ["storage", "activeTab", "alarms"]);
  assert.equal(manifest.host_permissions, undefined, "content script matches are enough");
  assert.equal(manifest.web_accessible_resources, undefined, "nothing needs to be exposed to pages");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.options_page, "options.html");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.content_scripts[0].js, ["core.js", "content.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["content.css"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[0].all_frames, false);

  for (const file of [
    ...EXTENSION_FILES,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ]) {
    assert.ok(exists(file), `missing file: ${file}`);
  }
  for (const state of ["", "-off", "-locked"]) {
    for (const size of [16, 32, 48, 128]) {
      assert.ok(exists(`icons/icon${state}${size}.png`), `missing icon: icon${state}${size}.png`);
    }
  }
  assert.equal(manifest.version, JSON.parse(read("package.json")).version, "package version matches manifest");
});

test("the sites Decaf knows about are exactly the sites it is injected into", () => {
  const matches = manifest.content_scripts[0].matches;
  assert.deepEqual(matches, D.MATCHES, "the manifest must inject exactly where core.js says");
  assert.equal(matches.length, new Set(matches).size, "no duplicate match patterns");
  for (const pattern of matches) {
    assert.match(pattern, /^\*:\/\/(\*\.)?[a-z0-9.-]+\/\*$/, `${pattern} must be a host pattern`);
  }
  for (const [key, site] of Object.entries(D.SITES)) {
    assert.ok(site.matches.length, `${key} has no match patterns`);
    for (const host of site.hosts) {
      assert.equal(D.getSite(`https://${host}/`), key, `${host} should resolve to ${key}`);
    }
  }
});

/**
 * A wildcard in the manifest is harmless — the content script does nothing unless
 * core.js recognizes the host — but the recognizer itself has to be precise, or
 * Decaf would empty the front page of YouTube Studio or Pinterest for Business.
 */
test("only the hosts that really are feeds are recognized", () => {
  const expected = {
    "ca.pinterest.com": "pinterest",
    "uk.pinterest.com": "pinterest",
    "www.pinterest.com": "pinterest",
    "pinterest.ca": "pinterest",
    "business.pinterest.com": null,
    "help.pinterest.com": null,
    "developers.pinterest.com": null,
    "sh.reddit.com": "reddit",
    "old.reddit.com": "reddit",
    "ads.reddit.com": null,
    "en-gb.facebook.com": "facebook",
    "mbasic.facebook.com": "facebook",
    "developers.facebook.com": null,
    "ca.linkedin.com": "linkedin",
    "careers.linkedin.com": null,
    "studio.youtube.com": null,
    "music.youtube.com": null,
    "mail.google.com": null
  };
  for (const [host, site] of Object.entries(expected)) {
    assert.equal(D.getSite(`https://${host}/`), site, host);
  }
});

/**
 * The content script puts its notice inside the container CSS is emptying. If the
 * two ever disagree, a feed would be emptied with no explanation, or shown with
 * one. This keeps them honest — including the shape that keeps the container in
 * the page's layout rather than removing it.
 */
test("every feed container in core.js is emptied by content.css, and vice versa", () => {
  const EMPTY_SUFFIX = " > *:not(.decaf-notice):not(:has(.decaf-notice))";
  const emptied = new Set();
  for (const group of contentCss.matchAll(/html\.decaf-hide-feed\.decaf-site-([a-z]+)\s+([^,{]+)/g)) {
    emptied.add(`${group[1]} ${group[2].trim()}`);
  }
  for (const [key, site] of Object.entries(D.SITES)) {
    for (const selector of site.feedSelectors) {
      const expected = `${key} ${selector}${EMPTY_SUFFIX}`;
      assert.ok(emptied.has(expected), `content.css does not empty ${key}: ${selector}`);
      emptied.delete(expected);
    }
  }
  assert.deepEqual([...emptied], [], "content.css empties a feed container core.js does not know about");
  // Nothing may take a feed container out of the page's layout.
  for (const rule of cssRules(contentCss)) {
    for (const selector of rule.selectors) {
      if (!selector.startsWith("html.decaf-hide-feed")) continue;
      if (selector.endsWith(EMPTY_SUFFIX)) continue;
      if (selector.includes(".decaf-feed-host") || selector.includes(".decaf-feed-path")) continue;
      assert.fail(`"${selector}" removes a container instead of emptying it`);
    }
  }
});

test("every hold length has an animation to match", () => {
  const seconds = new Set();
  for (const count of [0, 1, 2, 3, 4]) {
    for (const locked of [false, true]) seconds.add(D.holdSeconds(count, locked));
  }
  for (const value of seconds) {
    assert.ok(contentCss.includes(`.decaf-hold-${value} .decaf-notice-fill`), `no animation for a ${value}s hold`);
  }
});

test("the card can step clear of a fixed overlay", () => {
  // YouTube paints #frosted-glass 56px below its masthead, over the card's top.
  for (const step of [1, 2, 3, 4]) {
    assert.match(contentCss, new RegExp(`\\.decaf-drop-${step} \\{[^}]*margin-top`), `no drop-${step} step`);
  }
  assert.match(read("content.js"), /elementFromPoint/, "the overlay has to be measured, not guessed");
});

test("Instagram's comment panel is marked rather than guessed at", () => {
  assert.match(contentCss, /\.decaf-comment-list > \* > \*:nth-child\(n\+2\)/);
  assert.match(read("content.js"), /decaf-comment-list/);
});

test("comment hiding covers the sites the settings page promises", () => {
  for (const key of ["youtube", "instagram", "reddit", "tiktok", "x", "facebook", "linkedin", "twitch"]) {
    assert.ok(
      contentCss.includes(`html.decaf-hide-comments.decaf-site-${key} `),
      `content.css has no comment rule for ${key}`
    );
  }
});

/**
 * On Reddit the thread is the document, not an appendix to it: a permalink is
 * /r/<sub>/comments/<id>/, and a link post has no body of its own. Hiding the tree
 * leaves a title and no answer, so it is capped instead — top-level comments and
 * the first reply stay, everything below goes, and the loader that would fetch a
 * thousand more is dropped so the thread ends rather than grows.
 *
 * This is the test that stops the blanket version coming back, because hiding the
 * whole tree is the obvious thing to write and it reads as a broken page.
 */
test("Reddit's thread is capped, never hidden outright", () => {
  const PREFIX = "html.decaf-hide-comments.decaf-site-reddit ";
  const hidden = [];
  for (const rule of cssRules(contentCss)) {
    if (!/display:\s*none/.test(rule.body)) continue;
    for (const selector of rule.selectors) {
      if (selector.startsWith(PREFIX)) hidden.push(selector.slice(PREFIX.length).trim());
    }
  }
  assert.ok(hidden.length, "content.css hides nothing on a Reddit thread");

  for (const target of hidden) {
    assert.doesNotMatch(
      target,
      /^(shreddit-comment-tree|#comment-tree|\.commentarea)$/,
      `"${target}" hides the whole thread instead of capping it`
    );
  }

  const cap = hidden.find((target) => /^shreddit-comment:not/.test(target));
  assert.ok(cap, "no rule caps a new-Reddit thread by depth");
  assert.match(cap, /:not\(\[depth='0'\]\)/, "top-level comments have to survive the cap");
  assert.match(cap, /:not\(\[depth='1'\]\)/, "the reply that confirms the answer has to survive it");

  assert.ok(
    hidden.some((target) => target.includes("/svc/shreddit/more-comments/")),
    "the loader that grows the thread without end has to go, or the cap only hides depth"
  );
  assert.ok(
    hidden.some((target) => /\.commentarea\s+\.child\s+\.child\s+\.comment/.test(target)),
    "no rule caps an old-Reddit thread, where depth is a .child wrapper per level"
  );
});

/**
 * A game's board keeps its colour — Queens is played by reading the coloured
 * regions, and its crowns are gold — while the page around it is drained like any
 * other. Two things have to hold for that: the board is spared, and the sparing
 * rule can actually outrank the rules that drain. The second is easy to lose,
 * because `:is(#contents, ...)` in a landmark list lends a rule an id's
 * specificity, which a class-only exemption can never beat.
 */
test("a game's board keeps its colour, and nothing else on the page does", () => {
  assert.ok(D.SITES.linkedin.isGame, "LinkedIn has to recognize its games");
  assert.equal(D.getRoute("https://www.linkedin.com/games/queens/results/"), "game");
  assert.match(read("content.js"), /decaf-game-board/, "content.js has to mark the board");

  const rules = cssRules(contentCss);
  const spares = rules.filter((rule) => rule.selectors.some((s) => s.includes(".decaf-game-board")));
  assert.equal(spares.length, 1, "exactly one rule spares the board");
  assert.match(spares[0].body, /filter:\s*none/, "the board keeps its colour");
  assert.match(spares[0].body, /transform:\s*none/, "the board is never turned over");
  for (const selector of spares[0].selectors) {
    assert.match(selector, /^html\.decaf-game /, `"${selector}" must only apply on a game route`);
  }

  // Nothing that drains or rotates may carry id-level specificity, or the rule
  // above cannot reach past it. An id inside :where() carries none, so it is fine.
  for (const rule of rules) {
    if (!/filter:\s*grayscale|transform:\s*rotate/.test(rule.body)) continue;
    for (const selector of rule.selectors) {
      assert.doesNotMatch(withoutWhere(selector), /#/,
        `"${selector}" outranks the board exemption; put its id list in :where()`);
    }
  }
});

/** A selector with every `:where(...)` group removed — what still counts for specificity. */
function withoutWhere(selector) {
  let out = "";
  let index = 0;
  while (index < selector.length) {
    if (!selector.startsWith(":where(", index)) {
      out += selector[index];
      index += 1;
      continue;
    }
    let depth = 0;
    index += ":where".length;
    for (; index < selector.length; index += 1) {
      if (selector[index] === "(") depth += 1;
      if (selector[index] === ")" && --depth === 0) {
        index += 1;
        break;
      }
    }
  }
  return out;
}

test("badges are muted by default and only hidden on request", () => {
  assert.match(contentCss, /html\.decaf-on \.decaf-badge \{[^}]*grayscale/);
  assert.match(contentCss, /html\.decaf-hide-badges \.decaf-badge \{\s*display: none/);
  assert.doesNotMatch(contentCss, /html\.decaf-on \.decaf-badge \{[^}]*display: none/);
});

/** Splits a selector list without breaking `:is(a, b)`. */
function splitSelectors(group) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of group) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function cssRules(css) {
  return Array.from(css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
    (match) => ({ selectors: splitSelectors(match[1]), body: match[2] }));
}

/** The page must never be frozen: that reads as a broken site, not a choice. */
test("nothing in the extension blocks scrolling or disables the page", () => {
  const source = read("content.js");
  for (const rule of cssRules(contentCss)) {
    const touchesPage = rule.selectors.some((selector) =>
      /^html\.decaf-[\w-]+$/.test(selector) || /\bbody\b/.test(selector));
    if (!touchesPage) continue;
    assert.doesNotMatch(rule.body, /overflow:\s*hidden/, `scroll locking in "${rule.selectors.join(", ")}"`);
  }
  assert.doesNotMatch(source, /\.inert\s*=/, "no inert page content");
  assert.doesNotMatch(contentCss, /html\.decaf-covered/, "the cover is gone for good");
  assert.doesNotMatch(source, /decaf-covered/, "the full page cover is gone for good");
});

/**
 * A host page's root font size is not ours to trust: YouTube ships
 * `html { font-size: 10px }`, which silently shrank anything sized in rem.
 */
test("page styling uses absolute units only", () => {
  const css = contentCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const relative = css.match(/[-\d.]+r?em\b/g) || [];
  assert.deepEqual(relative, [], "content.css must not size anything in em or rem");
  assert.match(contentCss, /max-width: 544px !important/, "the notice has an absolute width");
});

/** Inherited layout from the host page must not be able to rearrange the card. */
test("Decaf's own elements are defended against host CSS", () => {
  const rules = cssRules(contentCss);
  const noticeReset = rules.find((rule) =>
    rule.selectors.some((selector) => selector === "html.decaf-on .decaf-notice *"));
  assert.ok(noticeReset, "there is a reset for everything inside the notice");
  for (const property of [
    "box-sizing", "float", "font-family", "line-height", "letter-spacing", "text-transform",
    "opacity", "visibility", "filter", "list-style", "white-space", "direction"
  ]) {
    assert.match(noticeReset.body, new RegExp(`${property}:[^;]+!important`), `reset is missing ${property}`);
  }
  const notice = rules.find((rule) => rule.selectors.length === 1 && rule.selectors[0] === "html.decaf-on .decaf-notice");
  assert.ok(notice);
  for (const property of [
    "display", "position", "float", "width", "max-width", "margin", "flex", "grid-column",
    "justify-self", "align-self", "font-size", "transform", "box-shadow"
  ]) {
    assert.match(notice.body, new RegExp(`${property}:[^;]+!important`), `the notice is missing ${property}`);
  }
});

test("no remote code, no network, no tracking", () => {
  const forbidden = [
    [/\bfetch\s*\(/, "fetch"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/\bnew\s+Function\b/, "new Function"],
    [/\beval\s*\(/, "eval"],
    [/navigator\.sendBeacon/, "sendBeacon"],
    [/analytics|telemetry|gtag|mixpanel|sentry/i, "analytics"],
    [/\.innerHTML\s*=/, "innerHTML assignment"],
    [/chrome\.identity|chrome\.cookies|chrome\.webRequest|chrome\.history|chrome\.bookmarks/, "a permission Decaf does not need"]
  ];
  for (const file of EXTENSION_FILES.filter((name) => name.endsWith(".js"))) {
    const source = code(file);
    for (const [pattern, label] of forbidden) {
      assert.ok(!pattern.test(source), `${file} must not use ${label}`);
    }
  }
  for (const file of ["popup.html", "options.html"]) {
    const html = read(file);
    assert.doesNotMatch(html, /src="https?:/, `${file} must not load remote scripts`);
    assert.doesNotMatch(html, /href="https?:/, `${file} must not load remote styles`);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/, `${file} must not use inline scripts`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${file} must not use inline event handlers`);
  }
  for (const file of ["content.css", "popup.css", "options.css"]) {
    const css = read(file);
    assert.doesNotMatch(css, /@import/, `${file} must not import remote CSS`);
    assert.doesNotMatch(css, /url\(\s*['"]?https?:/, `${file} must not fetch remote assets`);
  }
});

/** Drops comments so prose about the rules is not mistaken for breaking them. */
function code(file) {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Decaf's own elements live in the page, so all of their styling has to come
 * from this file — a site's CSP can block a stylesheet the page builds at
 * runtime, but never one the browser injects for an extension.
 */
test("all page styling is scoped to Decaf's state classes and shipped as CSS", () => {
  const rules = cssRules(contentCss);
  assert.ok(rules.length > 10, "content.css has rules");
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (selector.startsWith("@") || /^(from|to|\d+%)$/.test(selector)) continue;
      assert.match(selector, /^html\.decaf-/, `unscoped selector in content.css: ${selector}`);
    }
  }
  const source = read("content.js");
  assert.doesNotMatch(source, /attachShadow/, "no runtime stylesheet to be blocked by a page CSP");
  assert.doesNotMatch(source, /createElement\("style"\)/);
  assert.doesNotMatch(source, /\.style\.[a-z]/i, "no inline styles either");
  assert.match(source, /class="decaf-|"decaf-notice"|decaf-chip|decaf-pill/);
});

test("nothing in the project still refers to the old name", () => {
  const files = [...EXTENSION_FILES, "manifest.json", "package.json", "README.md", "tools/make-icons.js"];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /blokamine|unaddictify/i, `${file} still mentions the old name`);
  }
});

test("the README describes the product that actually ships", () => {
  const readme = read("README.md");
  assert.match(readme, /^# Decaf/m);
  for (const site of Object.values(D.SITES)) {
    assert.ok(readme.includes(site.label), `README should list ${site.label}`);
  }
  assert.match(readme, /Pause feeds/);
  assert.match(readme, /Hide comments/i);
  assert.match(readme, /upside down/i);
  assert.match(readme, /npm test/);
  assert.match(readme, new RegExp(`${D.PASS_MINUTES}-minute|${D.PASS_MINUTES} minutes`));
});
