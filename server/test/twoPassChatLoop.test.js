import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { processChat } from '../services/geminiChatService.js';
import { ProviderManager } from '../services/providerAbstraction.js';
import { PrometheusMetrics } from '../services/metricsCollector.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import Goal from '../models/Goal.js';
import User from '../models/User.js';
import ConversationHistory from '../models/ConversationHistory.js';

const mockUserId = '60d5ecb8b3b3a72d9c8e4a11';
const mockSessionId = 'test-session-2pass';

const mockUser = {
  _id: mockUserId,
  email: 'investor@example.com',
  name: 'Grounded Investor',
};

const mockProfile = {
  _id: '60d5ecb8b3b3a72d9c8e4a33',
  userId: mockUserId,
  age: 30,
  annualIncome: 1500000,
  monthlySavings: 20000,
  riskCategory: 'Moderate',
  taxRegime: 'new',
  investmentHorizon: 10,
  recommendedEquityAllocation: 60,
};

describe('Phase 3: Two-Pass Tool-Grounded Chat Loop Tests', () => {
  let originalPost;
  let originalProfileFindOne;
  let originalRecFindOne;
  let originalGoalFind;
  let originalUserFindById;
  let originalConvFindOne;
  let savedMessages = [];

  beforeEach(() => {
    originalPost = axios.post;
    originalProfileFindOne = FinancialProfile.findOne;
    originalRecFindOne = Recommendation.findOne;
    originalGoalFind = Goal.find;
    originalUserFindById = User.findById;
    originalConvFindOne = ConversationHistory.findOne;
    savedMessages = [];

    process.env.GEMINI_API_KEY = 'mock-gemini-key';
    process.env.GROQ_API_KEY = 'mock-groq-key';

    ProviderManager.gemini.recordSuccess();
    ProviderManager.groq.recordSuccess();

    FinancialProfile.findOne = () => ({ sort: () => ({ lean: async () => mockProfile }) });
    Recommendation.findOne = () => ({ sort: () => ({ lean: async () => null }) });
    Goal.find = () => ({ sort: () => ({ lean: async () => [] }) });
    User.findById = () => ({ lean: async () => mockUser });
    ConversationHistory.findOne = async () => ({
      userId: mockUserId,
      session_id: mockSessionId,
      messages: savedMessages,
      save: async function () { return true; },
    });
  });

  afterEach(() => {
    axios.post = originalPost;
    FinancialProfile.findOne = originalProfileFindOne;
    Recommendation.findOne = originalRecFindOne;
    Goal.find = originalGoalFind;
    User.findById = originalUserFindById;
    ConversationHistory.findOne = originalConvFindOne;
  });

  it('Two-Pass Execution: Pass 1 requests sip_projection tool, Pass 2 grounds final response in tool result', async () => {
    let callCount = 0;
    let pass2ReceivedToolResult = false;
    let pass1ResponseText = 'Pass 1 ungrounded guess: your SIP might grow to ₹20,00,000.';

    axios.post = async (url, payload) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        callCount++;
        if (callCount === 1) {
          // Pass 1: Emit native function call
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
          // Pass 2: Received history with functionResponse part
          const contents = payload.contents || [];
          const lastTurn = contents[contents.length - 1];
          const hasFunctionResponse = lastTurn?.parts?.some(p => p.functionResponse?.name === 'sip_projection');
          if (hasFunctionResponse) {
            pass2ReceivedToolResult = true;
          }

          return {
            data: {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: 'Based on exact computation, a monthly SIP of ₹10,000 at 12% over 10 years yields a future value of ₹23,23,391.',
                      },
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: { totalTokenCount: 150 },
            },
          };
        }
      }
      throw new Error('Unexpected URL');
    };

    const result = await processChat({
      userId: mockUserId,
      user: mockUser,
      message: 'Calculate future value of 10000 monthly SIP for 10 years at 12%',
      sessionId: mockSessionId,
    });

    assert.equal(callCount, 2, 'Must execute exactly two passes for tool-grounded query');
    assert.equal(pass2ReceivedToolResult, true, 'Pass 2 must receive tool execution result in conversation history');
    assert.equal(result.tool_results.length, 1);
    assert.equal(result.tool_results[0].result.futureValue, 2323391);
    assert.match(result.response, /₹23,23,391/);
    assert.notEqual(result.response, pass1ResponseText, 'Pass 2 response must differ from ungrounded Pass 1 text');
  });

  it('Direct Answer Path: General inquiry without tools returns Pass 1 response directly without Pass 2', async () => {
    let callCount = 0;

    axios.post = async (url) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        callCount++;
        return {
          data: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Equity mutual funds invest in stocks of listed companies.' }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { totalTokenCount: 80 },
          },
        };
      }
      throw new Error('Unexpected URL');
    };

    const result = await processChat({
      userId: mockUserId,
      user: mockUser,
      message: 'What are equity mutual funds?',
      sessionId: mockSessionId,
    });

    assert.equal(callCount, 1, 'Direct non-computational query must complete in Pass 1');
    assert.match(result.response, /invest in stocks/);
    assert.equal(result.tool_results.length, 0);
  });
});
