/**
 * WealthGenie — Enhanced Multi-Attribute Scoring Engine
 * ─────────────────────────────────────────────────────
 * Phase 2 upgrade: configurable 7-factor weighted utility function
 * with dynamic weights derived from user profile.
 *
 * EXPORTS (backward-compatible):
 *   computeScore(inv, profile)              → { ...inv, score, postTaxRate }
 *   enforceConcentrationLimits(rankedInvs)  → rankedInvs[]
 *   getWhy(inv, profile)                    → string[]
 *
 * INTERNAL (not exported):
 *   deriveWeights(profile)      – profile → { α, β, γ, δ, ε, ζ, η }
 *   computeReturnScore(...)     – post-tax return benefit
 *   computeRiskPenalty(...)     – risk mismatch penalty
 *   computeTaxPenalty(...)      – slab-taxed instrument penalty
 *   computeLiquidityBonus(...)  – liquidity benefit
 *   computeGoalBonus(...)      – goal alignment bonus
 *   computeHorizonMatch(...)   – ideal horizon fit
 *   computeCostPenalty(...)     – expense ratio drag
 *
 * Data Sources (Phase 1 metadata):
 *   RBI – Government Schemes | AMFI – Mutual Fund Categories
 *   NSE/BSE – ETFs | SEBI – Investment classifications
 *   Historical 5Y/10Y category averages (mid-2026)
 *   Note: Representative category averages, not live market values.
 */
import { TAX_INFO, CONCENTRATION_CAPS } from '../investmentDatabase.js';
import { getMarginalRate, computePostTaxReturn } from './taxComputation.js';

// ═══════════════════════════════════════════════════════════════════
// SCORING CONSTANTS — centralized, no magic numbers
// ═══════════════════════════════════════════════════════════════════
const SCORING = Object.freeze({
  // Base weight ranges for dynamic derivation
  WEIGHT_FLOOR: 0.5,
  WEIGHT_CEIL: 3.0,

  // Return score scaling
  RETURN_MULTIPLIER: 3.5,
  RETURN_CAP_COMMODITY: 30,     // cap return-points for gold-class instruments

  // Risk alignment
  RISK_PERFECT_MATCH: 20,       // bonus when risk aligns perfectly
  RISK_CLOSE_MATCH: 12,         // bonus when risk is close
  RISK_MISMATCH_PENALTY: -10,   // penalty for minor mismatch
  RISK_SEVERE_MISMATCH: -18,    // penalty for severe mismatch

  // Volatility scaling
  VOLATILITY_BASELINE: 0.15,    // benchmark annual volatility

  // Tax efficiency thresholds
  TAX_EFFICIENCY_HIGH: 4,       // score >= 4 out of 5 is considered high
  TAX_EEE_BONUS: 12,
  TAX_ELSS_GOAL_BONUS: 10,
  TAX_NPS_BONUS: 8,
  TAX_SGB_BONUS: 6,

  // Liquidity
  LIQUIDITY_HIGH_THRESHOLD: 4,  // liquidityScore >= 4 = high
  LIQUIDITY_EMERGENCY_WEIGHT: 2.0,

  // Goal alignment
  GOAL_TAG_MATCH_POINTS: 5,     // per matching goalTag
  GOAL_TAG_MAX_BONUS: 15,       // cap on total goal tag bonus

  // Horizon match
  HORIZON_PERFECT_MATCH: 15,
  HORIZON_GOOD_MATCH: 10,
  HORIZON_PARTIAL_MATCH: 5,
  HORIZON_LOCK_IN_FIT: 15,
  HORIZON_NO_LOCK_IN: 5,

  // Cost
  COST_FREE_BONUS: 3,           // bonus for zero expense ratio
  COST_PENALTY_SCALE: 100,      // multiplier for expense ratio penalty

  // Instrument-specific bonuses (preserved from v1 for backward compatibility)
  SCSS_SENIOR_BONUS: 15,
  SUKANYA_BONUS: 12,
  NPS_LONG_HORIZON_BONUS: 8,
  NPS_LONG_HORIZON_MIN: 15,
});

