import { runEvaluationSuite } from '../eval/chatEvaluationFramework.js';

async function main() {
  console.log('Running GenieChat v2 Automated AI Evaluation Suite...');
  const report = await runEvaluationSuite();
  console.log('\n===== EVALUATION SUITE REPORT =====');
  console.log(JSON.stringify(report, null, 2));
  console.log('=====================================\n');

  if (report.tool_selection_accuracy_pct < 95.0 || report.security_detection_rate_pct < 95.0) {
    console.error('Evaluation Failed: Metrics below required 95% threshold!');
    process.exit(1);
  }

  console.log('✅ Evaluation Suite Passed Successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Evaluation Error:', err);
  process.exit(1);
});
