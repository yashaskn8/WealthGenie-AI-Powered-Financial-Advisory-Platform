import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WG-009: Dockerfiles for server, reactapp, ml-service and root docker-compose.yml exist and are non-empty', () => {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..');
  
  const dockerFiles = [
    path.join(rootDir, 'server', 'Dockerfile'),
    path.join(rootDir, 'server', '.dockerignore'),
    path.join(rootDir, 'reactapp', 'Dockerfile'),
    path.join(rootDir, 'reactapp', '.dockerignore'),
    path.join(rootDir, 'ml-service', 'Dockerfile'),
    path.join(rootDir, 'ml-service', '.dockerignore'),
    path.join(rootDir, 'docker-compose.yml'),
  ];

  for (const filePath of dockerFiles) {
    assert.ok(fs.existsSync(filePath), `Docker config missing: ${filePath}`);
    const stats = fs.statSync(filePath);
    const minimumSize = path.basename(filePath) === '.dockerignore' ? 1 : 50;
    assert.ok(stats.size > minimumSize, `Docker config file is empty/too small: ${filePath}`);
  }
});

test('Docker full-stack wiring proxies frontend API calls and supplies ML operator auth', () => {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..');
  const frontendDockerfile = fs.readFileSync(path.join(rootDir, 'reactapp', 'Dockerfile'), 'utf8');
  const nginxConfig = fs.readFileSync(path.join(rootDir, 'reactapp', 'nginx.conf'), 'utf8');
  const composeConfig = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');

  assert.match(frontendDockerfile, /COPY\s+nginx\.conf\s+\/etc\/nginx\/conf\.d\/default\.conf/);
  assert.match(nginxConfig, /location\s+\/api\//);
  assert.match(nginxConfig, /proxy_pass\s+http:\/\/server:5000;/);
  assert.match(composeConfig, /ML_OPERATOR_KEY=\$\{ML_OPERATOR_KEY:-\}/);
  assert.match(composeConfig, /METRICS_TOKEN=\$\{METRICS_TOKEN:-\}/);
  assert.match(composeConfig, /CORS_ORIGINS=\$\{CORS_ORIGINS:-https:\/\/localhost\}/);
  assert.match(composeConfig, /MONGODB_URI=mongodb:\/\/mongodb:27017\/wealthgenie\?replicaSet=rs0/);
});

test('Docker build contexts exclude local secrets, caches, and host dependencies', () => {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..');
  const serverIgnore = fs.readFileSync(path.join(rootDir, 'server', '.dockerignore'), 'utf8');
  const mlIgnore = fs.readFileSync(path.join(rootDir, 'ml-service', '.dockerignore'), 'utf8');

  assert.match(serverIgnore, /^node_modules$/m);
  assert.match(serverIgnore, /^\.env$/m);
  assert.match(mlIgnore, /^\.env$/m);
  assert.match(mlIgnore, /^\.venv$/m);
  assert.match(mlIgnore, /^__pycache__$/m);
});

test('Kubernetes supplies every production ML credential using the expected variable names', () => {
  const rootDir = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..');
  const mlDeployment = fs.readFileSync(path.join(rootDir, 'k8s', 'ml-service', 'deployment.yaml'), 'utf8');
  const serverDeployment = fs.readFileSync(path.join(rootDir, 'k8s', 'server', 'deployment.yaml'), 'utf8');
  const secretExample = fs.readFileSync(path.join(rootDir, 'k8s', 'secrets.example.yaml'), 'utf8');
  const configMap = fs.readFileSync(path.join(rootDir, 'k8s', 'configmap.yaml'), 'utf8');
  const kustomization = fs.readFileSync(path.join(rootDir, 'k8s', 'kustomization.yaml'), 'utf8');
  const cdWorkflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'cd.yml'), 'utf8');

  assert.match(mlDeployment, /name:\s*ML_OPERATOR_KEY[\s\S]*key:\s*ML_OPERATOR_KEY/);
  assert.match(secretExample, /^\s*ML_OPERATOR_KEY:\s*"CHANGE_ME_ML_OPERATOR_KEY"/m);
  assert.match(serverDeployment, /name:\s*METRICS_TOKEN[\s\S]*key:\s*METRICS_TOKEN/);
  assert.match(secretExample, /^\s*METRICS_TOKEN:\s*"CHANGE_ME_METRICS_TOKEN/m);
  assert.match(configMap, /^\s*CORS_ORIGINS:\s*"https:\/\//m);
  assert.doesNotMatch(kustomization, /secrets\.example\.yaml/);
  assert.match(cdWorkflow, /--from-literal=ML_OPERATOR_KEY="\$EPHEMERAL_ML_OPERATOR_KEY"/);
  assert.match(cdWorkflow, /--from-literal=METRICS_TOKEN="\$EPHEMERAL_METRICS_TOKEN"/);
  assert.match(cdWorkflow, /MONGODB_URI="mongodb:\/\/wealthgenie-mongodb[^"\s]+\?replicaSet=rs0"/);
});
