/**
 * Phase 1 Integration Test — End-to-End RAG Wiring Test
 * Tests that factual/regulatory queries sent to POST /api/chat/message are classified
 * by IntentGate, routed to FastAPI /rag/query, and return grounded answers with real citations.
 */
import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import chatRouter from '../routes/chatRoutes.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { withServer, jsonRequest } from '../test-utils/httpTestUtils.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import Goal from '../models/Goal.js';
import ConversationHistory from '../models/ConversationHistory.js';
import User from '../models/User.js';

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

describe('Phase 1 Architecture Truth — RAG Chat Integration Tests', () => {
  let originalProfileFindOne;
  let originalRecFindOne;
  let originalGoalFind;
  let originalConvFindOne;
  let originalUserFindById;

  beforeEach(() => {
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
      session_id: query?.session_id || 'test-session',
      messages: [],
      save: async () => true,
    });

    User.findById = () => ({
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

  it('Routes factual tax question through IntentGate to RAG and returns grounded citations from seed knowledge', async () => {
    const app = buildApp();

    await withServer(app, async (baseUrl) => {
      const { response, body } = await jsonRequest(`${baseUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          message: 'How much deduction is allowed under Section 80C for ELSS?',
        }),
      });

      assert.equal(response.status, 200, `Expected status 200, got ${response.status}`);
      assert.equal(body.provider, 'rag', `Expected provider 'rag', got '${body.provider}'`);
      assert.equal(body.grounded, true, 'Expected grounded response to be true');
      assert.ok(body.response && body.response.length > 0, 'Expected non-empty response text');
      assert.ok(Array.isArray(body.citations), 'Expected citations array in response');
      assert.ok(body.citations.length > 0, 'Expected at least 1 citation from vector store');

      console.info('\n[INTEGRATION TEST VERIFIED OUTPUT]');
      console.info('Grounded Response Snippet:', body.response.substring(0, 120), '...');
      console.info('Citations Count:', body.citations.length);
      console.info('First Citation:', body.citations[0]);
      console.info('Retrieved Chunks:', body.retrieved_chunks?.length || 0);

      // Verify citation traces back to seed knowledge content
      const citationText = JSON.stringify(body.citations) + JSON.stringify(body.retrieved_chunks);
      assert.ok(
        citationText.includes('80C') || citationText.includes('Tax') || citationText.includes('ELSS'),
        'Citations must trace back to seed knowledge base tax regulations'
      );
    });
  });

  it('Routes non-factual conversational turn away from RAG to general LLM provider', async () => {
    const app = buildApp();

    await withServer(app, async (baseUrl) => {
      const { response, body } = await jsonRequest(`${baseUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          message: 'Hello Genie, how are you today?',
        }),
      });

      assert.equal(response.status, 200);
      assert.notEqual(body.provider, 'rag', 'Non-factual conversational turn should NOT be routed to RAG');
    });
  });
});
