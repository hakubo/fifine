// "Slack" key: the Slack app icon with Slack's own dock badge on it (unread DMs and mentions, or a
// dot for other unreads). Pressing it brings Slack to the front.
//
// The badge is read with `lsappinfo`, the same label macOS draws on the Dock icon, so there's no
// Slack token or API involved. It only works while the Slack desktop app is running.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { badgeImage } from './lib/badge.mjs';
import { decode } from './lib/png.mjs';

export const SLACK_BUNDLE = 'com.tinyspeck.slackmacgap';

// the Slack app icon, from build.mjs
const ICON = decode(readFileSync(fileURLToPath(new URL('../images/slack-key@2x.png', import.meta.url))));

// { running: bool, label: '' | '•' | '3' | ... }
export function readBadge() {
  return new Promise((resolve) => {
    execFile('/usr/bin/lsappinfo', ['info', '-only', 'StatusLabel', '-app', SLACK_BUNDLE], { timeout: 5000 }, (err, stdout) => {
      const out = String(stdout || '').trim();
      if (err || !out) return resolve({ running: false, label: '' });
      resolve({ running: true, label: out.match(/"label"="([^"]*)"/)?.[1] ?? '' });
    });
  });
}

const images = new Map();

// What the key shows: { image, title }. Everything is in the image; the title stays empty.
export function slackKey(badge) {
  const running = badge?.running ?? true;
  const label = running ? (badge?.label ?? '') : '';
  const key = `${running}:${label}`;
  if (!images.has(key)) images.set(key, badgeImage(ICON, label, running));
  return { image: images.get(key), title: '' };
}
