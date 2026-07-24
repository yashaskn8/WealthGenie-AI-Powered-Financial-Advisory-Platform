import { Router } from 'express';
import { verifyJWT, isOwner, isValidObjectId } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, recommendSchema, updateWeightsSchema } from '../validation/schemas.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import { getMLPrediction } from '../services/mlClient.js';
import { getTaxSlab } from '../services/taxEngine.js';
import { generateAdvisory } from '../services/geminiService.js';
import { runPipeline } from '../services/RecommendationPipeline.js';
import crypto from 'crypto';
import { getCache, setCache, delCache } from '../config/redis.js';
import { RISK_FREE_RATE, DISCLAIMER } from '../services/instrumentConstants.js';

const router = Router();

function buildProfileHash(profile) {
  return crypto.createHash('sha256').update(JSON.stringify({
    age: profile.age,
    income: profile.annualIncome,
    savings: profile.savings,
    risk: profile.riskCategory,
    regime: profile.taxRegime,
    horizon: profile.investmentHorizon,
  })).digest('hex').substring(0, 16);
}

export function buildRecommendationCacheKey(userId, profileId, profile) {
  return `recommendation:${userId}:${profileId}:${buildProfileHash(profile)}`;
}

// DISCLAIMER and RISK_FREE_RATE imported from instrumentConstants.js

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

  // Check Redis cache to prevent redundant recalculations
  const cacheKey = buildRecommendationCacheKey(req.user.userId, profile._id, profile);

  const cachedResult = await getCache(cacheKey);
  if (cachedResult) {
    return res.json(cachedResult);
  }

  // Call ML microservice
  const mlResult = await getMLPrediction({
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
    investment_horizon: profile.investmentHorizon || 15
  }, req.correlationId);

  // ── Run the metadata-driven RecommendationPipeline ──────────────
  // This replaces the previous hardcoded demographic & tax overrides
  // with a modular pipeline: eligibility → scoring → ranking → diversity
  const { instruments, confidenceScores } = runPipeline(profile, mlResult);

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

  // Save recommendation to DB
  const rec = await Recommendation.create({
    userId: req.user.userId,
    profileId: profile._id,
    instruments,
    advisoryText: advisory.text,
    confidenceScores,
    mlFallback: mlResult.fallback || false,
    modelVersion: mlResult.model_version || (mlResult.fallback ? 'rule_fallback' : '2.0'),
  });

  const result = {
    recommendationId: rec._id,
    instruments,
    ranked: true,
    advisory_text: advisory.text,
    confidence_scores: confidenceScores,
    decision_path: mlResult.decision_path,
    explanation: mlResult.explanation || null,
    ml_fallback: mlResult.fallback || false,
    model_version: rec.modelVersion,
    portfolio_yield: portfolioYield,
    risk_free_rate: parseFloat((RISK_FREE_RATE * 100).toFixed(2)),
    disclaimer: DISCLAIMER,
  };

  // Cache for 24 hours
  await setCache(cacheKey, result, 86400);

  res.json(result);
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
