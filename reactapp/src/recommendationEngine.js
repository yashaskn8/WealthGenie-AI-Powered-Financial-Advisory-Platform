/**
 * WealthGenie — Client-Side Recommendation Engine (Offline-First Fallback)
 * ────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE NOTE — THIS IS NOT THE AUTHORITATIVE ENGINE:
 *   The authoritative recommendation pipeline is:
 *     1. server/routes/recommend.js → ML microservice (FastAPI + RandomForest)
 *     2. server/services/postTaxCalculator.js → post-tax adjustments
 *     3. server/services/taxEngine.js → marginal slab computation (FY2025-26)
 *
 *   This client-side engine provides:
 *     - Instant UI rendering BEFORE backend API responds (offline-first UX)
 *     - Eligibility filtering, scoring, and allocation for immediate display
 *     - Post-tax estimation consistent with the backend's tax-type logic
 *
 *   When backend data arrives, App.jsx merges it over these local results.
 *   See DashboardShell.useMemo() in App.jsx for the merge logic.
 *
 *   DO NOT add new tax computation logic here. If tax rules change,
 *   update server/services/taxEngine.js and server/services/postTaxCalculator.js.
 *
 * MODULE STRUCTURE:
 *   engine/taxComputation.js  — getMarginalRate, estimateEquityLTCGTaxRate, computePostTaxReturn
 *   engine/scoringEngine.js   — computeScore, enforceConcentrationLimits, getWhy
 *   engine/goalFiltering.js   — GOAL_PROFILES, filterInstrumentsForGoal, buildEmergencyFundPortfolio
 *   recommendationEngine.js   — (this file) orchestrator + getEligibleInvestments + generateRecommendations
 */
import { investmentDatabase, TAX_INFO, RISK_COLORS, CHART_COLORS, CONCENTRATION_CAPS } from './investmentDatabase.js';

// ── Configuration Constants ───────────────────────────────────────
export const RECOMMENDATION_CONFIG = {
  TOP_N: 5,
  MIN_ASSET_CLASSES: 3,
};

// ── Re-export sub-modules for backward compatibility ──────────────
export { getMarginalRate, estimateEquityLTCGTaxRate, computePostTaxReturn } from './engine/taxComputation.js';
export { computeScore, enforceConcentrationLimits, getWhy } from './engine/scoringEngine.js';
export { GOAL_PROFILES, filterInstrumentsForGoal, buildEmergencyFundPortfolio } from './engine/goalFiltering.js';
export { TAX_INFO, RISK_COLORS, CHART_COLORS, CONCENTRATION_CAPS };

// ── Local imports for orchestration ───────────────────────────────
import { getMarginalRate, computePostTaxReturn } from './engine/taxComputation.js';
import { computeScore, enforceConcentrationLimits } from './engine/scoringEngine.js';
import { filterInstrumentsForGoal, buildEmergencyFundPortfolio, calculateSIPValue } from './engine/goalFiltering.js';

// ─── DIVERSITY ENFORCER ───────────────────────────────────────────
export function enforceDiversity(scoredInvestments, topN = 5, minAssetClasses = 3) {
  if (scoredInvestments.length <= topN) {
    return scoredInvestments.slice(0, topN);
  }

  let selected = scoredInvestments.slice(0, topN);
  let remaining = scoredInvestments.slice(topN);

  const getAssetClasses = (arr) => new Set(arr.map(inv => inv.assetClass || inv.category || 'Other'));

  for (let attempt = 0; attempt < 5; attempt++) {
    let selectedClasses = getAssetClasses(selected);
    if (selectedClasses.size >= minAssetClasses) {
      break;
    }

    const allRemainingClasses = getAssetClasses(remaining);
    const unrepresentedClasses = [...allRemainingClasses].filter(c => !selectedClasses.has(c));

    if (unrepresentedClasses.length === 0) {
      break;
    }

    let candidateIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cls = remaining[i].assetClass || remaining[i].category || 'Other';
      if (unrepresentedClasses.includes(cls)) {
        candidateIdx = i;
        break;
      }
    }

    if (candidateIdx === -1) {
      break;
    }

    const candidate = remaining[candidateIdx];

    const counts = {};
    selected.forEach(inv => {
      const cls = inv.assetClass || inv.category || 'Other';
      counts[cls] = (counts[cls] || 0) + 1;
    });

    let lowestDupIdx = -1;
    let lowestDupScore = Infinity;

    for (let i = selected.length - 1; i >= 0; i--) {
      const cls = selected[i].assetClass || selected[i].category || 'Other';
      if (counts[cls] > 1) {
        if (selected[i].score < lowestDupScore) {
          lowestDupScore = selected[i].score;
          lowestDupIdx = i;
        }
      }
    }

    if (lowestDupIdx === -1) {
      break;
    }

    const removed = selected[lowestDupIdx];
    selected[lowestDupIdx] = candidate;
    remaining[candidateIdx] = removed;

    remaining.sort((a, b) => b.score - a.score);
  }

  selected.sort((a, b) => b.score - a.score);
  return selected;
}

