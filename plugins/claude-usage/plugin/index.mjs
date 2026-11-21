// AI Usage plugin: one key with Claude's and Antigravity's 5-hour and weekly usage, read from T3
// Code's provider cache. Tap opens T3 Code, double tap starts a new T3 thread (⌘N in T3).

import { watch } from 'node:fs';
import { gestures } from './lib/gestures.mjs';
import { createPlugin } from './lib/streamdock.mjs';
import { PROVIDERS, T3_CACHE_DIR, readUsage, usageKey } from './usage.mjs';

// kept from the Claude-only key, so keys already on the deck carry over
const ACTION = 'com.jakubolek.fifine.claude-usage.limits';
const T3_BUNDLE = 'com.t3tools.t3code';
// T3's `t3code://new` link only opens with a prompt ("This link has no prompt."), so a new, empty
// thread is T3's own ⌘N (chat.new), pressed once T3 is in front. The keystroke needs Accessibility
// access for Control Deck, which the Linear and Claude Session keys already rely on.
const NEW_THREAD = `
  tell application id "${T3_BUNDLE}" to activate
  repeat 20 times
    tell application "System Events" to if bundle identifier of first process whose frontmost is true is "${T3_BUNDLE}" then exit repeat
    delay 0.1
  end repeat
  tell application "System Events" to keystroke "n" using command down`;

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
    doubleTap: () => p.osa(NEW_THREAD),
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
