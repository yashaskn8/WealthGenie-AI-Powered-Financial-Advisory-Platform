/**
 * WealthGenie Docs-Sync & Architecture Integrity CI Checker (Phase 6)
 * Static verification tool that ensures README architecture claims match actual backend code.
 *
 * Usage:
 *   node scripts/check_docs_sync.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const RAG_CLIENT_PATH = path.join(ROOT_DIR, 'server', 'services', 'ragClient.js');
const CHAT_SERVICE_PATH = path.join(ROOT_DIR, 'server', 'services', 'geminiChatService.js');
const ML_MAIN_PATH = path.join(ROOT_DIR, 'ml-service', 'main.py');

console.log('=' .repeat(70));
console.log('WealthGenie Architecture & Documentation Sync Checker');
console.log('=' .repeat(70));

let failures = 0;

function assertFileExists(filePath, name) {
  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] Required file missing: ${name} (${filePath})`);
    failures++;
    return false;
  }
  console.log(`[PASS] Found ${name}`);
  return true;
}

function assertCodePattern(filePath, pattern, description) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!pattern.test(content)) {
    console.error(`[FAIL] Architecture claim mismatch: ${description} in ${path.basename(filePath)}`);
    failures++;
  } else {
    console.log(`[PASS] Verified ${description}`);
  }
}

// 1. Check core files existence
assertFileExists(README_PATH, 'README.md');
assertFileExists(RAG_CLIENT_PATH, 'Express RAG Client (ragClient.js)');
assertFileExists(CHAT_SERVICE_PATH, 'Gemini Chat Service (geminiChatService.js)');
assertFileExists(ML_MAIN_PATH, 'FastAPI ML Service Main (main.py)');

// 2. Static check: Gateway forwards to RAG (Phase 1 wiring verification)
assertCodePattern(
  CHAT_SERVICE_PATH,
  /queryRAG|ragClient/i,
  'Express Gateway routes factual queries to FastAPI RAG'
);

assertCodePattern(
  RAG_CLIENT_PATH,
  /\/rag\/query/i,
  'RAG client sends HTTP requests to FastAPI /rag/query'
);

// 3. Static check: Fail-closed auth in ML service (Phase 6 auth verification)
assertCodePattern(
  ML_MAIN_PATH,
  /ENVIRONMENT.*local/i,
  'ML Service auth fails closed unless ENVIRONMENT=local'
);

// 4. Verify README diagram mentions RAG Integration
if (fs.existsSync(README_PATH)) {
  const readmeContent = fs.readFileSync(README_PATH, 'utf-8');
  if (!readmeContent.includes('Express.js Gateway (IntentGate)') || !readmeContent.includes('FastAPI')) {
    console.error('[FAIL] README.md sequence diagram is missing IntentGate / FastAPI RAG routing!');
    failures++;
  } else {
    console.log('[PASS] README.md contains accurate IntentGate sequence diagram');
  }
}

console.log('=' .repeat(70));
if (failures > 0) {
  console.error(`FAILED: ${failures} architecture sync checks failed.`);
  process.exit(1);
} else {
  console.log('SUCCESS: All architecture claims statically match backend code!');
  process.exit(0);
}