// ─── FORMAT INR ───────────────────────────────────────────────────
export function formatINR(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
}

function _checkBasicEligibility(inv, age, annualIncome, savings) {
  const elig = inv.eligibility;
  if (age < elig.minAge) return false;
  if (elig.maxAge !== null && age > elig.maxAge) return false;
  if (annualIncome < elig.minAnnualIncome) return false;
  if (savings < inv.minMonthlyInvestment) return false;
  if (elig.minMonthlySavings && savings < elig.minMonthlySavings) return false;
  return true;
}

function _checkInstrumentSpecificRules(inv, age, annualIncome, savings, horizon, risk, profile) {
  if (inv.id === "scss" && age < 60) return false;
  if (inv.id === "nps" && age >= 60) return false;
  if (inv.id === "sukanya") {
    if (age < 18 || age > 40 || !profile.has_daughter_under_10) return false;
  }
  if (inv.id === "smallcap_mf") {
    if (!(age >= 21 && age <= 45 && horizon >= 10 && risk === "high" && annualIncome >= 800000 && savings >= 8000)) return false;
  }
  if (inv.id === "direct_equity") {
    if (!(age >= 21 && age <= 55 && risk === "high" && annualIncome >= 600000 && savings >= 10000 && horizon >= 5)) return false;
  }
  if (inv.id === "midcap_mf") {
    if (age > 50 || horizon < 7 || savings < 5000 || annualIncome < 600000) return false;
  }
  return true;
}

function _checkRiskAppetiteRules(inv, risk, horizon) {
  const numericRisk = typeof inv.risk === 'number' ? inv.risk : (inv.risk_level === 'Very High' ? 5 : inv.risk_level === 'High' ? 4 : inv.risk_level === 'Medium' ? 3 : 2);
  if (risk === "low" && (numericRisk >= 4 || (numericRisk >= 3 && horizon <= 5))) return false;
  if (risk === "medium" && (numericRisk >= 5 || (numericRisk >= 4 && horizon < 5))) return false;
  if (risk === "high" && numericRisk === 1 && horizon <= 3) return false;
  return true;
}

// ─── STEP 3: SMART ELIGIBILITY FILTER (comprehensive rules) ──────
export function getEligibleInvestments(profile) {
  const age = Number(profile.age) || 25;
  const income = Number(profile.monthly_income || profile.income) || 0;
  const savings = Number(profile.monthly_savings || profile.savings) || 0;
  const risk = (profile.risk_appetite || profile.risk || "Medium").toLowerCase();
  const horizon = Number(profile.investment_horizon || profile.horizon) || 10;
  const annualIncome = income * 12;
  const mr = getMarginalRate(annualIncome, profile.taxRegime || profile.regime || 'new');

  let result = investmentDatabase.filter(inv => {
    if (!_checkBasicEligibility(inv, age, annualIncome, savings)) return false;
    if (!_checkInstrumentSpecificRules(inv, age, annualIncome, savings, horizon, risk, profile)) return false;

    // ── HORIZON-AWARE LOCK-IN FILTER ──
    const effectiveLockIn = (inv.maturity_type === 'age_based' && inv.maturity_age)
      ? Math.max(0, inv.maturity_age - age)
      : inv.lockIn;
    if (effectiveLockIn > 0 && effectiveLockIn > horizon) return false;

    // ── HORIZON VS idealHorizon range ──
    if (inv.idealHorizon?.min !== undefined && horizon < inv.idealHorizon.min) return false;

    // ── DEMAT ACCOUNT REQUIREMENT ──
    if (inv.eligibility.requiresDemat && profile.has_demat === false) return false;

    // ── EMERGENCY FUND CHECK FOR LIQUIDITY ──
    const isEmergency = profile.investment_goals?.includes('Emergency Fund') || profile.goals?.includes('Emergency Fund');
    if (isEmergency && (inv.lockIn > 0 || (inv.liquidityScore !== undefined && inv.liquidityScore < 4))) {
      return false;
    }

    if (!_checkRiskAppetiteRules(inv, risk, horizon)) return false;

    // ── TAX-AWARE EXCLUSIONS ──
    if (inv.id === "elss" && mr === 0) return false;
    if (inv.id === "debt_mf" && mr === 0 && savings < 10000) return false;

    return true;
  });

  // ── MINIMUM ELIGIBLE INSTRUMENTS FALLBACK ──
  if (result.length < 3) {
    const riskTiers = risk === 'high'
      ? [5, 4, 3, 2, 1]
      : risk === 'medium'
        ? [3, 2, 4, 1]
        : [1, 2, 3];

    const existingIds = new Set(result.map(i => i.id));

    for (const maxRisk of riskTiers) {
      if (result.length >= 3) break;

      const candidates = investmentDatabase.filter(inv => {
        if (existingIds.has(inv.id)) return false;
        if (inv.risk !== maxRisk) return false;
        if (savings < inv.minMonthlyInvestment) return false;
        if (inv.eligibility.minMonthlySavings && savings < inv.eligibility.minMonthlySavings) return false;
        const effectiveLockIn = (inv.maturity_type === 'age_based' && inv.maturity_age)
          ? Math.max(0, inv.maturity_age - age)
          : inv.lockIn;
        if (effectiveLockIn > 0 && effectiveLockIn > horizon) return false;
        if (inv.id === "scss" && age < 60) return false;
        if (inv.id === "sukanya" && !profile.has_daughter_under_10) return false;
        return true;
      });

      for (const inv of candidates) {
        if (!existingIds.has(inv.id)) {
          result.push(inv);
          existingIds.add(inv.id);
        }
        if (result.length >= 3) break;
      }
    }

    if (result.length === 0) {
      const fd = investmentDatabase.find(i => i.id === "fd");
      if (fd) result = [fd];
      result._fallbackNotice = "Your profile is very specific. Showing the safest available option. Adjust your profile to unlock more instruments.";
    }
  }

  return result;
}

