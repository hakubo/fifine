// "Zoom" key: shows the next Zoom meeting from an hour before it starts, with a countdown timer,
// or the one under way, and joins it on press. With no such meeting the key just opens Zoom.
//
// Events come from macOS Calendar through "fifine Calendar.app" (EventKit, built by
// build.mjs from calendar-events.swift). The Zoom link is looked for in the event's URL,
// location and notes, in that order.

import { execFile } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataUrl, tile } from './lib/png.mjs';
import { wrap } from './lib/text.mjs';

const HELPER = fileURLToPath(new URL('fifine Calendar.app', import.meta.url));
const OUT = join(tmpdir(), 'fifine-calendar.json');
const AHEAD_MS = 60 * 60 * 1000; // how early an upcoming meeting shows up
export const SOON_MS = 5 * 60 * 1000; // an upcoming meeting this close takes over from one under way
const ZOOM_LINK = /https?:\/\/(?:[\w-]+\.)*zoom(?:gov)?\.(?:us|com)\/(?:j|w|my)\/[^\s"'<>)\]]+/i;

const IMG = {
  // the Zoom app icon, from build.mjs
  idle: dataUrl(readFileSync(fileURLToPath(new URL('../images/zoom-key@2x.png', import.meta.url)))),
  soon: dataUrl(tile({ bg: '#0f2147', accent: '#2d8cff', dot: '#2d8cff' })),
  live: dataUrl(tile({ bg: '#0f2147', accent: '#2fbf71', dot: '#2fbf71' })),
  error: dataUrl(tile({ bg: '#1b1b1f', dot: '#5b5b66' })),
};

// { status: 'ok' | 'denied' | 'error' | 'loading', events: [...] }
// Started through `open` (not directly) so the app is its own process in macOS's eyes; -W waits for it.
export function fetchEvents() {
  return new Promise((resolve) => {
    rmSync(OUT, { force: true });
    execFile('/usr/bin/open', ['-g', '-n', '-W', '--stdout', OUT, HELPER], { timeout: 60_000 }, (err, _stdout, stderr) => {
      if (err) return resolve({ status: 'error', events: [], error: String(stderr || err.message) });
      try {
        const out = JSON.parse(readFileSync(OUT, 'utf8'));
        resolve({ status: out.status, events: out.events ?? [] });
      } catch (e) {
        resolve({ status: 'error', events: [], error: e.message });
      }
    });
  });
}

const zoomLink = (e) => [e.url, e.location, e.notes].map((s) => String(s || '').match(ZOOM_LINK)?.[0]).find(Boolean) ?? null;

// The meeting to show, among Zoom meetings that haven't ended and start within the hour: the next
// one if it starts within 5 minutes (so it wins over one that's wrapping up), otherwise the latest
// one under way, otherwise the next one.
export function currentMeeting(events, now = Date.now()) {
  const meetings = events
    .filter((e) => e.end > now && e.start - now <= AHEAD_MS)
    .map((e) => ({ ...e, link: zoomLink(e) }))
    .filter((e) => e.link);
  const next = meetings.filter((e) => e.start > now).sort((a, b) => a.start - b.start)[0];
  const live = meetings.filter((e) => e.start <= now).sort((a, b) => b.start - a.start)[0];
  if (next && next.start - now <= SOON_MS) return next;
  return live ?? next ?? null;
}

// https://acme.zoom.us/j/123?pwd=x -> zoommtg://acme.zoom.us/join?confno=123&pwd=x, which opens
// the Zoom app straight into the meeting instead of going through the browser.
export function joinUrl(link) {
  try {
    const u = new URL(link);
    const id = u.pathname.match(/^\/(?:j|w)\/(\d+)/)?.[1];
    if (!id) return link;
    const q = new URLSearchParams({ action: 'join', confno: id });
    if (u.searchParams.get('pwd')) q.set('pwd', u.searchParams.get('pwd'));
    return `zoommtg://${u.hostname}/join?${q}`;
  } catch {
    return link;
  }
}

// "now", or a countdown to the start: "in 42:05"
export function when(m, now) {
  if (m.start <= now) return 'now';
  const s = Math.ceil((m.start - now) / 1000);
  return `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// What the key shows: { image, title }.
export function zoomKey(state, now = Date.now()) {
  const m = state.status === 'ok' ? currentMeeting(state.events, now) : null;
  if (m) return { image: m.start <= now ? IMG.live : IMG.soon, title: [when(m, now), ...wrap((m.title || 'Zoom meeting').replace(/\s+/g, ' '), 4)].join('\n') };
  if (state.status === 'denied') return { image: IMG.error, title: 'Zoom\n\nno calendar\naccess' };
  return { image: IMG.idle, title: '' };
}
