import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LayeredMemoryManager } from '../services/layeredMemoryManager.js';

describe('CLAIM 4 — Layered Long-Term Memory Architecture Verification Suite', () => {
  const TEST_USER = 'user-memory-test-001';

  afterEach(() => {
    LayeredMemoryManager.resetStores();
  });

  it('1. Mid-term memory with TTL decays and stops influencing prompt assembly after expiry', () => {
    const baseTime = Date.now();

    // Store a mid-term memory with a 500ms TTL
    LayeredMemoryManager.saveMidTermMemory({
      userId: TEST_USER,
      sessionId: 'session-1',
      key: 'discussed_elss',
      value: 'User asked about ELSS tax saving under 80C',
      ttlMs: 500,
    });

    // Before decay: memory is present
    const activeBefore = LayeredMemoryManager.getActiveMidTermMemories(TEST_USER, baseTime + 100);
    assert.equal(activeBefore.length, 1, 'Mid-term memory should be active before TTL expires');
    assert.equal(activeBefore[0].key, 'discussed_elss');

    // After decay (simulate time advancement past TTL)
    const activeAfter = LayeredMemoryManager.getActiveMidTermMemories(TEST_USER, baseTime + 600);
    assert.equal(activeAfter.length, 0, 'Mid-term memory must decay and be absent after TTL expires');

    // Verify it's absent from prompt context assembly too
    const ctx = LayeredMemoryManager.buildRetrievedContext(
      'Tell me about ELSS',
      { userId: TEST_USER },
      [], null, [],
      { userId: TEST_USER, now: baseTime + 600 }
    );
    assert.equal(ctx.midTermMemory.length, 0, 'Decayed mid-term memory must not appear in prompt context');
  });

  it('2. Long-term facts persist across sessions and survive mid-term decay window', () => {
    const baseTime = Date.now();

    // Store a long-term fact (no TTL, permanent)
    LayeredMemoryManager.saveLongTermFact({
      userId: TEST_USER,
      key: 'spouseName',
      value: 'Priya',
    });

    LayeredMemoryManager.saveLongTermFact({
      userId: TEST_USER,
      key: 'retirementGoalAge',
      value: 55,
    });

    // Also store a mid-term memory that will decay
    LayeredMemoryManager.saveMidTermMemory({
      userId: TEST_USER,
      sessionId: 'session-2',
      key: 'session2_topic',
      value: 'Discussed SIP step-up strategy',
      ttlMs: 300,
    });

    // After mid-term decay window
    const farFuture = baseTime + 1000;

    // Long-term facts must still be present
    const facts = LayeredMemoryManager.getLongTermFacts(TEST_USER);
    assert.equal(facts.spouseName, 'Priya', 'Long-term fact spouseName must persist');
    assert.equal(facts.retirementGoalAge, 55, 'Long-term fact retirementGoalAge must persist');

    // Mid-term memory must be gone
    const midTerm = LayeredMemoryManager.getActiveMidTermMemories(TEST_USER, farFuture);
    assert.equal(midTerm.length, 0, 'Mid-term memory must have decayed');

    // Build context at far future — long-term facts in profileMemory, no mid-term
    const ctx = LayeredMemoryManager.buildRetrievedContext(
      'What is my retirement plan?',
      { userId: TEST_USER, age: 35 },
      [], null, [],
      { userId: TEST_USER, now: farFuture }
    );
    assert.equal(ctx.profileMemory.spouseName, 'Priya', 'Long-term fact must appear in profileMemory');
    assert.equal(ctx.profileMemory.retirementGoalAge, 55, 'Long-term fact must appear in profileMemory');
    assert.equal(ctx.midTermMemory.length, 0, 'No decayed mid-term memories in context');

    // OUT-OF-BAND TAMPERING TEST: Mutate long-term fact spouseName out-of-band (simulating DB mutation)
    const longStore = LayeredMemoryManager._getLongTermStore(TEST_USER);
    const spouseEntry = longStore.get('spouseName');
    assert.ok(spouseEntry, 'spouseName entry must exist in internal longTermStore');
    spouseEntry.value = 'CORRUPTED_INJECTED_NAME';

    // Re-retrieval through governed path MUST detect hash mismatch and exclude tampered spouseName while preserving untampered retirementGoalAge
    const factsAfterTampering = LayeredMemoryManager.getLongTermFacts(TEST_USER);
    assert.equal(factsAfterTampering.spouseName, undefined, 'Tampered long-term fact spouseName MUST be excluded upon re-retrieval');
    assert.equal(factsAfterTampering.retirementGoalAge, 55, 'Untampered long-term fact retirementGoalAge MUST survive re-retrieval');

    // Assembled context must also exclude tampered spouseName
    const tamperedCtx = LayeredMemoryManager.buildRetrievedContext(
      'What is my retirement plan?',
      { userId: TEST_USER, age: 35 },
      [], null, [],
      { userId: TEST_USER, now: farFuture }
    );
    assert.equal(tamperedCtx.profileMemory.spouseName, undefined, 'Tampered long-term fact spouseName must not appear in profileMemory');
    assert.equal(tamperedCtx.profileMemory.retirementGoalAge, 55, 'Untampered long-term fact retirementGoalAge must appear in profileMemory');
  });

  it('3. Relevance + recency scoring ranks query-relevant memories higher', () => {
    const now = Date.now();

    const memories = [
      { key: 'discussed_gold', value: 'User wants SGB allocation', timestamp: now - 7200000 }, // 2 hours ago
      { key: 'discussed_tax', value: 'Section 80C ELSS deduction query', timestamp: now - 3600000 }, // 1 hour ago
      { key: 'discussed_nps', value: 'NPS Tier 1 contribution 80CCD', timestamp: now - 600000 }, // 10 min ago
    ];

    // Query about tax deductions — tax and NPS should rank higher than gold
    const ranked = LayeredMemoryManager.scoreAndSelectMemories('How much can I save under 80C tax deduction?', memories, 3, now);

    assert.ok(ranked.length > 0, 'Should return scored memories');
    // The tax-related memory should have a higher combined score than gold
    const taxMemory = ranked.find(m => m.key === 'discussed_tax');
    const goldMemory = ranked.find(m => m.key === 'discussed_gold');
    assert.ok(taxMemory, 'Tax memory should be in results');
    assert.ok(goldMemory, 'Gold memory should be in results');
    assert.ok(taxMemory.combinedScore > goldMemory.combinedScore,
      `Tax memory score (${taxMemory.combinedScore.toFixed(3)}) should outrank gold memory score (${goldMemory.combinedScore.toFixed(3)}) for a tax query`);
  });

  it('4. Cross-session continuity: Session 1 fact persists in Session 3 after Session 2 mid-term decays', () => {
    const baseTime = Date.now();

    // Session 1: Store a long-term fact
    LayeredMemoryManager.saveLongTermFact({
      userId: TEST_USER,
      key: 'primaryGoal',
      value: 'Retire by 50 with ₹5Cr corpus',
    });

    // Session 2: Store a mid-term memory (TTL 200ms)
    LayeredMemoryManager.saveMidTermMemory({
      userId: TEST_USER,
      sessionId: 'session-2',
      key: 'session2_discussion',
      value: 'Explored aggressive equity tilt',
      ttlMs: 200,
    });

    // Session 3 (after Session 2 mid-term decayed)
    const session3Time = baseTime + 500;
    const ctx = LayeredMemoryManager.buildRetrievedContext(
      'What is my retirement goal?',
      { userId: TEST_USER, age: 32 },
      [], null, [],
      { userId: TEST_USER, now: session3Time }
    );

    // Long-term fact from Session 1 must be present
    assert.equal(ctx.profileMemory.primaryGoal, 'Retire by 50 with ₹5Cr corpus',
      'Session 1 long-term fact must influence Session 3');

    // Mid-term from Session 2 must be absent (decayed)
    assert.equal(ctx.midTermMemory.length, 0,
      'Session 2 mid-term memory must have decayed by Session 3');

    // Formatted prompt must include the long-term fact
    const prompt = LayeredMemoryManager.formatForPrompt(ctx);
    assert.ok(!prompt.includes('aggressive equity'), 'Decayed session 2 mid-term must not appear in prompt');
  });
});
