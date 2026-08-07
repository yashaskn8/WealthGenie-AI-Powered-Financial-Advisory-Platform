import { Router } from 'express';
import { verifyJWT } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, profileSchema, updateProfileSchema } from '../validation/schemas.js';
import { computeTax, getTaxSlab, compareTaxRegimes } from '../services/taxEngine.js';
import { getRiskProfile } from '../services/riskProfiler.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { delCache, redisClient, redisAvailable } from '../config/redis.js';
import { idempotency } from '../middleware/idempotency.js';
import { toCamelCase, toSnakeCase } from '../utils/caseConverter.js';

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
  if (process.env.DISABLE_RATE_LIMIT !== 'true' && !(await checkProfileRateLimit(req.user.userId))) {
    throw createError(429, `Profile rate limit for user ${req.user.userId}`,
      `Too many profile submissions. Maximum ${PROFILE_RATE_LIMIT} per hour.`);
  }

  const {
    monthly_income, age, monthly_savings, regime, investment_horizon,
    liquid_savings, existing_debt, dependents, emergency_fund_months,
    risk_tolerance, goal_type,
    total_ctc, basic_component, monthly_take_home, sold_property_amount,
    has_lump_sum, lump_sum_amount
  } = req.body;

  const annualIncome = monthly_income * 12;
  const taxRegime = regime || 'new';

  const safeTotalCTC = Number(total_ctc) || annualIncome;
  const safeBasicComponent = Number(basic_component) || (safeTotalCTC * 0.5);
  const safeMonthlyTakeHome = Number(monthly_take_home) || monthly_income;
  const safeSoldPropertyAmount = Number(sold_property_amount) || 0;
  const safeHasLumpSum = Boolean(has_lump_sum);
  // Defensive zeroing: force lump sum to 0 if has_lump_sum flag is false
  const safeLumpSumAmount = safeHasLumpSum ? (Number(lump_sum_amount) || 0) : 0;

  // Compute tax with basicSalary passed to calculate 80CCD(2) employer-NPS deduction cap
  const taxDeductions = { basicSalary: safeBasicComponent };
  const taxResult = computeTax(annualIncome, taxRegime, taxDeductions);
  const marginalRate = getTaxSlab(annualIncome, taxRegime, taxDeductions);
  const taxComparison = compareTaxRegimes(annualIncome, taxDeductions);

  const safeExistingDebt = Number(req.body.existing_debt_emi_ratio_pct !== undefined ? req.body.existing_debt_emi_ratio_pct : (req.body.existing_debt || 0));

  // Compute risk profile incorporating available lump sum & property sale liquidity
  const monthlyIncome = annualIncome / 12;
  const impliedMonthlyDebt = monthlyIncome > 0 ? ((safeExistingDebt / 100) * monthlyIncome) : 0;
  const riskProfile = getRiskProfile(
    age, annualIncome, investment_horizon, 0, dependents || 0,
    monthly_savings, impliedMonthlyDebt, safeLumpSumAmount, safeSoldPropertyAmount
  );

  // Investable amount separation: monthly vs one-time lump sum
  const investableAmount = monthly_savings;

  // Self-check invariant: riskScore must align with riskCategory
  const SCORE_RANGES = {
    'Aggressive': [80, 100], 'Moderate-Aggressive': [60, 79],
    'Moderate': [40, 59], 'Conservative-Moderate': [20, 39], 'Conservative': [0, 19],
  };
  const expectedRange = SCORE_RANGES[riskProfile.category];
  if (expectedRange && (riskProfile.riskScore < expectedRange[0] || riskProfile.riskScore > expectedRange[1])) {
    console.error(
      `[Profile INVARIANT VIOLATION] riskScore ${riskProfile.riskScore} does not match `
      + `category '${riskProfile.category}' (expected ${expectedRange[0]}-${expectedRange[1]}).`
    );
  }

  const incomingGoals = Array.isArray(req.body.goals)
    ? req.body.goals
    : (Array.isArray(req.body.investment_goals) ? req.body.investment_goals : []);

  // Save to MongoDB
  const profile = await FinancialProfile.create({
    userId: req.user.userId,
    income: monthly_income,
    age,
    savings: monthly_savings,
    annualIncome,
    taxSlabDecimal: marginalRate,
    effectiveTaxRatePercent: taxResult.effectiveRate,
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
    goal_type: goal_type || 'wealth-building',
    goals: incomingGoals,
    totalCTC: safeTotalCTC,
    basicComponent: safeBasicComponent,
    monthlyTakeHome: safeMonthlyTakeHome,
    soldPropertyAmount: safeSoldPropertyAmount,
    hasLumpSum: safeHasLumpSum,
    lumpSumAmount: safeLumpSumAmount,
    oneTimeInvestableAmount: safeLumpSumAmount,
  });

  // Invalidate ALL chatbot system prompt caches for this user
  try {
    const prefix = `chat:sysprompt_v3:${req.user.userId}:`;
    await delCache(prefix + profile._id);
    const prevProfile = await FinancialProfile.findOne({
      userId: req.user.userId,
      _id: { $ne: profile._id },
    }).sort({ createdAt: -1 }).lean();
    if (prevProfile) await delCache(prefix + prevProfile._id);
  } catch (redisErr) {
    console.warn('[Profile] Cache invalidation failed (non-critical):', redisErr.message);
  }

  res.status(201).json(formatProfileResponse(profile, { taxResult, taxComparison }));
}));

