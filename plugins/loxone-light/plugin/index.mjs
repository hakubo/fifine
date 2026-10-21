// Loxone Light plugin: cycles a room's light moods and shows the active one. Each key's light is
// picked in its settings in Control Deck.

import { createPlugin } from './lib/streamdock.mjs';
import { configured, lightKey, listControllers, nextMood, watchLight } from './light.mjs';

const ACTION = 'com.jakubolek.fifine.loxone-light.mood';

const p = createPlugin('loxone-light');
const keys = new Map(); // context -> settings { uuid, room, control, label }
const watchers = new Map(); // controller uuid -> { stop, state, idle }

function render(ctx) {
  const light = keys.get(ctx);
  p.show(ctx, lightKey(light, watchers.get(light?.uuid)?.state));
}

// One `lox stream` per controller, only while a key shows it. Stopping waits a while, so a profile
// flip on app focus (key gone, back a moment later) keeps the stream and its last reading.
const GRACE_MS = 30_000;
function syncWatchers() {
  const wanted = new Map([...keys.values()].filter(configured).map((l) => [l.uuid, l]));
  for (const [uuid, light] of wanted) {
    const w = watchers.get(uuid);
    if (w) {
      clearTimeout(w.idle);
      w.idle = null;
      continue;
    }
    const entry = { state: null, idle: null };
    entry.stop = watchLight(
      light,
      (state) => {
        entry.state = state;
        for (const [ctx, l] of keys) if (l.uuid === uuid) render(ctx);
      },
      p.log,
    );
    watchers.set(uuid, entry);
  }
  for (const [uuid, w] of watchers) {
    if (wanted.has(uuid) || w.idle) continue;
    w.idle = setTimeout(() => {
      w.stop();
      watchers.delete(uuid);
    }, GRACE_MS);
  }
}

function setLight(ctx, settings) {
  const before = keys.get(ctx);
  keys.set(ctx, settings ?? {});
  // a different controller: restart its stream so the key gets a fresh reading
  if (before?.uuid && before.uuid !== settings?.uuid) {
    const w = watchers.get(before.uuid);
    if (w && ![...keys.values()].some((l) => l.uuid === before.uuid)) {
      clearTimeout(w.idle);
      w.stop();
      watchers.delete(before.uuid);
    }
  }
  syncWatchers();
  render(ctx);
}

p.action(ACTION, {
  willAppear: (ctx, msg) => setLight(ctx, msg.payload?.settings),
  didReceiveSettings: (ctx, msg) => setLight(ctx, msg.payload?.settings),
  willDisappear: (ctx) => {
    keys.delete(ctx);
    syncWatchers();
  },
  keyDown: async (ctx) => {
    const err = await nextMood(keys.get(ctx));
    if (err) {
      p.log('light press failed', err);
      p.showAlert(ctx);
    }
  },
  // from the settings panel (../pi/index.html)
  sendToPlugin: async (ctx, msg) => {
    if (msg.payload?.request === 'controllers') {
      const controllers = await listControllers();
      if (controllers.error) p.log('lox ls failed', controllers.error);
      p.send({ event: 'sendToPropertyInspector', action: ACTION, context: ctx, payload: { controllers } });
    } else if (msg.payload?.settings) {
      setLight(ctx, msg.payload.settings);
    }
  },
});

p.connect();
