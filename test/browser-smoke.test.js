const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
let playwright = null;
try {
  playwright = require("playwright");
} catch (_) {
  // The extension has no browser-test dependency. Install Playwright locally
  // when you want to opt into this smoke test.
}

const smokeEnabled = process.env.BLOKAMINE_BROWSER_SMOKE === "1";
const skipReason = !smokeEnabled
  ? "Set BLOKAMINE_BROWSER_SMOKE=1 to run the optional browser smoke test."
  : !playwright
    ? "Playwright is not installed in this workspace."
    : false;

const FIXTURE = `<!doctype html>
<html>
  <head><title>Educational test video - YouTube</title></head>
  <body>
    <button id="focus-target" type="button">Focus target</button>
    <img id="profile-avatar" alt="Profile picture" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
    <article><span id="engagement-label">watch this</span></article>
    <div id="movie_player"><video></video></div>
    <div id="title"><h1><yt-formatted-string>Educational test video</yt-formatted-string></h1></div>
  </body>
</html>`;

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(FIXTURE);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function stopFixtureServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function setSmokeSettings(page) {
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      enabled: true,
      sites: { youtube: true },
      features: {
        hideProfileMedia: true,
        hideEngagementCounts: true
      },
      lockUntil: Date.now() + 60 * 60 * 1000,
      siteSettings: {
        youtube: {
          requireVideoApproval: true,
          sabotageOpenedVideos: true
        }
      }
    });
  });
}

test("YouTube Focus Lock choices work in a browser", { skip: skipReason }, async () => {
  const { server, port } = await startFixtureServer();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "blokamine-browser-smoke-"));
  let context = null;

  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: [
        `--disable-extensions-except=${root}`,
        `--load-extension=${root}`,
        "--host-resolver-rules=MAP youtube.com 127.0.0.1,MAP www.youtube.com 127.0.0.1,EXCLUDE localhost"
      ]
    });

    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).hostname;
    const settingsPage = await context.newPage();
    await settingsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await setSmokeSettings(settingsPage);
    await settingsPage.close();

    const page = await context.newPage();
    const videoUrl = (id) => `http://youtube.com:${port}/watch?v=${id}`;

    await page.goto(videoUrl("paused12345"));
    const gate = page.locator(".unaddictify-youtube-focus-gate");
    await gate.waitFor({ state: "visible" });
    assert.equal(await gate.locator("h2").textContent(), "Is this video educational?");
    assert.deepEqual(await gate.locator(".unaddictify-youtube-focus-button").allTextContents(), [
      "Yes — play normally",
      "Keep it less rewarding",
      "Keep it paused"
    ]);
    await page.locator("#profile-avatar.unaddictify-profile-media").waitFor();
    assert.equal(await page.locator("#profile-avatar").evaluate((image) => image.classList.contains("unaddictify-media")), true);
    await page.evaluate(() => {
      document.querySelector("#engagement-label").textContent = "123 likes";
    });
    await page.waitForFunction(() => document.querySelector("#engagement-label")?.textContent === "— likes");

    await page.getByRole("button", { name: "Keep it paused" }).click();
    assert.equal(await gate.isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Video will stay paused" }).isDisabled(), true);

    await page.locator("#focus-target").focus();
    await page.evaluate(() => {
      history.pushState({}, "", "/watch?v=focus12345");
      window.dispatchEvent(new Event("unaddictify-location-change"));
    });
    const routedGate = page.locator(".unaddictify-youtube-focus-gate");
    await routedGate.waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Yes — play normally" }).click();
    await routedGate.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "focus-target");

    await page.goto(videoUrl("friction123"));
    await page.locator(".unaddictify-youtube-focus-gate").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Keep it less rewarding" }).click();
    await page.locator(".unaddictify-youtube-focus-gate").waitFor({ state: "detached" });
    assert.equal(await page.locator("#movie_player").evaluate((player) => player.classList.contains("unaddictify-approved-player")), false);

    await page.goto(videoUrl("normal12345"));
    await page.locator(".unaddictify-youtube-focus-gate").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Yes — play normally" }).click();
    await page.locator(".unaddictify-youtube-focus-gate").waitFor({ state: "detached" });
    assert.equal(await page.locator("#movie_player").evaluate((player) => player.classList.contains("unaddictify-approved-player")), true);

    await page.evaluate(async () => {
      await chrome.storage.local.set({ lockUntil: 0 });
    });
    await page.goto(videoUrl("unlocked123"));
    const unlockedGate = page.locator(".unaddictify-youtube-focus-gate");
    await unlockedGate.waitFor({ state: "visible" });
    assert.equal(await unlockedGate.locator("h2").textContent(), "Is this video educational?");
    await page.getByRole("button", { name: "Yes — play normally" }).click();
    await unlockedGate.waitFor({ state: "detached" });
    assert.equal(await page.locator("#movie_player").evaluate((player) => player.classList.contains("unaddictify-approved-player")), true);
  } finally {
    await context?.close();
    await stopFixtureServer(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
