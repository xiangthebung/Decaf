# Changelog

Dates are the day the version was tagged. Every entry says what changed for the
person using Decaf, not what changed in the code.

## 1.1.0

### Fixed

- **The privacy policy names every permission Decaf asks for.** `scripting` was
  in the manifest and absent from the policy, which is the one document where
  that gap matters most. The policy is also now exact about what the content
  scripts look at: as well as text and accessible labels, they measure the size,
  position and background colour of elements, because that is how a notification
  badge is told from an ordinary part of the page.

- **The two keyboard shortcuts are written down.** `Alt+Shift+D` opens Decaf and
  `Alt+Shift+S` opens its settings. Both have been in the extension since it
  shipped and were in no document at all.

- **The keyboard is not dropped when a button does its job.** Several controls in
  Decaf work by disappearing: turning it on for a site takes away "Turn on here",
  confirming a Lock takes away the Lock button, removing an added site takes away
  the row it was in. Each of those left the keyboard on nothing, at the top of
  the page, with no announcement — worst on the settings page, which is long.
  Every one of them now hands the keyboard to the control that took its place.

- **Two open Decaf windows no longer undo each other.** A settings tab left open
  while you changed something in the popup would, on its next switch, write back
  everything it had been holding since it was opened — so turning LinkedIn off in
  the settings tab could quietly turn Reddit back on. Changes are now written
  against what storage says at the moment of the write rather than against
  whatever the page last read.

- **A switch no longer keeps a change that was never saved.** The failed-write
  path was careful to put the page back; the failed-*read* path was not, and left
  the switch showing a change that had not reached storage. Both now behave the
  same way. Chrome's own error text has also stopped appearing on screen: those
  strings are written for developers, and "QUOTA_BYTES quota exceeded" is not an
  answer to anybody.

- **A site you added yourself cannot be added twice.** The check that catches a
  duplicate only ever knew the twelve sites built in, so re-typing the address of
  a site you had added went straight past it, asked Chrome again for a permission
  it already held, and then wrote the entry fresh — which switched a site you had
  deliberately turned off back on, and reset its name to the bare address, while
  the page said it had been added. A `www.` spelling of a site already on the
  list is now recognised as the same site too.

- **Reset says why it is unavailable during a Lock.** It was the one control a
  Lock holds that used a real `disabled`, so it dropped out of the keyboard order
  and out of a screen reader entirely — and because a disabled button fires no
  click in a browser, the message explaining that a Lock was on could never
  actually appear. It behaves like every other held control now: still reachable,
  still answers, and says what is holding it.

- **Two controls are legible again.** The address example in the add-a-site box
  was dimmed twice over and sat at 2.96:1, below what body text needs. A switch
  held by a Lock had its whole outline dimmed to 1.9:1, under what a control
  boundary needs — and since that switch is still focusable and still operable,
  the exemption for an inactive control never applied to it. The outline now
  stays at full strength and only the surface inside it reads as held.

- **The popup no longer describes work it is not doing.** Three separate states
  were being answered with the same reassuring sentence. A tab that was already
  open when Decaf was installed or updated has no Decaf in it until it is
  reloaded once — and on exactly that tab, where Decaf was demonstrably doing
  nothing, the popup said "This feed is paused". It now says the tab needs a
  reload, and says so on the page card as well. A tab Chrome would not identify
  was reported as a site Decaf does not cover, which turned a failure to find
  anything out into a confident claim about the page; it now says what actually
  happened. And the popup used to open, before it had read anything at all, on a
  card naming a site called "Site" that was "Off", beside a switch labelled "On"
  that was unchecked — it now states nothing until it knows something.

