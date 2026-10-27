// The Pomodoro timer: focus, then a short break, with a long break after every few focus sessions.
// One timer for the whole deck, kept in ~/Library/Application Support/fifine/pomodoro.json so a
// running session (it stores when the phase ends, not a countdown) and today's count survive a
// Control Deck restart.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_DIR } from './lib/paths.mjs';

const STATE_FILE = join(STATE_DIR, 'pomodoro.json');
const SOUNDS = fileURLToPath(new URL('./sounds/', import.meta.url));
const ALERT_MS = 6000; // how long the key blinks after a phase ends

export const DEFAULTS = { focus: 25, short: 5, long: 15, every: 4, sound: 'chime', volume: 0.7 };

const day = (now) => new Date(now).toLocaleDateString('sv'); // YYYY-MM-DD, local time

export function createTimer(log) {
  let s = load();

  function load() {
    try {
      const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      return { ...saved, settings: { ...DEFAULTS, ...saved.settings } };
    } catch {
      return { settings: { ...DEFAULTS }, date: day(Date.now()), today: 0, cycle: 0, ...idle('focus', DEFAULTS) };
    }
  }

  function save() {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`);
    } catch (e) {
      log('saving state failed', e.message);
    }
  }

  function idle(phase, settings) {
    const total = settings[phase] * 60;
    return { phase, status: 'idle', total, remaining: total, endsAt: null, alertUntil: 0 };
  }

  function start(phase, now) {
    const total = s.settings[phase] * 60;
    Object.assign(s, { phase, status: 'running', total, remaining: total, endsAt: now + total * 1000 });
  }

  function play(sound) {
    const { sound: choice, volume } = s.settings;
    if (choice === 'none') return;
    const file = choice === 'chime' ? join(SOUNDS, `${sound}.wav`) : `/System/Library/Sounds/${choice}.aiff`;
    if (!existsSync(file)) return log('no such sound', file);
    execFile('/usr/bin/afplay', ['-v', String(volume), file], (err) => err && log('afplay failed', err.message));
  }

  // Today's count starts again at midnight.
  function rollover(now) {
    if (s.date === day(now)) return;
    Object.assign(s, { date: day(now), today: 0, cycle: 0 });
    save();
  }

  // A finished focus session counts and starts its break; a finished break waits for a press to
  // start the next focus session.
  function finish(now) {
    if (s.phase === 'focus') {
      s.today += 1;
      s.cycle += 1;
      const long = s.cycle >= s.settings.every;
      if (long) s.cycle = 0;
      start(long ? 'long' : 'short', now);
      play('focus-done');
    } else {
      Object.assign(s, idle('focus', s.settings));
      play('break-done');
    }
    s.alertUntil = now + ALERT_MS;
    log('phase done, now', s.phase, s.status, 'today', s.today);
    save();
  }

  return {
    // advances the timer; call often
    tick(now = Date.now()) {
      rollover(now);
      if (s.status === 'running' && now >= s.endsAt) finish(now);
    },

    // What the key should show right now (see draw.mjs render()).
    snapshot(now = Date.now()) {
      const remaining = s.status === 'running' ? Math.max(0, Math.ceil((s.endsAt - now) / 1000)) : Math.ceil(s.remaining);
      // blinks: on for half a second, off for half a second
      const alert = now < s.alertUntil && Math.floor((s.alertUntil - now) / 500) % 2 === 1;
      return { phase: s.phase, status: s.status, remaining, total: s.total, today: s.today, alert };
    },

    alerting: (now = Date.now()) => now < s.alertUntil,

    // A press: quiets a blinking key, otherwise starts, pauses or resumes. A break that just
    // started on its own keeps running when the press only meant to quiet it.
    press(now = Date.now()) {
      const wasAlerting = now < s.alertUntil;
      s.alertUntil = 0;
      if (wasAlerting && s.status === 'running') return save();
      if (s.status === 'running') Object.assign(s, { status: 'paused', remaining: (s.endsAt - now) / 1000, endsAt: null });
      else if (s.status === 'paused') Object.assign(s, { status: 'running', endsAt: now + s.remaining * 1000 });
      else start(s.phase, now);
      save();
    },

    // A long press: back to a fresh focus session, not started. Doesn't count.
    reset() {
      Object.assign(s, idle('focus', s.settings));
      save();
    },

    settings: () => s.settings,

    // New durations apply to a phase that hasn't started yet; a running one finishes as it began.
    configure(settings) {
      const next = { ...DEFAULTS, ...s.settings };
      for (const k of ['focus', 'short', 'long', 'every']) {
        const n = Math.round(Number(settings?.[k]));
        if (n >= 1 && n <= 99) next[k] = n;
      }
      if (typeof settings?.sound === 'string') next.sound = settings.sound;
      const v = Number(settings?.volume);
      if (settings?.volume !== undefined && v >= 0 && v <= 1) next.volume = v;
      if (JSON.stringify(next) === JSON.stringify(s.settings)) return;
      s.settings = next;
      if (s.status === 'idle') Object.assign(s, idle(s.phase, next));
      save();
    },

    preview: (sound) => play(sound),
  };
}
