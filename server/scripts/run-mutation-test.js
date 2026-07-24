/**
 * Lightweight Mutation Testing — Task 6
 * 
 * Targets: xirrCalculator.js, taxEngine.js
 * Strategy: Apply operator mutations to critical lines only, run targeted tests.
 * Timeout: 5s per mutant to catch infinite loops.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const REPORTS_DIR = join(SERVER_DIR, 'reports');

const TARGETS = [
  {
    file: 'services/xirrCalculator.js',
    testCmd: 'node --test test/xirrCalculator.test.js',
    // Only mutate lines containing these patterns (critical math)
    lineFilter: (line) => /npv|rate|Math\.|tol|deriv|bisect/i.test(line) && !line.trim().startsWith('//'),
  },
  {
    file: 'services/taxEngine.js',
    testCmd: 'node --test test/taxEngine.test.js',
    lineFilter: (line) => /slab|tax|rate|threshold|exemp|cess/i.test(line) && !line.trim().startsWith('//'),
  },
];

const MUTATIONS = [
  { find: ' > ', replace: ' >= ', name: '> → >=' },
  { find: ' < ', replace: ' <= ', name: '< → <=' },
  { find: ' >= ', replace: ' > ', name: '>= → >' },
  { find: ' <= ', replace: ' < ', name: '<= → <' },
  { find: ' === ', replace: ' !== ', name: '=== → !==' },
  { find: ' + ', replace: ' - ', name: '+ → -' },
  { find: ' * ', replace: ' / ', name: '* → /' },
];

const MAX_MUTANTS_PER_FILE = 30;

function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  let totalMutants = 0;
  let killed = 0;
  let survived = 0;
  let timedOut = 0;
  const details = [];

  for (const target of TARGETS) {
    const fullPath = join(SERVER_DIR, target.file);
    const original = readFileSync(fullPath, 'utf-8');
    const lines = original.split('\n');
    let fileMutants = 0;

    for (let i = 0; i < lines.length && fileMutants < MAX_MUTANTS_PER_FILE; i++) {
      const line = lines[i];
      if (!target.lineFilter(line)) continue;

      for (const mut of MUTATIONS) {
        if (!line.includes(mut.find)) continue;
        if (fileMutants >= MAX_MUTANTS_PER_FILE) break;

        fileMutants++;
        totalMutants++;

        // Apply mutation
        const mutatedLines = [...lines];
        mutatedLines[i] = line.replace(mut.find, mut.replace);
        writeFileSync(fullPath, mutatedLines.join('\n'), 'utf-8');

        let status = 'Survived';
        try {
          execSync(target.testCmd, {
            cwd: SERVER_DIR,
            stdio: 'pipe',
            timeout: 5000,
          });
          // Tests passed = mutant survived
          survived++;
        } catch (err) {
          if (err.killed) {
            status = 'Timeout';
            timedOut++;
            killed++; // timeouts count as killed
          } else {
            status = 'Killed';
            killed++;
          }
        }

        // Revert immediately
        writeFileSync(fullPath, original, 'utf-8');

        details.push({
          file: target.file,
          line: i + 1,
          mutation: mut.name,
          status,
        });

        process.stdout.write(status === 'Killed' || status === 'Timeout' ? '.' : 'S');
      }
    }
  }

  const score = totalMutants > 0 ? parseFloat(((killed / totalMutants) * 100).toFixed(2)) : 100;

  console.log(`\n\nMutation Score: ${score}% (${killed}/${totalMutants} killed)`);
  console.log(`  Killed: ${killed - timedOut}, Timeouts: ${timedOut}, Survived: ${survived}`);

  // Write JSON
  const report = { timestamp: new Date().toISOString(), totalMutants, killed, survived, timedOut, score, details };
  writeFileSync(join(REPORTS_DIR, 'mutation.json'), JSON.stringify(report, null, 2));

  // Write Markdown
  const survivedDetails = details.filter(d => d.status === 'Survived');
  const md = `# Mutation Testing Report

**Date**: ${report.timestamp}
**Targets**: \`xirrCalculator.js\`, \`taxEngine.js\`

## Summary

| Metric | Value |
|:---|:---:|
| Total Mutants | ${totalMutants} |
| Killed | ${killed - timedOut} |
| Timeouts (killed) | ${timedOut} |
| Survived | ${survived} |
| **Mutation Score** | **${score}%** |

## Survived Mutants

${survivedDetails.length === 0 ? '✅ All mutants killed!' : survivedDetails.map(d =>
    `| \`${d.file}:${d.line}\` | ${d.mutation} |`
  ).join('\n')}
`;

  writeFileSync(join(REPORTS_DIR, 'mutation.md'), md);
  console.log(`Reports written to reports/mutation.json and reports/mutation.md`);
}

main();
