#!/usr/bin/env node
/**
 * Dev-only helper: checks that Decaf's notice lays out correctly inside hostile
 * parent layouts, and reports its measurements on a live site.
 * Requires `npm install --no-save playwright`.
 *
 *   node tools/layout.js               # local layout torture test
 *   node tools/layout.js live          # measure on real pages
 */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const playwright = require("playwright");

const { SITE_FIXTURES, pageFor } = require("./site-fixtures.js");

const root = path.resolve(__dirname, "..");
const shots = path.join(os.tmpdir(), "decaf-layout");

/**
 * Each case wraps the feed container in a layout that real sites use and that
 * has broken in-page panels before.
 */
const CASES = {
  block: { style: "", inner: "" },
  "flex-row": { style: "display:flex;gap:16px;align-items:flex-start", inner: "" },
  "flex-row-center": { style: "display:flex;justify-content:center;align-items:center;min-height:600px", inner: "" },
  "flex-column": { style: "display:flex;flex-direction:column", inner: "" },
  grid: { style: "display:grid;grid-template-columns:270px minmax(0,1fr) 320px;gap:24px", inner: "" },
  "grid-areas": {
    style: "display:grid;grid-template-columns:270px 1fr;grid-template-areas:'nav feed';gap:24px",
    inner: "grid-area:feed"
  },
  "narrow-column": { style: "width:360px", inner: "" },
  centered_text: { style: "text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase", inner: "" },
  rtl: { style: "direction:rtl", inner: "" },
  "table-row": { style: "display:table;width:100%", inner: "display:table-cell" },
  transformed: { style: "transform:translateZ(0);contain:layout style", inner: "" },
  // YouTube really does this, and it used to shrink anything sized in rem.
  "tiny-root-font": { style: "", inner: "", extra: "html { font-size: 10px }" },
  "huge-root-font": { style: "", inner: "", extra: "html { font-size: 24px }" },
  "dark-page": { style: "", inner: "", extra: "body { background:#0f0f0f; color:#f1f1f1 }" },
  // The container the site gives us sits inside something it clips.
  "clipped-ancestor": { style: "", inner: "overflow:hidden;height:120px" },
  "clipped-and-short": { style: "", inner: "overflow:hidden;height:120px", viewport: { width: 1100, height: 300 } },
  "short-window": { style: "", inner: "", viewport: { width: 1100, height: 300 } },
  // No container Decaf recognizes, and a decoy wrapper inside the first post:
  // this is the shape that once left a single post on screen with a black hole.
  "unrecognized-feed": {
    body: `
      <header id="nav">Site header</header>
      <div id="outer"><div id="feed-list">
        <article><div class="media"><div class="slide">a</div><div class="slide">b</div><div class="slide">c</div></div></article>
        <article><div class="media">2</div></article>
        <article><div class="media">3</div></article>
      </div></div>`
  },
  // A second feed region the selectors do not know about.
  "leftover-feed": {
    body: `
      <header id="nav">Site header</header>
      <div id="page-manager"><ytd-browse page-subtype="home"><ytd-rich-grid-renderer style="display:block">
        <ytd-rich-item-renderer>video</ytd-rich-item-renderer>
      </ytd-rich-grid-renderer></ytd-browse></div>
      <div id="second-feed"><article>one</article><article>two</article><article>three</article></div>`
  },
  "hostile-css": { style: "", inner: "", extra: `
    * { box-sizing: content-box !important; letter-spacing: 3px !important; }
    div, p, span, button { font-family: "Comic Sans MS", cursive !important; line-height: 3 !important;
      text-transform: uppercase !important; float: left !important; opacity: .4 !important; }
    button { -webkit-appearance: none; background: red !important; color: lime !important;
      border-radius: 0 !important; padding: 40px !important; }
    p { margin: 30px !important; text-indent: 40px !important; }
  ` }
};

