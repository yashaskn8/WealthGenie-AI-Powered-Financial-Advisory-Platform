/**
 * WealthGenie — Canonical Instrument Type Mapping (WG-016 / WG-017)
 * ─────────────────────────────────────────────────────────────────
 * Single source of truth for mapping asset categories to legacy type enums.
 */

export const LEGACY_TYPE_MAP = {
  'Government':           'Government',
  'Gold':                 'Gold',
  'Equity-Debt':          'Mutual_Fund',
  'Alternative':          'ETF',
  'Mutual Fund':          'Mutual_Fund',
  'Fixed Deposit':        'FD',
  'Tax-Saving (80C)':     'ELSS',
  'Tax Savings (80C)':    'ELSS',
  'Direct Equity':        'ETF',
  'Government-Backed':    'Government',
  'Fixed Income':         'FD',
  'Equity':               'Mutual_Fund',
  'Debt':                 'FD',
  'Hybrid':               'Mutual_Fund',
};

export function mapCategoryToLegacyType(category) {
  return LEGACY_TYPE_MAP[category] || 'Mutual_Fund';
}
