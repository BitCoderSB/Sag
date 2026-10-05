import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/db';
import { seedDemo } from '../server/seed';
import { createApp } from '../server/app';

const directory = mkdtempSync(join(tmpdir(), 'sag-browser-tests-'));
const store = openStore(':memory:');
await seedDemo(store);
const app = createApp({ store, demo: true, uploadsDir: directory, origins: ['http://127.0.0.1:4173'], distDir: resolve('dist') });
const server = app.listen(4173, '127.0.0.1', () => console.log('SAG isolated browser tests: http://127.0.0.1:4173'));
const close = () => server.close(() => { store.close(); rmSync(directory, { recursive: true, force: true }); process.exit(0); });
process.on('SIGINT', close); process.on('SIGTERM', close);
