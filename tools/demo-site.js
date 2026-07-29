/**
 * The stand-in feed page used by the dev screenshot tools.
 *
 * It has to satisfy two things that pull against each other. Decaf only runs on
 * hosts its manifest lists, and it finds the feed through the markup those sites
 * actually use, so the page must carry the real DOM hooks — `ytd-browse`,
 * `ytd-rich-grid-renderer`, `#page-manager` — and must be served as one of those
 * hosts. But nothing visible here names or imitates anybody. The wordmark is
 * invented, the copy is invented, and the numbers are invented.
 *
 * That split matters most for the store listing. A screenshot of a named product
 * with its reward counts replaced reads as a depiction of that product, which is
 * both a trademark problem and a claim Decaf should not be making. A screenshot of
 * a generic feed with the counts replaced makes exactly the same point and claims
 * only what is true.
 *
 * `SITE_FIXTURES` in `site-fixtures.js` is the other half of this: those are
 * minimal and exist so the selectors can be asserted on all twelve sites. This one
 * is the opposite — one site, dressed enough to photograph.
 */
"use strict";

/** Roughly what a feed page looks like: chrome that stays, a feed that does not. */
const DEMO_SITE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Home</title>
<style>
  :root { color-scheme: light dark }
  * { box-sizing: border-box }
  body {
    margin: 0;
    font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fff;
    color: #0f0f0f;
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    height: 58px;
    padding: 0 20px;
    border-bottom: 1px solid #e4e4e4;
  }
  .mark { display: flex; align-items: center; gap: 9px; font-weight: 750; font-size: 17px }
  .mark i { width: 22px; height: 22px; border-radius: 6px; background: #e8443a }
  input {
    flex: 0 0 380px;
    padding: 8px 14px;
    border: 1px solid #d6d6d6;
    border-radius: 999px;
    font: inherit;
  }
  .spacer { flex: 1 }
  .bell { position: relative; font-size: 18px }
  .bell b {
    position: absolute;
    top: -4px;
    right: -8px;
    min-width: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: #e8443a;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 17px;
    text-align: center;
  }
  .avatar { width: 30px; height: 30px; border-radius: 50%; background: #c9c2b6 }
  nav { width: 210px; padding: 18px 16px; color: #444 }
  nav span { display: block; padding: 9px 0 }
  main { display: flex }
  #page-manager { flex: 1; min-width: 0; padding: 20px 26px }
  article {
    margin: 0 0 20px;
    padding: 16px;
    border: 1px solid #ececec;
    border-radius: 12px;
  }
  .who { display: flex; align-items: center; gap: 10px; font-weight: 650 }
  .who i { width: 28px; height: 28px; border-radius: 50%; background: #cfd8dc }
  .media {
    display: block;
    height: 210px;
    margin: 12px 0;
    border-radius: 10px;
    background: linear-gradient(120deg, #f2994a, #eb5757 46%, #6b3fa0);
  }
  .counts { display: flex; gap: 20px; color: #606060; font-size: 13.5px }
  /* The right padding is load-bearing for the store shots: the popup is composited
     over the top right of this page, and at 18px the aside's numbers poked out past
     its edge as a column of stray digits. */
  aside { width: 250px; padding: 20px 64px 0 0 }
  footer {
    display: flex;
    gap: 22px;
    margin-top: 28px;
    padding: 18px 20px 22px;
    border-top: 1px solid #ececec;
    color: #8a8a8a;
    font-size: 12.5px;
  }
  aside p { margin: 0 0 12px; color: #606060; font-size: 12.5px; font-weight: 700 }
  aside span { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13.5px }
  @media (prefers-color-scheme: dark) {
    body { background: #0f0f0f; color: #f1f1f1 }
    header { border-color: #303030 }
    input { background: #121212; border-color: #303030; color: #f1f1f1 }
    article { border-color: #272727 }
  }
</style></head>
<body>
  <header>
    <!-- No wordmark. The first version of this page carried an invented one, which
         turned out to be the name of a real product, and a screenshot with a made-up
         logo in it next to the extension's own notice reads as a mockup anyway. -->
    <span class="mark"><i></i></span>
    <input type="search" placeholder="Search" aria-label="Search">
    <span class="spacer"></span>
    <span class="bell" aria-label="Notifications">&#9634;<b>12</b></span>
    <span class="avatar"></span>
  </header>
  <main>
    <!-- Long enough to hold the page up. Once the feed is removed the feed *was*
         the page, so without a full-height sidebar the screenshot is a small notice
         above three hundred pixels of nothing. -->
    <nav id="guide">
      <span>Home</span><span>Following</span><span>Messages</span>
      <span>Notifications</span><span>Saved</span><span>Watch later</span>
      <span>Your profile</span><span>Settings</span><span>Help</span>
    </nav>
    <div id="page-manager">
      <ytd-browse page-subtype="home">
        <ytd-rich-grid-renderer style="display:block">
          <article>
            <p class="who"><i></i>someone you follow</p>
            <span class="media"></span>
            <p class="counts"><span>&#9829; 48.2K</span><span>1.2M views</span><span>2,904 comments</span></p>
          </article>
          <article>
            <p class="who"><i></i>a page you liked once</p>
            <span class="media"></span>
            <p class="counts"><span>&#9829; 9,417</span><span>310K views</span><span>1,205 comments</span></p>
          </article>
        </ytd-rich-grid-renderer>
      </ytd-browse>
    </div>
    <aside>
      <p>SUGGESTED FOR YOU</p>
      <span>an account like yours <b>12.4K</b></span>
      <span>trending near you <b>88.1K</b></span>
      <span>because you watched <b>4,102</b></span>
      <p style="margin-top:26px">YOUR LISTS</p>
      <span>Reading <b>18</b></span>
      <span>Watch later <b>7</b></span>
      <span>Archive <b>240</b></span>
    </aside>
  </main>
  <!-- A footer, because the feed was the whole middle of the page and without
       something below it the screenshot ends in a couple of hundred pixels of white. -->
  <footer>
    <span>About</span><span>Terms</span><span>Privacy</span>
    <span>Help</span><span>Language</span>
  </footer>
  <div id="movie_player" style="display:none"><video></video></div>
</body></html>`;

/** The host the page must be served as for the content script to run on it. */
const DEMO_HOST = "www.youtube.com";

module.exports = { DEMO_SITE, DEMO_HOST };
