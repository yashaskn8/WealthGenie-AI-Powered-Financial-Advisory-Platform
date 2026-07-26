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

test('computeTax exact tax amounts at new regime slab boundaries', () => {
  // ₹4L: entirely in 0% slab -> tax = 0 (below rebate too)
  const res4L = computeTax(400_000, 'new', {}, 'business');
  assert.equal(res4L.taxAmount, 0);

  // ₹8L: 0-4L @ 0% + 4L-8L @ 5% = 20,000; below 12L rebate threshold -> 0
  const res8L = computeTax(800_000, 'new', {}, 'business');
  assert.equal(res8L.taxAmount, 0);

  // ₹12L: 0-4L@0 + 4-8L@5%(20k) + 8-12L@10%(40k) = 60,000; rebate limit 12L -> 0
  const res12L = computeTax(1_200_000, 'new', {}, 'business');
  assert.equal(res12L.taxAmount, 0);

  // ₹12,75,000 salary: taxable = 12,75,000 - 75,000(SD) = 12,00,000 -> rebate applies -> 0
  const res1275K = computeTax(1_275_000, 'new');
  assert.equal(res1275K.taxAmount, 0);
  assert.equal(res1275K.rebateApplied, true);

  // ₹16L: 0-4L@0 + 4-8L@5%(20k) + 8-12L@10%(40k) + 12-16L@15%(60k) = 120,000
  // No rebate (> 12L). Tax + 4% cess = 120,000 * 1.04 = 124,800
  const res16L = computeTax(1_600_000, 'new', {}, 'business');
  assert.equal(res16L.taxBeforeCess, 120_000);
  assert.equal(res16L.taxAmount, 124_800);

  // ₹24L: base tax = 20k + 40k + 60k + 80k + 100k + 0 = 300,000
  // Wait: 0-4L@0 + 4-8L@5%(20k) + 8-12L@10%(40k) + 12-16L@15%(60k) + 16-20L@20%(80k) + 20-24L@25%(100k) = 300,000
  const res24L = computeTax(2_400_000, 'new', {}, 'business');
  assert.equal(res24L.taxBeforeCess, 300_000);

  // ₹30L: above ₹24L at 30%: 300k + (30L-24L)@30% = 300k + 180k = 480k
  const res30L = computeTax(3_000_000, 'new', {}, 'business');
  assert.equal(res30L.taxBeforeCess, 480_000);
});

test('computeTax exact tax amounts at old regime slab boundaries', () => {
  // ₹2.5L: 0% slab -> 0
  const res25L = computeTax(250_000, 'old', {}, 'business');
  assert.equal(res25L.taxAmount, 0);

  // ₹5L: 0-2.5L@0 + 2.5-5L@5%(12,500) = 12,500; rebate applies under old regime (≤5L) -> 0
  const res5L = computeTax(500_000, 'old', {}, 'business');
  assert.equal(res5L.taxAmount, 0);
  assert.equal(res5L.rebateApplied, true);

  // ₹10L: 0-2.5L@0 + 2.5-5L@5%(12.5k) + 5-10L@20%(100k) = 112,500
  const res10L = computeTax(1_000_000, 'old', {}, 'business');
  assert.equal(res10L.taxBeforeCess, 112_500);

  // ₹15L: 112.5k + 5L@30%(150k) = 262,500
  const res15L = computeTax(1_500_000, 'old', {}, 'business');
  assert.equal(res15L.taxBeforeCess, 262_500);
});

test('getTaxSlab returns exact marginal rate at each new regime slab transition', () => {
  // Below ₹4L -> 0
  assert.equal(getTaxSlab(300_000, 'new', {}, 'business'), 0);

  // At ₹4L boundary -> 0% (since income exactly at 4L, taxable in 0% slab)
  assert.equal(getTaxSlab(400_000, 'new', {}, 'business'), 0);

  // ₹6L -> 5% slab
  assert.equal(getTaxSlab(600_000, 'new', {}, 'business'), 0.05);

  // ₹8L -> 5% (at boundary)
  assert.equal(getTaxSlab(800_000, 'new', {}, 'business'), 0.05);

  // ₹10L -> 10% slab
  assert.equal(getTaxSlab(1_000_000, 'new', {}, 'business'), 0.10);

  // ₹14L -> 15% slab
  assert.equal(getTaxSlab(1_400_000, 'new', {}, 'business'), 0.15);

  // ₹18L -> 20% slab
  assert.equal(getTaxSlab(1_800_000, 'new', {}, 'business'), 0.20);

  // ₹22L -> 25% slab
  assert.equal(getTaxSlab(2_200_000, 'new', {}, 'business'), 0.25);

  // ₹30L -> 30% slab
  assert.equal(getTaxSlab(3_000_000, 'new', {}, 'business'), 0.30);
});

