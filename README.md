# fifine Control Deck plugins

Plugins for the [fifine](https://fifinemicrophone.com) Control Deck app (a StreamDock build) on macOS, written for the fifine D6 and usable on any deck the app drives. Each plugin is independent: install only the ones you want.

| Plugin | Keys | What it does |
| --- | --- | --- |
| [Agent Sessions](plugins/agent-sessions) | Claude Session, T3 Session | Shows your Claude Code sessions and T3 Code threads, flags the ones waiting for you, opens them on press, and approves a permission prompt in two presses |
| [Claude Usage](plugins/claude-usage) | Claude Usage | Shows how much of your Claude plan's 5-hour and 7-day limits you've used |
| [Zoom Meeting](plugins/zoom) | Zoom | Counts down to your next Zoom meeting from macOS Calendar and joins it on press |
| [Slack Badge](plugins/slack) | Slack | Shows Slack's unread badge and opens Slack |
| [Spotify](plugins/spotify) | Spotify, Spotify Next | Album cover with play/pause, and skip to the next track |
| [Loxone Light](plugins/loxone-light) | Light Mood | Cycles a Loxone room's light moods and shows the active one |
| [Pomodoro](plugins/pomodoro) | Pomodoro | Focus/break timer with a progress ring, today's pomodoro count and a chime |

Each plugin's README covers what its key shows, what it needs, and how it works.

## Requirements

- macOS and the fifine Control Deck app
- [Node.js](https://nodejs.org) 20 or later, to run the installer (Control Deck runs the plugins with its own Node)
- Whatever the plugin talks to: Claude Code, T3 Code, Zoom, Slack, Spotify or the `lox` CLI. Zoom also needs the Xcode command line tools (`xcode-select --install`).

## Install

```sh
git clone https://github.com/hakubo/fifine.git
cd fifine
node scripts/install.mjs spotify slack       # the plugins you want
node scripts/install.mjs --all               # or all of them
```

The installer builds each plugin into `dist/com.jakubolek.fifine.<plugin>.sdPlugin`, copies it to `~/Library/Application Support/HotSpot/StreamDock/plugins/`, and restarts Control Deck. Then drag the keys from the plugin's category onto your deck.

Run the same command again to update. To remove plugins:

```sh
node scripts/install.mjs spotify --uninstall
```

Agent Sessions and Claude Usage also change `~/.claude/settings.json` (hooks, and a Claude Code plugin folder). The installer backs it up to `settings.json.bak-fifine` first and undoes its changes on `--uninstall`. Both point at files in this checkout, so keep the checkout where it is.

`npm run build` builds every plugin into `dist/` without installing anything.

## Layout

```
plugins/<name>/
  manifest.json   Control Deck manifest (actions, icons)
  plugin/         the plugin process; index.mjs is the entry point
  pi/             optional settings panels shown in Control Deck (Property Inspector pages)
  build.mjs       draws the icons at install time, builds extras, edits Claude settings if needed
  README.md
shared/           copied into every plugin as plugin/lib/
  streamdock.mjs  WebSocket to Control Deck, logging, show-only-what-changed key updates
  png.mjs         dependency-free PNG encoder/decoder and key tiles
  font.mjs        pixel font for keys drawn without the host's title text
  text.mjs        word-wrap for key titles
  paths.mjs       log, cache and state folders
scripts/
  install.mjs     build, install, uninstall
```

Plugins write logs to `~/Library/Logs/fifine/<plugin>.log`, caches to `~/Library/Caches/fifine/` and state worth keeping to `~/Library/Application Support/fifine/`. The Claude-related plugins keep their state in `~/.claude/fifine/`.

Icons for Zoom, Slack and Spotify are taken from the installed apps at build time and aren't part of this repo. Without the app, the key gets a plain coloured tile.

## Adding a plugin

1. Create `plugins/<name>/` with a `manifest.json` (action UUIDs `com.jakubolek.fifine.<name>.<action>`), `plugin/index.mjs` and a `build.mjs` that exports `build({ images, plugin })` and writes every image the manifest names.
2. In `index.mjs`, use `createPlugin('<name>')` from `./lib/streamdock.mjs`: register handlers with `p.action(uuid, { willAppear, willDisappear, keyDown, keyUp })`, draw with `p.show(contexts, { image, title })`, then call `p.connect()`.
3. For per-key settings, add an HTML page under `pi/` and set the action's `PropertyInspectorPath` to it. Control Deck uses the Stream Deck property inspector API: the page defines `connectElgatoStreamDeckSocket(port, uuid, registerEvent, info, actionInfo)` and saves with `setSettings`. The plugin reads them from `willAppear` and `didReceiveSettings`. `plugins/loxone-light/pi/index.html` is a working example.
4. Run `node scripts/install.mjs <name>`.

## License

[MIT](LICENSE)
