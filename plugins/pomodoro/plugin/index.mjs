// Pomodoro plugin: a focus/break timer on a key, with today's finished pomodoros and a chime when a
// phase ends. Press to start, pause or resume; hold to reset to a fresh focus session.

import { createPlugin } from './lib/streamdock.mjs';
import { keyImage } from './draw.mjs';
import { createTimer } from './pomodoro.mjs';

const ACTION = 'com.jakubolek.fifine.pomodoro.timer';
const HOLD_MS = 700;

const p = createPlugin('pomodoro');
const timer = createTimer(p.log);
const keys = new Set();
const holds = new Map(); // context -> { timer, fired }

function render() {
  const image = keyImage(timer.snapshot());
  p.show(keys, { image, title: '' });
}

// The timer runs (and the chime plays) whether or not a key is on screen; drawing only happens
// while one is. Faster ticks while blinking.
function loop() {
  timer.tick();
  if (keys.size) render();
  setTimeout(loop, timer.alerting() ? 125 : 250);
}

p.action(ACTION, {
  willAppear: (ctx, msg) => {
    keys.add(ctx);
    if (msg.payload?.settings) timer.configure(msg.payload.settings);
    render();
  },
  willDisappear: (ctx) => keys.delete(ctx),
  didReceiveSettings: (ctx, msg) => {
    timer.configure(msg.payload?.settings);
    render();
  },
  keyDown: (ctx) => {
    const hold = { fired: false };
    hold.timer = setTimeout(() => {
      hold.fired = true;
      timer.reset();
      p.showOk(ctx);
      render();
    }, HOLD_MS);
    holds.set(ctx, hold);
  },
  keyUp: (ctx) => {
    const hold = holds.get(ctx);
    holds.delete(ctx);
    clearTimeout(hold?.timer);
    if (hold?.fired) return;
    timer.press();
    render();
  },
  // from the settings panel (../pi/index.html)
  sendToPlugin: (ctx, msg) => {
    if (msg.payload?.request === 'settings') {
      p.send({ event: 'sendToPropertyInspector', action: ACTION, context: ctx, payload: { settings: timer.settings() } });
      return;
    }
    if (msg.payload?.settings) timer.configure(msg.payload.settings);
    if (msg.payload?.preview) timer.preview(msg.payload.preview);
    render();
  },
});

p.connect();
loop();
