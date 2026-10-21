// "Spotify" key: the current track's album cover; press to play/pause. Dimmed with a play
// triangle while paused. "Spotify Next" key: skips to the next track.
//
// Everything goes through the Spotify desktop app's AppleScript dictionary, so there's no
// Spotify login, developer app or Premium involved. macOS asks once whether Control Deck may
// control Spotify. Covers are downloaded from Spotify's CDN and resized with `sips`.

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataUrl, decode, encode, hex } from './lib/png.mjs';
import { CACHE_DIR as SHARED_CACHE } from './lib/paths.mjs';

export const SPOTIFY_BUNDLE = 'com.spotify.client';
const SIZE = 144;
const BG = '#1b1b1f';
const GREEN = '#1ed760';
const CACHE_DIR = join(SHARED_CACHE, 'spotify');

function osa(script) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 5000 }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });
}

// The `is running` check comes first so polling never launches Spotify.
const READ = `if application id "${SPOTIFY_BUNDLE}" is not running then return "off"
tell application id "${SPOTIFY_BUNDLE}"
  set s to player state as text
  try
    set t to current track
    return s & linefeed & (id of t) & linefeed & (artwork url of t) & linefeed & (name of t) & linefeed & (artist of t)
  on error
    return s
  end try
end tell`;

// { running, state: 'playing' | 'paused' | 'stopped', id, artwork, name, artist }
export async function readSpotify() {
  const out = await osa(READ);
  if (out === null || out === 'off') return { running: false };
  const [state, id = '', artwork = '', name = '', artist = ''] = out.split('\n');
  return { running: true, state, id, artwork, name, artist };
}

// Only talks to Spotify while it's running; otherwise the play key opens it.
export const playPause = () => osa(`if application id "${SPOTIFY_BUNDLE}" is running then tell application id "${SPOTIFY_BUNDLE}" to playpause`);
export const nextTrack = () => osa(`if application id "${SPOTIFY_BUNDLE}" is running then tell application id "${SPOTIFY_BUNDLE}" to next track`);

// ---- drawing
function canvas() {
  const px = new Float32Array(SIZE * SIZE * 3);
  const [r, g, b] = hex(BG);
  for (let i = 0; i < SIZE * SIZE; i++) px.set([r, g, b], i * 3);
  const blend = (x, y, rgb, alpha) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return;
    const o = (y * SIZE + x) * 3;
    for (let k = 0; k < 3; k++) px[o + k] = px[o + k] * (1 - alpha) + rgb[k] * alpha;
  };
  // an RGBA image scaled into the square at (x0, y0) of side `span`
  const image = (img, x0, y0, span, shade = (rgb) => rgb) => {
    for (let y = 0; y < span; y++)
      for (let x = 0; x < span; x++) {
        const o = (Math.floor((y * img.height) / span) * img.width + Math.floor((x * img.width) / span)) * 4;
        blend(x0 + x, y0 + y, shade([img.data[o], img.data[o + 1], img.data[o + 2]]), img.data[o + 3] / 255);
      }
  };
  // a filled convex shape, 4x4 supersampled; `inside(fx, fy)` tests a point
  const fill = (inside, rgb, [x0, y0, x1, y1] = [0, 0, SIZE, SIZE]) => {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        let n = 0;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
        blend(x, y, rgb, n / 16);
      }
  };
  const png = () => {
    const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE * 3; x++) raw[y * (SIZE * 3 + 1) + 1 + x] = Math.round(px[y * SIZE * 3 + x]);
    return encode(SIZE, raw);
  };
  return { blend, image, fill, png };
}

// right-pointing triangle with its left edge at x, centred on cy
const triangle = (x, cy, w, h) => (fx, fy) => fx >= x && fx <= x + w && Math.abs(fy - cy) <= (h / 2) * (1 - (fx - x) / w);
const grey = (rgb) => Array(3).fill(((rgb[0] + rgb[1] + rgb[2]) / 3) * 0.45);

// the Spotify app icon, from build.mjs; loaded on first use so build.mjs can import this file
let icon;
const appIcon = () => (icon ??= decode(readFileSync(fileURLToPath(new URL('../images/spotify-key@2x.png', import.meta.url)))));

function drawIcon(running) {
  const c = canvas();
  c.image(appIcon(), 16, 16, SIZE - 32, running ? undefined : grey);
  return dataUrl(c.png());
}

function drawCover(cover, paused) {
  const c = canvas();
  c.image(cover, 0, 0, SIZE, paused ? (rgb) => rgb.map((v) => v * 0.4) : undefined);
  if (paused) c.fill(triangle(56, SIZE / 2, 42, 48), [255, 255, 255], [56, 48, 98, 96]);
  return dataUrl(c.png());
}

// ⏭: two triangles and a bar. Green while something's playing, white when paused, grey when off.
export function drawNext(color) {
  const c = canvas();
  const rgb = hex(color);
  const cy = SIZE / 2;
  c.fill(triangle(30, cy, 36, 48), rgb, [30, 48, 66, 96]);
  c.fill(triangle(66, cy, 36, 48), rgb, [66, 48, 102, 96]);
  c.fill((fx, fy) => fx >= 104 && fx <= 114 && Math.abs(fy - cy) <= 24, rgb, [104, 48, 114, 96]);
  return c.png();
}

// ---- covers: downloaded once per URL, resized to the key with sips, then decoded
const covers = new Map(); // artwork url -> decoded image, or null while loading / when it failed
const sips = (args) => new Promise((resolve) => execFile('/usr/bin/sips', args, { timeout: 10_000 }, (err) => resolve(!err)));

async function loadCover(url, log) {
  covers.set(url, null);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(CACHE_DIR, { recursive: true });
    const src = join(CACHE_DIR, 'cover.jpg');
    const out = join(CACHE_DIR, 'cover.png');
    writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    if (!(await sips(['-s', 'format', 'png', '-z', String(SIZE), String(SIZE), src, '--out', out]))) throw new Error('sips failed');
    covers.set(url, decode(readFileSync(out)));
    rmSync(src, { force: true });
    rmSync(out, { force: true });
  } catch (e) {
    log?.('spotify cover failed', url, e.message);
  }
  // keep a handful; tracks repeat within an album
  while (covers.size > 8) covers.delete(covers.keys().next().value);
}

// Starts a download for the track's cover if it isn't cached; `onLoaded` redraws once it's in.
export function ensureCover(player, onLoaded, log) {
  const url = player?.artwork;
  if (!url || covers.has(url)) return;
  loadCover(url, log).then(onLoaded);
}

const images = new Map();
const memo = (key, make) => {
  if (!images.has(key)) {
    images.set(key, make());
    if (images.size > 32) images.delete(images.keys().next().value);
  }
  return images.get(key);
};

// What the play key shows: { image, title }. Everything is in the image; the title stays empty.
export function spotifyKey(player) {
  if (!player?.running) return { image: memo('off', () => drawIcon(false)), title: '' };
  const paused = player.state !== 'playing';
  const cover = covers.get(player.artwork);
  if (!cover) return { image: memo('icon', () => drawIcon(true)), title: '' };
  return { image: memo(`${player.artwork}:${paused}`, () => drawCover(cover, paused)), title: '' };
}

export function nextKey(player) {
  const color = !player?.running ? '#5b5b66' : player.state === 'playing' ? GREEN : '#ffffff';
  return { image: memo(`next:${color}`, () => dataUrl(drawNext(color))), title: '' };
}
