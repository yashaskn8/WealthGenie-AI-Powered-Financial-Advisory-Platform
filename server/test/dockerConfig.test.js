import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WG-009: Dockerfiles for server, reactapp, ml-service and root docker-compose.yml exist and are non-empty', () => {
  const rootDir = path.resolve(process.cwd(), '..');
  
  const dockerFiles = [
    path.join(rootDir, 'server', 'Dockerfile'),
    path.join(rootDir, 'reactapp', 'Dockerfile'),
    path.join(rootDir, 'ml-service', 'Dockerfile'),
    path.join(rootDir, 'docker-compose.yml'),
  ];

  for (const filePath of dockerFiles) {
    assert.ok(fs.existsSync(filePath), `Docker config missing: ${filePath}`);
    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 50, `Docker config file is empty/too small: ${filePath}`);
  }
});
