import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import profileRouter from '../routes/profile.js';
import recommendRouter from '../routes/recommend.js';
import { getRiskProfile } from '../services/riskProfiler.js';
import { computeTax } from '../services/taxEngine.js';
import { runPipeline } from '../services/RecommendationPipeline.js';
import { generateProjections } from '../services/projectionEngine.js';
import { profileSchema } from '../validation/schemas.js';
import { withServer, jsonRequest } from '../test-utils/httpTestUtils.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_wealthgenie_2026';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DISABLE_RATE_LIMIT = 'true';

const TEST_USER_ID = '64b000000000000000000005';
const token = jwt.sign({ userId: TEST_USER_ID, email: 'test@wealthgenie.io' }, JWT_SECRET, { expiresIn: '1h' });

const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);
app.use('/api/recommend', recommendRouter);

describe('Financial Profile Deep Integration Test Suite', () => {
  before(async () => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wealthgenie';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
    await FinancialProfile.deleteMany({ userId: TEST_USER_ID });
  });

  after(async () => {
    await FinancialProfile.deleteMany({ userId: TEST_USER_ID });
  });

  it('WG-011: FinancialProfile uses monthlyIncome property and supports virtual income getter', async () => {
    const doc = new FinancialProfile({
      userId: TEST_USER_ID,
      monthlyIncome: 75000,
      age: 32,
      savings: 20000,
      annualIncome: 900000,
    });

    assert.equal(doc.monthlyIncome, 75000, 'monthlyIncome property should be set');
    assert.equal(doc.income, 75000, 'income virtual getter should return monthlyIncome');

    doc.income = 85000;
    assert.equal(doc.monthlyIncome, 85000, 'setting income virtual setter should update monthlyIncome');
  });

  it('WG-013: Disambiguates lumpSumAmount (one-time capital) from monthlySavings (recurring SIP)', async () => {
    const doc = new FinancialProfile({
      userId: TEST_USER_ID,
      monthlyIncome: 100000,
      age: 30,
      savings: 25000,
      annualIncome: 1200000,
      hasLumpSum: true,
      lumpSumAmount: 500000,
    });

    assert.equal(doc.savings, 25000, 'savings represents monthly recurring investment capacity');
    assert.equal(doc.lumpSumAmount, 500000, 'lumpSumAmount represents one-time capital deployment');
  });

  // 1. Malicious Client Zeroing Test
  it('1. Malicious Client Defense — zeros lump_sum_amount when has_lump_sum is false', async () => {
    await withServer(app, async (baseUrl) => {
      const payload = {
        age: 32,
        monthly_income: 100000,
        monthly_savings: 30000,
        regime: 'new',
        investment_horizon: 15,
        liquid_savings: 100000,
        existing_debt: 0,
        dependents: 1,
        emergency_fund_months: 6,
        risk_tolerance: 'Moderate',
        goal_type: 'wealth-building',
        total_ctc: 1500000,
        basic_component: 750000,
        monthly_take_home: 90000,
        sold_property_amount: 0,
        has_lump_sum: false,
        lump_sum_amount: 500000 // STRAY VALUE SENT BY BUGGY/MALICIOUS CLIENT
      };

      const { response, body } = await jsonRequest(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      assert.equal(response.status, 201, `Expected 201, got ${response.status}: ${JSON.stringify(body)}`);
      assert.equal(body.has_lump_sum, false);
      assert.equal(body.lump_sum_amount, 0, 'Server must force lump_sum_amount to 0 when has_lump_sum is false');
      assert.equal(body.investable_amount_onetime, 0);

      const dbProfile = await FinancialProfile.findById(body.profileId);
      assert.equal(dbProfile.lumpSumAmount, 0, 'Database document must store lumpSumAmount as 0');
      assert.equal(dbProfile.hasLumpSum, false);
    });
  });

  // 2. Profile Creation & Persistence Test
  it('2. Profile Persistence — persists all 6 new fields when has_lump_sum is true', async () => {
    await withServer(app, async (baseUrl) => {
      const payload = {
        age: 35,
        monthly_income: 150000,
        monthly_savings: 50000,
        regime: 'new',
        investment_horizon: 10,
        liquid_savings: 200000,
        existing_debt: 0,
        dependents: 2,
        emergency_fund_months: 6,
        risk_tolerance: 'Moderate',
        goal_type: 'wealth-building',
        total_ctc: 2400000,
        basic_component: 1200000,
        monthly_take_home: 130000,
        sold_property_amount: 2000000,
        has_lump_sum: true,
        lump_sum_amount: 2000000
      };

      const { response, body } = await jsonRequest(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      assert.equal(response.status, 201);
      assert.equal(body.total_ctc, 2400000);
      assert.equal(body.basic_component, 1200000);
      assert.equal(body.monthly_take_home, 130000);
      assert.equal(body.sold_property_amount, 2000000);
      assert.equal(body.has_lump_sum, true);
      assert.equal(body.lump_sum_amount, 2000000);
      assert.equal(body.investable_amount_onetime, 2000000);

      const dbProfile = await FinancialProfile.findById(body.profileId);
      assert.equal(dbProfile.totalCTC, 2400000);
      assert.equal(dbProfile.basicComponent, 1200000);
      assert.equal(dbProfile.monthlyTakeHome, 130000);
      assert.equal(dbProfile.soldPropertyAmount, 2000000);
      assert.equal(dbProfile.hasLumpSum, true);
      assert.equal(dbProfile.lumpSumAmount, 2000000);
    });
  });

  // 3. RecommendationPipeline Differential Test
  it('3. RecommendationPipeline Differential — lump sum alters weights and instrument scores', () => {
    const baseProfile = {
      age: 35,
      annualIncome: 1800000,
      savings: 40000,
      riskCategory: 'Moderate',
      investmentHorizon: 10,
      goal_type: 'wealth-building',
      taxRegime: 'new',
      totalCTC: 1800000,
      basicComponent: 900000,
      monthlyTakeHome: 120000,
      soldPropertyAmount: 0,
      hasLumpSum: false,
      lumpSumAmount: 0
    };

    const lumpSumProfile = {
      ...baseProfile,
      hasLumpSum: true,
      lumpSumAmount: 2500000
    };

    const resBase = runPipeline(baseProfile, {});
    const resLump = runPipeline(lumpSumProfile, {});

    console.log(`[RecommendationPipeline Test Output] Base Top Pick: ${resBase.instruments[0].name} (Score: ${resBase.instruments[0].score})`);
    console.log(`[RecommendationPipeline Test Output] LumpSum Top Pick: ${resLump.instruments[0].name} (Score: ${resLump.instruments[0].score})`);

    assert(resLump.instruments[0].score !== resBase.instruments[0].score, 'Top recommendation score must differ with lump sum');
  });

  // 4. riskProfiler Differential Test
  it('4. riskProfiler Differential — lump sum increases risk score via liquidity capacity bonus', () => {
    const profileWithoutLump = getRiskProfile(35, 1200000, 10, 0, 0, 30000, 0, 0, 0);
    const profileWithLump = getRiskProfile(35, 1200000, 10, 0, 0, 30000, 0, 3000000, 0);

    console.log(`[riskProfiler Test Output] Score without Lump Sum: ${profileWithoutLump.riskScore} (${profileWithoutLump.category})`);
    console.log(`[riskProfiler Test Output] Score with ₹30L Lump Sum: ${profileWithLump.riskScore} (${profileWithLump.category})`);

    assert(profileWithLump.riskScore > profileWithoutLump.riskScore, 'Risk score with lump sum must be strictly greater than without');
    assert(profileWithLump.riskScore - profileWithoutLump.riskScore <= 10, 'Risk score bonus must be capped at <= 10 points');
  });

  // 5. taxEngine Differential Test
  it('5. taxEngine Differential — basicComponent influences 80CCD(2) deduction cap', () => {
    const annualIncome = 2400000;
    
    // 30% basic component = ₹7,20,000 basic -> 10% 80CCD(2) cap = ₹72,000
    const deductions30 = { basicSalary: 720000, nps80CCD2: 100000 };
    const tax30 = computeTax(annualIncome, 'new', deductions30);

    // 50% basic component = ₹12,00,000 basic -> 10% 80CCD(2) cap = ₹1,20,000
    const deductions50 = { basicSalary: 1200000, nps80CCD2: 100000 };
    const tax50 = computeTax(annualIncome, 'new', deductions50);

    console.log(`[taxEngine Test Output] 30% Basic (₹7.2L) -> Allowed 80CCD2: ₹${tax30.nps80CCD2}, Taxable: ₹${tax30.taxableIncome}`);
    console.log(`[taxEngine Test Output] 50% Basic (₹12L) -> Allowed 80CCD2: ₹${tax50.nps80CCD2}, Taxable: ₹${tax50.taxableIncome}`);

    assert.equal(tax30.nps80CCD2, 72000);
    assert.equal(tax50.nps80CCD2, 100000);
    assert.notEqual(tax30.taxableIncome, tax50.taxableIncome, 'Taxable income must differ between 30% and 50% basic salary when NPS 80CCD(2) is claimed');
  });

  // 6. Schema Validation Bounds Test
  it('6. Schema Validation Bounds — rejects invalid CTC, basic salary & take-home combinations', () => {
    // Basic > CTC
    const invalidBasicResult = profileSchema.validate({
      monthly_income: 100000,
      age: 30,
      monthly_savings: 30000,
      liquid_savings: 100000,
      existing_debt: 0,
      dependents: 0,
      emergency_fund_months: 6,
      risk_tolerance: 'Moderate',
      goal_type: 'wealth-building',
      total_ctc: 1000000,
      basic_component: 700000, // INVALID: > 60% total_ctc
      monthly_take_home: 80000,
      sold_property_amount: 0,
      has_lump_sum: false,
    });

    assert(invalidBasicResult.error, 'Joi schema must reject basic_component > total_ctc');

    // Take-home * 12 > CTC
    const invalidTakeHomeResult = profileSchema.validate({
      monthly_income: 100000,
      age: 30,
      monthly_savings: 30000,
      liquid_savings: 100000,
      existing_debt: 0,
      dependents: 0,
      emergency_fund_months: 6,
      risk_tolerance: 'Moderate',
      goal_type: 'wealth-building',
      total_ctc: 1000000,
      basic_component: 500000,
      monthly_take_home: 100000, // INVALID: 12L > 10L CTC
      sold_property_amount: 0,
      has_lump_sum: false,
    });

    assert(invalidTakeHomeResult.error, 'Joi schema must reject monthly_take_home * 12 > total_ctc');
  });

  // 7. projectionEngine Differential Test
  it('7. projectionEngine Differential — initialLumpSum increases projected wealth series and totalInvested', () => {
    const instruments = [{ name: 'Equity_MF', type: 'Equity_MF' }];
    const postTaxRates = { Equity_MF: 10.0 }; // 10% post tax
    const years = [5, 10, 15, 20];

    const projWithoutLump = generateProjections(10000, instruments, postTaxRates, years, 0.05, 0.10, 0);
    const projWithLump = generateProjections(10000, instruments, postTaxRates, years, 0.05, 0.10, 1000000); // ₹10L initial lump sum

    const corpusWithoutLump10y = projWithoutLump.chartData.find(d => d.year === 10).Equity_MF;
    const corpusWithLump10y = projWithLump.chartData.find(d => d.year === 10).Equity_MF;

    console.log(`[projectionEngine Test Output] 10Y Corpus without Lump Sum: ₹${corpusWithoutLump10y.toLocaleString('en-IN')}`);
    console.log(`[projectionEngine Test Output] 10Y Corpus with ₹10L Lump Sum: ₹${corpusWithLump10y.toLocaleString('en-IN')}`);

    assert(corpusWithLump10y > corpusWithoutLump10y, 'Projected wealth with initial lump sum must be strictly greater than without');
    assert.equal(projWithLump.totalInvested[10] - projWithoutLump.totalInvested[10], 1000000, 'Total invested at 10Y must reflect the initial ₹10L lump sum');
  });

  // 8. Onboarding HTTP Wire Integration Test (validate middleware + route handler)
  it('8. Onboarding HTTP Wire Integration — POST /api/profile/build with investment_goals passes Joi validation and populates FinancialProfile.goals', async () => {
    await withServer(app, async (baseUrl) => {
      const payload = {
        monthly_income: 120000,
        age: 32,
        monthly_savings: 40000,
        liquid_savings: 500000,
        existing_debt: 10,
        dependents: 1,
        emergency_fund_months: 6,
        risk_tolerance: 'Moderate',
        goal_type: 'wealth-building',
        investment_goals: ['Retirement', 'Home Purchase'],
        regime: 'new',
        investment_horizon: 15,
      };

      const { response, body } = await jsonRequest(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      assert.equal(response.status, 201, 'POST /api/profile/build must succeed with 201 Created');
      const profileId = body.profileId || body.id || body._id;
      assert.ok(profileId, 'Response must contain created profile ID');
      assert.deepEqual(body.goals, ['Retirement', 'Home Purchase'], 'formatProfileResponse must return populated goals');

      // Fetch stored document from MongoDB directly to prove persistence through validation middleware
      const dbDoc = await FinancialProfile.findById(profileId).lean();
      assert.ok(dbDoc, 'Document must exist in MongoDB');
      assert.deepEqual(dbDoc.goals, ['Retirement', 'Home Purchase'], 'FinancialProfile.goals must be populated from investment_goals payload');
    });
  });

  // 9. WG-028 Recommendation Mongoose confidenceScores Schema Test
  it('9. WG-028: Recommendation Mongoose confidenceScores schema validates map values and rejects invalid entries', () => {
    const validDoc = new Recommendation({
      userId: new mongoose.Types.ObjectId(),
      profileId: new mongoose.Types.ObjectId(),
      confidenceScores: { PPF: 0.95, FD: 0.85 },
    });
    const validErr = validDoc.validateSync();
    assert.equal(validErr, undefined, 'Valid confidenceScores map must pass validation without error');

    const invalidDoc = new Recommendation({
      userId: new mongoose.Types.ObjectId(),
      profileId: new mongoose.Types.ObjectId(),
      confidenceScores: { PPF: 1.5 }, // INVALID: > 1.0
    });
    const invalidErr = invalidDoc.validateSync();
    assert.ok(invalidErr, 'Invalid confidenceScores map (> 1.0) must fail Mongoose validation');
    assert.ok(invalidErr.errors['confidenceScores.PPF'], 'Error path must target confidenceScores.PPF');
  });

  // 10. WG-029 existing_debt_emi_ratio_pct Renaming & Virtual Getter Test
  it('10. WG-029: FinancialProfile model supports existing_debt_emi_ratio_pct and backward-compatible existing_debt virtual getter/setter', () => {
    const doc = new FinancialProfile({
      userId: new mongoose.Types.ObjectId(),
      monthlyIncome: 100000,
      age: 30,
      savings: 30000,
      annualIncome: 1200000,
      existing_debt_emi_ratio_pct: 15,
    });

    assert.equal(doc.existing_debt_emi_ratio_pct, 15, 'existing_debt_emi_ratio_pct field must be set directly');
    assert.equal(doc.existing_debt, 15, 'existing_debt virtual getter must return existing_debt_emi_ratio_pct');

    doc.existing_debt = 25;
    assert.equal(doc.existing_debt_emi_ratio_pct, 25, 'existing_debt virtual setter must update existing_debt_emi_ratio_pct');
  });
});
