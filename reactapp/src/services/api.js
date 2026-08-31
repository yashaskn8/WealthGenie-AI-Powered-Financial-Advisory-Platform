/**
 * WealthGenie API Client
 * Configured for the Express backend.
 * Auth tokens and user state are stored in localStorage to provide session persistence
 * across page refreshes and SPA navigation (with standard XSS risk mitigated via CSP/sanitization).
 */

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

// Restore token from localStorage on module load (survives page reload)
let authToken = localStorage.getItem('wg_token') || null;

// Track the current authenticated user
let currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('wg_user') || 'null'); } catch { return null; }
})();

export function setUserInfo(user) {
  currentUser = user;
  if (user) {
    localStorage.setItem('wg_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('wg_user');
  }
}

export function getUserInfo() {
  return currentUser;
}

export function setAuthToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('wg_token', token);
  } else {
    localStorage.removeItem('wg_token');
  }
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('wg_token');
  setUserInfo(null);
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function request(method, path, data = null, options = {}, retries = 2) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  // Attach Idempotency-Key for mutating requests (POST, PUT, DELETE, PATCH)
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
  if (isMutating) {
    if (!headers['Idempotency-Key'] && !headers['idempotency-key']) {
      // Re-use key stored in options._idempotencyKey during retries, or generate fresh UUIDv4
      if (!options._idempotencyKey) {
        options._idempotencyKey = generateUUID();
      }
      headers['Idempotency-Key'] = options._idempotencyKey;
    }
  }

  const { _idempotencyKey, ...fetchOptions } = options;
  const config = { method, headers, ...fetchOptions };
  if (data) config.body = JSON.stringify(data);
  try {
    const res = await fetch(url, config);
    let json = null;
    try {
      json = await res.json();
    } catch {
      // Some proxies and valid 204 responses do not return a JSON body.
    }

    if (!res.ok) {
      if (res.status === 401) {
        clearAuthToken();
        if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      const validationDetails = Array.isArray(json?.details) ? json.details.join(' ') : null;
      throw new Error(
        json?.message || validationDetails || json?.error || `Request failed with status ${res.status}`
      );
    }
    return json;
  } catch (err) {
    // Retry on network errors (like 'Failed to fetch' which happens if the dev server restarts)
    if (retries > 0 && err.message.includes('Failed to fetch')) {
      console.warn(`[API] Network error: ${err.message}. Retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return request(method, path, data, options, retries - 1);
    }
    throw err;
  }
}

// ─── AUTH ─────────────────────────────────────────────────
export async function register(name, email, password, mobile) {
  const data = await request('POST', '/auth/register', { name, email, password, mobile });
  if (data.token) setAuthToken(data.token);
  if (data.user) setUserInfo(data.user);
  return data;
}

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password });
  if (data.token) setAuthToken(data.token);
  if (data.user) setUserInfo(data.user);
  return data;
}

// ─── PROFILE ─────────────────────────────────────────────
export async function buildProfile(
  firstArg, age, monthlySavings, regime = 'new', investmentHorizon = 15,
  liquidSavings = 0, existingDebt = 0, dependents = 0, emergencyFundMonths = 0,
  riskTolerance = 'Moderate', goalType = 'wealth-building',
  totalCTC = 0, basicComponent = 0, monthlyTakeHome = 0,
  soldPropertyAmount = 0, hasLumpSum = false, lumpSumAmount = 0
) {
  if (typeof firstArg === 'object' && firstArg !== null) {
    const p = firstArg;
    const monthlyIncome = Number(p.monthly_income !== undefined ? p.monthly_income : (p.monthlyIncome || 0));
    const annualIncome = monthlyIncome * 12;
    const totalCtcVal = Number(p.total_ctc !== undefined ? p.total_ctc : (p.totalCTC || annualIncome));
    const basicCompVal = Number(p.basic_component !== undefined ? p.basic_component : (p.basicComponent || (totalCtcVal * 0.5)));
    const takeHomeVal = Number(p.monthly_take_home !== undefined ? p.monthly_take_home : (p.monthlyTakeHome || monthlyIncome));
    const hasLump = Boolean(p.has_lump_sum !== undefined ? p.has_lump_sum : p.hasLumpSum);
    const lumpAmount = hasLump ? Number(p.lump_sum_amount !== undefined ? p.lump_sum_amount : (p.lumpSumAmount || 0)) : 0;

    const payload = {
      monthly_income: monthlyIncome,
      age: Number(p.age || 30),
      monthly_savings: Number(p.monthly_savings !== undefined ? p.monthly_savings : (p.monthlySavings || 0)),
      regime: p.regime || p.taxRegime || 'new',
      investment_horizon: Number(p.investment_horizon !== undefined ? p.investment_horizon : (p.investmentHorizon || 15)),
      liquid_savings: Number(p.liquid_savings !== undefined ? p.liquid_savings : (p.liquidSavings || 0)),
      existing_debt: Number(p.existing_debt !== undefined ? p.existing_debt : (p.existingDebt || 0)),
      dependents: Number(p.dependents !== undefined ? p.dependents : 0),
      emergency_fund_months: Number(p.emergency_fund_months !== undefined ? p.emergency_fund_months : (p.emergencyFundMonths || 0)),
      risk_tolerance: p.risk_tolerance || p.riskTolerance || 'Moderate',
      goal_type: p.goal_type || p.goalType || 'wealth-building',
      total_ctc: totalCtcVal,
      basic_component: basicCompVal,
      monthly_take_home: takeHomeVal,
      sold_property_amount: Number(p.sold_property_amount !== undefined ? p.sold_property_amount : (p.soldPropertyAmount || 0)),
      has_lump_sum: hasLump,
      lump_sum_amount: lumpAmount,
      goals: p.goals || p.investment_goals || undefined,
      investment_goals: p.investment_goals || p.goals || undefined,
      // Tax deduction fields (WG-DEDUCTIONS-COLLECTION)
      section_80c: Number(p.section80C !== undefined ? p.section80C : (p.section_80c || 0)),
      section_80ccd1b: Number(p.section80CCD1B !== undefined ? p.section80CCD1B : (p.section_80ccd1b || p.nps80CCD1B || p.section80CCD || 0)),
      section_80d_self: Number(p.section80D_self !== undefined ? p.section80D_self : (p.section_80d_self || 0)),
      section_80d_parents: Number(p.section80D_parents !== undefined ? p.section80D_parents : (p.section_80d_parents || 0)),
      parents_senior: Boolean(p.parentsSenior !== undefined ? p.parentsSenior : p.parents_senior),
      hra: Number(p.hra || 0),
      home_loan_interest: Number(p.homeLoanInterest !== undefined ? p.homeLoanInterest : (p.home_loan_interest || 0)),
      section_80eea: Number(p.section80EEA !== undefined ? p.section80EEA : (p.section_80eea || 0)),
      income_source: p.incomeSource || p.income_source || 'salary',
    };
    return request('POST', '/profile/build', payload);
  }

  // Backward-compatible positional arguments handling
  const monthlyIncome = firstArg;
  return request('POST', '/profile/build', {
    monthly_income: monthlyIncome,
    age,
    monthly_savings: monthlySavings,
    regime,
    investment_horizon: investmentHorizon,
    liquid_savings: liquidSavings,
    existing_debt: existingDebt,
    dependents,
    emergency_fund_months: emergencyFundMonths,
    risk_tolerance: riskTolerance,
    goal_type: goalType,
    total_ctc: totalCTC || (monthlyIncome * 12),
    basic_component: basicComponent || ((totalCTC || (monthlyIncome * 12)) * 0.5),
    monthly_take_home: monthlyTakeHome || monthlyIncome,
    sold_property_amount: soldPropertyAmount,
    has_lump_sum: hasLumpSum,
    lump_sum_amount: hasLumpSum ? lumpSumAmount : 0
  });
}

export async function updateProfile(profileId, payload) {
  return request('PUT', `/profile/${profileId}`, payload);
}

// ─── RECOMMENDATIONS ─────────────────────────────────────
export async function getRecommendations(profileId) {
  return request('POST', '/recommend', { profileId });
}

// ─── INSTRUMENTS ─────────────────────────────────────────
export async function getInstruments(type, sort = 'rate', order = 'desc', limit = 20) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  params.set('sort', sort);
  params.set('order', order);
  params.set('limit', limit);
  return request('GET', `/instruments?${params.toString()}`);
}

// ─── PROJECTIONS ─────────────────────────────────────────
export async function getProjections(profileId, instruments, monthlyInvestment, years) {
  return request('POST', '/projection', {
    profileId,
    instruments,
    monthly_investment: monthlyInvestment,
    years: years || [5, 10, 15, 20],
  });
}

// ─── MONTE CARLO ─────────────────────────────────────────
export async function runMonteCarlo(instrument, monthlyInvestment, years, targetAmount, profileId = null, currentSavings = 0) {
  const payload = {
    instrument,
    monthly_investment: monthlyInvestment,
    years,
    current_savings: currentSavings || 0,
  };
  if (targetAmount !== null && targetAmount !== undefined && targetAmount !== '') {
    payload.target_amount = targetAmount;
  }
  if (profileId) payload.profileId = profileId;
  return request('POST', '/montecarlo/montecarlo', payload);
}

// ─── GOALS ───────────────────────────────────────────────
export async function createGoal(goalData) {
  return request('POST', '/goals/create', goalData);
}

export async function getGoals() {
  return request('GET', '/goals');
}

export async function updateGoal(goalId, goalData) {
  return request('PATCH', `/goals/${goalId}`, goalData);
}

export async function deleteGoal(goalId) {
  return request('DELETE', `/goals/${goalId}`);
}

// ─── HEALTH ──────────────────────────────────────────────
export async function healthCheck() {
  return request('GET', '/health');
}

// ─── MARKET DATA ─────────────────────────────────────────
export async function getMarketRates() {
  return request('GET', '/market/rates');
}

export async function refreshMarketRates() {
  return request('POST', '/market/refresh');
}

// ─── CHAT (Genie) ────────────────────────────────────────
export async function sendChatMessage(message, sessionId) {
  return request('POST', '/chat/message', { message, session_id: sessionId });
}

export async function getChatHistory(sessionId) {
  return request('GET', `/chat/history?session_id=${sessionId}&limit=50`);
}

export async function clearChatSession(sessionId) {
  return request('DELETE', `/chat/session/${sessionId}`);
}

export async function computeTax(income, regime = 'new', deductions = {}) {
  const params = new URLSearchParams({ income: String(income), regime });
  Object.entries(deductions).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  return request('GET', `/tax/compute?${params.toString()}`);
}

export async function compareTax(income, deductions = {}) {
  const params = new URLSearchParams({ income: String(income) });
  Object.entries(deductions).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  });
  return request('GET', `/tax/compare?${params.toString()}`);
}

export async function rebalancePortfolio(currentAllocation, targetAllocation, threshold = 2.0, partialRatio = 1.0, holdingMonths = 24) {
  return request('POST', '/portfolio/rebalance', {
    current_allocation: currentAllocation,
    target_allocation: targetAllocation,
    threshold,
    partial_ratio: partialRatio,
    holding_months: holdingMonths,
  });
}

export async function updateRecommendationWeights(profileId, weights) {
  const numericWeights = Object.fromEntries(
    Object.entries(weights || {}).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
  );
  const total = Object.values(numericWeights).reduce((sum, value) => sum + value, 0);
  const normalizedWeights = total > 0
    ? Object.fromEntries(Object.entries(numericWeights).map(([key, value]) => [key, value / total]))
    : numericWeights;
  return request('POST', '/recommend/weights', { profileId, weights: normalizedWeights });
}

export async function optimisePortfolio(profileId, assets, strategy = 'max_sharpe') {
  return request('POST', '/portfolio/optimise', {
    profileId,
    assets,
    strategy,
  });
}

// ─── POST-TAX RETURN (WG-038: backend single source of truth) ────
export async function computePostTaxReturn(instrumentType, nominalRate, annualIncome, holdingYears, regime, monthlySIP, userAge) {
  return request('POST', '/tax/post-tax-return', {
    instrumentType, nominalRate, annualIncome, holdingYears, regime, monthlySIP, userAge,
  });
}

export async function computePostTaxReturnBatch(instruments, annualIncome, regime, userAge) {
  return request('POST', '/tax/post-tax-return/batch', {
    instruments, annualIncome, regime, userAge,
  });
}

// Default export for convenience
const api = {
  register, login, setAuthToken, getAuthToken, clearAuthToken,
  setUserInfo, getUserInfo,
  buildProfile, updateProfile, getRecommendations, getInstruments, getProjections,
  runMonteCarlo, createGoal, getGoals, updateGoal, deleteGoal, healthCheck,
  getMarketRates, refreshMarketRates,
  sendChatMessage, getChatHistory, clearChatSession, rebalancePortfolio,
  updateRecommendationWeights, optimisePortfolio,
  computeTax, compareTax, computePostTaxReturn, computePostTaxReturnBatch,
};

export default api;
