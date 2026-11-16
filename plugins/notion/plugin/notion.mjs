// "Notion" key: the Notion app icon with the number of unread Inbox notifications on it. Pressing it
// brings Notion to the front.
//
// The count is the badge Notion puts on its Dock icon, read with `lsappinfo`, so there's no Notion
// token or API involved (Notion's public API has no inbox). It only works while the Notion desktop
// app is running.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { badgeImage } from './lib/badge.mjs';
import { decode } from './lib/png.mjs';

export const NOTION_BUNDLE = 'notion.id';

// the Notion app icon, from build.mjs
const ICON = decode(readFileSync(fileURLToPath(new URL('../images/notion-key@2x.png', import.meta.url))));

// { running: bool, label: '' | '•' | '3' | ... }
export function readBadge() {
  return new Promise((resolve) => {
    execFile('/usr/bin/lsappinfo', ['info', '-only', 'StatusLabel', '-app', NOTION_BUNDLE], { timeout: 5000 }, (err, stdout) => {
      const out = String(stdout || '').trim();
      if (err || !out) return resolve({ running: false, label: '' });
      resolve({ running: true, label: out.match(/"label"="([^"]*)"/)?.[1] ?? '' });
    });
  });
}

const images = new Map();

// What the key shows: { image, title }. Everything is in the image; the title stays empty.
export function notionKey(badge) {
  const running = badge?.running ?? true;
  const label = running ? (badge?.label ?? '') : '';
  const key = `${running}:${label}`;
  if (!images.has(key)) images.set(key, badgeImage(ICON, label, running));
  return { image: images.get(key), title: '' };
}
