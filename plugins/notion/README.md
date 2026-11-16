# Notion

Shows the Notion icon with your unread Inbox count, and opens Notion when you press it. Replaces a plain "open app" shortcut to Notion.

| Look | Meaning | Press |
| --- | --- | --- |
| Notion icon | Inbox has no unread notifications | Opens Notion |
| Notion icon, red badge with a number | Unread Inbox notifications, as Notion counts them (shown up to 99) | Opens Notion |
| Grey Notion icon | The Notion desktop app isn't running | Opens Notion |

## How it works

The key copies the badge Notion puts on its Dock icon, read every 3 seconds with `lsappinfo info -only StatusLabel -app notion.id` while a Notion key is on the deck. No Notion token is needed; Notion's public API has no Inbox.

Notion has no link or keyboard shortcut that opens the Inbox, so the key only opens the app.

## Install

```sh
node scripts/install.mjs notion
```

The key uses the icon of your installed Notion app, read at install time; reinstall after installing Notion if it shows a plain dark tile.

Log: `~/Library/Logs/fifine/notion.log`.
