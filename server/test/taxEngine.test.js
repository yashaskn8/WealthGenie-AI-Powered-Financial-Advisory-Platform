import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_FY,
  calculateTaxableIncome,
  computeTax,
  computeTaxWithDeductions,
  getTaxSlab,
  getTaxSlabsForFY,
  isFYVerified,
  compareTaxRegimes,
  getEffectiveMarginalRate,
} from '../services/taxEngine.js';

test('new regime Section 87A rebate zeros tax at the FY2025-26 threshold', () => {
  const result = computeTax(1_275_000, 'new');
  assert.equal(result.taxableIncome, 1_200_000);
  assert.equal(result.taxAmount, 0);
  assert.equal(result.rebateApplied, true);
});

test('new regime marginal relief caps the rebate cliff immediately above threshold', () => {
  const result = computeTax(1_276_000, 'new');
  assert.equal(result.taxableIncome, 1_201_000);
  assert.equal(result.taxBeforeCess, 1_000);
  assert.equal(result.taxAmount, 1_040);
  assert.equal(result.marginalReliefApplied, true);
});

test('old regime applies granular Section 80D self and parent caps', () => {
  const result = calculateTaxableIncome(1_000_000, 'old', {
    section80D_self: 30_000,
    section80D_parents: 60_000,
    parents_senior: true,
    age: 35,
  });

  assert.equal(result.allowed80D, 75_000);
  assert.equal(result.oldRegimeDeductions, 75_000);
});

test('tax slabs are selected by fiscal-year key with current FY fallback', () => {
  const current = getTaxSlabsForFY(CURRENT_FY);
  const next = getTaxSlabsForFY('FY2026-27');
  const fallback = getTaxSlabsForFY('UNKNOWN-FY');

  assert.equal(current.new[1].rate, 0.05);
  assert.equal(next.new[1].rate, current.new[1].rate);
  assert.equal(fallback, current);
  assert.equal(getTaxSlab(3_000_000, 'new', {}, 'salary', CURRENT_FY), 0.30);
});

test('isFYVerified returns true for verified FYs and false for unverified or unknown FYs', () => {
  assert.equal(isFYVerified('FY2025-26'), true);
  assert.equal(isFYVerified('FY2026-27'), true);
  assert.equal(isFYVerified('UNKNOWN-FY'), false);
});

test('calculateTaxableIncome computes standard deduction based on income source', () => {
  // Salary
  const salNew = calculateTaxableIncome(1_000_000, 'new', {}, 'salary');
  assert.equal(salNew.standardDeduction, 75_000);
  assert.equal(salNew.taxableIncome, 925_000);

  const salOld = calculateTaxableIncome(1_000_000, 'old', {}, 'salary');
  assert.equal(salOld.standardDeduction, 50_000);
  assert.equal(salOld.taxableIncome, 950_000);

  // Pension
  const penNew = calculateTaxableIncome(1_000_000, 'new', {}, 'pension');
  assert.equal(penNew.standardDeduction, 75_000);

  // Family Pension (min(income / 3, 15000))
  const famPenSmall = calculateTaxableIncome(30_000, 'new', {}, 'family_pension');
  assert.equal(famPenSmall.standardDeduction, 10_000);

  const famPenLarge = calculateTaxableIncome(300_000, 'new', {}, 'family_pension');
  assert.equal(famPenLarge.standardDeduction, 15_000);

  // Business / Other
  const biz = calculateTaxableIncome(1_000_000, 'new', {}, 'business');
  assert.equal(biz.standardDeduction, 0);
  assert.equal(biz.taxableIncome, 1_000_000);
});

test('calculateTaxableIncome computes Section 80CCD(2) employer NPS contributions for private vs govt employees', () => {
  // Private employee default (10% of basic salary)
  const pvtDefault = calculateTaxableIncome(1_000_000, 'new', { nps80CCD2: 60_000 });
  // basicSalary = 500,000 (50%), maxLimit = 50,000 (10%) -> allowed = 50,000
  assert.equal(pvtDefault.nps80CCD2, 50_000);

  // Private employee explicit basic salary
  const pvtExplicit = calculateTaxableIncome(1_000_000, 'new', { basicSalary: 600_000, nps80CCD2: 70_000 });
  // maxLimit = 60,000 -> allowed = 60,000
  assert.equal(pvtExplicit.nps80CCD2, 60_000);

  // Government employee (14% of basic salary)
  const govt = calculateTaxableIncome(1_000_000, 'new', { isGovtEmployee: true, nps80CCD2: 70_000 });
  // basicSalary = 500,000, maxLimit = 70,000 (14%) -> allowed = 70,000
  assert.equal(govt.nps80CCD2, 70_000);
});

