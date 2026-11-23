// "AI Usage" key: Claude (left) and Antigravity (right) rate-limit usage, as T3 Code last cached it
// in ~/.t3/caches/<provider>.json (`usageLimits`). T3 refreshes those files every few minutes
// while it runs.
//
//    ( 43 )   ( 18 )      outer ring: 5-hour window (number in middle); inner ring: weekly
//    - 62%    - 51%       weekly % (thin tick, like the inner ring)
//   ▬ 2h14   ▬ 4h05       5-hour reset (thick tick, like the outer ring)
//   - 3d4h   - 5d2h       weekly reset (thin tick, like the inner ring)
//
// Antigravity has a few pools (Claude & GPT, Gemini, …); each ring shows the most-used one.
// The key is drawn whole into the image; the host's title stays empty.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GLYPHS } from './lib/font.mjs';
import { dataUrl, encode, hex } from './lib/png.mjs';

export const T3_CACHE_DIR = join(homedir(), '.t3', 'caches');
// left to right on the key
export const PROVIDERS = ['claudeAgent', 'antigravity'];
// older than this and T3 has probably stopped refreshing: the key greys out
const STALE_MS = 30 * 60 * 1000;

const SIZE = 144;
const BG = '#1b1b1f';
const TRACK = '#2c2c33';
const DIM = '#8a8a96';
const TEXT = '#f2f2f5';
const FONT_SCALE = 2;
const GLYPH_H = 7 * FONT_SCALE;
const COLUMNS = [36, 108]; // ring centres
const RING_Y = 38;
const OUTER = { r: 28, width: 7 };
const INNER = { r: 18, width: 4 };
const WEEKLY_Y = 77; // top of the weekly % line
const ROWS = [100, 119]; // top of the 5-hour and weekly reset lines
const SPAN = 32; // reset line runs cx-SPAN .. cx+SPAN

// orange when getting close, red when nearly out
const LEVELS = [
  { from: 90, color: '#ff3b30' },
  { from: 70, color: '#ff8a00' },
  { from: 0, color: '#4c8dff' },
];
const levelColor = (percent) => LEVELS.find((l) => percent >= l.from).color;

function readCache(provider) {
  try {
    return JSON.parse(readFileSync(join(T3_CACHE_DIR, `${provider}.json`), 'utf8')).usageLimits ?? null;
  } catch {
    return null;
  }
}

export const readUsage = () => Object.fromEntries(PROVIDERS.map((p) => [p, readCache(p)]));

// The most-used window of one kind ("session" = 5-hour, "weekly"), as { percent, resetsAt }.
// A window whose reset time has passed is back to 0%, even before T3 checks again.
function worst(limits, kind, now) {
  const windows = (limits?.windows ?? [])
    .filter((w) => w.kind === kind && typeof w.usedPercent === 'number')
    .map((w) => {
      const resetsAt = w.resetsAt ? Date.parse(w.resetsAt) : null;
      return resetsAt && resetsAt <= now ? { percent: 0, resetsAt: null } : { percent: w.usedPercent, resetsAt };
    });
  if (!windows.length) return null;
  return windows.reduce((a, b) => (b.percent > a.percent ? b : a));
}

// One provider's two rings, or null when T3 has no reading for it.
export function summarize(limits, now = Date.now()) {
  if (!limits) return null;
  const session = worst(limits, 'session', now);
  const weekly = worst(limits, 'weekly', now);
  if (!session && !weekly) return null;
  const checkedAt = Date.parse(limits.checkedAt ?? '');
  return { session, weekly, stale: !(now - checkedAt < STALE_MS) };
}

