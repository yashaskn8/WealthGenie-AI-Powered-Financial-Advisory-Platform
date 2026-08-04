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
// STAGE 1: ELIGIBILITY FILTERING
// ═══════════════════════════════════════════════════════════════════

/**
 * Filter instruments the user is eligible to hold based on metadata.
 * @param {Array} instruments - Full instrument catalog
 * @param {Object} profile - User's financial profile
 * @returns {Array} Eligible instruments
 */
export function filterEligible(instruments, profile) {
  const age = Number(profile.age) || 30;
  const annualIncome = Number(profile.annualIncome) || 0;
  const monthlySavings = Number(profile.savings) || 0;

  return instruments.filter(inv => {
    const elig = inv.eligibility;
    if (!elig) return true; // No eligibility rules = universally eligible

    // Age gate
    if (elig.minAge && age < elig.minAge) return false;
    if (elig.maxAge && age > elig.maxAge) return false;

    // Income gate
    if (elig.minAnnualIncome && annualIncome < elig.minAnnualIncome) return false;

    // Savings gate
    if (elig.minMonthlySavings && monthlySavings < elig.minMonthlySavings) return false;

    // Special: girl child requirement (skip if user doesn't have one)
    if (elig.hasGirlChild && !profile.hasGirlChild) return false;

    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 2: SCORING — multi-factor weighted utility
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse profile into normalized scoring parameters.
 * Reuses backend's getTaxSlab for marginal rate computation.
 */
function parseProfile(profile) {
  const age = Number(profile.age) || 30;
  const annualIncome = Number(profile.annualIncome) || 600000;
  const savings = Number(profile.savings) || 10000;
  const risk = (profile.riskCategory || 'Moderate').toLowerCase();
  const horizon = Number(profile.investmentHorizon) || 10;
  const goals = profile.goal_type ? [profile.goal_type] : [];
  const taxRegime = profile.taxRegime || 'new';

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

  // Weighted composite
  let score = 0;
  score += w.alpha * returnScore;
  score -= w.beta * riskPenalty;
  score -= w.gamma * taxPenalty;
  score += w.delta * liquidityBonus;
  score += w.epsilon * goalBonus;
  score += w.zeta * horizonMatch;
  score -= w.eta * costPenalty;

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

  // Stage 1: Eligibility
  const eligible = filterEligible(investmentDatabase, profile);

  // Stage 2: Scoring
  const p = parseProfile(profile);
  const w = deriveWeights(p);
  const scored = eligible.map(inv => computeInstrumentScore(inv, p, w, confScores));

  // Stage 3: Ranking
  const ranked = rankInstruments(scored);

  // Stage 4: Diversity
  const topPicks = enforceDiversity(ranked, topN, minClasses);

  // Compute allocation weights from scores (normalized to sum to 1.0)
  const totalScore = topPicks.reduce((s, inv) => s + Math.max(0, inv.score), 0);
  const instruments = topPicks.map(inv => {
    const rawWeight = totalScore > 0 ? Math.max(0, inv.score) / totalScore : 1 / topPicks.length;
    return {
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
      allocationWeight: parseFloat(rawWeight.toFixed(4)),
      score: parseFloat(inv.score.toFixed(2)),
    };
  });

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

  return { instruments, confidenceScores: confScores };
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
};


