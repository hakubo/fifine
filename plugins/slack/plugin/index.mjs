// Slack plugin: the Slack icon with Slack's unread badge; press to open Slack.

import { createPlugin } from './lib/streamdock.mjs';
import { SLACK_BUNDLE, readBadge, slackKey } from './slack.mjs';

const ACTION = 'com.jakubolek.fifine.slack.badge';

const p = createPlugin('slack');
const keys = new Set();
let badge = null;
let reading = false;

// Only polled while a Slack key is on the deck.
async function refresh() {
  if (keys.size === 0 || reading) return;
  reading = true;
  const next = await readBadge();
  reading = false;
  if (next.running !== badge?.running || next.label !== badge?.label) p.log('slack badge', next);
  badge = next;
  p.show(keys, slackKey(badge));
}

p.action(ACTION, {
  willAppear: (ctx) => {
    keys.add(ctx);
    p.show(ctx, slackKey(badge));
    refresh();
  },
  willDisappear: (ctx) => keys.delete(ctx),
  keyDown: () => p.open('-b', SLACK_BUNDLE).then(refresh),
});

setInterval(refresh, 3000);
p.connect();