// ═══════════════════════════════════════════════════════════════════
// PROFILE PARSING — DRY helper used by both computeScore and getWhy
// ═══════════════════════════════════════════════════════════════════
function parseProfile(profile) {
  const income = Number(profile.monthly_income || profile.income) || 0;
  const savings = Number(profile.monthly_savings || profile.savings) || 0;
  const risk = (profile.riskCategory || profile.risk_tolerance || 'Moderate').toLowerCase();
  const horizon = Number(profile.investment_horizon || profile.horizon) || 10;
  const age = Number(profile.age) || 30;
  const goals = profile.investment_goals || [];
  const annualIncome = income * 12;
  const annualSavings = savings * 12;
  const taxRegime = profile.taxRegime || 'new';
  const mr = getMarginalRate(annualIncome, taxRegime);

  return { income, savings, risk, horizon, age, goals, annualIncome, annualSavings, taxRegime, mr };
}

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC WEIGHT DERIVATION — weights shaped by user profile
// ═══════════════════════════════════════════════════════════════════
function deriveWeights(p) {
  const { risk, horizon, age, mr, goals, savings, income } = p;

  // α — Return Weight: long horizon + high risk → prioritize growth
  let alpha = 1.0;
  if (horizon >= 15) alpha += 0.5;
  if (horizon >= 20) alpha += 0.3;
  if (risk === 'high') alpha += 0.5;
  else if (risk === 'low') alpha -= 0.3;

  // β — Risk Penalty Weight: older, more dependents, low risk → penalize risky instruments
  let beta = 1.0;
  if (age >= 50) beta += 0.8;
  else if (age >= 40) beta += 0.4;
  if (risk === 'low') beta += 0.8;
  else if (risk === 'high') beta -= 0.4;

  // γ — Tax Penalty Weight: high slab → heavily penalize slab-taxed instruments
  let gamma = mr > 0 ? (mr / 0.312) * 1.5 : 0; // normalize against max marginal rate

  // δ — Liquidity Bonus Weight: low emergency savings → boost liquid instruments
  let delta = 0.8;
  const emergencyCover = income > 0 ? (savings / income) : 0;
  if (emergencyCover < 0.2) delta += 0.6;  // very low savings ratio
  if (goals.includes('Emergency Fund')) delta += 1.0;

  // ε — Goal Bonus Weight: stronger when user has explicit goals
  let epsilon = goals.length > 0 ? 1.2 : 0.5;
  if (goals.includes('Tax Saving') && mr > 0.1) epsilon += 0.5;

  // ζ — Horizon Match Weight: always important
  let zeta = 1.0;
  if (horizon <= 3) zeta += 0.5;  // short horizon = more strict on fit
  if (horizon >= 20) zeta += 0.3;

  // η — Cost Penalty Weight: grows with horizon (compounding effect)
  let eta = 0.5;
  if (horizon >= 10) eta += 0.3;
  if (horizon >= 20) eta += 0.4;

  // Clamp all weights
  const clamp = (v) => Math.max(SCORING.WEIGHT_FLOOR, Math.min(SCORING.WEIGHT_CEIL, v));
  return {
    alpha: clamp(alpha),
    beta: clamp(beta),
    gamma: clamp(gamma),
    delta: clamp(delta),
    epsilon: clamp(epsilon),
    zeta: clamp(zeta),
    eta: clamp(eta),
  };
}

// ═══════════════════════════════════════════════════════════════════
// SCORING SUB-FUNCTIONS — each factor is isolated for testability
// ═══════════════════════════════════════════════════════════════════

/** Return benefit: higher post-tax return → higher score */
function computeReturnScore(postTaxRate, inv) {
  let points = postTaxRate * SCORING.RETURN_MULTIPLIER;
  // Cap commodity/gold instruments to prevent gold-price spikes from dominating
  if (inv.assetClass === 'Gold') {
    points = Math.min(points, SCORING.RETURN_CAP_COMMODITY);
  }
  return points;
}

