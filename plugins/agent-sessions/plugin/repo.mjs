// Repo header on session keys: the project's emoji over its name, bigger than the title font
// (one size for every line) allows. The text goes through AppKit (text-image.js) so emoji come
// out in colour. Each rendering is cached on disk; a key shows its plain tile until it's ready.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './lib/png.mjs';
import { CACHE_DIR as SHARED_CACHE } from './lib/paths.mjs';

const CACHE_DIR = join(SHARED_CACHE, 'text');
const SCRIPT = fileURLToPath(new URL('./text-image.js', import.meta.url));
// boxes on the 144px key; the status dot sits top-right, so the emoji takes the top-left corner
// the title's two blank top lines leave roughly y 0-60 for the header
const EMOJI = { size: 22, min: 22, width: 28, height: 28, x: 12, y: 5 };
const NAME = { size: 22, min: 13, width: 120, height: 26, x: 12, y: 33 };

const RETRY_MS = 60_000;
const images = new Map(); // cache key -> decoded RGBA, or null while rendering
const failed = new Map(); // cache key -> ms of the last failed render

function textImage(text, box, { onReady, log }) {
  const args = [text, box.size, box.min, box.width, box.height].map(String);
  const id = createHash('sha1').update(args.join('\0')).digest('hex').slice(0, 16);
  if (images.has(id)) return images.get(id);
  const file = join(CACHE_DIR, `${id}.png`);
  const load = () => {
    try {
      images.set(id, decode(readFileSync(file)));
      return true;
    } catch {
      return false;
    }
  };
  if (existsSync(file) && load()) return images.get(id);
  if (Date.now() - (failed.get(id) || 0) < RETRY_MS) return undefined;
  images.set(id, null);
  mkdirSync(CACHE_DIR, { recursive: true });
  execFile('/usr/bin/osascript', ['-l', 'JavaScript', SCRIPT, ...args, file], { timeout: 10_000 }, (err, _out, stderr) => {
    if (err || !load()) {
      images.delete(id);
      failed.set(id, Date.now());
      log('repo header render failed', text, String(stderr || err?.message || 'no image').trim());
    }
    onReady(); // drawn now, or back to the plain title layout
  });
  return null;
}

// Layers for tile(): [{ img, x, y }], or null while rendering or after a failed render.
// A missing emoji drops just the emoji; a missing name drops the header.
export function repoLayers({ project, emoji }, hooks) {
  const name = textImage(project || '?', NAME, hooks);
  const icon = emoji ? textImage(emoji, EMOJI, hooks) : undefined;
  if (!name || icon === null) return null;
  return [{ img: name, x: NAME.x, y: NAME.y }, ...(icon ? [{ img: icon, x: EMOJI.x, y: EMOJI.y }] : [])];
}