/**
 * PUT /api/profile/:profileId [Protected]
 * Updates a financial profile in-place with optimistic concurrency control (OCC).
 */
router.put('/:profileId', verifyJWT, validate(updateProfileSchema), asyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const expectedVersion = req.body.version;

  const existingProfile = await FinancialProfile.findOne({ _id: profileId, userId: req.user.userId });
  if (!existingProfile) {
    throw createError(404, 'Profile not found or access denied', 'Profile not found.');
  }

  const currentVersion = existingProfile.version || 1;
  if (currentVersion !== expectedVersion) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Version conflict. Document has been modified concurrently by another process.',
      currentVersion,
      expectedVersion,
    });
  }

  const {
    monthly_income, age, monthly_savings, regime, investment_horizon,
    liquid_savings, existing_debt, dependents, emergency_fund_months,
    risk_tolerance, goal_type,
    total_ctc, basic_component, monthly_take_home, sold_property_amount,
    has_lump_sum, lump_sum_amount
  } = req.body;

  const annualIncome = monthly_income * 12;
  const safeTotalCTC = Number(total_ctc) || annualIncome;
  const safeBasicComponent = Number(basic_component) || (safeTotalCTC * 0.5);
  const safeMonthlyTakeHome = Number(monthly_take_home) || monthly_income;
  const safeSoldPropertyAmount = Number(sold_property_amount) || 0;
  const safeHasLumpSum = Boolean(has_lump_sum);
  const safeLumpSumAmount = safeHasLumpSum ? (Number(lump_sum_amount) || 0) : 0;
  const taxRegime = regime || 'new';

  const taxDeductions = { basicSalary: safeBasicComponent };
  const taxResult = computeTax(annualIncome, taxRegime, taxDeductions);
  const marginalRate = getTaxSlab(annualIncome, taxRegime, taxDeductions);
  const monthlyIncomeVal = monthly_income;
  const safeExistingDebtPut = Number(req.body.existing_debt_emi_ratio_pct !== undefined ? req.body.existing_debt_emi_ratio_pct : (req.body.existing_debt || 0));
  const impliedMonthlyDebtVal = monthlyIncomeVal > 0 ? ((safeExistingDebtPut / 100) * monthlyIncomeVal) : 0;
  const riskProfile = getRiskProfile(
    age, annualIncome, investment_horizon, 0, dependents || 0,
    monthly_savings, impliedMonthlyDebtVal, safeLumpSumAmount, safeSoldPropertyAmount
  );

  const incomingGoalsPut = Array.isArray(req.body.goals)
    ? req.body.goals
    : (Array.isArray(req.body.investment_goals) ? req.body.investment_goals : undefined);

  const investableAmount = monthly_savings;

  const updateFields = {
    monthlyIncome: monthly_income,
    age,
    savings: monthly_savings,
    annualIncome,
    taxRegime,
    investmentHorizon: investment_horizon,
    liquid_savings: liquid_savings || 0,
    existing_debt_emi_ratio_pct: safeExistingDebtPut,
    dependents: dependents || 0,
    emergency_fund_months: emergency_fund_months || 0,
    risk_tolerance: risk_tolerance || 'Moderate',
    goal_type: goal_type || 'wealth-building',
    totalCTC: safeTotalCTC,
    basicComponent: safeBasicComponent,
    monthlyTakeHome: safeMonthlyTakeHome,
    soldPropertyAmount: safeSoldPropertyAmount,
    hasLumpSum: safeHasLumpSum,
    lumpSumAmount: safeLumpSumAmount,
    taxSlabDecimal: marginalRate,
    effectiveTaxRatePercent: taxResult.effectiveRate,
    riskCategory: riskProfile.category,
    riskScore: riskProfile.riskScore,
    riskDescription: riskProfile.description,
    recommendedEquityAllocation: riskProfile.recommendedEquityAllocation,
    investableAmount,
    oneTimeInvestableAmount: safeLumpSumAmount,
  };
  if (incomingGoalsPut !== undefined) {
    updateFields.goals = incomingGoalsPut;
  }

  const updatedProfile = await FinancialProfile.findOneAndUpdate(
    { _id: profileId, userId: req.user.userId, version: expectedVersion },
    {
      $set: updateFields,
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!updatedProfile) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Version conflict. Document has been modified concurrently by another process.',
    });
  }

  // Invalidate ALL chatbot system prompt caches for this user
  try {
    const prefix = `chat:sysprompt_v3:${req.user.userId}:`;
    await delCache(prefix + updatedProfile._id);
  } catch (redisErr) {
    console.warn('[Profile Update] Cache invalidation failed (non-critical):', redisErr.message);
  }

  res.status(200).json(formatProfileResponse(updatedProfile, { taxResult }));
}));

