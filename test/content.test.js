"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { launchPage, settle, wait, until } = require("../tools/harness.js");
const { SITE_FIXTURES, pageFor } = require("../tools/site-fixtures.js");

const FEED_URL = "https://www.youtube.com/";
const WATCH_URL = "https://www.youtube.com/watch?v=aBcD1";

/** A stand-in for YouTube's home page: a feed container plus site chrome. */
const YOUTUBE_HOME = `<!doctype html>
<html><head><title>YouTube</title></head><body>
  <header id="masthead"><input id="site-search" type="search"><nav><a href="/feed/subscriptions">Subs<span id="nav-badge">7</span></a></nav></header>
  <div id="page-manager">
    <ytd-browse page-subtype="home">
      <ytd-rich-grid-renderer id="grid">
        <article><div id="views">45,000 views</div><video id="feed-video"></video></article>
      </ytd-rich-grid-renderer>
    </ytd-browse>
  </div>
</body></html>`;

const CARD_PAGE = `<!doctype html>
<html><head><title>Test page</title></head><body>
  <article aria-label="Post">
    <button aria-label="Like this post along with 1,204 other people"><span id="like-count">1.2K</span></button>
    <div id="views">45,000 views</div>
    <span id="price">1,299</span>
    <div id="composer" contenteditable="true">2,000 likes</div>
  </article>
  <div class="unreadBadge" id="unread">3</div>
  <nav><a href="/inbox">Inbox<span id="nav-badge">7</span></a></nav>
  <div id="feed"></div>
</body></html>`;

const rootClasses = (page) => Array.from(page.document.documentElement.classList);
const notice = (page) => page.document.querySelector(".decaf-notice");

test("a paused feed is emptied in place and says so", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    assert.deepEqual(rootClasses(page).sort(), [
      "decaf-calm", "decaf-feed", "decaf-hide-comments", "decaf-hide-feed", "decaf-on", "decaf-site-youtube"
    ]);

    const panel = notice(page);
    assert.ok(panel, "the notice is in the page");
    assert.equal(panel.querySelector(".decaf-notice-title").textContent, "Decaf paused the YouTube feed.");
    assert.equal(panel.querySelector(".decaf-notice-label").textContent, "Hold to open for 5 minutes");
    assert.equal(panel.querySelector(".decaf-notice-hint").textContent, "Hold for 3 seconds");
    assert.equal(panel.getAttribute("aria-label"), "Feed paused by Decaf");

    // It sits inside the feed's own container, which keeps its place in the
    // site's layout while its contents are hidden.
    assert.equal(panel.parentElement.id, "grid");
    assert.equal(panel, page.document.getElementById("grid").firstElementChild);
    assert.ok(page.document.getElementById("grid").classList.contains("decaf-feed-host"));
  } finally {
    page.close();
  }
});

/**
 * Most of these sites cannot be loaded by an automated browser, so their shells
 * are reproduced here from the hooks the real pages use. This checks the notice
 * lands in the content column of every supported site and that the header and
 * sidebars are left alone.
 */
test("every supported site puts the notice where its feed was", async () => {
  for (const [key, fixture] of Object.entries(SITE_FIXTURES)) {
    const page = await launchPage({ url: `https://${fixture.host}/`, html: pageFor(key) });
    try {
      const panel = notice(page);
      assert.ok(panel, `${key}: no notice`);
      assert.equal(page.state().site, key);
      assert.equal(page.state().hidingFeed, true, `${key}: the feed is not paused`);
      assert.equal(
        page.api.anchors()[0]?.id,
        fixture.container,
        `${key}: expected the emptied container to be #${fixture.container}`
      );
      assert.equal(panel.parentElement.id, fixture.container, `${key}: notice landed outside the feed's container`);
      assert.equal(
        panel,
        page.document.getElementById(fixture.container).firstElementChild,
        `${key}: notice is not at the top of the feed's container`
      );
      assert.ok(
        page.document.getElementById(fixture.container).classList.contains("decaf-feed-host"),
        `${key}: the container was not marked as the notice's host`
      );
      assert.equal(
        page.document.querySelector(".decaf-feed-container"),
        null,
        `${key}: had to guess the feed by shape`
      );
      for (const id of fixture.keep) {
        assert.ok(page.document.getElementById(id), `${key}: lost #${id} from the site's own chrome`);
      }
    } finally {
      page.close();
    }
  }
});