function fixture(name) {
  const testCase = CASES[name] || CASES.block;
  const body = testCase.body || `
  <header><strong>Site header</strong></header>
  <div id="shell" style="${testCase.style || ""}">
    <nav>Home<br>Subscriptions<br>You</nav>
    <div id="page-manager" style="${testCase.inner || ""}">
      <ytd-browse page-subtype="home">
        <ytd-rich-grid-renderer style="display:block">
          <ytd-rich-item-renderer>Feed content that should never be seen.</ytd-rich-item-renderer>
          <ytd-rich-item-renderer>Feed content that should never be seen.</ytd-rich-item-renderer>
          <ytd-rich-item-renderer>Feed content that should never be seen.</ytd-rich-item-renderer>
        </ytd-rich-grid-renderer>
      </ytd-browse>
    </div>
    <aside>side</aside>
  </div>`;
  return `<!doctype html><html><head><title>Fixture</title>
<style>
  :root { color-scheme: light dark }
  body { margin:0; font:15px system-ui; background:#fff; color:#111 }
  header { height:56px; border-bottom:1px solid #ddd; display:flex; align-items:center; padding:0 16px }
  nav { color:#555 }
  article, ytd-rich-item-renderer, .slide { display:block; margin:8px 0; padding:20px 12px; background:#eee }
  ${testCase.extra || ""}
</style></head>
<body>${body}</body></html>`;
}

const MEASURE = () => {
  const notice = document.querySelector(".decaf-notice");
  if (!notice) return { error: "no notice" };
  const rect = notice.getBoundingClientRect();
  const style = getComputedStyle(notice);
  const button = notice.querySelector(".decaf-notice-hold");
  const buttonRect = button.getBoundingClientRect();
  const title = notice.querySelector(".decaf-notice-title");
  const titleRect = title.getBoundingClientRect();
  const hint = notice.querySelector(".decaf-notice-hint").getBoundingClientRect();
  const parent = notice.parentElement;
  const parentRect = parent.getBoundingClientRect();
  const visible = (element) => Boolean(element.getClientRects().length);
  const items = [...document.querySelectorAll(
    "article,[role='article'],shreddit-post,ytd-rich-item-renderer,[data-testid='cellInnerDiv'],[data-test-id='pin']"
  )].filter((item) => visible(item) && !notice.contains(item));
  let clipped = false;
  let walk = notice.parentElement;
  while (walk && walk !== document.documentElement && walk !== document.body) {
    const style = getComputedStyle(walk);
    if (style.overflowX === "hidden" || style.overflowY === "hidden") {
      const box = walk.getBoundingClientRect();
      if (rect.top < box.top - 1 || rect.bottom > box.bottom + 1 ||
          rect.left < box.left - 1 || rect.right > box.right + 1) clipped = true;
    }
    walk = walk.parentElement;
  }
  return {
    visibleItems: items.length,
    clipped,
    reachable: rect.top >= -1 && rect.left >= -1 && rect.bottom <= document.documentElement.scrollHeight + 1,
    fullyVisible: rect.top >= -1 && rect.bottom <= (window.innerHeight || 0) + 1,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    parent: `${parent.localName}${parent.id ? `#${parent.id}` : ""} (${getComputedStyle(parent).display})`,
    parentWidth: Math.round(parentRect.width),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    display: style.display,
    fontSize: style.fontSize,
    float: style.cssFloat,
    align: style.textAlign,
    font: style.fontFamily.slice(0, 24),
    opacity: style.opacity,
    lineHeight: style.lineHeight,
    titleWidth: Math.round(titleRect.width),
    titleBelowTop: Math.round(titleRect.top - rect.top),
    buttonWidth: Math.round(buttonRect.width),
    buttonInside: buttonRect.left >= rect.left - 1 && buttonRect.right <= rect.right + 1,
    hintBelowButton: Math.round(hint.top - buttonRect.bottom),
    overflows: Math.round(rect.right) > Math.round(document.documentElement.clientWidth),
    childrenStacked: Math.round(titleRect.bottom) <= Math.round(buttonRect.top)
  };
};

