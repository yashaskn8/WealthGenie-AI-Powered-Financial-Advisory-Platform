import { Router } from 'express';
import { verifyJWT } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, profileSchema } from '../validation/schemas.js';
import { computeTax, getTaxSlab, compareTaxRegimes } from '../services/taxEngine.js';
import { getRiskProfile } from '../services/riskProfiler.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { delCache, redisClient, redisAvailable } from '../config/redis.js';
import { idempotency } from '../middleware/idempotency.js';

const router = Router();

// Profile creation throttle — max profiles per user per hour
// STATELESS: Uses shared Redis counter. No per-process in-memory state.
const PROFILE_RATE_LIMIT = 10;

async function checkProfileRateLimit(userId) {
  if (!redisAvailable || !redisClient) {
    // Without Redis, skip throttle rather than diverging per-process state.
    return true;
  }
  try {
    const key = `profile:ratelimit:${userId}`;
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, 3600);
    return count <= PROFILE_RATE_LIMIT;
  } catch {
    // Redis failure — allow request through to avoid blocking users.
    return true;
  }
}

/**
 * POST /api/profile/build [Protected]
 * Builds a financial profile with tax computation and risk profiling.
 */
router.post('/build', verifyJWT, idempotency(), validate(profileSchema), asyncHandler(async (req, res) => {
  // Throttle: prevent unbounded profile creation
  if (process.env.DISABLE_RATE_LIMIT !== 'true' && !checkProfileRateLimit(req.user.userId)) {
    throw createError(429, `Profile rate limit for user ${req.user.userId}`,
      `Too many profile submissions. Maximum ${PROFILE_RATE_LIMIT} per hour.`);
  }

  const {
    monthly_income, age, monthly_savings, regime, investment_horizon,
    liquid_savings, existing_debt, dependents, emergency_fund_months,
    risk_tolerance, goal_type
  } = req.body;

  const annualIncome = monthly_income * 12;
  const taxRegime = regime || 'new';

  // Compute tax
  const taxResult = computeTax(annualIncome, taxRegime);
  const marginalRate = getTaxSlab(annualIncome, taxRegime);
  const taxComparison = compareTaxRegimes(annualIncome);

  // Compute risk profile (now uses 3-factor model: age + income + horizon, with savings penalty)
  const riskProfile = getRiskProfile(age, annualIncome, investment_horizon, 0, dependents || 0, monthly_savings, existing_debt || 0);

  // Investable amount = monthly savings (pre-validated to be < income)
  const investableAmount = monthly_savings;

  // Self-check invariant: riskScore must align with riskCategory
  // These ranges MUST match the thresholds in riskProfiler.js getRiskProfile()
  //   >=80 → Aggressive, >=60 → Mod-Agg, >=40 → Moderate, >=20 → Con-Mod, <20 → Conservative
  const SCORE_RANGES = {
    'Aggressive': [80, 100], 'Moderate-Aggressive': [60, 79],
    'Moderate': [40, 59], 'Conservative-Moderate': [20, 39], 'Conservative': [0, 19],
  };
  const expectedRange = SCORE_RANGES[riskProfile.category];
  if (expectedRange && (riskProfile.riskScore < expectedRange[0] || riskProfile.riskScore > expectedRange[1])) {
    console.error(
      `[Profile INVARIANT VIOLATION] riskScore ${riskProfile.riskScore} does not match `
      + `category '${riskProfile.category}' (expected ${expectedRange[0]}-${expectedRange[1]}). `
      + `This indicates a drift between riskProfiler.js thresholds and profile.js SCORE_RANGES. `
      + `Profile will still be saved, but risk alignment may be inconsistent.`
    );
  }

  // Save to MongoDB
  const profile = await FinancialProfile.create({
    userId: req.user.userId,
    income: monthly_income,
    age,
    savings: monthly_savings,
    annualIncome,
    taxSlab: marginalRate,
    effectiveTaxRate: taxResult.effectiveRate,
    taxRegime,
    riskCategory: riskProfile.category,
    riskScore: riskProfile.riskScore,
    riskDescription: riskProfile.description,
    recommendedEquityAllocation: riskProfile.recommendedEquityAllocation,
    investableAmount,
    investmentHorizon: investment_horizon,
    liquid_savings: liquid_savings || 0,
    existing_debt: existing_debt || 0,
    dependents: dependents || 0,
    emergency_fund_months: emergency_fund_months || 0,
    risk_tolerance: risk_tolerance || 'Moderate',
    goal_type: goal_type || 'wealth-building'
  });

  // Invalidate ALL chatbot system prompt caches for this user
  // so the AI picks up the latest financial numbers immediately
  try {
    const prefix = `chat:sysprompt_v3:${req.user.userId}:`;
    await delCache(prefix + profile._id);
    // Also try to invalidate any previous profile's cached prompt
    const prevProfile = await FinancialProfile.findOne({
      userId: req.user.userId,
      _id: { $ne: profile._id },
    }).sort({ createdAt: -1 }).lean();
    if (prevProfile) await delCache(prefix + prevProfile._id);
  } catch (redisErr) {
    console.warn('[Profile] Cache invalidation failed (non-critical):', redisErr.message);
  }

  res.status(201).json({
    profileId: profile._id,
    taxSlab: marginalRate,
    effectiveTaxRate: taxResult.effectiveRate,
    taxDetails: taxResult,
    taxComparison,
    riskCategory: riskProfile.category,
    riskScore: riskProfile.riskScore,
    riskDescription: riskProfile.description,
    recommendedEquityAllocation: riskProfile.recommendedEquityAllocation,
    annual_income: annualIncome,
    investable_amount: investableAmount,
  });
}));

