# Decaf

The same web, without the stimulant.

Decaf is a Chrome extension for feed-driven sites. It leaves search, messages, profiles, subscriptions and anything you open on purpose working normally, and takes away the parts that make those sites hard to put down: the endless feed, the reward numbers, the recommendation rails and the notification nudges.

It is not a blocker. It never freezes a page, never takes over the window, and never leaves you stuck.

## What it does

**Always, on every site it covers**

- Images and video are grayscale — including the video you opened. On a video, photo or post you opened on purpose, a **Show in color** button sits in the bottom-right corner and gives that page its color until you leave it; the next page asks again. It is offered on those pages only, and going fullscreen or into Picture-in-Picture counts as asking.
- Likes, views, followers, upvotes, bookmarks, favourites, viewers and members are replaced with a dash, in the page and in the labels screen readers read. Sites write these numbers in every shape there is — the word inside the number, beside it, in front of it, on the icon next to it, or nowhere at all — and Decaf reads all of them.
- Notification counts and the red dots beside them keep their number but lose the urgent red, so a real message still gets through. The `(3)` that sites put in the tab title is removed.

**Pause feeds** (on by default)

- The feed is emptied where it sits: its container stays exactly where the site put it, holding a small card that says Decaf paused it and offers one button. Everything around it — the header, the search box, the sidebars, the links — does not move by a pixel, and the page scrolls normally.
- Recommendation rails go too: up-next, end-screen cards, Shorts shelves, YouTube's Mix panel, "who to follow", trends, related pins, the news module. A playlist someone made and you opened keeps its panel; a Mix, which YouTube writes for you, does not.
- Muted autoplay outside a page you opened yourself is stopped, and nothing plays behind a paused feed.
- Holding that one button opens the feed for 5 minutes. The first hold of the day is 3 seconds, the next is 7, then 11, then 15. A running Lock adds 4 seconds. The card tells you which time today it is. Letting go early says so rather than silently resetting, and under reduced motion the ring steps forward while the wait counts down out loud.
- While the 5 minutes run, a small counter sits in the corner with the time left and a **Pause it again** button. It is the only control in Decaf that lets you spend less than you asked for.

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
| X | Home, Explore, lists, communities |
| Reddit | Home, Popular, All, any subreddit or user front page |
| Facebook | News Feed, Reels, Watch, Marketplace browse, Groups feed |
| Threads | Home feed |
| Bluesky | Home feed, custom feeds |
| Twitch | Home, Browse |
| Pinterest | Home, Ideas, Today |
| LinkedIn | Home feed |
| Google News | Top stories, For you, Topics |
| Anything you add | Its front page, where the feed can be found by shape |

Messaging apps are deliberately out of scope. A conversation is not a feed, and Decaf should never come between you and a message.

That is enforced structurally rather than left to the route table. A region that announces itself as a dialog, a chat or a conversation — by `role` or by accessible name — is refused as a feed container and never counted as holding feed items, in both `content.js` and `content.css`. It has to be: sites dock a conversation on top of pages Decaf *is* acting on, and Facebook's docked Messenger window is a `role="main"` of its own, so the page-level selectors reached straight into it and hid every message. Written as a route rule alone, the promise held only for as long as every route rule was right — and one over-broad prefix (`/marketplace`, which also matches `/marketplace/inbox`) was enough to break it.

## Settings

Four switches, one list, one commitment.

- **Pause feeds**, **Hide comments and replies**, **Turn media upside down**, **Hide notification counts**. These four apply everywhere Decaf is on; they are not per site.
- **Where Decaf works** — one switch per site, all twelve on by default, plus any site you add yourself. A site can also be set aside for 30 minutes or 2 hours from the popup, which is the option to reach for when you actually need it for a while: a site switched off stays off until you remember to switch it back on, and nobody ever does.
- **Lock** — for when a switch is too easy to flip: 1 hour, 4 hours, 1 day, 1 week or 30 days. An hour of it is the smallest useful version — a focus session that never freezes you. While a Lock runs, Decaf cannot be switched off, no switch can be turned off, sites cannot be removed, and the Lock cannot be shortened. You can still add sites and add friction, and the 5-minute hold still works — it just takes 4 seconds longer.

Everything applies the moment you change it. There is no Save button and no draft state.

## Privacy