async function launch({ mapHost = false } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-layout-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      ...(mapHost ? ["--host-resolver-rules=MAP www.youtube.com 127.0.0.1,EXCLUDE localhost"] : [])
    ]
  });
  return { context, profile };
}

async function local() {
  fs.mkdirSync(shots, { recursive: true });
  const server = http.createServer((request, response) => {
    // The fixture always lives at "/" so the route stays a feed route.
    const name = new URL(request.url, "http://fixture").searchParams.get("case") || "block";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixture(name));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const { context, profile } = await launch({ mapHost: true });

  let problems = 0;
  for (const [name, testCase] of Object.entries(CASES)) {
    const page = await context.newPage();
    if (testCase.viewport) await page.setViewportSize(testCase.viewport);
    let report = { error: "no notice" };
    try {
      await page.goto(`http://www.youtube.com:${port}/?case=${name}`, { timeout: 15000 });
      await page.waitForSelector(".decaf-notice", { timeout: 8000 });
      await page.waitForTimeout(250);
      report = await page.evaluate(MEASURE);
    } catch (error) {
      report = { error: error.message.split("\n")[0] };
    }
    const issues = [];
    if (report.error) issues.push(report.error);
    else {
      if (report.width < 300) issues.push(`too narrow (${report.width}px)`);
      if (report.width > 560) issues.push(`too wide (${report.width}px)`);
      if (report.parentWidth >= 800 && report.width < 500) {
        issues.push(`cramped in a wide column (${report.width}px of ${report.parentWidth}px)`);
      }
      const lineHeight = Number.parseFloat(report.lineHeight);
      if (!(lineHeight >= 21 && lineHeight <= 26)) issues.push(`inherited line height (${report.lineHeight})`);
      if (report.fontSize !== "16px") issues.push(`inherited font size (${report.fontSize})`);
      if (report.height < 150 || report.height > 320) issues.push(`odd height (${report.height}px)`);
      if (!report.buttonInside) issues.push("button escapes the card");
      if (!report.childrenStacked) issues.push("contents overlap");
      if (report.overflows) issues.push("card runs off the page");
      if (report.float !== "none") issues.push(`floated (${report.float})`);
      if (Number(report.opacity) < 1) issues.push(`faded (${report.opacity})`);
      if (!/system-ui|-apple-system/.test(report.font)) issues.push(`host font (${report.font})`);
      if (report.visibleItems) issues.push(`${report.visibleItems} feed item(s) still visible`);
      if (report.clipped) issues.push("card is clipped by an ancestor");
      if (!report.reachable) issues.push("card cannot be reached by scrolling");
      if (!report.fullyVisible) issues.push(`card does not fit the window (${report.viewport})`);
    }
    if (issues.length) problems += 1;
    process.stdout.write(`${issues.length ? "FAIL" : "ok  "} ${name.padEnd(15)} ${JSON.stringify(report)}\n`);
    if (issues.length) process.stdout.write(`      → ${issues.join(", ")}\n`);
    await page.screenshot({ path: path.join(shots, `${name}.png`) });
    await page.close();
  }

  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`\n${problems ? `${problems} layout problem(s)` : "all layouts fine"} · screenshots in ${shots}\n`);
  process.exitCode = problems ? 1 : 0;
}

