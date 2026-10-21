import { join } from 'node:path';
import { appIcon, png } from '../../scripts/lib/icons.mjs';

const SPOTIFY_ICNS = '/Applications/Spotify.app/Contents/Resources/AppIcon.icns';

export async function build({ images, plugin }) {
  appIcon(images, SPOTIFY_ICNS, { plugin: 72, category: 28, spotify: 20, 'spotify-key': 72 }, { bg: '#1ed760', dot: '#000000' });
  // the Next key's skip glyph (144px; the host scales it)
  const { drawNext } = await import(join(plugin, 'spotify.mjs'));
  png(images, ['spotify-next', 'spotify-next@2x', 'spotify-next-key', 'spotify-next-key@2x'], drawNext('#ffffff'));
}
