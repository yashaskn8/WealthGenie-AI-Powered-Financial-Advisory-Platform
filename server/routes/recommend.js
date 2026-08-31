import { Router } from 'express';
import { verifyJWT, isOwner, isValidObjectId } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, recommendSchema, updateWeightsSchema } from '../validation/schemas.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import AuditRecord from '../models/AuditRecord.js';
import logger from '../utils/logger.js';
import { getMLPrediction } from '../services/mlClient.js';
import { getTaxSlab, REGULATORY_RULE_VERSION } from '../services/taxEngine.js';
import { generateAdvisory } from '../services/geminiService.js';
import { runPipeline } from '../services/RecommendationPipeline.js';
import { getLiveInstrumentParams } from '../services/marketDataService.js';
import { claimAdvisoryIdempotency, releaseAdvisoryIdempotency } from '../middleware/idempotency.js';
import { persistAdvisoryAtomically } from '../services/advisoryPersistence.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { setCache, delCache } from '../config/redis.js';
import { RISK_FREE_RATE, DISCLAIMER } from '../services/instrumentConstants.js';

const router = Router();

function buildProfileHash(profile) {
  return crypto.createHash('sha256').update(JSON.stringify({
    age: profile.age,
    income: profile.annualIncome,
    savings: profile.savings,
    riskCategory: profile.riskCategory,
    risk_tolerance: profile.risk_tolerance,
    regime: profile.taxRegime,
    horizon: profile.investmentHorizon,
    emergency_fund_months: profile.emergency_fund_months,
    hasLumpSum: profile.hasLumpSum,
    lumpSumAmount: profile.lumpSumAmount,
    soldPropertyAmount: profile.soldPropertyAmount,
    liquid_savings: profile.liquid_savings,
    existing_debt: profile.existing_debt,
    dependents: profile.dependents,
    goal_type: profile.goal_type,
  })).digest('hex').substring(0, 16);
}

export function buildRecommendationCacheKey(userId, profileId, profile) {
  return `recommendation:${userId}:${profileId}:${buildProfileHash(profile)}`;
}

/**
 * POST /api/recommend [Protected]
 * Generate investment recommendations for a financial profile.
 */
