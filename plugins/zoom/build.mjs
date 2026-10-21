import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIcon, tiles } from '../../scripts/lib/icons.mjs';

const ZOOM_ICNS = '/Applications/zoom.us.app/Contents/Resources/ZPLogo.icns';
const BLUE = { bg: '#2d8cff', dot: '#ffffff' };

export function build({ images, plugin }) {
  appIcon(images, ZOOM_ICNS, { plugin: 72, category: 28, zoom: 20, 'zoom-key': 72 }, BLUE);
  buildCalendarHelper(plugin);
}

// The key reads macOS Calendar through a small EventKit app (needs the Xcode command line tools).
// It's a bundle with its own Info.plist so macOS asks for calendar access in its name: Control
// Deck itself lacks the usage key macOS 14 needs to prompt.
function buildCalendarHelper(plugin) {
  const src = fileURLToPath(new URL('calendar/', import.meta.url));
  const app = join(plugin, 'fifine Calendar.app');
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
  copyFileSync(join(src, 'Info.plist'), join(app, 'Contents/Info.plist'));
  execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-o', join(app, 'Contents/MacOS/calendar-events'), join(src, 'calendar-events.swift')], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', app], { stdio: 'inherit' });
}
