/**
 * WealthGenie — Backend Recommendation Pipeline
 * ──────────────────────────────────────────────
 * Metadata-driven recommendation service that replaces hardcoded
 * instrument overrides with configurable scoring logic.
 *
 * ARCHITECTURE:
 *   This pipeline is the backend's independent recommendation engine.
 *   It orchestrates four modular stages:
 *     1. Eligibility Filtering  — remove instruments the user cannot hold
 *     2. Scoring                — multi-factor weighted utility per instrument
 *     3. Ranking                — sort by score, apply ML confidence boost
 *     4. Diversity Enforcement  — ensure top-N spans min asset classes
 *
 *   The pipeline consumes:
 *     - The backend's authoritative catalog (server/data/investmentDatabase.js)
 *     - ML confidence scores from mlClient.js
 *     - User profile data from FinancialProfile
 *     - Tax slab computation from taxEngine.js
 *
 *   It does NOT duplicate the frontend scoring engine. Instead it reuses
 *   the existing backend tax infrastructure (getTaxSlab, calculatePostTaxReturnSafe)
 *   and adds only the metadata-driven scoring logic required for independent
 *   backend recommendations.
 */

import { getTaxSlab } from './taxEngine.js';
import { calculatePostTaxReturnSafe } from './postTaxCalculator.js';
import { INSTRUMENT_PARAMS, RISK_FREE_RATE } from './instrumentConstants.js';
import { investmentDatabase } from '../data/investmentDatabase.js';
import { encodeRiskCategory } from './riskProfiler.js';

// ═══════════════════════════════════════════════════════════════════
// PIPELINE CONFIGURATION — centralized, no magic numbers
// ═══════════════════════════════════════════════════════════════════
const PIPELINE_CONFIG = Object.freeze({
  TOP_N: 5,
  MIN_ASSET_CLASSES: 3,

  // Weight ranges
  WEIGHT_FLOOR: 0.5,
  WEIGHT_CEIL: 3.0,

  // Return scoring
  RETURN_MULTIPLIER: 3.5,

  // Risk alignment
  RISK_PERFECT_BONUS: 20,
  RISK_CLOSE_BONUS: 12,
  RISK_MISMATCH_PENALTY: 10,
  RISK_SEVERE_PENALTY: 18,
  VOLATILITY_BASELINE: 0.15,

  // Tax efficiency
  TAX_PENALTY_SCALE: 8,       // (5 - taxEfficiencyScore) * marginalRate * scale

  // Liquidity
  LIQUIDITY_CENTER: 3,
  LIQUIDITY_SCALE: 4,

  // Goal alignment
  GOAL_TAG_POINTS: 5,
  GOAL_TAG_CAP: 15,

  // Horizon match
  HORIZON_PERFECT: 15,
  HORIZON_GOOD: 10,
  HORIZON_PARTIAL: 5,
  HORIZON_LOCK_FIT: 15,
  HORIZON_NO_LOCK: 5,
  HORIZON_SEVERE_MISMATCH_PENALTY: 10,

  // Cost
  COST_FREE_BONUS: 3,
  COST_PENALTY_SCALE: 100,

  // ML confidence integration
  ML_BOOST_WEIGHT: 25,        // points per 1.0 confidence (scaled)
});

// ═══════════════════════════════════════════════════════════════════
// RISK RECONCILIATION ENGINE (Section 3 — Mandatory, never skip)
// ═══════════════════════════════════════════════════════════════════

/**
 * Derive instrument risk tier from catalog dynamicData.risk.value.
 * Section 4 CATALOG: 1–2 → 'Low', 3 → 'Medium', 4–5 → 'High'.
 * Source: investment_master.json — never hardcoded.
 */
export function instrumentRiskTier(inv) {
  const riskValue = inv.dynamicData?.risk?.value ?? inv.riskLevel ?? inv.risk ?? 3;
  if (riskValue <= 2) return 'Low';
  if (riskValue === 3) return 'Medium';
  return 'High';
}

/**
 * Section 3 Risk-Reconciliation Algorithm.
 *
 * Capacity (C): from riskProfiler.js encodeRiskCategory() + 1 (0–4 → 1–5).
 * Preference (T): single source = profile.risk_tolerance.
 *   'Conservative' → 1, 'Moderate' → 3, 'Aggressive' → 5.
 * final_score = MIN(T, C + 1), clamped [1, 5].
 *
 * @param {Object} profile - FinancialProfile document (lean)
 * @returns {Object} Reconciliation result with final_risk_tier, scores, notes, flags
 */
