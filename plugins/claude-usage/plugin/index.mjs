// AI Usage plugin: one key with Claude's and Antigravity's 5-hour and weekly usage, read from T3
// Code's provider cache. Tap opens T3 Code, double tap starts a new T3 thread.

import { watch } from 'node:fs';
import { gestures } from './lib/gestures.mjs';
import { createPlugin } from './lib/streamdock.mjs';
import { PROVIDERS, T3_CACHE_DIR, readUsage, usageKey } from './usage.mjs';

// kept from the Claude-only key, so keys already on the deck carry over
const ACTION = 'com.jakubolek.fifine.claude-usage.limits';
const T3_BUNDLE = 'com.t3tools.t3code';
const NEW_THREAD_URL = 't3code://new';

const p = createPlugin('claude-usage');
const keys = new Set();

function render() {
  if (keys.size) p.show(keys, usageKey(readUsage()));
}

p.action(ACTION, {
  willAppear: (ctx) => {
    keys.add(ctx);
    render();
  },
  willDisappear: (ctx) => keys.delete(ctx),
  ...gestures({
    tap: () => p.open('-b', T3_BUNDLE),
    doubleTap: () => p.open(NEW_THREAD_URL),
  }),
});

// redraw when T3 rewrites a provider's cache file
const FILES = new Set(PROVIDERS.map((name) => `${name}.json`));
let pending;
try {
  watch(T3_CACHE_DIR, (_e, file) => {
    if (file && !FILES.has(file)) return;
    clearTimeout(pending);
    pending = setTimeout(render, 50);
  });
} catch (e) {
  // no T3 cache yet (T3 not installed or never run): the 30 s redraw still picks it up later
  p.log('watch failed', e.message);
}
setInterval(render, 30_000); // reset countdowns, windows that reset, and readings going stale
p.connect();
