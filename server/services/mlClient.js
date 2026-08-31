import axios from 'axios';
import {
  buildPredictionRequest,
  buildTracingHeaders,
  normalizePredictionResponse,
} from './mlServiceContract.js';

const getMlServiceUrl = () => (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const getMlApiKey = () => process.env.ML_SERVICE_API_KEY || '';

const ML_TIMEOUT_MS = 5000;

let failureCount = 0;
let circuitOpenUntil = 0;

function isCircuitHealthy() {
  if (Date.now() < circuitOpenUntil) {
    return false;
  }
  return true;
}

function recordSuccess() {
  failureCount = 0;
  circuitOpenUntil = 0;
}

function recordFailure() {
  failureCount++;
  if (failureCount >= 3) {
    circuitOpenUntil = Date.now() + 60000;
    console.warn(`[MLClient] Circuit breaker OPENED due to ${failureCount} consecutive failures.`);
  }
}


export async function getMLPrediction(profileData, correlationId = null, userId = null, userRole = null) {
  if (!isCircuitHealthy()) {
    console.warn('[MLClient] Circuit breaker OPEN — fast-failing to rule-based fallback.');
    return getRuleBasedFallback(profileData);
  }
  // ── Backward Compatibility Check ──
  const debtVal = profileData.existing_debt_emi_ratio_pct !== undefined ? profileData.existing_debt_emi_ratio_pct : profileData.existing_debt;
  const isProfileIncomplete = 
    profileData.liquid_savings === undefined || profileData.liquid_savings === null ||
    debtVal === undefined || debtVal === null ||
    profileData.dependents === undefined || profileData.dependents === null ||
    profileData.emergency_fund_months === undefined || profileData.emergency_fund_months === null ||
    profileData.risk_tolerance === undefined || profileData.risk_tolerance === null ||
    profileData.goal_type === undefined || profileData.goal_type === null;

  if (isProfileIncomplete) {
    console.info('[MLClient] Profile missing new fields. Routing through rule-based fallback to preserve backward compatibility.');
    return getRuleBasedFallback(profileData);
  }

  const effectiveUserId = userId || profileData.userId;

  try {
    const mlServiceUrl = getMlServiceUrl();
    const mlApiKey = getMlApiKey();
    const mlEndpoint = process.env.ML_MODEL_ENDPOINT || '/predict/enriched';
    const normalizedEndpoint = mlEndpoint.startsWith('/') ? mlEndpoint : `/${mlEndpoint}`;
    const request = buildPredictionRequest(profileData);
    if (!request) {
      console.warn('[MLClient] Profile cannot satisfy the FastAPI prediction contract, using fallback.');
      return getRuleBasedFallback(profileData);
    }
    const res = await axios.post(`${mlServiceUrl}${normalizedEndpoint}`, request, {
      timeout: ML_TIMEOUT_MS,
      headers: {
        ...(mlApiKey ? { 'X-API-Key': mlApiKey } : {}),
        ...(effectiveUserId ? { 'X-Verified-User-Id': String(effectiveUserId) } : {}),
        ...(userRole ? { 'X-Verified-User-Role': String(userRole) } : {}),
        ...buildTracingHeaders(correlationId),
      }
    });
    const prediction = normalizePredictionResponse(res.data);
    if (!prediction) {
      console.warn('[MLClient] ML service returned an unusable prediction, using rule-based fallback.');
      return getRuleBasedFallback(profileData);
    }
    recordSuccess();
    return prediction;
  } catch (err) {
    recordFailure();
    console.warn('[MLClient] ML service unavailable, using rule-based fallback:', err.message);
    return getRuleBasedFallback(profileData);
  }
}

export async function checkMLHealth(correlationId = null) {
  try {
    const mlServiceUrl = getMlServiceUrl();
    const mlApiKey = getMlApiKey();
    const res = await axios.get(`${mlServiceUrl}/health`, {
      timeout: 3000,
      headers: {
        ...(mlApiKey ? { 'X-API-Key': mlApiKey } : {}),
        ...buildTracingHeaders(correlationId),
      }
    });
    return res.data;
  } catch { return null; }
}

export function getRuleBasedFallback({ age, annual_income, monthly_savings, risk_category }) {
  const safeAge = Number(age) || 30;
  const safeIncome = Number(annual_income) || 600000;
  const safeRisk = risk_category || 'Moderate';

  let primary, secondary, tertiary;
  const path = [`risk=${safeRisk}`, `age=${safeAge}`, `income=${safeIncome}`];

  // Income tier affects instrument selection:
  // High income (>20L): tax-efficient instruments (SGB, NPS, ELSS)
  // Mid income (5-20L): balanced growth (ETF, Equity_MF)
  // Low income (<5L): safety-first (PPF, FD, Debt_MF)
  const isHighIncome = safeIncome >= 2000000;
  const isYoung = safeAge < 35;
  const isSenior = safeAge >= 55;

  if (safeRisk === 'Aggressive') {
    if (isSenior) {
      // Seniors: downshift even aggressive profiles, include SCSS for safe yield
      primary = 'ETF'; secondary = 'SCSS'; tertiary = 'Liquid_MF';
      path.push('senior_downshift_scss');
    } else if (isHighIncome) {
      // High earners: ELSS for 80C + equity growth + SGB for tax-free gold
      primary = 'ELSS'; secondary = 'Equity_MF'; tertiary = 'SGB';
      path.push('high_income_tax_opt');
    } else {
      primary = 'ELSS'; secondary = 'Equity_MF'; tertiary = 'ETF';
    }
  } else if (safeRisk === 'Moderate-Aggressive') {
    primary = 'Equity_MF'; secondary = 'ETF';
    if (isYoung && isHighIncome) {
      tertiary = 'NPS'; // Young high earners benefit from 80CCD(1B)
      path.push('nps_tax_benefit');
    } else {
      tertiary = safeAge < 30 ? 'ELSS' : 'Debt_MF';
    }
  } else if (safeRisk === 'Moderate') {
    primary = 'ETF'; secondary = 'Debt_MF';
    if (isSenior) {
      tertiary = 'SCSS';
    } else if (isHighIncome) {
      tertiary = 'SGB'; // Gold + 2.5% coupon, tax-free at maturity
      path.push('sgb_diversification');
    } else {
      tertiary = 'ELSS';
    }
  } else if (safeRisk === 'Conservative-Moderate') {
    primary = 'Debt_MF';
    secondary = isSenior ? 'SCSS' : 'FD';
    tertiary = isHighIncome ? 'G-Sec' : (isSenior ? 'FD' : 'RBI_Bond');
  } else {
    // Conservative
    if (isSenior) {
      primary = 'SCSS'; secondary = 'RBI_Bond'; tertiary = 'Liquid_MF';
      path.push('senior_safety_scss');
    } else if (isHighIncome) {
      primary = 'Debt_MF'; secondary = 'RBI_Bond'; tertiary = 'Arbitrage_MF';
      path.push('arb_low_vol');
    } else {
      primary = 'FD'; secondary = 'PPF'; tertiary = 'Debt_MF';
    }
  }

  // Confidence scores: primary gets highest, weighted by rule specificity
  // Provide scores across ALL 19 core keys so the RecommendationPipeline
  // can use ML boost signals across the full instrument spectrum
  const confPrimary = path.length > 3 ? 0.65 : 0.55; // More specific path = higher confidence
  const confSecondary = (1 - confPrimary) * 0.65;
  const confTertiary = (1 - confPrimary) * 0.35;

  // Build comprehensive confidence map with baseline scores for all keys
  const ALL_KEYS = [
    'FD', 'ELSS', 'Equity_MF', 'ETF', 'Debt_MF', 'RBI_Bond', 'G-Sec',
    'PPF', 'NPS', 'Gold', 'SGB', 'Liquid_MF', 'Arbitrage_MF', 'Hybrid_MF',
    'Index_MF', 'Midcap_MF', 'Smallcap_MF', 'SCSS', 'SSY',
  ];

  const confidence_scores = {};
  // Baseline: small non-zero score so every key participates in scoring
  for (const key of ALL_KEYS) {
    confidence_scores[key] = 0.02;
  }
  // Overwrite with rule-based picks
  confidence_scores[primary] = parseFloat(confPrimary.toFixed(2));
  confidence_scores[secondary] = parseFloat(confSecondary.toFixed(2));
  confidence_scores[tertiary] = parseFloat(confTertiary.toFixed(2));

  return {
    primary, secondary, tertiary,
    confidence_scores,
    decision_path: path,
    explanation: `Rule-based: ${safeRisk} profile, age ${safeAge}, income ₹${(safeIncome/100000).toFixed(1)}L`,
    fallback: true,
  };
}
