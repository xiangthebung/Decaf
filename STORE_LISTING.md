# Chrome Web Store listing copy

## Name

Decaf

## Summary

Calms feed-driven sites: no reward counts, no notification badges, no endless feeds. Everything you open on purpose still works.

## Category

Productivity

## Single purpose

Decaf removes the compulsive parts of a fixed list of feed-driven websites — the endless feed, the reward counts, the recommendation rails and the notification badges — while leaving the rest of each site working normally.

## Detailed description

Decaf is not a blocker. It never freezes a page, never takes over the window, and never leaves you stuck on a screen you cannot get past. Search, messages, profiles, subscriptions, settings and anything you open on purpose keep working.

On every site it covers:

- The endless feed is replaced by a short notice. Everything around it — the header, the sidebar, your lists — stays exactly where it was.
- Reward counts are replaced with a dash: likes, views, followers, upvotes, bookmarks, favourites, viewers and members. The replacement is made in the page and in the labels a screen reader announces, not just visually.
- Images and video are grayscale, including the video you opened on purpose. One tap on the page gives that page its colour back until you leave it, and the next page asks again.
- Recommendation rails and notification badges are removed.

When you do want the feed, hold the button on the notice. The first pass of the day takes three seconds and gives you five minutes; the next takes seven, then eleven, then fifteen. Nothing is hidden behind a countdown you cannot skip — the wait is the whole mechanism, and it is short.

Lock holds every Decaf setting in place for one day, one week or thirty days, and adds four seconds to every hold while it runs. It is there for the moment you know you are about to talk yourself out of it.

Each of the twelve site families is a separate switch, and so is each of the individual changes, so you can leave the counts on YouTube and take the feed off Reddit if that is the shape of the problem.

Sites covered: YouTube, Instagram, TikTok, X (Twitter), Reddit, Facebook, Threads, Bluesky, Twitch, Pinterest, LinkedIn and Google News.

Decaf is free, has no accounts, and makes no network requests of its own. Your settings are stored on this device.

## Permission justifications

- **storage**: Keeps your settings on this device — which sites are on, which individual changes are on, when a five-minute pass expires and when a Lock ends. Nothing is sent anywhere.
- **activeTab**: The popup shows a switch for the site in the tab you are looking at, which means it has to read that tab's address. It reads the address only while the popup is open, and only for the tab you opened it from.
- **alarms**: A Lock has to end at the time it was set to end. The service worker is stopped and restarted constantly by Chrome, so an alarm is the only thing that survives long enough to release a thirty-day Lock. It is also how a five-minute pass expires without polling.
- **Site access (the twelve listed sites only)**: The content script is declared for the sites Decaf changes and nowhere else. There is no `host_permissions` entry and no all-sites access; on any other website Decaf does not run at all.

Note for the reviewer, if asked: Decaf runs at `document_start` so that the feed is gone before it paints. A script that waited for `DOMContentLoaded` would show the feed first and then remove it, which is worse than not running.

## Privacy disclosures for the Developer Dashboard

Decaf does not collect or transmit user data. It makes no network requests, contains no analytics, no remote code and no third-party services. The only data it stores is the settings above, in `chrome.storage`, on the user's own device.

Answer the data-collection questions as **no data collected**, and certify that data is not sold, is not used for advertising or credit decisions, and is used only for the extension's single purpose. Link the publicly hosted `PRIVACY_POLICY.md` content in the dashboard.

## Required visual assets

Regenerate all of these with `npm run build && node tools/store-shots.js`. They are rendered from `dist/` — the same directory `npm run zip` packages — in a real Chromium with the extension loaded, so they cannot drift from what is submitted.

- Store icon: `icons/icon128.png`.
- Screenshots, 1280x800:
  - `store-assets/01-paused-1280x800.png` — the feed replaced, the rest of the page intact.
  - `store-assets/02-popup-1280x800.png` — the popup: the switch for this site, and Lock.
  - `store-assets/03-settings-1280x800.png` — the settings page.
  - `store-assets/04-hold-1280x800.png` — a hold in progress, part way round the ring.
- Small promotional tile: `store-assets/promo-440x280.png`.

The three screenshots that show a website use a stand-in page and say so on the image itself. The stand-in carries the real DOM hooks the supported sites use, so the extension does its actual work on it, but no site's branding is depicted and no real page has its numbers altered in a picture.

## Claims to avoid

Do not describe Decaf as a blocker, and do not imply the feed cannot be reached — it can, in three seconds. Do not claim it works on any site beyond the twelve listed. Do not show a screenshot of a named website with its reward counts replaced.
