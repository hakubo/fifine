// Linear plugin:
//   Linear        the Linear icon with the unread inbox count; tap opens Linear, hold opens the inbox
//   Linear Cycle  a team's active cycle progress; tap opens the cycle filtered to my issues
// Both read Linear's API with one shared personal API key (api.mjs), set in either key's panel.

import { listTeams, loadApiKey, saveApiKey } from './api.mjs';
import { cycleKey, cycleUrl, myCycleView, readCycle, viewUrl } from './cycle.mjs';
import { gestures } from './lib/gestures.mjs';
import { createPlugin } from './lib/streamdock.mjs';
import { LINEAR_BUNDLE, inboxUrl, lastWorkspace, linearKey, readDockBadge, readInbox } from './linear.mjs';

const BADGE_ACTION = 'com.jakubolek.fifine.linear.badge';
const CYCLE_ACTION = 'com.jakubolek.fifine.linear.cycle';
const INBOX_EVERY = 30 * 1000; // ms between inbox reads; a Dock badge change triggers one sooner
const CYCLE_EVERY = 5 * 60 * 1000; // cycle progress moves slowly

const p = createPlugin('linear');
let apiKey = loadApiKey();
let workspace = null; // the organization's urlKey, from the inbox read

// ---- shared API key and settings panels

function setApiKey(next) {
  next = (next || '').trim();
  if (next === apiKey) return;
  apiKey = next;
  saveApiKey(apiKey);
  p.log('api key', apiKey ? 'set' : 'cleared');
  inbox = null;
  cycles.clear();
  refreshBadge({ force: true });
  refreshCycles({ force: true });
}

const toPanel = (ctx, action, payload) => p.send({ event: 'sendToPropertyInspector', action, context: ctx, payload });

function badgeStatus() {
  return !apiKey ? 'none' : inbox?.error ? `error: ${inbox.error}` : inbox ? `ok: ${inbox.count} unread` : 'checking';
}

function cycleStatus(ctx) {
  const state = cycles.get(cycleKeys.get(ctx)?.teamId || '');
  if (!apiKey) return 'none';
  if (!state) return 'checking';
  if (state.error) return `error: ${state.error}`;
  return state.cycle ? `ok: ${state.team.name}, cycle ${state.cycle.number}` : `ok: ${state.team.name} has no active cycle`;
}

function panelStatus() {
  for (const ctx of badgeKeys.keys()) toPanel(ctx, BADGE_ACTION, { hasKey: !!apiKey, status: badgeStatus() });
  for (const ctx of cycleKeys.keys()) toPanel(ctx, CYCLE_ACTION, { hasKey: !!apiKey, status: cycleStatus(ctx) });
}

// messages from the settings panel (../pi/index.html)
async function fromPanel(ctx, msg, action, setSettings) {
  const { payload = {} } = msg;
  if ('apiKey' in payload) setApiKey(payload.apiKey);
  if (payload.settings) setSettings(ctx, payload.settings);
  if (payload.request === 'teams') toPanel(ctx, action, { teams: await listTeams(apiKey) });
  panelStatus();
}

// ---- Linear (inbox badge)

const badgeKeys = new Map(); // context -> settings
let dock = { running: true, label: '' };
let inbox = null; // { count, workspace } | { error }
let lastInboxRead = 0;
let badgeBusy = false;

function badgeLabel() {
  if (inbox && !inbox.error) return inbox.count > 0 ? String(inbox.count) : '';
  return dock.label; // no API key (or the API failed): Linear's own dot
}

const renderBadge = () => p.show(badgeKeys.keys(), linearKey(badgeLabel(), dock.running));

// Only polled while a Linear key is on the deck.
async function refreshBadge({ force = false } = {}) {
  if (badgeKeys.size === 0 || badgeBusy) return;
  badgeBusy = true;
  const nextDock = await readDockBadge();
  const changed = nextDock.label !== dock.label || nextDock.running !== dock.running;
  dock = nextDock;
  if (apiKey && (force || changed || Date.now() - lastInboxRead > INBOX_EVERY)) {
    lastInboxRead = Date.now();
    const next = await readInbox(apiKey);
    if (next.workspace) workspace = next.workspace;
    if (next.error !== inbox?.error || next.count !== inbox?.count) {
      p.log('linear inbox', next);
      inbox = next;
      panelStatus();
    }
  }
  badgeBusy = false;
  renderBadge();
}

