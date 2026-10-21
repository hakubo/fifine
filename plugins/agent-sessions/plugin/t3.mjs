// T3 Code threads as deck sessions. Talks to the T3 Code desktop app's local server the way its
// own web client does: a bearer token (issued with the bundled `t3` CLI) buys a short-lived
// WebSocket ticket, and the socket speaks Effect RPC as JSON frames. `orchestration.subscribeShell`
// streams every thread with its status and pending approval; `orchestration.dispatchCommand`
// answers an approval. The protocol is T3's internal one and may change between releases.

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

export const T3_BUNDLE = 'com.t3tools.t3code';
const USERDATA = join(homedir(), '.t3', 'userdata');
const T3_CLI = join(homedir(), '.t3', 'bin', 't3');
const TOKEN_FILE = join(homedir(), '.claude', 'fifine', 't3-token.json');
const PROTOCOL = 2; // the server answers 426 to clients that don't declare orchestration protocol 2
const RECENT_MS = 12 * 60 * 60 * 1000; // finished threads stay on the deck this long
const RETRY_MS = 10_000;
const ACTIVE = new Set(['preparing', 'queued', 'starting', 'running']);
// Request kinds a single "allow" answers; questions (user_input, mcp-elicitation, …) only open.
const APPROVABLE = { command: 'Command', 'file-read': 'Read file', 'file-change': 'Edit file', permission: 'Permission' };

let log = () => {};
let onChange = () => {};
let ws = null;
let connected = false;
let serverPid = null;
let environmentId = null;
let retry = null;
let nextId = 1;
const calls = new Map(); // rpc id -> { resolve, timer }
const threads = new Map(); // threadId -> thread shell
const projects = new Map(); // projectId -> { title, emoji }
const firstSeen = new Map(); // threadId -> ms, keeps key order stable

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const ms = (iso) => (iso ? Date.parse(iso) || 0 : 0);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function issueToken() {
  return new Promise((resolve) => {
    execFile(
      T3_CLI,
      ['auth', 'session', 'issue', '--scope', 'orchestration:read', '--scope', 'orchestration:operate', '--ttl', '30d', '--label', 'fifine D6', '--json'],
      { timeout: 30_000 },
      (err, stdout) => {
        if (err) {
          log('t3 token issue failed', err.message);
          return resolve(null);
        }
        try {
          const { token, expiresAt } = JSON.parse(stdout);
          writeFileSync(TOKEN_FILE, JSON.stringify({ token, expiresAt }));
          chmodSync(TOKEN_FILE, 0o600);
          log('t3 token issued, expires', expiresAt);
          resolve(token);
        } catch (e) {
          log('t3 token parse failed', e.message);
          resolve(null);
        }
      },
    );
  });
}

async function token({ fresh = false } = {}) {
  const saved = readJson(TOKEN_FILE);
  if (!fresh && saved?.token && ms(saved.expiresAt) - Date.now() > 24 * 60 * 60 * 1000) return saved.token;
  return issueToken();
}

