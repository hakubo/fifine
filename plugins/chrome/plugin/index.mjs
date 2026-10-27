// Chrome plugin: one key that cycles through the open Google Chrome windows.
//
// Each press brings forward the window that comes after the front one in a fixed order (by
// Chrome's window id, i.e. the order they were opened), wrapping around, so repeated presses
// visit every window in turn. Raising the backmost window instead (going by z-order) only ever
// toggled between two of them. Minimized and hidden windows are skipped. If Chrome isn't running, or Chrome isn't the
// frontmost app yet, the first press just brings it forward.

import { createPlugin } from './lib/streamdock.mjs';

const ACTION = 'com.jakubolek.fifine.chrome.cycle';
const CHROME_BUNDLE = 'com.google.Chrome';

const p = createPlugin('chrome');

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

p.action(ACTION, {
  keyDown: async () => {
    const out = await p.osa(CYCLE);
    if (out === 'launch') await p.open('-b', CHROME_BUNDLE);
    p.log('cycle', out);
  },
});

p.connect();
