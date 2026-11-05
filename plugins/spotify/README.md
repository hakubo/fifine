# Spotify

Two keys: **Spotify** (album cover; press opens Spotify, hold plays/pauses, double tap skips) and **Spotify Next** (skip).

| Key | Look | Meaning |
| --- | --- | --- |
| Spotify | Album cover | Playing |
| Spotify | Dimmed cover with a ▶ | Paused |
| Spotify | Spotify icon | Running, cover still loading or the track has none |
| Spotify | Grey Spotify icon | The Spotify desktop app isn't running |
| Spotify Next | Green ⏭ | Playing |
| Spotify Next | White ⏭ | Paused |
| Spotify Next | Grey ⏭ | Spotify isn't running |

On the **Spotify** key, a press brings Spotify to the front (opening it if needed), holding it for half a second plays/pauses, and a double tap skips to the next track. A single press waits 0.3 s to rule out a double tap. Pressing **Spotify Next** skips. While Spotify isn't running, hold, double tap and Next all open it.

## How it works

Both keys talk to the Spotify desktop app through its AppleScript dictionary, polled every 2 seconds while a Spotify key is on the deck. No Spotify login, developer app or Premium is needed. The first time, macOS asks whether fifine Control Deck may control Spotify; allow it (System Settings → Privacy & Security → Automation).

The cover is downloaded from Spotify's image CDN and resized with `sips`.

Adding the track to Liked Songs isn't supported: AppleScript can't do it, so it would need the Spotify Web API (a developer app and a one-time login).

## Install

```sh
node scripts/install.mjs spotify
```

Log: `~/Library/Logs/fifine/spotify.log`.
