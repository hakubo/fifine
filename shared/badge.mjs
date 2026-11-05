// An app icon on a dark key with a red count badge in the top-right, like the Dock draws it.
// Used by the Slack and Chrome keys.

import { dataUrl, encode, hex } from './png.mjs';
import { GLYPHS } from './font.mjs';

const SIZE = 144;
const BG = '#1b1b1f';
const BADGE = '#e01e5a';
const TEXT = '#ffffff';
const FONT_SCALE = 3;

// icon: a decoded PNG ({ width, height, data }). label: '' for no badge, '•' for a plain dot,
// otherwise the count (more than two characters shows as 99). running: false greys the icon out.
export function badgeImage(icon, label, running) {
  const px = new Float32Array(SIZE * SIZE * 3);
  const [r, g, b] = hex(BG);
  for (let i = 0; i < SIZE * SIZE; i++) px.set([r, g, b], i * 3);
  const blend = (x, y, rgb, alpha) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return;
    const o = (y * SIZE + x) * 3;
    for (let k = 0; k < 3; k++) px[o + k] = px[o + k] * (1 - alpha) + rgb[k] * alpha;
  };

  // the icon, scaled to leave room for the badge; greyed out while the app isn't running
  const inset = 16;
  const span = SIZE - 2 * inset;
  for (let y = 0; y < span; y++)
    for (let x = 0; x < span; x++) {
      const sx = Math.floor((x * icon.width) / span);
      const sy = Math.floor((y * icon.height) / span);
      const o = (sy * icon.width + sx) * 4;
      let rgb = [icon.data[o], icon.data[o + 1], icon.data[o + 2]];
      if (!running) rgb = Array(3).fill((rgb[0] + rgb[1] + rgb[2]) / 3 * 0.45);
      blend(inset + x, inset + y, rgb, icon.data[o + 3] / 255);
    }

  if (label) {
    // a pill in the top-right, wide enough for the count; a plain dot for "•"
    const text = label === '•' ? '' : label.length > 2 ? '99' : label;
    const textW = [...text].reduce((w, ch, i) => w + (GLYPHS[ch]?.[0].length ?? 0) * FONT_SCALE + (i ? FONT_SCALE : 0), 0);
    const h = text ? 46 : 30;
    const w = text ? Math.max(h, textW + 26) : h;
    const x1 = SIZE - 4;
    const x0 = x1 - w;
    const y0 = 4;
    const radius = h / 2;
    const fill = hex(BADGE);
    const ring = hex(BG);
    // 4x4 supersampled, with a background-coloured ring so the badge stands off the icon
    for (let y = y0 - 4; y < y0 + h + 4; y++)
      for (let x = x0 - 4; x < x1 + 4; x++) {
        let inFill = 0;
        let inRing = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const fx = x + (sx + 0.5) / 4;
            const fy = y + (sy + 0.5) / 4;
            const cx = Math.max(x0 + radius - fx, 0, fx - (x1 - radius));
            const d = Math.hypot(cx, fy - (y0 + radius));
            if (d <= radius) inFill++;
            else if (d <= radius + 4) inRing++;
          }
        blend(x, y, ring, inRing / 16);
        blend(x, y, fill, inFill / 16);
      }
    let tx = Math.round(x0 + (w - textW) / 2);
    const ty = Math.round(y0 + (h - 7 * FONT_SCALE) / 2);
    const white = hex(TEXT);
    for (const ch of text) {
      const glyph = GLYPHS[ch];
      if (!glyph) continue;
      glyph.forEach((row, gy) =>
        [...row].forEach((cell, gx) => {
          if (cell !== '#') return;
          for (let dy = 0; dy < FONT_SCALE; dy++)
            for (let dx = 0; dx < FONT_SCALE; dx++) blend(tx + gx * FONT_SCALE + dx, ty + gy * FONT_SCALE + dy, white, 1);
        }),
      );
      tx += (glyph[0].length + 1) * FONT_SCALE;
    }
  }

  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE * 3; x++) raw[y * (SIZE * 3 + 1) + 1 + x] = Math.round(px[y * SIZE * 3 + x]);
  return dataUrl(encode(SIZE, raw));
}
