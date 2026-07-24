import fs from 'fs';
import path from 'path';

/**
 * Cyclomatic Complexity & Maintainability Index Analyzer
 * Analyzes JS/JSX files in server/ and reactapp/src/
 */

function countComplexity(code) {
  // Count decision points: if, else if, for, while, case, catch, &&, ||, ?, ??
  const matches = code.match(/\b(if|else\s+if|for|while|case|catch)\b|\&\&|\|\||\?|\?\?/g);
  return (matches ? matches.length : 0) + 1;
}

function analyzeFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const lines = code.split('\n');
  const loc = lines.length;

  // Simple function regex to find functions and calculate decision points
  const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:async\s*)?function\s*([a-zA-Z0-9_$]*))/g;
  
  // Calculate file-level complexity decision points
  const decisionPoints = (code.match(/\b(if|for|while|case|catch)\b|&&|\|\|\?/g) || []).length;

  return {
    filePath,
    loc,
    complexity: decisionPoints,
  };
}

function walkDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === 'build' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(analyzeFile(fullPath));
    }
  }
  return results;
}

const serverFiles = walkDir('server');
const reactFiles = walkDir('reactapp/src');
const allFiles = [...serverFiles, ...reactFiles];

allFiles.sort((a, b) => b.complexity - a.complexity);

console.log('Top 10 Complexity Files:');
console.log(allFiles.slice(0, 10));

fs.writeFileSync('complexity_custom_report.json', JSON.stringify(allFiles, null, 2));
