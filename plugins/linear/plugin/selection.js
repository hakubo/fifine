// osascript -l JavaScript selection.js
//
// Prints the text selected in the frontmost app, or nothing when there is no selection.
// It presses ⌘C and reads the clipboard, then puts the clipboard back as it was (every item and
// type, so copied images or files survive). If ⌘C leaves the clipboard unchanged, nothing was
// selected. The keystroke needs Accessibility access for Control Deck.

ObjC.import('AppKit');

function run() {
  const pb = $.NSPasteboard.generalPasteboard;
  const before = pb.changeCount;

  // the clipboard as it is now: [[type, data], ...] per item
  const saved = [];
  const items = pb.pasteboardItems;
  for (let i = 0; i < (items.isNil() ? 0 : items.count); i++) {
    const item = items.objectAtIndex(i);
    const types = item.types;
    const entry = [];
    for (let j = 0; j < types.count; j++) {
      const type = types.objectAtIndex(j);
      const data = item.dataForType(type);
      if (!data.isNil()) entry.push([type, $.NSData.dataWithData(data)]);
    }
    saved.push(entry);
  }

  Application('System Events').keystroke('c', { using: 'command down' });

  // apps copy asynchronously; give them up to half a second
  let copied = false;
  for (let i = 0; i < 25 && !copied; i++) {
    delay(0.02);
    copied = pb.changeCount !== before;
  }
  if (!copied) return '';

  delay(0.05); // let the app finish writing every type
  const text = pb.stringForType($.NSPasteboardTypeString);

  pb.clearContents;
  const restored = $.NSMutableArray.array;
  for (const entry of saved) {
    const item = $.NSPasteboardItem.alloc.init;
    for (const [type, data] of entry) item.setDataForType(data, type);
    restored.addObject(item);
  }
  if (restored.count > 0) pb.writeObjects(restored);

  return text.isNil() ? '' : text.js;
}