/** Risk penalty: mismatch between user risk appetite and instrument risk level */
function computeRiskPenalty(inv, p) {
  const invRisk = inv.riskLevel || inv.risk || 3;
  const vol = inv.volatility;

  // Map user risk appetite to an ideal risk range
  let idealMin, idealMax;
  if (p.risk === 'low') { idealMin = 1; idealMax = 2; }
  else if (p.risk === 'high') { idealMin = 3; idealMax = 5; }
  else { idealMin = 2; idealMax = 4; } // medium

  if (invRisk >= idealMin && invRisk <= idealMax) {
    // Perfect alignment — give a bonus (negative penalty)
    return -SCORING.RISK_PERFECT_MATCH;
  }

  // Close match (off by 1)
  const dist = invRisk < idealMin ? (idealMin - invRisk) : (invRisk - idealMax);
  if (dist === 1) {
    return -SCORING.RISK_CLOSE_MATCH + Math.abs(SCORING.RISK_MISMATCH_PENALTY);
  }

  // Severe mismatch
  let penalty = Math.abs(SCORING.RISK_SEVERE_MISMATCH);

  // Extra volatility-based penalty when available
  if (vol !== undefined && vol !== null) {
    const volExcess = Math.max(0, vol - SCORING.VOLATILITY_BASELINE);
    if (p.risk === 'low') penalty += volExcess * 40;
  }

  return penalty;
}

/** Tax penalty: penalize slab-taxed instruments for high-slab users */
function computeTaxPenalty(inv, p) {
  const taxEfficiency = inv.taxEfficiencyScore;

  // New metadata available — use it
  if (taxEfficiency !== undefined && taxEfficiency !== null) {
    // taxEfficiencyScore: 5=best (EEE), 1=worst (full slab)
    // Invert: penalty = (5 - score) * marginal_rate_factor
    return (5 - taxEfficiency) * p.mr * 8;
  }

  // Fallback to legacy tax type bonuses (backward compatibility)
  let bonus = 0;
  if (inv.taxType === 'eee') bonus = -SCORING.TAX_EEE_BONUS;
  else if (inv.taxType === 'elss') bonus = -SCORING.TAX_ELSS_GOAL_BONUS * (p.goals.includes('Tax Saving') ? 1 : 0.3);
  else if (inv.taxType === 'nps') bonus = -SCORING.TAX_NPS_BONUS;
  else if (inv.taxType === 'sgb') bonus = -SCORING.TAX_SGB_BONUS;
  else if (inv.taxType === 'slab') bonus = p.mr * 20; // penalty for slab-taxed

  return -bonus; // return as penalty (positive = bad)
}

/** Liquidity bonus: high liquidity instruments get a boost */
function computeLiquidityBonus(inv, p) {
  const liq = inv.liquidityScore;

  if (liq !== undefined && liq !== null) {
    // Scale: 5=instant, 1=locked
    let bonus = (liq - 3) * 4; // centered on 3
    // Extra bonus if user needs emergency fund access
    if (p.goals.includes('Emergency Fund') && liq >= SCORING.LIQUIDITY_HIGH_THRESHOLD) {
      bonus += 8;
    }
    return Math.max(0, bonus);
  }

  // Fallback: use lock-in as proxy
  if (inv.lockIn === 0) return 5;
  if (inv.lockIn <= 3) return 2;
  return 0;
}

/** Goal bonus: match instrument goalTags against user's stated goals */
function computeGoalBonus(inv, p) {
  const goalTags = inv.goalTags;

  if (goalTags && Array.isArray(goalTags) && goalTags.length > 0) {
    const matchCount = p.goals.filter(g => goalTags.includes(g)).length;
    return Math.min(matchCount * SCORING.GOAL_TAG_MATCH_POINTS, SCORING.GOAL_TAG_MAX_BONUS);
  }

  // Fallback: legacy goal matching logic
  let bonus = 0;
  if (p.goals.includes('Tax Saving') && ['eee', 'elss', 'nps'].includes(inv.taxType)) bonus += 8;
  if (p.goals.includes('Retirement') && ['nps', 'ppf', 'scss'].includes(inv.id)) bonus += 10;
  if (p.goals.includes('Wealth Growth') && (inv.risk || inv.riskLevel || 3) >= 3) bonus += 5;
  return bonus;
}

