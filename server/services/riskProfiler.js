/**
 * WealthGenie Risk Profiler
 * Categorizes users into risk buckets based on age + annual income + investment horizon + financial ratios.
 *
 * =========================================================================
 * 📘 BEGINNER NOTE: WHAT IS COMPOSITE RISK SCORING?
 * =========================================================================
 * Risk capacity is not just about how you "feel" about the stock market. It is
 * a mathematical combination of your ability to take risk (financial strength)
 * and your timeline (investment horizon).
 * 
 * WealthGenie uses a 3-Factor Composite Scoring Model (ranging from 0 to 100 points):
 * 
 * 1. Age (0–40 points): Younger investors have more decades ahead of them. If the 
 *    market crashes tomorrow, they have time to wait for a recovery before needing
 *    the money. Thus: Younger = Higher Risk Score.
 * 
 * 2. Annual Income (0–40 points): Higher earners have a larger financial cushion.
 *    If an emergency occurs, they can cover it from their current cash flow rather than
 *    being forced to sell investments at a loss. Thus: Higher Income = Higher Risk Score.
 * 
 * 3. Investment Horizon (0–20 points): How long will the money stay invested? 
 *    If you need the money in 2 years, you cannot afford a market crash (low risk). 
 *    If you need it in 20 years, short-term crashes don't matter because the market
 *    historically trends upwards over long periods. Thus: Longer Horizon = Higher Risk Score.
 * 
 * We also subtract penalties for high debt levels or dependents, giving us a highly
 * personalized, mathematically balanced risk score. This avoids the "cliff-edge"
 * problem where a ₹1 income difference shifts you from Moderate to Conservative.
 */

const RISK_PROFILES = {
  Aggressive: {
    category: 'Aggressive',
    description: 'High risk tolerance — suited for equity-heavy portfolios with long-term growth focus. Can withstand 30-40% interim drawdowns.',
    recommendedEquityAllocation: 80,
  },
  'Moderate-Aggressive': {
    category: 'Moderate-Aggressive',
    description: 'Above-average risk tolerance — balanced toward equity with some debt allocation for stability. Growth-oriented with moderate volatility acceptance.',
    recommendedEquityAllocation: 65,
  },
  Moderate: {
    category: 'Moderate',
    description: 'Balanced risk approach — equal weight to equity and debt instruments. Seeks steady growth with controlled downside.',
    recommendedEquityAllocation: 50,
  },
  'Conservative-Moderate': {
    category: 'Conservative-Moderate',
    description: 'Below-average risk tolerance — debt-heavy portfolio with limited equity exposure. Prioritizes capital preservation with modest growth.',
    recommendedEquityAllocation: 35,
  },
  Conservative: {
    category: 'Conservative',
    description: 'Low risk tolerance — focused on capital preservation through government securities, FDs, and debt funds. Minimal equity exposure.',
    recommendedEquityAllocation: 20,
  },
};

/**
 * Compute age-based risk score (0–40).
 * Linear decay: age 18 → 40 points, age 70 → 0 points.
 * Clamped to [0, 40].
 *
 * @param {number} age
 * @returns {number}
 */
function ageScore(age) {
  // Linear: score = 40 × (1 - (age - 18) / 52)
  // At age 18: 40, at age 44: 20, at age 70: 0
  const raw = 40 * (1 - Math.max(0, age - 18) / 52);
  return Math.max(0, Math.min(40, raw));
}

/**
 * Compute income-based risk score (0–40).
 * Logarithmic scale — diminishing returns above ₹20L.
 * Clamped to [0, 40].
 *
 * @param {number} annualIncome - Gross annual income in ₹
 * @returns {number}
 */
function incomeScore(annualIncome) {
  if (annualIncome <= 0) return 0;
  // Log scale: ~8 at ₹3L, ~20 at ₹6L, ~28 at ₹12L, ~34 at ₹25L, ~40 at ₹50L+
  const raw = 40 * Math.min(1, Math.log10(annualIncome / 100000) / 1.7);
  return Math.max(0, Math.min(40, raw));
}

/**
 * Compute investment-horizon-based risk score (0–20).
 * Longer horizons allow more volatility tolerance since
 * short-term drawdowns are smoothed over time.
 * Clamped to [0, 20].
 *
 * @param {number} horizonYears - Investment horizon in years
 * @returns {number}
 */
function horizonScore(horizonYears) {
  if (horizonYears <= 0) return 0;
  // Linear: 1yr → 2pts, 5yr → 7pts, 10yr → 12pts, 20yr → 18pts, 30yr+ → 20pts
  const raw = 20 * Math.min(1, horizonYears / 30);
  return Math.max(0, Math.min(20, raw));
}