// ─── MAIN: generateRecommendations ────────────────────────────────
export function generateRecommendations(userProfile) {
  const { age, monthly_income, monthly_savings, risk_appetite, investment_goals, investment_horizon } = userProfile;
  const savings = Number(monthly_savings) || 0;
  const primaryGoal = (investment_goals || [])[0] || null;

  // FIX 1: Emergency Fund uses dedicated liquid portfolio
  if (primaryGoal === 'Emergency Fund') {
    return buildEmergencyFundPortfolio(userProfile);
  }

  const profile = {
    age: Number(age) || 25,
    monthly_income: Number(monthly_income) || 0,
    income: Number(monthly_income) || 0,
    monthly_savings: savings,
    savings: savings,
    risk_appetite: risk_appetite || "Medium",
    risk: risk_appetite || "Medium",
    investment_goals: investment_goals || [],
    investment_horizon: Number(investment_horizon) || 10,
    horizon: Number(investment_horizon) || 10,
    taxRegime: userProfile.taxRegime || "new",
  };

  let eligible = getEligibleInvestments(profile);
  if (eligible.length === 0) return [];

  // FIX 1: Apply goal-aware filtering
  if (primaryGoal) {
    eligible = filterInstrumentsForGoal(eligible, primaryGoal);
    if (eligible.length === 0) {
      const fd = investmentDatabase.find(i => i.id === 'fd');
      const debtMf = investmentDatabase.find(i => i.id === 'debt_mf');
      eligible = [fd, debtMf].filter(Boolean);
    }
  }

  const fallbackNotice = eligible._fallbackNotice || null;

  let scored = eligible.map(inv => computeScore(inv, profile));
  scored.sort((a, b) => b.score - a.score);
  scored = enforceConcentrationLimits(scored);

  const recommended = enforceDiversity(scored, RECOMMENDATION_CONFIG.TOP_N, RECOMMENDATION_CONFIG.MIN_ASSET_CLASSES);

  const clampedScores = recommended.map(inv => Math.max(1, inv.score));
  const totalScore = clampedScores.reduce((sum, s) => sum + s, 0);
  if (totalScore === 0) return [];

  let rawWeights = clampedScores.map(s => s / totalScore);
  const rawTotal = rawWeights.reduce((s, w) => s + w, 0);
  if (rawTotal <= 0) {
    rawWeights = recommended.map(() => 1 / recommended.length);
  } else {
    rawWeights = rawWeights.map(w => w / rawTotal);
  }

  // ── ALLOCATION ENGINE (budget-aware) ──
  const totalMinRequired = recommended.reduce((s, inv) => s + inv.minMonthlyInvestment, 0);
  const budgetCanSupportMins = savings >= totalMinRequired;

  let sipAllocations;

  if (budgetCanSupportMins) {
    sipAllocations = rawWeights.map(w => {
      let amount = Math.round(w * savings / 100) * 100;
      return Math.max(0, amount);
    });

    recommended.forEach((inv, i) => {
      if (sipAllocations[i] > 0 && sipAllocations[i] < inv.minMonthlyInvestment) {
        sipAllocations[i] = inv.minMonthlyInvestment;
      }
      if (inv.maxAnnualInvestment && sipAllocations[i] * 12 > inv.maxAnnualInvestment) {
        sipAllocations[i] = Math.floor(inv.maxAnnualInvestment / 12 / 100) * 100;
      }
    });

    let allocatedSum = sipAllocations.reduce((s, a) => s + a, 0);
    while (allocatedSum > savings && recommended.length > 1) {
      let dropIdx = -1;
      for (let i = sipAllocations.length - 1; i >= 1; i--) {
        if (sipAllocations[i] > 0) { dropIdx = i; break; }
      }
      if (dropIdx === -1) break;
      allocatedSum -= sipAllocations[dropIdx];
      sipAllocations[dropIdx] = 0;
    }
  } else {
    const roundStep = savings <= 1000 ? 50 : 100;
    sipAllocations = rawWeights.map(w => {
      return Math.max(0, Math.round(w * savings / roundStep) * roundStep);
    });
  }

  let allocatedSum = sipAllocations.reduce((s, a) => s + a, 0);
  const diff = savings - allocatedSum;
  if (diff !== 0 && recommended.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < sipAllocations.length; i++) {
      if (sipAllocations[i] > sipAllocations[maxIdx]) maxIdx = i;
    }
    sipAllocations[maxIdx] = Math.max(0, sipAllocations[maxIdx] + diff);
  }

  recommended.forEach((inv, i) => {
    inv.monthly_allocation = sipAllocations[i];
  });

  const annualIncome = (Number(profile.monthly_income || profile.income) || 0) * 12;
  const annualSavings = savings * 12;

  recommended.forEach(inv => {
    inv.projected_value = calculateSIPValue(inv.monthly_allocation, inv.rate, profile.investment_horizon);
    inv.category = inv.cat;
    if (inv.risk >= 5) {
      inv.expected_return_min = parseFloat((inv.rate * 0.50).toFixed(1));
    } else if (inv.risk >= 4) {
      inv.expected_return_min = parseFloat((inv.rate * 0.55).toFixed(1));
    } else if (inv.risk >= 3) {
      inv.expected_return_min = parseFloat((inv.rate * 0.65).toFixed(1));
    } else if (inv.risk >= 2) {
      inv.expected_return_min = parseFloat((inv.rate * 0.85).toFixed(1));
    } else {
      inv.expected_return_min = parseFloat((inv.rate * 0.90).toFixed(1));
    }
    inv.expected_return_max = inv.rate;
    inv.risk_level = inv.riskLabel;
    inv.tax_benefit = ["eee", "elss", "nps", "sgb"].includes(inv.taxType);
    inv.tax_section = inv.taxType === "eee" ? "80C" : inv.taxType === "elss" ? "80C" : inv.taxType === "nps" ? "80CCD(1B)" : inv.taxType === "sgb" ? "47(viic)" : null;

    if (inv.maturity_type === 'age_based' && inv.maturity_age) {
      inv.lock_in_years = Math.max(0, inv.maturity_age - profile.age);
    } else {
      inv.lock_in_years = inv.lockIn;
    }

    inv.liquidity = inv.lock_in_years === 0 ? "High" : inv.lock_in_years <= 5 ? "Medium" : "Low";
    inv.min_investment_inr = inv.minMonthlyInvestment;
    inv.match_score = inv.score;
    inv.description = inv.desc;
    inv.suitable_for_goals = [];
    if (["eee", "elss", "nps"].includes(inv.taxType)) inv.suitable_for_goals.push("Tax Saving");
    if (inv.risk <= 2) inv.suitable_for_goals.push("Emergency Fund");
    if (inv.risk >= 3) inv.suitable_for_goals.push("Wealth Growth");
    if (inv.lock_in_years >= 5 || ["nps", "ppf"].includes(inv.id)) inv.suitable_for_goals.push("Retirement");
    inv.suitable_risk_profiles = [];
    if (inv.risk <= 2) inv.suitable_risk_profiles.push("Low");
    if (inv.risk >= 2 && inv.risk <= 4) inv.suitable_risk_profiles.push("Medium");
    if (inv.risk >= 3) inv.suitable_risk_profiles.push("High");
    inv.types = [];

    // FIX 5: Compute post-tax return — with Hybrid MF blended tax correction
    const ptResult = computePostTaxReturn(inv, annualSavings, annualIncome, profile);
    inv.nominalReturn = inv.rate;
    if (inv.id === 'hybrid_mf') {
      const marginal = getMarginalRate(annualIncome, profile.taxRegime || 'new');
      const blendedTaxDrag = (0.65 * 0.125) + (0.35 * marginal);
      inv.postTaxReturn = parseFloat((inv.rate * (1 - blendedTaxDrag)).toFixed(1));
    } else {
      inv.postTaxReturn = parseFloat(ptResult.postTaxRate.toFixed(1));
    }

    inv.ml_confidence = Math.min(0.98, Math.max(0.65, inv.score / 100));
    inv._source = 'local_engine';
  });

  if (fallbackNotice) recommended._fallbackNotice = fallbackNotice;

  return recommended;
}

