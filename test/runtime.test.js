"use strict";

/**
 * The page runtime's newer contracts: surviving the back/forward cache, refusing
 * events the page made, masking counts outside English, and the surfaces that
 * exist while a pass is running.
 *
 * These live apart from content.test.js only because that file is already long;
 * they exercise the same content.js against the same jsdom harness.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const { launchPage, settle, wait, until, asUserEvent, click } = require("../tools/harness.js");

const FEED_URL = "https://www.youtube.com/";

const YOUTUBE_HOME = `<!doctype html>
<html><head><title>YouTube</title></head><body>
  <header id="masthead"><input id="site-search" type="search"></header>
  <div id="page-manager">
    <ytd-browse page-subtype="home">
      <ytd-rich-grid-renderer id="grid">
        <article><div id="views">45,000 views</div></article>
      </ytd-rich-grid-renderer>
    </ytd-browse>
  </div>
</body></html>`;

const rootClasses = (page) => Array.from(page.document.documentElement.classList);

const transition = (page, type, persisted) => {
  const Ctor = page.window.PageTransitionEvent || page.window.Event;
  const event = Ctor === page.window.Event ? new Ctor(type) : new Ctor(type, { persisted });
  if (Ctor === page.window.Event) event.persisted = persisted;
  return event;
};

/*
 * `pagehide` fires with `persisted: true` when a document goes into Chrome's
 * back/forward cache. The isolated world is frozen, not destroyed, and Chrome
 * does not re-inject content scripts when the page comes back — so tearing down
 * unconditionally meant that opening a feed, clicking away and pressing Back
 * restored the page with every Decaf class stripped and the whole feed showing,
 * in colour, for good. Back-navigation is one of the most common ways anyone
 * arrives at a feed, so this was the product failing silently.
 */
test("a page restored from the back/forward cache gets Decaf back", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    await until(() => page.api.notice());
    assert.ok(rootClasses(page).includes("decaf-hide-feed"));

    page.window.dispatchEvent(transition(page, "pagehide", true));
    await settle();
    assert.equal(page.api.state().active, true, "a freeze, not a teardown");

    page.window.dispatchEvent(transition(page, "pageshow", true));
    await settle(6);
    assert.ok(rootClasses(page).includes("decaf-on"), "Decaf is armed again");
    assert.ok(rootClasses(page).includes("decaf-hide-feed"));
    await until(() => page.api.notice());
  } finally {
    page.close();
  }
});

test("a real pagehide still tears everything down", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    await until(() => page.api.notice());
    page.window.dispatchEvent(transition(page, "pagehide", false));
    await settle();
    assert.equal(rootClasses(page).length, 0, "nothing of Decaf's is left behind");
  } finally {
    page.close();
  }
});

/*
 * Decaf's elements live in the page rather than a shadow root, so that the
 * stylesheet Chrome injects for the extension is the only one that can reach
 * them. The cost is that a site's own scripts can reach them too — and a
 * synthetic pointerdown followed by three seconds of waiting was enough for a
 * page to hand itself a pass, which defeats the mechanism the product rests on.
 */
test("a pass cannot be taken by the page itself", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME, trustEvents: false });
  try {
    const parts = await until(() => page.api.notice());
    parts.button.dispatchEvent(new page.window.MouseEvent("pointerdown", { bubbles: true }));
    await wait(3400);
    assert.notEqual(parts.button.dataset.holding, "true", "the hold never started");
    assert.equal(page.api.state().hidingFeed, true, "the feed is still paused");
    assert.equal(page.chrome.__store.passes, undefined);
  } finally {
    page.close();
  }
});

