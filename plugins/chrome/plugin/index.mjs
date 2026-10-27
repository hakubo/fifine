// Chrome plugin: one key that cycles through the open Google Chrome windows.
//
// Each press sends the backmost visible window to the front, so repeated presses visit every
// window in turn. Minimized windows are skipped. If Chrome isn't running, or Chrome isn't the
// frontmost app yet, the first press just brings it forward.

import { createPlugin } from './lib/streamdock.mjs';

const ACTION = 'com.jakubolek.fifine.chrome.cycle';
const CHROME_BUNDLE = 'com.google.Chrome';

const p = createPlugin('chrome');

const CYCLE = `
if application id "${CHROME_BUNDLE}" is not running then return "launch"
tell application "System Events" to set frontApp to bundle identifier of first process whose frontmost is true
tell application id "${CHROME_BUNDLE}"
  set shown to {}
  repeat with w in windows
    if not minimized of w then set end of shown to contents of w
  end repeat
  if (count of shown) is 0 then
    activate
    return "no windows"
  end if
  if frontApp is "${CHROME_BUNDLE}" and (count of shown) > 1 then set index of (last item of shown) to 1
  activate
  return (count of shown) as text
end tell`;

p.action(ACTION, {
  keyDown: async () => {
    const out = await p.osa(CYCLE);
    if (out === 'launch') await p.open('-b', CHROME_BUNDLE);
    p.log('cycle', out);
  },
});

p.connect();