test("the page is never locked: no scroll blocking and no inert content", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    const html = page.document.documentElement;
    const body = page.document.body;
    assert.equal(html.style.overflow, "");
    assert.equal(body.style.overflow, "");
    assert.ok(!body.inert, "the page behind is still interactive");
    assert.equal(rootClasses(page).includes("decaf-covered"), false);
    // The site's own header and search survive untouched.
    assert.ok(page.document.getElementById("site-search"));
    assert.equal(page.document.getElementById("masthead").classList.contains("decaf-badge"), false);
  } finally {
    page.close();
  }
});

test("the notice goes inside the outermost container, so the layout keeps its shape", async () => {
  // Reddit's feed sits in a <main> that is one cell of the page grid. Emptying
  // that cell keeps the sidebars where they are; removing it would not.
  const html = `<!doctype html><html><head><title>reddit</title></head><body>
    <div id="shell">
      <nav id="left">subs</nav>
      <main id="main-content"><shreddit-feed id="feed"><article>post</article></shreddit-feed></main>
      <aside id="right">recent posts</aside>
    </div>
  </body></html>`;
  const page = await launchPage({ url: "https://www.reddit.com/", html });
  try {
    const panel = notice(page);
    assert.ok(panel);
    assert.equal(page.api.anchors()[0].id, "main-content", "the outermost recognized container");
    assert.equal(panel.parentElement.id, "main-content", "the notice replaces the feed inside that cell");
    assert.equal(page.document.getElementById("feed").parentElement.id, "main-content", "the feed stays put, emptied");
    assert.ok(page.document.getElementById("main-content").classList.contains("decaf-feed-host"));
    // The site's own grid children are untouched.
    assert.equal(page.document.getElementById("left").parentElement.id, "shell");
    assert.equal(page.document.getElementById("right").parentElement.id, "shell");
    assert.equal(page.document.getElementById("shell").children.length, 3, "no new grid children");
  } finally {
    page.close();
  }
});

/**
 * The shape fallback once picked a wrapper *inside* the first post, which left
 * that post on screen with a hole where its picture had been, and hid the notice
 * inside the hole. The container it chooses may never be part of an item.
 */
test("the feed is never mistaken for the inside of one post", async () => {
  const html = `<!doctype html><html><head><title>threads</title></head><body>
    <header id="chrome">nav</header>
    <div id="column">
      <div data-pressable-container id="post">
        <div id="carousel">
          <div data-pressable-container>slide</div>
          <div data-pressable-container>slide</div>
          <div data-pressable-container>slide</div>
        </div>
      </div>
    </div>
  </body></html>`;
  const page = await launchPage({ url: "https://www.threads.com/", html });
  try {
    assert.equal(page.document.getElementById("carousel").classList.contains("decaf-feed-container"), false,
      "a wrapper inside a post is never the feed");
    const container = page.api.anchors()[0];
    assert.ok(container, "a container was found");
    assert.equal(container.id, "column", "the feed is the thing that holds the post");
    assert.equal(notice(page).parentElement.id, "column");
    assert.ok(page.document.getElementById("chrome"), "the site's header is untouched");
  } finally {
    page.close();
  }
});

test("with no feed to pause, Decaf says nothing at all", async () => {
  // A sign-in wall or bot check on a feed route: there is no feed here, so
  // claiming to have paused one would be a lie.
  const page = await launchPage({
    url: "https://www.pinterest.com/",
    html: `<!doctype html><html><head><title>Sign in</title></head><body><div id="wall">Log in to continue</div></body></html>`
  });
  try {
    assert.equal(page.api.anchors().length, 0);
    assert.equal(notice(page), null, "no notice without a feed");
    assert.equal(page.document.getElementById("wall").isConnected, true);
  } finally {
    page.close();
  }
});

