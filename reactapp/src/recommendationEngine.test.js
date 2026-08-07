import { describe, expect, it } from 'vitest';
import { generateRecommendations } from './recommendationEngine.js';

describe('generateRecommendations', () => {
  it('creates a funded local recommendation set for a standard profile', () => {
    const recommendations = generateRecommendations({
      age: 32,
      monthly_income: 90000,
      riskCategory: 'Moderate',
      risk_tolerance: 'Moderate',
      investment_goals: ['Wealth Growth'],
      investment_horizon: 10,
      taxRegime: 'new',
    });

    expect(recommendations.length).toBeGreaterThanOrEqual(3);
    expect(recommendations.every(rec => rec._source === 'local_engine')).toBe(true);
    expect(recommendations.every(rec => Number.isFinite(rec.postTaxReturn))).toBe(true);

    const totalAllocation = recommendations.reduce((sum, rec) => sum + (rec.monthly_allocation || 0), 0);
    expect(totalAllocation).toBe(20000);
  });

  it('builds a liquid-only emergency fund portfolio', () => {
    const recommendations = generateRecommendations({
      age: 28,
      monthly_income: 80000,
      riskCategory: 'Aggressive',
      risk_tolerance: 'Aggressive',
      investment_goals: ['Emergency Fund'],
      investment_horizon: 2,
      taxRegime: 'new',
    });

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every(rec => rec.lock_in_years === 0)).toBe(true);
    expect(recommendations._emergencyMeta.target_amount).toBe(360000);
  });
});
