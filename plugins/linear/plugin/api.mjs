// Linear's GraphQL API, and the personal API key every Linear key on the deck shares.
//
// The API key lives in ~/Library/Application Support/fifine/linear.json (mode 600) rather than in
// one key's settings, so the badge and cycle keys use the same one and it survives removing a key.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR } from './lib/paths.mjs';

const API = 'https://api.linear.app/graphql';
const STORE = join(STATE_DIR, 'linear.json');

export function loadApiKey() {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8')).apiKey || '';
  } catch {
    return '';
  }
}

export function saveApiKey(apiKey) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STORE, JSON.stringify({ apiKey }) + '\n', { mode: 0o600 });
  chmodSync(STORE, 0o600);
}

// The query's data, or { error }.
export async function gql(apiKey, query, variables = {}) {
  if (!apiKey) return { error: 'no API key' };
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (body.errors?.length) return { error: body.errors[0].message };
    if (!res.ok || !body.data) return { error: `HTTP ${res.status}` };
    return body.data;
  } catch (err) {
    return { error: err.message };
  }
}

// The teams the API key's user belongs to: [{ id, key, name }], or { error }.
export async function listTeams(apiKey) {
  const data = await gql(apiKey, '{ viewer { teams { nodes { id key name } } } }');
  return data.error ? data : data.viewer.teams.nodes;
}