async function ticket(origin) {
  for (const fresh of [false, true]) {
    const t = await token({ fresh });
    if (!t) return null;
    const res = await fetch(`${origin}/api/auth/websocket-ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (res.ok) return (await res.json()).ticket;
    log('t3 ticket refused', res.status);
    if (res.status !== 401 && res.status !== 403) return null; // only a bad token is worth re-issuing
  }
  return null;
}

function reset() {
  connected = false;
  threads.clear();
  for (const { resolve, timer } of calls.values()) {
    clearTimeout(timer);
    resolve({ ok: false, error: 'disconnected' });
  }
  calls.clear();
  onChange();
}

function scheduleRetry() {
  clearTimeout(retry);
  retry = setTimeout(connect, RETRY_MS);
}

async function connect() {
  clearTimeout(retry);
  const runtime = readJson(join(USERDATA, 'server-runtime.json'));
  if (!runtime?.origin || !runtime.pid || !alive(runtime.pid)) return scheduleRetry(); // T3 Code isn't running
  serverPid = runtime.pid;
  try {
    environmentId = readFileSync(join(USERDATA, 'environment-id'), 'utf8').trim();
    const tk = await ticket(runtime.origin);
    if (!tk) return scheduleRetry();
    const url = `${runtime.origin.replace(/^http/, 'ws')}/ws?wsTicket=${encodeURIComponent(tk)}&orchestrationProtocol=${PROTOCOL}`;
    ws = new WebSocket(url);
  } catch (e) {
    log('t3 connect failed', e.message);
    return scheduleRetry();
  }
  ws.on('open', () => {
    connected = true;
    log('t3 connected', runtime.origin);
    rpc('orchestration.subscribeShell', {}, { stream: true });
  });
  ws.on('message', (data) => {
    let msgs;
    try {
      msgs = [].concat(JSON.parse(data.toString()));
    } catch {
      return;
    }
    for (const msg of msgs) handle(msg);
  });
  ws.on('close', (code) => {
    log('t3 socket closed', code);
    ws = null;
    reset();
    scheduleRetry();
  });
  ws.on('error', (e) => log('t3 socket error', e.message));
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

let shellId = null;
function rpc(tag, payload, { stream = false } = {}) {
  const id = String(nextId++);
  if (stream) shellId = id;
  send({ _tag: 'Request', id, tag, payload, headers: [] });
  if (stream) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      calls.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, 10_000);
    calls.set(id, { resolve, timer });
  });
}

function handle(msg) {
  switch (msg._tag) {
    case 'Ping':
      return send({ _tag: 'Pong' });
    case 'Chunk':
      send({ _tag: 'Ack', requestId: msg.requestId });
      if (msg.requestId === shellId) {
        for (const item of msg.values || []) shellItem(item);
        onChange();
      }
      return;
    case 'Exit': {
      const call = calls.get(msg.requestId);
      if (msg.requestId === shellId) {
        log('t3 shell stream ended', JSON.stringify(msg.exit).slice(0, 300));
        ws?.close(); // reconnect and resubscribe
      }
      if (!call) return;
      calls.delete(msg.requestId);
      clearTimeout(call.timer);
      const ok = msg.exit?._tag === 'Success';
      call.resolve(ok ? { ok, value: msg.exit.value } : { ok, error: JSON.stringify(msg.exit).slice(0, 300) });
      return;
    }
    case 'Defect':
    case 'ClientProtocolError':
      log('t3 rpc', msg._tag, JSON.stringify(msg).slice(0, 300));
  }
}

function putThread(t) {
  // subagent threads belong to their parent's key
  if (t.lineage?.relationshipToParent === 'subagent') return;
  if (!firstSeen.has(t.id)) firstSeen.set(t.id, Date.now() + firstSeen.size);
  threads.set(t.id, t);
}

// the emoji picked in T3 Code's project settings (it also offers icons, which a key can't draw)
function putProject(p) {
  projects.set(p.id, { title: p.title, emoji: p.projectIcon?.kind === 'emoji' ? p.projectIcon.emoji : null });
}

function shellItem(item) {
  switch (item.kind) {
    case 'snapshot': {
      for (const p of item.snapshot.projects || []) putProject(p);
      // enrichment refreshes resend projects only; the initial snapshot is authoritative
      if (item.resolvedRepositoryIdentityRoots) return;
      threads.clear();
      for (const t of item.snapshot.threads || []) putThread(t);
      return;
    }
    case 'project.updated':
      putProject(item.project);
      return;
    case 'thread.updated':
      if (item.location === 'archive') threads.delete(item.thread.id);
      else putThread(item.thread);
      return;
    case 'thread.removed':
      threads.delete(item.threadId);
  }
}

function statusOf(t) {
  if (t.pendingRuntimeRequest || t.activityRunStatus === 'waiting' || t.status === 'waiting') return 'attention';
  if (ACTIVE.has(t.status) || ACTIVE.has(t.activityRunStatus)) return 'working';
  // T3 keeps a thread "completed" for good; it's only news until someone opens it in T3 Code
  const finished = t.status === 'completed' || t.status === 'failed';
  if (finished && ms(t.lastVisitedAt) < ms(t.latestRunCompletedAt)) return 'done';
  return 'idle';
}

// Threads shaped like the plugin's Claude sessions. Idle threads drop off after RECENT_MS.
export function t3Sessions() {
  const now = Date.now();
  const out = [];
  for (const t of threads.values()) {
    const status = statusOf(t);
    const lastActive = Math.max(ms(t.latestRunCompletedAt), ms(t.latestRunStartedAt), ms(t.latestRunRequestedAt), ms(t.latestUserMessageAt));
    if (status !== 'attention' && status !== 'working' && now - lastActive > RECENT_MS) continue;
    const req = t.pendingRuntimeRequest;
    out.push({
      source: 't3',
      sessionId: `t3:${t.id}`,
      threadId: t.id,
      project: projects.get(t.projectId)?.title || '?',
      emoji: projects.get(t.projectId)?.emoji || null,
      label: t.title,
      status,
      startedAt: firstSeen.get(t.id),
      updatedAt: ms(t.latestRunCompletedAt) || lastActive,
      pending: req && APPROVABLE[req.kind] ? { requestId: req.id, tool: APPROVABLE[req.kind], summary: t.title } : null,
    });
  }
  return out;
}

// Claude Code processes T3 spawned also show up in ~/.claude/sessions; the T3 key replaces them.
const ppidCache = new Map();
export function spawnedByT3(pid, ppidOf) {
  if (!connected || !pid || !serverPid) return false;
  if (!ppidCache.has(pid)) ppidCache.set(pid, ppidOf(pid));
  return ppidCache.get(pid) === serverPid;
}

export function threadUrl(threadId) {
  return `t3code://threads/${environmentId}/${encodeURIComponent(threadId)}`;
}

export async function approve(threadId, requestId) {
  if (!connected) return { ok: false, error: 'not connected' };
  return rpc('orchestration.dispatchCommand', {
    type: 'runtime-request.respond',
    commandId: randomUUID(),
    threadId,
    requestId,
    decision: 'accept',
  });
}

export function startT3({ log: logFn, onChange: changeFn }) {
  log = logFn;
  onChange = changeFn;
  connect();
}
