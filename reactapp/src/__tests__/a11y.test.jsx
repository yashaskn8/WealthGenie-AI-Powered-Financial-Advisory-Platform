/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import axe from 'axe-core';

import TaxScreen from '../components/TaxScreen';
import AllocationPlanner from '../components/AllocationPlanner';
import RebalancerScreen from '../components/RebalancerScreen';
import GenieChat from '../components/GenieChat';
import DeepDiveModal from '../components/DeepDiveModal';

afterEach(() => {
  cleanup();
});

const mockProfile = {
  name: 'Priya Sharma',
  age: 30,
  monthly_income: 100000,
  monthly_savings: 30000,
  investment_goals: ['Emergency Fund', 'Wealth Growth', 'Retirement'],
  investment_horizon: 15,
  riskCategory: 'Moderate',
  taxRegime: 'new',
  existing_savings: 200000,
};

const mockRecs = [
  { id: '1', name: 'Nifty 50 Index Fund', category: 'Equity', type: 'Equity', expectedReturn: 12, monthly_allocation: 15000, risk: 'Medium', description: 'Large cap equity index' },
  { id: '2', name: 'HDFC Liquid Fund', category: 'Debt', type: 'Debt', expectedReturn: 6.5, monthly_allocation: 15000, risk: 'Low', description: 'Liquid debt fund' }
];

describe('Automated Accessibility (a11y) Verification Suite with axe-core', () => {
  it('checks TaxScreen for accessibility violations', async () => {
    const { container } = render(<TaxScreen profile={mockProfile} recommendations={mockRecs} />);
    const results = await axe.run(container, {
      rules: {
        // In JSDOM, color-contrast calculations are incomplete due to lack of real layout engine
        'color-contrast': { enabled: false }
      }
    });
    console.log(`[A11Y AUDIT] TaxScreen violations: ${results.violations.length}`);
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help })), null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  it('checks AllocationPlanner for accessibility violations', async () => {
    const { container } = render(<AllocationPlanner profile={mockProfile} recommendations={mockRecs} />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } }
    });
    console.log(`[A11Y AUDIT] AllocationPlanner violations: ${results.violations.length}`);
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help })), null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  it('checks RebalancerScreen for accessibility violations', async () => {
    const { container } = render(<RebalancerScreen profile={mockProfile} recommendations={mockRecs} />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } }
    });
    console.log(`[A11Y AUDIT] RebalancerScreen violations: ${results.violations.length}`);
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help })), null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  it('checks GenieChat for accessibility violations', async () => {
    const { container } = render(<GenieChat profile={mockProfile} />);
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } }
    });
    console.log(`[A11Y AUDIT] GenieChat violations: ${results.violations.length}`);
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help })), null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  it('checks DeepDiveModal for accessibility violations', async () => {
    const { container } = render(
      <DeepDiveModal
        isOpen={true}
        onClose={() => {}}
        investment={mockRecs[0]}
        allRecommendations={mockRecs}
        horizon={15}
        userProfile={mockProfile}
      />
    );
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } }
    });
    console.log(`[A11Y AUDIT] DeepDiveModal violations: ${results.violations.length}`);
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help })), null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});
