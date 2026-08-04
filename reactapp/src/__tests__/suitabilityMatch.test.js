import { describe, it, expect } from 'vitest';
import { computeSuitabilityMatch } from '../ComparisonTableModal.jsx';

describe('computeSuitabilityMatch — Advanced Multi-Factor Scoring', () => {
  const baseProfile = {
    age: 30,
    risk_appetite: 'Medium',
    investment_horizon: 10,
    investment_goals: ['Wealth Creation'],
    taxRegime: 'new'
  };

  const highEquityFund = {
    id: 'flexi_cap_mf',
    name: 'Flexi Cap Equity Fund',
    category: 'equity',
    riskLabel: 'High',
    rate: 15,
    lock_in_years: 0,
    expenseRatio: 0.25,
    taxType: 'ltcg'
  };

  const conservativeFD = {
    id: 'bank_fd',
    name: 'Fixed Deposit',
    category: 'debt',
    riskLabel: 'Low',
    rate: 7,
    lock_in_years: 1,
    expenseRatio: 0,
    taxType: 'slab'
  };

  it('1. Computes default fallback score when inputs are empty', () => {
    expect(computeSuitabilityMatch(null, null)).toBe(85);
    expect(computeSuitabilityMatch(null, baseProfile)).toBe(70);
  });

  it('2. Evaluates Risk Congruence for Moderate investor', () => {
    const score = computeSuitabilityMatch(highEquityFund, baseProfile);
    expect(score).toBeGreaterThan(60);
    expect(score).toBeLessThanOrEqual(99);
  });

  it('3. Rewards Emergency Fund goal for liquid instruments', () => {
    const efProfile = {
      ...baseProfile,
      investment_goals: ['Emergency Fund'],
      investment_horizon: 2
    };
    const liquidMatch = computeSuitabilityMatch(conservativeFD, efProfile);
    const illiquidMatch = computeSuitabilityMatch({ ...highEquityFund, lock_in_years: 5 }, efProfile);
    
    expect(liquidMatch).toBeGreaterThan(illiquidMatch);
  });

  it('4. Applies Age-based Lifecycle Suitability for Senior Citizens (Age 65)', () => {
    const seniorProfile = {
      ...baseProfile,
      age: 65,
      risk_appetite: 'Low'
    };
    const seniorFDScore = computeSuitabilityMatch(conservativeFD, seniorProfile);
    const seniorEquityScore = computeSuitabilityMatch(highEquityFund, seniorProfile);

    expect(seniorFDScore).toBeGreaterThan(seniorEquityScore);
  });

  it('5. Penalizes lock-in period exceeding investment horizon', () => {
    const shortHorizonProfile = {
      ...baseProfile,
      investment_horizon: 2
    };
    const elssFund = {
      id: 'elss_mf',
      name: 'ELSS Tax Saver',
      category: 'equity',
      riskLabel: 'High',
      rate: 14,
      lock_in_years: 3,
      taxType: 'elss'
    };
    const matchScore = computeSuitabilityMatch(elssFund, shortHorizonProfile);
    expect(matchScore).toBeLessThan(70);
  });

  it('6. Rewards fee efficiency for low expense ratio instruments (<= 0.3%)', () => {
    const lowCostIndexFund = {
      ...highEquityFund,
      expenseRatio: 0.15
    };
    const highCostFund = {
      ...highEquityFund,
      expenseRatio: 1.8
    };

    const lowCostScore = computeSuitabilityMatch(lowCostIndexFund, baseProfile);
    const highCostScore = computeSuitabilityMatch(highCostFund, baseProfile);

    expect(lowCostScore).toBeGreaterThanOrEqual(highCostScore);
  });
});
