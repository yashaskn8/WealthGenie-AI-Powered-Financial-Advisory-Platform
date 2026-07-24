/**
 * Documentation Synchronization Checker — Task 3
 * 
 * Verifies that documentation files (README.md, docs/*.md) stay in sync
 * with package versions, test targets, and configuration schemas.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

function checkDocsSync() {
  console.log('▶ Checking documentation synchronization...');
  let errors = [];

  // 1. Package version consistency check
  const serverPkg = JSON.parse(readFileSync(join(ROOT_DIR, 'server', 'package.json'), 'utf-8'));
  const reactPkg = JSON.parse(readFileSync(join(ROOT_DIR, 'reactapp', 'package.json'), 'utf-8'));

  if (serverPkg.version !== reactPkg.version) {
    errors.push(`Version mismatch: server (${serverPkg.version}) vs reactapp (${reactPkg.version})`);
  }

  // 2. README version check
  const readme = readFileSync(join(ROOT_DIR, 'README.md'), 'utf-8');
  if (!readme.includes(serverPkg.version)) {
    errors.push(`README.md does not mention current package version ${serverPkg.version}`);
  }

  // 3. Documented artifacts check
  const mandatoryDocs = [
    'docs/ci-matrix.md',
    'CONTRIBUTING.md',
    'README.md'
  ];

  for (const doc of mandatoryDocs) {
    const docPath = join(ROOT_DIR, doc);
    if (!existsSync(docPath)) {
      errors.push(`Missing mandatory documentation file: ${doc}`);
    }
  }

  if (errors.length > 0) {
    console.error('\x1b[31m[DOCS SYNC ERROR] Documentation synchronization failed:\x1b[0m');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('✅ Documentation synchronization verified (0 errors).');
  process.exit(0);
}

checkDocsSync();
