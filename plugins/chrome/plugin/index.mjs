// Chrome plugin: one key that shows how many Google Chrome windows are open and cycles through
// them.
//
// Each press brings forward the window that comes after the front one in a fixed order (by
// Chrome's window id, i.e. the order they were opened), wrapping around, so repeated presses
// visit every window in turn. Raising the backmost window instead (going by z-order) only ever
// toggled between two of them. Minimized and hidden windows are skipped, and not counted. If
// Chrome isn't running, or Chrome isn't the frontmost app yet, the first press just brings it
// forward.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { badgeImage } from './lib/badge.mjs';
import { decode } from './lib/png.mjs';
import { createPlugin, sleep } from './lib/streamdock.mjs';

const ACTION = 'com.jakubolek.fifine.chrome.cycle';
const CHROME_BUNDLE = 'com.google.Chrome';

// the Chrome app icon, from build.mjs
const ICON = decode(readFileSync(fileURLToPath(new URL('../images/chrome-key@2x.png', import.meta.url))));

const p = createPlugin('chrome');
const keys = new Set();
let count = null; // null: Chrome isn't running
let reading = false;

// The `is running` check comes first so polling never launches Chrome.
const COUNT = `if application id "${CHROME_BUNDLE}" is not running then return "off"
tell application id "${CHROME_BUNDLE}" to return count of (windows whose visible is true and minimized is false)`;

const CYCLE = `
if application id "${CHROME_BUNDLE}" is not running then return "launch"
tell application "System Events" to set frontApp to bundle identifier of first process whose frontmost is true
tell application id "${CHROME_BUNDLE}"
  set ids to {}
  set frontId to missing value
  repeat with w in windows
    if visible of w and not minimized of w then
      if frontId is missing value then set frontId to id of w
      set end of ids to id of w
    end if
  end repeat
  if (count of ids) is 0 then
    activate
    return "no windows"
  end if
  if frontApp is "${CHROME_BUNDLE}" and (count of ids) > 1 then
    -- the smallest id above the front window's, else the smallest overall
    set nextId to missing value
    set firstId to missing value
    repeat with i in ids
      set i to contents of i
      if firstId is missing value or i < firstId then set firstId to i
      if i > frontId and (nextId is missing value or i < nextId) then set nextId to i
    end repeat
    if nextId is missing value then set nextId to firstId
    set index of (first window whose id is nextId) to 1
  end if
  activate
  return (count of ids) as text
end tell`;

const images = new Map();

// What the key shows: the Chrome icon with the window count, greyed out while Chrome isn't running.
function chromeKey() {
  const label = count ? String(count) : '';
  const key = `${count !== null}:${label}`;
  if (!images.has(key)) images.set(key, badgeImage(ICON, label, count !== null));
  return { image: images.get(key), title: '' };
}

// Only polled while a Chrome key is on the deck.
async function refresh() {
  if (keys.size === 0 || reading) return;
  reading = true;
  const out = await p.osa(COUNT);
  reading = false;
  if (out === null) return;
  const next = out === 'off' ? null : Number(out);
  if (next !== count) p.log('chrome windows', next);
  count = next;
  p.show(keys, chromeKey());
}

p.action(ACTION, {
  willAppear: (ctx) => {
    keys.add(ctx);
    p.show(ctx, chromeKey());
    refresh();
  },
  willDisappear: (ctx) => keys.delete(ctx),
  keyDown: async () => {
    const out = await p.osa(CYCLE);
    if (out === 'launch') await p.open('-b', CHROME_BUNDLE);
    p.log('cycle', out);
    await sleep(300);
    refresh();
  },
});

setInterval(refresh, 3000);
p.connect();
