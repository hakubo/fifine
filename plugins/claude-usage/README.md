# AI Usage

One key with how much of your **Claude** (left) and **Antigravity** (right) limits you've used.

```
┌────────────────────┐
│  ╭────╮   ╭────╮   │   outer ring: 5-hour window (number in middle)
│  │ 43 │   │ 18 │   │   inner ring: weekly limit
│  ╰────╯   ╰────╯   │
│  - 62%    - 51%    │   weekly limit used
│ ▬ 2h14   ▬ 4h05    │   5-hour window resets in
│ - 3d4h   - 5d2h    │   weekly limit resets in
└────────────────────┘
```

| Look | Meaning |
| --- | --- |
| Blue ring | Under 70% of that limit used |
| Orange ring, number and reset time | 70% or more: getting close |
| Red ring, number and reset time | 90% or more: nearly rate-limited |
| Middle number | 5-hour % |
| `- 62%` line | Weekly % (matches the inner ring) |
| Grey | No reading from T3, or T3's reading is over 30 minutes old |
| `–` | No reading, or that window hasn't started yet (no reset time) |

Antigravity has separate pools (Claude & GPT, Gemini, …). Each Antigravity ring shows the most-used pool of that kind, with that pool's reset time.

| Press | Does |
| --- | --- |
| Tap | Opens T3 Code |
| Double tap | Brings T3 Code forward and presses ⌘N for a new thread. Needs Accessibility access for Control Deck (System Settings → Privacy & Security → Accessibility) |

## Where the numbers come from

[T3 Code](https://t3.codes) checks each provider's rate limits and caches them in `~/.t3/caches/claudeAgent.json` and `~/.t3/caches/antigravity.json` (`usageLimits`). The plugin watches those files and redraws the key when they change, and every 30 seconds to update the countdowns. A window whose reset time has passed shows 0% straight away.

Limitations:

- T3 only refreshes the files while it's running. When it's closed the key greys out after 30 minutes.
- This is T3's internal cache, not a public API. If a T3 update changes it, the key shows grey `–`.

## Install

```sh
node scripts/install.mjs claude-usage
```

Older versions read `~/.claude/fifine/usage.json`, written by a Claude Code plugin the installer added to `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. Installing this version takes that entry back out (backing the file up to `settings.json.bak-fifine` first).

Log: `~/Library/Logs/fifine/claude-usage.log`.
