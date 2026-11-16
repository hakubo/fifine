// Notion plugin: the Notion icon with the unread Inbox count; press to open Notion.

import { createPlugin } from './lib/streamdock.mjs';
import { NOTION_BUNDLE, notionKey, readBadge } from './notion.mjs';

const ACTION = 'com.jakubolek.fifine.notion.badge';

const p = createPlugin('notion');
const keys = new Set();
let badge = null;
let reading = false;

// Only polled while a Notion key is on the deck.
async function refresh() {
  if (keys.size === 0 || reading) return;
  reading = true;
  const next = await readBadge();
  reading = false;
  if (next.running !== badge?.running || next.label !== badge?.label) p.log('notion badge', next);
  badge = next;
  p.show(keys, notionKey(badge));
}

p.action(ACTION, {
  willAppear: (ctx) => {
    keys.add(ctx);
    p.show(ctx, notionKey(badge));
    refresh();
  },
  willDisappear: (ctx) => keys.delete(ctx),
  keyDown: () => p.open('-b', NOTION_BUNDLE).then(refresh),
});

setInterval(refresh, 3000);
p.connect();