test("a page cannot name itself Decaf to escape masking", async () => {
  const page = await launchPage({
    url: FEED_URL,
    html: `<body><div class="decaf-notice" data-decaf-own>
      <button aria-label="Like"><span id="count">1,204</span></button>
    </div></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("count").textContent, "—", "the disguise buys nothing");
  } finally {
    page.close();
  }
});

/*
 * The README states the rule correctly — "a bare number that belongs to no
 * control is left alone, which is what keeps prices, dates and anything you are
 * typing untouched" — but the code accepted a reward word found anywhere in any
 * attribute of any of four ancestors. LinkedIn's markup is `feed-shared-update-v2`
 * wrapping `feed-shared-text`, so a post whose own line was a year came out as a
 * dash: Decaf corrupting the content rather than the count.
 */
test("a bare number that belongs to no control survives", async () => {
  const page = await launchPage({
    url: "https://www.linkedin.com/feed/update/urn:li:activity:1/",
    html: `<body><main>
      <div class="feed-shared-update-v2">
        <div class="feed-shared-inline-show-more-text">
          <span class="feed-shared-text" id="body">Opened Berlin in <span id="year">2019</span>,
            now <span id="figure">1,299</span> people.</span>
        </div>
        <button class="react-button" aria-label="Like"><span id="count">842</span></button>
      </div>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("year").textContent, "2019", "a year in a post is not a count");
    assert.equal(page.document.getElementById("figure").textContent, "1,299", "nor is a figure in one");
    assert.equal(page.document.getElementById("count").textContent, "—", "the count on the button still goes");
  } finally {
    page.close();
  }
});

test("counts are masked in the languages these sites ship", async () => {
  const cases = [
    ["1.234.567 Aufrufe", "— Aufrufe"],
    ["265 Kommentare", "— Kommentare"],
    ["1 234 vues", "— vues"],
    ["1,234 polubienia", "— polubienia"],
    ["1,204 likes", "— likes"]
  ];
  const html = `<body><main>${cases
    .map(([text], index) => `<div id="c${index}"><span>${text}</span></div>`)
    .join("")}</main></body>`;
  const page = await launchPage({ url: "https://www.youtube.com/watch?v=abc", html });
  try {
    page.api.runScan();
    await settle();
    cases.forEach(([, expected], index) => {
      assert.equal(page.document.querySelector(`#c${index} span`).textContent, expected);
    });
  } finally {
    page.close();
  }
});

/*
 * `view` matched `preview`, `share` matched `shared`. A carousel tells a screen
 * reader user where they are with exactly this shape, and masking it left them
 * with "Preview image — of —": Decaf making the page less usable for assistive
 * technology than the untouched site was.
 */
test("a position label is not mistaken for a reward count", async () => {
  const page = await launchPage({
    url: "https://www.instagram.com/p/abc/",
    html: `<body><main>
      <button id="carousel" aria-label="Preview image 3 of 5"></button>
      <button id="likes" aria-label="1,204 likes"></button>
      <button id="interview" aria-label="Interview, part 2 of 3"></button>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("carousel").getAttribute("aria-label"), "Preview image 3 of 5");
    assert.equal(page.document.getElementById("interview").getAttribute("aria-label"), "Interview, part 2 of 3");
    assert.equal(page.document.getElementById("likes").getAttribute("aria-label"), "— likes");
  } finally {
    page.close();
  }
});

test("a control left holding nothing but a dash still has a name", async () => {
  const page = await launchPage({
    url: "https://www.instagram.com/p/abc/",
    html: `<body><main><button data-testid="like-count">1,204</button></main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    const button = page.document.querySelector("button");
    assert.equal(button.textContent, "—");
    assert.match(button.getAttribute("aria-label"), /like/i, "an em dash is not an accessible name");
  } finally {
    page.close();
  }
});

test("a running pass keeps a counter and a way out on the page", async () => {
  const page = await launchPage({
    url: FEED_URL,
    html: YOUTUBE_HOME,
    storage: { passes: { youtube: Date.now() + 120000 } }
  });
  try {
    const counter = await until(() => page.api.counter());
    assert.match(counter.textContent, /Feed open . [12]:\d\d/);
    assert.equal(page.api.state().hidingFeed, false);

    click(counter.querySelector(".decaf-counter-end"));
    await settle(8);
    assert.equal(page.api.state().hidingFeed, true, "handed back early");
    assert.equal(page.api.counter(), null);
  } finally {
    page.close();
  }
});

test("letting go early says so instead of saying nothing", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    const parts = await until(() => page.api.notice());
    parts.button.dispatchEvent(asUserEvent(new page.window.MouseEvent("pointerdown", { bubbles: true })));
    await wait(120);
    parts.button.dispatchEvent(asUserEvent(new page.window.MouseEvent("pointerup", { bubbles: true })));
    await settle();
    assert.match(parts.status.textContent, /Not quite/, "a click is a 100ms hold, and used to be silent");
  } finally {
    page.close();
  }
});