- **A game board stays a game board wherever the site puts it.** The two fixes
  that stopped Decaf draining LinkedIn's Queens board and marking its cells as
  notification badges were both held behind a check that the address began
  `/games`. That made them exactly as durable as one regular expression written
  for one site out of twelve: move the prefix and the crowns would have vanished
  again, with every test for the bug still passing, because every one of them is
  written against a `/games/` address. A board the site names is now recognised
  on any page it appears on, because the name is the evidence and nothing else on
  the web is called that. Guessing a board from its shape — a grid of equally
  sized square cells, which on a feed is just as likely to be a grid of photos —
  still happens only on a game page.

- **"Show in color" now shows the picture in colour.** The grant was a list of
  per-site selectors and nothing else, and a list like that goes quietly out of
  date: Instagram's post page has had no `<article>` on it for some time, so the
  two rules naming one matched nothing and asking for colour on Instagram had
  never once worked. A site you added yourself had no entry at all, and never
  could have. And even where the rule was right, a filter drains everything
  beneath it — one wrapper above a video kept the video grey, and a poster frame
  held in front of it stayed grey over a video already in full colour. All three
  look identical from where you are sitting: the offer disappears, the page does
  not change. Decaf now measures the picture on the page in front of you, and
  shows that one, along with whatever is painted across it.

- **Reward counts written in camelCase are masked again.** Bounding the reward words so `view` stopped matching `preview` also blinded Decaf to every name written in camelCase — which is how styled-components name things. TikTok labels each count on a video page that way, and fourteen of them a page were left showing. Only the live audit saw it: every unit test used hyphenated or lowercase class names.

- **Decaf no longer empties a conversation.** Facebook's Marketplace was matched
  by its whole path prefix, which also covers the Marketplace inbox, an open
  conversation with a buyer, and a listing you opened on purpose — all read as
  endless feeds and emptied. Separately, and for longer, the docked Messenger
  window sits on top of every Facebook page including the feed, and its
  conversation pane is a `role="main"` of its own, so the page-level selector
  reached in and hid every message: what was left was the window's own
  background gradient where the chat had been. Marketplace is now named surface
  by surface, and — so that no future mistake in the route table can do this
  again — anything that announces itself as a dialog, a chat or a conversation
  is refused as a feed container and never counted as holding feed items.

- **A copy of Decaf that outlives its extension now takes itself down.** When an
  extension is reloaded, updated or removed, Chrome leaves its content scripts
  running in every open tab with dead APIs. That zombie kept enforcing whatever
  settings it had last read — after an update it fought the freshly injected
  copy, re-emptying a feed the moment a hold had opened it, so the button
  appeared to do nothing. Every copy now checks once a second that its extension
  is still there and clears out the moment it is not. (Tabs that already carry a
  zombie from an older build need one last reload to be rid of it.)
- **Decaf can no longer run twice in one tab.** A tab that navigated in the
  moment between an update and the re-injection into open tabs got two copies —
  two observers, two cards. A second copy now yields to a living first one, and
  succeeds a dead one.
- **The popup paints before it asks the page anything.** Its first render used
  to wait on a reply from the tab's content script, so a busy tab — a feed
  mid-load is exactly that — could hold the popup blank.
- **Decaf came back after pressing Back.** A page restored from Chrome's
  back/forward cache had every Decaf class stripped from it and no observer
  watching, so the feed came back in full colour and stayed that way until the
  page was reloaded by hand. Back-navigation is one of the most common ways
  anyone arrives at a feed.
- **A Facebook video someone shared with you is a video, not a feed.**
  `facebook.com/watch/?v=…` — the permalink every shared Facebook video and every
  `fb.watch` link lands on — was being emptied and replaced with the paused-feed
  card.
- **A hashtag or location page on Instagram is a page you asked for.** Both were
  being paused as if they were Explore.
- **A subreddit front page is now paused.** It is an endless ranked list of posts,
  structurally identical to `/r/all`, and leaving it out paused the smaller half
  of the problem. The thread under a post is unaffected.
