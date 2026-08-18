import { describe, it, expect } from 'vitest';
import { calculateTaxableIncome, computeTaxLiability, getMarginalRate, computePostTaxReturn } from '../taxComputation.js';
import { computeScore } from '../scoringEngine.js';

describe('P0 #5: Client-Side Tax Engine Parity & Deduction Scoring Proof', () => {
  // Machine-generated golden vectors from canonical server/services/taxEngine.js computeTax()
  const goldenVectors = [
    { id: 'GV-1', desc: 'Rebate Zone (New)', income: 1275000, regime: 'new', deductions: {}, source: 'salary', expectedTax: 0, expectedTaxable: 1200000 },
    { id: 'GV-2', desc: '87A Marginal Relief (New)', income: 1275100, regime: 'new', deductions: {}, source: 'salary', expectedTax: 104, expectedTaxable: 1200100 },
    { id: 'GV-3', desc: 'Mid-Income Salary (New)', income: 1500000, regime: 'new', deductions: {}, source: 'salary', expectedTax: 97500, expectedTaxable: 1425000 },
    { id: 'GV-4', desc: 'High-Income (New 25L)', income: 2500000, regime: 'new', deductions: {}, source: 'salary', expectedTax: 319800, expectedTaxable: 2425000 },
    { id: 'GV-5', desc: 'Rebate Zone (Old)', income: 550000, regime: 'old', deductions: {}, source: 'salary', expectedTax: 0, expectedTaxable: 500000 },
    { id: 'GV-6', desc: 'Cliff Boundary (Old)', income: 550100, regime: 'old', deductions: {}, source: 'salary', expectedTax: 13021, expectedTaxable: 500100 },
    { id: 'GV-7', desc: 'Heavy Deductions (Old 25L)', income: 2500000, regime: 'old', deductions: { section80C: 150000, section80D_self: 25000, section80D_parents: 25000, nps80CCD1B: 50000, homeLoanInterest: 200000 }, source: 'salary', expectedTax: 429000, expectedTaxable: 2000000 },
    { id: 'GV-8', desc: 'High Net Worth (New 80L)', income: 8000000, regime: 'new', deductions: {}, source: 'salary', expectedTax: 2239380, expectedTaxable: 7925000 },
    { id: 'GV-9', desc: 'Surcharge Relief (New 51L)', income: 5100000, regime: 'new', deductions: {}, source: 'salary', expectedTax: 1149200, expectedTaxable: 5025000 },
    { id: 'GV-10', desc: 'Ultra HNW (Old 6Cr 37%)', income: 60000000, regime: 'old', deductions: {}, source: 'salary', expectedTax: 25357878, expectedTaxable: 59950000 },
    { id: 'GV-11', desc: 'Employer NPS 80CCD(2) + Senior Parents 80D', income: 1800000, regime: 'new', deductions: { basicSalary: 900000, nps80CCD2: 90000, section80D_parents: 50000, parents_senior: true }, source: 'salary', expectedTax: 132080, expectedTaxable: 1635000 },
  ];

  it('matches canonical taxEngine.js net tax and taxable income for all 11 golden vectors', () => {
    for (const v of goldenVectors) {
      const { taxableIncome } = calculateTaxableIncome(v.income, v.regime, v.deductions, v.source);
      expect(taxableIncome, `${v.id} taxable income mismatch`).toBe(v.expectedTaxable);

      const netTax = computeTaxLiability(v.income, v.regime, v.deductions, v.source);
      expect(netTax, `${v.id} net tax mismatch`).toBe(v.expectedTax);
    }
  });

  it('proves Task 2: deductions materially lower marginal rate and increase post-tax return for slab-taxed instruments', () => {
    // NOTE: This test explicitly constructs a synthetic deductions object to test calculation correctness;
    // user profile forms do not yet persist 80C/80D/HRA fields (scoped for WG-DEDUCTIONS-COLLECTION).
    const annualIncome = 2500000;
    const taxRegime = 'old';

    // 1. Profile with zero deductions
    const zeroDeductions = {};
    const rateZero = getMarginalRate(annualIncome, taxRegime, zeroDeductions);

    // 2. Profile with heavy deductions (₹4.25L deductions reducing taxable income)
    const heavyDeductions = {
      section80C: 150000,
      section80D_self: 25000,
      nps80CCD1B: 50000,
      homeLoanInterest: 200000,
    };
    const rateWithDeductions = getMarginalRate(annualIncome, taxRegime, heavyDeductions);

    // Marginal tax rate check
    expect(rateZero).toBe(0.312); // 30% slab + 4% cess = 31.2%
    expect(rateWithDeductions).toBe(0.312); // At 20L taxable, marginal rate is still 31.2%

    // For a profile crossing slab thresholds:
    // At ₹12L income without deductions: taxable is ₹11.5L (30% slab -> 31.2% marginal with cess)
    // At ₹12L income with ₹2.25L deductions (80C + 80D + NPS): taxable is ₹9.25L (20% slab -> 20.8% marginal with cess)
    const midIncome = 1200000;
    const rateMidZero = getMarginalRate(midIncome, 'old', {});
    const rateMidWithDed = getMarginalRate(midIncome, 'old', { section80C: 150000, section80D_self: 25000, nps80CCD1B: 50000 });
    expect(rateMidZero).toBe(0.312);
    expect(rateMidWithDed).toBe(0.208);

    // Post-tax return for Fixed Deposit (7.0% nominal)
    const fd = { id: 'fd', name: 'Fixed Deposit', rate: 7.0, taxType: 'slab', assetClass: 'Debt' };
    const postTaxZero = computePostTaxReturn(fd, 100000, midIncome, { taxRegime: 'old', deductions: {} });
    const postTaxWithDed = computePostTaxReturn(fd, 100000, midIncome, {
      taxRegime: 'old',
      deductions: { section80C: 150000, section80D_self: 25000, nps80CCD1B: 50000 },
    });

    expect(postTaxWithDed.postTaxRate).toBeGreaterThan(postTaxZero.postTaxRate);
    expect(postTaxWithDed.marginalRate).toBe(0.208);
    expect(postTaxZero.marginalRate).toBe(0.312);
  });
});
