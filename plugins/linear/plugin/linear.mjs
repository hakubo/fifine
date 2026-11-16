// "Linear" key: the Linear app icon with the number of unread inbox notifications on it.
//
// The count comes from Linear's GraphQL API (`notificationsUnreadCount`), using the shared personal
// API key (api.mjs). Linear's own Dock badge is only a dot, so it's used just to notice
// changes quickly (and as the badge when no API key is set).

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gql } from './api.mjs';
import { badgeImage } from './lib/badge.mjs';
import { decode } from './lib/png.mjs';

export const LINEAR_BUNDLE = 'com.linear';

// the Linear app icon, from build.mjs
const ICON = decode(readFileSync(fileURLToPath(new URL('../images/linear-key@2x.png', import.meta.url))));

// Linear's Dock badge: { running: bool, label: '' | '•' | '3' | ... }
export function readDockBadge() {
  return new Promise((resolve) => {
    execFile('/usr/bin/lsappinfo', ['info', '-only', 'StatusLabel', '-app', LINEAR_BUNDLE], { timeout: 5000 }, (err, stdout) => {
      const out = String(stdout || '').trim();
      if (err || !out) return resolve({ running: false, label: '' });
      resolve({ running: true, label: out.match(/"label"="([^"]*)"/)?.[1] ?? '' });
    });
  });
}

// { count, workspace } from the API, or { error }.
export async function readInbox(apiKey) {
  const data = await gql(apiKey, '{ notificationsUnreadCount organization { urlKey } }');
  return data.error ? data : { count: data.notificationsUnreadCount, workspace: data.organization?.urlKey };
}

// The workspace of the last window the desktop app had open, for when there's no API key.
export function lastWorkspace() {
  try {
    const config = JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/Linear/config.json'), 'utf8'));
    const url = JSON.parse(config.windows || '[]').find((w) => w.restoreUrl)?.restoreUrl;
    return url ? new URL(url).pathname.split('/')[1] || null : null;
  } catch {
    return null;
  }
}

// The inbox in the desktop app.
export const inboxUrl = (workspace) => (workspace ? `linear://${workspace}/inbox` : 'linear://inbox');

// The text selected in the frontmost app ('' when nothing is), via selection.js.
const SELECTION = fileURLToPath(new URL('./selection.js', import.meta.url));
export function readSelection() {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', SELECTION], { timeout: 5000 }, (err, stdout, stderr) =>
      resolve(err ? { error: String(stderr || err.message).trim() } : { text: String(stdout).trim() }),
    );
  });
}

const LINK = /https?:\/\/linear\.app\/([\w-]+\/[^\s<>"'`)\]]+)/i;
const ISSUE_ID = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,7})(?![A-Za-z0-9])/g;

// The desktop-app URL for a Linear link or issue id (ENG-123, eng-123 in a branch name) in text,
// or null. teamKeys, when known, limits ids to real teams so UTF-8 or ISO-8601 don't count.
export function ticketUrl(text, { workspace, teamKeys } = {}) {
  if (!text) return null;
  const link = text.match(LINK);
  if (link) return `linear://${link[1].replace(/[.,;:!?]+$/, '')}`;
  const teams = teamKeys && new Set(teamKeys.map((k) => k.toUpperCase()));
  for (const [, key, number] of text.matchAll(ISSUE_ID)) {
    const id = `${key.toUpperCase()}-${number}`;
    if (!teams || teams.has(key.toUpperCase())) return workspace ? `linear://${workspace}/issue/${id}` : `linear://issue/${id}`;
  }
  return null;
}

const images = new Map();

// What the key shows: { image, title }. label: '' | '•' | count. Everything is in the image.
export function linearKey(label, running = true) {
  const key = `${running}:${label}`;
  if (!images.has(key)) images.set(key, badgeImage(ICON, label, running));
  return { image: images.get(key), title: '' };
}