test("a feed that has outgrown every selector is still found by shape", async () => {
  const html = `<!doctype html><html><head><title>Pinterest</title></head><body>
    <header id="chrome">nav</header>
    <div id="wrapper"><div id="mystery-feed">
      <article>one</article><article>two</article><article>three</article>
    </div></div>
  </body></html>`;
  const page = await launchPage({ url: "https://www.pinterest.com/", html });
  try {
    const container = page.document.getElementById("mystery-feed");
    assert.ok(container.classList.contains("decaf-feed-container"),
      "no site selector matches, so the feed was found by its items");
    assert.equal(page.api.anchors()[0], container, "and it stays the anchor from then on");
    assert.equal(notice(page).parentElement.id, "mystery-feed");
    assert.ok(container.classList.contains("decaf-feed-host"));
    assert.equal(page.document.getElementById("chrome").classList.contains("decaf-feed-container"), false);

    // The container is hidden now, so its items are gone from view. The notice
    // must not flicker away with them.
    container.replaceChildren();
    page.api.runScan();
    assert.ok(notice(page), "the notice stays put");
    assert.ok(container.classList.contains("decaf-feed-container"));

    // Opening the feed must give it back.
    page.decaf.holdSeconds = () => 0.02;
    notice(page).querySelector(".decaf-notice-hold")
      .dispatchEvent(new page.window.MouseEvent("pointerdown", { bubbles: true }));
    await until(() => !notice(page));
    assert.equal(container.classList.contains("decaf-feed-container"), false, "the mark is removed with the notice");
  } finally {
    page.close();
  }
});

test("the notice matches the site's own theme, not the operating system's", async () => {
  const dark = `<!doctype html><html><head><title>YouTube</title></head>
    <body style="background:#0f0f0f;color:#fff">
      <div id="page-manager"><ytd-browse page-subtype="home">
        <ytd-rich-grid-renderer id="grid"></ytd-rich-grid-renderer>
      </ytd-browse></div>
    </body></html>`;
  const page = await launchPage({ url: FEED_URL, html: dark });
  try {
    assert.ok(notice(page).classList.contains("decaf-dark"), "a dark page gets the dark notice");
  } finally {
    page.close();
  }

  const light = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    assert.equal(notice(light).classList.contains("decaf-dark"), false);
  } finally {
    light.close();
  }
});

test("the first paint of a feed is held back until settings load", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME, deferGet: true });
  try {
    assert.ok(rootClasses(page).includes("decaf-boot"));
    assert.equal(notice(page), null);
    page.chrome.__calls.release();
    await until(() => notice(page));
    assert.equal(rootClasses(page).includes("decaf-boot"), false);
  } finally {
    page.close();
  }
});

test("something opened on purpose is never paused", async () => {
  const page = await launchPage({ url: WATCH_URL });
  try {
    assert.equal(notice(page), null);
    assert.equal(page.state().route, "media");
    assert.ok(rootClasses(page).includes("decaf-media"));
    assert.equal(rootClasses(page).includes("decaf-hide-feed"), false);
  } finally {
    page.close();
  }
});

test("with feeds unpaused the site stays visible but quiet", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME, storage: { pauseFeeds: false } });
  try {
    assert.equal(notice(page), null);
    assert.equal(rootClasses(page).includes("decaf-hide-feed"), false);
    assert.equal(rootClasses(page).includes("decaf-calm"), false);
    assert.ok(rootClasses(page).includes("decaf-on"));
  } finally {
    page.close();
  }
});

test("a site that is switched off is left completely alone", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME, storage: { sites: { youtube: false } } });
  try {
    assert.equal(notice(page), null);
    assert.deepEqual(rootClasses(page), []);
    assert.equal(page.state().active, false);
  } finally {
    page.close();
  }
});

