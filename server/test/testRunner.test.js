import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WG-008: All test files in server/test/ end with .test.js and are included in the test runner glob', () => {
  const testDir = path.resolve(process.cwd(), 'test');
  const files = fs.readdirSync(testDir);
  
  const invalidFiles = files.filter(file => {
    if (file.startsWith('.')) return false;
    return !file.endsWith('.test.js');
  });

  assert.deepEqual(invalidFiles, [], `Found orphaned non-.test.js test files in ${testDir}: ${invalidFiles.join(', ')}`);
});