- **Twitch's `/login`, `/signup` and `/dashboard`** were read as channels.
- **Counts are masked outside English.** Every rule was English-only and
  ASCII-digit-only, so "1.234.567 Aufrufe" and "265 Kommentare" were left fully
  visible. Around eighty terms across sixteen languages, Unicode digits, and the
  separators and magnitude suffixes that locales actually use.
- **A number in a post is no longer mistaken for a count.** A bare number now has
  to belong to a control, which is the rule the documentation always described.
  A LinkedIn post whose own line was a year came out as a dash.
- **A carousel still says where you are.** "Preview image 3 of 5" was being
  rewritten to "Preview image — of —", which removed the one thing that label
  existed to tell a screen reader user.
- **A control left holding only a dash now has a name.** Most screen readers do
  not speak an em dash, so an Instagram like button announced as an unnamed
  button.
- **Long sessions no longer grow the tab's memory.** Everything Decaf touched was
  held in memory forever; on a virtualized feed that kept every recycled post,
  and its pictures, out of reach of the garbage collector.
- **The page can no longer hand itself a pass.** A synthetic press on the hold
  button, or Decaf's own class name on a site's markup, both used to work.
- **The badge count stays readable.** Muting it with transparency dropped it
  below the contrast Decaf promises to keep.
- **The page still scrolls.** Making room for the card forced `overflow: visible`
  onto every ancestor, including the element some sites scroll.
- **A modal is still anchored to the window.** The grayscale filter was landing on
  arbitrary wrappers, which re-anchored and clipped anything fixed inside them.
- **A failed save no longer lies.** The switch stayed where you dragged it while
  storage said otherwise.
- **A Lock is not ended by a clock that moved**, its floor rises to cover anything
  switched on while it runs, and it can no longer be escaped by clearing the
  day's pass count.

### Added

- **One-hour and four-hour Locks.** The smallest commitment used to be a whole
  day. An hour of it is a focus session that never freezes you.
- **Set a site aside for 30 minutes or 2 hours**, instead of switching it off and
  finding eight months later that it was never switched back on.
- **A counter while a pass is running**, in the corner of the page, with a button
  to pause the feed again early — the only control in Decaf that lets you spend
  less than you asked for.
- **Sites you add yourself.** Grayscale, reward counts and notification badges
  work anywhere; the front page is paused where the feed can be recognised by its
  shape. Chrome asks for that one site at the moment you add it.
- **A first-run panel** that says where the toolbar icon is, what the card is, and
  that the button has to be held.
- **The toolbar now describes the tab you are looking at** rather than the whole
  browser, including how long is left on a running pass.
- **Decaf now works in tabs that were already open** when it was installed or
  updated, instead of waiting for the next navigation.
- **The popup says so when it could not find the feed** on a page, instead of
  asserting that it is paused.
- **A way out of the card**: one line that opens settings, for anyone who cannot
  sustain a press.
- **Passes today and this week**, in the popup and in settings. One sentence, no
  streaks, no goals.
- **Reset everything to defaults.**
- **Keyboard shortcuts**: `Alt+Shift+D` opens Decaf, `Alt+Shift+S` opens settings.
- **Same-origin subframes are treated as part of the page**, so YouTube's live
  chat is no longer in full colour beside a grayscaled player.

### Changed

- Letting go of the hold early now says so, instead of silently resetting.
- Under reduced motion the ring advances in eight steps and the wait counts down
  out loud, instead of being drawn already finished for the whole hold.
- Both extension pages support Windows High Contrast, respect the browser's font
  size, keep one tab stop per radio group with arrow-key selection, and say every
  switch's state in words as well as colour.
- The Lock confirmation lists what it is about to freeze.
- Only the feed is blanked while settings load, rather than the whole page —
  which used to happen even to people who had Decaf switched off.
- Picture-in-Picture is offered colour, since the filter cannot reach it.

## 1.0.0

First release. Twelve sites, four switches, the pause card, the hold, and the
Lock.
