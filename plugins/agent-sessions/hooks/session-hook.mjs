#!/usr/bin/env node
// Claude Code hook: records each session's state for the Agent Sessions plugin.
// Wire it to SessionStart, UserPromptSubmit, PostToolUse, Notification, Stop, SessionEnd.
// State lives in ~/.claude/fifine/sessions/<session_id>.json.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const DIR = join(homedir(), '.claude', 'fifine', 'sessions');

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// Walk up from the hook process to the `claude` process that owns this session.
// Returns its pid, tty and the remote-control session id (when spawned by `claude rc`).
function findClaudeProcess() {
  let pid = process.ppid;
  for (let i = 0; i < 6 && pid > 1; i++) {
    let line;
    try {
      line = execFileSync('ps', ['-o', 'ppid=,tty=,args=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
    const m = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) return null;
    const [, ppid, tty, args] = m;
    if (/(^|\/)claude(\s|$)|\/claude\/versions\//.test(args)) {
      const remote = args.match(/--session-id\s+((?:cse|session)_[A-Za-z0-9_-]+)/);
      return { pid, tty: tty === '??' ? null : tty, remoteId: remote ? remote[1] : null };
    }
    pid = Number(ppid);
  }
  return null;
}

function statusFor(input) {
  switch (input.hook_event_name) {
    case 'SessionStart':
      return 'idle';
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return 'working';
    case 'Stop':
      return 'done';
    case 'Notification': {
      const type = input.notification_type || '';
      const msg = String(input.message || '');
      if (type === 'idle_prompt' || /waiting for your input/i.test(msg)) return 'done';
      return 'attention';
    }
    default:
      return null;
  }
}

const input = readStdin();
const sessionId = input.session_id;
if (!sessionId) process.exit(0);

const safeId = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_');
const file = join(DIR, `${safeId}.json`);

// Any of these means a waiting permission request was answered (or abandoned); dropping the
// pending file tells permission-hook.mjs to stop waiting.
if (['UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd'].includes(input.hook_event_name)) {
  rmSync(join(homedir(), '.claude', 'fifine', 'pending', `${safeId}.json`), { force: true });
}

if (input.hook_event_name === 'SessionEnd') {
  rmSync(file, { force: true });
  process.exit(0);
}

const status = statusFor(input);
if (!status) process.exit(0);

let prev = {};
try {
  prev = JSON.parse(readFileSync(file, 'utf8'));
} catch {}

const proc = prev.pid ? null : findClaudeProcess();
// keep the directory the session started in; tools can `cd` later
const cwd = prev.cwd || input.cwd || process.cwd();
// first prompt, so sessions in the same project can be told apart on the keys
const label =
  prev.label ||
  (input.hook_event_name === 'UserPromptSubmit' ? String(input.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '');

const state = {
  sessionId,
  remoteId: prev.remoteId ?? proc?.remoteId ?? (/^(cse|session)_/.test(sessionId) ? sessionId : null),
  pid: prev.pid ?? proc?.pid ?? null,
  tty: prev.tty ?? proc?.tty ?? null,
  cwd,
  project: basename(cwd),
  label,
  status,
  message: input.hook_event_name === 'Notification' ? String(input.message || '') : '',
  startedAt: prev.startedAt ?? Date.now(),
  updatedAt: Date.now(),
};

mkdirSync(DIR, { recursive: true });
const tmp = `${file}.${process.pid}.tmp`;
writeFileSync(tmp, JSON.stringify(state));
renameSync(tmp, file);
