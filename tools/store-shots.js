#!/usr/bin/env node
/**
 * Builds the Chrome Web Store artifacts from the built extension.
 *
 *   npm run build && node tools/store-shots.js
 *   npm install --no-save playwright   (once, if it is not already there)
 *
 * Writes `store-assets/`: four 1280x800 screenshots and the 440x280 promotional
 * tile, all at the sizes the store wants.
 *
 * Three decisions worth knowing about.
 *
 * It loads `dist/`, not the repo root. `dist/` is what `npm run zip` packages and
 * what a reviewer installs, so it is what the pictures have to come from. The other
 * dev tools here load the root, which works because the manifest sits there, and
 * which means they have never once photographed the artifact being submitted.
 *
 * The demo page is served by intercepting the request, not by a local HTTP server
 * behind `--host-resolver-rules`. Decaf only runs on the hosts in its manifest, and
 * every one of those hosts is in Chromium's HSTS preload list: `http://` is upgraded
 * to `https://` before it reaches the resolver, and a plain local server then fails
 * the handshake with `ERR_SSL_PROTOCOL_ERROR`. Fulfilling the route hands the page
 * back through the automation channel, so the document's origin really is
 * `https://www.youtube.com` — which is what makes the content script run — with no
 * certificate in the way.
 *
 * Every pixel of interface in these files was rendered by the extension. The
 * screenshots are not mockups: a real Chromium loads the real build, a local server
 * answers as a host the manifest lists, the content script does its work, and the
 * popup and the options page are their own documents. The only thing this tool draws
 * is the caption band around them — and the sources are captured at exactly the size
 * they are placed at, because a 1280-wide screenshot scaled down to fit a frame is a
 * blurry screenshot.
 *
 * The composition is done in the browser rather than with an image library. The page
 * being screenshotted is already a layout engine; asking it to put one PNG on top of
 * another is less code than a dependency, and it means the caption typography is set
 * in CSS instead of measured by hand.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const playwright = require("playwright");
const { DEMO_SITE, DEMO_HOST } = require("./demo-site.js");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const out = path.join(root, "store-assets");

/** Store sizes. The band is the caption strip; the stage is the picture under it. */
const WIDTH = 1280;
const HEIGHT = 800;
const BAND = 132;
const STAGE = HEIGHT - BAND;

const SITE_URL = `https://${DEMO_HOST}/`;

const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;
const fileUrl = (file) => dataUrl(fs.readFileSync(file));

/**
 * The caption band, the palette and the type. Deliberately the product's own
 * tokens from `popup.css` — a store listing that does not look like the thing it is
 * selling makes the buyer wonder which one is out of date.
 */
const STYLE = `
  * { box-sizing: border-box }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    margin: 0;
    overflow: hidden;
    background: #faf8f5;
    color: #1d1b19;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .head {
    display: flex;
    height: ${BAND}px;
    flex-direction: column;
    justify-content: center;
    padding: 0 56px;
    background:
      radial-gradient(120% 300% at 100% 0%, #f3ece2 0%, transparent 58%),
      #faf8f5;
  }
  .eyebrow {
    margin: 0;
    color: #6f4e37;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.17em;
    text-transform: uppercase;
  }
  h1 {
    margin: 9px 0 0;
    font-size: 31px;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.15;
  }
  .note { margin: 7px 0 0; color: #6d675f; font-size: 15.5px }
  .stage {
    position: relative;
    width: ${WIDTH}px;
    height: ${STAGE}px;
    overflow: hidden;
    border-top: 1px solid #e7e0d5;
  }
  img.page { display: block; width: ${WIDTH}px; height: ${STAGE}px }
  img.popup {
    position: absolute;
    top: 26px;
    right: 34px;
    border-radius: 12px;
    box-shadow:
      0 0 0 1px rgba(29, 27, 25, 0.09),
      0 30px 70px -24px rgba(29, 27, 25, 0.45);
  }
  .centre {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    padding: 0 40px;
    background:
      radial-gradient(90% 120% at 50% 0%, #fffefc 0%, #f4efe7 100%);
  }
  .centre img {
    display: block;
    border-radius: 14px;
    box-shadow:
      0 0 0 1px rgba(29, 27, 25, 0.07),
      0 26px 60px -26px rgba(29, 27, 25, 0.4);
  }
  /* Says out loud that the page under the extension is a stand-in. The extension's
     own notice names the site it is running on, because that is what the extension
     does, and a picture where the notice says one thing and the page is plainly not
     that site needs to account for itself rather than hope nobody looks. */
  .stamp {
    position: absolute;
    right: 14px;
    bottom: 13px;
    padding: 5px 9px;
    border-radius: 7px;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(29, 27, 25, 0.58);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
`;

function frame({ eyebrow, title, note, body, stamp }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head>
<body>
  <div class="head">
    <p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1>
    <p class="note">${note}</p>
  </div>
  <div class="stage">
    ${body}
    ${stamp ? `<span class="stamp">${stamp}</span>` : ""}
  </div>
</body></html>`;
}

/** On every shot whose background is the stand-in feed page. */
const STAND_IN = "Stand-in page &middot; the extension is the shipped build";

/** 440x280. One claim, the real icon, and nothing else. */
function tile(icon) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box }
  body {
    display: flex;
    width: 440px;
    height: 280px;
    flex-direction: column;
    justify-content: center;
    margin: 0;
    padding: 0 34px;
    overflow: hidden;
    background: radial-gradient(120% 140% at 8% 0%, #8a6247 0%, #4b3325 62%, #35231a 100%);
    color: #fdfbf8;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  img { display: block; width: 58px; height: 58px; border-radius: 14px }
  h1 { margin: 18px 0 0; font-size: 34px; font-weight: 750; letter-spacing: -0.03em }
  p { margin: 9px 0 0; color: rgba(253, 251, 248, 0.76); font-size: 15px }
</style></head>
<body>
  <img src="${icon}" alt="">
  <h1>Decaf</h1>
  <p>The same web, without the stimulant.</p>
</body></html>`;
}

