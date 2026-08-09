/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GoalTracker from '../GoalTracker';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: {
    getGoals: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
  },
}));

describe('GoalTracker Component — Batch Error Isolation (WG-032)', () => {
  const mockProfile = {
    _id: 'prof_123',
    monthly_income: 50000,
    monthly_savings: 10000,
    age: 30,
    investment_horizon: 15,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a. All 4 default goals succeed: attempts all 4, no failure banner, refreshes dbGoals, resets isInitializing to false', async () => {
    api.getGoals.mockResolvedValueOnce({ goals: [] }); // initial fetch (preview mode)
    api.createGoal.mockResolvedValue({ success: true });
    api.getGoals.mockResolvedValueOnce({
      goals: [
        { _id: 'g1', goal_name: 'Retirement', target_amount: 15000000 },
        { _id: 'g2', goal_name: 'Wealth Growth', target_amount: 3000000 },
        { _id: 'g3', goal_name: 'Tax Saving', target_amount: 150000 },
        { _id: 'g4', goal_name: 'Emergency Fund', target_amount: 240000 },
      ],
    }); // after bootstrap

    render(<GoalTracker profile={mockProfile} recommendations={[]} />);

    await waitFor(() => {
      expect(screen.getByText('Save My Goals')).toBeTruthy();
    });

    const saveButton = screen.getByText('Save My Goals');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.createGoal).toHaveBeenCalledTimes(4);
    });

    await waitFor(() => {
      expect(api.getGoals).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Your Saved Goals')).toBeTruthy();
    });

    // Confirm no failure banner is present
    expect(screen.queryByText(/Skipped:/i)).toBeNull();
    expect(screen.queryByText(/Couldn't create any goals/i)).toBeNull();

    // Confirm isInitializing is false (Save button / Saving Goals text no longer initializing)
    expect(screen.queryByText('Saving Goals...')).toBeNull();
  });

  it('b. 1 of 4 fails (duplicate conflict on 2nd goal): attempts ALL 4 goals, displays partial success banner with server message, refreshes dbGoals, resets isInitializing to false', async () => {
    api.getGoals.mockResolvedValueOnce({ goals: [] }); // initial fetch

    const conflictMsg = 'A goal named "Wealth Growth" already exists. Use a different name.';
    api.createGoal
      .mockResolvedValueOnce({ success: true }) // 1. Retirement succeeds
      .mockRejectedValueOnce(new Error(conflictMsg)) // 2. Wealth Growth fails with 409 conflict
      .mockResolvedValueOnce({ success: true }) // 3. Tax Saving succeeds
      .mockResolvedValueOnce({ success: true }); // 4. Emergency Fund succeeds

    api.getGoals.mockResolvedValueOnce({
      goals: [
        { _id: 'g1', goal_name: 'Retirement', target_amount: 15000000 },
        { _id: 'g3', goal_name: 'Tax Saving', target_amount: 150000 },
        { _id: 'g4', goal_name: 'Emergency Fund', target_amount: 240000 },
      ],
    }); // refresh returns the 3 goals that succeeded

    render(<GoalTracker profile={mockProfile} recommendations={[]} />);

    await waitFor(() => {
      expect(screen.getByText('Save My Goals')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save My Goals'));

    // CRITICAL: Must attempt ALL 4 goals without stopping early on failure #2
    await waitFor(() => {
      expect(api.createGoal).toHaveBeenCalledTimes(4);
    });

    // Confirm dbGoals was still refreshed despite partial failure
    await waitFor(() => {
      expect(api.getGoals).toHaveBeenCalledTimes(2);
    });

    // Confirm inline partial failure banner is displayed with actual server error message
    await waitFor(() => {
      expect(screen.getByText(/Created 3 of 4 goals/i)).toBeTruthy();
      expect(screen.getByText(new RegExp(conflictMsg, 'i'))).toBeTruthy();
    });

    // Confirm isInitializing is false (not stuck in loading/initializing state)
    expect(screen.queryByText('Saving Goals...')).toBeNull();
  });

  it('c. All 4 fail: attempts all 4, displays total-failure banner with server message, refreshes dbGoals, resets isInitializing to false', async () => {
    api.getGoals.mockResolvedValueOnce({ goals: [] });

    const serverMsg = 'Database connection timeout';
    api.createGoal.mockRejectedValue(new Error(serverMsg));
    api.getGoals.mockResolvedValueOnce({ goals: [] });

    render(<GoalTracker profile={mockProfile} recommendations={[]} />);

    await waitFor(() => {
      expect(screen.getByText('Save My Goals')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Save My Goals'));

    await waitFor(() => {
      expect(api.createGoal).toHaveBeenCalledTimes(4);
    });

    await waitFor(() => {
      expect(api.getGoals).toHaveBeenCalledTimes(2);
    });

    // Confirm total failure banner is displayed
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`Couldn't create any goals: ${serverMsg}`, 'i'))).toBeTruthy();
    });

    // Confirm isInitializing resets to false
    expect(screen.queryByText('Saving Goals...')).toBeNull();
  });
});
