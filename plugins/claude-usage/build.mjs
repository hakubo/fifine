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

// The key used to read ~/.claude/fifine/usage.json, written by a small Claude Code plugin
// (fifine-usage) that the installer listed in CLAUDE_CODE_PLUGIN_DIRS. The numbers now come from T3
// Code, so install and uninstall both take that folder back out: from any checkout or worktree it
// was installed from, and from where it lived before the repo was split into plugins.
const OLD_PLUGIN_DIR = /\/plugins\/claude-usage\/claude-plugin\/?$/;
const PRE_SPLIT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../claude-plugin');

export function claudeSettings(settings) {
  if (settings.env?.CLAUDE_CODE_PLUGIN_DIRS === undefined) return;
  const dirs = String(settings.env.CLAUDE_CODE_PLUGIN_DIRS)
    .split(':')
    .filter((d) => d && !OLD_PLUGIN_DIR.test(d) && d !== PRE_SPLIT_DIR);
  if (dirs.length) settings.env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(':');
  else delete settings.env.CLAUDE_CODE_PLUGIN_DIRS;
  if (Object.keys(settings.env).length === 0) delete settings.env;
}