// ─── SECTION 5: ALLOCATION ENGINE ─────────────────────────────────
export function computeAllocation(profile, eligibleInvestments) {
  const savings = Number(profile.monthly_savings || profile.savings) || 0;
  const annualIncome = (Number(profile.monthly_income || profile.income) || 0) * 12;
  const annualSavings = savings * 12;

  let scored = eligibleInvestments.map(inv => computeScore(inv, profile));
  scored.sort((a, b) => b.score - a.score);
  let top = enforceDiversity(scored, RECOMMENDATION_CONFIG.TOP_N, RECOMMENDATION_CONFIG.MIN_ASSET_CLASSES);

  if (top.length < 3) {
    const ids = new Set(top.map(i => i.id));
    const fd = investmentDatabase.find(i => i.id === "fd");
    const ppf = investmentDatabase.find(i => i.id === "ppf");
    if (fd && !ids.has("fd")) { top.push(computeScore(fd, profile)); ids.add("fd"); }
    if (ppf && !ids.has("ppf") && top.length < 5) { top.push(computeScore(ppf, profile)); }
  }

  const N = top.length;
  if (N === 0) return [];

  const caps = {};
  const goldIds = ["sgb", "gold_etf"];
  top.forEach(inv => {
    const cap = CONCENTRATION_CAPS[inv.id];
    caps[inv.id] = cap ? cap.maxPct : 40;
  });
  const goldInTop = top.filter(i => goldIds.includes(i.id));
  if (goldInTop.length === 2) {
    goldInTop.forEach(i => { caps[i.id] = 5; });
  }

  const floor = 5;

  const totalScore = top.reduce((s, i) => s + i.score, 0);
  let allocs = top.map(inv => ({
    ...inv,
    allocationPct: totalScore > 0 ? (inv.score / totalScore) * 100 : 100 / N,
  }));

  for (let iter = 0; iter < 5; iter++) {
    let excess = 0;
    let freeCount = 0;
    allocs.forEach(a => {
      if (a.allocationPct > caps[a.id]) {
        excess += a.allocationPct - caps[a.id];
        a.allocationPct = caps[a.id];
      } else if (a.allocationPct < floor) {
        excess -= (floor - a.allocationPct);
        a.allocationPct = floor;
      } else {
        freeCount++;
      }
    });
    if (Math.abs(excess) > 0.1 && freeCount > 0) {
      const freeItems = allocs.filter(a => a.allocationPct > floor && a.allocationPct < caps[a.id]);
      const redistPer = excess / freeItems.length;
      freeItems.forEach(a => { a.allocationPct += redistPer; });
    }
  }

  const totalPct = allocs.reduce((s, a) => s + a.allocationPct, 0);
  if (totalPct > 0) allocs.forEach(a => { a.allocationPct = (a.allocationPct / totalPct) * 100; });

  return allocs.map(a => {
    const { postTaxRate } = computePostTaxReturn(a, annualSavings, annualIncome, profile);
    return {
      id: a.id,
      name: a.name,
      abbr: a.abbr,
      cat: a.cat,
      allocationPct: parseFloat(a.allocationPct.toFixed(1)),
      monthlyAmount: Math.round((a.allocationPct / 100) * savings / 100) * 100,
      color: a.color,
      postTaxRate: parseFloat(postTaxRate.toFixed(1)),
      riskLabel: a.riskLabel,
      rate: a.rate,
      score: a.score,
      concentrationBadge: CONCENTRATION_CAPS[a.id]?.badge || null,
      maxPct: caps[a.id] || 40,
    };
  });
}
