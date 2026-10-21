// Agent Sessions plugin: shows Claude Code sessions and T3 Code threads on keys.
// Each "Claude Session" / "T3 Session" key is a slot; slots are filled in key order (row, then
// column) with sessions sorted by urgency. Pressing a key opens that session.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { dataUrl, tile } from './lib/png.mjs';
import { createPlugin, sleep } from './lib/streamdock.mjs';
import { wrap } from './lib/text.mjs';
import { repoLayers } from './repo.mjs';
import { T3_BUNDLE, approve, spawnedByT3, startT3, t3Sessions, threadUrl } from './t3.mjs';

// Written by ../hooks/session-hook.mjs
const SESSIONS_DIR = join(homedir(), '.claude', 'fifine', 'sessions');
const STALE_MS = 12 * 60 * 60 * 1000;
// Written by ../hooks/permission-hook.mjs while a permission prompt is waiting (used only
// as the "a prompt is open" signal; approving is a ⌘↩ keystroke).
const PENDING_DIR = join(homedir(), '.claude', 'fifine', 'pending');
const CLAUDE_BUNDLE = 'com.anthropic.claudefordesktop';
const ARM_MS = 2 * 60 * 1000; // how long after opening a session a second press approves
const CLAUDE_SESSION_ACTION = 'com.jakubolek.fifine.agent-sessions.claude';
const T3_SESSION_ACTION = 'com.jakubolek.fifine.agent-sessions.t3';

const p = createPlugin('agent-sessions');
const { log, run, osa, open } = p;

mkdirSync(SESSIONS_DIR, { recursive: true });

// ---- visuals
const STATUS = {
  attention: { rank: 0, accent: '#ff4d4f', dot: '#ff4d4f', bg: '#3a1214' },
  done: { rank: 1, accent: '#f5a524', dot: '#f5a524', bg: '#2e2410' },
  working: { rank: 2, accent: null, dot: '#4c8dff', bg: '#141a26' },
  idle: { rank: 3, accent: null, dot: '#5b5b66', bg: '#1b1b1f' },
};
const TILE = {};
for (const [k, s] of Object.entries(STATUS)) TILE[k] = { bg: s.bg, accent: s.accent, dot: s.dot };
// attention keys blink between this and the normal tile
TILE.attentionDim = { bg: '#1b1b1f', accent: '#7a2426', dot: '#7a2426' };
// opened a session with a waiting permission prompt: next press approves it
TILE.armed = { bg: '#10261a', accent: '#2fbf71', dot: '#2fbf71' };
// T3 Session keys show a finished thread in green rather than amber
TILE.t3done = { bg: '#0f1f16', accent: '#3ddc84', dot: '#3ddc84' };
const IMG = {
  empty: dataUrl(tile({ bg: '#0e0e10' })),
  more: dataUrl(tile({ bg: '#1b1b1f' })),
};
for (const [k, t] of Object.entries(TILE)) IMG[k] = dataUrl(tile(t));

// A T3 session tile with its repo header (emoji + name) drawn in; null until that renders.
const sessionImages = new Map(); // `${tile}\0${emoji}\0${project}` -> data url
function sessionImage(kind, repo) {
  const id = `${kind}\0${repo.emoji || ''}\0${repo.project || ''}`;
  if (sessionImages.has(id)) return sessionImages.get(id);
  const layers = repoLayers(repo, { onReady: render, log });
  if (!layers) return null;
  if (sessionImages.size > 500) sessionImages.clear();
  sessionImages.set(id, dataUrl(tile({ ...TILE[kind], layers })));
  return sessionImages.get(id);
}

// ---- session state
const acked = new Map(); // sessionId -> updatedAt the user already looked at

