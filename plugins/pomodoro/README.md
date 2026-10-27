# Pomodoro

A focus timer on a key. A ring fills clockwise as the phase runs, the time left sits in the middle, and a tomato under it counts the pomodoros you've finished today. A chime plays when a phase ends.

| Look | Meaning | Press | Hold |
| --- | --- | --- | --- |
| Grey `FOCUS 25:00` | Ready for a focus session | Starts it | Resets |
| Red ring, `FOCUS` | Focus session running | Pauses | Resets |
| Green ring, `BREAK` / blue ring, `LONG BREAK` | Break running | Pauses | Resets |
| Dimmed ring, `PAUSED` | Paused | Resumes | Resets |
| Blinking, glowing key | A phase just ended (for 6 s) | Quiets it | Resets |

- A finished focus session counts, plays the chime and starts its break straight away. Every 4th one gets a long break.
- A finished break plays a different chime and waits: press to start the next focus session.
- Hold (0.7 s) goes back to a fresh focus session, not started. A reset session doesn't count.
- Today's count starts again at midnight.
- The timer keeps running when the key isn't on the current page or profile, and survives a Control Deck restart.

## Settings

Select the key in Control Deck to set focus, short and long break lengths (minutes), how many pomodoros before a long break, the sound (the built-in Chime, a macOS system sound, or none) and its volume. ▶ plays the sound. The deck has one timer, so the settings apply to every Pomodoro key; new durations take effect from the next phase.

## How it works

- State is kept in `~/Library/Application Support/fifine/pomodoro.json`. A running phase is stored as the time it ends, so nothing drifts while Control Deck is closed; a phase that ended meanwhile finishes on the next start.
- The key is drawn whole (ring, text and tomato) into a 144 px image with a small stroke font, redrawn only when what it shows changes.
- The Chime is two short bell arpeggios synthesized into WAV files at build time. Sounds play with `afplay`.

## Install

```sh
node scripts/install.mjs pomodoro
```

Log: `~/Library/Logs/fifine/pomodoro.log`.