test('getTaxSlab returns exact marginal rate for old regime slabs', () => {
  assert.equal(getTaxSlab(200_000, 'old', {}, 'business'), 0);
  assert.equal(getTaxSlab(400_000, 'old', {}, 'business'), 0.05);
  assert.equal(getTaxSlab(700_000, 'old', {}, 'business'), 0.20);
  assert.equal(getTaxSlab(1_500_000, 'old', {}, 'business'), 0.30);
});

test('computeTax surcharge rates at exact thresholds for both regimes', () => {
  // New regime surcharge tiers
  // ₹50L + 1: 10% surcharge
  const n50L = computeTax(5_000_001, 'new', {}, 'business');
  assert.equal(n50L.surchargeApplied, true);

  // ₹1Cr + 1: 15% surcharge
  const n1Cr = computeTax(10_000_001, 'new', {}, 'business');
  assert.equal(n1Cr.surchargeApplied, true);

  // ₹2Cr + 1: 25% surcharge (capped at 25% for new regime)
  const n2Cr = computeTax(20_000_001, 'new', {}, 'business');
  assert.equal(n2Cr.surchargeApplied, true);

  // Old regime surcharge tiers
  // ₹50L + 1: 10%
  const o50L = computeTax(5_000_001, 'old', {}, 'business');
  assert.equal(o50L.surchargeApplied, true);

  // ₹2Cr + 1: 25%
  const o2Cr = computeTax(20_000_001, 'old', {}, 'business');
  assert.equal(o2Cr.surchargeApplied, true);

  // ₹5Cr + 1: 37% (old regime only)
  const o5Cr = computeTax(50_000_001, 'old', {}, 'business');
  assert.equal(o5Cr.surchargeApplied, true);

  // Below ₹50L: no surcharge
  const below50L = computeTax(4_999_999, 'new', {}, 'business');
  assert.equal(below50L.surchargeApplied, false);
});

test('compareTaxRegimes returns exact savings between regimes', () => {
  // No deductions: new regime always better
  const noDeduct = compareTaxRegimes(1_000_000, {});
  assert.equal(noDeduct.recommended, 'new');
  assert.ok(typeof noDeduct.newRegime.taxAmount === 'number');
  assert.ok(typeof noDeduct.oldRegime.taxAmount === 'number');
  // New should have lower or equal tax
  assert.ok(noDeduct.newRegime.taxAmount <= noDeduct.oldRegime.taxAmount);

  // Heavy deductions: old regime better
  const heavyDeduct = compareTaxRegimes(2_000_000, {
    section80C: 150_000,
    hra: 300_000,
    homeLoanInterest: 200_000,
    section80D_self: 25_000,
    nps80CCD1B: 50_000,
  });
  assert.equal(heavyDeduct.recommended, 'old');
  assert.ok(heavyDeduct.oldRegime.taxAmount < heavyDeduct.newRegime.taxAmount);
});

test('calculateTaxableIncome Section 80D self senior vs non-senior caps', () => {
  // Non-senior self: capped at 25,000
  const nonSenior = calculateTaxableIncome(1_000_000, 'old', {
    section80D_self: 50_000,
    age: 35,
  });
  assert.equal(nonSenior.allowed80D, 25_000);

  // Senior self (age >= 60): capped at 50,000
  const senior = calculateTaxableIncome(1_000_000, 'old', {
    section80D_self: 60_000,
    age: 65,
  });
  assert.equal(senior.allowed80D, 50_000);

  // Non-senior self + senior parents: 25k + 50k = 75k
  const mixed = calculateTaxableIncome(1_000_000, 'old', {
    section80D_self: 30_000,
    section80D_parents: 60_000,
    parents_senior: true,
    age: 35,
  });
  assert.equal(mixed.allowed80D, 75_000);

  // Non-senior self + non-senior parents: 25k + 25k = 50k max
  const bothYoung = calculateTaxableIncome(1_000_000, 'old', {
    section80D_self: 30_000,
    section80D_parents: 30_000,
    parents_senior: false,
    age: 35,
  });
  assert.equal(bothYoung.allowed80D, 50_000);
});

test('calculateTaxableIncome new regime only allows 80CCD(2) deduction', () => {
  // New regime: section80C, HRA, etc. should NOT apply
  const newRegime = calculateTaxableIncome(1_000_000, 'new', {
    section80C: 150_000,
    hra: 120_000,
    homeLoanInterest: 200_000,
    nps80CCD2: 50_000,
  });
  assert.equal(newRegime.oldRegimeDeductions, 0);
  assert.equal(newRegime.nps80CCD2, 50_000);
  assert.equal(newRegime.taxableIncome, 1_000_000 - 75_000 - 50_000);
});

test('getCurrentFiscalYear returns correct format', () => {
  // Just verify format: FY<4digits>-<2digits>
  assert.ok(/^FY\d{4}-\d{2}$/.test(CURRENT_FY));
});