function setBadgeSettings(ctx, settings = {}) {
  // older versions kept the API key in the key's settings
  if (settings.apiKey && !apiKey) setApiKey(settings.apiKey);
  badgeKeys.set(ctx, settings);
  renderBadge();
  refreshBadge();
}

const currentWorkspace = () => workspace || lastWorkspace();

p.action(BADGE_ACTION, {
  willAppear: (ctx, msg) => setBadgeSettings(ctx, msg.payload?.settings),
  didReceiveSettings: (ctx, msg) => setBadgeSettings(ctx, msg.payload?.settings),
  willDisappear: (ctx) => badgeKeys.delete(ctx),
  ...gestures({
    tap: () => p.open('-b', LINEAR_BUNDLE),
    longPress: () => p.open(inboxUrl(currentWorkspace())).then(() => setTimeout(() => refreshBadge({ force: true }), 3000)),
  }),
  sendToPlugin: (ctx, msg) => fromPanel(ctx, msg, BADGE_ACTION, setBadgeSettings),
});

// ---- Linear Cycle

const cycleKeys = new Map(); // context -> settings { teamId }
const cycles = new Map(); // teamId ('' for the default team) -> readCycle() result
const cycleReads = new Map(); // teamId -> time of the last read
let cycleBusy = false;

function renderCycle(ctx) {
  const state = cycles.get(cycleKeys.get(ctx)?.teamId || '');
  const hour = Math.floor(Date.now() / 3600000) * 3600000; // "days left" only needs the hour
  const shown = !apiKey
    ? { message: 'SET KEY' }
    : !state
      ? { message: 'CYCLE' }
      : state.error
        ? { message: 'ERROR' }
        : state.cycle
          ? { cycle: state.cycle, now: hour }
          : { message: 'NO CYCLE' };
  p.show(ctx, cycleKey(shown));
}

const renderCycles = () => cycleKeys.forEach((_, ctx) => renderCycle(ctx));

async function refreshCycles({ force = false } = {}) {
  if (cycleKeys.size === 0 || cycleBusy || !apiKey) return renderCycles();
  cycleBusy = true;
  const teams = new Set([...cycleKeys.values()].map((s) => s.teamId || ''));
  for (const teamId of teams) {
    if (!force && cycles.has(teamId) && Date.now() - (cycleReads.get(teamId) || 0) < CYCLE_EVERY) continue;
    cycleReads.set(teamId, Date.now());
    const next = await readCycle(apiKey, teamId);
    if (next.workspace) workspace = next.workspace;
    const before = cycles.get(teamId);
    if (JSON.stringify(next) !== JSON.stringify(before)) p.log('linear cycle', teamId || '(default team)', next);
    cycles.set(teamId, next);
  }
  cycleBusy = false;
  renderCycles();
  panelStatus();
}

function setCycleSettings(ctx, settings = {}) {
  cycleKeys.set(ctx, settings);
  renderCycle(ctx);
  refreshCycles();
}

p.action(CYCLE_ACTION, {
  willAppear: (ctx, msg) => setCycleSettings(ctx, msg.payload?.settings),
  didReceiveSettings: (ctx, msg) => setCycleSettings(ctx, msg.payload?.settings),
  willDisappear: (ctx) => cycleKeys.delete(ctx),
  keyDown: async (ctx) => {
    const team = cycles.get(cycleKeys.get(ctx)?.teamId || '')?.team;
    const ws = currentWorkspace();
    if (!team || !ws) await p.open('-b', LINEAR_BUNDLE);
    else {
      // the active cycle filtered to my issues; the whole cycle if the view can't be made
      const view = await myCycleView(apiKey, team.id);
      if (view.error) p.log('my cycle view failed, opening the whole cycle', view.error);
      await p.open(view.error ? cycleUrl(ws, team.key) : viewUrl(ws, view));
    }
    refreshCycles({ force: true });
  },
  sendToPlugin: (ctx, msg) => fromPanel(ctx, msg, CYCLE_ACTION, setCycleSettings),
});

setInterval(refreshBadge, 3000);
setInterval(refreshCycles, 60 * 1000);
p.connect();
