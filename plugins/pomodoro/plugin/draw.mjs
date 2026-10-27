// Draws the Pomodoro key. Everything is in the image (the host's title stays empty):
//
//        FOCUS           phase label, in the phase colour
//   ( ( 18:42 ) )        time left, inside a ring that fills clockwise as the phase runs
//        ● 3             tomato + pomodoros finished today
//
// Text uses a small stroke font (round-capped lines and arcs) rendered with distance-based
// antialiasing, so it stays smooth at any size, unlike the pixel font in lib/font.mjs.

import { dataUrl, encode, hex } from './lib/png.mjs';

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

// ---- stroke font: glyphs are polylines in a box 1 unit tall, `w` wide; y grows downwards.
// arc(cx, cy, rx, ry, from, to) in degrees: 0 is right, 90 down, 270 up; runs from -> to.
function arc(cx, cy, rx, ry, from, to) {
  const n = Math.max(6, Math.ceil(Math.abs(to - from) / 10));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}
const D = 0.62; // digit width; every digit is as wide, so the time doesn't jitter as it counts

const GLYPHS = {
  0: { w: D, s: [[...arc(D / 2, 0.31, D / 2, 0.31, 180, 360), ...arc(D / 2, 0.69, D / 2, 0.31, 0, 180), [0, 0.31]]] },
  1: { w: D, s: [[[0.1, 0.2], [0.36, 0], [0.36, 1]]] },
  2: { w: D, s: [[...arc(0.31, 0.29, 0.3, 0.29, 195, 385), [0.02, 1], [D, 1]]] },
  3: { w: D, s: [[...arc(0.31, 0.25, 0.28, 0.25, 205, 450), ...arc(0.31, 0.75, 0.31, 0.25, 270, 515)]] },
  4: { w: D, s: [[[0.46, 1], [0.46, 0], [0, 0.7], [D, 0.7]]] },
  5: { w: D, s: [[[0.57, 0], [0.08, 0], [0.04, 0.47], ...arc(0.3, 0.68, 0.31, 0.32, 215, 505)]] },
  6: { w: D, s: [arc(0.31, 0.69, 0.31, 0.31, 0, 360), [[0.5, 0], [0.04, 0.6]]] },
  7: { w: D, s: [[[0, 0], [D, 0], [0.2, 1]]] },
  8: { w: D, s: [arc(0.31, 0.26, 0.26, 0.26, 0, 360), arc(0.31, 0.74, 0.31, 0.26, 0, 360)] },
  9: { w: D, s: [arc(0.31, 0.31, 0.31, 0.31, 0, 360), [[0.58, 0.4], [0.12, 1]]] },
  ':': { w: 0.2, s: [[[0.1, 0.3]], [[0.1, 0.72]]] },
  A: { w: 0.6, s: [[[0, 1], [0.3, 0], [0.6, 1]], [[0.11, 0.66], [0.49, 0.66]]] },
  B: { w: 0.56, s: [[[0, 0.48], [0, 0], [0.28, 0], ...arc(0.28, 0.24, 0.24, 0.24, 270, 450), [0, 0.48]], [[0, 0.48], [0, 1], [0.3, 1], ...arc(0.3, 0.74, 0.26, 0.26, 90, -90), [0, 0.48]]] },
  C: { w: 0.62, s: [arc(0.34, 0.5, 0.34, 0.5, 318, 42)] },
  D: { w: 0.62, s: [[[0, 0], [0.24, 0], ...arc(0.24, 0.5, 0.38, 0.5, 270, 450), [0, 1], [0, 0]]] },
  E: { w: 0.52, s: [[[0.52, 0], [0, 0], [0, 1], [0.52, 1]], [[0, 0.5], [0.42, 0.5]]] },
  F: { w: 0.5, s: [[[0.5, 0], [0, 0], [0, 1]], [[0, 0.5], [0.4, 0.5]]] },
  G: { w: 0.66, s: [[...arc(0.34, 0.5, 0.34, 0.5, 318, 0), [0.68, 0.56], [0.4, 0.56]]] },
  K: { w: 0.56, s: [[[0, 0], [0, 1]], [[0.56, 0], [0, 0.6]], [[0.17, 0.43], [0.58, 1]]] },
  L: { w: 0.5, s: [[[0, 0], [0, 1], [0.5, 1]]] },
  N: { w: 0.6, s: [[[0, 1], [0, 0], [0.6, 1], [0.6, 0]]] },
  O: { w: 0.68, s: [arc(0.34, 0.5, 0.34, 0.5, 0, 360)] },
  P: { w: 0.56, s: [[[0, 1], [0, 0], [0.28, 0], ...arc(0.28, 0.27, 0.27, 0.27, 270, 450), [0, 0.54]]] },
  R: { w: 0.58, s: [[[0, 1], [0, 0], [0.28, 0], ...arc(0.28, 0.26, 0.26, 0.26, 270, 450), [0, 0.52]], [[0.26, 0.52], [0.58, 1]]] },
  S: { w: 0.58, s: [[...arc(0.29, 0.25, 0.27, 0.25, 325, 90), ...arc(0.29, 0.75, 0.29, 0.25, 270, 515)]] },
  U: { w: 0.6, s: [[[0, 0], [0, 0.66], ...arc(0.3, 0.66, 0.3, 0.34, 180, 0), [0.6, 0]]] },
  Y: { w: 0.6, s: [[[0, 0], [0.3, 0.5], [0.6, 0]], [[0.3, 0.5], [0.3, 1]]] },
  ' ': { w: 0.3, s: [] },
};

