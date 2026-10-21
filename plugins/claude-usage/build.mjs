import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { png, tiles } from '../../scripts/lib/icons.mjs';

const BARS = { bg: '#d97757', bars: [{ y: 0.3, height: 0.15, percent: 70, color: '#ffffff', track: '#a85a3f' }, { y: 0.6, height: 0.15, percent: 35, color: '#ffffff', track: '#a85a3f' }] };

export async function build({ images, plugin }) {
  tiles(images, { plugin: [72, BARS], category: [28, BARS], usage: [20, BARS] });
  // the key's default image is its own "no data" drawing (144px; the host scales it)
  const { usageKey } = await import(join(plugin, 'usage.mjs'));
  png(images, ['usage-key', 'usage-key@2x'], Buffer.from(usageKey(null).image.split(',')[1], 'base64'));
}

// Loads the fifine-usage Claude Code plugin in every session through CLAUDE_CODE_PLUGIN_DIRS (the
// settings `env` block counts), `claude rc` and `claude -p` ones included.
const USAGE_PLUGIN = join(dirname(fileURLToPath(import.meta.url)), 'claude-plugin');
// where it lived before the repo was split into plugins
const OLD = join(USAGE_PLUGIN, '../../../claude-plugin');

export function claudeSettings(settings, { install }) {
  const dirs = String(settings.env?.CLAUDE_CODE_PLUGIN_DIRS ?? '')
    .split(':')
    .filter((d) => d && d !== USAGE_PLUGIN && d !== OLD);
  if (install) dirs.push(USAGE_PLUGIN);
  settings.env ??= {};
  if (dirs.length) settings.env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(':');
  else delete settings.env.CLAUDE_CODE_PLUGIN_DIRS;
  if (Object.keys(settings.env).length === 0) delete settings.env;
}
