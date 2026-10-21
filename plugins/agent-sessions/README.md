# Agent Sessions

Puts your Claude Code sessions and T3 Code threads on the deck. Each key shows one session, its colour shows whether it needs you, and pressing it opens the session. A waiting permission prompt can be approved from the deck in two presses.

Actions: **Claude Session** and **T3 Session**. Each key is one slot; add as many as you want.

## Claude Session key

Each key shows the project and the session's first prompt; the colour shows the status.

| Colour | Meaning |
| --- | --- |
| Red border, blinking | Waiting on a permission prompt or question |
| Amber border | Claude finished; goes quiet once you've opened it |
| Blue dot | Claude is running |
| Grey dot | Session open, nothing happening |

Pressing a key:

- for `claude rc` (Remote Control) sessions, opens the session in the Claude desktop app (`claude://claude.ai/code/session_…`);
- for plain local sessions, focuses the [Ghostty](https://ghostty.org) split it runs in;
- on the overflow key (`+N more`), opens the desktop app's "waiting for you" list.

Keys are filled in row/column order: oldest session first while every session has a key, most urgent first once they don't fit.

Control Deck gives plugins no way to change pages (`switchToProfile` and `gotoPage` do nothing), so if you spread session keys over several pages, use the built-in **Next page** / **Previous page** actions to move between them.

### How it works

- `hooks/session-hook.mjs` is a Claude Code hook (SessionStart, UserPromptSubmit, PostToolUse, Notification, Stop, SessionEnd). It writes `~/.claude/fifine/sessions/<id>.json` with the status, cwd, tty, the owning `claude` pid and, under `claude rc`, the remote session id.
- The plugin's main source is Claude Code's own registry, `~/.claude/sessions/<pid>.json`: one file per running session with a live status (`busy` / `idle` / `waiting`) and, under `claude rc`, the remote session id. It covers sessions started before the hook was installed. The hook adds "finished" (Stop), which the registry doesn't track.
- The first prompt is read from the session's transcript in `~/.claude/projects/`. The desktop app's session titles are generated server-side and aren't stored locally, so they aren't used.
- Sessions whose `claude` process has exited are dropped.
- Ghostty has no tty property in its AppleScript dictionary. To focus a split, the plugin briefly sets that tty's title to a marker, finds the terminal with that name, focuses it, then restores the old title.

## Approving a permission prompt from the deck

For `claude rc` sessions, a red key that's waiting on a permission prompt works in two presses:

1. **First press** opens the session in the Claude desktop app. The key turns green and shows what would be allowed (`Allow?`, the tool, and the command or file).
2. **Second press**, within 2 minutes and while the Claude desktop app is still in front, allows it by pressing ⌘↩ in the app. Control Deck shows its OK tick.

You can still answer in the app as usual. Only "allow" is supported; deny in the app. The keystroke needs Accessibility access for Control Deck (System Settings → Privacy & Security → Accessibility).

How it works: `hooks/permission-hook.mjs` is a `PermissionRequest` hook. It writes the request to `~/.claude/fifine/pending/<session>.json` and stays alive until the prompt is answered (the session hook clears the pending file on the next prompt, tool result or stop), the session ends, or 55 minutes pass. It never answers the prompt itself. It only waits in `claude rc` sessions; in a terminal session it exits at once, so it can never hold up a prompt.

The desktop app doesn't say which session it is showing, so "open" means the deck opened that session less than 2 minutes ago and Claude is the frontmost app (checked with `lsappinfo`, which needs no Accessibility permission).

## T3 Session key

**T3 Session** keys work like Claude Session keys, for T3 Code threads (Codex threads included) while the T3 Code desktop app is running. The overflow key (`+N more`) opens T3 Code.

- Colours: red when a thread waits on an approval or question, blue while it runs, and green (instead of amber) when it finished and nobody has opened it since, in T3 Code or from the deck.
- A thread drops off 12 hours after its last activity; subagent threads aren't shown.
- Each key draws the repo name in large type, with the project's emoji above it if you picked one in T3 Code's project settings, and the thread title underneath.
- Pressing the key opens the thread in T3 Code (`t3code://threads/<environment>/<thread>`).
- An approval (command, file read, file edit, permission) works in two presses, like `claude rc` sessions: the first opens the thread and turns the key green with `Allow?`; the second, within 2 minutes and while T3 Code is in front, accepts it. Questions only open the thread.
- While any T3 Session key is on the deck, Claude Code processes that T3 Code spawned are left off the Claude Session keys, so each thread has one key.

How it works: `plugin/t3.mjs` connects to T3 Code's local server like its own web client. On first use it runs `~/.t3/bin/t3 auth session issue` for a 30-day token with the `orchestration:read` and `orchestration:operate` scopes (stored in `~/.claude/fifine/t3-token.json`, renewed a day before expiry or when refused). It subscribes to `orchestration.subscribeShell` for thread status and answers approvals with `orchestration.dispatchCommand`. This is T3 Code's internal protocol (orchestration protocol 2), so a T3 Code update can break it; check the log for `t3` lines. Revoke the token with `t3 auth session list` / `t3 auth session revoke <id>`.

`scripts/t3-probe.mjs` prints what the server reports: `T3_TOKEN=<token> node plugins/agent-sessions/scripts/t3-probe.mjs [seconds]`.

## Install

```sh
node scripts/install.mjs agent-sessions
```

Besides installing the Control Deck plugin, this registers both hooks in `~/.claude/settings.json` (after backing it up to `settings.json.bak-fifine`). The hooks run from this checkout, so keep it where it is, or re-run the install after moving it. Restart running Claude Code sessions afterwards.

Requires the [Claude desktop app](https://claude.ai/download) for `claude rc` sessions, Ghostty for local ones, and the T3 Code desktop app for T3 Session keys.

Log: `~/Library/Logs/fifine/agent-sessions.log`.
