// System Monitor plugin: keys with the Mac's CPU, memory, disk and network activity, each with a
// graph of the last two minutes. Pressing any of them opens Activity Monitor.

import { createPlugin } from './lib/streamdock.mjs';
import { HISTORY, keyImage } from './draw.mjs';
import { createSampler } from './sample.mjs';

const PREFIX = 'com.jakubolek.fifine.system-monitor';
const KINDS = ['overview', 'cpu', 'memory', 'disk', 'network'];
const INTERVAL_MS = 2000;

const p = createPlugin('system-monitor');
const sampler = createSampler(p.run);
const keys = new Map(); // context -> kind
const history = []; // readings, oldest first
let timer = null;

function render() {
  for (const [ctx, kind] of keys) p.show(ctx, { image: keyImage(kind, history), title: '' });
}

// Readings are only taken while a key is on screen. After a pause the graphs start over, so they
// never join readings minutes apart.
async function tick() {
  try {
    history.push(await sampler.read());
    if (history.length > HISTORY) history.shift();
    render();
  } catch (e) {
    p.log('sample failed', e.stack || e.message);
  }
  timer = keys.size ? setTimeout(tick, INTERVAL_MS) : null;
}

function start() {
  if (timer) return;
  history.length = 0;
  sampler.reset();
  timer = setTimeout(tick, 0);
}

for (const kind of KINDS) {
  p.action(`${PREFIX}.${kind}`, {
    willAppear: (ctx) => {
      keys.set(ctx, kind);
      render();
      start();
    },
    willDisappear: (ctx) => keys.delete(ctx),
    keyUp: () => p.open('-a', 'Activity Monitor'),
  });
}

p.connect();