async function shoot(context, name, html, size = { width: WIDTH, height: HEIGHT }) {
  const page = await context.newPage();
  await page.setViewportSize(size);
  await page.setContent(html, { waitUntil: "load" });
  // Data URLs decode asynchronously; without this the first frame can be blank.
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).map((image) => image.decode())),
  );
  await page.screenshot({ path: path.join(out, name) });
  await page.close();
  process.stdout.write(`  ${name}\n`);
}

async function main() {
  if (!fs.existsSync(path.join(dist, "manifest.json"))) {
    process.stderr.write("dist/manifest.json is missing. Run `npm run build` first.\n");
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-store-"));

  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: WIDTH, height: STAGE },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });

  // The demo page, answered without a network. Subresources are all inline, so
  // anything else asked for under this host gets an empty 204 rather than a 404 in
  // the console.
  await context.route(`https://${DEMO_HOST}/**`, (route) =>
    route.request().url() === SITE_URL
      ? route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: DEMO_SITE,
        })
      : route.fulfill({ status: 204, body: "" }),
  );

  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname;

  /* --- the page, with the extension working on it ------------------------- */
  const site = await context.newPage();
  await site.goto(SITE_URL);
  await site.waitForSelector(".decaf-notice");
  // The drain and the badge swap are transitions; catching them mid-way makes the
  // shot look like a half-loaded page.
  await site.waitForTimeout(700);
  const pageShot = await site.screenshot();

  /* --- the popup, as its own document ------------------------------------ */
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 328, height: 452 });
  // There is no toolbar here, so the popup has no tab to read. This is the same
  // stub the other dev tools use.
  await popup.addInitScript(() => {
    chrome.tabs.query = async () => [{ url: `https://${"www.youtube.com"}/`, id: 1 }];
  });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForTimeout(600);
  const popupShot = await popup.screenshot();
  await popup.close();

  /* --- the options page -------------------------------------------------- */
  const options = await context.newPage();
  await options.setViewportSize({ width: WIDTH, height: STAGE });
  await options.goto(`chrome-extension://${id}/options.html`);
  // The switches animate into position; a shot taken too early shows them all off.
  await options.waitForTimeout(700);
  const optionsShot = await options.screenshot();
  await options.close();

  /* --- the hold, actually being held ------------------------------------- */
  const wide = await context.newPage();
  await wide.setViewportSize({ width: 1560, height: 900 });
  await wide.goto(SITE_URL);
  await wide.waitForSelector(".decaf-notice");
  /* Zoomed, not scaled afterwards. The notice comes out about 540px wide, which
     centred in a 1280x668 frame is a small card in a lot of empty paper; enlarging
     that PNG would just make a soft one. Zoom re-lays the page out at a larger CSS
     pixel and renders the type at that size, which is the same thing a viewer at 190%
     browser zoom sees — the ring and the label stay sharp. */
  await wide.evaluate(() => {
    document.documentElement.style.zoom = "1.9";
  });
  await wide.waitForTimeout(700);
  const hold = wide.locator(".decaf-notice-hold");
  await hold.hover();
  await wide.mouse.down();
  // Two thirds of the three-second first pass: far enough round the ring to read as
  // progress, not far enough to have granted it.
  await wide.waitForTimeout(2000);
  const holdShot = await wide.locator(".decaf-notice").screenshot();
  await wide.mouse.up();
  await wide.close();

  await site.close();

  /* --- compose ----------------------------------------------------------- */
  await shoot(
    context,
    "01-paused-1280x800.png",
    frame({
      eyebrow: "Decaf &middot; Chrome extension",
      title: "The feed is paused. The page is not.",
      note: "The header, the sidebar and everything you opened on purpose stay exactly where they were.",
      body: `<img class="page" src="${dataUrl(pageShot)}" alt="">`,
      stamp: STAND_IN,
    }),
  );

  await shoot(
    context,
    "02-popup-1280x800.png",
    frame({
      eyebrow: "Decaf &middot; One switch per site",
      title: "On for this site, off for that one.",
      note: "Twelve sites are covered. Each one is yours to switch, and the switch takes effect without a reload.",
      body:
        `<img class="page" src="${dataUrl(pageShot)}" alt="">` +
        `<img class="popup" src="${dataUrl(popupShot)}" alt="">`,
      stamp: STAND_IN,
    }),
  );

  await shoot(
    context,
    "03-settings-1280x800.png",
    frame({
      eyebrow: "Decaf &middot; Settings",
      title: "Decide what counts as a distraction.",
      note: "Grayscale, reward counts, badges, recommendation rails and the feed itself are separate switches.",
      body: `<img class="page" src="${dataUrl(optionsShot)}" alt="">`,
    }),
  );

  await shoot(
    context,
    "04-hold-1280x800.png",
    frame({
      eyebrow: "Decaf &middot; Not a blocker",
      title: "Not blocked. Three seconds away.",
      note: "Hold the ring and the feed comes back for five minutes. Today's first pass is three seconds; the next is seven.",
      body: `<div class="centre"><img src="${dataUrl(holdShot)}" alt=""></div>`,
      stamp: STAND_IN,
    }),
  );

  await shoot(context, "promo-440x280.png", tile(fileUrl(path.join(dist, "icons", "icon128.png"))), {
    width: 440,
    height: 280,
  });

  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
  process.stdout.write(`store assets in ${path.relative(root, out)}\n`);
}

main();