router.post('/', verifyJWT, validate(recommendSchema), asyncHandler(async (req, res) => {
  const { profileId } = req.body;

  if (!isValidObjectId(profileId)) {
    throw createError(400, 'Invalid profileId format', 'Invalid profile ID.');
  }

  const profile = await FinancialProfile.findOne({ _id: profileId, userId: req.user.userId }).lean();
  if (!profile) {
    throw createError(404, `Profile not found: ${profileId}`, 'Profile not found.');
  }

  // Authorization: verify the profile belongs to the requesting user
  if (!isOwner(profile, req.user.userId)) {
    throw createError(403, `User ${req.user.userId} tried to access profile ${profileId}`, 'Access denied.');
  }

  const idempotencyClaim = await claimAdvisoryIdempotency({
    key: req.headers['idempotency-key'],
    userId: req.user.userId,
    profileId: profile._id,
    payload: req.body,
  });
  if (idempotencyClaim.state === 'REPLAY') {
    res.setHeader('X-Cache-Lookup', 'HIT - Idempotent');
    return res.status(idempotencyClaim.response.status).json(idempotencyClaim.response.body);
  }

  try {
    // Call ML microservice
    const mlResult = await getMLPrediction({
    age: profile.age,
    annual_income: profile.annualIncome,
    monthly_savings: profile.savings,
    risk_category: profile.riskCategory,
    liquid_savings: profile.liquid_savings !== undefined ? profile.liquid_savings : 0,
    existing_debt: profile.existing_debt !== undefined ? profile.existing_debt : (profile.existing_debt_emi_ratio_pct !== undefined ? profile.existing_debt_emi_ratio_pct : 0),
    existing_debt_emi_ratio_pct: profile.existing_debt_emi_ratio_pct !== undefined ? profile.existing_debt_emi_ratio_pct : (profile.existing_debt !== undefined ? profile.existing_debt : 0),
    dependents: profile.dependents !== undefined ? profile.dependents : 0,
    emergency_fund_months: profile.emergency_fund_months !== undefined ? profile.emergency_fund_months : 0,
    risk_tolerance: profile.risk_tolerance || 'Moderate',
    goal_type: profile.goal_type || 'wealth-building',
    investment_horizon: profile.investmentHorizon || 15
  }, req.correlationId, req.user.userId);

  // ── Run the metadata-driven RecommendationPipeline ──────────────
  await getLiveInstrumentParams().catch(() => {});

  const { instruments, confidenceScores, riskReconciliation, computedWeights } = runPipeline(profile, mlResult);

  if (instruments.length === 0) {
    throw createError(502, 'RecommendationPipeline returned no instruments', 'Recommendation engine returned empty results.');
  }

  // Portfolio-level expected yield (weighted average of post-tax returns)
  const portfolioYield = parseFloat(
    instruments.reduce((s, i) => s + (i.effectiveYield * i.allocationWeight), 0).toFixed(2)
  );

  // Call Groq/Gemini for advisory text
  const marginalRate = getTaxSlab(profile.annualIncome, profile.taxRegime);
  const advisory = await generateAdvisory({
    age: profile.age,
    annualIncome: profile.annualIncome,
    monthlySavings: profile.savings,
    taxSlab: marginalRate,
    riskCategory: profile.riskCategory,
    instruments: instruments.map(i => ({ name: i.name, type: i.type, postTaxReturn: i.postTaxReturn })),
    horizon: profile.investmentHorizon || 15,
    shapExplanation: mlResult.explanation || null,
  });

    const recommendationId = new mongoose.Types.ObjectId();
    const auditId = new mongoose.Types.ObjectId();
    const modelVersion = mlResult.model_version || (mlResult.fallback ? 'rule_fallback' : '2.0');
    const auditTimestamp = new Date();

    // ── Synchronous Audit Log Write (Regulatory Compliance - Fail Loudly) ──
    const sanitizedInputs = {
    age: profile.age,
    annual_income: profile.annualIncome,
    monthly_savings: profile.savings,
    risk_category: profile.riskCategory,
    liquid_savings: profile.liquid_savings,
    existing_debt: profile.existing_debt,
    dependents: profile.dependents,
    emergency_fund_months: profile.emergency_fund_months,
    risk_tolerance: profile.risk_tolerance,
    goal_type: profile.goal_type,
    tax_regime: profile.taxRegime,
    investment_horizon: profile.investmentHorizon || 15,
  };
    const inputHash = crypto.createHash('sha256').update(JSON.stringify(sanitizedInputs)).digest('hex');
    const correlationId = req.correlationId || req.traceId || crypto.randomUUID();
    const citedRagChunkIds = advisory.cited_chunks || mlResult.cited_chunk_ids || [];
    const recommendationData = {
      _id: recommendationId,
      userId: req.user.userId,
      profileId: profile._id,
      instruments,
      advisoryText: advisory.text,
      confidenceScores,
      mlFallback: mlResult.fallback || false,
      modelVersion,
    };
    const auditRecordData = {
      _id: auditId,
      userId: req.user.userId,
      profileId: profile._id,
      recommendationId,
      correlationId,
      traceId: req.traceId || req.correlationId || '',
      version_id: modelVersion || '1.0.0',
      regulatory_rule_version: REGULATORY_RULE_VERSION,
      input_hash: inputHash,
      inputs: sanitizedInputs,
      recommendations: {
        instruments,
        confidenceScores,
        portfolioYield,
        modelVersion,
        regulatoryRuleVersion: REGULATORY_RULE_VERSION,
        advisorySummary: advisory.text ? advisory.text.slice(0, 500) : '',
      },
      cited_rag_chunk_ids: citedRagChunkIds,
      engine: mlResult.fallback ? 'rule_fallback' : 'ml_service',
      timestamp: auditTimestamp,
    };

    const result = {
    recommendationId,
    audit_id: auditId,
    audit_hash: inputHash,
    instruments,
    ranked: true,
    advisory_text: advisory.text,
    confidence_scores: confidenceScores,
    decision_path: mlResult.decision_path,
    explanation: mlResult.explanation || null,
    ml_fallback: mlResult.fallback || false,
    model_version: modelVersion,
    regulatory_rule_version: REGULATORY_RULE_VERSION,
    portfolio_yield: portfolioYield,
    risk_free_rate: parseFloat((RISK_FREE_RATE * 100).toFixed(2)),
    disclaimer: DISCLAIMER,
    // Section 7: Risk reconciliation metadata
    final_risk_tier: riskReconciliation.final_risk_tier,
    capacity_score: riskReconciliation.capacity_score,
    preference_score: riskReconciliation.preference_score,
    reconciliation_note: riskReconciliation.reconciliation_note,
    advisory_note: riskReconciliation.advisory_note,
    excluded_due_to_eligibility: riskReconciliation.excluded_due_to_eligibility,
    // WG-004: Attach backend-computed scoring weights in both snake_case and camelCase
    computed_weights: computedWeights,
    computedWeights: computedWeights,
    };

    await persistAdvisoryAtomically({
      recommendation: recommendationData,
      auditRecord: auditRecordData,
      response: result,
      idempotencyClaim,
    });

    // This cache is an optimization only. Idempotent replay is sourced from
    // the transactionally persisted operation, never from Redis.
    const cacheKey = buildRecommendationCacheKey(req.user.userId, profile._id, profile);
    await setCache(cacheKey, result, 86400).catch(error => {
      logger.warn('Recommendation cache write failed after committed advisory', { error: error.message });
    });

    res.json(result);
  } catch (error) {
    await releaseAdvisoryIdempotency(idempotencyClaim).catch(releaseError => {
      logger.error('Failed to release advisory idempotency claim', {
        operationId: idempotencyClaim.operationId,
        error: releaseError.message,
      });
    });
    throw error;
  }
}));

