# Slack Badge

Shows the Slack icon with Slack's unread badge, and opens Slack when you press it.

| Look | Meaning | Press |
| --- | --- | --- |
| Slack icon | No badge on Slack's Dock icon | Opens Slack |
| Slack icon, red badge with a number | Unread DMs, mentions and thread replies, as Slack counts them (shown up to 99) | Opens Slack |
| Slack icon, red dot | Other unread messages (only if Slack is set to badge them) | Opens Slack |
| Grey Slack icon | The Slack desktop app isn't running | Opens Slack |

## How it works

The key copies the badge Slack puts on its Dock icon, read every 3 seconds with `lsappinfo info -only StatusLabel -app com.tinyspeck.slackmacgap` while a Slack key is on the deck. No Slack token or app install is needed.

What gets counted is up to Slack: set it in Slack → Settings → Notifications (badge for DMs, mentions and keywords). The key can't tell "threads waiting on my reply" apart from other unreads; that would need the Slack API.

## Install

```sh
node scripts/install.mjs slack
```

The key uses the icon of your installed Slack app, read at install time; reinstall after installing Slack if it shows a plain purple tile.

Log: `~/Library/Logs/fifine/slack.log`.
