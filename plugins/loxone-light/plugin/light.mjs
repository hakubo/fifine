// Loxone light key: cycles a room's light moods on press and shows the active one.
//
// Talks to the Miniserver through the `lox` CLI. State comes from a long-running `lox stream`, so
// changes made from a wall switch or the Loxone app show up straight away.
//
// Each key controls one Lighting Controller, picked in the key's settings in Control Deck (see
// ../pi/index.html). Its settings: { uuid, room, control, label }, where `control` is the
// controller's name and `label` (the key's first line) defaults to the room.

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { dataUrl, tile } from './lib/png.mjs';
import { wrap } from './lib/text.mjs';

const OFF_MOOD = 778; // Loxone's built-in "off" mood id
const ENV = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` };

// the first `lox` on PATH or in the Homebrew folders (Control Deck starts plugins with a bare PATH)
const LOX = ENV.PATH.split(':').map((d) => join(d, 'lox')).find((f) => existsSync(f)) || 'lox';

const lox = (args, timeout = 5000) =>
  new Promise((resolve) => {
    execFile(LOX, args, { env: ENV, timeout }, (err, stdout, stderr) => resolve(err ? { error: String(stderr || err.message).trim() } : { stdout }));
  });

export const configured = (light) => Boolean(light?.uuid && light?.room);

// Every Lighting Controller on the Miniserver: [{ uuid, name, room }], or { error }.
export async function listControllers() {
  const res = await lox(['ls', '-t', 'LightControllerV2', '-o', 'json'], 15_000);
  if (res.error) return { error: res.error };
  try {
    return JSON.parse(res.stdout).map(({ uuid, name, room }) => ({ uuid, name, room }));
  } catch (e) {
    return { error: e.message };
  }
}

const IMG = {
  on: dataUrl(tile({ bg: '#2e2410', accent: '#f5c542', dot: '#f5c542' })),
  off: dataUrl(tile({ bg: '#1b1b1f', dot: '#5b5b66' })),
  unknown: dataUrl(tile({ bg: '#0e0e10', dot: '#3a3a42' })),
};

// Keeps `lox stream` running and calls onChange({ active: [ids], moods: {id: name} }) on every update.
// Returns stop().
export function watchLight(light, onChange, log = () => {}) {
  const state = { active: null, moods: {} };
  let child;
  let stopped = false;
  let retry;

  const start = () => {
    child = spawn(LOX, ['stream', '-t', 'LightControllerV2', '-r', light.room, '--initial', '-o', 'json'], { env: ENV });
    createInterface({ input: child.stdout }).on('line', (line) => {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return; // "Streaming state changes…" banner
      }
      // a room can have more than one controller; settings from before names were stored match the room
      if (ev.room !== light.room || (light.control && ev.control !== light.control)) return;
      try {
        if (ev.state === 'activeMoods') state.active = JSON.parse(ev.value);
        else if (ev.state === 'moodList') state.moods = Object.fromEntries(JSON.parse(ev.value).map((m) => [m.id, m.name]));
        else return;
      } catch {
        return;
      }
      onChange({ ...state });
    });
    child.stderr.on('data', (d) => {
      const msg = String(d).trim();
      if (!msg.startsWith('Streaming')) log('lox stream', msg.slice(0, 200));
    });
    child.on('error', (e) => log('lox stream failed', e.message));
    child.on('exit', (code) => {
      if (stopped) return;
      log('lox stream exited', code);
      state.active = null;
      onChange({ ...state });
      retry = setTimeout(start, 5000);
    });
  };
  start();

  return () => {
    stopped = true;
    clearTimeout(retry);
    child?.kill();
  };
}

// Resolves with an error message, or null.
export async function nextMood(light) {
  if (!configured(light)) return 'no light controller picked';
  return (await lox(['light', 'mood', light.uuid, 'plus'])).error ?? null;
}

// What the key shows: { image, title }.
export function lightKey(light, state) {
  if (!configured(light)) return { image: IMG.unknown, title: 'Loxone\n\npick a light\nin settings' };
  const label = light.label || light.room;
  if (!state?.active) return { image: IMG.unknown, title: `${label}\n\n…` };
  const on = state.active.filter((id) => id !== OFF_MOOD);
  if (on.length === 0) return { image: IMG.off, title: `${label}\n\nOff` };
  const names = on.map((id) => state.moods[id] ?? `Mood ${id}`).join(' + ');
  return { image: IMG.on, title: [label, '', ...wrap(names, 3)].join('\n') };
}
