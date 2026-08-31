import { trace } from '@opentelemetry/api';

const RISK_CATEGORIES = new Set([
  'Conservative', 'Conservative-Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive',
]);
const RISK_TOLERANCES = new Set(['Conservative', 'Moderate', 'Aggressive']);
const GOAL_TYPES = new Set(['retirement', 'house purchase', 'education', 'wealth-building']);

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildTracingHeaders(correlationId = null) {
  const headers = {};
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const context = activeSpan.spanContext();
    headers.traceparent = `00-${context.traceId}-${context.spanId}-01`;
    if (!correlationId) correlationId = context.traceId;
  }
  if (correlationId) {
    const value = String(correlationId);
    headers['X-Correlation-ID'] = value;
    if (!headers.traceparent) {
      const traceId = value.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').slice(0, 32);
      headers.traceparent = `00-${traceId}-${'0'.repeat(15)}1-01`;
    }
  }
  return headers;
}

export function buildPredictionRequest(profileData) {
  const debt = profileData.existing_debt_emi_ratio_pct ?? profileData.existing_debt;
  const request = {
    age: finiteNumber(profileData.age),
    annual_income: finiteNumber(profileData.annual_income),
    monthly_savings: finiteNumber(profileData.monthly_savings),
    risk_category: profileData.risk_category,
    liquid_savings: finiteNumber(profileData.liquid_savings),
    existing_debt: finiteNumber(debt),
    dependents: finiteNumber(profileData.dependents),
    emergency_fund_months: finiteNumber(profileData.emergency_fund_months),
    risk_tolerance: profileData.risk_tolerance,
    goal_type: profileData.goal_type,
    investment_horizon: finiteNumber(profileData.investment_horizon ?? 15),
  };

  const numbersValid = Object.entries(request)
    .filter(([key]) => !['risk_category', 'risk_tolerance', 'goal_type'].includes(key))
    .every(([, value]) => value !== null);
  if (!numbersValid
    || !RISK_CATEGORIES.has(request.risk_category)
    || !RISK_TOLERANCES.has(request.risk_tolerance)
    || !GOAL_TYPES.has(request.goal_type)) return null;
  return request;
}

export function normalizePredictionResponse(value) {
  if (!value || typeof value !== 'object') return null;
  if (![value.primary, value.secondary, value.tertiary].every(nonEmptyString)) return null;
  if (!value.confidence_scores || typeof value.confidence_scores !== 'object' || Array.isArray(value.confidence_scores)) return null;
  if (!Object.values(value.confidence_scores).every(score => Number.isFinite(Number(score)))) return null;
  if (!Array.isArray(value.decision_path) || !value.decision_path.every(nonEmptyString)) return null;
  if (!nonEmptyString(value.model_version)) return null;
  if (value.explanation !== null && value.explanation !== undefined && typeof value.explanation !== 'object') return null;

  return {
    ...value,
    confidence_scores: Object.fromEntries(
      Object.entries(value.confidence_scores).map(([key, score]) => [key, Number(score)]),
    ),
    fallback: value.fallback === true,
  };
}

export function buildRagQueryRequest({ query, top_k = 4 }) {
  if (!nonEmptyString(query) || query.trim().length < 3) return null;
  const parsedTopK = Math.trunc(Number(top_k));
  if (!Number.isFinite(parsedTopK) || parsedTopK < 1 || parsedTopK > 20) return null;
  return { question: query.trim(), top_k: parsedTopK };
}

export function normalizeRagResponse(value) {
  if (!value || typeof value !== 'object' || !nonEmptyString(value.answer)) return null;
  if (typeof value.grounded !== 'boolean') return null;
  if (!Array.isArray(value.citations) || !Array.isArray(value.retrieved_chunks)) return null;
  if (!value.metrics || typeof value.metrics !== 'object' || Array.isArray(value.metrics)) return null;
  if (value.grounded && value.citations.length === 0) return null;
  return {
    ...value,
    citations: value.grounded ? value.citations : [],
    retrieved_chunks: value.grounded ? value.retrieved_chunks : [],
  };
}
