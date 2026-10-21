// The part every plugin shares: the WebSocket to Control Deck, logging, a few process helpers,
// and sending a key's image and title only when they change.
//
// Control Deck starts the plugin as `node index.mjs -port N -pluginUUID X -registerEvent E -info {...}`.

import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { LOG_DIR } from './paths.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `name` names the log file: ~/Library/Logs/fifine/<name>.log
export function createPlugin(name) {
  const logFile = join(LOG_DIR, `${name}.log`);
  mkdirSync(LOG_DIR, { recursive: true });

  function log(...args) {
    try {
      appendFileSync(logFile, `[${new Date().toISOString()}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
    } catch {}
  }

  // Resolves with trimmed stdout, or null when the command failed.
  function run(cmd, args, { timeout = 5000 } = {}) {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
        if (err) log('exec failed', cmd, args.join(' ').slice(0, 200), String(stderr || err.message));
        resolve(err ? null : stdout.trim());
      });
    });
  }
  const osa = (script) => run('/usr/bin/osascript', ['-e', script]);
  const open = (...args) => run('/usr/bin/open', args);

  const argv = {};
  for (let i = 2; i < process.argv.length; i += 2) argv[process.argv[i].replace(/^-+/, '')] = process.argv[i + 1];

  let ws;
  function send(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  const lastSent = new Map(); // context -> { image, title } last pushed to the device

  // Control Deck blanks every key whenever it re-shows a page, including on each app focus change
  // when profiles follow the frontmost app. The last picture is kept across willDisappear so a
  // returning key gets it back at once; show() then only sends what actually changed.
  function repaint(ctx) {
    const last = lastSent.get(ctx);
    if (!last) return;
    send({ event: 'setImage', context: ctx, payload: { image: last.image, target: 0 } });
    send({ event: 'setTitle', context: ctx, payload: { title: last.title, target: 0 } });
  }

  // Shows { image, title } on one key, or on every key in an iterable of contexts.
  function show(ctxs, { image, title }) {
    for (const ctx of typeof ctxs === 'string' ? [ctxs] : ctxs) {
      const last = lastSent.get(ctx) || {};
      if (last.image !== image) send({ event: 'setImage', context: ctx, payload: { image, target: 0 } });
      if (last.title !== title) send({ event: 'setTitle', context: ctx, payload: { title, target: 0 } });
      lastSent.set(ctx, { image, title });
    }
  }

  const showOk = (ctx) => send({ event: 'showOk', context: ctx });
  const showAlert = (ctx) => send({ event: 'showAlert', context: ctx });

  // action UUID -> { willAppear(ctx, msg), willDisappear(ctx, msg), keyDown(ctx, msg), keyUp(ctx, msg) }
  const actions = new Map();
  const action = (uuid, handlers) => actions.set(uuid, handlers);

  function connect() {
    ws = new WebSocket(`ws://127.0.0.1:${argv.port}`);
    ws.on('open', () => {
      send({ event: argv.registerEvent || 'registerPlugin', uuid: argv.pluginUUID });
      log('connected', argv.port);
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      const handlers = actions.get(msg.action);
      if (!handlers) return;
      if (msg.event === 'willAppear') repaint(msg.context);
      handlers[msg.event]?.(msg.context, msg);
    });
    ws.on('close', () => {
      log('socket closed, exiting');
      process.exit(0);
    });
    ws.on('error', (e) => log('socket error', e.message));
  }

  process.on('uncaughtException', (e) => log('uncaught', e.stack || e.message));

  return { log, run, osa, open, send, show, showOk, showAlert, action, connect };
}
