/**
 * WealthGenie — Unified Goal Types Catalog (WG-031)
 * Single source of truth for goal metadata across GoalForm and GoalTracker.
 */

// Helper to convert hex color to RGB string (e.g. "#f59e0b" -> "245, 158, 11")
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return '99, 102, 241';
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return '99, 102, 241';
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export const GOAL_TYPES = [
  {
    id: 'retirement',
    label: 'Retirement',
    Icon: 'Umbrella', // Canonical from GoalForm.jsx (GoalTracker previously used Palmtree)
    color: '#f59e0b', // Canonical from GoalForm.jsx (Amber; GoalTracker previously used #0ea5e9 Cyan)
    themeColor: '#f59e0b',
    themeColorRGB: '245, 158, 11',
    defaultTargetMultiplierOfAnnualIncome: 25, // Real-terms 25x annual expenses estimate (inflation-adjusted target is computed exclusively on backend in server/routes/goals.js)
    defaultYearsToGoal: 30, // 60 - age (age 30 baseline)
    computeYearsToGoal: (age) => Math.max(5, 60 - (Number(age) || 30)),
    computeTarget: (monthlyExpenses) =>
      Math.round(((monthlyExpenses || 40000) * 12 * 25) / 100000) * 100000,
    returnRate: 12,
    defaultPriority: 'High',
    quickStartEligible: true,
  },
  {
    id: 'home_purchase',
    label: 'Home Purchase',
    Icon: 'Home',
    color: '#38bdf8',
    themeColor: '#38bdf8',
    themeColorRGB: '56, 189, 248',
    quickStartEligible: false,
  },
  {
    id: 'child_education',
    label: 'Child Education',
    Icon: 'GraduationCap',
    color: '#8b5cf6',
    themeColor: '#8b5cf6',
    themeColorRGB: '139, 92, 246',
    quickStartEligible: false,
  },
  {
    id: 'emergency_fund',
    label: 'Emergency Fund',
    Icon: 'Shield', // GoalForm & GoalTracker match
    color: '#10b981', // GoalForm & GoalTracker match (Emerald)
    themeColor: '#10b981',
    themeColorRGB: '16, 185, 129',
    defaultTargetMonthsOfExpenses: 6,
    computeTarget: (monthlyExpenses) => Math.round(((monthlyExpenses || 40000) * 6) / 10000) * 10000,
    defaultYearsToGoal: 1.5,
    returnRate: 7,
    defaultPriority: 'Critical',
    quickStartEligible: true,
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    Icon: 'Car',
    color: '#f43f5e',
    themeColor: '#f43f5e',
    themeColorRGB: '244, 63, 94',
    quickStartEligible: false,
  },
  {
    id: 'wealth_growth',
    label: 'Wealth Growth',
    Icon: 'TrendingUp', // Task prompt specified TrendingUp for wealth_growth (GoalTracker previously had Diamond)
    // GoalTracker used #a855f7 (Purple). Consistent with existing palette (#f59e0b, #38bdf8, #8b5cf6, #10b981, #f43f5e taken).
    color: '#a855f7',
    themeColor: '#a855f7',
    themeColorRGB: '168, 85, 247',
    defaultTargetMultiplierOfAnnualIncome: 5,
    computeTarget: (annualIncome) => Math.round(((annualIncome || 600000) * 5) / 100000) * 100000,
    defaultYearsToGoal: 10,
    computeYearsToGoal: (horizon) => Math.min(Number(horizon) || 15, 10),
    returnRate: 11,
    defaultPriority: 'Medium',
    quickStartEligible: true,
  },
  {
    id: 'tax_saving',
    label: 'Tax Saving',
    Icon: 'FileText', // Task prompt specified FileText (GoalTracker had FileText)
    // GoalTracker used #f43f5e (Rose), which conflicted with GoalForm Vehicle (#f43f5e).
    // Replaced with #06b6d4 (Cyan) for visual distinction within the existing palette.
    color: '#06b6d4',
    themeColor: '#06b6d4',
    themeColorRGB: '6, 182, 212',
    defaultTarget: 150000,
    computeTarget: () => 150000,
    defaultYearsToGoal: 1,
    returnRate: 10,
    defaultPriority: 'Low',
    quickStartEligible: false,
  },
  {
    id: 'custom',
    label: 'Custom',
    Icon: 'Sparkles',
    color: '#94a3b8',
    themeColor: '#94a3b8',
    themeColorRGB: '148, 163, 184',
    quickStartEligible: false,
  },
];

export function getGoalTypeById(id) {
  if (!id) return null;
  const normalizedId = String(id).toLowerCase().replace(/[\s-]/g, '_');
  return GOAL_TYPES.find((g) => g.id === normalizedId) || null;
}

export function getGoalTypeByLabel(label) {
  if (!label) return null;
  const trimmed = String(label).trim().toLowerCase();
  return GOAL_TYPES.find((g) => g.label.toLowerCase() === trimmed) || null;
}
