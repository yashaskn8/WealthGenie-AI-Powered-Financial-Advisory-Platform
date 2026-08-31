/**
 * WealthGenie API Client
 * Configured for the Express backend.
 * Production authentication uses an HttpOnly session cookie. Optional development
 * bearer compatibility is memory-only and never persists authentication material.
 */

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS);
const DEFAULT_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
  ? configuredTimeout
  : 20000;
const BEARER_AUTH_ENABLED = !import.meta.env.PROD
  && import.meta.env.VITE_ENABLE_BEARER_AUTH !== 'false';

const LEGACY_SENSITIVE_KEYS = [
  'wg_token', 'wg_user', 'wg_profile', 'wg_profile_complete', 'wealthgenie_user_profile',
];

export function purgeSensitiveBrowserStorage({ includeChatSession = false } = {}) {
  if (typeof window === 'undefined') return;
  for (const storageName of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[storageName];
      LEGACY_SENSITIVE_KEYS.forEach(key => storage.removeItem(key));
      if (includeChatSession) storage.removeItem('genie_session_id');
    } catch {
      // Privacy-disabled storage needs no cleanup.
    }
  }
}

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const entry of document.cookie.split(';')) {
    const value = entry.trim();
    if (value.startsWith(prefix)) {
      try { return decodeURIComponent(value.slice(prefix.length)); } catch { return null; }
    }
  }
  return null;
}

// Sensitive state is memory-only; a refresh restores it through /auth/session.
let authToken = null;
let csrfToken = readCookie('wg_csrf');
let authRevision = 0;
const authListeners = new Set();

// Track the current authenticated user
let currentUser = null;

purgeSensitiveBrowserStorage();

function notifyAuthChange() {
  authRevision += 1;
  authListeners.forEach(listener => listener());
}

