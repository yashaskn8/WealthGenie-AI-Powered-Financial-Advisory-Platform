/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InvestmentCard from '../../InvestmentCard';

const mockInvestment = {
  id: 'equity_mf',
  name: 'Flexi Cap Mutual Fund',
  category: 'Equity',
  expected_return_min: 12,
  expected_return_max: 15,
  risk_level: 'High',
  types: ['Large Cap', 'Mid Cap'],
  monthly_allocation: 10000,
  projected_value: 2300000,
  tax_benefit: 'LTCG exempt up to ₹1.25 Lakhs',
};

describe('InvestmentCard Component', () => {
  it('renders investment card title and return range', () => {
    render(<InvestmentCard investment={mockInvestment} horizon={10} />);
    expect(screen.getByText('Flexi Cap Mutual Fund')).toBeTruthy();
    expect(screen.getByText('12% – 15%')).toBeTruthy();
    expect(screen.getByText('High Risk')).toBeTruthy();
  });
});
