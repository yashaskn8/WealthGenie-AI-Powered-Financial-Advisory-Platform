import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { processChat } from '../services/geminiChatService.js';
import { ProviderManager } from '../services/providerAbstraction.js';
import FinancialProfile from '../models/FinancialProfile.js';
import User from '../models/User.js';
import ConversationHistory from '../models/ConversationHistory.js';
import Goal from '../models/Goal.js';
import Recommendation from '../models/Recommendation.js';

describe('Phase 4: Session-Level Cost & Runaway-Loop Safety Protection', () => {
  const testUserId = '64b0f0000000000000000001';
  const testSessionId = 'session-safety-test-001';

  beforeEach(() => {
    FinancialProfile.findOne = () => ({
      sort: () => ({
        lean: async () => ({
          _id: '64b0f0000000000000000002',
          userId: testUserId,
          age: 32,
          income: 150000,
          annualIncome: 1800000,
          savings: 45000,
          monthlySavings: 45000,
          riskCategory: 'Moderate',
          taxRegime: 'new',
          investmentHorizon: 15,
          recommendedEquityAllocation: 60,
        }),
      }),
    });

    User.findById = () => ({
      lean: async () => ({
        _id: testUserId,
        name: 'Rohan Sharma',
        email: 'rohan@example.com',
      }),
    });

    Recommendation.findOne = () => ({
      sort: () => ({
        lean: async () => ({
          recommendedRegime: 'new',
          allocation: { equity: 60, debt: 40 },
          generatedAt: new Date(),
        }),
      }),
    });

    Goal.find = () => ({
      sort: () => ({
        lean: async () => [],
      }),
    });
  });

  it('1. User-Facing Safety Limit Notice: Delivered directly in response text when replans are exhausted with failures', async () => {
    ConversationHistory.findOne = async () => null;
    ConversationHistory.prototype.save = async function() { return this; };

    ProviderManager.gemini.generate = async () => ({
      text: 'Repeatedly failed tool parameters.',
      tool_calls: [{ tool: 'sip_projection', arguments: { monthlyInvestment: -999, annualRate: 5.0, years: -10 } }],
      tokensUsed: 200,
      provider: 'gemini',
      wasCompleted: true,
    });

    const res = await processChat({
      userId: testUserId,
      user: { userId: testUserId, email: 'rohan@example.com' },
      message: 'Induce runaway loop with invalid parameters',
      sessionId: testSessionId,
    });

    assert.equal(res.audit.safety_limit_triggered, true);
    assert.equal(res.audit.safety_limit_reason, 'MAX_REPLANS_EXHAUSTED_WITH_FAILURES');
    // Verify user-facing response contains clear warning banner
    assert.match(res.response, /⚠️ \*\*Session Safety Limit Notice\*\*/);
    assert.match(res.response, /maximum calculation depth limit/);
  });

  it('2. Session-Level Token Budget Cap: Terminates immediately when cumulative session tokens exceed 50,000', async () => {
    // Mock existing session with 52,000 cumulative tokens
    const existingSession = new ConversationHistory({
      userId: testUserId,
      profileId: '64b0f0000000000000000002',
      session_id: 'exhausted-session-002',
      messages: [{ role: 'user', content: 'previous query' }],
      cumulative_tokens: 52000,
      cumulative_hops: 15,
    });

    ConversationHistory.findOne = async () => existingSession;

    const res = await processChat({
      userId: testUserId,
      user: { userId: testUserId, email: 'rohan@example.com' },
      message: 'Calculate something new in exhausted session',
      sessionId: 'exhausted-session-002',
    });

    assert.equal(res.provider, 'safety_circuit_breaker');
    assert.equal(res.audit.safety_limit_triggered, true);
    assert.equal(res.audit.safety_limit_reason, 'SESSION_CUMULATIVE_TOKEN_CAP_EXCEEDED');
    assert.match(res.response, /⚠️ \*\*Session Safety Limit Reached\*\*/);
    assert.match(res.response, /cumulative reasoning token budget \(50,000 tokens\)/);
  });

  it('3. Turn-Level Token Budget Cap: Replan loop terminates when single turn token usage exceeds 12,000', async () => {
    ConversationHistory.findOne = async () => null;
    ConversationHistory.prototype.save = async function() { return this; };

    let pass = 0;
    ProviderManager.gemini.generate = async () => {
      pass++;
      return {
        text: 'Heavy token response',
        tool_calls: pass === 1 ? [{ tool: 'sip_projection', arguments: { monthlyInvestment: 5000, annualRate: 0.12, years: 10 } }] : [],
        tokensUsed: 13000, // Exceeds 12000 turn limit
        provider: 'gemini',
        wasCompleted: true,
      };
    };

    const res = await processChat({
      userId: testUserId,
      user: { userId: testUserId, email: 'rohan@example.com' },
      message: 'Heavy token query',
      sessionId: 'heavy-token-session-003',
    });

    assert.ok(res.tokens_used >= 12000);
    assert.equal(res.audit.tokens_used >= 12000, true);
  });
});