export function formatProfileResponse(profile, extra = {}) {
  const p = profile.toObject ? profile.toObject() : profile;
  return {
    profileId: p._id,
    version: p.version || 1,
    taxSlab: p.taxSlabDecimal !== undefined ? p.taxSlabDecimal : p.taxSlab,
    taxSlabDecimal: p.taxSlabDecimal !== undefined ? p.taxSlabDecimal : p.taxSlab,
    effectiveTaxRate: p.effectiveTaxRatePercent !== undefined ? p.effectiveTaxRatePercent : p.effectiveTaxRate,
    effectiveTaxRatePercent: p.effectiveTaxRatePercent !== undefined ? p.effectiveTaxRatePercent : p.effectiveTaxRate,
    taxDetails: extra.taxResult || null,
    taxComparison: extra.taxComparison || null,
    riskCategory: p.riskCategory,
    riskScore: p.riskScore,
    riskDescription: p.riskDescription,
    recommendedEquityAllocation: p.recommendedEquityAllocation,
    annual_income: p.annualIncome,
    investable_amount: p.investableAmount || p.savings,
    investable_amount_monthly: p.savings,
    investable_amount_onetime: p.oneTimeInvestableAmount !== undefined ? p.oneTimeInvestableAmount : (p.lumpSumAmount || 0),
    oneTimeInvestableAmount: p.oneTimeInvestableAmount !== undefined ? p.oneTimeInvestableAmount : (p.lumpSumAmount || 0),
    total_ctc: p.totalCTC,
    basic_component: p.basicComponent,
    monthly_take_home: p.monthlyTakeHome,
    sold_property_amount: p.soldPropertyAmount,
    has_lump_sum: p.hasLumpSum,
    lump_sum_amount: p.lumpSumAmount,
    goals: p.goals || [],
  };
}

export default router;
