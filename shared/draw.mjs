// An antialiased drawing canvas for key images drawn whole (text included), and a small stroke font
// (round-capped lines and arcs) rendered with distance-based antialiasing, so it stays smooth at any
// size, unlike the pixel font in font.mjs.

import { encode, hex } from './png.mjs';

// ---- stroke font: glyphs are polylines in a box 1 unit tall, `w` wide; y grows downwards.
// arc(cx, cy, rx, ry, from, to) in degrees: 0 is right, 90 down, 270 up; runs from -> to.
function arc(cx, cy, rx, ry, from, to) {
  const n = Math.max(6, Math.ceil(Math.abs(to - from) / 10));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}
export const DIGIT_W = 0.62; // every digit is as wide, so numbers don't jitter as they change
const D = DIGIT_W;

export const GLYPHS = {
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
  '.': { w: 0.12, s: [[[0.06, 0.94]]] },
  '-': { w: 0.4, s: [[[0.04, 0.55], [0.36, 0.55]]] },
  '/': { w: 0.4, s: [[[0.4, 0], [0, 1]]] },
  '%': { w: 0.78, s: [arc(0.16, 0.17, 0.15, 0.17, 0, 360), arc(0.62, 0.83, 0.15, 0.17, 0, 360), [[0.68, 0], [0.1, 1]]] },
  '↑': { w: 0.56, s: [[[0.28, 1], [0.28, 0]], [[0.02, 0.3], [0.28, 0], [0.54, 0.3]]] },
  '↓': { w: 0.56, s: [[[0.28, 0], [0.28, 1]], [[0.02, 0.7], [0.28, 1], [0.54, 0.7]]] },
  A: { w: 0.6, s: [[[0, 1], [0.3, 0], [0.6, 1]], [[0.11, 0.66], [0.49, 0.66]]] },
  B: { w: 0.56, s: [[[0, 0.48], [0, 0], [0.28, 0], ...arc(0.28, 0.24, 0.24, 0.24, 270, 450), [0, 0.48]], [[0, 0.48], [0, 1], [0.3, 1], ...arc(0.3, 0.74, 0.26, 0.26, 90, -90), [0, 0.48]]] },
  C: { w: 0.62, s: [arc(0.34, 0.5, 0.34, 0.5, 318, 42)] },
  D: { w: 0.62, s: [[[0, 0], [0.24, 0], ...arc(0.24, 0.5, 0.38, 0.5, 270, 450), [0, 1], [0, 0]]] },
  E: { w: 0.52, s: [[[0.52, 0], [0, 0], [0, 1], [0.52, 1]], [[0, 0.5], [0.42, 0.5]]] },
  F: { w: 0.5, s: [[[0.5, 0], [0, 0], [0, 1]], [[0, 0.5], [0.4, 0.5]]] },
  G: { w: 0.66, s: [[...arc(0.34, 0.5, 0.34, 0.5, 318, 0), [0.68, 0.56], [0.4, 0.56]]] },
  H: { w: 0.58, s: [[[0, 0], [0, 1]], [[0.58, 0], [0.58, 1]], [[0, 0.5], [0.58, 0.5]]] },
  I: { w: 0.08, s: [[[0.04, 0], [0.04, 1]]] },
  K: { w: 0.56, s: [[[0, 0], [0, 1]], [[0.56, 0], [0, 0.6]], [[0.17, 0.43], [0.58, 1]]] },
  L: { w: 0.5, s: [[[0, 0], [0, 1], [0.5, 1]]] },
  M: { w: 0.74, s: [[[0, 1], [0, 0], [0.37, 0.62], [0.74, 0], [0.74, 1]]] },
  N: { w: 0.6, s: [[[0, 1], [0, 0], [0.6, 1], [0.6, 0]]] },
  O: { w: 0.68, s: [arc(0.34, 0.5, 0.34, 0.5, 0, 360)] },
  P: { w: 0.56, s: [[[0, 1], [0, 0], [0.28, 0], ...arc(0.28, 0.27, 0.27, 0.27, 270, 450), [0, 0.54]]] },
  R: { w: 0.58, s: [[[0, 1], [0, 0], [0.28, 0], ...arc(0.28, 0.26, 0.26, 0.26, 270, 450), [0, 0.52]], [[0.26, 0.52], [0.58, 1]]] },
  S: { w: 0.58, s: [[...arc(0.29, 0.25, 0.27, 0.25, 325, 90), ...arc(0.29, 0.75, 0.29, 0.25, 270, 515)]] },
  T: { w: 0.56, s: [[[0, 0], [0.56, 0]], [[0.28, 0], [0.28, 1]]] },
  U: { w: 0.6, s: [[[0, 0], [0, 0.66], ...arc(0.3, 0.66, 0.3, 0.34, 180, 0), [0.6, 0]]] },
  W: { w: 0.86, s: [[[0, 0], [0.2, 1], [0.43, 0.3], [0.66, 1], [0.86, 0]]] },
  Y: { w: 0.6, s: [[[0, 0], [0.3, 0.5], [0.6, 0]], [[0.3, 0.5], [0.3, 1]]] },
  s: { w: 0.42, s: [[...arc(0.21, 0.56, 0.19, 0.15, 325, 90), ...arc(0.21, 0.85, 0.21, 0.15, 270, 515)]] },
  ' ': { w: 0.3, s: [] },
};