test("holding the button opens the feed for five minutes", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    page.decaf.holdSeconds = () => 0.02;
    const button = notice(page).querySelector(".decaf-notice-hold");
    button.dispatchEvent(new page.window.MouseEvent("pointerdown", { bubbles: true }));
    assert.equal(button.dataset.holding, "true");
    assert.equal(button.querySelector(".decaf-notice-label").textContent, "Keep holding…");
    await until(() => !notice(page));

    const store = page.chrome.__store;
    assert.ok(store.passes.youtube > Date.now(), "a pass is stored");
    assert.ok(store.passes.youtube <= Date.now() + 5 * 60 * 1000);
    assert.equal(store.passCounts.youtube, 1);
    assert.equal(page.state().hidingFeed, false);
    assert.equal(rootClasses(page).includes("decaf-hide-feed"), false);
    assert.match(page.api.chip().textContent, /Feed open for 5 minutes/);
  } finally {
    page.close();
  }
});

test("the hold animation is driven by a class, never by injected CSS", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    const button = notice(page).querySelector(".decaf-notice-hold");
    button.dispatchEvent(new page.window.MouseEvent("pointerdown", { bubbles: true }));
    assert.ok(button.classList.contains("decaf-hold-3"), "3 second hold uses the 3 second class");
    assert.equal(button.getAttribute("style"), null, "no inline styles to be blocked by a page CSP");
    button.dispatchEvent(new page.window.MouseEvent("pointerup", { bubbles: true }));
    assert.equal(button.classList.contains("decaf-hold-3"), false);
  } finally {
    page.close();
  }
});

test("letting go early keeps the feed paused", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    page.decaf.holdSeconds = () => 0.4;
    const button = notice(page).querySelector(".decaf-notice-hold");
    button.dispatchEvent(new page.window.MouseEvent("pointerdown", { bubbles: true }));
    await wait(60);
    button.dispatchEvent(new page.window.MouseEvent("pointerup", { bubbles: true }));
    await wait(500);
    assert.ok(notice(page), "the feed is still paused");
    assert.equal(page.chrome.__store.passes, undefined);
    assert.equal(button.querySelector(".decaf-notice-label").textContent, "Hold to open for 5 minutes");
  } finally {
    page.close();
  }
});

test("the second pass of the day takes longer to earn", async () => {
  const page = await launchPage({
    url: FEED_URL,
    html: YOUTUBE_HOME,
    storage: { passDay: new Date().toISOString().slice(0, 10), passCounts: { youtube: 1 } }
  });
  try {
    assert.equal(notice(page).querySelector(".decaf-notice-hint").textContent, "Hold for 7 seconds · 2nd time today");
  } finally {
    page.close();
  }
});

test("when the pass runs out the feed pauses again and says why", async () => {
  const page = await launchPage({
    url: FEED_URL,
    html: YOUTUBE_HOME,
    storage: { passes: { youtube: Date.now() + 60_000 } }
  });
  try {
    assert.equal(notice(page), null);
    await page.chrome.storage.local.set({ passes: { youtube: Date.now() - 1 } });
    await settle();
    assert.ok(notice(page), "the notice comes back");
  } finally {
    page.close();
  }
});

test("nothing plays behind a paused feed", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    const video = page.document.getElementById("feed-video");
    let stopped = false;
    video.pause = () => { stopped = true; };
    video.dispatchEvent(new page.window.Event("play", { bubbles: true }));
    assert.equal(stopped, true);
  } finally {
    page.close();
  }
});

test("in-app navigation moves between paused and open routes", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  // A single-page app changes the URL and redraws; Decaf notices the redraw.
  const navigate = async (path) => {
    page.window.history.pushState({}, "", path);
    page.document.body.append(page.document.createElement("section"));
    await settle();
  };
  try {
    assert.ok(notice(page));
    await navigate("/watch?v=aBcD1");
    assert.equal(notice(page), null);
    assert.equal(page.state().route, "media");

    await navigate("/feed/subscriptions");
    assert.equal(page.state().route, "content");
    assert.equal(notice(page), null);

    await navigate("/");
    assert.ok(notice(page), "returning to the feed pauses it again");
  } finally {
    page.close();
  }
});

