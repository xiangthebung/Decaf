const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const exists = (name) => fs.existsSync(path.join(root, name));

test("manifest is ready for a production package", () => {
  const manifest = readJson("manifest.json");
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "blokamine");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length >= 25 && manifest.description.length <= 132);
  assert.deepEqual(manifest.permissions, ["storage", "activeTab", "alarms"]);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.options_page, "options.html");

  for (const file of [
    "popup.html",
    "popup.css",
    "popup.js",
    "background.js",
    "options.html",
    "options.css",
    "options.js",
    "shared.js",
    "content.css",
    "content.js",
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons)
  ]) {
    assert.ok(exists(file), `missing package file: ${file}`);
  }
  for (const icon of [
    "icons/icon-off16.png",
    "icons/icon-off32.png",
    "icons/icon-off48.png",
    "icons/icon-off128.png",
    "icons/icon-locked16.png",
    "icons/icon-locked32.png",
    "icons/icon-locked48.png",
    "icons/icon-locked128.png"
  ]) {
    assert.ok(exists(icon), `missing state icon: ${icon}`);
  }
});

test("production settings UI contains no developer-only controls", () => {
  const optionsHtml = fs.readFileSync(path.join(root, "options.html"), "utf8");
  const optionsJs = fs.readFileSync(path.join(root, "options.js"), "utf8");
  assert.doesNotMatch(optionsHtml, /testing-reset-button|testing-tools/);
  assert.doesNotMatch(optionsJs, /resetFocusForTesting|testing-reset-button|testing-tools/);
});

test("store-facing pages use the blokamine brand consistently", () => {
  for (const file of ["manifest.json", "popup.html", "popup.js", "options.html", "options.js", "README.md"]) {
    const contents = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(contents, />Unaddictify<|["']Unaddictify["']/,
      `${file} still exposes the old brand`);
  }
});
