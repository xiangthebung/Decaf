# Decaf

The same web, without the stimulant.

Decaf is a Chrome extension for feed-driven sites. It leaves search, messages, profiles, subscriptions and anything you open on purpose working normally, and takes away the parts that make those sites hard to put down: the endless feed, the reward numbers, the recommendation rails and the notification nudges.

It is not a blocker. It never freezes a page, never takes over the window, and never leaves you stuck.

## What it does

**Always, on every site it covers**

- Images and video are grayscale — including the video you opened. When something genuinely needs color, one tap on the page gives it color until you leave that page, and the next page asks again.
- Likes, views, followers, upvotes, bookmarks, favourites, viewers and members are replaced with a dash, in the page and in the labels screen readers read. Sites write these numbers in every shape there is — the word inside the number, beside it, in front of it, on the icon next to it, or nowhere at all — and Decaf reads all of them.
- Notification counts and the red dots beside them keep their number but lose the urgent red, so a real message still gets through. The `(3)` that sites put in the tab title is removed.

**Pause feeds** (on by default)

- The feed is emptied where it sits: its container stays exactly where the site put it, holding a small card that says Decaf paused it and offers one button. Everything around it — the header, the search box, the sidebars, the links — does not move by a pixel, and the page scrolls normally.
- Recommendation rails go too: up-next, end-screen cards, Shorts shelves, YouTube's Mix panel, "who to follow", trends, related pins, the news module. A playlist someone made and you opened keeps its panel; a Mix, which YouTube writes for you, does not.
- Muted autoplay outside a page you opened yourself is stopped, and nothing plays behind a paused feed.
- Holding that one button opens the feed for 5 minutes. The first hold of the day is 3 seconds, the next is 7, then 11, then 15. A running Lock adds 4 seconds. The card tells you which time today it is.

**Hide comments and replies** (on by default)

Comment threads, reply threads and live chat are hidden on YouTube, Instagram, TikTok, X, Facebook, LinkedIn and Twitch. The post, photo or video itself stays.

Reddit is capped instead of hidden, because there the thread is the page. A post permalink is literally `/r/<sub>/comments/<id>/`, and a link post has no body of its own — someone who searched for a problem and landed on Reddit came for the thread, and hiding it would leave a title, no answer, and no way forward. So the top-level comments stay, along with the one reply that usually confirms them. What goes is the argument below that, and the loader Reddit uses to fetch another thousand comments while you scroll: the thread ends instead of growing.

**Extra friction** (off by default)

- **Turn media upside down** — images and video in the content area are flipped. Readable if you mean to look, tiring if you are only browsing. A page you granted color to stays the right way up.
- **Hide notification counts** — removes the muted badges completely.

## Where it works

| Site | Paused surfaces |
| --- | --- |
| YouTube | Home, Shorts, Explore |
| Instagram | Home, Reels, Explore |
| TikTok | For You, Explore, Live |
| X | Home, Explore |
| Reddit | Home, Popular, All |
| Facebook | News Feed, Reels, Watch |
| Threads | Home feed |
| Bluesky | Home feed |
| Twitch | Home, Browse |
| Pinterest | Home, Ideas, Today |
| LinkedIn | Home feed |
| Google News | Top stories, For you |

Messaging apps are deliberately out of scope. A conversation is not a feed, and Decaf should never come between you and a message.

## Settings

Four switches, one list, one commitment.

- **Pause feeds**, **Hide comments and replies**, **Turn media upside down**, **Hide notification counts**.
- **Where Decaf works** — one switch per site. All twelve are on by default.
- **Lock** — for when a switch is too easy to flip: 1 day, 1 week or 30 days. While a Lock runs, Decaf cannot be switched off, no switch can be turned off, sites cannot be removed, and the Lock cannot be shortened. You can still add sites and add friction, and the 5-minute hold still works — it just takes 4 seconds longer.

Everything applies the moment you change it. There is no Save button and no draft state.

## Privacy

