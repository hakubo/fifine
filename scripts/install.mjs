// Builds the plugins into dist/ and installs them into fifine Control Deck (StreamDock).
//
//   node scripts/install.mjs <plugin...>               build + install (or update) these plugins
//   node scripts/install.mjs --all                     every plugin in plugins/
//   node scripts/install.mjs <plugin...> --uninstall   remove them again
//   node scripts/install.mjs <plugin...> --build-only  only build into dist/
//
// Plugins that hook into Claude Code (agent-sessions, claude-usage) also update
// ~/.claude/settings.json, after backing it up to settings.json.bak-fifine.

import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PLUGINS = join(ROOT, 'plugins');
const DIST = join(ROOT, 'dist');
const STREAMDOCK = join(homedir(), 'Library/Application Support/HotSpot/StreamDock/plugins');
const SETTINGS = join(homedir(), '.claude/settings.json');
const UUID_PREFIX = 'com.jakubolek.fifine';
// the single plugin this repo used to install, before it was split
const LEGACY = 'com.jakubolek.claudesessions.sdPlugin';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const available = readdirSync(PLUGINS).filter((d) => existsSync(join(PLUGINS, d, 'manifest.json')));
const selected = flags.has('--all') ? available : args.filter((a) => !a.startsWith('--'));
const uninstall = flags.has('--uninstall');
const buildOnly = flags.has('--build-only');

const unknown = selected.filter((p) => !available.includes(p));
if (selected.length === 0 || unknown.length) {
  if (unknown.length) console.error(`Unknown plugin: ${unknown.join(', ')}`);
  console.error(`Usage: node scripts/install.mjs <plugin...> | --all  [--uninstall] [--build-only]\nPlugins: ${available.join(', ')}`);
  process.exit(1);
}

const sdPlugin = (name) => `${UUID_PREFIX}.${name}.sdPlugin`;

// dist/<uuid>.sdPlugin: the manifest, pi/ (settings panels) if the plugin has any, plugin/ with
// the shared modules in plugin/lib and ws in plugin/node_modules, and images/ drawn by the
// plugin's build.mjs.
async function build(name, mod) {
  const src = join(PLUGINS, name);
  const out = join(DIST, sdPlugin(name));
  const plugin = join(out, 'plugin');
  const images = join(out, 'images');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(images, { recursive: true });
  copyFileSync(join(src, 'manifest.json'), join(out, 'manifest.json'));
  cpSync(join(src, 'plugin'), plugin, { recursive: true });
  if (existsSync(join(src, 'pi'))) cpSync(join(src, 'pi'), join(out, 'pi'), { recursive: true });
  cpSync(join(ROOT, 'shared'), join(plugin, 'lib'), { recursive: true });
  cpSync(join(ROOT, 'node_modules/ws'), join(plugin, 'node_modules/ws'), { recursive: true });
  writeFileSync(join(plugin, 'package.json'), `${JSON.stringify({ name, private: true, type: 'module' }, null, 2)}\n`);
  await mod.build?.({ images, plugin });
  console.log(`Built ${out}`);
  return out;
}

// [[mod, install]]
function updateClaudeSettings(changes) {
  if (!existsSync(SETTINGS)) {
    if (uninstall) return;
    mkdirSync(join(SETTINGS, '..'), { recursive: true });
    writeFileSync(SETTINGS, '{}\n');
  }
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  copyFileSync(SETTINGS, `${SETTINGS}.bak-fifine`);
  for (const [mod, install] of changes) mod.claudeSettings(settings, { install });
  writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Updated ${SETTINGS} (backup: settings.json.bak-fifine). Restart running Claude Code sessions to pick it up.`);
}

function restartControlDeck() {
  try {
    execFileSync('/usr/bin/osascript', ['-e', 'tell application "fifine Control Deck" to quit']);
  } catch {}
  execFileSync('/bin/sleep', ['2']);
  try {
    execFileSync('/usr/bin/open', ['-a', 'fifine Control Deck']);
    console.log('Restarted fifine Control Deck');
  } catch {
    console.log('Could not start fifine Control Deck; open it yourself.');
  }
}

if (!uninstall && !existsSync(join(ROOT, 'node_modules/ws'))) {
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit' });
}

const mods = {};
for (const name of selected) mods[name] = await import(join(PLUGINS, name, 'build.mjs'));

if (uninstall) {
  for (const name of selected) {
    rmSync(join(STREAMDOCK, sdPlugin(name)), { recursive: true, force: true });
    console.log(`Removed ${sdPlugin(name)}`);
  }
} else {
  for (const name of selected) {
    const out = await build(name, mods[name]);
    if (buildOnly) continue;
    const dest = join(STREAMDOCK, sdPlugin(name));
    rmSync(dest, { recursive: true, force: true });
    cpSync(out, dest, { recursive: true });
    console.log(`Installed ${dest}`);
  }
}

if (!buildOnly) {
  const changes = selected.filter((n) => mods[n].claudeSettings).map((n) => [mods[n], !uninstall]);
  // The old combined plugin registered hooks and the usage plugin from paths that no longer exist;
  // take those out too, for the plugins not being installed now.
  if (!uninstall && existsSync(join(STREAMDOCK, LEGACY))) {
    rmSync(join(STREAMDOCK, LEGACY), { recursive: true, force: true });
    console.log(`Removed the old combined plugin ${LEGACY}`);
    for (const name of available.filter((n) => !selected.includes(n))) {
      const mod = await import(join(PLUGINS, name, 'build.mjs'));
      if (mod.claudeSettings) changes.push([mod, false]);
    }
  }
  if (changes.length) updateClaudeSettings(changes);
  restartControlDeck();
}