/**
 * GET /api/recommend/audit [Protected]
 * Retrieve immutable audit trail records for regulatory compliance.
 */
router.get('/audit', verifyJWT, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const skip = Math.max(parseInt(req.query.skip) || 0, 0);

  const query = { userId: req.user.userId };
  if (req.query.correlationId) {
    query.correlationId = req.query.correlationId;
  }
  if (req.query.profileId && isValidObjectId(req.query.profileId)) {
    query.profileId = req.query.profileId;
  }

  const [records, total] = await Promise.all([
    AuditRecord.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditRecord.countDocuments(query),
  ]);

  res.json({
    status: 'success',
    total,
    count: records.length,
    skip,
    limit,
    records,
  });
}));

/**
 * GET /api/recommend/audit/:id [Protected]
 * Retrieve specific audit trail record by ID.
 */
router.get('/audit/:id', verifyJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    throw createError(400, 'Invalid audit ID format', 'Invalid audit ID.');
  }

  const record = await AuditRecord.findById(id).lean();
  if (!record) {
    throw createError(404, 'Audit record not found', 'Audit record not found.');
  }

  if (record.userId.toString() !== req.user.userId.toString() && req.user.role !== 'admin') {
    throw createError(403, 'Access denied to audit record', 'Access denied.');
  }

  res.json({
    status: 'success',
    record,
  });
}));

/**
 * POST /api/recommend/weights [Protected]
 * Updates allocation weights of a recommendation.
 */
router.post('/weights', verifyJWT, validate(updateWeightsSchema), asyncHandler(async (req, res) => {
  const { profileId, weights } = req.body;

  const profile = await FinancialProfile.findOne({ _id: profileId, userId: req.user.userId }).lean();
  if (!profile) {
    throw createError(404, `Profile not found: ${profileId}`, 'Profile not found.');
  }

  if (!isOwner(profile, req.user.userId)) {
    throw createError(403, `Access denied`, 'Access denied.');
  }

  // Find the latest recommendation for this profile & user
  const recommendation = await Recommendation.findOne({ profileId, userId: req.user.userId }).sort({ generatedAt: -1 });
  if (!recommendation) {
    throw createError(404, 'No recommendation found to update', 'No recommendation found.');
  }

  // Update weights on instruments
  const parsedWeights = {};
  let totalWeight = 0;
  for (const [k, v] of Object.entries(weights || {})) {
    const val = Number(v) || 0;
    if (val < 0) continue;
    parsedWeights[k] = val;
    totalWeight += val;
  }

  if (totalWeight <= 0) {
    throw createError(400, 'Invalid weights', 'Total weights must be greater than zero.');
  }

  // Map of weights normalized to sum to exactly 1.0
  const normWeights = {};
  for (const [k, v] of Object.entries(parsedWeights)) {
    normWeights[k.toUpperCase()] = v / totalWeight;
  }

  // Update the recommendation instruments
  recommendation.instruments.forEach(inst => {
    const weight = normWeights[inst.type.toUpperCase()] ?? 0;
    inst.allocationWeight = parseFloat(weight.toFixed(4));
  });

  // Re-normalize instruments weights to sum to EXACTLY 1.0 (to avoid rounding issues)
  const instWeightSum = recommendation.instruments.reduce((s, i) => s + i.allocationWeight, 0);
  if (instWeightSum > 0 && Math.abs(instWeightSum - 1.0) > 0.0001) {
    const maxIdx = recommendation.instruments.reduce((mi, w, i, arr) => w.allocationWeight > arr[mi].allocationWeight ? i : mi, 0);
    recommendation.instruments[maxIdx].allocationWeight = parseFloat((recommendation.instruments[maxIdx].allocationWeight + (1.0 - instWeightSum)).toFixed(4));
  }

  await recommendation.save();

  // Invalidate Redis cache for this recommendation
  const cacheKey = buildRecommendationCacheKey(req.user.userId, profile._id, profile);
  await delCache(cacheKey);

  res.json({
    status: 'success',
    message: 'Recommendation weights updated successfully.',
    instruments: recommendation.instruments,
  });
}));

export default router;