test("back and forward navigation is followed too", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    page.window.history.pushState({}, "", "/watch?v=aBcD1");
    page.window.dispatchEvent(new page.window.Event("popstate"));
    await settle();
    assert.equal(notice(page), null);

    page.window.history.pushState({}, "", "/");
    page.window.dispatchEvent(new page.window.Event("popstate"));
    await settle();
    assert.ok(notice(page));
  } finally {
    page.close();
  }
});

test("full color can be granted for one page at a time", async () => {
  const page = await launchPage({ url: WATCH_URL });
  try {
    const pill = page.api.pill();
    assert.ok(pill, "a way to ask for color is offered");
    assert.equal(pill.textContent, "Show in color");
    assert.equal(rootClasses(page).includes("decaf-color"), false);

    pill.dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
    await settle();
    assert.ok(rootClasses(page).includes("decaf-color"));
    assert.equal(page.api.pill().isConnected, false, "the offer goes away once taken");

    // Moving to the next video asks again.
    page.window.history.pushState({}, "", "/watch?v=other1");
    page.window.dispatchEvent(new page.window.Event("popstate"));
    await settle();
    assert.equal(rootClasses(page).includes("decaf-color"), false);
    assert.equal(page.api.pill().isConnected, true);
  } finally {
    page.close();
  }
});

test("color is not offered on a feed or an ordinary page", async () => {
  const feed = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    assert.equal(feed.api.pill()?.isConnected, undefined);
  } finally {
    feed.close();
  }
  const content = await launchPage({ url: "https://www.youtube.com/feed/subscriptions" });
  try {
    assert.equal(content.api.pill()?.isConnected, undefined);
  } finally {
    content.close();
  }
});

test("reward counts, badges and the tab title go quiet", async () => {
  const page = await launchPage({ url: WATCH_URL, html: CARD_PAGE });
  try {
    page.document.title = "(3) Test page";
    page.api.runScan();
    const $ = (id) => page.document.getElementById(id);
    assert.equal($("like-count").textContent, "—");
    assert.equal($("views").textContent, "— views");
    assert.equal($("price").textContent, "1,299", "an ordinary number is not a reward count");
    assert.equal($("composer").textContent, "2,000 likes", "text being written is untouched");
    assert.equal(
      page.document.querySelector("article button").getAttribute("aria-label"),
      "Like this post along with — other people"
    );
    assert.ok($("unread").classList.contains("decaf-badge"));
    assert.ok($("nav-badge").classList.contains("decaf-badge"));
    assert.equal(page.document.title, "Test page");
  } finally {
    page.close();
  }
});

test("a badge kept in a shadow root is still found", async () => {
  // Reddit's notification count lives inside <dynamic-badge>'s shadow root, where
  // neither a page stylesheet nor an ordinary query can reach it. Marking the host
  // works, because a filter on the host applies to everything inside.
  const page = await launchPage({ url: WATCH_URL, html: CARD_PAGE });
  try {
    const host = page.document.createElement("dynamic-badge");
    page.document.querySelector("nav").append(host);
    host.attachShadow({ mode: "open" }).innerHTML = "<span>2</span>";
    page.api.runScan();
    assert.ok(host.classList.contains("decaf-badge"), "the host carries the mark");
  } finally {
    page.close();
  }
});

