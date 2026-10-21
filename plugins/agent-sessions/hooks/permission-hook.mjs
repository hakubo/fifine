#!/usr/bin/env node
// Claude Code PermissionRequest hook: tells the Agent Sessions plugin which permission prompt a
// `claude rc` session is waiting on, so its key can show it and approve it on a second press.
//
// It records the request in ~/.claude/fifine/pending/<session_id>.json and stays alive while the
// prompt is open (the plugin drops pending files whose hook process has exited). It never answers
// the prompt itself: the plugin approves by pressing ⌘↩ in the Claude desktop app. It exits when:
//   - the session isn't a `claude rc` session (there the hook could hold up a terminal prompt),
//   - the request is answered (session-hook.mjs clears the pending file on the next event),
//   - the claude process exits, or 55 minutes pass (the hook's timeout is an hour).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const ROOT = join(homedir(), '.claude', 'fifine');
const PENDING_DIR = join(ROOT, 'pending');
const MAX_WAIT_MS = 55 * 60 * 1000;

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}
const sessionId = input.session_id;
if (!sessionId) process.exit(0);

// Find the owning claude process; only wait for remote-control (`--sdk-url`) sessions.
function claudeProcess() {
  let pid = process.ppid;
  for (let i = 0; i < 6 && pid > 1; i++) {
    let line;
    try {
      line = execFileSync('ps', ['-o', 'ppid=,args=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (!m) return null;
    if (/(^|\/)claude(\s|$)|\/claude\/versions\//.test(m[2])) return { pid, remote: /--sdk-url\b/.test(m[2]) };
    pid = Number(m[1]);
  }
  return null;
}

const proc = claudeProcess();
if (!proc?.remote) process.exit(0);

function summarize(tool, ti = {}) {
  if (tool === 'Bash') return String(ti.command || '');
  if (ti.file_path) return basename(String(ti.file_path));
  if (ti.url) return String(ti.url).replace(/^https?:\/\//, '');
  if (ti.pattern) return String(ti.pattern);
  const first = Object.values(ti).find((v) => typeof v === 'string');
  return first ? String(first) : '';
}

const safeId = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_');
const pendingFile = join(PENDING_DIR, `${safeId}.json`);
const requestId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

mkdirSync(PENDING_DIR, { recursive: true });
const tmp = `${pendingFile}.${process.pid}.tmp`;
writeFileSync(
  tmp,
  JSON.stringify({
    requestId,
    sessionId,
    pid: proc.pid,
    hookPid: process.pid,
    tool: input.tool_name || '',
    summary: summarize(input.tool_name, input.tool_input).replace(/\s+/g, ' ').trim().slice(0, 120),
    createdAt: Date.now(),
  }),
);
renameSync(tmp, pendingFile);

function stillPending() {
  try {
    return JSON.parse(readFileSync(pendingFile, 'utf8')).requestId === requestId;
  } catch {
    return false;
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function cleanup() {
  if (stillPending()) rmSync(pendingFile, { force: true });
}

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    cleanup();
    process.exit(0);
  });
}

const started = Date.now();
const timer = setInterval(() => {
  if (!stillPending() || !alive(proc.pid) || Date.now() - started > MAX_WAIT_MS) {
    cleanup();
    clearInterval(timer);
    process.exit(0);
  }
}, 250);
