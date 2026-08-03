/**
 * WealthGenie API Client
 * Axios instance configured for the Express backend.
 * Token is stored in memory (not localStorage) for security.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api';

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

async function request(method, path, data = null, options = {}, retries = 2) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const config = { method, headers, ...options };
  if (data) config.body = JSON.stringify(data);

  try {
    const res = await fetch(url, config);
    const json = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        clearAuthToken();
        if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      throw new Error(json.error || `Request failed with status ${res.status}`);
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
export async function register(name, email, password) {
  const data = await request('POST', '/auth/register', { name, email, password });
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
  monthlyIncome, age, monthlySavings, regime = 'new', investmentHorizon = 15,
  liquidSavings = 0, existingDebt = 0, dependents = 0, emergencyFundMonths = 0,
  riskTolerance = 'Moderate', goalType = 'wealth-building',
  totalCTC = 0, basicComponent = 0, monthlyTakeHome = 0,
  soldPropertyAmount = 0, hasLumpSum = false, lumpSumAmount = 0
) {
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
  return request('POST', '/montecarlo/montecarlo', {
    instrument,
    monthly_investment: monthlyInvestment,
    years,
    target_amount: targetAmount || null,
    profileId: profileId || null,
    current_savings: currentSavings || 0,
  });
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
  return request('POST', '/recommend/weights', { profileId, weights });
}

export async function optimisePortfolio(profileId, assets, strategy = 'max_sharpe') {
  return request('POST', '/portfolio/optimise', {
    profileId,
    assets,
    strategy,
  });
}

// Default export for convenience
const api = {
  register, login, setAuthToken, getAuthToken, clearAuthToken,
  setUserInfo, getUserInfo,
  buildProfile, getRecommendations, getInstruments, getProjections,
  runMonteCarlo, createGoal, getGoals, updateGoal, deleteGoal, healthCheck,
  sendChatMessage, getChatHistory, clearChatSession, rebalancePortfolio,
  updateRecommendationWeights, optimisePortfolio,
  computeTax, compareTax,
};

export default api;
