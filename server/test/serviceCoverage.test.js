import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import FinancialProfile from '../models/FinancialProfile.js';
import { generateAdvisory, getGoalAdvisory } from '../services/geminiService.js';
import { processChat } from '../services/geminiChatService.js';
import { buildSystemPrompt } from '../services/genieChatSystemPrompt.js';
import { INSTRUMENT_PARAMS, buildRateLookup, getNominalRate, getVolatility, toMonthlyRate, updateLiveParam } from '../services/instrumentConstants.js';
import { fetchIndexStatistics, fetchMutualFundNAVs, checkFDRateStaleness } from '../services/marketDataService.js';
import { checkMLHealth, getMLPrediction, getRuleBasedFallback } from '../services/mlClient.js';
import { queryRAG } from '../services/ragClient.js';
import { computeCAGR, generateProjections, lumpSumFV, realReturn, reverseSIPFromFV, sipFV, stepUpSipFV } from '../services/projectionEngine.js';
import { calculatePostTaxReturn, calculatePostTaxReturnSafe } from '../services/postTaxCalculator.js';
import { encodeRiskCategory, getRiskProfile } from '../services/riskProfiler.js';

process.env.JWT_SECRET = 'service-coverage-test-secret';
process.env.NODE_ENV = 'test';

test('geminiService uses Gemini before Groq and falls back deterministically', async (t) => {
  const originalPost = axios.post;
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;
  const calls = [];

  process.env.GEMINI_API_KEY = 'gemini-test-key';
  process.env.GROQ_API_KEY = 'groq-test-key';
  axios.post = async (url) => {
    calls.push(url);
    return { data: { candidates: [{ content: { parts: [{ text: 'Gemini response' }] }, finishReason: 'STOP' }] } };
  };
  t.after(() => {
    axios.post = originalPost;
    if (originalGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalGemini;
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalGroq;
  });

  const advisory = await generateAdvisory({ age: 32, annualIncome: 900000, monthlySavings: 20000, taxSlab: 0.1, riskCategory: 'Moderate', instruments: [], horizon: 10 });
  const goalAdvice = await getGoalAdvisory('Suggest one adjustment.', { age: 32, annualIncome: 900000, riskCategory: 'Moderate' });

  assert.equal(advisory.text, 'Gemini response');
  assert.equal(goalAdvice, 'Gemini response');
  assert.ok(calls[0].includes('generativelanguage.googleapis.com'));
  assert.ok(calls[1].includes('generativelanguage.googleapis.com'));
});

test('geminiChatService returns profile setup guidance when no profile exists', async (t) => {
  const originalFindOne = FinancialProfile.findOne;
  FinancialProfile.findOne = () => ({ sort: () => ({ lean: async () => null }) });
  t.after(() => { FinancialProfile.findOne = originalFindOne; });

  const result = await processChat({
    userId: 'chat-service-user-no-profile',
    user: { email: 'user@example.com' },
    message: 'What should I invest in?',
    sessionId: 'session-1',
  });

  assert.equal(result.grounded, false);
  assert.match(result.response, /financial profile/i);
});

test('genieChatSystemPrompt grounds prompt in profile, tax, recommendations, and goals', () => {
  const prompt = buildSystemPrompt(
    { name: 'Priya', email: 'p@example.com' },
    { income: 100000, annualIncome: 1200000, savings: 25000, age: 35, riskCategory: 'Moderate', recommendedEquityAllocation: 50, taxRegime: 'new', investmentHorizon: 15 },
    { instruments: [{ name: 'Nifty 50 ETF', type: 'ETF', postTaxReturn: 10.8 }] },
    null,
    [{ goal_name: 'Retirement', target_amount: 5000000, target_date: '2045-01-01' }]
  );

  assert.match(prompt, /Priya/);
  assert.match(prompt, /Nifty 50 ETF/);
  assert.match(prompt, /Retirement/);
  assert.match(prompt, /ACTION_CARD/);
  assert.match(prompt, /SEBI/);
});

test('instrumentConstants exposes immutable rates and live override path', () => {
  assert.equal(getNominalRate('FD'), 6.5);
  assert.equal(getVolatility('FD'), 0.005);
  assert.equal(getNominalRate('UNKNOWN'), 7.0);
  assert.equal(toMonthlyRate(0.12), 0.01);
  assert.ok(toMonthlyRate(0.12, true) > 0.009);
  assert.throws(() => { INSTRUMENT_PARAMS.FD = {}; }, /immutable/i);

  updateLiveParam('FD', 6.8, 0.006);
  assert.equal(INSTRUMENT_PARAMS.FD.nominalRate, 6.8);
  assert.equal(buildRateLookup().FD, 6.8);
});

test('marketDataService parses mocked AMFI and Yahoo responses without network', async (t) => {
  const originalGet = axios.get;
  axios.get = async (url) => {
    if (url.includes('NAVAll.txt')) {
      return { data: 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\n123;INF;INF;Example Fund;12.34;01-Jan-2026\n' };
    }
    return {
      data: {
        chart: { result: [{ indicators: { quote: [{ close: [100, 102, 104, 103, 106, 108, 110, 111, 115, 117, 119, 121, 123, 126] }] } }] }
      }
    };
  };
  t.after(() => { axios.get = originalGet; });

  const navs = await fetchMutualFundNAVs();
  const stats = await fetchIndexStatistics('^NSEI');

  assert.equal(navs.count, 1);
  assert.equal(navs.navMap['123'].nav, 12.34);
  assert.equal(stats.symbol, '^NSEI');
  assert.ok(Number.isFinite(stats.annualised_return));
  assert.ok(Number.isFinite(stats.annualised_volatility));
});

test('marketDataService FD staleness handles stale counts and model failures', async () => {
  const stale = await checkFDRateStaleness({ countDocuments: async () => 2 });
  const safe = await checkFDRateStaleness({ countDocuments: async () => { throw new Error('db down'); } });

  assert.equal(stale.needs_refresh, true);
  assert.equal(stale.stale_count, 2);
  assert.equal(safe.needs_refresh, false);
});

test('mlClient posts to enriched endpoint and falls back on service failure', async (t) => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  let postedUrl = '';
  let postedHeaders = null;
  let getHeaders = null;

  axios.post = async (url, payload, config) => {
    postedUrl = url;
    postedHeaders = config?.headers;
    assert.equal(payload.age, 40);
    assert.equal(payload.liquid_savings, 50000);
    return { data: { primary: 'ETF', secondary: 'Debt_MF', tertiary: 'ELSS', confidence_scores: { ETF: 0.7 } } };
  };
  axios.get = async (url, config) => {
    getHeaders = config?.headers;
    return { data: { status: 'ok' } };
  };
  t.after(() => { axios.post = originalPost; axios.get = originalGet; console.warn = originalWarn; });

  const prediction = await getMLPrediction({
    age: 40,
    annual_income: 1200000,
    monthly_savings: 25000,
    risk_category: 'Moderate',
    liquid_savings: 50000,
    existing_debt: 10,
    dependents: 1,
    emergency_fund_months: 3,
    risk_tolerance: 'Moderate',
    goal_type: 'wealth-building'
  });
  const health = await checkMLHealth();

  // Test incomplete profile fallback routing
  const incompleteFallback = await getMLPrediction({
    age: 40,
    annual_income: 1200000,
    monthly_savings: 25000,
    risk_category: 'Moderate'
  });
  assert.equal(incompleteFallback.fallback, true);

  axios.post = async () => { throw new Error('offline'); };
  const fallback = await getMLPrediction({
    age: 60,
    annual_income: 2200000,
    monthly_savings: 50000,
    risk_category: 'Conservative',
    liquid_savings: 100000,
    existing_debt: 0,
    dependents: 0,
    emergency_fund_months: 6,
    risk_tolerance: 'Conservative',
    goal_type: 'retirement'
  });

  assert.match(postedUrl, /\/predict\/enriched$/);
  // When ML_SERVICE_API_KEY is set, the header must carry its value.
  // When unset, mlClient intentionally omits the header (security: no empty key).
  const expectedKey = process.env.ML_SERVICE_API_KEY || undefined;
  assert.equal(postedHeaders?.['X-API-Key'], expectedKey);
  assert.equal(getHeaders?.['X-API-Key'], expectedKey);
  assert.equal(prediction.primary, 'ETF');
  assert.equal(health.status, 'ok');
  assert.equal(fallback.fallback, true);
  assert.ok(warnings.some(w => w.includes('fallback')));
});

test('mlClient rule fallback produces usable picks and scores', () => {
  const fallback = getRuleBasedFallback({ age: 65, annual_income: 3000000, monthly_savings: 50000, risk_category: 'Aggressive' });

  assert.equal(fallback.primary, 'ETF');
  assert.equal(fallback.secondary, 'SCSS');
  assert.equal(fallback.fallback, true);
  assert.ok(Object.values(fallback.confidence_scores).every(Number.isFinite));
});

test('projectionEngine formulas are numerically stable and internally consistent', () => {
  const target = 1000000;
  const sip = reverseSIPFromFV(target, 0.10, 10);
  const fv = sipFV(sip, 0.10, 10);
  const lump = lumpSumFV(100000, 0.10, 5);
  const stepUp = stepUpSipFV(10000, 0.10, 5, 0.10);
  const projections = generateProjections(10000, [{ name: 'ETF', type: 'ETF' }], { ETF: 10 }, [5, 10]);

  assert.ok(Math.abs(fv - target) / target < 0.001);
  assert.ok(lump > 100000);
  assert.ok(stepUp > sipFV(10000, 0.10, 5));
  assert.ok(computeCAGR(100000, lump, 5) > 0.09);
  assert.ok(realReturn(0.12, 0.06) > 0.05);
  assert.equal(projections.chartData.length, 2);
});

test('riskProfiler classifies profiles and encodes categories', () => {
  const aggressive = getRiskProfile(25, 5000000, 30, 5, 0, 200000, 0);
  const conservative = getRiskProfile(70, 200000, 1, 0, 4, 1000, 50000);

  assert.equal(aggressive.category, 'Aggressive');
  assert.equal(conservative.category, 'Conservative');
  assert.equal(encodeRiskCategory('Moderate-Aggressive'), 3);
  assert.equal(encodeRiskCategory('Unknown'), 2);
});

test('postTaxCalculator respects EEE exemptions and taxable instruments', () => {
  const ppf = calculatePostTaxReturn('PPF', 0.071, 1200000, 15, 'new');
  const fd = calculatePostTaxReturnSafe('FD', 0.07, 3000000, 3, 'new', 10000, 35);
  const invalid = calculatePostTaxReturn('FD', Number.NaN, -1, -1, 'new');

  assert.equal(ppf.taxRate, 0);
  assert.equal(ppf.postTaxReturn, 0.071);
  assert.ok(fd.postTaxReturn < 0.07);
  assert.ok(Number.isFinite(invalid.postTaxReturn));
});

test('ragClient and mlClient propagate verified X-Verified-User-Id header downstream', async (t) => {
  const originalPost = axios.post;
  let ragCapturedHeaders = null;
  let ragCapturedBody = null;
  let mlCapturedHeaders = null;

  axios.post = async (url, payload, config) => {
    if (url.includes('/rag/query')) {
      ragCapturedHeaders = config?.headers;
      ragCapturedBody = payload;
      return { status: 200, data: { answer: 'Grounded tax advice', citations: [] } };
    }
    if (url.includes('/predict')) {
      mlCapturedHeaders = config?.headers;
      return { data: { primary: 'ETF', secondary: 'Debt_MF', tertiary: 'ELSS', confidence_scores: { ETF: 0.7 } } };
    }
    return { data: {} };
  };

  t.after(() => { axios.post = originalPost; });

  const testUserId = '654321098765432109876543';

  // 1. Test ragClient queryRAG forwards verified user header and drops unverified body fields
  const ragRes = await queryRAG({
    query: 'What are Section 80C deductions?',
    userId: testUserId,
  }, 'test-corr-id-123');

  assert.ok(ragRes);
  assert.equal(ragCapturedHeaders?.['X-Verified-User-Id'], testUserId);
  assert.equal(ragCapturedBody?.tenant_id, undefined, 'tenant_id must not be sent in RAG request body');

  // 2. Test mlClient getMLPrediction forwards verified user header
  const mlRes = await getMLPrediction({
    age: 35,
    annual_income: 1500000,
    monthly_savings: 30000,
    risk_category: 'Moderate',
    liquid_savings: 100000,
    existing_debt: 5,
    dependents: 1,
    emergency_fund_months: 6,
    risk_tolerance: 'Moderate',
    goal_type: 'wealth-building',
  }, 'test-corr-id-456', testUserId);

  assert.ok(mlRes);
  assert.equal(mlCapturedHeaders?.['X-Verified-User-Id'], testUserId);
});