/**
 * PUT /api/profile/:profileId [Protected]
 * Updates a financial profile with optimistic concurrency control (OCC).
 */
router.put('/:profileId', verifyJWT, validate(profileSchema), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const expectedVersion = req.body.version;

  const profile = await FinancialProfile.findById(profileId);
  if (!profile) {
    throw createError(404, 'Profile not found', 'Profile not found.');
  }

  if (profile.userId.toString() !== req.user.userId) {
    throw createError(403, 'Access denied', 'Access denied.');
  }

  // 1. Fail-fast version check
  if (expectedVersion !== undefined && profile.__v !== expectedVersion) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Version conflict. Document has been modified concurrently by another process.'
    });
  }

  const {
    monthly_income, age, monthly_savings, regime, investment_horizon,
    liquid_savings, existing_debt, dependents, emergency_fund_months,
    risk_tolerance, goal_type
  } = req.body;

  // Apply edits
  profile.income = monthly_income;
  profile.age = age;
  profile.savings = monthly_savings;
  profile.annualIncome = monthly_income * 12;
  profile.taxRegime = regime || 'new';
  profile.investmentHorizon = investment_horizon;
  profile.liquid_savings = liquid_savings || 0;
  profile.existing_debt = existing_debt || 0;
  profile.dependents = dependents || 0;
  profile.emergency_fund_months = emergency_fund_months || 0;
  profile.risk_tolerance = risk_tolerance || 'Moderate';
  profile.goal_type = goal_type || 'wealth-building';

  // Recompute tax & risk profile
  const taxResult = computeTax(profile.annualIncome, profile.taxRegime);
  const marginalRate = getTaxSlab(profile.annualIncome, profile.taxRegime);
  const riskProfile = getRiskProfile(age, profile.annualIncome, investment_horizon, 0, profile.dependents || 0, monthly_savings, profile.existing_debt || 0);

  profile.taxSlab = marginalRate;
  profile.effectiveTaxRate = taxResult.effectiveRate;
  profile.riskCategory = riskProfile.category;
  profile.riskScore = riskProfile.riskScore;
  profile.riskDescription = riskProfile.description;
  profile.recommendedEquityAllocation = riskProfile.recommendedEquityAllocation;
  profile.investableAmount = monthly_savings;

  try {
    await profile.save();
  } catch (err) {
    if (err.name === 'VersionError') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Version conflict. Document has been modified concurrently.'
      });
    }
    throw err;
  }

  res.json({
    status: 'success',
    profile
  });
}));

export default router;