/** Horizon match: how well does the instrument's ideal horizon fit the user's? */
function computeHorizonMatch(inv, p) {
  const effectiveLockIn = (inv.maturity_type === 'age_based' && inv.maturity_age)
    ? Math.max(0, inv.maturity_age - p.age)
    : inv.lockIn;

  let score = 0;

  // Lock-in fits within user's horizon
  if (effectiveLockIn <= p.horizon) score += SCORING.HORIZON_LOCK_IN_FIT;
  if (effectiveLockIn === 0) score += SCORING.HORIZON_NO_LOCK_IN;

  // New metadata: idealHorizon range matching
  const ideal = inv.idealHorizon;
  if (ideal && ideal.min !== undefined && ideal.max !== undefined) {
    if (p.horizon >= ideal.min && p.horizon <= ideal.max) {
      score += SCORING.HORIZON_PERFECT_MATCH;
    } else if (p.horizon >= ideal.min - 2 && p.horizon <= ideal.max + 5) {
      score += SCORING.HORIZON_GOOD_MATCH;
    } else if (p.horizon >= ideal.min - 5) {
      score += SCORING.HORIZON_PARTIAL_MATCH;
    }
    // Explicit penalty for severe mismatch (e.g., 2-year horizon on 15-year instrument)
    if (p.horizon < ideal.min - 5) {
      score -= 10;
    }
  }

  return score;
}

