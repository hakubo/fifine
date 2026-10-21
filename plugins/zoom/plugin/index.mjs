// Zoom plugin: shows the next Zoom meeting from macOS Calendar with a countdown; press to join.

import { createPlugin } from './lib/streamdock.mjs';
import { SOON_MS, currentMeeting, fetchEvents, joinUrl, zoomKey } from './zoom.mjs';

const ACTION = 'com.jakubolek.fifine.zoom.join';

const p = createPlugin('zoom');
const keys = new Set();
let calendar = { status: 'loading', events: [] };
let fetching = false;
let fetchedAt = 0;

function render() {
  if (keys.size) p.show(keys, zoomKey(calendar));
}

// Only reads the calendar while a Zoom key is on the deck, so nobody gets a permission prompt
// for a key they don't use. The first run waits for that prompt, hence no overlapping runs.
async function refreshCalendar() {
  if (keys.size === 0 || fetching) return;
  fetching = true;
  fetchedAt = Date.now();
  const next = await fetchEvents();
  fetching = false;
  if (next.status !== calendar.status) p.log('calendar', next.status, next.error || `${next.events.length} events`);
  // keep the last good reading through a one-off failure
  if (next.status === 'ok' || calendar.status !== 'ok') calendar = next;
  render();
}

// Zoom runs its CptHost helper only while you're in a meeting.
const inZoomMeeting = async () => (await p.run('/usr/bin/pgrep', ['-x', 'CptHost'])) !== null;

// Un-minimizes and raises every Zoom window (meeting, chat, participants...), then brings Zoom
// to the front. A full-screen window (e.g. a shared screen) sits in its own Space, which raising
// doesn't reach: it's made Zoom's main window last, so activating Zoom switches to that Space.
// Raising needs Accessibility access for Control Deck; without it, just activates.
async function raiseZoom() {
  const ok = await p.osa(`tell application "System Events" to tell process "zoom.us"
    set fullScreen to missing value
    repeat with w in windows
      try
        if value of attribute "AXMinimized" of w then set value of attribute "AXMinimized" of w to false
      end try
      perform action "AXRaise" of w
      try
        if value of attribute "AXFullScreen" of w then set fullScreen to w
      end try
    end repeat
    if fullScreen is not missing value then
      perform action "AXRaise" of fullScreen
      set value of attribute "AXMain" of fullScreen to true
    end if
    set frontmost to true
  end tell`);
  if (ok === null) await p.open('-a', 'zoom.us');
}

// In a meeting, the key brings Zoom's windows forward, unless the next meeting starts within
// 5 minutes: then it joins that one (Zoom asks whether to leave the current one).
async function press() {
  const now = Date.now();
  const m = calendar.status === 'ok' ? currentMeeting(calendar.events, now) : null;
  const nextSoon = m && m.start > now && m.start - now <= SOON_MS;
  if (!nextSoon && (await inZoomMeeting())) {
    p.log('zoom press', 'raise meeting windows');
    return raiseZoom();
  }
  p.log('zoom press', m ? `${m.title} ${m.link}` : 'open app');
  if (m) await p.open(joinUrl(m.link));
  else await p.open('-a', 'zoom.us');
}

p.action(ACTION, {
  willAppear: (ctx) => {
    keys.add(ctx);
    render();
    // a profile flip re-shows the key every few seconds; the minute poll keeps it current
    if (calendar.status !== 'ok' || Date.now() - fetchedAt > 60_000) refreshCalendar();
  },
  willDisappear: (ctx) => keys.delete(ctx),
  keyDown: press,
});

setInterval(refreshCalendar, 60_000);
setInterval(render, 1000); // "in 42:05" countdown
p.connect();