- Settings live in `chrome.storage.local` on this device. Nothing syncs, nothing leaves.
- Decaf makes no network requests of its own. There is no remote code, no analytics, no accounts, no external service.
- It reads the address of the page you are on to decide whether that page is a feed. It never stores page content, browsing history, or a record of where you have been. The only thing it counts is how many 5-minute passes you took today, per site, and that resets overnight.
- Permissions: `storage` for your settings, `activeTab` so the popup can tell which site you are on, `alarms` to notice when a Lock ends. Content scripts run only on the twelve hosts listed above.

## Install from source

```sh
npm install
npm run build
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select **`dist/`** — not this folder.
4. The settings page opens on first install. Chrome 105 or newer is required.

`dist/` is what the build assembles: the twenty-three files the extension actually
runs, and none of the tests, tools or documentation sitting next to them. It is also
exactly what `npm run zip` packages, so the store artifact cannot drift from the
source the way a hand-assembled archive does.

## Development

```sh
npm install     # jsdom, for the tests only — the extension itself has no dependencies
npm run build   # assemble dist/
npm run watch   # reassemble on every save; press reload in chrome://extensions
npm test        # unit tests, jsdom DOM tests, and packaging checks
npm run verify  # tests, then a build
npm run zip     # dist/ -> artifacts/decaf-<version>.zip, inflated and CRC-checked
npm run clean   # remove dist/ and artifacts/
npm run icons   # regenerate icons/*.png and icons/*.svg from tools/make-icons.js
```

The build is a copy, not a bundle — there is nothing to transpile. It exists so that
every extension in this workspace is loaded the same way, and so the allowlist in
`scripts/build.mjs` cannot quietly fall behind: `verifyReferences` reads `dist/` back
and resolves every manifest path, HTML `src`/`href`, JS import and `icons/…` string
literal, failing the build on anything missing. That last case matters here — eight
of the twelve icons are named only inside the object `background.js` hands to
`chrome.action.setIcon`, so nothing in the manifest points at them.

```sh
node scripts/negative-test.mjs   # prove the reference check still fails when it should
```

There are also opt-in browser tests that load the unpacked extension into a real Chromium, including a genuine three-second hold:

```sh
npm install --no-save playwright && npx playwright install chromium
DECAF_BROWSER=1 npm test            # against a local fixture
DECAF_LIVE=1 npm test               # also against the real sites, over the network
node tools/verify-deep.js           # every setting, every page, every route, plus a click-through
node tools/verify-deep.js settings popup   # named sections only
node tools/verify-deep.js --headed  # watch it happen
node tools/layout.js                # the notice inside 15 hostile parent layouts
node tools/layout.js sites          # the notice on a stand-in for all twelve sites
node tools/layout.js live           # measure the notice on real pages
node tools/layout.js hold           # screenshot the hold half way through
node tools/attach.js                # all twelve sites in your own signed-in Chrome
node tools/audit.js                 # every friction, site by site, with screenshots
node tools/audit.js reddit x        # just these two
node tools/shots.js /tmp/decaf      # screenshots of the notice, popup and settings
node tools/probe.js https://www.youtube.com/   # report how a live page is built
```

`tools/verify-deep.js` is the check that matters after changing behaviour. It loads
`dist/` into a real Chromium and asks, from the outside, whether Decaf does what the
settings page says: each of the six switches on its own — for what it changes *and*
for what it must leave alone — every route of all twelve sites, both extension pages
driven through every state they have, a genuine press-and-hold, the whole Lock
contract including a writer going behind its back, the toolbar icon, and a walk
through each site clicking links. What a page *should* look like is always recomputed
from `core.js`, so a fixture cannot quietly assert the wrong answer, and every claim
is read back out of the engine — `getComputedStyle`, `getClientRects`, real
navigations — because most of Decaf is CSS and a selector in a stylesheet proves
nothing about whether it matches.

`tools/audit.js` is the check that matters after a redesign. For each site it opens the feed and then one post, and reports the card's width, feed items still showing, comment threads, rails, red badges, playing video, and every number left on the page — the last one as a note, so a count Decaf's own rules cannot see is still visible to a human reading the output. On Reddit it also reports how much of the thread the cap left behind, and fails if the answer is gone as loudly as it fails if the scroll is still there.

| File | Role |
| --- | --- |
| `core.js` | The site table (hosts, route rules, feed containers), the settings shape, and the rules for passes and Locks. Pure functions, shared by every other file. |
| `content.js` | The page runtime: the in-place notice, count and badge marking, the color grant, the autoplay guard, SPA route tracking. |
| `content.css` | Everything visual, including Decaf's own elements. Scoped to `html.decaf-*` state classes. |
| `popup.*` | Current-site status, on/off, Lock. |
| `options.*` | The four switches, the site list, Lock. |
| `background.js` | Toolbar icon state and Lock enforcement. |
| `tools/site-fixtures.js` | Stand-ins for the shell of every supported site, shared by the tests and `tools/layout.js`. |
| `tools/fixture-site.js` | A small stand-in *site* per host: a feed, a post, a plain page and a game, linked to each other, so a run can navigate rather than only load. Used by `tools/verify-deep.js`. |
| `tools/verify-deep.js` | End-to-end verification in a real Chromium: every setting, both extension pages, the hold, the Lock, the toolbar icon, and a click-through of all twelve sites. |
| `tools/attach.js`, `tools/audit.js`, `tools/cdp.js` | Checks the real, signed-in sites by attaching to a Chrome you started yourself. `cdp.js` speaks the DevTools protocol directly, so it does not depend on a Playwright/Chrome version pairing. |

Five design rules worth knowing before changing anything:

- **Decaf's elements are styled only from `content.css`.** They live in the page, not a shadow root, because a site's Content Security Policy can block a stylesheet built at runtime but never one the browser injects for an extension. Nothing in `content.js` writes CSS or inline styles; even the hold animation is a class, and the progress bar deliberately avoids `!important` on `transform` so the animation can win.
- **Nothing is sized in `em` or `rem`, and layout is stated explicitly.** A host page's root font size is not ours: YouTube ships `html { font-size: 10px }`, which silently shrank the card to 340px. The notice also declares its flex and grid placement, because the container it lands in may be either. `tools/layout.js` checks all of this against twenty hostile layouts — flex, grid, named grid areas, a clipping ancestor, a 300px-tall window, a 10px root font, uppercase RTL parents, and a fixture that throws `!important` floats and `line-height: 3` at it — plus a stand-in for every supported site; two tests keep the rules in place.
- **The card checks its own placement.** After it is inserted, Decaf verifies that the card is wide enough and not clipped by anything the site hides behind, unclips the elements between it and the page, scrolls it into view if the page was left scrolled, and shrinks it in a short window. If a container fails the check, the next candidate is tried.
- **Nothing feed-shaped may be left showing.** Once the card is placed, Decaf looks for feed items that are still on screen and empties the container they actually live in, up to three times. The fallback that finds a feed by its items can never choose part of a single post — that mistake once left one Instagram post on screen with a hole where its picture had been.
- **A paused feed is emptied, never removed.** `content.css` hides the *children* of a feed container, not the container, and the notice goes inside it. Removing the container would take it out of the site's grid or flex layout and drag the sidebars into the content column — which is exactly what an earlier version did to Reddit. `feedSelectors` in `core.js` and the `html.decaf-hide-feed` rules must agree; two tests fail if they drift or if a rule ever hides a container outright. CSS does the emptying, so a feed never flashes; the content script only decides which container hosts the notice.

## Known limits

- Feed containers, rails, comment threads and reward counts are matched with per-site selectors. A redesign can outrun them. Route detection is far more stable, and if every selector for a feed misses, Decaf falls back to finding the feed by shape — the smallest element holding several feed items — so a redesign degrades to a brief flash rather than a card claiming a feed is paused while it is not.
- All twelve sites have been checked in a real signed-in browser with `tools/audit.js`: the feed emptied, no item left showing, the card readable, the layout unmoved, counts masked, comments and rails gone. Repeating that after a redesign needs a signed-in Chrome started with `--remote-debugging-port`; the stand-in shells and hostile layouts run without one. The audit follows a link out of a feed to find a post, so on Bluesky and LinkedIn — which render posts as clickable containers rather than links — the second half of the check has to be run by hand.
- `tools/layout.js sites` loads each stand-in twice — once on a host Decaf ignores, once on the site's own host — and fails if the header, the sidebars or the feed's column move by more than two pixels. That is the check that says the page still looks right. It cannot, of course, prove the stand-in matches the real site.
- The hold works with a mouse, a touch screen, or holding Space or Enter on the focused button. It does need a sustained press. If that is not workable for you, switch the site off in settings instead — Decaf should never be the thing standing between you and the web.
- Reward counts are found from what surrounds them: the label on the control the number belongs to (X names the button, Instagram and Threads name the icon beside it), the word in the next element (X splits "1.8M" and "Views"), or the word in front of it (Facebook writes "All reactions:" separately). A bare number that belongs to no control is left alone, which is what keeps prices, dates and anything you are typing untouched. Counts a site labels nowhere at all need a per-site selector: Twitch's sidebar viewer numbers, Reddit's community card, Facebook's unnamed comment and share buttons.
- Notification counts kept inside a shadow root, like Reddit's `<dynamic-badge>`, cannot be reached by a stylesheet or a query. Decaf marks the host element instead, which mutes everything inside it. Badges are recognised by the name a site gives them rather than by their contents, because the contents vary: LinkedIn's badge holds "1" for the eye and "1 new notification" for a screen reader, and its red dot holds only the words. A small chip a site happens to call a badge may be muted along with them.
- Instagram's "More posts from this account" grid below an open post is left in place. It is drawn by the same renderer as the post, and the earlier attempt to find and remove it made Instagram stutter badly enough to be worse than the grid.
- The **Show in color** button sits in the bottom-right corner, and moves above or beside a site's own furniture when it finds some there: Instagram's message dock, Threads' compose button, X's pair of round buttons. It looks at three points across itself, tries the corner, then above it, then beside it. Something a site draws in the page at the very bottom of a long document — Twitch's promo bar, for one — can still end up underneath it.
- Comment hiding on Instagram, X and Facebook relies on structure rather than stable hooks, so it is the first thing likely to need attention after a redesign.
- Reddit's cap rests on three hooks read off live threads: the `depth` attribute new Reddit puts on every `shreddit-comment`, the `src` of the partial it fetches more replies through, and the `.child` wrapper old Reddit adds per level. All three fail in the safe direction — rename any of them and the selector matches nothing, so the full thread comes back rather than the page going blank. Old Reddit's own "load more comments" link is left alone: it only loads when it is clicked, so it cannot grow a thread underneath you the way new Reddit's scroll does.
- The cap has no per-page escape hatch, and a comment permalink is not one: new Reddit serves that URL as the same thread with the same depths rather than re-rooting the subtree, so a reply at depth 2 stays capped there too. Reading a deep chain means turning the switch off. That is the deliberate cost of the cap being three CSS selectors with no runtime state behind them — measured on live threads, the first two levels are most of what is there anyway (7 top-level, 8 replies, 3 below on the thread this was checked against).
- Sites redirect people to country hosts — `ca.pinterest.com`, `en-gb.facebook.com`, `ca.linkedin.com` — so those are matched by pattern. The pattern only accepts a country code or `www`, which keeps Decaf away from `business.pinterest.com` and `studio.youtube.com`.
- Threads ships hashed class names and no `<main>`, so its feed is matched structurally with `:has()`. That is the least stable selector in the table.
- Bluesky gives its right rail no hooks either, so the cards there are told apart by what they hold: the one with the search box stays, the last one — the site's own footer links — stays, and the trends and follow suggestions between them go.
- Only the twelve sites above are covered, on desktop Chrome 105+. Other browsers and mobile are untested.
