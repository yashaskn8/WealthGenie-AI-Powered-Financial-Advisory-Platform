import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(serverRoot, 'data', 'investment_master.json');
const target = resolve(serverRoot, '..', 'reactapp', 'src', 'data', 'investment_master.json');

const catalog = JSON.parse(readFileSync(source, 'utf8'));
if (!Array.isArray(catalog.instruments) || catalog.instruments.length === 0) {
  throw new Error('Refusing to synchronize an empty or invalid canonical investment catalog.');
}

copyFileSync(source, target);
console.log(`Synchronized ${catalog.instruments.length} canonical instruments to the frontend build mirror.`);
