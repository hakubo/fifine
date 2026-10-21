#!/usr/bin/env node
// Read-only probe of the T3 Code server: subscribes to the thread shell stream and prints each
// thread's status and pending request. Usage: T3_TOKEN=<bearer> node plugins/agent-sessions/scripts/t3-probe.mjs [seconds]
//
// Token: t3 auth session issue --scope orchestration:read --scope orchestration:operate --token-only

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const USERDATA = join(homedir(), '.t3', 'userdata');
const token = process.env.T3_TOKEN?.trim();
if (!token) {
  console.error('Set T3_TOKEN');
  process.exit(1);
}
const seconds = Number(process.argv[2] || 10);
const { origin } = JSON.parse(readFileSync(join(USERDATA, 'server-runtime.json'), 'utf8'));
const environmentId = readFileSync(join(USERDATA, 'environment-id'), 'utf8').trim();

const res = await fetch(`${origin}/api/auth/websocket-ticket`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: '{}',
});
if (!res.ok) {
  console.error('ticket request failed', res.status, await res.text());
  process.exit(1);
}
const { ticket } = await res.json();

// The server refuses clients that don't declare orchestration protocol 2 (HTTP 426).
const ws = new WebSocket(
  `${origin.replace(/^http/, 'ws')}/ws?wsTicket=${encodeURIComponent(ticket)}&orchestrationProtocol=2`,
);
const send = (msg) => ws.send(JSON.stringify(msg));

function show(thread) {
  const req = thread.pendingRuntimeRequest;
  console.log(
    [
      thread.status?.padEnd?.(10) ?? JSON.stringify(thread.status),
      thread.activityRunStatus ?? '-',
      thread.providerInstanceId,
      JSON.stringify(thread.title),
      req ? `REQUEST ${JSON.stringify(req)}` : '',
      `t3code://threads/${environmentId}/${thread.id}`,
    ].join('  '),
  );
}

ws.addEventListener('open', () => {
  console.log('connected');
  send({ _tag: 'Request', id: '1', tag: 'orchestration.subscribeShell', payload: {}, headers: [] });
});

ws.addEventListener('message', (ev) => {
  const raw = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
  const msgs = [].concat(JSON.parse(raw));
  for (const msg of msgs) {
    if (msg._tag === 'Ping') {
      send({ _tag: 'Pong' });
    } else if (msg._tag === 'Chunk') {
      send({ _tag: 'Ack', requestId: msg.requestId });
      for (const item of msg.values) {
        if (item.kind === 'snapshot') {
          const threads = item.snapshot.threads ?? [];
          console.log(`snapshot: ${threads.length} threads, ${item.snapshot.projects?.length ?? 0} projects`);
          threads.forEach(show);
        } else if (item.thread) {
          process.stdout.write(`${item.kind}: `);
          show(item.thread);
        } else {
          console.log(item.kind, JSON.stringify(item).slice(0, 300));
        }
      }
    } else {
      console.log('<-', JSON.stringify(msg).slice(0, 1000));
    }
  }
});

ws.addEventListener('close', (ev) => console.log('closed', ev.code, ev.reason));
ws.addEventListener('error', (ev) => console.error('ws error', ev.message ?? ev));
setTimeout(() => {
  send({ _tag: 'Interrupt', requestId: '1' });
  ws.close();
}, seconds * 1000);
