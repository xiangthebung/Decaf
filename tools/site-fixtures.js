/**
 * Small stand-ins for the shell of each supported site: the header and sidebars
 * that must survive, and the feed container that must not. The markup mirrors the
 * hooks the real sites use (custom elements, ids, data attributes, grid scaffolds)
 * so the selectors in core.js and content.css can be checked on all twelve sites
 * even though most of them cannot be loaded by an automated browser.
 *
 * `container` is the element Decaf empties and puts its notice inside: the
 * outermost one it recognizes. `keep` lists what must still be visible, and in the same
 * place as it was without Decaf.
 */
"use strict";

const GRID = (columns) =>
  `display:grid;grid-template-columns:${columns};gap:16px;align-items:start`;

const SITE_FIXTURES = {
  youtube: {
    host: "www.youtube.com",
    container: "grid",
    keep: ["nav", "guide"],
    body: `
      <header id="nav">YouTube <input type="search" placeholder="Search"></header>
      <div id="content" style="display:flex;gap:16px">
        <div id="guide">Home<br>Subscriptions<br>You</div>
        <div id="page-manager" style="flex:1;min-width:0">
          <ytd-browse id="browse" page-subtype="home">
            <ytd-feed-filter-chip-bar-renderer id="chips">All · Music · Gaming</ytd-feed-filter-chip-bar-renderer>
            <ytd-rich-grid-renderer id="grid" style="display:block">
              <ytd-rich-item-renderer>video</ytd-rich-item-renderer>
              <ytd-rich-item-renderer>video</ytd-rich-item-renderer>
              <ytd-rich-item-renderer>video</ytd-rich-item-renderer>
            </ytd-rich-grid-renderer>
          </ytd-browse>
        </div>
      </div>`
  },
  instagram: {
    host: "www.instagram.com",
    container: "feed",
    keep: ["nav"],
    body: `
      <div id="mount">
        <div id="shell" style="display:flex;gap:24px">
          <nav id="nav">Home<br>Search<br>Messages</nav>
          <main id="feed" role="main" style="flex:1;min-width:0">
            <article>post</article><article>post</article><article>post</article>
          </main>
        </div>
      </div>`
  },
  tiktok: {
    host: "www.tiktok.com",
    container: "main-content-homepage_hot",
    keep: ["nav", "header"],
    body: `
      <div id="app">
        <div id="header">TikTok <input type="search"></div>
        <div id="shell" style="display:flex;gap:16px">
          <nav id="nav">For You<br>Following<br>Profile</nav>
          <div id="main-content-homepage_hot" style="flex:1;min-width:0">
            <article>video</article><article>video</article><article>video</article>
          </div>
        </div>
      </div>`
  },
  x: {
    host: "x.com",
    container: "primary",
    keep: ["nav", "side"],
    body: `
      <div id="react-root">
        <header id="nav" role="banner">Home<br>Messages</header>
        <main id="main" style="display:flex;gap:24px">
          <div id="primary" data-testid="primaryColumn" style="flex:1;min-width:0">
            <div id="timeline" role="region" aria-label="Timeline: Your Home Timeline">
              <div data-testid="cellInnerDiv">post</div>
              <div data-testid="cellInnerDiv">post</div>
              <div data-testid="cellInnerDiv">post</div>
            </div>
          </div>
          <div id="side" data-testid="sidebarColumn" style="width:290px">What's happening</div>
        </main>
      </div>`
  },
  reddit: {
    host: "www.reddit.com",
    container: "main-content",
    keep: ["nav", "left", "right"],
    body: `
      <shreddit-app>
        <header id="nav">reddit <input type="search"></header>
        <div id="shell" style="${GRID("270px minmax(0,1fr) 316px")};grid-template-areas:'left main right'">
          <nav id="left" style="grid-area:left">Home<br>Popular<br>r/webdev</nav>
          <main id="main-content" style="grid-area:main">
            <shreddit-feed id="feed">
              <shreddit-post>post</shreddit-post><shreddit-post>post</shreddit-post><shreddit-post>post</shreddit-post>
            </shreddit-feed>
          </main>
          <aside id="right" style="grid-area:right">Popular communities</aside>
        </div>
      </shreddit-app>`
  },
  facebook: {
    host: "www.facebook.com",
    container: "feed",
    keep: ["nav", "left", "right"],
    body: `
      <div id="mount">
        <div id="nav" role="banner">facebook <input type="search"></div>
        <div id="shell" style="${GRID("300px minmax(0,1fr) 300px")}">
          <div id="left">Shortcuts</div>
          <div id="feed" data-pagelet="MainFeed">
            <div role="article">post</div><div role="article">post</div><div role="article">post</div>
          </div>
          <div id="right">Contacts</div>
        </div>
      </div>`
  },
  threads: {
    host: "www.threads.com",
    container: "feed",
    keep: ["nav"],
    body: `
      <div id="barcelona">
        <header id="nav">Threads</header>
        <main id="feed" role="main">
          <div data-pressable-container>post</div>
          <div data-pressable-container>post</div>
          <div data-pressable-container>post</div>
        </main>
      </div>`
  },
  bluesky: {
    host: "bsky.app",
    container: "feed",
    keep: ["nav"],
    body: `
      <div id="root">
        <div id="shell" style="display:flex;gap:24px">
          <nav id="nav">Home<br>Search<br>Notifications</nav>
          <main id="feed" style="flex:1;min-width:0">
            <div role="article">post</div><div role="article">post</div><div role="article">post</div>
          </main>
        </div>
      </div>`
  },
  twitch: {
    host: "www.twitch.tv",
    container: "feed",
    keep: ["nav", "side"],
    body: `
      <div id="root">
        <nav id="nav">Twitch <input type="search"></nav>
        <div id="shell" style="display:flex;gap:16px">
          <div id="side" style="width:240px">Followed channels</div>
          <main id="feed" style="flex:1;min-width:0">
            <article>stream</article><article>stream</article><article>stream</article>
          </main>
        </div>
      </div>`
  },
  pinterest: {
    host: "www.pinterest.com",
    container: "feed",
    keep: ["nav"],
    body: `
      <div id="pws-root">
        <header id="nav">Pinterest <input type="search"></header>
        <div id="wrap">
          <div id="feed" data-test-id="homefeed-feed">
            <div data-test-id="pin">pin</div><div data-test-id="pin">pin</div><div data-test-id="pin">pin</div>
          </div>
        </div>
      </div>`
  },
  linkedin: {
    host: "www.linkedin.com",
    container: "main",
    keep: ["nav", "left", "right"],
    body: `
      <div class="application-outlet">
        <header id="nav">LinkedIn <input type="search"></header>
        <div id="scaffold" style="${GRID("225px minmax(0,1fr) 300px")}">
          <aside id="left">Your profile</aside>
          <main id="main">
            <div id="feed" class="scaffold-finite-scroll">
              <div data-id="urn:li:activity:1">post</div>
              <div data-id="urn:li:activity:2">post</div>
              <div data-id="urn:li:activity:3">post</div>
            </div>
          </main>
          <aside id="right">LinkedIn News</aside>
        </div>
      </div>`
  },
  googlenews: {
    host: "news.google.com",
    container: "main",
    keep: ["nav"],
    body: `
      <div id="gb" style="display:none"></div>
      <div id="shell">
        <header id="nav">Google News <input type="search"></header>
        <main id="main">
          <c-wiz id="feed">
            <article>story</article><article>story</article><article>story</article>
          </c-wiz>
        </main>
      </div>`
  }
};

const STYLE = `
  :root { color-scheme: light dark }
  body { margin: 0; font: 15px/1.4 system-ui, sans-serif; background: #fff; color: #111 }
  header, #nav, #header { display: block; padding: 12px 16px; border-bottom: 1px solid #ddd }
  nav, aside, #left, #right, #side, #guide { color: #555; padding: 12px }
  article, [role="article"], shreddit-post, ytd-rich-item-renderer, [data-test-id="pin"],
  [data-testid="cellInnerDiv"], [data-pressable-container], [data-id^="urn:li:activity"] {
    display: block; margin: 8px 0; padding: 24px 12px; background: #f1f1f1; border-radius: 8px
  }
  input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 999px }
`;

function pageFor(key, extraStyle = "") {
  const fixture = SITE_FIXTURES[key];
  if (!fixture) return null;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${key}</title>
<style>${STYLE}${extraStyle}</style></head>
<body>${fixture.body}</body></html>`;
}

module.exports = { SITE_FIXTURES, pageFor };
