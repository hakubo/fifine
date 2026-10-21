// Minimal PNG encoder for key backgrounds; no dependencies.
import { deflateSync, inflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// A key tile: `bg` fill, with a `accent` rounded border and a status dot in the top-right.
// `bars` draws horizontal meters: [{ y, height, percent, color, track }], y/height as fractions of the key.
// `layers` blends RGBA images (from decode()) on top, unscaled: [{ img, x, y }].
export function tile({ size = 144, bg = '#1b1b1f', accent = null, dot = null, border = 8, bars = [], layers = [] } = {}) {
  const [br, bgc, bb] = hex(bg);
  const acc = accent && hex(accent);
  const dc = dot && hex(dot);
  const inset = size * 0.12;
  const meters = bars.map((b) => ({
    top: Math.round(b.y * size),
    bottom: Math.round((b.y + b.height) * size),
    fillTo: inset + ((size - 2 * inset) * Math.max(0, Math.min(100, b.percent))) / 100,
    color: hex(b.color),
    track: hex(b.track ?? '#2c2c33'),
  }));
  const radius = 18;
  const dotR = size * 0.09;
  const dotX = size - size * 0.17;
  const dotY = size * 0.17;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let px = [br, bgc, bb];
      if (acc) {
        // distance to the inner rounded rect edge decides the border
        const cx = Math.max(radius - x, 0, x - (size - 1 - radius));
        const cy = Math.max(radius - y, 0, y - (size - 1 - radius));
        const outerDist = Math.hypot(cx, cy) - radius; // <= 0 inside the outer rounded rect
        if (outerDist > 0) px = [0, 0, 0];
        else if (outerDist > -border) px = acc;
      }
      if (dc && Math.hypot(x - dotX, y - dotY) <= dotR) px = dc;
      for (const m of meters) {
        if (y >= m.top && y < m.bottom && x >= inset && x < size - inset) px = x < m.fillTo ? m.color : m.track;
      }
      for (const { img, x: lx, y: ly } of layers) {
        const ix = x - lx;
        const iy = y - ly;
        if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) continue;
        const o = (iy * img.width + ix) * 4;
        const a = img.data[o + 3] / 255;
        if (a) px = px.map((c, k) => Math.round(c * (1 - a) + img.data[o + k] * a));
      }
      const o = row + 1 + x * 3;
      raw[o] = px[0];
      raw[o + 1] = px[1];
      raw[o + 2] = px[2];
    }
  }
  return encode(size, raw);
}

// PNG from `raw`: `size` rows of a filter byte (0) followed by RGB triples.
export function encode(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

// Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what `sips` writes) to { width, height, data: RGBA }.
export function decode(png) {
  let width, height, type;
  const idat = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    const kind = png.toString('ascii', o + 4, o + 8);
    const body = png.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      type = body[9];
      if (body[8] !== 8 || (type !== 2 && type !== 6) || body[12]) throw new Error('unsupported PNG');
    } else if (kind === 'IDAT') idat.push(body);
    o += len + 12;
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y ? px[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + i] = v & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  const data = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) px.copy(data, i * 4, i * 3, i * 3 + 3);
  return { width, height, data };
}