// Width of `text` drawn `h` tall, with `track` (in units of h) between glyphs.
export const textWidth = (text, h, track = 0.22) =>
  [...text].reduce((w, ch, i) => w + (GLYPHS[ch]?.w ?? 0) * h + (i ? track * h : 0), 0);

// Shortest distance from (px, py) to a list of [[ax, ay], [bx, by]] segments.
function segDistance(segs, px, py) {
  let best = Infinity;
  for (const [[ax, ay], [bx, by]] of segs) {
    const vx = bx - ax;
    const vy = by - ay;
    const len = vx * vx + vy * vy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * vx, py - ay - t * vy));
  }
  return best;
}

// ---- canvas: a `size` x `size` RGB image
export function canvas(size = 144) {
  const C = size / 2;
  const px = new Float32Array(size * size * 3);
  const blend = (x, y, rgb, alpha) => {
    if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return;
    const o = (y * size + x) * 3;
    const a = Math.min(1, alpha);
    for (let k = 0; k < 3; k++) px[o + k] = px[o + k] * (1 - a) + rgb[k] * a;
  };
  // runs `cover(x, y)` -> 0..1 over the pixels in a box and blends `color` by it
  const paint = (x0, y0, x1, y1, color, cover, alpha = 1) => {
    const rgb = hex(color);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x1)); x++) blend(x, y, rgb, cover(x + 0.5, y + 0.5) * alpha);
  };
  const edge = (d) => Math.max(0, Math.min(1, 0.5 - d)); // coverage for a signed distance

  return {
    // `color` everywhere, with an optional radial `glow` colour fading out from the centre
    fill(color, glow, strength) {
      const base = hex(color);
      const g = glow && hex(glow);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const o = (y * size + x) * 3;
          const t = g ? strength * Math.max(0, 1 - Math.hypot(x + 0.5 - C, y + 0.5 - C) / (C * 1.05)) ** 1.6 : 0;
          for (let k = 0; k < 3; k++) px[o + k] = base[k] * (1 - t) + (g ? g[k] * t : 0);
        }
    },
    circle(cx, cy, r, color, alpha = 1) {
      paint(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, color, (x, y) => edge(Math.hypot(x - cx, y - cy) - r), alpha);
    },
    // A rectangle from (x0, y0) to (x1, y1) with corners rounded by `r`.
    rect(x0, y0, x1, y1, color, { r = 0, alpha = 1 } = {}) {
      if (x1 <= x0 || y1 <= y0) return;
      const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
      paint(x0 - 1, y0 - 1, x1 + 1, y1 + 1, color, (x, y) => {
        const dx = Math.max(x0 + rr - x, 0, x - (x1 - rr));
        const dy = Math.max(y0 + rr - y, 0, y - (y1 - rr));
        const inside = Math.max(Math.min(x - x0, x1 - x, y - y0, y1 - y), 0);
        return edge(dx || dy ? Math.hypot(dx, dy) - rr : -inside);
      }, alpha);
    },
    // A ring segment around the centre, clockwise from 12 o'clock for `fraction` of a turn.
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
    // A round-capped polyline through `points` ([[x, y], ...]), `width` wide.
    line(points, width, color, alpha = 1) {
      if (!points.length) return;
      const segs = points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((p, i) => [points[i], p]);
      const r = width / 2;
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      paint(Math.min(...xs) - r - 1, Math.min(...ys) - r - 1, Math.max(...xs) + r + 1, Math.max(...ys) + r + 1, color, (x, y) => edge(segDistance(segs, x, y) - r), alpha);
    },
    // Fills between the polyline through `points` (x ascending) and the horizontal line y = `base`.
    area(points, base, color, alpha = 1) {
      if (points.length < 2) return;
      const rgb = hex(color);
      const x0 = points[0][0];
      const x1 = points[points.length - 1][0];
      let i = 0;
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x1)); x++) {
        const xc = Math.min(Math.max(x + 0.5, x0), x1);
        while (i < points.length - 2 && points[i + 1][0] < xc) i++;
        const [[ax, ay], [bx, by]] = [points[i], points[i + 1]];
        const top = bx === ax ? ay : ay + ((by - ay) * (xc - ax)) / (bx - ax);
        const xCover = Math.min(1, Math.min(x + 1, x1) - Math.max(x, x0));
        for (let y = Math.max(0, Math.floor(top)); y < Math.min(size, Math.ceil(base)); y++) {
          const cover = Math.min(1, y + 1 - top) * Math.min(1, base - y);
          blend(x, y, rgb, Math.max(0, cover) * xCover * alpha);
        }
      }
    },
    // `text` drawn `h` tall from y, with strokes `stroke` wide. x is its centre, or its left or
    // right edge with `align: 'left' | 'right'`.
    text(x, y, text, { h, stroke, color, track = 0.22, alpha = 1, align = 'center' }) {
      const w = textWidth(text, h, track);
      x = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
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
        if (segs.length) paint(x - r - 1, y - r - 1, x + g.w * h + r + 1, y + h + r + 1, color, (px, py) => edge(segDistance(segs, px, py) - r), alpha);
        x += (g.w + track) * h;
      }
    },
    png() {
      const raw = Buffer.alloc(size * (size * 3 + 1));
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size * 3; x++) raw[y * (size * 3 + 1) + 1 + x] = Math.round(px[y * size * 3 + x]);
      return encode(size, raw);
    },
  };
}
