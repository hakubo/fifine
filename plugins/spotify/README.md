# Spotify

Two keys: **Spotify** (album cover, play/pause) and **Spotify Next** (skip).

| Key | Look | Meaning | Press |
| --- | --- | --- | --- |
| Spotify | Album cover | Playing | Pauses |
| Spotify | Dimmed cover with a ▶ | Paused | Plays |
| Spotify | Spotify icon | Running, cover still loading or the track has none | Play/pause |
| Spotify | Grey Spotify icon | The Spotify desktop app isn't running | Opens Spotify |
| Spotify Next | Green ⏭ | Playing | Next track |
| Spotify Next | White ⏭ | Paused | Next track |
| Spotify Next | Grey ⏭ | Spotify isn't running | Opens Spotify |

## How it works

Both keys talk to the Spotify desktop app through its AppleScript dictionary, polled every 2 seconds while a Spotify key is on the deck. No Spotify login, developer app or Premium is needed. The first time, macOS asks whether fifine Control Deck may control Spotify; allow it (System Settings → Privacy & Security → Automation).

The cover is downloaded from Spotify's image CDN and resized with `sips`.

Adding the track to Liked Songs isn't supported: AppleScript can't do it, so it would need the Spotify Web API (a developer app and a one-time login).

## Install

```sh
node scripts/install.mjs spotify
```

Log: `~/Library/Logs/fifine/spotify.log`.