test("the card offers a way to the settings page", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    const parts = await until(() => page.api.notice());
    assert.ok(parts.escape, "the only Decaf surface most people see cannot be a closed room");
    click(parts.escape);
    await settle();
    assert.equal(page.chrome.__calls.messages.at(-1)?.type, "open-options");
  } finally {
    page.close();
  }
});

test("the card says which language it is written in", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    const parts = await until(() => page.api.notice());
    assert.equal(parts.container.lang, "en", "a French voice reading English is close to unintelligible");
    assert.equal(parts.container.dir, "ltr");
  } finally {
    page.close();
  }
});

test("the popup can ask this tab whether the feed was really found", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    await until(() => page.api.notice());
    let reply = null;
    page.chrome.__calls.fire("message", { type: "decaf-health" }, {}, (value) => { reply = value; });
    assert.equal(reply.anchor, "selector");
    assert.equal(reply.placed, true);
  } finally {
    page.close();
  }
});

test("a site the person added gets the general treatment", async () => {
  const page = await launchPage({
    url: "https://news.ycombinator.com/",
    html: `<body><main><button aria-label="Like"><span id="count">1,204</span></button></main></body>`,
    storage: { custom: { "news.ycombinator.com": { label: "HN", enabled: true } } }
  });
  try {
    await settle(6);
    const state = page.api.state();
    assert.equal(state.site, "custom:news.ycombinator.com");
    assert.equal(state.route, "feed", "the front page is the feed; anything navigated to is not");
    assert.ok(rootClasses(page).includes("decaf-site-custom"), "one class for all of them");
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("count").textContent, "—");
  } finally {
    page.close();
  }
});

/*
 * The Sets that used to hold every touched node held them strongly, and every
 * virtualized feed recycles post DOM as you scroll: a masked node the site
 * detached could never be collected, and a detached text node drags its whole
 * ancestor subtree along with it. What Decaf has touched is written in the
 * document now, so it goes when the document lets it go.
 */
