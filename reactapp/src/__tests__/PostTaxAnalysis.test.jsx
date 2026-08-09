/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PostTaxAnalysis from '../PostTaxAnalysis';
import * as apiModule from '../services/api';

vi.mock('../services/api', () => ({
  computePostTaxReturnBatch: vi.fn(),
}));

describe('PostTaxAnalysis Component — WG-038 Backend Integration & Rebate Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays 7.00% post-tax return for ₹10,00,000 income user with 7% FD (0% tax drag due to 87A rebate)', async () => {
    // Mock backend batch API response for ₹10L income (rebate applies, postTaxReturn = 0.07)
    apiModule.computePostTaxReturnBatch.mockResolvedValueOnce({
      results: [
        {
          instrumentType: 'FD',
          postTaxReturn: 0.07,
          effectiveYield: 7.0,
          taxType: 'Slab Rate (0%)',
          taxRate: 0,
          notes: 'Rebate under Section 87A applied.',
        },
      ],
    });

    const mockProfile = {
      monthly_income: 1000000 / 12, // Exactly ₹10,00,000 annual income
      monthly_savings: 20000,
      taxRegime: 'new',
      age: 30,
      investment_horizon: 3,
    };

    const mockRecommendations = [
      {
        id: 'fd_1',
        name: 'Fixed Deposit',
        type: 'FD',
        taxType: 'slab',
        rate: 7.0,
        expectedReturn: 7.0,
        monthly_allocation: 10000,
      },
    ];

    render(<PostTaxAnalysis profile={mockProfile} recommendations={mockRecommendations} />);

    // Verify computePostTaxReturnBatch was called with annualIncome = 1000000
    await waitFor(() => {
      expect(apiModule.computePostTaxReturnBatch).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            instrumentType: 'FD',
            nominalRate: 0.07,
            holdingYears: 3,
          }),
        ],
        1000000,
        'new',
        30
      );
    });

    // Verify post-tax return displayed is 7.0% (not old buggy 6.27%)
    await waitFor(() => {
      const bodyText = document.body.textContent;
      expect(bodyText).not.toContain('6.27%');
      expect(bodyText).toContain('7.0%');
    });
  });
});
