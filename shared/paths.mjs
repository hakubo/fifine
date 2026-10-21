// Where plugins keep their logs and caches.
import { homedir } from 'node:os';
import { join } from 'node:path';

export const LOG_DIR = join(homedir(), 'Library', 'Logs', 'fifine');
export const CACHE_DIR = join(homedir(), 'Library', 'Caches', 'fifine');
