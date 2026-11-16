import { appIcon } from '../../scripts/lib/icons.mjs';

const NOTION_ICNS = '/Applications/Notion.app/Contents/Resources/electron.icns';

export function build({ images }) {
  appIcon(images, NOTION_ICNS, { plugin: 72, category: 28, notion: 20, 'notion-key': 72 }, { bg: '#191919', dot: '#ffffff' });
}
