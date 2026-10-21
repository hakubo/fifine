# Zoom Meeting

Shows your next Zoom meeting from an hour before it starts, with a countdown, and joins it when you press the key.

| Look | Meaning | Press |
| --- | --- | --- |
| Zoom app icon | No Zoom meeting under way or starting within the hour | Opens Zoom |
| Blue border, `in 42:05` + meeting title | A meeting starts within the hour; the timer counts down every second | Joins it in Zoom |
| Green border, `now` + meeting title | The meeting has started and hasn't ended | Joins it in Zoom |
| Grey, `no calendar access` | macOS calendar access was refused | Opens Zoom |

- While a meeting is under way the key keeps showing it until the next one is 5 minutes away, then switches to the next one.
- If you're already in a Zoom meeting, pressing the key un-minimizes and brings all Zoom windows to the front instead, switching to the Space of a full-screen shared screen if there is one. This needs Accessibility access for Control Deck (System Settings → Privacy & Security → Accessibility); without it the key just switches to Zoom. The exception is a next meeting starting within 5 minutes: then the press joins it, and Zoom asks whether to leave the current one.
- All-day events and events you've declined are skipped.
- The Zoom link is taken from the event's URL, location or notes. `https://…zoom.us/j/<id>?pwd=…` links open straight in the Zoom app (`zoommtg://`), skipping the browser.

Meetings come from **macOS Calendar**, so the calendar you have meetings in must be added there. For Google, go to System Settings → Internet Accounts → Google and turn on Calendars.

## How it works

`calendar/calendar-events.swift` is built at install time into `fifine Calendar.app`, a background app (no Dock icon) that prints today's events as JSON using EventKit. The plugin starts it with `open` once a minute while a Zoom key is on the deck.

It runs as its own app because macOS won't prompt for calendar access on behalf of Control Deck (it lacks the macOS 14 full-access usage key). The first run asks for access for **fifine Calendar**; the answer lives in System Settings → Privacy & Security → Calendars. The app is ad-hoc signed, so a reinstall may ask again.

## Install

```sh
node scripts/install.mjs zoom
```

Needs the Xcode command line tools (`xcode-select --install`) to build the calendar helper.

Log: `~/Library/Logs/fifine/zoom.log`.
