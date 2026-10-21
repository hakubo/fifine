# Loxone Light

Cycles a [Loxone](https://www.loxone.com) light's moods and shows which one is on. Add one key per light you want on the deck.

| Look | Meaning | Press |
| --- | --- | --- |
| Amber border + mood name | A light mood is on (e.g. `Relax`) | Next mood |
| Grey, `Off` | The built-in "off" mood is active | Next mood |
| Dark, `…` | No reading from the Miniserver yet | Next mood |
| Dark, `pick a light in settings` | The key has no light yet | Nothing |

## Setup

The plugin uses the [`lox` CLI](https://github.com/discostu105/lox) (`brew install discostu105/lox/lox`), already set up to reach your Miniserver (`lox setup`). It looks for `lox` on `PATH`, in `/opt/homebrew/bin` and in `/usr/local/bin`.

Select the key in Control Deck to open its settings:

- **Light**: every Lighting Controller on your Miniserver, as `Room · Controller`. ↻ reloads the list.
- **Key label**: the key's first line; defaults to the room name.

Settings are saved per key by Control Deck.

## How it works

- Pressing runs `lox light mood <controller uuid> plus`.
- The state comes from `lox stream`, one per light, which runs while the light's key is on the deck and restarts after 5 s if it drops. Changes from a wall switch or the Loxone app show up straight away.
- The light list in settings comes from `lox ls -t LightControllerV2`, which the plugin runs when the settings panel opens (`pi/index.html`).

## Install

```sh
node scripts/install.mjs loxone-light
```

Log: `~/Library/Logs/fifine/loxone-light.log`.
