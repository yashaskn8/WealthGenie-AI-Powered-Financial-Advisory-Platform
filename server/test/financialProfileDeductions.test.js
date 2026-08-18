import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { setupTestDatabase, teardownTestDatabase } from './helpers/mongoTestHelper.js';

import FinancialProfile from '../models/FinancialProfile.js';
import profileRouter from '../routes/profile.js';
import { computeTax } from '../services/taxEngine.js';
import { withServer, jsonRequest } from '../test-utils/httpTestUtils.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_wealthgenie_2026';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DISABLE_RATE_LIMIT = 'true';

const TEST_USER_ID = '64b000000000000000000088';
const token = jwt.sign({ userId: TEST_USER_ID, email: 'deductions_test@wealthgenie.io' }, JWT_SECRET, { expiresIn: '1h' });

const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

describe('WG-DEDUCTIONS-COLLECTION: Profile Tax Deductions Integration Suite', () => {
  before(async () => {
    await setupTestDatabase();
    await FinancialProfile.deleteMany({ userId: TEST_USER_ID });
  });

  after(async () => {
    await FinancialProfile.deleteMany({ userId: TEST_USER_ID });
    await teardownTestDatabase();
  });

  it('Proof 1: POST /api/profile/build persists deduction fields and computes lower net tax than zero-deduction baseline', async () => {
    await withServer(app, async (baseUrl) => {
      // Annual income ₹25,00,000 under Old Regime
      const annualIncome = 2500000;
      const monthlyIncome = annualIncome / 12;
      const deductions = {
        section80C: 150000,
        section80CCD1B: 50000,
        nps80CCD1B: 50000,
        section80D_self: 25000,
        section80D_parents: 25000,
        parentsSenior: false,
        homeLoanInterest: 200000,
        hra: 0,
        section80EEA: 0,
        incomeSource: 'salary',
      };

      // 1. Compute dynamic expectations directly from authoritative taxEngine
      const expectedTaxWithDeductions = computeTax(annualIncome, 'old', {
        ...deductions,
        basicSalary: annualIncome * 0.5,
        age: 32,
      }, 'salary');

      const expectedTaxZeroDeductions = computeTax(annualIncome, 'old', {}, 'salary');

      // Canonical figures verification
      assert.equal(expectedTaxWithDeductions.taxAmount, 429000, 'GV-7 verification: ₹25L with ₹4.5L deductions must owe ₹4,29,000');
      assert.equal(expectedTaxZeroDeductions.taxAmount, 569400, 'Zero-deduction baseline verification: ₹25L must owe ₹5,69,400');
      assert.equal(expectedTaxWithDeductions.taxAmount < expectedTaxZeroDeductions.taxAmount, true);

      const payload = {
        monthly_income: monthlyIncome,
        age: 32,
        monthly_savings: 40000,
        regime: 'old',
        investment_horizon: 15,
        liquid_savings: 150000,
        existing_debt: 0,
        dependents: 1,
        emergency_fund_months: 6,
        risk_tolerance: 'Moderate',
        goal_type: 'wealth-building',
        total_ctc: annualIncome,
        basic_component: annualIncome * 0.5,
        monthly_take_home: monthlyIncome,
        sold_property_amount: 0,
        has_lump_sum: false,
        lump_sum_amount: 0,
        // Send deduction fields
        section80C: deductions.section80C,
        section80CCD1B: deductions.section80CCD1B,
        section80D_self: deductions.section80D_self,
        section80D_parents: deductions.section80D_parents,
        parentsSenior: deductions.parentsSenior,
        homeLoanInterest: deductions.homeLoanInterest,
        hra: deductions.hra,
        section80EEA: deductions.section80EEA,
        incomeSource: deductions.incomeSource,
      };

      const { response, body } = await jsonRequest(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      assert.equal(response.status, 201, `Expected 201 Created: ${JSON.stringify(body)}`);

      // Verify response body contains persisted deduction fields (both camelCase and snake_case aliases)
      assert.equal(body.section80C, 150000);
      assert.equal(body.section_80c, 150000);
      assert.equal(body.section80CCD1B, 50000);
      assert.equal(body.section_80ccd1b, 50000);
      assert.equal(body.section80D_self, 25000);
      assert.equal(body.section_80d_self, 25000);
      assert.equal(body.section80D_parents, 25000);
      assert.equal(body.section_80d_parents, 25000);
      assert.equal(body.parentsSenior, false);
      assert.equal(body.homeLoanInterest, 200000);
      assert.equal(body.home_loan_interest, 200000);

      // Verify computed tax matches expected deduction-aware tax
      assert.equal(body.taxDetails.taxAmount, expectedTaxWithDeductions.taxAmount);
      assert.equal(body.taxDetails.taxAmount, 429000);
      assert.equal(body.taxDetails.taxAmount < expectedTaxZeroDeductions.taxAmount, true, 'Tax with deductions must be lower than ₹5,69,400');

      // Verify MongoDB document has persisted all fields accurately
      const dbDoc = await FinancialProfile.findById(body.profileId);
      assert.ok(dbDoc, 'Document must exist in MongoDB');
      assert.equal(dbDoc.section80C, 150000);
      assert.equal(dbDoc.section_80c, 150000, 'Virtual getter section_80c must work');
      assert.equal(dbDoc.section80CCD1B, 50000);
      assert.equal(dbDoc.section80D_self, 25000);
      assert.equal(dbDoc.section80D_parents, 25000);
      assert.equal(dbDoc.homeLoanInterest, 200000);
      assert.equal(dbDoc.taxRegime, 'old');
    });
  });

  it('Proof 2: PUT /api/profile/:profileId updates deductions and recomputes tax liability accordingly', async () => {
    await withServer(app, async (baseUrl) => {
      // 1. Create baseline profile
      const initialProfile = await FinancialProfile.create({
        userId: TEST_USER_ID,
        monthlyIncome: 150000,
        age: 35,
        savings: 30000,
        annualIncome: 1800000,
        taxRegime: 'old',
        totalCTC: 1800000,
        basicComponent: 900000,
        monthlyTakeHome: 150000,
        version: 1,
      });

      const updatePayload = {
        version: 1,
        monthly_income: 150000,
        age: 35,
        monthly_savings: 30000,
        regime: 'old',
        investment_horizon: 15,
        liquid_savings: 200000,
        existing_debt: 0,
        dependents: 1,
        emergency_fund_months: 6,
        risk_tolerance: 'Moderate',
        goal_type: 'wealth-building',
        total_ctc: 1800000,
        basic_component: 900000,
        monthly_take_home: 150000,
        sold_property_amount: 0,
        has_lump_sum: false,
        lump_sum_amount: 0,
        // Add updated deductions: 80C ₹1.5L + 80D Self ₹25k + HRA ₹1.2L
        section80C: 150000,
        section80D_self: 25000,
        hra: 120000,
      };

      const expectedTax = computeTax(1800000, 'old', {
        section80C: 150000,
        section80D_self: 25000,
        hra: 120000,
        basicSalary: 900000,
        age: 35,
      }, 'salary');

      const { response, body } = await jsonRequest(`${baseUrl}/api/profile/${initialProfile._id}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(updatePayload),
      });

      assert.equal(response.status, 200, `Expected 200 OK: ${JSON.stringify(body)}`);
      assert.equal(body.section80C, 150000);
      assert.equal(body.section80D_self, 25000);
      assert.equal(body.hra, 120000);
      assert.equal(body.taxDetails.taxAmount, expectedTax.taxAmount);

      // Check DB
      const updatedDoc = await FinancialProfile.findById(initialProfile._id);
      assert.equal(updatedDoc.section80C, 150000);
      assert.equal(updatedDoc.section80D_self, 25000);
      assert.equal(updatedDoc.hra, 120000);
      assert.equal(updatedDoc.version, 2);
    });
  });

  it('Defense: Rejects deduction values exceeding statutory caps with 400 Bad Request', async () => {
    await withServer(app, async (baseUrl) => {
      const invalidPayload = {
        monthly_income: 100000,
        age: 30,
        monthly_savings: 20000,
        regime: 'old',
        liquid_savings: 50000,
        dependents: 0,
        emergency_fund_months: 3,
        risk_tolerance: 'Moderate',
        goal_type: 'wealth-building',
        total_ctc: 1200000,
        basic_component: 600000,
        monthly_take_home: 100000,
        section80C: 250000, // EXCEEDS ₹1,50,000 CAP
      };

      const { response, body } = await jsonRequest(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(invalidPayload),
      });

      assert.equal(response.status, 400, 'Expected 400 Bad Request for exceeding statutory 80C cap');
      assert.equal(body.error, 'Validation failed');
      assert.ok(
        body.details && body.details.some(d => d.includes('1,50,000') || d.includes('150000') || d.includes('Section 80C')),
        `Expected statutory cap message in details: ${JSON.stringify(body.details)}`
      );
    });
  });
});
