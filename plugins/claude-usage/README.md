# Claude Usage

Shows how much of your Claude plan's 5-hour and 7-day limits you've used.

```
┌────────────────────┐
│                    │
│ 5h 43%      2h14m  │   5-hour window: used, time until it resets
│ (█████░░░░░░░░░░)  │
│ 7d 23%       3d4h  │   7-day window: used, time until it resets
│ (███░░░░░░░░░░░░)  │
│                    │
└────────────────────┘
```

| Look | Meaning |
| --- | --- |
| Blue bar, white % | Under 70% of that window used |
| Orange bar and % | 70% or more: getting close to the limit |
| Red bar and % | 90% or more: nearly rate-limited |
| Grey, **no data** | No reading yet (see below) |

The plugin draws the whole key, text included, with a small pixel font. Press the key to open [claude.ai/settings/usage](https://claude.ai/settings/usage).

## Where the numbers come from

`claude-plugin/` is a small Claude Code plugin, **fifine-usage**. The installer adds its folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, so Claude Code loads it in every session, including `claude rc` and `claude -p` ones.

1. After each turn, Claude Code tells the plugin the account's rate-limit readings (the `session.measure` event). It reads them once at session start, too.
2. When the 5-hour or 7-day figure moves, the plugin writes both percentages and their reset times to `~/.claude/fifine/usage.json`.
3. The Control Deck plugin watches `usage.json` and redraws the key. Every 30 seconds it also refreshes the countdown, and a window whose reset time has passed shows 0%.

Your status line isn't touched.

Limitations:

- Readings arrive only while some Claude Code session is taking turns. With nothing running, the key keeps the last reading, adjusted for any window that has since reset.
- Only Claude subscription sessions (Pro/Max/Team) report rate limits. API-key, Bedrock and Vertex sessions don't, so they never overwrite a reading.
- The limits are per account, so every session reports the same numbers. The latest reading wins.
- The plugin uses Claude Code's plugin hooks API, which is early access and may change between Claude Code releases. If the key stops updating after an upgrade, run `claude plugin validate plugins/claude-usage/claude-plugin` and `claude plugin test plugins/claude-usage/claude-plugin`.

## Install

```sh
node scripts/install.mjs claude-usage
```

This also adds `claude-plugin/` to `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (backed up to `settings.json.bak-fifine` first), keeping any folders already listed. The usage appears after the next turn in any Claude Code session started after the install.

Log: `~/Library/Logs/fifine/claude-usage.log`.
