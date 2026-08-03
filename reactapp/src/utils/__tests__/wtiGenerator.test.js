import { describe, it, expect } from 'vitest';
import { generateWTI, rankWhereToInvest, shouldRecommendETF } from '../wtiGenerator';

describe('WTI Generator & Dynamic Ranking Engine', () => {
  it('1. rankWhereToInvest orders candidates dynamically by badge priority and return rate', () => {
    const candidates = [
      { name: 'Standard Candidate', rate: '10.0%', badge: null },
      { name: 'Official Scheme Candidate', rate: '5.25%', badge: 'Official Scheme' },
      { name: 'Top Pick Candidate', rate: '24.0%', badge: 'Top Pick' }
    ];

    const ranked = rankWhereToInvest(candidates);

    expect(ranked[0].name).toBe('Official Scheme Candidate');
    expect(ranked[1].name).toBe('Top Pick Candidate');
    expect(ranked[2].name).toBe('Standard Candidate');
  });

  it('2. shouldRecommendETF returns true for Moderate/Conservative risk or high volatility', () => {
    expect(shouldRecommendETF('Moderate', 0.25)).toBe(true);
    expect(shouldRecommendETF('Conservative', 0.15)).toBe(true);
    expect(shouldRecommendETF('Aggressive', 0.35)).toBe(true);
    expect(shouldRecommendETF('Aggressive', 0.20)).toBe(false);
  });

  it('3. generateWTI returns distinct, customized wti objects for different instrument categories', () => {
    const pharmaWti = generateWTI({ id: 'pharma_sector_mf', name: 'Pharma Sector Fund', cat: 'Equity' });
    const bondWti = generateWTI({ id: 'rbi_bonds', name: 'RBI Floating Rate Bonds', cat: 'Bonds' });

    expect(pharmaWti.title).toContain('Pharma Sector Fund');
    expect(bondWti.title).toContain('RBI Floating Rate Bonds');
    expect(pharmaWti.products[0].highlight).not.toEqual(bondWti.products[0].highlight);
  });
});
