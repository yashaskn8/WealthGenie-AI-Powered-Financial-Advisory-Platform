/**
 * WealthGenie — Goal-Aware Filtering & Emergency Fund Builder
 * ────────────────────────────────────────────────────────────
 * Extracted from recommendationEngine.js for maintainability.
 * Contains GOAL_PROFILES, goal-based instrument filtering,
 * and the dedicated emergency fund liquid portfolio builder.
 */
import { investmentDatabase } from '../investmentDatabase.js';
import { computePostTaxReturn } from './taxComputation.js';

// ─── SIP FUTURE VALUE (private helper) ────────────────────────────
function calculateSIPValue(monthlyDeposit, annualRate, years) {
  if (!years || years <= 0 || !monthlyDeposit || monthlyDeposit <= 0) return 0;
  const r = (annualRate / 100) / 12;
  const n = years * 12;
  if (r === 0) return monthlyDeposit * n;
  return monthlyDeposit * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

// Re-export for use in the orchestrator
export { calculateSIPValue };

// ─── FIX 1: GOAL PROFILES — Liquidity & lock-in rules per goal ───
export const GOAL_PROFILES = {
  'Emergency Fund': {
    liquidity_required: 'high',
    max_lock_in_years: 0,
    preferred_categories: ['Debt', 'Government', 'Commodity'],
    prioritised_ids: ['liquid_mf', 'overnight_mf', 'fd', 'savings_account'],
    excluded_ids: ['elss', 'nps', 'ppf', 'scss', 'rbi_bonds', 'sgb', 'sukanya',
                   'smallcap_mf', 'midcap_mf', 'direct_equity', 'index_mf',
                   'nifty_etf', 'gold_etf'],
    target_formula: 'monthly_expenses * 6',
    recommended_horizon_months: 18,
    note: 'Emergency funds must be instantly accessible. Only liquid instruments.',
  },
  'Retirement': {
    liquidity_required: 'low',
    max_lock_in_years: 30,
    preferred_categories: ['Equity', 'Government', 'Equity-Debt'],
    prioritised_ids: ['nps', 'ppf', 'epf', 'vpf', 'flexi_cap_mf', 'index_mf', 'balanced_advantage_mf'],
    excluded_ids: [],
    recommended_horizon_months: null,
  },
  'Wealth Growth': {
    liquidity_required: 'low',
    max_lock_in_years: null, // No goal-level lock-in cap — the horizon filter handles this
    preferred_categories: ['Equity', 'Equity-Debt', 'Commodity'],
    prioritised_ids: ['flexi_cap_mf', 'midcap_mf', 'smallcap_mf', 'index_mf', 'nifty_etf', 'reit'],
    excluded_ids: [],
    recommended_horizon_months: null,
  },
  'Tax Saving': {
    liquidity_required: 'low',
    max_lock_in_years: 3,
    preferred_categories: ['Equity', 'Government'],
    prioritised_ids: ['elss', 'nps', 'ppf', 'fd_tax_saver', 'sukanya'],
    max_80c_limit: 150000,
    excluded_ids: [],
    recommended_horizon_months: null,
  },
  'Child Education': {
    liquidity_required: 'medium',
    max_lock_in_years: 21,
    preferred_categories: ['Equity', 'Government'],
    prioritised_ids: ['sukanya', 'ppf', 'flexi_cap_mf', 'large_cap_mf', 'elss'],
    excluded_ids: [],
    recommended_horizon_months: null,
  },
  'House Purchase': {
    liquidity_required: 'medium',
    max_lock_in_years: 10,
    preferred_categories: ['Equity', 'Equity-Debt', 'Debt', 'Commodity'],
    prioritised_ids: ['large_cap_mf', 'balanced_advantage_mf', 'debt_mf', 'sgb', 'fd'],
    excluded_ids: [],
    recommended_horizon_months: null,
  },
};

// ─── FIX 1: Filter instruments based on goal requirements ─────────
export function filterInstrumentsForGoal(instruments, goalType) {
  const profile = GOAL_PROFILES[goalType];
  if (!profile) return instruments;

  return instruments.filter(inst => {
    // Exclude instruments by ID
    if (profile.excluded_ids?.includes(inst.id)) return false;
    // Exclude instruments whose lock-in exceeds the goal's max
    const lockIn = inst.lockIn || inst.lock_in_years || 0;
    if (profile.max_lock_in_years !== null && profile.max_lock_in_years !== undefined
        && lockIn > profile.max_lock_in_years) {
      return false;
    }
    // Match goalTags if present
    if (inst.goalTags && Array.isArray(inst.goalTags) && inst.goalTags.length > 0) {
      if (!inst.goalTags.includes(goalType)) return false;
    }
    return true;
  });
}

// ─── FIX 1: Emergency Fund — dedicated liquid portfolio ───────────
export function buildEmergencyFundPortfolio(userProfile) {
  const income = Number(userProfile.monthly_income || userProfile.income) || 0;
  const inferredSavings = income > 0 ? Math.round(income * 0.25) : 0;
  const savings = Number(userProfile.monthly_savings || userProfile.savings) || inferredSavings;
  const monthlyExpenses = income - savings;
  const emergencyTarget = monthlyExpenses * 6;
  const monthsToAchieve = Math.ceil(emergencyTarget / (savings || 1));

  // Liquid instruments only — all have lockIn=0
  const liquidPortfolio = [
    {
      ...investmentDatabase.find(i => i.id === 'liquid_mf'),
    },
    {
      ...investmentDatabase.find(i => i.id === 'fd'),
    },
    {
      ...investmentDatabase.find(i => i.id === 'debt_mf'),
    },
  ].filter(Boolean);

  // Weights: 50% Liquid MF, 35% FD, 15% Debt MF
  const weights = [0.50, 0.35, 0.15];
  const sipAllocations = weights.map(w => Math.round(w * savings / 100) * 100);

  // Fix rounding residual
  const allocated = sipAllocations.reduce((s, a) => s + a, 0);
  const diff = savings - allocated;
  if (diff !== 0) sipAllocations[0] += diff;

  const annualIncome = income * 12;
  const annualSavings = savings * 12;

  liquidPortfolio.forEach((inv, i) => {
    inv.monthly_allocation = sipAllocations[i];
    inv.projected_value = calculateSIPValue(inv.monthly_allocation, inv.rate, Math.ceil(monthsToAchieve / 12) || 1);
    inv.category = inv.cat;
    inv.expected_return_min = Math.max(inv.rate - 1, inv.rate * 0.9);
    inv.expected_return_max = inv.rate;
    inv.risk_level = inv.riskLabel;
    inv.tax_benefit = false;
    inv.tax_section = null;
    inv.lock_in_years = 0;
    inv.liquidity = 'High';
    inv.min_investment_inr = inv.minMonthlyInvestment;
    inv.match_score = 90 - i * 5;
    inv.score = 90 - i * 5;
    inv.description = inv.desc;
    inv.suitable_for_goals = ['Emergency Fund'];
    inv.suitable_risk_profiles = ['Low', 'Medium', 'High'];
    inv.types = [];
    inv.nominalReturn = inv.rate;
    const ptResult = computePostTaxReturn(inv, annualSavings, annualIncome, userProfile);
    inv.postTaxReturn = parseFloat(ptResult.postTaxRate.toFixed(1));
    inv.ml_confidence = 0.92;
    inv._source = 'local_engine';
    inv._goalType = 'Emergency Fund';
  });

  // Attach metadata
  liquidPortfolio._emergencyMeta = {
    target_amount: emergencyTarget,
    monthly_sip: savings,
    months_to_achieve: monthsToAchieve,
    message: `At ₹${savings.toLocaleString('en-IN')}/month, you can build a ₹${(emergencyTarget/100000).toFixed(1)}L emergency fund in ${monthsToAchieve} months.`,
  };

  return liquidPortfolio;
}
