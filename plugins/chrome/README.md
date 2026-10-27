# Chrome Windows

A Chrome key that cycles through your open Google Chrome windows.

| State | Press |
| --- | --- |
| Chrome isn't running | Opens Chrome |
| Chrome is running but another app is in front | Brings Chrome to the front, on the window you used last |
| Chrome is in front | Brings the next window (in the order they were opened) to the front; keep pressing to visit every window |

Minimized and hidden windows are skipped.

## How it works

Each press runs an AppleScript that raises the window after the current front one, ordered by Chrome's window id (the order the windows were opened), wrapping around after the last. The first press asks macOS for permission to let fifine Control Deck control Google Chrome and System Events (System Settings → Privacy & Security → Automation).

## Install

```sh
node scripts/install.mjs chrome
```

The key uses the icon of your installed Chrome, read at install time.

Log: `~/Library/Logs/fifine/chrome.log`.
