const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const optionsHtml = read("options.html");
const popupHtml = read("popup.html");
const contentCss = read("content.css");
const contentJs = read("content.js");

const context = {};
context.globalThis = context;
context.URL = URL;
vm.runInNewContext(read("shared.js"), context);
const U = context.UnaddictifySettings;

test("settings UI exposes every supported site and setting", () => {
  for (const site of Object.keys(U.DEFAULT_SETTINGS.sites)) {
    assert.match(optionsHtml, new RegExp(`data-site=["']${site}["']`), site);
    assert.match(optionsHtml, new RegExp(`data-site-panel=["']${site}["']`), `${site} site panel`);
  }
  for (const feature of Object.keys(U.DEFAULT_SETTINGS.features)) {
    assert.match(optionsHtml, new RegExp(`data-feature=["']${feature}["']`), feature);
  }
  for (const [site, values] of Object.entries(U.DEFAULT_SITE_SETTINGS)) {
    for (const key of Object.keys(values)) {
      assert.match(optionsHtml, new RegExp(`data-site-setting=["']${site}\\.${key}["']`), `${site}.${key}`);
    }
  }
  assert.match(optionsHtml, /id=["']global-enabled-state["']/);
  assert.match(optionsHtml, /id=["']focus-lock-header["']/);
  assert.match(optionsHtml, /id=["']focus-lock-header-icon["']/);
  assert.match(optionsHtml, /id=["']focus-lock-header-title["']/);
  assert.match(optionsHtml, /id=["']focus-lock-header-countdown["']/);
  assert.match(optionsHtml, /class=["']mode-status active["']/);
  assert.doesNotMatch(optionsHtml, /testing-reset-button|testing-tools/);
});

test("mode indicators keep settings and toolbar states distinct", () => {
  const optionsJs = read("options.js");
  const backgroundJs = read("background.js");
  const optionsCss = read("options.css");
  assert.match(optionsJs, /modeStatus\.classList\.toggle\("locked"/);
  assert.match(optionsJs, /modeStatus\.classList\.toggle\("off"/);
  assert.match(optionsJs, /modeStatus\.classList\.toggle\("active"/);
  assert.match(backgroundJs, /icon-off16\.png/);
  assert.match(backgroundJs, /icon-locked16\.png/);
  assert.match(optionsCss, /\.mode-status\.locked/);
  assert.match(optionsCss, /\.mode-status\.off/);
});

test("popup UI keeps its runtime contract", () => {
  for (const id of [
    "break-status",
    "break-time",
    "empty-site",
    "site-badge",
    "lock-duration",
    "lock-button",
    "pass-section",
    "break-code",
    "break-code-input",
    "pass-button",
    "settings-button",
    "global-toggle-row",
    "global-enabled",
    "global-enabled-state",
    "focus-lock-banner",
    "focus-lock-countdown",
    "priority-card",
    "site-activation",
    "site-activation-button"
  ]) {
    assert.match(popupHtml, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(optionsHtml, /<option value=["']24["'] selected>24 hours<\/option>/);
  assert.match(popupHtml, /<option value=["']24["'] selected>24 hours<\/option>/);
});

test("locked popup view replaces unavailable controls with status", () => {
  const popupJs = read("popup.js");
  assert.match(popupJs, /global-toggle-row.*classList\.toggle\("hidden", globalLocked\)/);
  assert.match(popupJs, /priority-card.*classList\.toggle\("hidden", !showBreakStatus\)/);
  assert.match(popupJs, /pass-section.*classList\.toggle\("hidden", !locked \|\| \(!available && !bypassed\)\)/);
  assert.match(popupJs, /focus-lock-countdown/);
  assert.match(popupJs, /formatEndTime/);
});

test("content CSS keeps destructive behavior scoped", () => {
  assert.match(contentCss, /\.unaddictify-strip-media \.unaddictify-media/);
  assert.doesNotMatch(contentCss, /unaddictify-strip-media (?:img|video|canvas)/);
  assert.match(contentCss, /\.unaddictify-hide-notification-badges \.unaddictify-notification-badge/);
  assert.doesNotMatch(contentCss, /unaddictify-hide-notification-badges \[class\*="(?:notification|unread|mention)"/);
  assert.doesNotMatch(contentCss, /unaddictify-pending[\s\S]*grayscale/);
});

test("content script repairs host pages that replace extension state classes", () => {
  assert.match(contentJs, /function rootStateNeedsRepair\(\)/);
  assert.match(contentJs, /target === document\.documentElement && record\.attributeName === "class"/);
  assert.match(contentJs, /if \(rootStateNeedsRepair\(\)\) applyRootState\(\)/);
  assert.doesNotMatch(contentJs, /\[class\*='message' i\] img/);
  assert.match(contentJs, /function isDiscordProfileImage\(element\)/);
  assert.match(contentJs, /function isDiscordEmoji\(element\)/);
  assert.match(contentJs, /const visual = isVisualImage\(element\);/);
  assert.match(contentJs, /setMediaClass\(element, "unaddictify-profile-media", profile\)/);
  assert.match(contentJs, /function isInteractiveControl\(element\)/);
  assert.match(contentJs, /function markNotificationBadge\(element\)/);
  assert.match(contentJs, /header, nav, \[role='banner'\], \[role='navigation'\]/);
  assert.doesNotMatch(contentJs, /\[class\*='notification' i\]/);
  assert.doesNotMatch(contentJs, /\[class\*='badge' i\]/);
});