test("what Decaf has touched is recorded in the document, not held in memory", async () => {
  const page = await launchPage({
    url: "https://www.youtube.com/watch?v=abc",
    html: `<body><main><div id="host"><button aria-label="Like"><span>1,204</span></button></div></main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.querySelectorAll(".decaf-masked").length > 0, true);

    // The site throws the post away, as a virtualized feed does constantly.
    page.document.getElementById("host").remove();
    await settle();

    // Nothing is left pointing at it, and restoring still works on what remains.
    page.api.apply();
    await settle();
    assert.equal(page.document.querySelectorAll(".decaf-masked").length, 0);
  } finally {
    page.close();
  }
});

/*
 * When the extension is reloaded, updated or removed, Chrome does not stop the
 * content scripts it has already injected — it only cuts their chrome.*
 * bindings. A copy that outlived its extension used to keep enforcing whatever
 * settings it had last read, forever: after an update it fought the freshly
 * injected copy, re-emptying the feed the new copy had just opened, so holding
 * the button appeared to do nothing.
 */
test("a copy whose extension has gone takes itself down", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    await until(() => page.api.notice());
    assert.ok(rootClasses(page).includes("decaf-on"));

    // What Chrome actually does to an orphan: chrome.runtime.id stops existing.
    page.chrome.runtime.id = undefined;
    await wait(1300);

    assert.equal(rootClasses(page).length, 0, "nothing of Decaf's is left on the page");
    assert.equal(page.api.notice(), null, "the card is gone");
  } finally {
    page.close();
  }
});

/*
 * The manifest injects content.js on navigation and the worker injects it into
 * already-open tabs on install and update; a tab that navigates in the moment
 * between the two gets both. A second copy in the same world would mean two
 * observers and two cards fighting over the page.
 */
test("running content.js twice in one world does nothing the second time", async () => {
  const page = await launchPage({ url: FEED_URL, html: YOUTUBE_HOME });
  try {
    await until(() => page.api.notice());
    const first = page.api;

    page.window.eval(require("node:fs").readFileSync("content.js", "utf8"));
    await settle(6);

    assert.equal(page.api, first, "the first copy is still the owner");
    assert.equal(page.document.querySelectorAll(".decaf-notice").length, 1, "one card, not two");
  } finally {
    page.close();
  }
});

/*
 * Facebook docks a Messenger window on every page, including the feed routes
 * where Decaf is emptying things — and Messenger's conversation pane is a
 * `role="main"` of its own. The page-level selector reached straight into it and
 * hid every message, leaving the container behind holding Messenger's own
 * gradient: three chat windows showing a block of colour where the conversation
 * had been. "A conversation is not a feed, and Decaf should never come between
 * you and a message" was a route rule and nothing else; it is a structural
 * guarantee now, so no future mistake in the route table can reach past it.
 */
test("a docked conversation is never emptied, even on a paused feed", async () => {
  const page = await launchPage({
    url: "https://www.facebook.com/",
    html: `<!doctype html><html><body>
      <div id="shell">
        <div role="main" id="page-main">
          <div role="feed" id="feed">
            <div role="article" class="post">A post</div>
            <div role="article" class="post">Another post</div>
            <div role="article" class="post">A third post</div>
          </div>
        </div>
      </div>
      <div role="dialog" aria-label="Chat with Denise" id="dock">
        <div id="dock-head">Denise</div>
        <div role="main" id="dock-main">
          <div role="article" class="msg" id="m1">Is it still available?</div>
          <div role="article" class="msg" id="m2">Yes, it is.</div>
        </div>
        <div id="dock-composer"><input aria-label="Aa"></div>
      </div>
    </body></html>`
  });
  try {
    await until(() => page.api.notice());
    assert.equal(page.api.state().hidingFeed, true, "the feed itself is still paused");

    // Only the content script's half is checked here. The emptying is done by
    // content.css, which this harness does not load and whose `:has()` jsdom
    // does not implement — a version of this test that asserted the messages
    // were still displayed passed exactly the same with the fix reverted. The
    // stylesheet's half is "a docked conversation survives a paused feed" in
    // test/browser.test.js, which fails without it.
    assert.equal(
      page.api.anchors().some((element) => element.closest("#dock")),
      false,
      "the conversation is never a candidate to be emptied"
    );
    const notice = page.document.querySelector(".decaf-notice");
    assert.equal(notice.closest("#dock"), null, "and the card did not land in it");
  } finally {
    page.close();
  }
});

/*
 * The same guarantee from the other direction: `enforceEmptyFeed` looks for feed
 * items still on screen and empties whatever holds them. Messages carry
 * `[role='article']` too, so on a page where the real feed was already dealt
 * with, the only "leftovers" it could find were the messages in the dock — and
 * it would have emptied the conversation to satisfy itself.
 */
test("messages are not mistaken for a feed the pause missed", async () => {
  const page = await launchPage({
    url: "https://www.facebook.com/",
    html: `<!doctype html><html><body>
      <div role="main" id="page-main"><div role="feed" id="feed"></div></div>
      <div role="dialog" aria-label="Chat with Denise" id="dock">
        <div role="article" class="msg" id="m1">One</div>
        <div role="article" class="msg" id="m2">Two</div>
        <div role="article" class="msg" id="m3">Three</div>
        <div role="article" class="msg" id="m4">Four</div>
      </div>
    </body></html>`
  });
  try {
    await settle(8);
    for (const id of ["m1", "m2", "m3", "m4"]) {
      const element = page.document.getElementById(id);
      assert.equal(page.window.getComputedStyle(element).display !== "none", true, id);
    }
    assert.equal(
      page.document.querySelectorAll("#dock .decaf-feed-container, #dock.decaf-feed-container").length,
      0,
      "no part of the conversation was marked as a feed"
    );
  } finally {
    page.close();
  }
});

/*
 * TikTok hangs each count off its icon button as a *sibling*, not a child:
 *   <button data-e2e="like-icon">…</button><strong data-e2e="like-count">7064</strong>
 * so there is no control around the number. Requiring one — which is what keeps
 * a year inside a LinkedIn post from becoming a dash — left every count on a
 * TikTok video showing. A live audit found fourteen of them on one page.
 *
 * Two things now cover it: the site's own `data-e2e` hook, which is the same in
 * every language TikTok ships, and the general rule that a site naming something
 * a count is evidence enough on its own.
 */
test("a count the site names is masked even with no control around it", async () => {
  const page = await launchPage({
    url: "https://www.tiktok.com/@someone/video/7123",
    html: `<body><main>
      <div class="action-bar">
        <button data-e2e="like-icon"></button><strong data-e2e="like-count" id="likes">7064</strong>
        <button data-e2e="comment-icon"></button><strong data-e2e="comment-count" id="comments">3924</strong>
        <button data-e2e="undefined-icon"></button><strong data-e2e="undefined-count" id="shares">21.9K</strong>
      </div>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    for (const id of ["likes", "comments", "shares"]) {
      assert.equal(page.document.getElementById(id).textContent, "—", id);
    }
  } finally {
    page.close();
  }
});

/*
 * And the LinkedIn case the control requirement exists for still holds.
 *
 * The fixture here used to be `<span class="feed-shared-text">2019</span>` — a
 * bare year as the entire content of the post-body element. That shape is now
 * masked, and deliberately: it is indistinguishable from TikTok's `DivLikeInfo`,
 * which is a reward word on an element holding nothing but a number, and TikTok
 * ships fifteen of those on every video page against a LinkedIn post whose whole
 * body is a single bare number. The realistic shape — prose with numbers in it —
 * is what the rule protects, and it is what this asserts.
 */
test("naming a count does not re-open the door to masking post content", async () => {
  const page = await launchPage({
    url: "https://www.linkedin.com/feed/update/urn:li:activity:1/",
    html: `<body><main>
      <div class="feed-shared-update-v2">
        <div class="feed-shared-text" id="body">Hired <span id="hires">12</span> people in 2019.</div>
        <span class="social-details-social-counts__reactions-count" id="reactions">842</span>
      </div>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("hires").textContent, "12", "a figure in prose is not a count");
    assert.equal(page.document.getElementById("reactions").textContent, "—", "one the site names is");
  } finally {
    page.close();
  }
});

/*
 * The two cases that pull in opposite directions, side by side.
 *
 * TikTok's related-video counts live in `class="...DivLikeInfo..."` with no
 * control anywhere near them — read off the live site, not guessed at. LinkedIn's
 * post body is `class="feed-shared-text"`, which contains "share" for reasons
 * that have nothing to do with a share count. The element's own class cannot
 * separate them; what does is that one holds a number and nothing else, and the
 * other holds prose that happens to contain a year.
 */
test("a dedicated count element is masked, a post body is not", async () => {
  const page = await launchPage({
    url: "https://www.tiktok.com/@someone/video/7123",
    html: `<body><main>
      <div class="css-10epprg-DivContentContainer">
        <div class="css-9ulrvj-DivOtherInfo">
          <div class="css-10epprg-DivLikeInfo" id="tiktok-likes">3927</div>
        </div>
      </div>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("tiktok-likes").textContent, "—", "TikTok's like count goes");
  } finally {
    page.close();
  }
});

test("a post body naming itself shared keeps its numbers", async () => {
  const page = await launchPage({
    url: "https://www.linkedin.com/feed/update/urn:li:activity:1/",
    html: `<body><main>
      <div class="feed-shared-update-v2">
        <div class="feed-shared-text" id="body">We opened the Berlin office in <span id="year">2019</span>
          and have grown to <span id="staff">1,299</span> people since.</div>
      </div>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("year").textContent, "2019", "a year in prose survives");
    assert.equal(page.document.getElementById("staff").textContent, "1,299", "so does a figure in prose");
  } finally {
    page.close();
  }
});

/*
 * Bounding REWARD_CONTEXT stopped `view` matching `preview`, and had to. But
 * `[^a-z]` under an `i` flag excludes capitals too, so it also blinded Decaf to
 * every camelCase name — and TikTok labels each count on a video page with a
 * styled-component class, `css-10epprg--DivLikeInfo`. Fourteen counts a page
 * survived, and the live audit is the only thing that saw it: every unit test
 * used hyphenated or lowercase fixtures.
 */
test("a count named in camelCase is found, and preview still is not", async () => {
  const page = await launchPage({
    url: "https://www.tiktok.com/@someone/video/7123",
    html: `<body><main>
      <div class="css-10epprg-7937d88b--DivLikeInfo e11ypioz14" id="tiktok">3927</div>
      <div class="DivViewCount" id="views">130.4K</div>
      <div class="previewIndex" id="preview">3</div>
      <div class="overviewTotal" id="overview">7</div>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle();
    assert.equal(page.document.getElementById("tiktok").textContent, "—", "DivLikeInfo is a like count");
    assert.equal(page.document.getElementById("views").textContent, "—", "so is DivViewCount");
    assert.equal(page.document.getElementById("preview").textContent, "3", "previewIndex is not a view count");
    assert.equal(page.document.getElementById("overview").textContent, "7", "nor is overviewTotal");
  } finally {
    page.close();
  }
});

/*
 * A Queens cell meets every test Decaf has for a notification badge, and does so
 * honestly: 45x45, one crown inside it, no text, and painted a strong colour —
 * because on Queens the colour *is* the puzzle. The board is already exempt from
 * the grayscale, but the badge mark is a separate treatment, and "Hide
 * notification counts" turns it into `display: none`: crowns and regions both
 * gone. Read off the live board, including the cell colour.
 */
test("nothing on a game board is treated as a notification badge", async () => {
  const cell = (index) =>
    `<div role="button" class="cell" style="width:45px;height:45px;background:rgb(230,243,136)">
       <svg aria-label="Queen" width="24" height="24"><path d="M2 20h20v2H2z"></path></svg>
     </div>`.replace("cell", `cell c${index}`);
  const page = await launchPage({
    url: "https://www.linkedin.com/games/queens/",
    html: `<body><main>
      <section id="queens-game-board">${[0, 1, 2, 3].map(cell).join("")}</section>
      <nav><a href="/notifications"><span class="badge" style="background:rgb(220,40,40)">3</span></a></nav>
    </main></body>`
  });
  try {
    page.api.runScan();
    await settle(4);
    // The board is not marked here: `syncGameBoard` measures cells, and this
    // harness has no layout. That is the point — the guard has to hold on the
    // named board before anything has been measured, because the badge pass runs
    // first. A board found by shape is caught afterwards by `clearBadgesOn`,
    // which needs a real browser to exercise.
    assert.equal(
      page.document.querySelectorAll("#queens-game-board .decaf-badge").length,
      0,
      "no part of the board is marked as a badge"
    );
    // The queens themselves are still there, whatever the badge setting says.
    assert.equal(page.document.querySelectorAll("#queens-game-board svg[aria-label='Queen']").length, 4);
    // And a real badge outside the board is still found, so this is an exemption
    // rather than the badge finder having been broken.
    assert.equal(page.document.querySelectorAll("nav .decaf-badge").length, 1, "a real badge still goes");
  } finally {
    page.close();
  }
});

/*
 * LinkedIn serves the playable board in an iframe whose markup is not the launch
 * page's, so neither the named selector nor the shape search finds a board in
 * there. Nothing was exempt, and the crowns were drained with everything else.
 *
 * That reads as "the queens disappeared" rather than "the queens went grey"
 * because a gold crown and a pastel cell differ by roughly 1.2:1 in luminance —
 * they are told apart by hue and nothing else, and grayscale removes exactly
 * that. The board kept every one of its colours while the pieces on it vanished.
 */
test("a frame that is nothing but the game keeps all of its colour", async () => {
  const page = await launchPage({
    url: "https://www.linkedin.com/games/view/queens/desktop/",
    html: `<body><div id="board">
      <div class="cell"><svg aria-label="Queen"><path d="M2 20h20v2H2z"></path></svg></div>
      <div class="cell"><svg aria-label="Queen"><path d="M2 20h20v2H2z"></path></svg></div>
    </div></body>`,
    topFrame: false
  });
  try {
    await settle(4);
    assert.equal(page.api.state().route, "game", "the frame's own URL is a game route");
    assert.equal(page.api.state().isTopFrame, false);
    assert.equal(
      page.document.body.classList.contains("decaf-game-board"),
      true,
      "the whole frame is the board, so nothing in it is drained"
    );
  } finally {
    page.close();
  }
});

/* The top-level games page still drains everything that is not the board. */
test("the launch page still drains everything but the board", async () => {
  const page = await launchPage({
    url: "https://www.linkedin.com/games/queens/",
    html: `<body><main>
      <section id="queens-game-board"><div class="cell"></div></section>
      <aside id="leaderboard"><img src="face.png" alt="A face"></aside>
    </main></body>`
  });
  try {
    await settle(4);
    assert.equal(page.document.body.classList.contains("decaf-game-board"), false,
      "the page is not wholesale exempt");
  } finally {
    page.close();
  }
});
