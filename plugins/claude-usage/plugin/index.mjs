// Claude Usage plugin: one key with the account's 5-hour and 7-day rate-limit usage.

import { mkdirSync, watch } from 'node:fs';
import { dirname } from 'node:path';
import { createPlugin } from './lib/streamdock.mjs';
import { USAGE_FILE, USAGE_URL, readUsage, usageKey } from './usage.mjs';

const ACTION = 'com.jakubolek.fifine.claude-usage.limits';

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
  keyUp: () => p.open(USAGE_URL),
});

// redraw when the fifine-usage Claude Code plugin writes a new reading
let pending;
try {
  mkdirSync(dirname(USAGE_FILE), { recursive: true });
  watch(dirname(USAGE_FILE), (_e, file) => {
    if (file && !USAGE_FILE.endsWith(file)) return;
    clearTimeout(pending);
    pending = setTimeout(render, 50);
  });
} catch (e) {
  p.log('watch failed', e.message);
}
setInterval(render, 30_000); // reset countdown, and windows that reset with no new reading
p.connect();
