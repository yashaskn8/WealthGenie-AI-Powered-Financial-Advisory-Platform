import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendStep,
  getWorkflowSteps,
  executeWorkflow,
  resumeWorkflow,
  clearInMemoryStreams,
  computeHash,
} from '../services/dagStream.js';

describe('CLAIM 2 (Step 2) — Redis Streams DAG Step Persistence & Crash-Resume Suite', () => {

  beforeEach(() => {
    clearInMemoryStreams();
  });

  it('1. Persists sequential DAG steps and retrieves them in exact ordinal order', async () => {
    const workflowId = 'wf-test-seq-1';

    await appendStep(workflowId, {
      stepName: 'eligibility_filter',
      stepIndex: 0,
      status: 'completed',
      input: { userId: 'u123', age: 30 },
      result: { eligibleInstruments: ['Equity_MF', 'PPF', 'NPS'] },
    });

    await appendStep(workflowId, {
      stepName: 'tax_optimisation',
      stepIndex: 1,
      status: 'completed',
      input: { eligibleInstruments: ['Equity_MF', 'PPF', 'NPS'], income: 1500000 },
      result: { marginalRate: 0.30, recommended80C: 150000 },
    });

    await appendStep(workflowId, {
      stepName: 'portfolio_allocation',
      stepIndex: 2,
      status: 'completed',
      input: { recommended80C: 150000 },
      result: { weights: { Equity_MF: 0.6, PPF: 0.2, NPS: 0.2 } },
    });

    const steps = await getWorkflowSteps(workflowId);

    assert.equal(steps.length, 3, 'Must retrieve exactly 3 recorded steps');
    assert.equal(steps[0].stepName, 'eligibility_filter');
    assert.equal(steps[0].stepIndex, 0);
    assert.equal(steps[1].stepName, 'tax_optimisation');
    assert.equal(steps[1].stepIndex, 1);
    assert.equal(steps[2].stepName, 'portfolio_allocation');
    assert.equal(steps[2].stepIndex, 2);

    // Verify SHA-256 hashes are recorded
    assert.ok(steps[0].inputHash, 'Must have computed input SHA-256 hash');
    assert.ok(steps[0].outputHash, 'Must have computed output SHA-256 hash');
  });

  it('2. CRASH & RESUME PROOF: Interrupted 4-step workflow resumes from Step 3 without repeating Steps 1 & 2', async () => {
    const workflowId = 'wf-crash-sim-42';
    const executionCounts = {
      step1: 0,
      step2: 0,
      step3: 0,
      step4: 0,
    };

    // Step definitions for the 4-step financial advisory DAG
    const dagSteps = [
      {
        name: 'step1_user_profile',
        execute: async (ctx) => {
          executionCounts.step1++;
          return { riskProfile: 'MODERATE', monthlySavings: 25000 };
        },
      },
      {
        name: 'step2_tax_bracket',
        execute: async (ctx) => {
          executionCounts.step2++;
          return { taxRegime: 'new', standardDeduction: 75000 };
        },
      },
      {
        name: 'step3_asset_allocation',
        execute: async (ctx) => {
          executionCounts.step3++;
          return { equityWeight: 0.65, debtWeight: 0.35 };
        },
      },
      {
        name: 'step4_monte_carlo_validation',
        execute: async (ctx) => {
          executionCounts.step4++;
          return { successProbability: 0.94, terminalWealth: 15000000 };
        },
      },
    ];

    // --- PHASE 1: Simulate Execution up to Step 2, then process crashes ---
    // Execute Step 1
    await appendStep(workflowId, {
      stepName: 'step1_user_profile',
      stepIndex: 0,
      status: 'completed',
      input: { userId: 'user-crash-test' },
      result: { riskProfile: 'MODERATE', monthlySavings: 25000 },
    });
    executionCounts.step1++;

    // Execute Step 2
    await appendStep(workflowId, {
      stepName: 'step2_tax_bracket',
      stepIndex: 1,
      status: 'completed',
      input: { riskProfile: 'MODERATE', monthlySavings: 25000 },
      result: { taxRegime: 'new', standardDeduction: 75000 },
    });
    executionCounts.step2++;

    // Process is killed here before Step 3 runs.
    // Verify pre-crash state:
    assert.equal(executionCounts.step1, 1);
    assert.equal(executionCounts.step2, 1);
    assert.equal(executionCounts.step3, 0);
    assert.equal(executionCounts.step4, 0);

    // --- PHASE 2: Restart / Resume Workflow from persisted Redis Stream ---
    const resumeResult = await resumeWorkflow(workflowId, dagSteps, { userId: 'user-crash-test' });

    // Assert that resume identified the crash point and skipped completed steps
    assert.equal(resumeResult.status, 'COMPLETED');
    assert.equal(resumeResult.resumedFromStepIndex, 2, 'Must resume at Step index 2 (Step 3)');
    assert.equal(resumeResult.skippedStepsCount, 2, 'Must skip exactly 2 already-completed steps');
    assert.equal(resumeResult.stepsExecuted.length, 2, 'Must execute only the remaining 2 steps');

    // Assert that Step 1 and Step 2 were NOT re-executed during resume
    assert.equal(executionCounts.step1, 1, 'Step 1 must NOT be re-executed upon resume');
    assert.equal(executionCounts.step2, 1, 'Step 2 must NOT be re-executed upon resume');

    // Assert that Step 3 and Step 4 WERE executed
    assert.equal(executionCounts.step3, 1, 'Step 3 must be executed upon resume');
    assert.equal(executionCounts.step4, 1, 'Step 4 must be executed upon resume');

    // Assert that the final context has accumulated state from ALL 4 steps
    assert.equal(resumeResult.context.riskProfile, 'MODERATE');
    assert.equal(resumeResult.context.taxRegime, 'new');
    assert.equal(resumeResult.context.equityWeight, 0.65);
    assert.equal(resumeResult.context.successProbability, 0.94);

    // Verify full stream has all 4 completed steps recorded
    const finalStream = await getWorkflowSteps(workflowId);
    const completed = finalStream.filter(s => s.status === 'completed');
    assert.equal(completed.length, 4, 'Stream must record all 4 completed steps');
  });

  it('3. Successfully executes end-to-end workflow when starting from fresh state', async () => {
    const workflowId = 'wf-fresh-run-101';
    let count = 0;

    const steps = [
      { name: 'op_a', execute: async () => { count++; return { a: 10 }; } },
      { name: 'op_b', execute: async (ctx) => { count++; return { b: ctx.a * 2 }; } },
    ];

    const result = await executeWorkflow(workflowId, steps, { initial: true });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(count, 2);
    assert.equal(result.context.a, 10);
    assert.equal(result.context.b, 20);

    const recorded = await getWorkflowSteps(workflowId);
    const completed = recorded.filter(s => s.status === 'completed');
    assert.equal(completed.length, 2);
  });
});
