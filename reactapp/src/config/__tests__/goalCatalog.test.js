import { describe, it, expect } from 'vitest';
import { GOAL_TYPES, getGoalTypeById, getGoalTypeByLabel, hexToRgb } from '../goalCatalog';

describe('goalCatalog (WG-031)', () => {
  it('exports all 8 required goal types with valid structure', () => {
    expect(GOAL_TYPES).toHaveLength(8);
    const ids = GOAL_TYPES.map(g => g.id);
    expect(ids).toEqual([
      'retirement',
      'home_purchase',
      'child_education',
      'emergency_fund',
      'vehicle',
      'wealth_growth',
      'tax_saving',
      'custom',
    ]);
  });

  it('correctly maps getGoalTypeById for exact and normalized IDs', () => {
    expect(getGoalTypeById('retirement')?.label).toBe('Retirement');
    expect(getGoalTypeById('emergency_fund')?.label).toBe('Emergency Fund');
    expect(getGoalTypeById('home-purchase')?.id).toBe('home_purchase');
    expect(getGoalTypeById('child education')?.id).toBe('child_education');
    expect(getGoalTypeById('nonexistent')).toBeNull();
  });

  it('correctly maps getGoalTypeByLabel for exact and case-insensitive labels', () => {
    expect(getGoalTypeByLabel('Retirement')?.id).toBe('retirement');
    expect(getGoalTypeByLabel('emergency fund')?.id).toBe('emergency_fund');
    expect(getGoalTypeByLabel('Home Purchase')?.id).toBe('home_purchase');
    expect(getGoalTypeByLabel('nonexistent')).toBeNull();
  });

  it('correctly converts hex colors to RGB strings via hexToRgb', () => {
    expect(hexToRgb('#f59e0b')).toBe('245, 158, 11');
    expect(hexToRgb('#10b981')).toBe('16, 185, 129');
    expect(hexToRgb('invalid')).toBe('99, 102, 241');
  });

  it('provides accurate numeric default target and year calculations for quickStartEligible goals', () => {
    const retirement = getGoalTypeById('retirement');
    expect(retirement.quickStartEligible).toBe(true);
    expect(retirement.defaultTargetMultiplierOfAnnualIncome).toBe(25);
    // age 30 -> 60 - 30 = 30 years to retire
    expect(retirement.computeYearsToGoal(30)).toBe(30);
    // monthly expenses 40k -> 40,000 * 12 * 25 * (1.06^30) rounded to Lakhs
    const target = retirement.computeTarget(40000, 30);
    expect(target).toBeGreaterThan(60000000);

    const emergency = getGoalTypeById('emergency_fund');
    expect(emergency.quickStartEligible).toBe(true);
    expect(emergency.defaultTargetMonthsOfExpenses).toBe(6);
    expect(emergency.defaultYearsToGoal).toBe(1.5);
    expect(emergency.computeTarget(40000)).toBe(240000);

    const wealth = getGoalTypeById('wealth_growth');
    expect(wealth.quickStartEligible).toBe(true);
    expect(wealth.defaultTargetMultiplierOfAnnualIncome).toBe(5);
    expect(wealth.computeTarget(600000)).toBe(3000000);

    const tax = getGoalTypeById('tax_saving');
    expect(tax.quickStartEligible).toBe(true);
    expect(tax.defaultTarget).toBe(150000);
    expect(tax.computeTarget()).toBe(150000);
  });
});
