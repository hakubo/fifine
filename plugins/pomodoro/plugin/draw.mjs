// Draws the Pomodoro key. Everything is in the image (the host's title stays empty):
//
//        FOCUS           phase label, in the phase colour
//   ( ( 18:42 ) )        time left, inside a ring that fills clockwise as the phase runs
//        ● 3             tomato + pomodoros finished today
//
// Drawn with the shared canvas and stroke font in lib/draw.mjs.

import { canvas as makeCanvas, DIGIT_W as D } from './lib/draw.mjs';
import { dataUrl } from './lib/png.mjs';

const SIZE = 144;
const C = SIZE / 2;
const BG = '#141418';
const TRACK = '#26262d';
const TEXT = '#f4f4f6';
const DIM = '#7c7c88';
const RING_R = 61;
const RING_W = 10;

export const PHASES = {
  focus: { label: 'FOCUS', color: '#ff5f4a' },
  short: { label: 'BREAK', color: '#2fd08a' },
  long: { label: 'LONG BREAK', color: '#4c9dff' },
};
const TOMATO = '#ff5f4a';
const LEAF = '#3ccf6e';

const canvas = () => makeCanvas(SIZE);

const clock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.min(99, Math.floor(s / 60))).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// A tomato (red dot with a leaf) and today's count, centred under the time.
function today(c, count, dim) {
  const n = String(count);
  const h = 11;
  const w = 12 + 5 + n.length * D * h + (n.length - 1) * 0.22 * h;
  const x = C - w / 2;
  const y = 101;
  c.circle(x + 6, y + 6.5, 6, TOMATO, dim ? 0.55 : 1);
    c.circle(x + 6, y + 1, 2.4, LEAF, dim ? 0.55 : 1);
  c.text(x + 17 + (w - 17) / 2, y + 1, n, { h, stroke: 2.2, color: dim ? DIM : TEXT });
}

// What the key shows for a timer snapshot:
//   { phase: 'focus'|'short'|'long', status: 'idle'|'running'|'paused', remaining (s), total (s),
//     today (count), alert (bool: blink on, right after a phase ended) }
export function render({ phase, status, remaining, total, today: count, alert }) {
  const { label, color } = PHASES[phase];
  const c = canvas();
  const running = status === 'running';
  c.fill(BG, color, alert ? 0.55 : running ? 0.16 : 0.07);

  const progress = total ? 1 - remaining / total : 0;
  c.arc(RING_R, RING_W, 1, TRACK);
  const head = c.arc(RING_R, RING_W, progress, color, status === 'paused' ? 0.45 : 1);
  if (head && running) c.circle(head[0], head[1], RING_W / 2 - 2.2, '#ffffff', 0.9);

  const shown = status === 'paused' ? 'PAUSED' : label;
  const labelH = shown.length > 6 ? 8 : 10;
  c.text(C, 43 - labelH, shown, { h: labelH, stroke: 2, color: status === 'idle' ? DIM : color, track: 0.3 });

  c.text(C, 58, clock(remaining), { h: 28, stroke: 4.4, color: status === 'running' || alert ? TEXT : DIM, track: 0.16 });

  today(c, count, status === 'idle' && !alert);
  return c.png();
}

const images = new Map(); // what the key shows -> data url
export function keyImage(state) {
  const key = JSON.stringify(state);
  if (!images.has(key)) {
    if (images.size > 300) images.clear();
    images.set(key, dataUrl(render(state)));
  }
  return images.get(key);
}