test('calculateTaxableIncome applies old regime deductions (80C, 80CCD(1B), HRA, Home Loan Interest, 80EEA, 80TTA, 80TTB)', () => {
  // Age < 60 with 80TTA and explicit 80D self
  const young = calculateTaxableIncome(2_000_000, 'old', {
    section80C: 200_000, // capped at 150,000
    nps80CCD1B: 70_000, // capped at 50,000
    section80D_self: 30_000, // capped at 25,000 (non-senior)
    hra: 120_000,
    homeLoanInterest: 250_000, // capped at 200,000
    section80EEA: 200_000, // capped at 150,000
    savingsInterest: 15_000, // 80TTA capped at 10,000
    other: 20_000,
    age: 30,
  });

  // Allowed: 150k (80C) + 50k (NPS) + 25k (80D self) + 120k (HRA) + 200k (Loan) + 150k (80EEA) + 10k (80TTA) + 20k (Other) = 725,000
  assert.equal(young.allowed80D, 25_000);
  assert.equal(young.oldRegimeDeductions, 725_000);
  assert.equal(young.taxableIncome, 2_000_000 - 50_000 - 725_000);

  // Senior citizen (Age >= 60) with 80TTB
  const senior = calculateTaxableIncome(2_000_000, 'old', {
    section80D_self: 60_000, // capped at 50,000 (senior)
    savingsInterest: 60_000, // 80TTB capped at 50,000
    age: 65,
  });
  // Allowed 80D self (senior) = 50,000; allowed 80TTB = 50,000
  assert.equal(senior.allowed80D, 50_000);
  assert.equal(senior.oldRegimeDeductions, 100_000);
});

test('computeSurcharge and computeMarginalRelief handle high incomes under new vs old regime', () => {
  // ₹60 Lakhs (New Regime): 10% surcharge, base tax = 40k(5%) + 40k(10%) + 60k(15%) + 80k(20%) + 100k(25%) + 1.05M(30%) = 1.37M
  const res60LNew = computeTax(6_000_000, 'new', {}, 'business');
  assert.equal(res60LNew.surchargeApplied, true);
  assert.ok(res60LNew.surchargeAmount > 0);

  // ₹1.5 Crores (Old Regime): 15% surcharge
  const res150LOld = computeTax(15_000_000, 'old', {}, 'business');
  assert.equal(res150LOld.surchargeApplied, true);

  // ₹3.0 Crores (New Regime): 25% surcharge cap
  const res3CrNew = computeTax(30_000_000, 'new', {}, 'business');
  assert.equal(res3CrNew.surchargeApplied, true);

  // ₹6.0 Crores (Old Regime): 37% surcharge
  const res6CrOld = computeTax(60_000_000, 'old', {}, 'business');
  assert.equal(res6CrOld.surchargeApplied, true);

  // High income slightly above ₹50 Lakh threshold (triggers surcharge marginal relief)
  const res50L10kNew = computeTax(5_075_000, 'new', {}, 'business');
  assert.equal(res50L10kNew.marginalReliefApplied, true);
  assert.ok(res50L10kNew.marginalReliefAmount > 0);
});

test('computeTax handles edge cases: negative/invalid income, fallbacks, and alias functions', () => {
  // Invalid negative income falls back to 0
  const invalid = computeTax(-500_000, 'new');
  assert.equal(invalid.annualIncome, 0);
  assert.equal(invalid.taxAmount, 0);
  assert.equal(invalid.effectiveRate, 0);

  // Non-existent regime falls back to 'new'
  const badRegime = computeTax(1_000_000, 'invalid-regime');
  assert.equal(badRegime.regime, 'new');

  // Alias wrapper computeTaxWithDeductions returns identical breakdown
  const aliasRes = computeTaxWithDeductions(1_000_000, 'new');
  assert.equal(aliasRes.taxAmount, computeTax(1_000_000, 'new').taxAmount);
});

test('compareTaxRegimes recommends lower tax regime between new and old', () => {
  // High deductions make old regime better
  const resOldBetter = compareTaxRegimes(1_500_000, { section80C: 150_000, hra: 300_000, homeLoanInterest: 200_000 });
  assert.equal(resOldBetter.recommended, 'old');

  // No deductions make new regime better
  const resNewBetter = compareTaxRegimes(1_500_000, {});
  assert.equal(resNewBetter.recommended, 'new');
});

test('getEffectiveMarginalRate computes exact marginal tax impact of additional income', () => {
  // At ₹20L (business, no standard deduction), delta ±10k crosses the 20%→25% slab boundary at ₹20L.
  // highIncome=2,010,000 (25% slab), lowIncome=1,990,000 (20% slab)
  // deltaTax after cess = (202500*1.04 rounded) - (198000*1.04 rounded) = 210600 - 205920 = 4680
  // effectiveMarginal = 4680 / 20000 = 0.234
  const rate20L = getEffectiveMarginalRate(2_000_000, 'new', {}, 'business');
  assert.equal(rate20L, 0.234);

  // At ₹15L business income, firmly in the 15% slab (12L-16L). marginal = 0.15 * 1.04 = 0.156
  const rate15L = getEffectiveMarginalRate(1_500_000, 'new', {}, 'business');
  assert.equal(rate15L, 0.156);

  // At 0 income
  const rateZero = getEffectiveMarginalRate(0, 'new');
  assert.equal(rateZero, 0);
});
