import { tiles } from '../../scripts/lib/icons.mjs';

const AMBER = { bg: '#f5c542', dot: '#2e2410' };

export function build({ images }) {
  tiles(images, {
    plugin: [72, AMBER],
    category: [28, AMBER],
    light: [20, AMBER],
    'light-key': [72, { bg: '#1b1b1f', dot: '#5b5b66' }],
  });
}
