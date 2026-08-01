/**
 * A small but structurally honest stand-in for each supported site, with real
 * links between real routes.
 *
 * `tools/site-fixtures.js` already models the *shell* of each site — the header
 * and sidebars that must survive a paused feed. This file exists for a different
 * question: what happens when someone actually uses the site. So every page here
 * is reachable from another page by clicking an ordinary <a href>, and each site
 * serves a feed route, a media route and a plain content route, because those are
 * the three things Decaf treats differently.
 *
 * The markup carries the hooks Decaf reads for its always-on work as well —
 * reward counts, the three shapes a notification badge comes in, a title badge,
 * media to drain the colour out of — so a single page can answer both "is the
 * feed paused" and "are the numbers quiet".
 *
 * Served by fulfilling requests inside the browser rather than from a local
 * server: Decaf is keyed to real hostnames, every one of them is HSTS-preloaded,
 * and a plain-HTTP stand-in would be force-upgraded and never load.
 */
"use strict";

const D = require("../core.js");

/* ------------------------------------------------------------------ chrome -- */

const STYLE = `
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body { margin: 0; font: 15px/1.45 system-ui, sans-serif; background: #fff; color: #111 }
  a { color: #1a5fb4 }
  #nav, #header { display: flex; align-items: center; gap: 14px;
    padding: 10px 16px; border-bottom: 1px solid #ddd }
  #navbar { display: flex; gap: 14px; margin-left: auto }
  .navlink { display: inline-flex; align-items: center; gap: 6px; text-decoration: none }
  input[type=search] { padding: 6px 10px; border: 1px solid #ccc; border-radius: 999px }

  /* The three shapes a notification badge arrives in. */
  .badge-count { display: inline-block; min-width: 20px; height: 20px; padding: 0 6px;
    border-radius: 999px; background: rgb(255,48,64); color: #fff; font-size: 12px;
    line-height: 20px; text-align: center }
  #wrap-pill { display: inline-block; width: 22px; height: 22px; border-radius: 999px;
    background: rgb(29,155,240); color: #fff; font-size: 12px; line-height: 22px;
    text-align: center }
  #alert-dot { display: inline-block; width: 8px; height: 8px; border-radius: 999px;
    background: rgb(240,40,40) }

  .item { display: block; margin: 8px 0; padding: 18px 12px; background: #f1f1f1;
    border-radius: 8px; text-decoration: none; color: inherit }
  .rail { padding: 12px; background: #f7f7f7; border-radius: 8px }
  .thumb { display: block; width: 160px; height: 90px; background: #cfd8dc; border: 0 }
  video { display: block; width: 320px; height: 180px; background: #263238 }
  .side { width: 240px; padding: 12px; color: #555 }
`;

/** A 1x1 gif, so an <img> is a real replaced element with a real computed filter. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACwAAAAAAQABAAACAkQBADs=";

/**
 * The header every page shares: search that must keep working, and one of each
 * badge shape. `#named-badge` is a badge the site names, `#wrap-pill` paints the
 * colour on a wrapper around the number the way Instagram does, and `#alert-dot`
 * is a coloured dot with nothing at all to identify it.
 */
/**
 * All three badge links point at `/settings`, distinguished by a query string.
 *
 * That looks over-careful and is not. Twitch's own URL scheme makes any unknown
 * single segment a channel — `twitch.tv/inbox` is a channel called "inbox" — so a
 * header link to `/inbox` is a *media* route there and a content route on the
 * other eleven sites. `/settings` is in Twitch's own app-path list, so this is one
 * of the few shapes that means the same thing everywhere.
 */
const CHROME_LINKS = [
  { href: "/settings", label: "Inbox", badge: `<span id="named-badge" class="badge-count">7</span>` },
  { href: "/settings?view=alerts", label: "Alerts", badge: `<span id="wrap-pill"><span id="wrap-count">3</span></span>` },
  { href: "/settings?view=updates", label: "Updates", badge: `<span id="alert-dot"></span>` }
];

