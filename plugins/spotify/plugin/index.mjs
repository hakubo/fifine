// Spotify plugin: a play/pause key showing the album cover, and a next-track key.

import { createPlugin, sleep } from './lib/streamdock.mjs';
import { SPOTIFY_BUNDLE, ensureCover, nextKey, nextTrack, playPause, readSpotify, spotifyKey } from './spotify.mjs';

const PLAY_ACTION = 'com.jakubolek.fifine.spotify.play-pause';
const NEXT_ACTION = 'com.jakubolek.fifine.spotify.next';

const p = createPlugin('spotify');
const playKeys = new Set();
const nextKeys = new Set();
let player = null;
let reading = false;

function render() {
  p.show(playKeys, spotifyKey(player));
  p.show(nextKeys, nextKey(player));
}

// Only polled while a Spotify key is on the deck.
async function refresh() {
  if ((playKeys.size === 0 && nextKeys.size === 0) || reading) return;
  reading = true;
  const next = await readSpotify();
  reading = false;
  if (next.running !== player?.running || next.id !== player?.id || next.state !== player?.state)
    p.log('spotify', next.running ? `${next.state} ${next.artist} - ${next.name}` : 'not running');
  player = next;
  ensureCover(player, render, p.log);
  render();
}

// Spotify updates its state a moment after a command, so read it back after a short wait.
async function press(command) {
  if (!player?.running) await p.open('-b', SPOTIFY_BUNDLE);
  else await command();
  await sleep(300);
  refresh();
}

for (const [uuid, keys, command] of [
  [PLAY_ACTION, playKeys, playPause],
  [NEXT_ACTION, nextKeys, nextTrack],
]) {
  p.action(uuid, {
    willAppear: (ctx) => {
      keys.add(ctx);
      render();
      refresh();
    },
    willDisappear: (ctx) => keys.delete(ctx),
    keyDown: () => press(command),
  });
}

setInterval(refresh, 2000);
p.connect();