test("a badge a site only paints is found, and the mark lands on the paint", async () => {
  // Instagram's sidebar as it really ships: no nav landmark anywhere, hashed
  // class names that say nothing, and the count in a span inside the div that
  // carries the colour. A filter never reaches an ancestor, so marking the
  // number would drain the number and leave the pill lit.
  const html = `<!doctype html><html><head><title>ig</title></head><body>
    <div class="x1cy8zhl x9f619 x78zum5">
      <a href="/direct/inbox/" role="link"><span class="x1lliihq xsdox4t">
        <div id="pill" class="html-div xdj266r x14z9mp" style="background-color: rgb(255, 48, 64)"><span id="count">1</span></div>
      </span></a>
    </div>
  </body></html>`;
  const page = await launchPage({ url: "https://www.instagram.com/someone/", html });
  try {
    page.api.runScan();
    assert.ok(
      page.document.getElementById("pill").classList.contains("decaf-badge"),
      "the element carrying the colour is the one marked"
    );
    assert.equal(
      page.document.getElementById("count").classList.contains("decaf-badge"),
      false,
      "and not the number inside it, which a filter could not reach the pill from"
    );
  } finally {
    page.close();
  }
});

test("a badge is recognized whatever colour a site paints it", async () => {
  // X paints an unread dot the same blue as its subscribe button. One is a
  // nudge, the other is something you can press.
  const html = `<!doctype html><html><head><title>x</title></head><body>
    <header role="banner"><nav role="navigation">
      <a href="/notifications" role="link"><div id="dot" style="background-color: rgb(29, 155, 240)"></div></a>
    </nav></header>
    <a href="/i/premium_sign_up" role="link" id="cta" style="background-color: rgb(29, 155, 240)"><span>Subscribe</span></a>
  </body></html>`;
  const page = await launchPage({ url: "https://x.com/notifications", html });
  try {
    page.api.runScan();
    assert.ok(page.document.getElementById("dot").classList.contains("decaf-badge"), "a blue dot is still a badge");
    assert.equal(
      page.document.getElementById("cta").classList.contains("decaf-badge"),
      false,
      "a button you can press is not a badge, whatever colour it is"
    );
  } finally {
    page.close();
  }
});

test("a reward count in a control is masked, never treated as a badge", async () => {
  // The painted rule looks outside navigation landmarks, so a like count sitting
  // in a button must not be swept up: it is masked to a dash, and it stays put
  // rather than being hidden away with the notification badges.
  const html = `<!doctype html><html><head><title>ig</title></head><body>
    <main><article>
      <div><svg aria-label="Like"></svg><span role="button"><span id="likes">1234</span></span></div>
    </article></main>
  </body></html>`;
  const page = await launchPage({ url: "https://www.instagram.com/natgeo/p/Abc123/", html });
  try {
    page.api.runScan();
    assert.equal(page.document.getElementById("likes").textContent, "—");
    assert.equal(page.document.getElementById("likes").classList.contains("decaf-badge"), false);
  } finally {
    page.close();
  }
});

test("a number in an element that exists only to show counts is masked", async () => {
  const html = `<!doctype html><html><head><title>reddit</title></head><body>
    <aside id="rail"><a href="/r/x/comments/1/t/"><faceplate-number id="score">4211</faceplate-number></a></aside>
    <div id="feed"></div>
  </body></html>`;
  const page = await launchPage({ url: "https://www.reddit.com/r/webdev/comments/a/b/", html });
  try {
    page.api.runScan();
    assert.equal(page.document.getElementById("score").textContent, "—");
  } finally {
    page.close();
  }
});

test("a count beside an icon-only button is masked", async () => {
  // Instagram labels the icon, not the number: <svg aria-label="Like"> then 17K.
  const html = `<!doctype html><html><head><title>ig</title></head><body>
    <main><section>
      <div><svg aria-label="Like"></svg><span role="button"><span id="likes">17K</span></span></div>
      <span id="price">1,299</span>
    </section></main>
  </body></html>`;
  const page = await launchPage({ url: "https://www.instagram.com/natgeo/p/Abc123/", html });
  try {
    assert.equal(page.state().route, "media", "a permalink may carry the account name");
    page.api.runScan();
    assert.equal(page.document.getElementById("likes").textContent, "—");
    assert.equal(page.document.getElementById("price").textContent, "1,299");
  } finally {
    page.close();
  }
});