async function live() {
  fs.mkdirSync(shots, { recursive: true });
  const { context, profile } = await launch();
  for (const url of ["https://www.youtube.com/", "https://www.pinterest.com/"]) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForSelector(".decaf-notice", { timeout: 30000 });
      await page.waitForTimeout(3000);
      process.stdout.write(`${url}\n  ${JSON.stringify(await page.evaluate(MEASURE))}\n`);
      const name = new URL(url).hostname.replace(/\./g, "-");
      await page.screenshot({ path: path.join(shots, `live-${name}.png`) });
      const notice = await page.locator(".decaf-notice").boundingBox();
      if (notice) {
        await page.screenshot({
          path: path.join(shots, `live-${name}-notice.png`),
          clip: {
            x: Math.max(0, notice.x - 24),
            y: Math.max(0, notice.y - 24),
            width: notice.width + 48,
            height: notice.height + 48
          }
        });
      }
    } catch (error) {
      process.stdout.write(`${url}\n  unavailable: ${error.message.split("\n")[0]}\n`);
    }
    await page.close();
  }
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`\nscreenshots in ${shots}\n`);
}

/**
 * Every supported site, using a stand-in for its real shell. Each fixture is
 * measured twice: once on an unmatched host, where Decaf is inactive, and once on
 * the site's own host. The site's header and sidebars have to land in exactly the
 * same place both times — that is what "the page still looks right" means.
 */