/**
 * Determine risk profile based on age, annual income, and investment horizon
 * using composite scoring.
 *
 * Score ranges (total 0–100 from 40+40+20):
 *   80–100 → Aggressive
 *   60–79  → Moderate-Aggressive
 *   40–59  → Moderate
 *   20–39  → Conservative-Moderate
 *   0–19   → Conservative
 *
 * @param {number} age - User's age in years
 * @param {number} annualIncome - User's gross annual income in ₹
 * @param {number} [investmentHorizon=15] - Investment horizon in years (optional)
 * @returns {{ category, description, recommendedEquityAllocation, riskScore }}
 */
export function getRiskProfile(
  age,
  annualIncome,
  investmentHorizon = 15,
  experienceYears = 0,
  dependents = 0,
  monthlySavings = null,
  monthlyDebtPaymentInr = 0,
  lumpSumAmount = 0,
  soldPropertyAmount = 0
) {
  // Input guards
  const safeAge = Math.max(18, Math.min(80, Number(age) || 30));
  const safeIncome = Math.max(0, Number(annualIncome) || 0);
  const safeHorizon = Math.max(1, Math.min(40, Number(investmentHorizon) || 15));
  const safeExperience = Math.max(0, Number(experienceYears) || 0);
  const safeDependents = Math.max(0, Number(dependents) || 0);

  // Calculate components
  const scoreAge = ageScore(safeAge);
  const scoreIncome = incomeScore(safeIncome);
  const scoreHorizon = horizonScore(safeHorizon);
  const penaltyDependents = Math.min(10, safeDependents * 2);

  // Savings-to-income ratio penalty: max 15 points
  let penaltySavings = 0;
  if (monthlySavings !== null && monthlySavings !== undefined) {
    const safeSavings = Math.max(0, Number(monthlySavings) || 0);
    const savingsRatio = safeIncome > 0 ? (safeSavings * 12) / safeIncome : 0.15;
    if (savingsRatio < 0.15) {
      penaltySavings = Math.min(15, 15 * (1 - savingsRatio / 0.15));
    }
  }

  // Debt-to-income ratio penalty: max 15 points (triggered if EMI > 30% of gross monthly income)
  let penaltyDebt = 0;
  if (monthlyDebtPaymentInr !== null && monthlyDebtPaymentInr !== undefined) {
    const safeDebt = Math.max(0, Number(monthlyDebtPaymentInr) || 0);
    const debtRatio = safeIncome > 0 ? (safeDebt * 12) / safeIncome : 0;
    if (debtRatio > 0.30) {
      penaltyDebt = Math.min(15, (debtRatio - 0.30) * 50);
    }
  }

  // Liquidity capacity bonus from lump sum or property sale proceeds (capped at 8 points max)
  const totalLumpLiquidity = Math.max(0, Number(lumpSumAmount) || 0) + Math.max(0, Number(soldPropertyAmount) || 0);
  let bonusLiquidity = 0;
  if (totalLumpLiquidity > 0) {
    const liquidityRatio = safeIncome > 0 ? totalLumpLiquidity / safeIncome : 1.0;
    bonusLiquidity = Math.min(8, Math.round(Math.log10(1 + liquidityRatio * 3) * 5));
  }

  const rawScore = scoreAge + scoreIncome + scoreHorizon + bonusLiquidity - penaltyDependents - penaltySavings - penaltyDebt;
  const score = Math.max(0, Math.min(100, rawScore));

  let profileKey;
  if (score >= 80)      profileKey = 'Aggressive';
  else if (score >= 60) profileKey = 'Moderate-Aggressive';
  else if (score >= 40) profileKey = 'Moderate';
  else if (score >= 20) profileKey = 'Conservative-Moderate';
  else                  profileKey = 'Conservative';

  // Smooth recommended equity allocation: 20% to 80% (slope 0.75 points per risk score unit)
  const smoothAllocation = 20 + Math.max(0, Math.min(80, score - 10)) * 0.75;
  const recommendedAllocation = Math.round(smoothAllocation);

  return {
    ...RISK_PROFILES[profileKey],
    recommendedEquityAllocation: recommendedAllocation,
    riskScore: Math.round(score),
  };
}

/**
 * Encode risk category to numeric score for ML features.
 *
 * @param {string} category
 * @returns {number} 0-4 scale
 */
export function encodeRiskCategory(category) {
  const map = {
    'Conservative': 0,
    'Conservative-Moderate': 1,
    'Moderate': 2,
    'Moderate-Aggressive': 3,
    'Aggressive': 4,
  };
  return map[category] ?? 2;
}
