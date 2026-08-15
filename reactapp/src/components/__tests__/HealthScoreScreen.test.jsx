/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthScoreScreen from '../../HealthScoreScreen';

describe('HealthScoreScreen — Loading and Render States', () => {
  it('renders loading state when profile is not provided', () => {
    render(<HealthScoreScreen profile={null} recommendations={[]} />);
    expect(screen.getByRole('status', { name: /loading health score/i })).toBeTruthy();
    expect(screen.getByText(/calculating your financial health score/i)).toBeTruthy();
  });

  it('renders full health score dashboard when profile is loaded', () => {
    const mockProfile = {
      name: 'Priya Sharma',
      age: 28,
      monthly_income: 100000,
      monthly_savings: 30000,
      investment_goals: ['Emergency Fund', 'Wealth Growth'],
      investment_horizon: 15,
      riskCategory: 'Moderate',
    };
    const mockRecs = [
      { category: 'Equity', monthly_allocation: 15000, suitable_for_goals: ['Wealth Growth'] },
      { category: 'Debt', monthly_allocation: 15000, suitable_for_goals: ['Emergency Fund'] },
    ];

    render(<HealthScoreScreen profile={mockProfile} recommendations={mockRecs} />);
    expect(screen.getByText('Your Financial Health Score')).toBeTruthy();
    expect(screen.getByText('Savings Capacity')).toBeTruthy();
    expect(screen.getByText('Emergency Safety Net')).toBeTruthy();
  });
});