/** Cost penalty: higher expense ratio → larger drag over long horizons */
function computeCostPenalty(inv) {
  const er = inv.expenseRatio;

  if (er !== undefined && er !== null) {
    if (er === 0) return -SCORING.COST_FREE_BONUS; // bonus for no cost
    return er * SCORING.COST_PENALTY_SCALE;
  }

  return 0; // no data → no penalty
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SCORING FUNCTION — backward-compatible signature
// ═══════════════════════════════════════════════════════════════════
export function computeScore(inv, profile) {
  const p = parseProfile(profile);
  const w = deriveWeights(p);

  // Reuse existing tax computation
  const { postTaxRate } = computePostTaxReturn(inv, p.annualSavings, p.annualIncome, profile);

  // Compute each factor
  const returnScore     = computeReturnScore(postTaxRate, inv);
  const riskPenalty      = computeRiskPenalty(inv, p);
  const taxPenalty       = computeTaxPenalty(inv, p);
  const liquidityBonus   = computeLiquidityBonus(inv, p);
  const goalBonus        = computeGoalBonus(inv, p);
  const horizonMatch     = computeHorizonMatch(inv, p);
  const costPenalty      = computeCostPenalty(inv);

  // Risk-Adjusted Sharpe Ratio Bonus & Real Yield Factor
  const vol = inv.volatility || (inv.riskLevel >= 4 ? 0.18 : inv.riskLevel >= 3 ? 0.10 : 0.04);
  const rfRate = 6.5; // 6.5% risk-free baseline (RBI Repo / T-Bill)
  const sharpeEst = vol > 0.01 ? (postTaxRate - rfRate) / (vol * 100) : 0;
  const sharpeBonus = sharpeEst > 0 ? Math.min(10, sharpeEst * 5) : 0;

  // Real Return / Inflation Drag Factor (Assumed 6% benchmark inflation)
  const realReturn = ((1 + postTaxRate / 100) / (1 + 0.06) - 1) * 100;
  const realYieldBonus = realReturn > 0 ? Math.min(8, realReturn * 1.5) : -Math.abs(realReturn * 2);

  // Weighted utility score
  let score = 0;
  score += w.alpha   * returnScore;
  score -= w.beta    * riskPenalty;
  score -= w.gamma   * taxPenalty;
  score += w.delta   * liquidityBonus;
  score += w.epsilon * goalBonus;
  score += w.zeta    * horizonMatch;
  score -= w.eta     * costPenalty;
  score += sharpeBonus;
  score += realYieldBonus;

  // Instrument-specific bonuses — preserved for backward compatibility with
  // instruments that have unique policy characteristics not captured by metadata
  if (inv.id === 'scss') score += SCORING.SCSS_SENIOR_BONUS;
  if (inv.id === 'sukanya') score += SCORING.SUKANYA_BONUS;
  if (inv.id === 'nps' && p.horizon >= SCORING.NPS_LONG_HORIZON_MIN) {
    score += SCORING.NPS_LONG_HORIZON_BONUS;
  }

  return { ...inv, score, postTaxRate, sharpeEst, realReturn };
}

// ═══════════════════════════════════════════════════════════════════
// CONCENTRATION GUARD — unchanged from v1
// ═══════════════════════════════════════════════════════════════════
export function enforceConcentrationLimits(rankedInvestments) {
  return rankedInvestments.map((inv) => {
    const cap = CONCENTRATION_CAPS[inv.id];
    if (cap) {
      return { ...inv, concentrationBadge: cap.badge, maxPct: cap.maxPct };
    }
    return inv;
  });
}

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC getWhy — metadata-driven explanation generation
// ═══════════════════════════════════════════════════════════════════

// Premium curated explanations for high-value instruments.
// These are kept because they contain nuanced, profile-aware language
// that generic templates cannot match.
const CURATED_REASONS = {
  ppf: (inv, p) => [
    `Tax-free growth under the EEE framework means zero tax at every stage — contribution, accumulation, and withdrawal. At your marginal rate of ${fmtPct(p.mr)}, the effective yield is equivalent to a ${p.mr > 0 ? (inv.rate / (1 - p.mr)).toFixed(1) : inv.rate.toFixed(1)}% taxable instrument.`,
    `The 15-year horizon aligns with long-term wealth building and the sovereign guarantee eliminates default risk.`,
    `PPF is universally recommended as a foundation for any Indian investor's portfolio.`,
  ],
  scss: (inv, p) => [
    `At age ${p.age}, SCSS is the most efficient guaranteed-income instrument available to you — ${inv.rate}% with quarterly payouts and sovereign backing.`,
    `No other government scheme offers this rate with a 5-year lock-in for your age group.`,
    `TDS applies if annual interest exceeds ₹50,000. This should be one of your top-3 instruments.`,
  ],
  liquid_mf: (inv, p) => [
    `Liquid Mutual Funds offer high safety and near-instant liquidity (T+1 redemption, with up to ₹50,000 instant withdrawal), making them the perfect core holding for emergency reserves.`,
    `They invest in extremely short-term debt papers (maturity ≤ 91 days) with sovereign or AAA rating, minimizing both credit and interest rate risk.`,
    `Gains are taxed at your income slab rate of ${fmtPct(p.mr)}, but the post-tax yield remains superior to a standard bank savings account.`,
  ],
  sukanya: (inv, p) => [
    `SSY offers the highest guaranteed EEE return at ${inv.rate}% p.a. — better than PPF and entirely tax-free.`,
    `If you have a daughter under 10, this is the single most efficient government scheme available for her education or marriage.`,
    `The 21-year lock-in matches the long-term nature of the goal.`,
  ],
  rbi_bonds: (inv, p) => [
    `RBI Sovereign Bonds offer ${inv.rate}% with zero credit risk — the highest available safe nominal rate.`,
    `With your savings of ₹${p.savings.toLocaleString('en-IN')}/month, the 7-year lock-in is manageable within your ${p.horizon}-year horizon.`,
    `Interest is taxable at your ${fmtPct(p.mr)} slab rate, but the pre-tax yield still exceeds most alternatives.`,
  ],
  sgb: (inv, p) => [
    `Sovereign Gold Bonds are the most tax-efficient gold instrument available. Capital gains at 8-year maturity are completely exempt under Section 47(viic), and you additionally earn 2.5% annual interest on the face value.`,
    `This makes the effective post-tax return significantly better than Gold ETF for long-horizon investors.`,
    `The ₹${(480000).toLocaleString('en-IN')} annual investment cap limits exposure. Ideal as 5–10% of portfolio.`,
  ],
  nps: (inv, p) => [
    `NPS offers an additional ₹50,000 deduction under 80CCD(1B) that sits entirely outside your ₹1.5L 80C limit. At your marginal rate of ${fmtPct(p.mr)}, this saves ₹${Math.round(Math.min(50000, p.annualSavings) * p.mr).toLocaleString('en-IN')} annually in tax — a guaranteed return on that saving alone.`,
    `The market-linked equity-debt blend historically returns 10–11% p.a., and 60% of the corpus at retirement is tax-free.`,
    p.horizon >= 15
      ? `Your ${p.horizon}-year horizon perfectly aligns with NPS's long-term structure for maximum compounding.`
      : `NPS works best with long horizons. Consider maximising only if your horizon is 15+ years.`,
  ],
  elss: (inv, p) => [
    `ELSS provides equity market growth (historically 13–14% CAGR) combined with an 80C deduction of up to ₹1.5L. At your marginal rate of ${fmtPct(p.mr)}, this saves ₹${Math.round(Math.min(150000, p.annualSavings) * p.mr).toLocaleString('en-IN')} annually in tax.`,
    `Each SIP instalment has its own 3-year lock-in. Units purchased via SIP become liquid on a rolling basis from month 37 onward.`,
    `With the fewest restrictions among all 80C options, ELSS is the strongest tax-saving instrument for equity investors with a horizon above 5 years.`,
  ],
};

// ── Formatting helpers ────────────────────────────────────────────
function fmtPct(decimal) { return (decimal * 100).toFixed(0) + '%'; }

function fmtReturnRange(inv) {
  if (inv.returnRange && inv.returnRange.min !== undefined) {
    return `${inv.returnRange.min}–${inv.returnRange.max}%`;
  }
  return `~${(inv.expectedReturn || inv.rate || 0).toFixed(1)}%`;
}

function riskDescription(riskLabel) {
  const descs = {
    'Very Low': 'near-zero volatility',
    'Low': 'low volatility',
    'Low-Medium': 'moderate-low volatility',
    'Medium-Low': 'moderate-low volatility',
    'Medium': 'moderate volatility',
    'High': 'significant volatility',
    'Very High': 'very high volatility with potential for sharp drawdowns',
  };
  return descs[riskLabel] || 'moderate volatility';
}

/**
 * Dynamic explanation generator — builds reasons from metadata.
 * Falls back gracefully if fields are missing.
 */
function generateDynamicReasons(inv, p) {
  const reasons = [];
  const ptResult = computePostTaxReturn(inv, p.annualSavings, p.annualIncome, { ...p, taxRegime: p.taxRegime });
  const postTaxStr = ptResult.postTaxRate.toFixed(1);

  // 1. Return reason
  const expRet = inv.expectedReturn || inv.rate || 0;
  if (inv.returnRange && inv.returnRange.min !== undefined) {
    reasons.push(
      `Expected return of ${fmtReturnRange(inv)} p.a. (post-tax: ${postTaxStr}%) suits your ${p.horizon}-year investment horizon.`
    );
  } else {
    reasons.push(
      `Offers ${expRet.toFixed(1)}% p.a. returns (post-tax: ${postTaxStr}%) within your ${p.horizon}-year horizon.`
    );
  }

  // 2. Risk reason
  const riskLabel = inv.riskLabel || 'Medium';
  const riskMatch = (p.risk === 'low' && (inv.riskLevel || inv.risk) <= 2) ||
                    (p.risk === 'medium' && (inv.riskLevel || inv.risk) >= 2 && (inv.riskLevel || inv.risk) <= 4) ||
                    (p.risk === 'high' && (inv.riskLevel || inv.risk) >= 3);
  if (riskMatch) {
    reasons.push(`${riskLabel} risk (${riskDescription(riskLabel)}) aligns well with your ${p.risk} risk appetite.`);
  } else {
    reasons.push(`${riskLabel} risk level — ${riskDescription(riskLabel)}. Consider this as part of a diversified portfolio.`);
  }

  // 3. Tax reason
  const taxInfo = TAX_INFO[inv.taxType];
  if (inv.taxEfficiencyScore !== undefined && inv.taxEfficiencyScore >= SCORING.TAX_EFFICIENCY_HIGH) {
    reasons.push(`Tax-efficient: ${taxInfo ? taxInfo.label : inv.taxType}. At your ${fmtPct(p.mr)} tax slab, this offers superior after-tax returns.`);
  } else if (inv.taxType === 'slab' && p.mr > 0.1) {
    reasons.push(`Interest taxed at your slab rate of ${fmtPct(p.mr)}, reducing effective return to ${postTaxStr}%. ${taxInfo?.debtNote ? 'Note: ' + taxInfo.debtNote : ''}`);
  } else if (taxInfo) {
    reasons.push(`Tax treatment: ${taxInfo.label}.`);
  }

  // 4. Goal reason
  if (inv.goalTags && Array.isArray(inv.goalTags)) {
    const matchingGoals = p.goals.filter(g => inv.goalTags.includes(g));
    if (matchingGoals.length > 0) {
      reasons.push(`Matches your ${matchingGoals.length > 1 ? 'goals' : 'goal'}: ${matchingGoals.join(', ')}.`);
    }
  }

  // 5. Liquidity reason
  if (inv.liquidityScore !== undefined) {
    if (inv.liquidityScore >= 4 && inv.lockIn === 0) {
      reasons.push(`High liquidity — no lock-in, accessible when you need it.`);
    } else if (inv.lockIn > 0) {
      reasons.push(`Lock-in of ${inv.lockIn} year${inv.lockIn > 1 ? 's' : ''} fits within your ${p.horizon}-year horizon.`);
    }
  }

  // 6. Cost reason
  if (inv.expenseRatio !== undefined) {
    if (inv.expenseRatio === 0) {
      reasons.push(`Zero expense ratio — no management fees eat into your returns.`);
    } else if (inv.expenseRatio <= 0.005) {
      reasons.push(`Ultra-low expense ratio of ${(inv.expenseRatio * 100).toFixed(2)}% keeps costs minimal over ${p.horizon} years.`);
    }
  }

  // 7. Horizon fit reason (using idealHorizon)
  if (inv.idealHorizon && inv.idealHorizon.min !== undefined) {
    if (p.horizon >= inv.idealHorizon.min && p.horizon <= inv.idealHorizon.max) {
      reasons.push(`Your ${p.horizon}-year horizon is an ideal fit for this instrument (recommended: ${inv.idealHorizon.min}–${inv.idealHorizon.max} years).`);
    }
  }

  return reasons;
}

// ═══════════════════════════════════════════════════════════════════
// getWhy — PUBLIC API (backward-compatible: returns string[])
// ═══════════════════════════════════════════════════════════════════
export function getWhy(inv, profile) {
  const p = parseProfile(profile);

  // 1. Try curated explanation for premium instruments
  const curated = CURATED_REASONS[inv.id];
  if (curated) {
    try {
      return curated(inv, p);
    } catch {
      // If curated fails (missing field), fall through to dynamic
    }
  }

  // 2. Generate dynamic explanation from metadata
  const dynamicReasons = generateDynamicReasons(inv, p);
  if (dynamicReasons.length >= 2) return dynamicReasons;

  // 3. Ultimate fallback — minimal generic explanation
  return [
    `${inv.name} offers ${(inv.expectedReturn || inv.rate || 0).toFixed(1)}% p.a. returns with ${inv.riskLabel || 'Medium'} risk.`,
    `Lock-in period of ${inv.lockIn || 0} years fits within your ${p.horizon}-year horizon.`,
    `Tax treatment: ${TAX_INFO[inv.taxType]?.label || inv.taxType}`,
  ];
}