test("a count is masked when the word for it sits in the next element", async () => {
  // X writes "1.8M" and "Views" as two elements inside the same link.
  const html = `<!doctype html><html><head><title>x</title></head><body>
    <main><article>
      <a href="/X/status/1/analytics" role="link">
        <div><span><span id="views">1.8M</span></span></div><span>Views</span>
      </a>
      <span id="price">1,299</span>
    </article></main>
  </body></html>`;
  const page = await launchPage({ url: "https://x.com/X/status/1", html });
  try {
    page.api.runScan();
    assert.equal(page.document.getElementById("views").textContent, "—");
    assert.equal(page.document.getElementById("price").textContent, "1,299");
  } finally {
    page.close();
  }
});

test("a count is masked when the word for it sits in front of it", async () => {
  // Facebook puts "All reactions:" in one element and the number in another.
  const html = `<!doctype html><html><head><title>facebook</title></head><body>
    <div role="main"><div>
      <span>All reactions:</span>
      <div role="button"><span><span id="reactions">265</span></span></div>
      <span id="price">1,299</span>
    </div></div>
  </body></html>`;
  const page = await launchPage({ url: "https://www.facebook.com/photo/?fbid=1", html });
  try {
    page.api.runScan();
    assert.equal(page.document.getElementById("reactions").textContent, "—");
    assert.equal(page.document.getElementById("price").textContent, "1,299", "the count next door is not a label");
  } finally {
    page.close();
  }
});

test("badges are marked once, whether they are muted or hidden", async () => {
  const muted = await launchPage({ url: WATCH_URL, html: CARD_PAGE });
  try {
    muted.api.runScan();
    assert.ok(muted.document.getElementById("unread").classList.contains("decaf-badge"));
    assert.equal(rootClasses(muted).includes("decaf-hide-badges"), false, "muted by default");
  } finally {
    muted.close();
  }

  const hidden = await launchPage({ url: WATCH_URL, html: CARD_PAGE, storage: { hideBadges: true } });
  try {
    hidden.api.runScan();
    assert.ok(hidden.document.getElementById("unread").classList.contains("decaf-badge"));
    assert.ok(rootClasses(hidden).includes("decaf-hide-badges"));
  } finally {
    hidden.close();
  }
});

test("friction switches show up as root classes", async () => {
  const page = await launchPage({
    url: WATCH_URL,
    storage: { upsideDown: true, hideComments: false }
  });
  try {
    assert.ok(rootClasses(page).includes("decaf-upside-down"));
    assert.equal(rootClasses(page).includes("decaf-hide-comments"), false);
  } finally {
    page.close();
  }
});

test("Decaf never masks its own words", async () => {
  const page = await launchPage({
    url: FEED_URL,
    html: YOUTUBE_HOME,
    storage: { passDay: new Date().toISOString().slice(0, 10), passCounts: { youtube: 2 } }
  });
  try {
    page.api.runScan();
    assert.equal(notice(page).querySelector(".decaf-notice-hint").textContent, "Hold for 11 seconds · 3rd time today");
    assert.equal(notice(page).querySelector(".decaf-notice-label").textContent, "Hold to open for 5 minutes");
  } finally {
    page.close();
  }
});

test("content added later is caught without a full rescan", async () => {
  const page = await launchPage({ url: WATCH_URL, html: CARD_PAGE });
  try {
    const card = page.document.createElement("div");
    card.innerHTML = `<span id="late">12.4K views</span>`;
    page.document.getElementById("feed").append(card);
    await until(() => page.document.getElementById("late").textContent === "— views");
  } finally {
    page.close();
  }
});