export function subscribeAuth(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function getAuthSnapshot() {
  return authRevision;
}

export function setUserInfo(user) {
  currentUser = user;
  notifyAuthChange();
}

export function getUserInfo() {
  return currentUser;
}

export function setAuthToken(token) {
  authToken = BEARER_AUTH_ENABLED ? token : null;
  notifyAuthChange();
}

export function getAuthToken() {
  return authToken;
}

export function clearAuthToken() {
  authToken = null;
  csrfToken = null;
  currentUser = null;
  purgeSensitiveBrowserStorage();
  notifyAuthChange();
}

export function clearUserSession() {
  clearAuthToken();
  purgeSensitiveBrowserStorage({ includeChatSession: true });
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

export class ApiError extends Error {
  constructor(message, {
    status = null,
    code = 'API_ERROR',
    requestId = null,
    details = [],
    retryable = false,
    retryAfterMs = null,
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(30000, Math.max(0, seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(30000, Math.max(0, date - Date.now())) : null;
}

function retryDelay(attempt, retryAfterMs) {
  if (Number.isFinite(retryAfterMs)) return retryAfterMs;
  const exponential = Math.min(5000, 300 * (2 ** attempt));
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('Request cancelled.', { code: 'REQUEST_ABORTED' }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError('Request cancelled.', { code: 'REQUEST_ABORTED' }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function request(method, path, data = null, options = {}) {
  const url = `${API_BASE}${path}`;
  const upperMethod = method.toUpperCase();
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(upperMethod);
  const {
    headers: optionHeaders = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = isMutating ? 0 : 1,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const headers = { Accept: 'application/json', ...optionHeaders };
  if (data !== null && data !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (!headers['X-Correlation-ID'] && !headers['x-correlation-id']) {
    headers['X-Correlation-ID'] = generateUUID();
  }

  // Attach Idempotency-Key for mutating requests (POST, PUT, DELETE, PATCH)
  if (isMutating) {
    if (!headers['Idempotency-Key'] && !headers['idempotency-key']) {
      headers['Idempotency-Key'] = generateUUID();
    }
    const activeCsrfToken = csrfToken || readCookie('wg_csrf');
    if (!authToken && activeCsrfToken && !headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
      headers['X-CSRF-Token'] = activeCsrfToken;
    }
  }

  const maxRetries = Math.max(0, Math.min(3, Number(retries) || 0));
  const boundedTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (externalSignal?.aborted) {
      throw new ApiError('Request cancelled.', { code: 'REQUEST_ABORTED' });
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, boundedTimeout);

    const config = {
      method: upperMethod,
      headers,
      credentials: 'include',
      ...fetchOptions,
      signal: controller.signal,
    };
    if (data !== null && data !== undefined) config.body = JSON.stringify(data);

    try {
      const res = await fetch(url, config);
      let json = null;
      try {
        json = await res.json();
      } catch {
        // Some proxies and valid 204 responses do not return a JSON body.
      }

      const requestId = res.headers?.get?.('x-correlation-id') || json?.request_id || headers['X-Correlation-ID'];
      if (!res.ok) {
        if (res.status === 401) {
          clearUserSession();
          if (typeof window !== 'undefined' && window.location.pathname !== '/' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        const validationDetails = Array.isArray(json?.details) ? json.details : [];
        throw new ApiError(
          json?.message || validationDetails.join(' ') || json?.error || `Request failed with status ${res.status}`,
          {
            status: res.status,
            code: json?.code || 'HTTP_ERROR',
            requestId,
            details: validationDetails,
            retryable: RETRYABLE_STATUS.has(res.status),
            retryAfterMs: parseRetryAfter(res.headers?.get?.('retry-after')),
          }
        );
      }
      return json;
    } catch (error) {
      let apiError = error;
      if (!(error instanceof ApiError)) {
        if (timedOut) {
          apiError = new ApiError('The server took too long to respond.', {
            code: 'REQUEST_TIMEOUT', retryable: true, cause: error,
          });
        } else if (externalSignal?.aborted) {
          apiError = new ApiError('Request cancelled.', { code: 'REQUEST_ABORTED', cause: error });
        } else {
          apiError = new ApiError('Unable to reach the server. Check your connection and try again.', {
            code: 'NETWORK_ERROR', retryable: true, cause: error,
          });
        }
      }

      if (apiError.retryable && attempt < maxRetries) {
        await wait(retryDelay(attempt, apiError.retryAfterMs), externalSignal);
        continue;
      }
      throw apiError;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  throw new ApiError('Request failed.', { code: 'API_ERROR' });
}

// ─── AUTH ─────────────────────────────────────────────────
export async function register(name, email, password, mobile) {
  const data = await request('POST', '/auth/register', { name, email, password, mobile });
  csrfToken = data.csrfToken || readCookie('wg_csrf');
  setAuthToken(data.token || null);
  if (data.user) setUserInfo(data.user);
  return data;
}

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password });
  csrfToken = data.csrfToken || readCookie('wg_csrf');
  setAuthToken(data.token || null);
  if (data.user) setUserInfo(data.user);
  return data;
}

export async function logout() {
  try {
    if (authToken || currentUser) {
      return await request('POST', '/auth/logout', {}, { timeoutMs: 5000, retries: 0 });
    }
    return null;
  } finally {
    clearUserSession();
  }
}

export async function restoreSession(options = {}) {
  const data = await request('GET', '/auth/session', null, { retries: 0, ...options });
  csrfToken = data?.csrfToken || readCookie('wg_csrf');
  if (data?.user) setUserInfo(data.user);
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
    const requestOptions = age && typeof age === 'object' ? age : {};
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
    return request('POST', '/profile/build', payload, requestOptions);
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

export async function getCurrentProfile(options = {}) {
  return request('GET', '/profile/current', null, { retries: 0, ...options });
}

export async function updateProfile(profileId, payload) {
  return request('PUT', `/profile/${profileId}`, payload);
}

// ─── RECOMMENDATIONS ─────────────────────────────────────
export async function getRecommendations(profileId, options = {}) {
  return request('POST', '/recommend', { profileId }, options);
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
export async function healthCheck(options = {}) {
  return request('GET', '/health', null, options);
}

// ─── MARKET DATA ─────────────────────────────────────────
export async function getMarketRates() {
  return request('GET', '/market/rates');
}

export async function refreshMarketRates() {
  return request('POST', '/market/refresh');
}

// ─── CHAT (Genie) ────────────────────────────────────────
export async function sendChatMessage(message, sessionId, options = {}) {
  return request('POST', '/chat/message', { message, session_id: sessionId }, { timeoutMs: 45000, ...options });
}

export async function getChatHistory(sessionId) {
  const params = new URLSearchParams({ session_id: String(sessionId), limit: '50' });
  return request('GET', `/chat/history?${params.toString()}`);
}

export async function clearChatSession(sessionId) {
  return request('DELETE', `/chat/session/${encodeURIComponent(sessionId)}`);
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
  register, login, logout, restoreSession,
  setAuthToken, getAuthToken, clearAuthToken, clearUserSession,
  subscribeAuth, getAuthSnapshot,
  setUserInfo, getUserInfo,
  buildProfile, getCurrentProfile, updateProfile, getRecommendations, getInstruments, getProjections,
  runMonteCarlo, createGoal, getGoals, updateGoal, deleteGoal, healthCheck,
  getMarketRates, refreshMarketRates,
  sendChatMessage, getChatHistory, clearChatSession, rebalancePortfolio,
  updateRecommendationWeights, optimisePortfolio,
  computeTax, compareTax, computePostTaxReturn, computePostTaxReturnBatch,
};

export default api;
