import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GoalCoverage from '../../GoalCoverage';

const mockGoals = ['Retirement', 'Home Purchase'];
const mockRecommendations = [
  { name: 'Nifty 50 Index Fund', suitable_for_goals: ['Retirement'] },
  { name: 'HDFC Home Fund', suitable_for_goals: ['Home Purchase'] },
];

describe('GoalCoverage Component', () => {
  it('renders goal coverage summary and covered investments', () => {
    render(<GoalCoverage selectedGoals={mockGoals} recommendations={mockRecommendations} />);
    expect(screen.getByText('Goal Coverage Summary')).toBeTruthy();
    expect(screen.getByText('Retirement')).toBeTruthy();
    expect(screen.getByText(/Nifty 50 Index Fund/i)).toBeTruthy();
    expect(screen.getByText('Home Purchase')).toBeTruthy();
    expect(screen.getByText(/HDFC Home Fund/i)).toBeTruthy();
  });
});