export function reconcileRisk(profile) {
  const result = {
    capacity_score: null,
    preference_score: null,
    final_score: null,
    final_risk_tier: '',
    reconciliation_note: '',
    advisory_note: '',
    capacity_missing: false,
    preference_missing: false,
  };

  const TIER_NAMES = {
    1: 'Conservative', 2: 'Conservative-Moderate', 3: 'Moderate',
    4: 'Moderate-Aggressive', 5: 'Aggressive',
  };

  // Section 3.1: Map capacity to C ∈ [1,5].
  // encodeRiskCategory() returns 0–4. The +1 converts to the 1–5 scale
  // required by the reconciliation algorithm. If encodeRiskCategory's
  // output range ever changes, this +1 must be revisited.
  const capacityCategory = profile.riskCategory;
  let C = null;
  if (capacityCategory && typeof capacityCategory === 'string' &&
      ['Conservative', 'Conservative-Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive'].includes(capacityCategory)) {
    C = encodeRiskCategory(capacityCategory) + 1; // 0–4 → 1–5
  }

  // Section 3.2: Map stated preference to T ∈ [1,5].
  // Single source of truth: profile.risk_tolerance (Joi-validated, Mongoose-persisted).
  const PREFERENCE_MAP = { 'Conservative': 1, 'Moderate': 3, 'Aggressive': 5 };
  const preference = profile.risk_tolerance;
  let T = null;
  if (preference && PREFERENCE_MAP[preference] !== undefined) {
    T = PREFERENCE_MAP[preference];
  }

  // Section 3.5: If only one of C/T is supplied, use it as final_score
  if (C === null && T === null) {
    result.capacity_missing = true;
    result.preference_missing = true;
    result.final_score = 3;
    result.reconciliation_note = 'Both capacity and preference missing. Defaulting to Moderate (tier 3) — flagged, not silent.';
  } else if (C === null) {
    result.capacity_missing = true;
    result.preference_score = T;
    result.final_score = T;
    result.reconciliation_note = `Capacity not supplied. Using stated preference (T=${T}) as final score.`;
  } else if (T === null) {
    result.preference_missing = true;
    result.capacity_score = C;
    result.final_score = C;
    result.reconciliation_note = `Preference not supplied. Using computed capacity (C=${C}) as final score.`;
  } else {
    result.capacity_score = C;
    result.preference_score = T;
    // Section 3.3: final_score = MIN(T, C + 1), clamped to [1,5].
    // Preference can pull DOWN freely. Preference can pull UP by at most +1 past capacity.
    result.final_score = Math.max(1, Math.min(5, Math.min(T, C + 1)));

    if (T <= C) {
      result.reconciliation_note = `Preference (T=${T}) pulled tier down from capacity (C=${C}). Final: ${result.final_score}.`;
    } else if (T > C + 1) {
      result.reconciliation_note = `Preference (T=${T}) exceeds capacity+1 (C+1=${C + 1}), capped. Final: ${result.final_score}.`;
    } else {
      result.reconciliation_note = `Preference (T=${T}) within capacity range (C=${C}). Final: ${result.final_score}.`;
    }

    // Section 3.4: If |C − T| > 2, populate advisory_note
    if (Math.abs(C - T) > 2) {
      result.advisory_note =
        `Significant mismatch between risk capacity (${capacityCategory}, C=${C}) ` +
        `and stated preference (${preference}, T=${T}). ` +
        `Your financial profile suggests ${capacityCategory} risk capacity, ` +
        `but you selected ${preference} preference. ` +
        `The engine reconciled to tier ${result.final_score} to protect against over-exposure.`;
    }
  }

  result.final_risk_tier = TIER_NAMES[result.final_score] || 'Moderate';
  return result;
}

/**
 * Enforce Section 6 allocation targets by risk tier category (Low/Medium/High).
 * Section 5 addendum: tier ≥ 4 caps LOW at 20% unless emergency_fund_months < 3.
 *
 * @param {Array} instruments - Scored instrument array from pipeline
 * @param {number} reconciledTier - Final reconciled tier (1–5)
 * @param {Object} profile - User profile for emergency fund check
 * @returns {Array} Instruments with allocation_pct and updated allocationWeight
 */
