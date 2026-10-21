import { fileURLToPath } from 'node:url';
import { tiles } from '../../scripts/lib/icons.mjs';

const CLAUDE = { bg: '#d97757', dot: '#ffffff' };

export function build({ images }) {
  tiles(images, {
    plugin: [72, CLAUDE],
    category: [28, CLAUDE],
    action: [20, CLAUDE],
    key: [72, { bg: '#1b1b1f', dot: '#5b5b66' }],
    t3: [20, { bg: '#0b0b0d', dot: '#ffffff' }],
  });
}

// Registers the session and permission hooks in ~/.claude/settings.json.
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
// this plugin's hooks, and the ones from before the repo was split into plugins
const OURS = /agent-sessions\/hooks\/(session|permission)-hook\.mjs|claude-fifine-(hook|permission)\.mjs/;

export function claudeSettings(settings, { install }) {
  const hook = (file, timeout) => ({ type: 'command', command: `node "${fileURLToPath(new URL(`hooks/${file}`, import.meta.url))}"`, timeout });
  const wanted = [
    ...EVENTS.map((event) => [event, hook('session-hook.mjs', 5)]),
    // stays alive in the background of the Allow/Deny prompt until it's answered
    ['PermissionRequest', hook('permission-hook.mjs', 3600)],
  ];
  settings.hooks ??= {};
  for (const [event, h] of wanted) {
    // drop any previous copy of our hooks, keep everything else
    const groups = (settings.hooks[event] ?? [])
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((x) => !OURS.test(String(x.command))) }))
      .filter((g) => g.hooks.length > 0);
    if (install) groups.push({ hooks: [h] });
    if (groups.length) settings.hooks[event] = groups;
    else delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}
