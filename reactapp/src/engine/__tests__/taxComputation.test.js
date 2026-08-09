import { describe, it, expect } from 'vitest';
import { getMarginalRate, computePostTaxReturn } from '../taxComputation';

describe('WG-043: Client-Side Tax Engine Section 87A Rebate & Marginal Relief', () => {
  it('matches server/services/taxEngine.js getEffectiveMarginalRate exact output across all test incomes', () => {
    // Expected values derived directly from server/services/taxEngine.js getEffectiveMarginalRate(income, 'new')
    const expectedNewRegimeRates = {
      700000: 0,
      800000: 0,
      1000000: 0,
      1200000: 0,
      1250000: 0,
      1270000: 0,
      1280000: 0.45,
      1300000: 0.45,
      1500000: 0.156,
      2000000: 0.208,
    };

    Object.entries(expectedNewRegimeRates).forEach(([incomeStr, expectedRate]) => {
      const income = Number(incomeStr);
      const actualRate = getMarginalRate(income, 'new');
      expect(actualRate).toBe(expectedRate);
    });
  });

  it('confirms 0% marginal tax rate for new-regime incomes <= ₹12.75L (due to ₹75K std deduction + ₹12L Sec 87A rebate)', () => {
    expect(getMarginalRate(700000, 'new')).toBe(0);
    expect(getMarginalRate(800000, 'new')).toBe(0);
    expect(getMarginalRate(1000000, 'new')).toBe(0);
    expect(getMarginalRate(1200000, 'new')).toBe(0);
  });

  it('correctly calculates postTaxRate for 7% FD with ₹10,00,000 income user under new regime', () => {
    const fdInstrument = { id: 'fd', name: 'Fixed Deposit', rate: 7.0, taxType: 'slab' };
    const res = computePostTaxReturn(fdInstrument, 120000, 1000000, { taxRegime: 'new' });
    expect(res.marginalRate).toBe(0);
    expect(res.postTaxRate).toBe(7.0);
    expect(res.taxPaid).toBe(0);
  });
});
