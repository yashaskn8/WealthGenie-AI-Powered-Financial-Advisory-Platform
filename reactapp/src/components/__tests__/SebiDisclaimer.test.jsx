/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SebiDisclaimer from '../SebiDisclaimer';
import WhereToInvestTab from '../deepdive/WhereToInvestTab';

describe('SebiDisclaimer Component', () => {
  it('renders regulatory disclaimer text', () => {
    render(<SebiDisclaimer />);
    const matches = screen.getAllByText(/Not SEBI-registered investment advice/i);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/Mutual fund investments are subject to market risk/i)).toBeTruthy();
  });

  it('renders SebiDisclaimer alongside Top-5 execution recommendations in WhereToInvestTab', () => {
    const mockInv = { id: 'mid_cap_stocks', name: 'Mid Cap Growth Stocks', riskLevel: 5 };
    render(<WhereToInvestTab inv={mockInv} />);
    const matches = screen.getAllByText(/Not SEBI-registered investment advice/i);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/Execution Pathway/i)).toBeTruthy();
  });
});