async function sites() {
  fs.mkdirSync(shots, { recursive: true });
  const hosts = Object.values(SITE_FIXTURES).map((fixture) => fixture.host);
  const server = http.createServer((request, response) => {
    const asked = new URL(request.url, "http://fixture").searchParams.get("site");
    const host = (request.headers.host || "").split(":")[0];
    const key = asked || Object.keys(SITE_FIXTURES).find((name) => SITE_FIXTURES[name].host === host);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(pageFor(key) || "<!doctype html><title>unknown</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-sites-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      `--host-resolver-rules=${hosts.map((host) => `MAP ${host} 127.0.0.1`).join(",")},EXCLUDE localhost`
    ]
  });

  const GEOMETRY = (ids) => Object.fromEntries(ids.map((id) => {
    const element = document.getElementById(id);
    if (!element) return [id, null];
    const rect = element.getBoundingClientRect();
    return [id, { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width) }];
  }));

  let problems = 0;
  for (const [key, fixture] of Object.entries(SITE_FIXTURES)) {
    const issues = [];
    let report = {};
    const measured = [...fixture.keep, fixture.container];

    // Baseline: same markup, host Decaf does not act on.
    const plain = await context.newPage();
    let baseline = {};
    try {
      await plain.goto(`http://127.0.0.1:${port}/?site=${key}`, { timeout: 15000 });
      await plain.waitForTimeout(150);
      baseline = await plain.evaluate(GEOMETRY, measured);
      if (await plain.locator(".decaf-notice").count()) issues.push("Decaf ran on an unmatched host");
    } catch (error) {
      issues.push(`baseline failed: ${error.message.split("\n")[0]}`);
    }
    await plain.close();

    const page = await context.newPage();
    try {
      await page.goto(`http://${fixture.host}:${port}/`, { timeout: 15000 });
      await page.waitForSelector(".decaf-notice", { timeout: 8000 });
      await page.waitForTimeout(250);
      report = await page.evaluate(({ container, keep, before, ids }) => {
        const visible = (element) => Boolean(element && element.getClientRects().length);
        const notice = document.querySelector(".decaf-notice");
        const rect = notice.getBoundingClientRect();
        const host = document.getElementById(container);
        const after = Object.fromEntries(ids.map((id) => {
          const element = document.getElementById(id);
          if (!element) return [id, null];
          const box = element.getBoundingClientRect();
          return [id, { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) }];
        }));
        // The container is allowed to change size and to rise a little (a
        // recommendation rail above it may be gone). Everything else — header,
        // sidebars, columns — has to land exactly where it was.
        const moved = ids.map((id) => {
          const was = before[id];
          const now = after[id];
          if (!was || !now) return `${id}: missing`;
          const isContainer = id === container;
          const slack = isContainer ? 40 : 2;
          const deltas = [];
          if (Math.abs(was.x - now.x) > 2) deltas.push(`x ${was.x}→${now.x}`);
          if (Math.abs(was.y - now.y) > slack) deltas.push(`y ${was.y}→${now.y}`);
          if (!isContainer && Math.abs(was.w - now.w) > 2) deltas.push(`w ${was.w}→${now.w}`);
          return deltas.length ? `${id}: ${deltas.join(", ")}` : "";
        }).filter(Boolean);
        return {
          width: Math.round(rect.width),
          insideContainer: notice.parentElement === host,
          firstChild: host?.firstElementChild === notice,
          hostMarked: Boolean(host?.classList.contains("decaf-feed-host")),
          hostVisible: visible(host),
          noticeVisible: visible(notice),
          moved,
          hiddenChrome: keep.filter((id) => !visible(document.getElementById(id))),
          items: [...document.querySelectorAll("article,[role='article'],shreddit-post,ytd-rich-item-renderer,[data-test-id='pin'],[data-testid='cellInnerDiv'],[data-pressable-container],[data-id^='urn:li:activity']")]
            .filter(visible).length,
          fallbackUsed: Boolean(document.querySelector(".decaf-feed-container")),
          scrolls: getComputedStyle(document.documentElement).overflow
        };
      }, { container: fixture.container, keep: fixture.keep, before: baseline, ids: measured });

      if (!report.noticeVisible) issues.push("notice not visible");
      if (!report.insideContainer) issues.push(`notice is not inside #${fixture.container}`);
      if (!report.firstChild) issues.push("notice is not at the top of the container");
      if (!report.hostMarked) issues.push("container not marked as the host");
      if (!report.hostVisible) issues.push("container was removed from the layout");
      if (report.items) issues.push(`${report.items} feed item(s) still visible`);
      if (report.hiddenChrome.length) issues.push(`site chrome lost: ${report.hiddenChrome.join(", ")}`);
      if (report.moved.length) issues.push(`layout shifted: ${report.moved.join(", ")}`);
      if (report.width < 300 || report.width > 560) issues.push(`odd width (${report.width}px)`);
      if (report.scrolls !== "visible") issues.push("page cannot scroll");
      if (report.fallbackUsed) issues.push("fell back to shape matching");
    } catch (error) {
      issues.push(error.message.split("\n")[0]);
    }
    if (issues.length) problems += 1;
    process.stdout.write(`${issues.length ? "FAIL" : "ok  "} ${key.padEnd(12)} ${JSON.stringify(report)}\n`);
    if (issues.length) process.stdout.write(`      → ${issues.join(", ")}\n`);
    await page.screenshot({ path: path.join(shots, `site-${key}.png`) });
    await page.close();
  }

  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`\n${problems ? `${problems} site problem(s)` : "all sites fine"} · screenshots in ${shots}\n`);
  process.exitCode = problems ? 1 : 0;
}

/** Screenshots the hold half way through, so the progress bar can be eyeballed. */
async function hold() {
  fs.mkdirSync(shots, { recursive: true });
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, "http://fixture").searchParams.get("case") || "block";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixture(name));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const { context, profile } = await launch({ mapHost: true });
  const page = await context.newPage();
  await page.goto(`http://www.youtube.com:${port}/`);
  await page.waitForSelector(".decaf-notice");
  const box = await page.locator(".decaf-notice-hold").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  const scale = await page.evaluate(() =>
    new DOMMatrix(getComputedStyle(document.querySelector(".decaf-notice-fill")).transform).a);
  await page.screenshot({
    path: path.join(shots, "holding.png"),
    clip: { x: box.x - 40, y: box.y - 140, width: box.width + 80, height: 260 }
  });
  await page.mouse.up();
  process.stdout.write(`progress after 1.5s of a 3s hold: ${scale.toFixed(2)}\n`);
  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`screenshot in ${shots}/holding.png\n`);
}

const MODES = { live, sites, local, hold };

(MODES[process.argv[2]] || local)().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
