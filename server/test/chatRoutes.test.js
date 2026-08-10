import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import chatRouter from '../routes/chatRoutes.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { withServer, rawRequest } from '../test-utils/httpTestUtils.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import Goal from '../models/Goal.js';
import ConversationHistory from '../models/ConversationHistory.js';
import User from '../models/User.js';
import { ProviderManager } from '../services/providerAbstraction.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-wealthgenie-2026';
process.env.JWT_SECRET = JWT_SECRET;

const mockUserId = '60d5ecb8b3b3a72d9c8e4a11';
const validToken = jwt.sign({ userId: mockUserId, email: 'test@example.com' }, JWT_SECRET, { expiresIn: '1h' });

const mockProfile = {
  _id: '60d5ecb8b3b3a72d9c8e4a22',
  userId: mockUserId,
  age: 30,
  annualIncome: 1000000,
  monthlySavings: 25000,
  riskCategory: 'Moderate',
  taxRegime: 'new',
  investmentHorizon: 15,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  app.use(errorHandler);
  return app;
}

describe('Chat Routes Integration & Input Validation Tests', () => {
  let originalProfileFindOne;
  let originalRecFindOne;
  let originalGoalFind;
  let originalConvFindOne;
  let originalUserFindById;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.GROQ_API_KEY = 'mock-groq-key';
    ProviderManager.gemini.recordSuccess();
    ProviderManager.groq.recordSuccess();

    originalProfileFindOne = FinancialProfile.findOne;
    originalRecFindOne = Recommendation.findOne;
    originalGoalFind = Goal.find;
    originalConvFindOne = ConversationHistory.findOne;
    originalUserFindById = User.findById;

    FinancialProfile.findOne = (query) => ({
      sort: () => ({
        lean: async () => (query?.userId === mockUserId ? mockProfile : null),
      }),
    });

    Recommendation.findOne = () => ({
      sort: () => ({
        lean: async () => null,
      }),
    });

    Goal.find = () => ({
      sort: () => ({
        lean: async () => [],
      }),
    });

    ConversationHistory.findOne = async (query) => ({
      userId: query?.userId || mockUserId,
      session_id: query?.session_id || 'test-session-123',
      messages: [],
      save: async () => true,
    });

    User.findById = (id) => ({
      lean: async () => ({ name: 'Test User', email: 'test@example.com' }),
    });
  });

  afterEach(() => {
    FinancialProfile.findOne = originalProfileFindOne;
    Recommendation.findOne = originalRecFindOne;
    Goal.find = originalGoalFind;
    ConversationHistory.findOne = originalConvFindOne;
    User.findById = originalUserFindById;
  });

  it('POST /api/chat/message rejects unauthenticated request with 401', async () => {
    await withServer(buildApp(), async (baseUrl) => {
      const res = await rawRequest(`${baseUrl}/api/chat/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      assert.equal(res.status, 401);
    });
  });

  it('POST /api/chat/message rejects empty message with 400 Bad Request', async () => {
    await withServer(buildApp(), async (baseUrl) => {
      const res = await rawRequest(`${baseUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ message: '   ' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error || data.details?.[0], /Validation failed|cannot be empty/);
    });
  });

  it('POST /api/chat/message rejects message exceeding 1000 chars with 400', async () => {
    await withServer(buildApp(), async (baseUrl) => {
      const hugeMessage = 'A'.repeat(1001);
      const res = await rawRequest(`${baseUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ message: hugeMessage }),
      });
      assert.equal(res.status, 400);
    });
  });

  // ── MCP Two-Pass Contract Protocol & Route Coverage ──
  // Cross-Reference: Service-level execution mechanics are tested in server/test/twoPassChatLoop.test.js and server/test/geminiChatService.test.js

  it('POST /api/chat/message responds with 200 and complete V3 contract response shape', async () => {
    await withServer(buildApp(), async (baseUrl) => {
      const res = await rawRequest(`${baseUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({ message: 'What is my optimal tax regime?' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.response, 'string');
      assert.equal(typeof data.session_id, 'string');
      assert.equal(data.version, '3.0');
      assert.ok(Array.isArray(data.tool_calls), 'Response must contain tool_calls array');
      assert.ok(Array.isArray(data.tool_results), 'Response must contain tool_results array');
      assert.ok(Array.isArray(data.action_cards), 'Response must contain action_cards array');
      assert.ok(data.governance, 'Response must contain governance metadata');
      assert.ok(data.explainability, 'Response must contain explainability metadata');
      assert.ok(data.verification, 'Response must contain verification metadata');
      assert.ok(data.audit, 'Response must contain audit metadata');
    });
  });

  it('POST /api/chat/message end-to-end two-pass tool execution through Express route layer', async () => {
    const originalPost = (await import('axios')).default.post;
    let callCount = 0;

    (await import('axios')).default.post = async (url) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        callCount++;
        if (callCount === 1) {
          return {
            data: {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'sip_projection',
                          args: { monthlyInvestment: 10000, annualRate: 0.12, years: 10 },
                        },
                      },
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: { totalTokenCount: 100 },
            },
          };
        } else {
          return {
            data: {
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Grounded response: SIP future value is ₹23,23,391.' }],
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: { totalTokenCount: 120 },
            },
          };
        }
      }
      throw new Error('Unexpected URL');
    };

    try {
      await withServer(buildApp(), async (baseUrl) => {
        const res = await rawRequest(`${baseUrl}/api/chat/message`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${validToken}`,
          },
          body: JSON.stringify({ message: 'Calculate 10000 monthly SIP for 10 years at 12%' }),
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(callCount, 2, 'Route handler must execute 2-pass LLM cycle for tool calls');
        assert.equal(data.tool_results.length, 1);
        assert.equal(data.tool_results[0].result.futureValue, 2323391);
        assert.match(data.response, /₹23,23,391/);
      });
    } finally {
      (await import('axios')).default.post = originalPost;
    }
  });

  it('DELETE /api/chat/session/:sessionId clears session idempotently', async () => {
    ConversationHistory.findOneAndUpdate = async () => ({ session_id: 'sess-123', is_active: false });

    await withServer(buildApp(), async (baseUrl) => {
      const res = await rawRequest(`${baseUrl}/api/chat/session/sess-123`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.message, 'Session cleared.');
    });
  });
});
