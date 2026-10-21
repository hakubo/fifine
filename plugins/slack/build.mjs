import { appIcon } from '../../scripts/lib/icons.mjs';

const SLACK_ICNS = '/Applications/Slack.app/Contents/Resources/electron.icns';

export function build({ images }) {
  appIcon(images, SLACK_ICNS, { plugin: 72, category: 28, slack: 20, 'slack-key': 72 }, { bg: '#4a154b', dot: '#ffffff' });
}
