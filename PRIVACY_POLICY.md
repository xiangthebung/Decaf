# Decaf Privacy Policy

Effective: July 28, 2026

Decaf calms feed-driven sites: no reward counts, no notification badges, no endless feeds. It does all of that inside your browser. It has no server, no account, no analytics, and it makes no network requests of its own.

## What is stored, and where

Everything Decaf keeps lives in `chrome.storage.local` on the device you are using. **Nothing syncs.** That is a deliberate choice rather than an oversight: the list of sites you have asked Decaf to calm says something about your habits, and syncing it through an account would put that list somewhere other than your own machine for no benefit to you.

What is in there:

- your four switches — pause feeds, hide comments and replies, turn media upside down, hide notification counts
- which of the twelve supported sites Decaf is switched on for
- an active Lock, if you set one, and when it ends
- **how many five-minute passes you have taken today, counted per site.** This is the only thing Decaf records about what you did, it exists so the hold time can escalate from 3 seconds to 7 to 11 to 15, and it resets overnight.
- which page you granted colour to, for as long as you are on it

There is no history, no page content, no list of what you looked at, and no record of yesterday.

## What Decaf reads

Decaf's content scripts run on the twelve hosts listed in its manifest and nowhere else. It does not hold a `tabs` permission and cannot see the pages you visit on any other site.

On those twelve, it reads the page in order to change it: the address, so it can tell a feed apart from a page you opened on purpose; and the text and accessible labels of elements, so it can find the reward numbers. Sites write those numbers in every shape there is — the word inside the number, beside it, in front of it, on the icon next to it, or nowhere at all — which is why the matching has to look at labels rather than just at text.

None of what it reads is stored, and none of it is transmitted. It is examined, the element is rewritten, and that is the end of it.

## No network activity

Decaf declares no host permissions for network access, loads no remote code, has no remote configuration, and contacts no analytics service. You can check this rather than take it on trust: the whole extension is in this repository, and searching it for `fetch`, `XMLHttpRequest`, `sendBeacon` or `WebSocket` turns up nothing.

There is nothing to pay for, so there is no payment processor and no billing email.

## Permissions, and why each one

- **`storage`** — the settings and the pass count above.
- **`activeTab`** — so the popup can tell which of the twelve sites you are currently on, and show the right switch. It grants no access to any other tab.
- **`alarms`** — to notice when a Lock ends. A Lock has to expire on time even if the browser was closed in between, and an alarm is how a service worker finds out.
- **Content scripts on twelve hosts** — the only way to change a page is to be on it. Messaging apps are deliberately excluded: a conversation is not a feed.

## Retention and deletion

Settings stay until you change them or uninstall. The pass count resets overnight. Uninstalling the extension removes everything; there is nothing held anywhere else to delete.

One exception worth stating plainly: while a **Lock** is running, Decaf will not let you turn its switches off, because that is the entire point of a Lock. It does not stop you removing the extension, and removing it removes the Lock with it.

## Limited Use

Decaf's use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Page content and the address of the current page are used only to provide the calming behaviour described above, are not stored, are not transferred off the device, are not sold, and are not used for advertising or credit assessment.

## Changes

Material changes to this policy will be disclosed before they take effect, and the effective date above will be updated.

## Contact

Questions or privacy concerns: **xiangli3625@gmail.com**.