function enforceAllocationTargets(instruments, reconciledTier, profile) {
  if (!instruments.length) return instruments;

  // Section 6 target ranges [min%, max%] by tier
  const TARGETS = {
    1: { Low: [65, 80], Medium: [15, 25], High: [0, 10] },
    2: { Low: [45, 60], Medium: [25, 35], High: [10, 20] },
    3: { Low: [25, 35], Medium: [30, 40], High: [25, 35] },
    4: { Low: [10, 20], Medium: [25, 35], High: [45, 55] },
    5: { Low: [0, 10],  Medium: [20, 30], High: [60, 70] },
  };

  // Deep copy targets (Section 5 may mutate for emergency fund override)
  const targets = {};
  const srcTargets = TARGETS[reconciledTier] || TARGETS[3];
  for (const k of ['Low', 'Medium', 'High']) targets[k] = [...srcTargets[k]];

  // Section 5: tier ≥ 4 → LOW capped at 20%, UNLESS emergency_fund_months < 3
  if (reconciledTier >= 4) {
    const emergencyMonths = Number(profile.emergency_fund_months) || 0;
    if (emergencyMonths < 3) {
      targets.Low = [20, 35]; // Override: top up liquid slice first
    }
  }

  // Assign tier to each instrument from catalog dynamicData.risk.value
  instruments.forEach(inv => { inv.tier = instrumentRiskTier(inv); });

  // Group instruments by tier
  const groups = { Low: [], Medium: [], High: [] };
  instruments.forEach(inv => { (groups[inv.tier] || groups.Medium).push(inv); });

  // Compute target allocation midpoint per tier (only for populated tiers)
  const allocs = {};
  let total = 0;
  for (const tier of ['Low', 'Medium', 'High']) {
    if (groups[tier].length > 0) {
      const [min, max] = targets[tier];
      allocs[tier] = (min + max) / 2;
      total += allocs[tier];
    } else {
      allocs[tier] = 0;
    }
  }

  // Normalize to sum to 100
  if (total > 0) {
    for (const tier of ['Low', 'Medium', 'High']) {
      allocs[tier] = (allocs[tier] / total) * 100;
    }
  }

  // Within each tier, distribute proportionally by score
  instruments.forEach(inv => {
    const group = groups[inv.tier];
    const tierAlloc = allocs[inv.tier] || 0;
    const groupScore = group.reduce((s, i) => s + Math.max(0, i.score || 0), 0);
    const share = groupScore > 0 ? Math.max(0, inv.score || 0) / groupScore : 1 / group.length;
    inv.allocation_pct = parseFloat((share * tierAlloc).toFixed(1));
  });

  // Fix rounding to exactly 100
  const sum = instruments.reduce((s, i) => s + i.allocation_pct, 0);
  const residual = parseFloat((100 - sum).toFixed(1));
  if (Math.abs(residual) > 0.05 && instruments.length > 0) {
    const maxInst = instruments.reduce((a, b) => a.allocation_pct >= b.allocation_pct ? a : b);
    maxInst.allocation_pct = parseFloat((maxInst.allocation_pct + residual).toFixed(1));
  }

  // Update allocationWeight for backward compatibility (0–1 scale)
  instruments.forEach(inv => {
    inv.allocationWeight = parseFloat((inv.allocation_pct / 100).toFixed(4));
  });

  return instruments;
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 1: ELIGIBILITY FILTERING
// ═══════════════════════════════════════════════════════════════════

/**
 * Filter instruments the user is eligible to hold based on metadata.
 * @param {Array} instruments - Full instrument catalog
 * @param {Object} profile - User's financial profile
 * @returns {Array} Eligible instruments
 */
export function filterEligible(instruments, profile, reconciledTier = null) {
  const age = Number(profile.age) || 30;
  const income = Number(profile.monthly_income || profile.income) || 0;
  const annualIncome = Number(profile.annualIncome) || (income * 12);
  const monthlySavings = Number(profile.savings || profile.monthly_savings) || 0;
  const horizon = Number(profile.investmentHorizon || profile.investment_horizon || profile.horizon) || 10;
  const excluded = [];

  const eligible = instruments.filter(inv => {
    // Section 5: Tier ≤ 2 → HARD-EXCLUDE every HIGH-tier instrument
    if (reconciledTier !== null && reconciledTier <= 2 && instrumentRiskTier(inv) === 'High') {
      excluded.push({ instrument: inv.name || inv.id, reason: `HIGH-tier instrument hard-excluded for tier ${reconciledTier}` });
      return false;
    }

    const elig = inv.eligibility;
    if (!elig) return true; // No eligibility rules = universally eligible

    // Section 5: SCSS → reject unless age ≥ 60 (enforced via minAge in eligibility)
    if (elig.minAge && age < elig.minAge) {
      excluded.push({ instrument: inv.name || inv.id, reason: `Age ${age} below minimum ${elig.minAge}` });
      return false;
    }
    if (elig.maxAge !== null && elig.maxAge !== undefined && age > elig.maxAge) {
      excluded.push({ instrument: inv.name || inv.id, reason: `Age ${age} above maximum ${elig.maxAge}` });
      return false;
    }

    // Income gate
    if (elig.minAnnualIncome && annualIncome < elig.minAnnualIncome) return false;

    // Savings gate
    if (elig.minMonthlySavings && monthlySavings < elig.minMonthlySavings) return false;
    if (inv.dynamicData?.minMonthlyInvestment && monthlySavings < inv.dynamicData.minMonthlyInvestment) return false;

    // Section 5: Sukanya Samriddhi → reject unless user has a girl child
    if (elig.hasGirlChild && !profile.hasGirlChild && !profile.has_daughter_under_10) {
      excluded.push({ instrument: inv.name || inv.id, reason: 'Requires girl child (Sukanya Samriddhi eligibility)' });
      return false;
    }

    // Section 5: NPS → warn if investment_horizon < (60 − age)
    if (inv.id === 'nps' && horizon < (60 - age)) {
      excluded.push({
        instrument: inv.name || inv.id,
        reason: `NPS WARNING: horizon ${horizon}y < years to retirement ${60 - age}y. Funds locked until age 60.`,
        type: 'warning',
      });
    }

    // Risk alignment (uses reconciled tier when available, legacy fallback otherwise)
    if (reconciledTier === null) {
      const riskCat = (profile.riskCategory || profile.risk || '').toLowerCase();
      const invRisk = inv.dynamicData?.risk?.value || inv.riskLevel || inv.risk || 3;
      if ((riskCat === 'high' || riskCat === 'aggressive' || riskCat === 'very high') && invRisk <= 2) return false;
      if ((riskCat === 'conservative' || riskCat === 'low' || riskCat === 'very low') && invRisk >= 4) return false;
    }

    return true;
  });

  return { eligible, excluded };
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 2: SCORING — multi-factor weighted utility
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse profile into normalized scoring parameters.
 * Reuses backend's getTaxSlab for marginal rate computation.
 */
function parseProfile(profile, reconciledRiskStr = null) {
  const age = Number(profile.age) || 30;
  const income = Number(profile.monthly_income || profile.income) || 0;
  const annualIncome = Number(profile.annualIncome) || (income > 0 ? income * 12 : 600000);
  const savings = Number(profile.savings || profile.monthly_savings) || 10000;
  // Use reconciled risk tier if provided; no risk_appetite in fallback (Section 3 single source)
  const risk = (reconciledRiskStr || profile.riskCategory || profile.risk || 'Moderate').toLowerCase();
  const horizon = Number(profile.investmentHorizon || profile.investment_horizon || profile.horizon) || 10;
  const goals = Array.isArray(profile.investment_goals)
    ? profile.investment_goals
    : (profile.goal_type ? [profile.goal_type] : (profile.goals || []));
  const taxRegime = profile.taxRegime || profile.regime || 'new';

  const hasLumpSum = Boolean(profile.hasLumpSum);
  const lumpSumAmount = hasLumpSum ? (Number(profile.lumpSumAmount) || 0) : 0;
  const soldPropertyAmount = Number(profile.soldPropertyAmount) || 0;
  const totalCTC = Number(profile.totalCTC) || annualIncome;
  const basicComponent = Number(profile.basicComponent) || (totalCTC * 0.5);
  const monthlyTakeHome = Number(profile.monthlyTakeHome) || (annualIncome / 12);

  // Re-use backend tax slab calculator passing basicComponent for 80CCD(2) employer NPS accuracy
  const mr = getTaxSlab(annualIncome, taxRegime, { basicSalary: basicComponent });

  return {
    age, annualIncome, savings, risk, horizon, goals, taxRegime, mr,
    hasLumpSum, lumpSumAmount, soldPropertyAmount, totalCTC, basicComponent, monthlyTakeHome
  };
}

/**
 * Derive dynamic weights from user profile.
 * Mirrors the frontend's weight derivation logic.
 */
function deriveWeights(p) {
  const clamp = (v) => Math.max(PIPELINE_CONFIG.WEIGHT_FLOOR, Math.min(PIPELINE_CONFIG.WEIGHT_CEIL, v));

  // α — Return: long horizon + high risk + available lump sum → prioritize growth
  let alpha = 1.0;
  if (p.horizon >= 15) alpha += 0.5;
  if (p.horizon >= 20) alpha += 0.3;
  if (p.risk === 'aggressive' || p.risk === 'moderate-aggressive') alpha += 0.5;
  else if (p.risk === 'conservative') alpha -= 0.3;
  if (p.hasLumpSum && p.lumpSumAmount > 0) alpha += 0.3;

  // β — Risk: older age + low risk → penalize risky instruments
  let beta = 1.0;
  if (p.age >= 50) beta += 0.8;
  else if (p.age >= 40) beta += 0.4;
  if (p.risk === 'conservative') beta += 0.8;
  else if (p.risk === 'aggressive') beta -= 0.4;

  // γ — Tax: high slab → penalize slab-taxed instruments
  let gamma = p.mr > 0 ? (p.mr / 0.312) * 1.5 : 0;

  // δ — Liquidity: reduced liquidity stress if user has lump sum capital or property proceeds
  let delta = 0.8;
  const emergencyCover = p.annualIncome > 0 ? (p.savings * 12 / p.annualIncome) : 0;
  if (emergencyCover < 0.2) delta += 0.6;
  if (p.hasLumpSum && p.lumpSumAmount > 0) delta = Math.max(0.5, delta - 0.2);

  // ε — Goal alignment
  let epsilon = p.goals.length > 0 ? 1.2 : 0.5;

  // ζ — Horizon match
  let zeta = 1.0;
  if (p.horizon <= 3) zeta += 0.5;
  if (p.horizon >= 20) zeta += 0.3;

  // η — Cost
  let eta = 0.5;
  if (p.horizon >= 10) eta += 0.3;
  if (p.horizon >= 20) eta += 0.4;

  return {
    alpha: clamp(alpha), beta: clamp(beta), gamma: clamp(gamma),
    delta: clamp(delta), epsilon: clamp(epsilon), zeta: clamp(zeta), eta: clamp(eta),
  };
}

// ── Individual scoring sub-functions ────────────────────────────────

function scoreReturn(postTaxRate) {
  return postTaxRate * PIPELINE_CONFIG.RETURN_MULTIPLIER;
}

function scoreRisk(inv, p) {
  const invRisk = typeof inv.riskLevel === 'number' ? inv.riskLevel : (inv.risk || 3);
  let idealMin, idealMax;
  if (p.risk === 'conservative' || p.risk === 'conservative-moderate') { idealMin = 1; idealMax = 2; }
  else if (p.risk === 'aggressive' || p.risk === 'moderate-aggressive') { idealMin = 3; idealMax = 5; }
  else { idealMin = 2; idealMax = 4; }

  if (invRisk >= idealMin && invRisk <= idealMax) return -PIPELINE_CONFIG.RISK_PERFECT_BONUS;
  const dist = invRisk < idealMin ? (idealMin - invRisk) : (invRisk - idealMax);
  if (dist === 1) return -PIPELINE_CONFIG.RISK_CLOSE_BONUS + PIPELINE_CONFIG.RISK_MISMATCH_PENALTY;

  let penalty = PIPELINE_CONFIG.RISK_SEVERE_PENALTY;
  const vol = inv.volatility;
  if (vol !== undefined && vol !== null) {
    const volExcess = Math.max(0, vol - PIPELINE_CONFIG.VOLATILITY_BASELINE);
    if (p.risk === 'conservative') penalty += volExcess * 40;
  }
  return penalty;
}

function scoreTax(inv, p) {
  const taxEff = inv.taxEfficiencyScore;
  if (taxEff !== undefined && taxEff !== null) {
    return (5 - taxEff) * p.mr * PIPELINE_CONFIG.TAX_PENALTY_SCALE;
  }
  // Fallback: use taxType
  if (inv.taxType === 'eee') return -12;
  if (inv.taxType === 'slab') return p.mr * 20;
  return 0;
}

function scoreLiquidity(inv) {
  const liq = inv.liquidityScore;
  if (liq !== undefined && liq !== null) {
    return Math.max(0, (liq - PIPELINE_CONFIG.LIQUIDITY_CENTER) * PIPELINE_CONFIG.LIQUIDITY_SCALE);
  }
  if (inv.lockIn === 0) return 5;
  if (inv.lockIn <= 3) return 2;
  return 0;
}

function scoreGoal(inv, p) {
  const tags = inv.goalTags;
  if (tags && Array.isArray(tags) && tags.length > 0) {
    const matchCount = p.goals.filter(g => tags.includes(g)).length;
    return Math.min(matchCount * PIPELINE_CONFIG.GOAL_TAG_POINTS, PIPELINE_CONFIG.GOAL_TAG_CAP);
  }
  return 0;
}

function scoreHorizon(inv, p) {
  let score = 0;
  const lockIn = inv.lockIn || 0;
  if (lockIn <= p.horizon) score += PIPELINE_CONFIG.HORIZON_LOCK_FIT;
  if (lockIn === 0) score += PIPELINE_CONFIG.HORIZON_NO_LOCK;

  const ideal = inv.idealHorizon;
  if (ideal && ideal.min !== undefined && ideal.max !== undefined) {
    if (p.horizon >= ideal.min && p.horizon <= ideal.max) {
      score += PIPELINE_CONFIG.HORIZON_PERFECT;
    } else if (p.horizon >= ideal.min - 2 && p.horizon <= ideal.max + 5) {
      score += PIPELINE_CONFIG.HORIZON_GOOD;
    } else if (p.horizon >= ideal.min - 5) {
      score += PIPELINE_CONFIG.HORIZON_PARTIAL;
    }
    if (p.horizon < ideal.min - 5) {
      score -= PIPELINE_CONFIG.HORIZON_SEVERE_MISMATCH_PENALTY;
    }
  }
  return score;
}

function scoreCost(inv) {
  const er = inv.expenseRatio;
  if (er !== undefined && er !== null) {
    if (er === 0) return -PIPELINE_CONFIG.COST_FREE_BONUS;
    return er * PIPELINE_CONFIG.COST_PENALTY_SCALE;
  }
  return 0;
}

/**
 * Compute composite score for a single instrument.
 * @param {Object} inv - Instrument from catalog
 * @param {Object} p - Parsed profile
 * @param {Object} w - Derived weights
 * @param {Object} confScores - ML confidence scores keyed by backend type
 * @returns {Object} Instrument augmented with score and postTaxReturn
 */
function computeInstrumentScore(inv, p, w, confScores) {
  // Use backend's existing post-tax calculator via instrumentConstants
  const rate = inv.expectedReturn || inv.rate || 7.0;
  const backendType = resolveBackendType(inv);
  const postTax = calculatePostTaxReturnSafe(
    backendType, rate / 100,
    p.annualIncome,
    p.horizon,
    p.taxRegime
  );
  const postTaxRate = postTax.effectiveYield || rate;

  // Factor scores
  const returnScore = scoreReturn(postTaxRate);
  const riskPenalty = scoreRisk(inv, p);
  const taxPenalty = scoreTax(inv, p);
  const liquidityBonus = scoreLiquidity(inv);
  const goalBonus = scoreGoal(inv, p);
  const horizonMatch = scoreHorizon(inv, p);
  const costPenalty = scoreCost(inv);

  // Real Return / Inflation Drag Factor (Assumed 6% benchmark inflation)
  const realReturn = ((1 + postTaxRate / 100) / (1 + 0.06) - 1) * 100;
  const realYieldBonus = realReturn > 0 ? Math.min(8, realReturn * 1.5) : -Math.abs(realReturn * 2);

  // Weighted composite
  let score = 0;
  score += w.alpha * returnScore;
  score -= w.beta * riskPenalty;
  score -= w.gamma * taxPenalty;
  score += w.delta * liquidityBonus;
  score += w.epsilon * goalBonus;
  score += w.zeta * horizonMatch;
  score -= w.eta * costPenalty;
  score += realYieldBonus;

  // One-time lump sum suitability boost for instruments suited for lump-sum deployment
  if (p.hasLumpSum && p.lumpSumAmount > 0) {
    const LUMP_SUITABLE_TYPES = ['SGB', 'RBI_Bond', 'Gold', 'Index_MF', 'ELSS', 'Debt_MF', 'Equity_MF'];
    if (LUMP_SUITABLE_TYPES.includes(backendType)) {
      score += 8.0;
    }
  }

  // ML confidence boost: dynamically boost instruments whose backend type
  // was predicted with high confidence by the ML model
  const mlConf = confScores[backendType] || 0;
  score += mlConf * PIPELINE_CONFIG.ML_BOOST_WEIGHT;

  return {
    ...inv,
    score,
    postTaxReturn: postTaxRate,
    realReturn,
    backendType,
    nominalReturn: rate,
    effectiveYield: postTaxRate,
    taxNotes: postTax.notes,
    sharpeRatio: computeSharpe(postTaxRate, backendType),
  };
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 3: RANKING
// ═══════════════════════════════════════════════════════════════════

/**
 * Sort scored instruments descending by score.
 */
function rankInstruments(scoredInstruments) {
  return [...scoredInstruments].sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 4: DIVERSITY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Enforce that top-N picks span at least MIN_ASSET_CLASSES distinct
 * asset classes. If diversity is insufficient, swap lower-ranked picks
 * with the next-best instrument from an unrepresented class.
 */
function enforceDiversity(ranked, topN, minClasses) {
  const result = [];
  const usedClasses = new Set();
  const usedIds = new Set();

  // First pass: take top-N greedily
  for (const inv of ranked) {
    if (result.length >= topN) break;
    if (usedIds.has(inv.id)) continue;
    result.push(inv);
    usedIds.add(inv.id);
    usedClasses.add(inv.assetClass || inv.category || inv.type);
  }

  // Second pass: if we lack diversity, swap the lowest-scored pick
  // with the best available from a missing class
  if (usedClasses.size < minClasses && ranked.length > topN) {
    const remaining = ranked.filter(inv => !usedIds.has(inv.id));
    for (const candidate of remaining) {
      const cls = candidate.assetClass || candidate.category || candidate.type;
      if (!usedClasses.has(cls)) {
        // Replace the lowest-scored item in result
        const lowestIdx = result.length - 1;
        const removed = result[lowestIdx];
        usedClasses.delete(removed.assetClass || removed.category || removed.type);
        result[lowestIdx] = candidate;
        usedIds.delete(removed.id);
        usedIds.add(candidate.id);
        usedClasses.add(cls);
        if (usedClasses.size >= minClasses) break;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Map a catalog instrument to its backend core type key
 * (one of the 19 keys in instrumentConstants.js).
 * Used for tax computation and Monte Carlo parameter lookup.
 */
const CATALOG_TO_BACKEND = {
  ppf: 'PPF', scss: 'SCSS', sukanya: 'SSY',
  rbi_bonds: 'RBI_Bond', sgb: 'SGB', nps: 'NPS',
  fd: 'FD', liquid_mf: 'Liquid_MF', debt_mf: 'Debt_MF',
  hybrid_mf: 'Hybrid_MF', index_mf: 'Index_MF',
  elss: 'ELSS', equity_mf: 'Equity_MF', etf: 'ETF',
  gold_etf: 'Gold', nifty_etf: 'ETF',
  midcap_mf: 'Midcap_MF', smallcap_mf: 'Smallcap_MF',
  arbitrage_mf: 'Arbitrage_MF', direct_equity: 'Equity_MF',
};

// Extended mappings for instruments that share a core type
const CATEGORY_TO_BACKEND = {
  'Government': 'RBI_Bond',
  'Gold': 'Gold',
  'Retirement': 'NPS',
  'Bank Deposits': 'FD',
  'Debt Mutual Funds': 'Debt_MF',
  'Equity Mutual Funds': 'Equity_MF',
  'ETFs': 'ETF',
  'REITs & InvITs': 'ETF',
  'Bonds & Debentures': 'Debt_MF',
  'Insurance-linked': 'Debt_MF',
  'Direct Equity': 'Equity_MF',
};

function resolveBackendType(inv) {
  // Direct ID mapping takes priority
  if (inv.id && CATALOG_TO_BACKEND[inv.id]) return CATALOG_TO_BACKEND[inv.id];

  // For specific fund variants, match by common prefix
  const id = (inv.id || '').toLowerCase();
  if (id.includes('fd') || id.includes('fixed_deposit')) return 'FD';
  if (id.includes('elss')) return 'ELSS';
  if (id.includes('liquid')) return 'Liquid_MF';
  if (id.includes('debt') || id.includes('corporate_bond') || id.includes('short_duration')) return 'Debt_MF';
  if (id.includes('hybrid') || id.includes('balanced')) return 'Hybrid_MF';
  if (id.includes('index') || id.includes('nifty_index')) return 'Index_MF';
  if (id.includes('midcap')) return 'Midcap_MF';
  if (id.includes('smallcap')) return 'Smallcap_MF';
  if (id.includes('gold')) return 'Gold';
  if (id.includes('arbitrage')) return 'Arbitrage_MF';
  if (id.includes('etf')) return 'ETF';
  if (id.includes('equity') || id.includes('flexi') || id.includes('bluechip') || id.includes('largecap')) return 'Equity_MF';

  // Category fallback
  if (inv.category && CATEGORY_TO_BACKEND[inv.category]) return CATEGORY_TO_BACKEND[inv.category];

  return 'Debt_MF'; // Safe default
}

function computeSharpe(postTaxReturn, backendType) {
  const vol = INSTRUMENT_PARAMS[backendType]?.volatility || 0.10;
  const postTaxDecimal = (postTaxReturn || 0) / 100;
  return vol > 0.001 ? parseFloat(((postTaxDecimal - RISK_FREE_RATE) / vol).toFixed(2)) : 0;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API — Main Pipeline Entry Point
// ═══════════════════════════════════════════════════════════════════

/**
 * Run the full recommendation pipeline.
 *
 * @param {Object} profile - User's FinancialProfile document (lean)
 * @param {Object} mlResult - ML prediction result from mlClient.js
 * @param {Object} [options] - Optional overrides
 * @param {number} [options.topN=5] - Number of recommendations to return
 * @param {number} [options.minAssetClasses=3] - Minimum asset class diversity
 * @returns {Object} { instruments: Array, confidenceScores: Object }
 */
export function runPipeline(profile, mlResult, options = {}) {
  const topN = options.topN || PIPELINE_CONFIG.TOP_N;
  const minClasses = options.minAssetClasses || PIPELINE_CONFIG.MIN_ASSET_CLASSES;

  // Normalise ML confidence scores
  const confScores = normaliseConfidenceScores(mlResult.confidence_scores || {});

  // ── Risk Reconciliation (Section 3) ──────────────────────────────
  // reconcileRisk() is the authoritative source of the final risk tier.
  // Its output feeds filterEligible, parseProfile/deriveWeights/scoreRisk.
  const riskResult = reconcileRisk(profile);

  // Stage 1: Eligibility (Section 5 gates, using reconciled tier)
  const { eligible, excluded } = filterEligible(investmentDatabase, profile, riskResult.final_score);

  // Stage 2: Scoring (using reconciled risk tier string)
  const p = parseProfile(profile, riskResult.final_risk_tier);
  const w = deriveWeights(p);
  const scored = eligible.map(inv => computeInstrumentScore(inv, p, w, confScores));

  // Stage 3: Ranking
  const ranked = rankInstruments(scored);

  // Stage 4: Diversity
  const topPicks = enforceDiversity(ranked, topN, minClasses);

  // Stage 5: Enforce Section 6 allocation targets by reconciled tier
  enforceAllocationTargets(topPicks, riskResult.final_score, profile);

  // Map to output format (allocationWeight set by enforceAllocationTargets)
  const instruments = topPicks.map(inv => ({
    name: inv.name,
    type: inv.backendType,
    instrumentId: inv.id,
    nominalReturn: inv.nominalReturn,
    postTaxReturn: inv.postTaxReturn,
    effectiveYield: inv.effectiveYield,
    taxNotes: inv.taxNotes,
    sharpeRatio: inv.sharpeRatio,
    expenseRatio: inv.expenseRatio || 0,
    riskLevel: INSTRUMENT_PARAMS[inv.backendType]?.riskLevel || inv.riskLabel || 'Medium',
    lockIn: inv.lockIn || 0,
    tags: INSTRUMENT_PARAMS[inv.backendType]?.tags || [],
    allocationWeight: inv.allocationWeight,
    allocation_pct: inv.allocation_pct || 0,
    tier: inv.tier || 'Medium',
    score: parseFloat(inv.score.toFixed(2)),
  }));

  // Fix rounding: ensure weights sum to exactly 1.0
  const totalWeight = instruments.reduce((s, i) => s + i.allocationWeight, 0);
  if (totalWeight > 0 && instruments.length > 0) {
    instruments.forEach(i => { i.allocationWeight = parseFloat((i.allocationWeight / totalWeight).toFixed(4)); });
    const roundedSum = instruments.reduce((s, i) => s + i.allocationWeight, 0);
    const residual = parseFloat((1.0 - roundedSum).toFixed(4));
    if (residual !== 0) {
      const maxIdx = instruments.reduce((mi, w, i, arr) => w.allocationWeight > arr[mi].allocationWeight ? i : mi, 0);
      instruments[maxIdx].allocationWeight = parseFloat((instruments[maxIdx].allocationWeight + residual).toFixed(4));
    }
  }

  // Section 7 metadata (response-only, not persisted — see Recommendation.create() comment in routes/recommend.js)
  const riskReconciliation = {
    final_risk_tier: riskResult.final_risk_tier,
    capacity_score: riskResult.capacity_score,
    preference_score: riskResult.preference_score,
    reconciliation_note: riskResult.reconciliation_note,
    advisory_note: riskResult.advisory_note,
    excluded_due_to_eligibility: excluded,
    capacity_missing: riskResult.capacity_missing,
    preference_missing: riskResult.preference_missing,
  };

  return { instruments, confidenceScores: confScores, riskReconciliation };
}

// ── Confidence score normalisation (reused from recommend.js) ────

const INSTRUMENT_KEY_MAP = {
  'Public_Provident_Fund': 'PPF',
  'Bank_FD':               'FD',
  'National_Pension':      'NPS',
  'RBI_Bond':              'RBI_Bond',
  'Sovereign_Gold_Bond':   'SGB',
  'Gold_ETF':              'Gold',
  'Nifty_Index':           'Index_MF',
  'Balanced_Advantage':    'Hybrid_MF',
};

function normaliseConfidenceScores(rawScores) {
  if (!rawScores || typeof rawScores !== 'object') return {};
  const normalised = {};
  for (const [key, value] of Object.entries(rawScores)) {
    if (typeof value !== 'number' || !isFinite(value)) continue;
    const mappedKey = INSTRUMENT_KEY_MAP[key] || key;
    normalised[mappedKey] = value;
  }
  return normalised;
}

// ── Backend Where To Invest (WTI) Dynamic Ranking Engine ───────────
import { getRegimeTilts } from './regimeRotationEngine.js';

export function rankWhereToInvestBackend(candidates = [], profile = {}, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const { regimeApplied = false, regimeKey = 'geopolitical_conflict', sortBy = 'score' } = options;

  const age = Number(profile.age || 35);
  const annualIncome = Number(profile.annualIncome || profile.annual_income || 1000000);
  const taxRegime = profile.taxRegime || 'new';
  const riskCat = (profile.riskCategory || profile.risk_tolerance || 'Moderate').toLowerCase();
  const horizon = Number(profile.investmentHorizon || profile.investment_horizon || 5);

  // 1. Compute marginal tax rate using backend taxEngine
  const marginalRate = getTaxSlab(annualIncome, taxRegime);

  // 2. Fetch macro regime tilts if regime simulation is requested
  const regimeTilts = regimeApplied ? getRegimeTilts(regimeKey) : {};

  // Risk mapping 1-9
  const RISK_MAP = {
    'very low': 1, 'conservative': 2, 'low': 2,
    'low-medium': 3, 'moderate': 5, 'medium': 5,
    'moderately high': 6, 'high': 7, 'aggressive': 8, 'very high': 9
  };
  const userRiskNum = RISK_MAP[riskCat] || 5;

  const scored = candidates.map(item => {
    let score = 50;
    const nameLower = (item.name || '').toLowerCase();
    const highlightLower = (item.highlight || '').toLowerCase();
    const badge = item.badge || '';

    // Extract return rate
    const rateMatch = String(item.rate || '').match(/(\d+\.?\d*)/);
    const nominalRate = rateMatch ? parseFloat(rateMatch[1]) : 0;

    // Infer risk score
    let productRisk = 5;
    if (nameLower.includes('t-bill') || nameLower.includes('overnight') || badge === '100% Sovereign') productRisk = 1;
    else if (nameLower.includes('ppf') || nameLower.includes('scss') || nameLower.includes('rbi') || nameLower.includes('gilt') || badge.includes('Sovereign') || nameLower.includes('fd') || nameLower.includes('liquid')) productRisk = 2;
    else if (nameLower.includes('bond') || nameLower.includes('debt') || nameLower.includes('reit') || nameLower.includes('invit')) productRisk = 3;
    else if (nameLower.includes('balanced') || nameLower.includes('nps') || nameLower.includes('elss')) productRisk = 4;
    else if (nameLower.includes('nifty 50') || nameLower.includes('index') || nameLower.includes('bluechip') || nameLower.includes('large cap')) productRisk = 5;
    else if (nameLower.includes('flexi') || nameLower.includes('multi cap') || nameLower.includes('value') || nameLower.includes('contra')) productRisk = 6;
    else if (nameLower.includes('mid cap') || nameLower.includes('sector') || nameLower.includes('pharma') || nameLower.includes('defence') || nameLower.includes('banking') || nameLower.includes('it ')) productRisk = 7;
    else if (nameLower.includes('small cap') || nameLower.includes('quant') || highlightLower.includes('momentum')) productRisk = 8;

    // Risk delta penalty/bonus
    const riskDelta = Math.abs(productRisk - userRiskNum);
    if (riskDelta === 0) score += 25;
    else if (riskDelta === 1) score += 18;
    else if (riskDelta === 2) score += 10;
    else if (riskDelta >= 4) score -= 20;

    // Age / Senior Citizen check
    const isSenior = age >= 60;
    if (isSenior) {
      if (nameLower.includes('scss') || nameLower.includes('senior') || nameLower.includes('rbi')) score += 30;
      if (productRisk >= 7) score -= 25;
    } else if (age <= 30 && nominalRate > 15) {
      score += 10;
    }

    // Backend post-tax yield calculation
    const isEEE = badge.includes('EEE') || badge.includes('54EC') || badge.includes('100% Tax-Free') || nameLower.includes('ppf') || nameLower.includes('sukanya');
    const isSlabTaxed = highlightLower.includes('slab rate') || nameLower.includes('fd') || nameLower.includes('scss') || nameLower.includes('rbi');
    
    let taxEffectRate = 0.125;
    if (isEEE) taxEffectRate = 0;
    else if (isSlabTaxed) taxEffectRate = marginalRate;

    const postTaxYieldVal = nominalRate > 0 ? nominalRate * (1 - taxEffectRate) : 0;
    const postTaxYieldStr = postTaxYieldVal > 0 ? `~${postTaxYieldVal.toFixed(1)}% (Post-Tax)` : item.rate;

    if (postTaxYieldVal > 0) score += Math.min(15, postTaxYieldVal * 0.6);

    // Apply macro regime tilts from regimeRotationEngine
    let regimeBoostTag = null;
    if (regimeApplied && regimeTilts) {
      for (const [tiltKey, tiltInfo] of Object.entries(regimeTilts)) {
        if (nameLower.includes(tiltKey) || highlightLower.includes(tiltKey) || (tiltKey === 'defence' && nameLower.includes('defence')) || (tiltKey === 'gold' && (nameLower.includes('gold') || nameLower.includes('sgb')))) {
          score += (tiltInfo.weightDelta || 0.15) * 100;
          regimeBoostTag = `⚡ ${tiltInfo.label || 'Macro Regime Tilt'}`;
          break;
        }
      }
    }

    // Tax savings note
    let taxSavingsNote = null;
    const effTaxWithCess = marginalRate * 1.04;
    if (nameLower.includes('ppf') || nameLower.includes('elss') || highlightLower.includes('80c')) {
      const max80cSavings = Math.round(150000 * effTaxWithCess);
      if (max80cSavings > 0) taxSavingsNote = `Saves up to ₹${max80cSavings.toLocaleString('en-IN')} tax/yr under Sec 80C`;
    } else if (nameLower.includes('nps') || highlightLower.includes('80ccd')) {
      const npsExtraSavings = Math.round(50000 * effTaxWithCess);
      if (npsExtraSavings > 0) taxSavingsNote = `Saves up to ₹${npsExtraSavings.toLocaleString('en-IN')} extra tax/yr under Sec 80CCD(1B)`;
    }

    // Execution route
    let investmentRoute = 'SIP Recommended';
    if (productRisk <= 3 || nameLower.includes('liquid') || nameLower.includes('fd') || nameLower.includes('sgb') || badge.includes('54EC')) {
      investmentRoute = 'Lump-Sum Suitable';
    } else if (productRisk >= 7) {
      investmentRoute = 'Strict SIP Route';
    }

    // Profile match tag
    let matchTag = regimeBoostTag;
    if (!matchTag) {
      if (isSenior && (nameLower.includes('scss') || nameLower.includes('senior') || nameLower.includes('rbi'))) matchTag = 'Senior Citizen Fit';
      else if (marginalRate >= 0.30 && isEEE) matchTag = 'High Tax Efficiency';
      else if (horizon <= 2 && productRisk <= 2) matchTag = 'Short-Term Parking';
      else if (horizon >= 7 && nominalRate > 12) matchTag = 'Long-Term Compounder';
      else if (score >= 90) matchTag = 'Top Profile Match';
    }

    return {
      ...item,
      _score: score,
      postTaxYieldVal,
      postTaxYieldStr,
      profileMatchTag: matchTag,
      taxSavingsNote,
      investmentRoute
    };
  });

  if (sortBy === 'postTaxYield') {
    scored.sort((a, b) => b.postTaxYieldVal - a.postTaxYieldVal || b._score - a._score);
  } else if (sortBy === 'expense') {
    scored.sort((a, b) => (a.expRatioVal || 99) - (b.expRatioVal || 99) || b._score - a._score);
  } else {
    scored.sort((a, b) => b._score - a._score);
  }

  return scored.slice(0, 5);
}

// ── Exports for testing ─────────────────────────────────────────
export {
  PIPELINE_CONFIG,
  resolveBackendType,
  deriveWeights,
  parseProfile,
  enforceDiversity,
  computeInstrumentScore,
  scoreReturn,
  scoreRisk,
  scoreTax,
  scoreLiquidity,
  scoreCost,
  scoreGoal,
  scoreHorizon,
  rankInstruments,
  normaliseConfidenceScores,
  INSTRUMENT_KEY_MAP,
  enforceAllocationTargets,
};


