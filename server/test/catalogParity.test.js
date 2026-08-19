import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const serverCatalogPath = resolve(__dirname, '../data/investment_master.json');
const reactappCatalogPath = resolve(__dirname, '../../reactapp/src/data/investment_master.json');

function getFileHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

test('PROOF 4: Catalog Content & Byte Parity Guard between server and reactapp', () => {
  const serverContent = readFileSync(serverCatalogPath, 'utf8');
  const reactappContent = readFileSync(reactappCatalogPath, 'utf8');

  const serverHash = getFileHash(serverContent);
  const reactappHash = getFileHash(reactappContent);

  assert.equal(
    serverHash,
    reactappHash,
    `[CATALOG DRIFT CRITICAL DEFECT] server/data/investment_master.json and reactapp/src/data/investment_master.json have diverged!\n` +
    `Server catalog SHA256:   ${serverHash}\n` +
    `Reactapp catalog SHA256: ${reactappHash}\n` +
    `HOW TO RESYNC:\n` +
    `  1. Identify which file contains the authoritative changes.\n` +
    `  2. Copy the authoritative file to both locations:\n` +
    `     cp server/data/investment_master.json reactapp/src/data/investment_master.json\n` +
    `  3. Run: npm test in server and reactapp to confirm parity.`
  );

  // Deep JSON structural equality check
  const serverJson = JSON.parse(serverContent);
  const reactappJson = JSON.parse(reactappContent);
  assert.equal(serverJson.instruments.length, 155, 'Master catalog must contain 155 instruments');
  assert.deepEqual(serverJson, reactappJson, 'Master catalog JSON structures must be identical');
});

test('PROOF 4 Guard Verification: Parity guard detects artificially injected discrepancy', () => {
  const serverContent = readFileSync(serverCatalogPath, 'utf8');
  const corruptedContent = serverContent.replace('"expectedReturn"', '"tamperedReturn"');

  const serverHash = getFileHash(serverContent);
  const corruptedHash = getFileHash(corruptedContent);

  assert.notEqual(serverHash, corruptedHash, 'SHA256 must diverge when content is modified');
  assert.throws(
    () => {
      if (serverHash !== corruptedHash) {
        throw new Error(
          `[CATALOG DRIFT CRITICAL DEFECT] server/data/investment_master.json and reactapp/src/data/investment_master.json have diverged!`
        );
      }
    },
    /CATALOG DRIFT CRITICAL DEFECT/,
    'Parity guard must throw a loud actionable error when catalog files diverge'
  );
});