const HEADER = (label) => `
  <header id="nav" role="banner">
    <a class="navlink" id="home-link" href="/">${label}</a>
    <input id="site-search" type="search" placeholder="Search">
    <nav id="navbar">
      ${CHROME_LINKS.map(({ href, label: text, badge }, index) =>
    `<a class="navlink" id="chrome-${index}" href="${href}">${text}${badge}</a>`).join("\n      ")}
    </nav>
  </header>`;

/**
 * Numbers, in every shape Decaf has to tell apart. The first four are reward
 * counts and must go; the last three are information and must stay.
 */
const COUNTS = `
  <div id="views">45,000 views</div>
  <button id="like" aria-label="Like"><svg aria-label="Like" width="12" height="12"></svg><span id="like-count">1.2K</span></button>
  <span id="aria-likes" aria-label="1,234 likes">hearts</span>
  <div id="followers">18.3K followers</div>
  <p id="price">$42.50</p>
  <p id="prose">In 2019 the team shipped 3 releases.</p>
  <time id="ago" datetime="2026-07-31T10:00">5m</time>`;

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>${STYLE}</style></head><body>${body}</body></html>`;

/* ------------------------------------------------------------------- sites -- */

/**
 * Each site maps a pathname to a page. `routes` is only documentation for the
 * reader: what the route *should* be is always recomputed from `core.js`, so a
 * fixture can never quietly assert the wrong answer.
 */
const SITES = {
  youtube: {
    host: "www.youtube.com",
    feed: "/",
    media: "/watch?v=aBcD1",
    content: "/results?search_query=lofi",
    // A second feed route, to check a feed that is not the home page.
    shorts: "/shorts/abc",
    render(pathname, search) {
      if (pathname === "/watch") {
        return page("(4) Lofi mix - YouTube", `
          ${HEADER("YouTube")}
          <div id="page-manager">
            <article id="watch">
              <div id="movie_player"><video id="player" muted></video></div>
              <h1>Lofi beats</h1>
              ${COUNTS}
              <img id="poster" class="thumb" src="${PIXEL}" alt="Poster">
              <div id="comments"><div class="item">A comment</div><div class="item">Another comment</div></div>
            </article>
            <div id="related" class="rail">
              <a class="item" href="/watch?v=next1">Up next 1</a>
              <a class="item" href="/watch?v=next2">Up next 2</a>
            </div>
            <ytd-playlist-panel-renderer id="mix" playlist-type="RDMIX" class="rail">Mix</ytd-playlist-panel-renderer>
          </div>`);
      }
      if (pathname === "/results") {
        return page("lofi - YouTube", `
          ${HEADER("YouTube")}
          <div id="page-manager"><main id="results">
            <h1>Results for ${search.replace(/[^\w =?]/g, "")}</h1>
            <a class="item" id="r1" href="/watch?v=res1">A result<img class="thumb" src="${PIXEL}" alt=""></a>
            <a class="item" id="r2" href="/watch?v=res2">Another result</a>
            <a class="item" id="r3" href="/feed/subscriptions">Your subscriptions</a>
            ${COUNTS}
          </main></div>`);
      }
      if (pathname === "/feed/subscriptions") {
        return page("Subscriptions - YouTube", `
          ${HEADER("YouTube")}
          <div id="page-manager"><main id="subs">
            <h2>Subscriptions</h2>
            <a class="item" href="/watch?v=sub1">A subscription video</a>
            <a class="item" href="/">Back to home</a>
          </main></div>`);
      }
      if (pathname.startsWith("/shorts")) {
        return page("Shorts - YouTube", `
          ${HEADER("YouTube")}
          <ytd-shorts id="shorts" style="display:block">
            <article class="item">A short<video muted></video></article>
            <article class="item">Another short</article>
            <article class="item">A third short</article>
          </ytd-shorts>`);
      }
      // Home: the feed.
      return page("(4) YouTube", `
        ${HEADER("YouTube")}
        <div id="content" style="display:flex;gap:16px">
          <div id="guide" class="side">
            <a href="/">Home</a><br>
            <ytd-guide-entry-renderer><a href="/shorts/abc">Shorts</a></ytd-guide-entry-renderer><br>
            <ytd-guide-entry-renderer><a href="/feed/trending">Trending</a></ytd-guide-entry-renderer><br>
            <a id="to-subs" href="/feed/subscriptions">Subscriptions</a><br>
            <a id="to-results" href="/results?search_query=lofi">Search results</a>
          </div>
          <div id="page-manager" style="flex:1;min-width:0">
            <ytd-browse id="browse" page-subtype="home">
              <ytd-feed-filter-chip-bar-renderer id="chips">All · Music · Gaming</ytd-feed-filter-chip-bar-renderer>
              <ytd-rich-grid-renderer id="grid" style="display:block">
                <ytd-rich-item-renderer class="item"><a href="/watch?v=feed1">Feed video 1</a><img class="thumb" src="${PIXEL}" alt=""></ytd-rich-item-renderer>
                <ytd-rich-item-renderer class="item"><a href="/watch?v=feed2">Feed video 2</a></ytd-rich-item-renderer>
                <ytd-rich-item-renderer class="item"><a href="/watch?v=feed3">Feed video 3</a></ytd-rich-item-renderer>
              </ytd-rich-grid-renderer>
            </ytd-browse>
          </div>
        </div>`);
    }
  },

  reddit: {
    host: "www.reddit.com",
    feed: "/",
    media: "/r/fixit/comments/abc123/leaking_dishwasher/",
    content: "/r/fixit/",
    render(pathname) {
      if (/\/comments\//.test(pathname)) {
        return page("Why is my dishwasher leaking? : r/fixit", `
          ${HEADER("reddit")}
          <main id="main-content">
            <shreddit-post id="post" style="display:block">
              <h1 id="post-title">Why is my dishwasher leaking?</h1>
              <img id="post-image" class="thumb" src="${PIXEL}" alt="">
              ${COUNTS}
            </shreddit-post>
            <shreddit-comment-tree id="tree" style="display:block">
              <shreddit-comment id="top-1" depth="0" style="display:block">
                <p>Check the drain filter first.</p>
                <shreddit-comment id="reply-1" depth="1" style="display:block">
                  <p>That was it, thanks.</p>
                  <shreddit-comment id="deep-1" depth="2" style="display:block">
                    <p>Well actually, on my model...</p>
                  </shreddit-comment>
                </shreddit-comment>
                <faceplate-partial id="more-1" style="display:block"
                  src="/svc/shreddit/more-comments/t3_abc123">more replies</faceplate-partial>
              </shreddit-comment>
              <shreddit-comment id="top-2" depth="0" style="display:block"><p>Could be the door seal.</p></shreddit-comment>
              <shreddit-comment id="deep-2" depth="3" style="display:block"><p>Deep argument.</p></shreddit-comment>
            </shreddit-comment-tree>
            <a id="back-sub" href="/r/fixit/">Back to r/fixit</a>
          </main>`);
      }
      if (/^\/r\/[^/]+\/?$/.test(pathname)) {
        return page("r/fixit", `
          ${HEADER("reddit")}
          <main id="main-content">
            <h1>r/fixit</h1>
            <a class="item" id="p1" href="/r/fixit/comments/abc123/leaking_dishwasher/">Leaking dishwasher</a>
            <a class="item" id="p2" href="/r/fixit/comments/def456/squeaky_door/">Squeaky door</a>
            <a class="item" id="p3" href="/">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("reddit", `
        ${HEADER("reddit")}
        <div id="shell" style="display:grid;grid-template-columns:240px minmax(0,1fr) 300px;gap:16px">
          <nav id="left" class="side">
            <a href="/r/popular/">Popular</a><br>
            <a href="/r/all/">All</a><br>
            <a id="to-sub" href="/r/fixit/">r/fixit</a>
          </nav>
          <main id="main-content">
            <shreddit-feed id="feed" style="display:block">
              <shreddit-post class="item"><a href="/r/fixit/comments/abc123/leaking_dishwasher/">Leaking dishwasher</a></shreddit-post>
              <shreddit-post class="item"><a href="/r/fixit/comments/def456/squeaky_door/">Squeaky door</a></shreddit-post>
              <shreddit-post class="item"><a href="/r/fixit/comments/ghi789/loose_tile/">Loose tile</a></shreddit-post>
            </shreddit-feed>
          </main>
          <aside id="right" class="side">Popular communities</aside>
        </div>`);
    }
  },

  linkedin: {
    host: "www.linkedin.com",
    feed: "/feed/",
    media: "/posts/someone_a-post-abc123",
    content: "/mynetwork/",
    game: "/games/queens/",
    render(pathname) {
      if (pathname.startsWith("/games")) {
        // A board of 25 square cells, plus artwork that must still be drained.
        const cells = Array.from({ length: 25 }, (_, i) =>
          `<div class="cell" style="width:40px;height:40px;background:hsl(${i * 14},70%,60%)"></div>`).join("");
        return page("Queens | LinkedIn", `
          ${HEADER("LinkedIn")}
          <main id="main">
            <h1>Queens</h1>
            <div id="queens-game-board" style="display:grid;grid-template-columns:repeat(5,40px)">${cells}
              <img id="crown" class="thumb" src="${PIXEL}" alt="Crown">
            </div>
            <div id="leaderboard">
              <img id="face" class="thumb" src="${PIXEL}" alt="A colleague">
              ${COUNTS}
            </div>
            <a id="to-feed" href="/feed/">Back to feed</a>
          </main>`);
      }
      if (pathname.startsWith("/posts")) {
        return page("A post | LinkedIn", `
          ${HEADER("LinkedIn")}
          <main id="main">
            <article id="update">
              <p>A considered professional update.</p>
              <div class="update-components-image"><img id="post-image" class="thumb" src="${PIXEL}" alt=""></div>
              ${COUNTS}
              <div class="comments-comments-list"><div class="item">A comment</div><div class="item">Another</div></div>
            </article>
            <div id="feed-news-module" class="rail">LinkedIn News</div>
            <a id="to-feed" href="/feed/">Back to feed</a>
          </main>`);
      }
      if (pathname.startsWith("/mynetwork")) {
        return page("My Network | LinkedIn", `
          ${HEADER("LinkedIn")}
          <main id="main">
            <h1>My Network</h1>
            <a class="item" href="/posts/someone_a-post-abc123">A post</a>
            <a class="item" href="/feed/">Feed</a>
            ${COUNTS}
          </main>`);
      }
      return page("(9) Feed | LinkedIn", `
        ${HEADER("LinkedIn")}
        <div id="scaffold" style="display:grid;grid-template-columns:225px minmax(0,1fr) 300px;gap:16px">
          <aside id="left" class="side"><a id="to-games" href="/games/queens/">Games</a><br><a id="to-network" href="/mynetwork/">My Network</a></aside>
          <main id="main">
            <div id="feed" class="scaffold-finite-scroll">
              <div class="item" data-id="urn:li:activity:1"><a href="/posts/someone_a-post-abc123">Post 1</a></div>
              <div class="item" data-id="urn:li:activity:2"><a href="/posts/someone_b-post-def456">Post 2</a></div>
              <div class="item" data-id="urn:li:activity:3"><a href="/posts/someone_c-post-ghi789">Post 3</a></div>
            </div>
          </main>
          <aside id="right" class="side"><div id="feed-news-module" class="rail">LinkedIn News</div></aside>
        </div>`);
    }
  },

  instagram: {
    host: "www.instagram.com",
    feed: "/",
    media: "/p/Abc123/",
    content: "/natgeo/",
    render(pathname) {
      if (/^\/(?:[^/]+\/)?p\//.test(pathname)) {
        // No <article> on a post page, and the caption shares one scrolling
        // panel with the comments — the shape syncCommentPanel has to find.
        return page("A photo on Instagram", `
          ${HEADER("Instagram")}
          <main role="main">
            <img id="photo" src="${PIXEL}" alt="A photo" style="width:320px;height:320px">
            <div id="panel" style="height:120px;overflow-y:auto">
              <div id="panel-inner">
                <div id="caption"><a href="/natgeo/">natgeo</a> A caption about the photo.</div>
                <div class="item" id="c1"><a href="/user1/">user1</a> First comment</div>
                <div class="item" id="c2"><a href="/user2/">user2</a> Second comment</div>
                <div class="item" id="c3"><a href="/user3/">user3</a> Third comment</div>
              </div>
            </div>
            ${COUNTS}
            <a id="to-profile" href="/natgeo/">natgeo</a>
          </main>`);
      }
      if (/^\/[^/]+\/$/.test(pathname)) {
        return page("natgeo on Instagram", `
          ${HEADER("Instagram")}
          <main role="main">
            <h1>natgeo</h1>
            ${COUNTS}
            <a class="item" id="g1" href="/p/Abc123/">A post<img class="thumb" src="${PIXEL}" alt=""></a>
            <a class="item" id="g2" href="/p/Def456/">Another post</a>
            <a class="item" id="g3" href="/">Home</a>
          </main>`);
      }
      return page("Instagram", `
        ${HEADER("Instagram")}
        <div id="shell" style="display:flex;gap:24px">
          <nav id="side" class="side">
            <a href="/">Home</a><br>
            <a href="/explore/">Explore</a><br>
            <a href="/reels/">Reels</a><br>
            <a id="to-profile" href="/natgeo/">Profile</a>
          </nav>
          <main id="feed" role="main" style="flex:1;min-width:0">
            <article class="item"><a href="/p/Abc123/">Post 1</a><img class="thumb" src="${PIXEL}" alt=""></article>
            <article class="item"><a href="/p/Def456/">Post 2</a></article>
            <article class="item"><a href="/p/Ghi789/">Post 3</a></article>
          </main>
        </div>`);
    }
  },

  x: {
    host: "x.com",
    feed: "/home",
    media: "/X/status/1234567890",
    content: "/notifications",
    render(pathname) {
      if (/\/status\//.test(pathname)) {
        return page("A post on X", `
          ${HEADER("X")}
          <main id="main">
            <!-- X virtualizes a conversation into a flat run of cells, so the
                 post someone opened is the first cell and the replies follow. -->
            <div aria-label="Timeline: Conversation" role="region">
              <div>
                <div data-testid="cellInnerDiv">
                  <article id="root-post">
                    <p id="post-body">The post someone opened.</p>
                    <div data-testid="tweetPhoto"><img id="post-image" class="thumb" src="${PIXEL}" alt=""></div>
                    ${COUNTS}
                  </article>
                </div>
                <div data-testid="cellInnerDiv" id="reply-1"><article class="item">A reply</article></div>
                <div data-testid="cellInnerDiv" id="reply-2"><article class="item">Another reply</article></div>
              </div>
            </div>
            <a id="to-home" href="/home">Home</a>
          </main>`);
      }
      if (pathname === "/notifications") {
        return page("Notifications / X", `
          ${HEADER("X")}
          <main id="main">
            <h1>Notifications</h1>
            <a class="item" href="/X/status/1234567890">Someone replied</a>
            <a class="item" href="/home">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("(12) Home / X", `
        ${HEADER("X")}
        <main id="main" style="display:flex;gap:24px">
          <div id="primary" data-testid="primaryColumn" style="flex:1;min-width:0">
            <div id="timeline" role="region" aria-label="Timeline: Your Home Timeline">
              <div data-testid="cellInnerDiv" class="item"><a href="/X/status/1234567890">Post 1</a></div>
              <div data-testid="cellInnerDiv" class="item"><a href="/X/status/2234567890">Post 2</a></div>
              <div data-testid="cellInnerDiv" class="item"><a href="/X/status/3234567890">Post 3</a></div>
            </div>
          </div>
          <div id="side" data-testid="sidebarColumn" class="side">
            <input type="search" id="side-search">
            <div aria-label="Timeline: Trending now">Trends</div>
            <a id="to-notifs" href="/notifications">Notifications</a>
          </div>
        </main>`);
    }
  },

  twitch: {
    host: "www.twitch.tv",
    feed: "/",
    media: "/somestreamer",
    content: "/settings",
    render(pathname) {
      // `/settings` is answered by the shared chrome page: it is one of the few
      // paths Twitch does not read as a channel name.
      if (/^\/[^/]+\/?$/.test(pathname) && pathname !== "/") {
        return page("somestreamer - Twitch", `
          ${HEADER("Twitch")}
          <main id="main">
            <video id="player" muted></video>
            <h1>somestreamer</h1>
            <div data-a-target="side-nav-live-status">12.4K</div>
            ${COUNTS}
            <div data-a-target="chat-shell" id="chat"><div class="item">chat line</div><div class="item">another</div></div>
            <a id="to-home" href="/">Home</a>
          </main>`);
      }
      return page("Twitch", `
        ${HEADER("Twitch")}
        <div id="shell" style="display:flex;gap:16px">
          <div id="side" class="side"><a href="/directory">Browse</a><br><a id="to-channel" href="/somestreamer">somestreamer</a><br><a id="to-settings" href="/settings">Settings</a></div>
          <main id="feed" style="flex:1;min-width:0">
            <article class="item"><a href="/somestreamer">Stream 1</a></article>
            <article class="item"><a href="/otherstreamer">Stream 2</a></article>
            <article class="item"><a href="/thirdstreamer">Stream 3</a></article>
          </main>
        </div>`);
    }
  },

  pinterest: {
    host: "www.pinterest.com",
    feed: "/",
    media: "/pin/12345/",
    content: "/search/pins/?q=oak",
    render(pathname) {
      if (pathname.startsWith("/pin/")) {
        return page("An oak desk | Pinterest", `
          ${HEADER("Pinterest")}
          <main id="main">
            <div data-test-id="closeup-image"><img id="pin-image" src="${PIXEL}" alt="" style="width:300px;height:300px"></div>
            ${COUNTS}
            <div data-test-id="related-pins" class="rail"><a class="item" href="/pin/22222/">Related pin</a></div>
            <a id="to-home" href="/">Home</a>
          </main>`);
      }
      if (pathname.startsWith("/search")) {
        return page("oak | Pinterest", `
          ${HEADER("Pinterest")}
          <main id="main"><h1>oak</h1>
            <a class="item" href="/pin/12345/">A pin</a>
            <a class="item" href="/">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("Pinterest", `
        ${HEADER("Pinterest")}
        <div id="wrap">
          <div id="feed" data-test-id="homefeed-feed">
            <div data-test-id="pin" class="item"><a href="/pin/12345/">Pin 1</a></div>
            <div data-test-id="pin" class="item"><a href="/pin/22222/">Pin 2</a></div>
            <div data-test-id="pin" class="item"><a href="/pin/33333/">Pin 3</a></div>
          </div>
          <a id="to-search" href="/search/pins/?q=oak">Search</a>
        </div>`);
    }
  },

  threads: {
    host: "www.threads.com",
    feed: "/",
    media: "/@natgeo/post/Abc123",
    content: "/@natgeo",
    render(pathname) {
      if (/\/post\//.test(pathname)) {
        return page("A thread", `
          ${HEADER("Threads")}
          <main role="main">
            <article id="root-post"><p>A thread someone opened.</p>
              <img id="post-image" class="thumb" src="${PIXEL}" alt="">
              ${COUNTS}
            </article>
            <a id="to-home" href="/">Home</a>
          </main>`);
      }
      if (pathname.startsWith("/@")) {
        return page("natgeo on Threads", `
          ${HEADER("Threads")}
          <main role="main"><h1>natgeo</h1>
            <a class="item" href="/@natgeo/post/Abc123">A thread</a>
            <a class="item" href="/">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("Threads", `
        ${HEADER("Threads")}
        <main role="main">
          <div data-pressable-container class="item"><a href="/@natgeo/post/Abc123">Thread 1</a></div>
          <div data-pressable-container class="item"><a href="/@natgeo/post/Def456">Thread 2</a></div>
          <div data-pressable-container class="item"><a href="/@natgeo/post/Ghi789">Thread 3</a></div>
        </main>
        <a id="to-profile" href="/@natgeo">Profile</a>`);
    }
  },

  bluesky: {
    host: "bsky.app",
    feed: "/",
    media: "/profile/nasa.gov/post/abc123",
    content: "/profile/nasa.gov",
    render(pathname) {
      if (/\/post\//.test(pathname)) {
        return page("A post on Bluesky", `
          ${HEADER("Bluesky")}
          <main>
            <div role="article" id="root-post"><p>A post someone opened.</p>
              <img id="post-image" src="${PIXEL}" class="thumb" alt="">
              ${COUNTS}
            </div>
            <a id="to-home" href="/">Home</a>
          </main>`);
      }
      if (pathname.startsWith("/profile")) {
        return page("nasa.gov on Bluesky", `
          ${HEADER("Bluesky")}
          <main><h1>nasa.gov</h1>
            <a class="item" href="/profile/nasa.gov/post/abc123">A post</a>
            <a class="item" href="/">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("Bluesky", `
        ${HEADER("Bluesky")}
        <div id="shell" style="display:flex;gap:24px">
          <nav id="side" class="side"><a href="/feeds">Feeds</a><br><a id="to-profile" href="/profile/nasa.gov">Profile</a></nav>
          <main style="flex:1;min-width:0">
            <div role="article" data-testid="feedItem-1" class="item"><a href="/profile/nasa.gov/post/abc123">Post 1</a></div>
            <div role="article" data-testid="feedItem-2" class="item"><a href="/profile/nasa.gov/post/def456">Post 2</a></div>
            <div role="article" data-testid="feedItem-3" class="item"><a href="/profile/nasa.gov/post/ghi789">Post 3</a></div>
          </main>
        </div>`);
    }
  },

  tiktok: {
    host: "www.tiktok.com",
    feed: "/",
    media: "/@tiktok/video/12345",
    content: "/search?q=cats",
    render(pathname) {
      if (/\/video\//.test(pathname)) {
        return page("A video on TikTok", `
          ${HEADER("TikTok")}
          <main id="main">
            <video id="player" muted></video>
            ${COUNTS}
            <div data-e2e="browse-comment" class="item">A comment</div>
            <div data-e2e="comment-level-1" class="item">A reply</div>
            <a id="to-home" href="/">Home</a>
          </main>`);
      }
      if (pathname.startsWith("/search")) {
        return page("cats | TikTok", `
          ${HEADER("TikTok")}
          <main id="main"><h1>cats</h1>
            <a class="item" href="/@tiktok/video/12345">A video</a>
            <a class="item" href="/">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("TikTok", `
        ${HEADER("TikTok")}
        <div id="shell" style="display:flex;gap:16px">
          <nav id="side" class="side"><a href="/explore">Explore</a><br><a id="to-search" href="/search?q=cats">Search</a></nav>
          <div id="main-content-homepage_hot" style="flex:1;min-width:0">
            <article class="item"><a href="/@tiktok/video/12345">Video 1</a></article>
            <article class="item"><a href="/@tiktok/video/22222">Video 2</a></article>
            <article class="item"><a href="/@tiktok/video/33333">Video 3</a></article>
          </div>
        </div>`);
    }
  },

  facebook: {
    host: "www.facebook.com",
    feed: "/",
    media: "/natgeo/posts/12345",
    content: "/marketplace/",
    render(pathname) {
      if (/\/posts\//.test(pathname)) {
        return page("A post | Facebook", `
          ${HEADER("facebook")}
          <div id="mount">
            <div role="article" id="root-post">
              <p id="post-body">A post someone opened.</p>
              <div data-visualcompletion="media-vc-image"><img id="post-image" class="thumb" src="${PIXEL}" alt=""></div>
              ${COUNTS}
              <div role="article" class="item" id="c1">A comment</div>
              <div role="article" class="item" id="c2">Another comment</div>
            </div>
            <a id="to-home" href="/">Home</a>
          </div>`);
      }
      if (pathname.startsWith("/marketplace")) {
        return page("Marketplace | Facebook", `
          ${HEADER("facebook")}
          <div id="mount"><main><h1>Marketplace</h1>
            <a class="item" href="/natgeo/posts/12345">A post</a>
            <a class="item" href="/">Home</a>
            ${COUNTS}
          </main></div>`);
      }
      return page("(3) Facebook", `
        ${HEADER("facebook")}
        <div id="mount">
          <div id="shell" style="display:grid;grid-template-columns:250px minmax(0,1fr) 250px;gap:16px">
            <div id="left" class="side"><a href="/watch">Watch</a><br><a id="to-market" href="/marketplace/">Marketplace</a></div>
            <div id="feed" data-pagelet="MainFeed">
              <div role="article" class="item"><a href="/natgeo/posts/12345">Post 1</a></div>
              <div role="article" class="item"><a href="/natgeo/posts/22222">Post 2</a></div>
              <div role="article" class="item"><a href="/natgeo/posts/33333">Post 3</a></div>
            </div>
            <div id="right" class="side">Contacts</div>
          </div>
        </div>`);
    }
  },

  googlenews: {
    host: "news.google.com",
    feed: "/",
    media: "/articles/abc123",
    content: "/search?q=climate",
    render(pathname) {
      if (pathname.startsWith("/articles") || pathname.startsWith("/read")) {
        return page("An article - Google News", `
          ${HEADER("Google News")}
          <main id="main">
            <article id="story"><h1>A headline</h1>
              <img id="story-image" class="thumb" src="${PIXEL}" alt="">
              ${COUNTS}
            </article>
            <a id="to-home" href="/">Home</a>
          </main>`);
      }
      if (pathname.startsWith("/search")) {
        return page("climate - Google News", `
          ${HEADER("Google News")}
          <main id="main"><h1>climate</h1>
            <a class="item" href="/articles/abc123">An article</a>
            <a class="item" href="/">Home</a>
            ${COUNTS}
          </main>`);
      }
      return page("Google News", `
        ${HEADER("Google News")}
        <main id="main">
          <c-wiz id="feed" style="display:block">
            <article class="item"><a href="/articles/abc123">Story 1</a></article>
            <article class="item"><a href="/articles/def456">Story 2</a></article>
            <article class="item"><a href="/articles/ghi789">Story 3</a></article>
          </c-wiz>
        </main>
        <a id="to-search" href="/search?q=climate">Search</a>`);
    }
  }
};

/**
 * The page every site's header links to. Shared, because it is site chrome: what
 * matters about it is that it is an ordinary content route with somewhere to go
 * next, so a walk through the site does not dead-end in the navigation bar.
 */
function chromePage(key) {
  const site = SITES[key];
  return page("Settings", `
    ${HEADER("Settings")}
    <main id="main">
      <h1>Settings</h1>
      <a class="item" id="onward" href="${site.media}">Something you opened on purpose</a>
      <a class="item" id="sideways" href="${site.content}">Somewhere else on the site</a>
      <a class="item" id="back-home" href="${site.feed}">Back to the feed</a>
      ${COUNTS}
    </main>`);
}

/** A sanity net: a fixture that names a site `core.js` does not know is a typo. */
for (const key of Object.keys(SITES)) {
  if (!D.SITE_KEYS.includes(key)) throw new Error(`fixture-site.js has an unknown site: ${key}`);
  const { host } = SITES[key];
  if (D.getSite(`https://${host}/`) !== key) {
    throw new Error(`fixture host ${host} does not resolve to ${key}`);
  }
}

const url = (key, path) => `https://${SITES[key].host}${path}`;

/**
 * Answers every request for a site's origin from its own `render`, so links
 * between pages are ordinary navigations.
 */
async function serve(context, key) {
  const site = SITES[key];
  await context.route(`https://${site.host}/**`, (route) => {
    const parsed = new URL(route.request().url());
    const pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: pathname === "/settings" ? chromePage(key) : site.render(pathname, parsed.search)
    });
  });
}

async function serveAll(context) {
  for (const key of Object.keys(SITES)) await serve(context, key);
}

module.exports = { SITES, serve, serveAll, url, PIXEL };
