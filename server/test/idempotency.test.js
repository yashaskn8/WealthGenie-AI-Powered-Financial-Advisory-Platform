import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeStepIdempotent,
  executeWorkflow,
  getDeadLetters,
  clearInMemoryStreams,
} from '../services/dagStream.js';
import { DeadLetterProcessor } from '../services/deadLetterProcessor.js';

describe('CLAIM 4 (Step 4) — Idempotency & Dead-Letter Handling Suite', () => {

  beforeEach(() => {
    clearInMemoryStreams();
  });

  it('1. IDEMPOTENCY PROOF: Identical step calls return cached result without re-executing', async () => {
    const workflowId = 'wf-idempotent-test-1';
    let executionCount = 0;

    const step = {
      name: 'calculate_tax_slab',
      execute: async (ctx) => {
        executionCount++;
        return { calculatedTax: ctx.income * 0.20, deductionsApplied: 50000 };
      },
    };

    const input = { userId: 'u1', income: 1000000 };

    // 1st Execution
    const firstCall = await executeStepIdempotent(workflowId, step, 0, input);
    assert.equal(executionCount, 1, 'First call must invoke executor');
    assert.equal(firstCall.fromCache, false, 'First call is not from cache');
    assert.equal(firstCall.result.calculatedTax, 200000);

    // 2nd Execution with IDENTICAL input
    const secondCall = await executeStepIdempotent(workflowId, step, 0, input);
    assert.equal(executionCount, 1, 'Second call MUST NOT invoke executor again (Idempotent)');
    assert.equal(secondCall.fromCache, true, 'Second call must indicate cache hit');
    assert.equal(secondCall.result.calculatedTax, 200000, 'Second call must return exact cached result');

    // 3rd Execution with DIFFERENT input
    const differentInput = { userId: 'u1', income: 1500000 };
    const thirdCall = await executeStepIdempotent(workflowId, step, 0, differentInput);
    assert.equal(executionCount, 2, 'Call with changed input MUST execute');
    assert.equal(thirdCall.fromCache, false);
    assert.equal(thirdCall.result.calculatedTax, 300000);
  });

  it('2. DEAD-LETTER ROUTING: 3 consecutive failures route step to Dead-Letter Queue', async () => {
    const workflowId = 'wf-dlq-test-fail-1';
    let attempts = 0;

    const failingStep = {
      name: 'external_tax_service_call',
      execute: async () => {
        attempts++;
        throw new Error('503 Service Unavailable: Remote Tax API down');
      },
    };

    const input = { pan: 'ABCDE1234F' };

    // Should exhaust 3 retries and throw
    await assert.rejects(
      async () => {
        await executeStepIdempotent(workflowId, failingStep, 0, input, 3);
      },
      /503 Service Unavailable/,
      'Must throw error after exhausting retries'
    );

    assert.equal(attempts, 3, 'Must attempt exactly 3 times before DLQ routing');

    // Verify Dead-Letter Queue contains the failed entry
    const dlq = await getDeadLetters();
    assert.equal(dlq.length, 1, 'Must have exactly 1 entry in DLQ');
    assert.equal(dlq[0].workflowId, workflowId);
    assert.equal(dlq[0].stepName, 'external_tax_service_call');
    assert.equal(dlq[0].retryCount, 3);
    assert.match(dlq[0].error, /503 Service Unavailable/);
  });

  it('3. DeadLetterProcessor reports DLQ statistics accurately', async () => {
    const workflowId = 'wf-dlq-stats-test';

    const failingStep = {
      name: 'failing_step',
      execute: async () => { throw new Error('Unrecoverable DB Error'); },
    };

    try {
      await executeStepIdempotent(workflowId, failingStep, 0, {}, 3);
    } catch { /* expected */ }

    const stats = await DeadLetterProcessor.getStats();
    assert.equal(stats.totalDeadLetters, 1);
    assert.equal(stats.affectedWorkflowsCount, 1);
    assert.ok(stats.affectedWorkflows.includes(workflowId));
    assert.equal(stats.recentDeadLetters.length, 1);
  });
});
