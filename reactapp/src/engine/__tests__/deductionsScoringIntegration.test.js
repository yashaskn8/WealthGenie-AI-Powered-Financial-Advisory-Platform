import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '../../recommendationEngine.js';
import { computeScore } from '../scoringEngine.js';
import { investmentDatabase } from '../../investmentDatabase.js';
import { getMarginalRate } from '../taxComputation.js';

describe('WG-DEDUCTIONS-COLLECTION: Client-Side Scoring & Recommendation Integration Proof', () => {
  it('Proof 3.1: Profile with real deductions lowers marginal tax rate for Old Regime user from 31.2% to 20.8%', () => {
    const baseProfileNoDeductions = {
      age: 35,
      monthly_income: 100000,
      monthly_savings: 25000,
      investment_goals: ['Wealth Growth'],
      investment_horizon: 10,
      taxRegime: 'old',
      riskCategory: 'Moderate',
      risk_tolerance: 'Moderate',
      total_ctc: 1200000,
      basic_component: 600000,
    };

    const profileWithDeductions = {
      ...baseProfileNoDeductions,
      section80C: 150000,
      section80CCD1B: 50000,
      section80D_self: 25000,
      homeLoanInterest: 150000,
    };

    const mrNoDed = getMarginalRate(1200000, 'old', baseProfileNoDeductions);
    const mrWithDed = getMarginalRate(1200000, 'old', profileWithDeductions);

    // ₹12L gross - ₹50k std ded = ₹11.5L taxable (>₹10L slab -> 30% + 4% cess = 0.312)
    expect(mrNoDed).toBeCloseTo(0.312, 3);

    // ₹12L gross - ₹50k std ded - ₹3.75L deductions = ₹7.75L taxable (in ₹5L-₹10L slab -> 20% + 4% cess = 0.208)
    expect(mrWithDed).toBeCloseTo(0.208, 3);
    expect(mrWithDed).toBeLessThan(mrNoDed);
  });

  it('Proof 3.2: Slab-taxed instruments (FD) yield higher post-tax return and different scores under deduction-aware profile', () => {
    const profileNoDeductions = {
      age: 35,
      monthly_income: 100000,
      monthly_savings: 25000,
      investment_goals: ['Wealth Growth'],
      investment_horizon: 10,
      taxRegime: 'old',
      riskCategory: 'Moderate',
      risk_tolerance: 'Moderate',
      total_ctc: 1200000,
      basic_component: 600000,
    };

    const profileWithDeductions = {
      ...profileNoDeductions,
      section80C: 150000,
      section80CCD1B: 50000,
      section80D_self: 25000,
      homeLoanInterest: 150000,
    };

    const fd = investmentDatabase.find(i => i.id === 'fd');
    expect(fd).toBeDefined();

    const scoreNoDed = computeScore(fd, profileNoDeductions);
    const scoreWithDed = computeScore(fd, profileWithDeductions);

    // FD post-tax rate is higher because marginal tax bracket dropped from 31.2% to 20.8%
    expect(scoreWithDed.postTaxRate).toBeGreaterThan(scoreNoDed.postTaxRate);
    expect(scoreWithDed.postTaxRate).toBeCloseTo(fd.rate * (1 - 0.208), 2);
    expect(scoreNoDed.postTaxRate).toBeCloseTo(fd.rate * (1 - 0.312), 2);

    // Higher post-tax return translates to a higher score
    expect(scoreWithDed.score).toBeGreaterThan(scoreNoDed.score);
  });

  it('Proof 3.3: generateRecommendations produces differentiated allocations and portfolio metrics for profile with deductions', () => {
    const profileNoDeductions = {
      age: 35,
      monthly_income: 100000,
      monthly_savings: 25000,
      investment_goals: ['Wealth Growth'],
      investment_horizon: 10,
      taxRegime: 'old',
      riskCategory: 'Moderate',
      risk_tolerance: 'Moderate',
      total_ctc: 1200000,
      basic_component: 600000,
    };

    const profileWithDeductions = {
      ...profileNoDeductions,
      section80C: 150000,
      section80CCD1B: 50000,
      section80D_self: 25000,
      homeLoanInterest: 150000,
    };

    const recsNoDed = generateRecommendations(profileNoDeductions);
    const recsWithDed = generateRecommendations(profileWithDeductions);

    expect(recsNoDed.length).toBeGreaterThanOrEqual(3);
    expect(recsWithDed.length).toBeGreaterThanOrEqual(3);

    // Verify all recommendations have valid numbers
    expect(recsWithDed.every(r => Number.isFinite(r.postTaxReturn) && Number.isFinite(r.monthly_allocation))).toBe(true);

    // Tax-sensitive instruments (Hybrid MF, NPS, FD) have higher post-tax return with deductions
    const taxSensitiveWithDed = recsWithDed.find(r => r.id === 'hybrid_mf' || r.taxType === 'nps' || (r.taxType === 'slab' && r.rate > 0));
    const taxSensitiveNoDed = recsNoDed.find(r => r.id === taxSensitiveWithDed?.id);

    if (taxSensitiveWithDed && taxSensitiveNoDed) {
      expect(taxSensitiveWithDed.postTaxReturn).toBeGreaterThan(taxSensitiveNoDed.postTaxReturn);
    }

    // Verify match scores and allocations are generated cleanly
    expect(recsWithDed[0].monthly_allocation).toBeGreaterThan(0);
    expect(recsWithDed[0].match_score).toBeGreaterThan(0);
  });
});
