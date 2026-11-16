// "Linear Cycle" key: the progress of a team's active cycle, drawn whole (the host's title stays
// empty):
//
//        C42            cycle number
//   ( (  62% ) )        Linear's cycle progress, in a ring that fills clockwise; a thin inner
//       3D LEFT         ring shows how much of the cycle's time has passed
//
// The ring is indigo while the work keeps up with the time, amber once it's more than 15 points
// behind, and green when the cycle is done.

import { gql } from './api.mjs';
import { canvas } from './lib/draw.mjs';
import { dataUrl } from './lib/png.mjs';

const SIZE = 144;
const C = SIZE / 2;
const BG = '#141418';
const TRACK = '#26262d';
const TEXT = '#f4f4f6';
const DIM = '#7c7c88';
const TIME = '#8a8a96';
const ON_TRACK = '#5e6ad2'; // Linear indigo
const BEHIND = '#f2a33a';
const DONE = '#2fd08a';
const RING_R = 61;
const RING_W = 10;
const TIME_R = 50;
const TIME_W = 3;

const DAY = 24 * 60 * 60 * 1000;

// { team: { id, key, name }, cycle: { number, name, progress, startsAt, endsAt } | null, workspace },
// or { error }.
// teamId: the team to show; without one, the first of the user's teams.
export async function readCycle(apiKey, teamId) {
  const fields = 'id key name activeCycle { number name progress startsAt endsAt }';
  const data = teamId
    ? await gql(apiKey, `query($id: String!) { organization { urlKey } team(id: $id) { ${fields} } }`, { id: teamId })
    : await gql(apiKey, `{ organization { urlKey } viewer { teams(first: 1) { nodes { ${fields} } } } }`);
  if (data.error) return data;
  const team = teamId ? data.team : data.viewer.teams.nodes[0];
  if (!team) return { error: 'no team' };
  const { activeCycle, ...rest } = team;
  return { team: rest, cycle: activeCycle, workspace: data.organization?.urlKey };
}

// What's left of the cycle, in words the stroke font can draw.
function left(endsAt, now) {
  const ms = new Date(endsAt) - now;
  if (ms <= 0) return 'ENDED';
  const days = Math.ceil(ms / DAY);
  if (days <= 1) return ms < 12 * 60 * 60 * 1000 ? `${Math.max(1, Math.ceil(ms / 3600000))}H LEFT` : '1D LEFT';
  return `${days}D LEFT`;
}

// state: { cycle, now } | { message: 'SET KEY' | 'NO CYCLE' | 'ERROR' | ... }
export function render(state) {
  const c = canvas(SIZE);
  c.fill(BG);
  c.arc(RING_R, RING_W, 1, TRACK);

  if (!state.cycle) {
    const msg = state.message || 'CYCLE';
    c.text(C, 63, msg, { h: msg.length > 6 ? 11 : 14, stroke: 2.4, color: DIM, track: 0.24 });
    return c.png();
  }

  const { cycle, now } = state;
  const start = new Date(cycle.startsAt);
  const end = new Date(cycle.endsAt);
  const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const progress = Math.max(0, Math.min(1, cycle.progress ?? 0));
  const color = progress >= 1 ? DONE : progress < elapsed - 0.15 ? BEHIND : ON_TRACK;

  c.arc(TIME_R, TIME_W, 1, TRACK);
  c.arc(TIME_R, TIME_W, elapsed, TIME);
  c.arc(RING_R, RING_W, progress, color);

  c.text(C, 34, `C${cycle.number}`, { h: 10, stroke: 2, color: DIM, track: 0.3 });
  const pct = `${Math.round(progress * 100)}%`;
  c.text(C, 56, pct, { h: 28, stroke: 4.4, color: TEXT, track: 0.16 });
  const rest = left(cycle.endsAt, now);
  c.text(C, 96, rest, { h: 10, stroke: 2, color: rest === 'ENDED' ? BEHIND : DIM, track: 0.26 });
  return c.png();
}

const images = new Map();
// The key's image for a state; `now` is rounded to the hour so the cache stays small.
export function cycleKey(state) {
  const key = JSON.stringify(state);
  if (!images.has(key)) {
    if (images.size > 100) images.clear();
    images.set(key, dataUrl(render(state)));
  }
  return { image: images.get(key), title: '' };
}

export const cycleUrl = (workspace, team) => `linear://${workspace}/team/${team}/cycle/active`;
export const viewUrl = (workspace, slugId) => `linear://${workspace}/view/${slugId}`;

// Linear has no link for "the active cycle, only my issues", so the key opens a private custom view
// with that filter. It's found by name, and created the first time (that needs an API key with
// write access). Returns the view's slugId, or { error }.
export const MY_CYCLE_VIEW = 'My issues in the active cycle';
const myViews = new Map(); // teamId -> slugId

export async function myCycleView(apiKey, teamId) {
  if (myViews.has(teamId)) return myViews.get(teamId);
  const found = await gql(
    apiKey,
    `query($name: String!, $team: ID!) {
      customViews(first: 1, filter: { name: { eq: $name }, team: { id: { eq: $team } }, creator: { isMe: { eq: true } } }) { nodes { slugId } }
    }`,
    { name: MY_CYCLE_VIEW, team: teamId },
  );
  if (found.error) return found;
  let slugId = found.customViews.nodes[0]?.slugId;
  if (!slugId) {
    const made = await gql(
      apiKey,
      `mutation($input: CustomViewCreateInput!) { customViewCreate(input: $input) { success customView { slugId } } }`,
      {
        input: {
          name: MY_CYCLE_VIEW,
          teamId,
          shared: false,
          filterData: { cycle: { isActive: { eq: true } }, assignee: { isMe: { eq: true } } },
        },
      },
    );
    if (made.error) return made;
    slugId = made.customViewCreate?.customView?.slugId;
    if (!slugId) return { error: 'could not create the view' };
  }
  myViews.set(teamId, slugId);
  return slugId;
}

