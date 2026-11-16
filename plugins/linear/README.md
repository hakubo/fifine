# Linear

Two keys that read Linear's API:

- **Linear**: the Linear icon with the number of unread notifications in your inbox. Tap opens Linear, hold opens the inbox. Replaces a plain "open app" shortcut to Linear.
- **Linear Cycle**: how far your team's active cycle is, and how long it has left. Tap opens the cycle, filtered to your issues.

## Linear

| Look | Meaning |
| --- | --- |
| Linear icon | Inbox has no unread notifications |
| Linear icon, red badge with a number | Unread inbox notifications (shown up to 99) |
| Linear icon, red dot | No API key set: Linear's own Dock dot, without a count |
| Grey Linear icon | The Linear desktop app isn't running |

| Press | Does |
| --- | --- |
| Tap | Opens Linear |
| Hold | Opens the inbox (`linear://<workspace>/inbox`) |

## Linear Cycle

| Look | Meaning |
| --- | --- |
| `C42`, `62%`, `5D LEFT` | Cycle 42 is 62% done, with 5 days left (hours on the last day) |
| Indigo ring | Linear's cycle progress: completed work, plus a quarter for work in progress |
| Thin grey inner ring | How much of the cycle's time has passed |
| Amber ring | Progress is more than 15 points behind the time passed |
| Green ring | Everything in the cycle is done |
| `NO CYCLE` | The team has no active cycle |
| `SET KEY` / `ERROR` | No API key, or the API call failed (the panel shows why) |

Pick the team in the key's panel; without one it shows your first team. Progress is read every 5 minutes, and again after a press.

Tap opens the active cycle with only the issues assigned to you. Linear has no link for that, so the first press creates a private custom view named "My issues in the active cycle" in the team (filter: cycle is active, assignee is me) and later presses reuse it. Creating it needs an API key with write access; with a read-only key the press opens the whole cycle instead. You can change the view's icon or layout in Linear, but keep its name.

## Setup

Both keys share one Linear personal API key:

1. In Linear, go to Settings → Security & access → Personal API keys and create a key. Read access is enough, except Linear Cycle needs write access once, to create its view.
2. Select either Linear key in Control Deck and paste the key into **API key**. The panel shows what it found once it connects.

The key is saved in `~/Library/Application Support/fifine/linear.json` (readable only by you), not in Control Deck's settings.

## How it works

For the inbox badge, the plugin asks `https://api.linear.app/graphql` for `notificationsUnreadCount` (and the workspace's `urlKey`, for the inbox link) every 30 seconds while a Linear key is on the deck. It also reads Linear's Dock badge with `lsappinfo` every 3 seconds and asks the API again as soon as that changes, so new notifications show up quickly while the desktop app is running.

Without an API key the inbox link uses the workspace of the last window the desktop app had open.

## Install

```sh
node scripts/install.mjs linear
```

The key uses the icon of your installed Linear app, read at install time; reinstall after installing Linear if it shows a plain indigo tile.

Log: `~/Library/Logs/fifine/linear.log`.
