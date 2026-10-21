// "Claude Usage" key: the account's 5-hour and 7-day rate-limit usage, as the fifine-usage Claude Code
// plugin (../claude-plugin/) last recorded it in ~/.claude/fifine/usage.json.
//
// The key is drawn whole into the image (text included), so lines and bars sit exactly where we put
// them; the host's title is left empty.
//
//   5h 43%    2h14m      label, percent, time to reset
//   (=====-------)       rounded bar
//   7d 23%     3d4h
//   (===---------)

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GLYPHS } from './lib/font.mjs';
import { dataUrl, encode, hex } from './lib/png.mjs';

export const USAGE_FILE = join(homedir(), '.claude', 'fifine', 'usage.json');
export const USAGE_URL = 'https://claude.ai/settings/usage';

const SIZE = 144;
const PAD_X = 14;
const BG = '#1b1b1f';
const TRACK = '#2c2c33';
const DIM = '#8a8a96';
const TEXT = '#f2f2f5';
const FONT_SCALE = 2;
// top of each row: text line, then its bar
const LAYOUT = [
  { text: 30, bar: 52 },
  { text: 78, bar: 100 },
];
const BAR_HEIGHT = 12;

// orange when getting close, red when nearly out
const LEVELS = [
  { from: 90, color: '#ff3b30' },
  { from: 70, color: '#ff8a00' },
  { from: 0, color: '#4c8dff' },
];
const levelColor = (percent) => LEVELS.find((l) => percent >= l.from).color;

export function readUsage() {
  try {
    return JSON.parse(readFileSync(USAGE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// A window whose reset time has passed is back to 0%, even before Claude Code reports again.
function current(w, now) {
  if (!w) return null;
  if (w.resetsAt && w.resetsAt <= now) return { percent: 0, resetsAt: null };
  return w;
}

function until(ms, now) {
  if (!ms) return '';
  const minutes = Math.max(0, Math.round((ms - now) / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return h ? `${d}d${h}h` : `${d}d`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

const textWidth = (text) =>
  [...text].reduce((w, ch, i) => w + (GLYPHS[ch]?.[0].length ?? 0) * FONT_SCALE + (i ? FONT_SCALE : 0), 0);

// ---- canvas
function canvas() {
  const px = new Float32Array(SIZE * SIZE * 3);
  const [r, g, b] = hex(BG);
  for (let i = 0; i < SIZE * SIZE; i++) px.set([r, g, b], i * 3);
  const blend = (x, y, rgb, alpha) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return;
    const o = (y * SIZE + x) * 3;
    for (let k = 0; k < 3; k++) px[o + k] = px[o + k] * (1 - alpha) + rgb[k] * alpha;
  };
  return {
    text(x, y, text, color) {
      const rgb = hex(color);
      x = Math.round(x);
      for (const ch of text) {
        const glyph = GLYPHS[ch];
        if (!glyph) continue;
        glyph.forEach((row, gy) =>
          [...row].forEach((cell, gx) => {
            if (cell !== '#') return;
            for (let dy = 0; dy < FONT_SCALE; dy++)
              for (let dx = 0; dx < FONT_SCALE; dx++) blend(x + gx * FONT_SCALE + dx, y + gy * FONT_SCALE + dy, rgb, 1);
          }),
        );
        x += (glyph[0].length + 1) * FONT_SCALE;
      }
    },
    // A pill from x0 to x1, filled with `color` up to fillTo; edges antialiased by 4x4 supersampling.
    bar(x0, x1, y0, height, fillTo, color, track) {
      const fill = hex(color);
      const back = hex(track);
      const radius = height / 2;
      const inside = (sx, sy) => {
        const cx = Math.max(x0 + radius - sx, 0, sx - (x1 - radius));
        const cy = sy - (y0 + radius);
        return cx * cx + cy * cy <= radius * radius;
      };
      for (let y = y0; y < y0 + height; y++) {
        for (let x = x0; x < x1; x++) {
          let onFill = 0;
          let onBack = 0;
          for (let sy = 0; sy < 4; sy++)
            for (let sx = 0; sx < 4; sx++) {
              const fx = x + (sx + 0.5) / 4;
              const fy = y + (sy + 0.5) / 4;
              if (!inside(fx, fy)) continue;
              if (fx < fillTo) onFill++;
              else onBack++;
            }
          blend(x, y, back, onBack / 16);
          blend(x, y, fill, onFill / 16);
        }
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

function drawRow(c, { text: ty, bar: by }, label, w, now) {
  const percent = w ? Math.round(w.percent) : null;
  const color = percent === null ? DIM : levelColor(percent);
  c.text(PAD_X, ty, label, DIM);
  const value = percent === null ? '–' : `${percent}%`;
  c.text(PAD_X + textWidth(`${label} `) + FONT_SCALE, ty, value, percent !== null && percent >= 70 ? color : TEXT);
  const reset = until(w?.resetsAt, now);
  if (reset) c.text(SIZE - PAD_X - textWidth(reset), ty, reset, DIM);
  const x1 = SIZE - PAD_X;
  const fillTo = PAD_X + ((x1 - PAD_X) * Math.max(0, Math.min(100, w?.percent ?? 0))) / 100;
  c.bar(PAD_X, x1, by, BAR_HEIGHT, fillTo, color, TRACK);
}

const images = new Map(); // what the key shows -> data url; redrawn only when it changes
function cached(key, draw) {
  if (!images.has(key)) {
    if (images.size > 200) images.clear();
    images.set(key, draw());
  }
  return images.get(key);
}

// What the key shows: { image, title }. Everything is in the image; the title stays empty.
export function usageKey(usage, now = Date.now()) {
  const fiveHour = current(usage?.fiveHour, now);
  const sevenDay = current(usage?.sevenDay, now);
  if (!fiveHour && !sevenDay) {
    const image = cached('no data', () => {
      const c = canvas();
      c.text((SIZE - textWidth('no data')) / 2, LAYOUT[0].text, 'no data', DIM);
      for (const row of LAYOUT) c.bar(PAD_X, SIZE - PAD_X, row.bar, BAR_HEIGHT, 0, DIM, TRACK);
      return dataUrl(c.png());
    });
    return { image, title: '' };
  }
  const rows = [
    ['5h', fiveHour],
    ['7d', sevenDay],
  ];
  const key = JSON.stringify(rows.map(([l, w]) => [l, w && Math.round(w.percent), until(w?.resetsAt, now)]));
  const image = cached(key, () => {
    const c = canvas();
    rows.forEach(([label, w], i) => drawRow(c, LAYOUT[i], label, w, now));
    return dataUrl(c.png());
  });
  return { image, title: '' };
}
