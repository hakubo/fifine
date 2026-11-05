import { appIcon } from '../../scripts/lib/icons.mjs';

const CHROME_ICNS = '/Applications/Google Chrome.app/Contents/Resources/app.icns';

export function build({ images }) {
  appIcon(images, CHROME_ICNS, { plugin: 72, category: 28, chrome: 20, 'chrome-key': 72 }, { bg: '#1a73e8', dot: '#ffffff' });
}