function alive(pid) {
  if (!pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// Claude Code keeps a registry of running sessions in ~/.claude/sessions/<pid>.json with a live
// status (busy / idle / waiting) and, under `claude rc`, the remote session id. It covers sessions
// that started before the hook was installed, so it is the primary source; hook files add
// "finished" (Stop) and the first prompt.
const REGISTRY_DIR = join(homedir(), '.claude', 'sessions');
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

function readJsonDir(dir) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {}
  return files.flatMap((f) => {
    try {
      return [[join(dir, f), JSON.parse(readFileSync(join(dir, f), 'utf8'))]];
    } catch {
      return [];
    }
  });
}

// First thing the user typed in a session, read from its transcript once and cached.
const firstPromptCache = new Map(); // local session id -> prompt ('' when none yet)
function firstPrompt(localId) {
  if (firstPromptCache.get(localId)) return firstPromptCache.get(localId);
  let prompt = '';
  try {
    for (const dir of readdirSync(PROJECTS_DIR)) {
      let text;
      try {
        text = readFileSync(join(PROJECTS_DIR, dir, `${localId}.jsonl`), 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        if (!line.includes('"user"') && !line.includes('"enqueue"')) continue;
        let j;
        try {
          j = JSON.parse(line);
        } catch {
          continue;
        }
        let c = j.type === 'queue-operation' && j.operation === 'enqueue' ? j.content : j.type === 'user' && !j.isMeta ? j.message?.content : null;
        if (Array.isArray(c)) c = c.find((x) => x.type === 'text')?.text;
        if (typeof c === 'string' && c.trim() && !c.startsWith('<')) {
          prompt = c;
          break;
        }
      }
      break;
    }
  } catch {}
  prompt = prompt.replace(/\s+/g, ' ').trim().slice(0, 80);
  firstPromptCache.set(localId, prompt);
  return prompt;
}

const REGISTRY_STATUS = { busy: 'working', waiting: 'attention', idle: 'idle' };

// Claude Code processes T3 Code spawned are its threads; while T3 Session keys are on the deck
// they show there instead of on a Claude Session key.
const shownOnT3Key = (pid) => groups.t3.keys.size > 0 && spawnedByT3(pid, ppidOf);

function ppidOf(pid) {
  try {
    return Number(execFileSync('/bin/ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()) || null;
  } catch {
    return null;
  }
}

function loadSessions() {
  const byKey = new Map();
  for (const [, r] of readJsonDir(REGISTRY_DIR)) {
    if (!r.pid || !alive(r.pid) || shownOnT3Key(r.pid)) continue;
    const remoteId = r.bridgeSessionId || null;
    byKey.set(remoteId || r.sessionId, {
      sessionId: r.sessionId,
      remoteId,
      pid: r.pid,
      tty: null,
      cwd: r.cwd,
      project: basename(r.cwd || '') || '?',
      label: firstPrompt(r.sessionId),
      status: REGISTRY_STATUS[r.status] || 'idle',
      waitingFor: r.waitingFor || '',
      startedAt: r.startedAt || 0,
      updatedAt: r.statusUpdatedAt || r.updatedAt || 0,
    });
  }
  for (const [p, s] of readJsonDir(SESSIONS_DIR)) {
    if (!alive(s.pid) || Date.now() - s.updatedAt > STALE_MS) {
      rmSync(p, { force: true });
      continue;
    }
    if (shownOnT3Key(s.pid)) continue;
    const key = (s.remoteId || '').replace(/^cse_/, 'session_') || s.sessionId;
    const r = byKey.get(key);
    if (!r) {
      byKey.set(key, s);
      continue;
    }
    // whichever reported last wins the status; the hook is the only one that knows "finished"
    const hookNewer = s.updatedAt >= r.updatedAt;
    byKey.set(key, {
      ...r,
      tty: s.tty,
      label: r.label || s.label,
      status: hookNewer || (s.status === 'done' && r.status === 'idle') ? s.status : r.status,
      updatedAt: Math.max(s.updatedAt, r.updatedAt),
    });
  }
  const out = [...byKey.values()];
  for (const [p, req] of readJsonDir(PENDING_DIR)) {
    if (!alive(req.hookPid)) {
      rmSync(p, { force: true });
      continue;
    }
    const s = out.find((x) => x.sessionId === req.sessionId);
    if (s) {
      s.pending = req;
      s.status = 'attention';
    }
  }
  for (const s of out) {
    // A finished session you've already opened goes quiet until something new happens.
    if (s.status === 'done' && acked.get(s.sessionId) >= s.updatedAt) s.status = 'idle';
  }
  return out;
}

// When every session has its own key, keep them in a stable order (oldest first) so keys
// don't jump around; when there are more sessions than keys, the most urgent ones win.
function orderSessions(list, slots) {
  if (list.length <= slots) return list.sort((a, b) => a.startedAt - b.startedAt || a.sessionId.localeCompare(b.sessionId));
  return list.sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || b.updatedAt - a.updatedAt);
}

// ---- keys
// Two kinds of session key, each with its own slots: Claude Session (Claude Code sessions) and
// T3 Session (T3 Code threads).
const groups = {
  claude: { keys: new Map(), slotSession: new Map(), sessions: [], load: loadSessions, more: openMore },
  t3: { keys: new Map(), slotSession: new Map(), sessions: [], load: t3Sessions, more: openT3 },
};
function orderedContexts(g) {
  return [...g.keys.entries()]
    .sort(([, a], [, b]) => (a.device || '').localeCompare(b.device || '') || a.row - b.row || a.col - b.col)
    .map(([ctx]) => ctx);
}

let blink = false;

// Switching pages makes Control Deck announce keys one by one. Drawing after each would lay
// sessions out for 1 key, then 2, … and reshuffle them; wait until the burst is over instead.
let settling = null;
function settleThenRender() {
  clearTimeout(settling);
  settling = setTimeout(() => {
    settling = null;
    render();
  }, 150);
}

function render() {
  if (settling) return;
  for (const g of Object.values(groups)) renderGroup(g);
}

function renderGroup(g) {
  const ctxs = orderedContexts(g);
  const sessions = (g.sessions = orderSessions(g.sessions, ctxs.length));
  const overflow = sessions.length > ctxs.length ? sessions.length - ctxs.length + 1 : 0;
  ctxs.forEach((ctx, i) => {
    let image;
    let title;
    let session = null;
    if (overflow && i === ctxs.length - 1) {
      const rest = sessions.slice(i);
      const urgent = rest.filter((s) => s.status === 'attention' || s.status === 'done').length;
      image = IMG.more;
      title = `+${rest.length}\nmore${urgent ? `\n${urgent} waiting` : ''}`;
    } else if (sessions[i]) {
      session = sessions[i];
      let kind = session.status === 'attention' && blink ? 'attentionDim' : TILE[session.status] ? session.status : 'idle';
      if (g === groups.t3 && session.status === 'done') kind = 't3done';
      if (isArmed(session)) kind = 'armed';
      // colour carries the status; the text is just which session it is. T3 keys draw the repo
      // (with its project emoji) into the image, bigger, so their title is only the thread;
      // until that image exists they use the plain layout.
      image = g === groups.t3 ? sessionImage(kind, session) : null;
      if (image) {
        // two blank lines keep the centred title under the header, where the plain layout's
        // project line and first label line would be
        title = [' ', ' ', ...(isArmed(session) ? ['Allow?', ...wrap(session.pending.tool, 1), ...wrap(session.pending.summary, 1)] : wrap(session.label || '', 3))].join('\n');
      } else {
        image = IMG[kind];
        title = isArmed(session)
          ? ['Allow?', ...wrap(session.pending.tool, 1), ...wrap(session.pending.summary, 3)].join('\n')
          : [...wrap(session.project || '?', 1), ...wrap(session.label || '', 4)].join('\n');
      }
    } else {
      image = IMG.empty;
      title = '';
    }
    g.slotSession.set(ctx, session);
    p.show(ctx, { image, title });
  });
}

function refresh() {
  for (const g of Object.values(groups)) g.sessions = g.load();
  render();
}

// ---- opening a session
function setTtyTitle(tty, title) {
  writeFileSync(`/dev/${tty}`, `\x1b]2;${title}\x07`);
}

// Ghostty has no tty property, so tag the split by briefly retitling it, find it, focus it,
// then put the old title back.
async function focusGhostty(tty) {
  const marker = `fifine-${Math.random().toString(36).slice(2, 10)}`;
  const before = await osa('tell application "Ghostty" to get (id of every terminal) & (name of every terminal)');
  setTtyTitle(tty, marker);
  await sleep(150);
  const id = await osa(`tell application "Ghostty"
    set ts to (every terminal whose name is "${marker}")
    if (count of ts) is 0 then return ""
    set t to item 1 of ts
    focus t
    activate
    return id of t
  end tell`);
  // restore the previous title
  let oldTitle = '';
  if (before && id) {
    const parts = before.split(', ');
    const n = parts.length / 2;
    const idx = parts.slice(0, n).indexOf(id);
    if (idx >= 0) oldTitle = parts[n + idx];
  }
  setTtyTitle(tty, oldTitle);
  return Boolean(id);
}

async function openSession(s) {
  log('open', s.sessionId, s.remoteId, s.tty);
  if (s.status === 'done') acked.set(s.sessionId, s.updatedAt);
  if (s.source === 't3') {
    await open(threadUrl(s.threadId));
  } else if (s.remoteId) {
    const id = s.remoteId.replace(/^cse_/, 'session_');
    await open(`claude://claude.ai/code/${id}`);
  } else if (s.tty) {
    const ok = await focusGhostty(s.tty).catch((e) => (log('ghostty focus failed', e.message), false));
    if (!ok) await open('-a', 'Ghostty');
  } else {
    await open('-a', 'Ghostty');
  }
  refresh();
}

// ---- approving from the deck
// The desktop app doesn't say which session it is showing, so "open" means: we opened this
// session's waiting prompt from the deck less than ARM_MS ago, and Claude is still in front.
const armed = new Map(); // sessionId -> { requestId, at }

function isArmed(s) {
  const a = s.pending && armed.get(s.sessionId);
  return Boolean(a && a.requestId === s.pending.requestId && Date.now() - a.at < ARM_MS);
}

async function frontmostBundle() {
  const asn = await run('/usr/bin/lsappinfo', ['front']);
  if (!asn) return null;
  const info = await run('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', asn]);
  return info?.match(/"CFBundleIdentifier"="([^"]+)"/)?.[1] ?? null;
}

// Approve by pressing ⌘↩ on the prompt the app is showing. Needs Accessibility access for
// StreamDock (System Settings → Privacy & Security → Accessibility).
async function pressSession(ctx, s) {
  // T3 Code: the second press answers the request through T3's server, no keystroke needed.
  if (s.source === 't3' && s.pending && isArmed(s) && (await frontmostBundle()) === T3_BUNDLE) {
    log('t3 approve', s.threadId, s.pending.requestId, s.pending.tool);
    armed.delete(s.sessionId);
    const res = await approve(s.threadId, s.pending.requestId);
    if (!res.ok) log('t3 approve failed', res.error);
    (res.ok ? p.showOk : p.showAlert)(ctx);
    refresh();
    return;
  }
  if (s.pending && isArmed(s) && (await frontmostBundle()) === CLAUDE_BUNDLE) {
    log('approve', s.sessionId, s.pending.tool, s.pending.summary);
    armed.delete(s.sessionId);
    const ok = (await osa('tell application "System Events" to key code 36 using command down')) !== null;
    (ok ? p.showOk : p.showAlert)(ctx);
    return;
  }
  if (s.pending) armed.set(s.sessionId, { requestId: s.pending.requestId, at: Date.now() });
  await openSession(s);
}

async function openT3() {
  await open('-b', T3_BUNDLE);
}

async function openMore() {
  // Overflow key: jump to the desktop app's "waiting for you" list.
  await open('claude://code/needs-input?source=fifine');
}

// ---- keys
for (const [uuid, g] of [
  [CLAUDE_SESSION_ACTION, groups.claude],
  [T3_SESSION_ACTION, groups.t3],
]) {
  p.action(uuid, {
    willAppear: (ctx, { device, payload }) => {
      const c = payload?.coordinates || {};
      g.keys.set(ctx, { device, row: c.row ?? 0, col: c.column ?? 0 });
      settleThenRender();
    },
    willDisappear: (ctx) => {
      g.keys.delete(ctx);
      g.slotSession.delete(ctx);
      settleThenRender();
    },
    keyDown: (ctx) => {
      const ctxs = orderedContexts(g);
      const session = g.slotSession.get(ctx);
      if (session) pressSession(ctx, session);
      else if (g.sessions.length > ctxs.length && ctx === ctxs[ctxs.length - 1]) g.more();
    },
  });
}

// ---- watchers
let pending;
for (const dir of [SESSIONS_DIR, PENDING_DIR]) {
  try {
    mkdirSync(dir, { recursive: true });
    watch(dir, () => {
      clearTimeout(pending);
      pending = setTimeout(refresh, 50);
    });
  } catch (e) {
    log('watch failed', dir, e.message);
  }
}
setInterval(refresh, 3000); // pid liveness + safety net for missed fs events
setInterval(() => {
  blink = !blink;
  if (Object.values(groups).some((g) => g.sessions.some((s) => s.status === 'attention'))) render();
}, 700);

startT3({
  log,
  onChange: () => {
    clearTimeout(pending);
    pending = setTimeout(refresh, 50);
  },
});
refresh();
p.connect();
