import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

// Define secret patterns to block
const RULES = [
  {
    id: 'mongodb-connection-string',
    description: 'MongoDB Connection String',
    regex: /mongodb(?:\+srv)?:\/\/[^\s"']+/gi
  },
  {
    id: 'redis-connection-string',
    description: 'Redis Connection String',
    regex: /rediss?:\/\/[^\s"']+/gi
  },
  {
    id: 'generic-api-key',
    description: 'Generic API Key',
    regex: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9_\-]{20,}['"]/gi
  },
  {
    id: 'jwt-secret',
    description: 'JWT Secret in Code',
    regex: /jwt[_-]?secret\s*[=:]\s*['"][^'"]{16,}['"]/gi
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS Access Key ID',
    regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g
  },
  {
    id: 'openai-api-key',
    description: 'OpenAI API Key',
    regex: /sk-[A-Za-z0-9_-]{32,}/g
  },
  {
    id: 'google-api-key',
    description: 'Google AI / Cloud API Key',
    regex: /AIzaSy[A-Za-z0-9_-]{33}/g
  },
  {
    id: 'github-pat',
    description: 'GitHub Personal Access Token',
    regex: /(?:ghp|gho_|[a-zA-Z0-9]{4}_)[A-Za-z0-9_]{36}/g
  },
  {
    id: 'private-key',
    description: 'RSA / EC / Private Key Header',
    regex: /-----BEGIN\s+(?:RSA|EC|OPENSSH|PRIVATE)\s+KEY-----/gi
  },
  {
    id: 'bearer-token',
    description: 'Hardcoded Bearer Token',
    regex: /Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*/gi
  }
];

// Check if a file should be ignored
function isIgnored(filePath) {
  const ignoredExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.pdf', '.zip', '.tar', '.gz', '.pkl', '.svg'];
  if (ignoredExtensions.includes(path.extname(filePath).toLowerCase())) {
    return true;
  }
  // Ignore specific files
  const ignoredFiles = ['secret-scanner.js', '.env.example', 'README.md', 'package-lock.json', '.system_generated', 'dependency_map.md', 'docker-compose.yml'];
  if (ignoredFiles.some(f => filePath.endsWith(f))) {
    return true;
  }
  if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.includes('coverage') || filePath.includes('server/test/') || filePath.includes('ml-service/tests/') || filePath.includes('server/test_')) {
    return true;
  }
  return false;
}

try {
  const scanAll = process.argv.includes('--all');
  let files = [];

  if (scanAll) {
    const stdout = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf-8' });
    files = stdout.split('\n').map(f => f.trim()).filter(Boolean);
  } else {
    const stdout = execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: ROOT_DIR, encoding: 'utf-8' });
    files = stdout.split('\n').map(f => f.trim()).filter(Boolean);
    if (files.length === 0) {
      // Fall back to git ls-files if no staged files
      const stdoutAll = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf-8' });
      files = stdoutAll.split('\n').map(f => f.trim()).filter(Boolean);
    }
  }

  let hasSecrets = false;

  for (const file of files) {
    if (isIgnored(file)) continue;

    const fullPath = path.isAbsolute(file) ? file : path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');

    for (const rule of RULES) {
      // Reset regex index
      rule.regex.lastIndex = 0;
      if (rule.regex.test(content)) {
        console.error(`\x1b[31m[SECURITY ERROR] Secret detected in file: ${file}\x1b[0m`);
        console.error(`\x1b[31mPattern matched: ${rule.description} (${rule.id})\x1b[0m`);
        console.error(`\x1b[33mPlease remove the secret before committing.\x1b[0m\n`);
        hasSecrets = true;
      }
    }
  }

  if (hasSecrets) {
    process.exit(1);
  }
  console.log('✅ Secret scanning passed (0 secrets detected).');
  process.exit(0);
} catch (error) {
  console.error('Error running secret scanner:', error.message);
  process.exit(1);
}
