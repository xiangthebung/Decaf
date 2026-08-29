# State

Volatile. Everything here has a date on it. Anything that is true regardless of
when you are reading lives in `README.md` instead — the navigation map, the
design rules, and the known limits are all there.

Last surveyed: 2026-08-29, at `161ed2d`.

## How to verify it, and what each command actually proves

| Command | What it proves | Needs |
| --- | --- | --- |
| `npm test` | The pure logic in `core.js`, both extension pages driven through jsdom, the page runtime against stand-in sites, and the packaging rules. It does **not** prove anything about layout: jsdom measures nothing, so a selector that matches in here may still match nothing in a browser. | nothing |
| `npm run build` | Every file the manifest, the HTML, the JS imports and `background.js` name is present in `dist/`. Fails the build if one is missing. | nothing |
| `node scripts/negative-test.mjs` | That the reference check above still fails when it should. Run it after touching `verifyReferences`. | nothing |
| `DECAF_BROWSER=1 npm test` | Four checks in a real Chromium with `dist/` loaded, including a genuine three-second hold and a Reddit thread being capped rather than emptied. | Playwright |
| `node tools/verify-deep.js` | The one that matters after changing behaviour. Every setting on its own, every route of all twelve sites, both extension pages through every state, the whole Lock contract, the toolbar icon, and a click-through of each site. Reads everything back out of the engine. | Playwright |
| `node tools/layout.js` | The notice inside twenty hostile parent layouts, and on a stand-in for every supported site. Slow — several minutes. | Playwright |
| `DECAF_LIVE=1 npm test` | The feed selectors against the real sites, over the network. | Playwright, network |
| `node tools/audit.js` | Every friction, site by site, on the real signed-in sites. | a Chrome started with `--remote-debugging-port` |

## Measured on 2026-08-29

- `npm test` — 187 tests, 181 pass, 6 skipped, 0 fail. The six skips are the
  browser and live-network checks, which opt in through environment variables.
- `DECAF_BROWSER=1 npm test` — 185 pass, 2 skipped, 0 fail. The two remaining
  skips need `DECAF_LIVE=1`.
- `npm run build` — 23 files, v1.1.0.
- `node scripts/negative-test.mjs` — passes.
- `node tools/verify-deep.js` — **90/90 checks** in a real Chromium.

## Not verified, and what it would take

Stated plainly because these do not become verified by going unmentioned.

- **The real sites.** Everything above runs against stand-ins. `tools/audit.js`
  is the only check that reads the live, signed-in sites, and it needs a Chrome
  started by hand with `--remote-debugging-port`. Nothing in this repository can
  tell you whether a site redesigned itself this morning.
- **`DECAF_LIVE=1`** has not been run in this pass. It is the cheapest signal
  that a feed selector has gone stale.
- **How any of it looks.** No tool here judges whether the card reads well, the
  greys sit right, or the hold feels like three seconds. `tools/layout.js`
  proves the page does not *move*, which is a different claim.
- **The unreachable branch in `paintRadios`** on the settings page. `chosenHours`
  can only ever hold one of `LOCK_DURATIONS`, so it cannot be reached, and a test
  written for it could only pass vacuously. See the comment there.

## Where the bug ledger is

In the commit messages, deliberately, and they should stay that way.

The house brief asks for symptom, root cause, why it was not caught, and the
class of mistake. Every non-trivial commit here already carries all four, at
length, attached to the diff that fixed it — which is the one place that cannot
drift away from the code it describes. A second copy in a file would answer the
same question as `git log` and be wrong first.

`git log --grep` is the index. Some worth knowing about before changing anything:

| Look for | The class it belongs to |
| --- | --- |
| `Judge a game board by the board` | Strong local evidence being overruled by weak remote evidence. A guard held behind a route regex is only as good as the route table. |
| `Say nothing about a page rather than something untrue` | A probe with three answers and two branches. The unhandled answer got the most confident message. |
| `Write settings against storage` | A patch that names whole keys, built from a stale copy. Re-reading before writing does not help if the thing written was already built. |
| `See the queens again` | Two colours that differ only in hue are the same colour after grayscale. "It went grey" and "it vanished" are the same bug. |
| `Never empty a conversation` | An over-broad route prefix (`/marketplace` also matches `/marketplace/inbox`). Promises that rest on a route table hold only while every rule is right. |
| `See camelCase reward names again` | Bounding a word to stop `view` matching `preview` also stopped it matching `viewCount`. Only the live audit saw it; every unit test used lowercase. |

## Ideas tried and rejected

| Idea | Why not |
| --- | --- |
| Removing the feed container instead of emptying it | Takes it out of the site's grid or flex layout and drags the sidebars into the content column. Did exactly that to Reddit once. |
| Finding and removing Instagram's "More posts from this account" grid | Drawn by the same renderer as the post; the removal made Instagram stutter badly enough to be worse than the grid. |
| Keeping the colour grant as a list of per-site selectors | A list goes out of date silently and cannot cover a site someone added. Three separate failures all looked identical from outside: the button appears to do nothing. Replaced by measuring the page. |
| Building `dist/` by emptying it first | The unpacked extension *is* that directory. For a few milliseconds of every build there was no manifest on disk. Now it syncs only what differs. |
| A blanket `*://*/*` host permission for added sites | Shows every installer a warning about every site they will ever visit, for a feature most will never use. Asked per origin instead, when the site is added. |
| Testing the `paintRadios` fallback | Unreachable, so the test could only pass vacuously. A mutation confirmed it caught nothing, and it was deleted. |

## Traps

- **`dist/` is a live extension, not a staging directory.** Anything that empties
  it breaks a browser session in progress. `scripts/negative-test.mjs` builds into
  a throwaway directory for this reason, and says so at length.
- **jsdom lays nothing out.** `hasLayout()` is false there, so every code path
  behind it is invisible to a unit test. A test that needs one has to supply its
  own measurements — see the grid test in `test/runtime.test.js`. Supplying them
  also wakes the notice placement, which wants `document.elementFromPoint`; jsdom
  has no such method.
- **A `\b` inside a template literal is a backspace character, not a word
  boundary.** A built regex silently stopped being the pattern that was written
  and the assertion passed. Prefer `includes` over `new RegExp` with a template.
- **The popup's health probe has three answers, not two.** A reply, a reply
  saying `anchor: "none"`, and no reply at all. The third is the commonest.