function until(ms, now) {
  if (!ms) return '–';
  const minutes = Math.max(0, Math.round((ms - now) / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  // at most 5 glyphs, so a line fits half a key: 6d23h, 3h20, 19h, 42m
  if (d > 0) return h ? `${d}d${h}h` : `${d}d`;
  if (h >= 10) return `${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
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
  // Paints every pixel in the box by how many of its 4x4 samples `paint(x, y)` claims for each colour.
  const supersample = (x0, y0, x1, y1, paint) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const hits = new Map();
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const c = paint(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4);
            if (c) hits.set(c, (hits.get(c) ?? 0) + 1);
          }
        for (const [c, n] of hits) blend(x, y, hex(c), n / 16);
      }
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
    // A ring track with a clockwise arc from 12 o'clock covering `percent`, with round ends.
    ring(cx, cy, r, width, percent, color) {
      const half = width / 2;
      const p = Math.max(0, Math.min(100, percent)) / 100;
      const end = p * 2 * Math.PI;
      const cap = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
      const [sx, sy] = cap(0);
      const [ex, ey] = cap(end);
      const near = (x, y, px2, py2) => (x - px2) ** 2 + (y - py2) ** 2 <= half * half;
      supersample(cx - r - half, cy - r - half, cx + r + half, cy + r + half, (x, y) => {
        const dist = Math.hypot(x - cx, y - cy);
        const onBand = Math.abs(dist - r) <= half;
        if (p > 0) {
          let a = Math.atan2(x - cx, cy - y);
          if (a < 0) a += 2 * Math.PI;
          if ((onBand && (p >= 1 || a <= end)) || near(x, y, sx, sy) || near(x, y, ex, ey)) return color;
        }
        return onBand ? TRACK : null;
      });
    },
    // a short pill, as thick as the ring whose reset time it labels
    tick(x, cy, length, height, color) {
      const r = height / 2;
      supersample(x, cy - r, x + length, cy + r, (px2, py2) => {
        const dx = Math.max(x + r - px2, 0, px2 - (x + length - r));
        return dx * dx + (py2 - cy) ** 2 <= r * r ? color : null;
      });
    },
    png() {
      const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE * 3; x++) raw[y * (SIZE * 3 + 1) + 1 + x] = Math.round(px[y * SIZE * 3 + x]);
      return encode(SIZE, raw);
    },
  };
}

// What one column shows, as plain values (also the cache key for the image).
function column(summary, now) {
  if (!summary) {
    return {
      center: '–',
      centerColor: DIM,
      rings: [0, 0],
      ringColors: [DIM, DIM],
      weekly: { text: '–', color: DIM, tickColor: DIM },
      lines: [['–', DIM], ['–', DIM]],
    };
  }
  const { session, weekly, stale } = summary;
  const pct = (w) => (w ? Math.round(w.percent) : 0);
  const tone = (w) => (stale || !w ? DIM : levelColor(pct(w)));
  const hot = (w) => !stale && w && pct(w) >= 70;
  const valueColor = (w) => (stale || !w ? DIM : hot(w) ? levelColor(pct(w)) : TEXT);
  return {
    center: session ? String(pct(session)) : '–',
    centerColor: valueColor(session),
    rings: [pct(session), pct(weekly)],
    ringColors: [tone(session), tone(weekly)],
    weekly: { text: weekly ? `${pct(weekly)}%` : '–', color: valueColor(weekly), tickColor: tone(weekly) },
    lines: [session, weekly].map((w) => [until(w?.resetsAt, now), hot(w) ? levelColor(pct(w)) : DIM]),
  };
}

function drawColumn(c, cx, col) {
  c.ring(cx, RING_Y, OUTER.r, OUTER.width, col.rings[0], col.ringColors[0]);
  c.ring(cx, RING_Y, INNER.r, INNER.width, col.rings[1], col.ringColors[1]);
  c.text(cx - textWidth(col.center) / 2 + FONT_SCALE / 2, RING_Y - GLYPH_H / 2, col.center, col.centerColor);
  const tickW = 7;
  const gap = 5;
  const startX = Math.round(cx - (tickW + gap + textWidth(col.weekly.text)) / 2);
  c.tick(startX, WEEKLY_Y + GLYPH_H / 2, tickW, 3, col.weekly.tickColor);
  c.text(startX + tickW + gap, WEEKLY_Y, col.weekly.text, col.weekly.color);
  col.lines.forEach(([text, color], i) => {
    const height = i === 0 ? 6 : 3;
    c.tick(cx - SPAN, ROWS[i] + GLYPH_H / 2, tickW, height, color);
    c.text(cx + SPAN - textWidth(text), ROWS[i], text, color);
  });
}

const images = new Map(); // what the key shows -> data url; redrawn only when it changes
function cached(key, draw) {
  if (!images.has(key)) {
    if (images.size > 200) images.clear();
    images.set(key, draw());
  }
  return images.get(key);
}

// What the key shows: { image, title }. `usage` is readUsage()'s { provider: usageLimits }.
export function usageKey(usage, now = Date.now()) {
  const columns = PROVIDERS.map((p) => column(summarize(usage?.[p], now), now));
  const image = cached(JSON.stringify(columns), () => {
    const c = canvas();
    columns.forEach((col, i) => drawColumn(c, COLUMNS[i], col));
    return dataUrl(c.png());
  });
  return { image, title: '' };
}
