// Tap, double tap and long press for a key, built from Control Deck's keyDown/keyUp. Spread the
// result into an action's handlers:
//
//   p.action(uuid, { willAppear, ...gestures({ tap, doubleTap, longPress }) });
//
// A long press fires while the key is still held. With a doubleTap handler, a single tap waits out
// the double-tap window before firing; without one it fires on release. Handlers get (ctx, msg).

export function gestures({ tap, doubleTap, longPress }, { holdMs = 500, doubleMs = 300 } = {}) {
  const keys = new Map(); // context -> { holdTimer, tapTimer, done }

  function keyDown(ctx, msg) {
    const key = keys.get(ctx) ?? {};
    keys.set(ctx, key);
    // second press inside the window: a double tap, and its release is ignored
    if (key.tapTimer) {
      clearTimeout(key.tapTimer);
      key.tapTimer = null;
      key.done = true;
      doubleTap(ctx, msg);
      return;
    }
    key.done = false;
    if (longPress)
      key.holdTimer = setTimeout(() => {
        key.holdTimer = null;
        key.done = true;
        longPress(ctx, msg);
      }, holdMs);
  }

  function keyUp(ctx, msg) {
    const key = keys.get(ctx);
    if (!key) return;
    clearTimeout(key.holdTimer);
    key.holdTimer = null;
    if (key.done) return;
    if (!doubleTap) return tap?.(ctx, msg);
    key.tapTimer = setTimeout(() => {
      key.tapTimer = null;
      tap?.(ctx, msg);
    }, doubleMs);
  }

  return { keyDown, keyUp };
}
