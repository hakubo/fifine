import { join } from 'node:path';
import { appIcon, png } from '../../scripts/lib/icons.mjs';

const LINEAR_ICNS = '/Applications/Linear.app/Contents/Resources/icon.icns';
const DAY = 24 * 60 * 60 * 1000;

export async function build({ images, plugin }) {
  const fallback = { bg: '#5e6ad2', dot: '#ffffff' };
  appIcon(images, LINEAR_ICNS, { plugin: 72, category: 28, linear: 20, 'linear-key': 72, cycle: 20 }, fallback);
  // the cycle key's default image: an example cycle, 62% done with 3 days left (144px; the host scales it)
  const { render } = await import(join(plugin, 'cycle.mjs'));
  const now = Date.now();
  const example = { cycle: { number: 42, progress: 0.62, startsAt: new Date(now - 11 * DAY), endsAt: new Date(now + 3 * DAY) }, now };
  png(images, ['cycle-key', 'cycle-key@2x'], render(example));
}