- Settings live in `chrome.storage.local` on this device. Nothing syncs, nothing leaves.
- Decaf makes no network requests of its own. There is no remote code, no analytics, no accounts, no external service.
- It reads the address of the page you are on to decide whether that page is a feed. It never stores page content, browsing history, or a record of where you have been. The only thing it counts is how many 5-minute passes you took, per site per day, for the last fourteen days — a count, not a history. The oldest day falls off on its own. Colour granted to a page is not written down at all: it lives in the tab and is gone when you leave.
- Permissions: `storage` for your settings, `activeTab` so the popup can tell which site you are on and ask that tab whether it actually found the feed, `alarms` to notice when a Lock ends, and `scripting` to put Decaf into tabs that were already open when it was installed or updated. `host_permissions` names exactly the hosts the content script already declares — content-script matches do not grant host access to any other API, and without it those already-open tabs stay dead until their next navigation. A site you add yourself is asked for one origin at a time, when you add it.

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
node tools/layout.js                # the notice inside every hostile parent layout
node tools/layout.js sites          # the notice on a stand-in for all twelve sites
node tools/layout.js live           # measure the notice on real pages
node tools/layout.js hold           # screenshot the hold half way through
node tools/attach.js                # all twelve sites in your own signed-in Chrome
node tools/audit.js                 # every friction, site by site, with screenshots
node tools/audit.js reddit x        # just these two
node tools/shots.js /tmp/decaf      # screenshots of the notice, popup and settings
node tools/probe.js https://www.youtube.com/   # report how a live page is built
node tools/preview.js               # popup and settings in a plain tab, state via query string
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
| `core.js` | The site table (hosts, route rules, feed containers), the settings shape, and the rules for passes, snoozes, added sites and Locks. Pure functions, shared by every other file. |
| `content.js` | The page runtime: the in-place notice, count and badge marking, the color grant, the autoplay guard, SPA route tracking. |
| `content.css` | Everything visual, including Decaf's own elements. Scoped to `html.decaf-*` state classes. |
| `popup.*` | Current-site status, on/off, Lock. |
| `options.*` | The four switches, the site list, Lock. |
| `background.js` | Per-tab toolbar state, Lock enforcement, injecting Decaf into tabs that were already open, and registering content scripts for added sites. |
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

## What a Lock actually promises

A Lock holds Decaf against you at your weakest. It is not a security control and
does not pretend to be one: while it runs, no switch in the popup or the settings
page can be turned off, no site can be removed, the Lock cannot be shortened, and
a stale tab writing an older state behind its back is repaired by the service
worker. Clearing the day's pass counts — which would take the hold escalation back
to three seconds — counts as weakening too, and is refused.

What it cannot do is survive removing the extension. Opening `chrome://extensions`
and clicking Remove takes the Lock with it, and nothing an extension can do
prevents that. Winding the system clock forward past the end and back again used
to defeat it permanently; the worker now keeps a high-water mark of every time it
has run, so a Lock is only over once real time has passed it. That is the honest
shape of the thing: a speed bump you agreed to, with one obvious way around it
that takes long enough to notice you are taking it. The settings page says so too.

- **Anything that must exist once per tab is guarded on `window.top`.** The content
  script runs in same-origin subframes too, so the card, the colour offer, the chip,
  the tab title and the route watcher all check `isTopFrame` first; masking and
  grayscale run in every frame, because they are per-document by nature.
- **A press has to be a real press.** Decaf's elements live in the page, not a shadow
  root, so a site's own scripts can reach them — and a synthetic `pointerdown` plus a
  three-second wait was enough for a page to grant itself a pass. Every activation
  goes through `fromPerson`, and `isOurs` is verified against a set held in the
  isolated world rather than trusting a selector a page could copy.

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
- Reloading or updating the extension leaves the previous content script in every
  open tab with its extension APIs cut. Copies from this version on notice within a
  second and remove themselves; a tab still carrying a copy from an older build
  keeps it until that tab is reloaded once. Chrome offers extensions no way to fix
  that retroactively.

- The manifest can only express glob patterns, so `*://*.facebook.com/*` and
  `*://*.reddit.com/*` inject the content script into subdomains Decaf then
  ignores — `developers.facebook.com`, `business.pinterest.com`. `getSite` returns
  nothing there and the script does nothing at all, but the install warning covers
  those hosts. Narrowing it would mean enumerating every locale subdomain the
  three sites use, which changes more often than the pattern does.

- Reward counts are matched in sixteen languages and in any script's digits, but the
  list of words is finite. A site that ships a language not in it keeps the counts
  its own markup does not label — the structural hooks (`data-testid`, a class name,
  an element that exists only to hold a count) are language-independent and carry
  most of the load, and the prose rules are what fills the gaps. `REWARD_WORDS` in
  `content.js` is the list to add to.
- Sites you add yourself get grayscale, reward counts and notification badges,
  which need no site table, and a paused front page only where the feed can be
  found by its shape. Comment hiding, the recommendation rails and the route rules
  are per-site work and are not available for them. The settings page says this
  where the site is added rather than leaving it to be discovered.
- Decaf runs in same-origin subframes, so YouTube's live chat is treated as part
  of the page. Cross-origin embeds are outside its host permissions and are left
  alone — a Reddit video embed keeps its colour.
- Picture-in-Picture escapes the grayscale entirely: the browser paints that
  window from the raw frames, not from the filtered element. Decaf grants the page
  colour when PiP opens rather than leaving the page and the little window
  disagreeing.

- Only the twelve sites above are covered out of the box, on desktop Chrome 105+. Other browsers and mobile are untested.
