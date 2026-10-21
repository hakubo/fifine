// Helpers for the plugins' build.mjs files: write the manifest icons into <plugin>/images/.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tile } from '../../shared/png.mjs';

// { name: [size, tileOptions] } -> name.png and name@2x.png
export function tiles(images, icons) {
  for (const [name, [size, opts]] of Object.entries(icons)) {
    writeFileSync(join(images, `${name}.png`), tile({ size, ...opts }));
    writeFileSync(join(images, `${name}@2x.png`), tile({ size: size * 2, ...opts }));
  }
}

// The same PNG under several names (for images drawn at key size; the host scales them).
export function png(images, names, buffer) {
  for (const name of names) writeFileSync(join(images, `${name}.png`), buffer);
}

// An installed app's own icon at { name: size }, converted with sips; a plain tile if the app
// isn't installed. App icons aren't checked in; they're read from the app at build time.
export function appIcon(images, icns, sizes, fallback) {
  for (const [name, size] of Object.entries(sizes)) {
    for (const [suffix, px] of [['', size], ['@2x', size * 2]]) {
      const file = join(images, `${name}${suffix}.png`);
      if (existsSync(icns)) execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-z', String(px), String(px), icns, '--out', file], { stdio: 'ignore' });
      else writeFileSync(file, tile({ size: px, ...fallback }));
    }
  }
}
