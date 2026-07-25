# blokamine

blokamine keeps supported social, media, and discovery sites usable while making reward cues less prominent.

## Default experience

- Media is 75% desaturated.
- Reward counts and notification badges are hidden.
- Stronger friction—blur, upside-down media, and media removal—is opt-in.
- Comment threads and live chat are hidden by default on Instagram, YouTube, TikTok, and Twitch; Reddit comments stay visible.
- Social and entertainment sites are enabled by default.
- Work and messaging sites (Discord, Google Search, LinkedIn, WhatsApp, and Messenger) are off by default.

The settings page is organized around a simple core experience, optional stronger friction, where the extension applies, and site-specific controls. Changes use an explicit draft-and-save flow.

There is no feed interception, artificial loading boundary, or scroll manipulation. Some optional site controls reduce discovery surfaces, while dynamic content is styled after the host site inserts it without delaying navigation or media requests.

Outside Focus Lock, an opened long-form YouTube video stays normal by default. You can enable **Make opened videos less rewarding** to apply the same media treatment to the active player. Search results, thumbnails, recommendations, and Shorts keep their configured visual treatment. When that option is enabled, opening a long-form video pauses behind a quick reflection step: choose normal playback for educational viewing, keep your configured friction, or leave the video paused. Focus Lock uses the same choices and scopes them to the current lock. A non-Focus choice lasts for that video during the current page session.

The extension popup provides Focus Lock and a one-time ten-minute break. A break requires entering the displayed six-character code, and the break cooldown is configured in Settings.

## Privacy

blokamine stores settings and Focus Lock state locally in Chrome. It does not collect browsing activity, page content, or usage analytics, and it does not send data to a remote server. The extension has no remote code or external network dependency.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the folder containing `manifest.json`.
5. Open **Settings**, then refresh supported tabs after edits.