// spacing between glyphs, in units of the glyph height
const textWidth = (text, h, track) => [...text].reduce((w, ch, i) => w + (GLYPHS[ch]?.w ?? 0) * h + (i ? track * h : 0), 0);

// ---- canvas
function canvas() {
  const px = new Float32Array(SIZE * SIZE * 3);
  const blend = (x, y, rgb, alpha) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return;
    const o = (y * SIZE + x) * 3;
    const a = Math.min(1, alpha);
    for (let k = 0; k < 3; k++) px[o + k] = px[o + k] * (1 - a) + rgb[k] * a;
  };
  // runs `cover(x, y)` -> 0..1 over the pixels in a box and blends `color` by it
  const paint = (x0, y0, x1, y1, color, cover, alpha = 1) => {
    const rgb = hex(color);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(SIZE, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(SIZE, Math.ceil(x1)); x++) blend(x, y, rgb, cover(x + 0.5, y + 0.5) * alpha);
  };
  const edge = (d) => Math.max(0, Math.min(1, 0.5 - d)); // coverage for a signed distance

  return {
    // `color` everywhere, with an optional radial `glow` colour fading out from the centre
    fill(color, glow, strength) {
      const base = hex(color);
      const g = glow && hex(glow);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const o = (y * SIZE + x) * 3;
          const t = g ? strength * Math.max(0, 1 - Math.hypot(x + 0.5 - C, y + 0.5 - C) / (C * 1.05)) ** 1.6 : 0;
          for (let k = 0; k < 3; k++) px[o + k] = base[k] * (1 - t) + (g ? g[k] * t : 0);
        }
    },
    circle(cx, cy, r, color, alpha = 1) {
      paint(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, color, (x, y) => edge(Math.hypot(x - cx, y - cy) - r), alpha);
    },
    // A round-capped ring segment around the centre, clockwise from 12 o'clock for `fraction` of a turn.
    arc(r, width, fraction, color, alpha = 1) {
      if (fraction <= 0) return;
      const end = Math.min(1, fraction) * 2 * Math.PI;
      const ex = C + r * Math.sin(end);
      const ey = C - r * Math.cos(end);
      paint(C - r - width, C - r - width, C + r + width, C + r + width, color, (x, y) => {
        const dx = x - C;
        const dy = y - C;
        let a = Math.atan2(dx, -dy);
        if (a < 0) a += 2 * Math.PI;
        const d = fraction >= 1 || a <= end ? Math.abs(Math.hypot(dx, dy) - r) : Math.min(Math.hypot(dx, dy + r), Math.hypot(x - ex, y - ey));
        return edge(d - width / 2);
      }, alpha);
      return [ex, ey];
    },
    // `text` centred on cx, glyphs `h` tall from y, drawn with strokes `stroke` wide
    text(cx, y, text, { h, stroke, color, track = 0.22, alpha = 1 }) {
      let x = cx - textWidth(text, h, track) / 2;
      for (const ch of text) {
        const g = GLYPHS[ch];
        if (!g) continue;
        const segs = [];
        for (const line of g.s) {
          const pts = line.map(([gx, gy]) => [x + gx * h, y + gy * h]);
          if (pts.length === 1) segs.push([pts[0], pts[0]]);
          for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
        }
        const r = stroke / 2;
        if (segs.length)
          paint(x - r - 1, y - r - 1, x + g.w * h + r + 1, y + h + r + 1, color, (px, py) => {
            let best = Infinity;
            for (const [[ax, ay], [bx, by]] of segs) {
              const vx = bx - ax;
              const vy = by - ay;
              const len = vx * vx + vy * vy;
              const t = len ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0;
              best = Math.min(best, Math.hypot(px - ax - t * vx, py - ay - t * vy));
            }
            return edge(best - r);
          }, alpha);
        x += (g.w + track) * h;
      }
    },
    png() {
      const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE * 3; x++) raw[y * (SIZE * 3 + 1) + 1 + x] = Math.round(px[y * SIZE * 3 + x]);
      return encode(SIZE, raw);
    },
  };
}

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
