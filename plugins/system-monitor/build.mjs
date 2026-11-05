import { join } from 'node:path';
import { png, tiles } from '../../scripts/lib/icons.mjs';

const TILE = { bg: '#1d1d23', accent: '#2fd08a' };
const ICONS = {
  overview: { bg: '#1d1d23', accent: '#2fd08a' },
  cpu: { bg: '#1d1d23', accent: '#2fd08a' },
  memory: { bg: '#1d1d23', accent: '#ffb340' },
  disk: { bg: '#1d1d23', accent: '#ff7a45' },
  network: { bg: '#1d1d23', accent: '#4c9dff' },
};

export async function build({ images, plugin }) {
  tiles(images, {
    plugin: [72, TILE],
    category: [28, TILE],
    ...Object.fromEntries(Object.entries(ICONS).map(([name, opts]) => [name, [20, { ...opts, border: 3 }]])),
  });
  // each key's default image is its own drawing with no readings yet (144px; the host scales it)
  const { render } = await import(join(plugin, 'draw.mjs'));
  for (const kind of Object.keys(ICONS)) png(images, [`${kind}-key`, `${kind}-key@2x`], render(kind, []));
}