test("a feed container drawn after load is still paused", async () => {
  const html = `<!doctype html><html><head><title>YouTube</title></head><body><div id="page-manager"></div></body></html>`;
  const page = await launchPage({ url: FEED_URL, html });
  try {
    const browse = page.document.createElement("ytd-browse");
    browse.setAttribute("page-subtype", "home");
    browse.innerHTML = `<ytd-rich-grid-renderer id="grid"></ytd-rich-grid-renderer>`;
    page.document.getElementById("page-manager").append(browse);
    await until(() => notice(page)?.parentElement?.id === "grid");
  } finally {
    page.close();
  }
});

test("muted autoplay is stopped, deliberate playback is not", async () => {
  const page = await launchPage({ url: "https://www.instagram.com/someone/", html: CARD_PAGE });
  try {
    const make = (muted) => {
      const video = page.document.createElement("video");
      video.muted = muted;
      video.setAttribute("autoplay", "");
      const state = { stopped: false, video };
      video.pause = () => { state.stopped = true; };
      page.document.body.append(video);
      return state;
    };

    const silent = make(true);
    silent.video.dispatchEvent(new page.window.Event("play", { bubbles: true }));
    assert.equal(silent.stopped, true, "a muted feed video is stopped");
    assert.equal(silent.video.hasAttribute("autoplay"), false);

    const audible = make(false);
    audible.video.dispatchEvent(new page.window.Event("play", { bubbles: true }));
    assert.equal(audible.stopped, false, "audible playback is intentional");

    const afterClick = make(true);
    page.document.dispatchEvent(new page.window.MouseEvent("pointerdown", { bubbles: true }));
    afterClick.video.dispatchEvent(new page.window.Event("play", { bubbles: true }));
    assert.equal(afterClick.stopped, false, "playback right after a click is intentional");
  } finally {
    page.close();
  }
});

test("the player on a media route is left to play", async () => {
  const page = await launchPage({ url: WATCH_URL });
  try {
    const video = page.document.createElement("video");
    video.muted = true;
    let stopped = false;
    video.pause = () => { stopped = true; };
    page.document.body.append(video);
    video.dispatchEvent(new page.window.Event("play", { bubbles: true }));
    assert.equal(stopped, false);
  } finally {
    page.close();
  }
});

test("switching Decaf off puts the page back exactly as it was", async () => {
  const page = await launchPage({ url: WATCH_URL, html: CARD_PAGE });
  try {
    page.document.title = "(9) Test page";
    page.api.runScan();
    assert.equal(page.document.getElementById("views").textContent, "— views");

    await page.chrome.storage.local.set({ enabled: false });
    await settle();

    assert.deepEqual(rootClasses(page), []);
    assert.equal(page.document.getElementById("views").textContent, "45,000 views");
    assert.equal(page.document.getElementById("like-count").textContent, "1.2K");
    assert.equal(
      page.document.querySelector("article button").getAttribute("aria-label"),
      "Like this post along with 1,204 other people"
    );
    assert.equal(page.document.getElementById("unread").classList.contains("decaf-badge"), false);
    assert.equal(page.document.title, "(9) Test page");
    assert.equal(page.api.pill().isConnected, false);
  } finally {
    page.close();
  }
});

test("leaving the page removes every trace of Decaf", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    page.api.runScan();
    page.window.dispatchEvent(new page.window.Event("pagehide"));
    await settle();
    assert.deepEqual(rootClasses(page), []);
    assert.equal(notice(page), null);
    assert.equal(page.document.querySelector(".decaf-chip"), null);
    assert.equal(page.document.querySelector(".decaf-pill"), null);
    assert.equal(page.document.getElementById("views").textContent, "45,000 views");
  } finally {
    page.close();
  }
});

test("host pages that wipe our classes are repaired", async () => {
  const page = await launchPage({ url: WATCH_URL });
  try {
    page.document.documentElement.className = "site-theme-dark";
    await until(() => rootClasses(page).includes("decaf-on"));
    assert.ok(rootClasses(page).includes("decaf-site-youtube"));
    assert.ok(rootClasses(page).includes("site-theme-dark"), "the site keeps its own classes");
  } finally {
    page.close();
  }
});
