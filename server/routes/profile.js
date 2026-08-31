import { Router } from 'express';
import { verifyJWT } from '../middleware/authMiddleware.js';
import { asyncHandler, createError, sendError } from '../middleware/errorHandler.js';
import { validate, profileSchema, updateProfileSchema } from '../validation/schemas.js';
import { computeTax, getTaxSlab, compareTaxRegimes } from '../services/taxEngine.js';
import { getRiskProfile } from '../services/riskProfiler.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { delCache, redisClient, redisAvailable } from '../config/redis.js';
import { idempotency } from '../middleware/idempotency.js';
import { toSnakeCase } from '../utils/caseConverter.js';

const router = Router();

/**
 * GET /api/profile/current [Protected]
 * Returns the latest owned profile so browser refreshes can restore sensitive
 * financial state from the backend instead of persistent browser storage.
 */
router.get('/current', verifyJWT, asyncHandler(async (req, res) => {
  const profile = await FinancialProfile.findOne({ userId: req.user.userId })
    .sort({ createdAt: -1 })
    .lean();
  if (!profile) {
    throw createError(404, `No financial profile for user ${req.user.userId}`, 'Financial profile not found.');
  }
  res.json(formatProfileResponse(profile));
}));

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

  // Extract deduction fields (WG-DEDUCTIONS-COLLECTION)
  const safeSection80C = Number(req.body.section80C !== undefined ? req.body.section80C : (req.body.section_80c || 0));
  const safeSection80CCD1B = Number(
    req.body.section80CCD1B !== undefined ? req.body.section80CCD1B : (
      req.body.section_80ccd1b || req.body.nps80CCD1B || req.body.section80CCD || req.body.section_80ccd || 0
    )
  );
  const safeSection80D_self = Number(req.body.section80D_self !== undefined ? req.body.section80D_self : (req.body.section_80d_self || 0));
  const safeSection80D_parents = Number(req.body.section80D_parents !== undefined ? req.body.section80D_parents : (req.body.section_80d_parents || 0));
  const safeParentsSenior = Boolean(req.body.parentsSenior !== undefined ? req.body.parentsSenior : req.body.parents_senior);
  const safeHra = Number(req.body.hra || 0);
  const safeHomeLoanInterest = Number(req.body.homeLoanInterest !== undefined ? req.body.homeLoanInterest : (req.body.home_loan_interest || 0));
  const safeSection80EEA = Number(req.body.section80EEA !== undefined ? req.body.section80EEA : (req.body.section_80eea || 0));
  const safeIncomeSource = req.body.incomeSource || req.body.income_source || 'salary';

  // Compute tax with full deductions passed
  const taxDeductions = {
    basicSalary: safeBasicComponent,
    age,
    section80C: safeSection80C,
    section80CCD1B: safeSection80CCD1B,
    nps80CCD1B: safeSection80CCD1B,
    section80CCD: safeSection80CCD1B,
    section80D_self: safeSection80D_self,
    section80D_parents: safeSection80D_parents,
    parentsSenior: safeParentsSenior,
    parents_senior: safeParentsSenior,
    hra: safeHra,
    homeLoanInterest: safeHomeLoanInterest,
    section80EEA: safeSection80EEA,
  };
  const taxResult = computeTax(annualIncome, taxRegime, taxDeductions, safeIncomeSource);
  const marginalRate = getTaxSlab(annualIncome, taxRegime, taxDeductions, safeIncomeSource);
  const taxComparison = compareTaxRegimes(annualIncome, taxDeductions, safeIncomeSource);

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
    oneTimeInvestableAmount: safeLumpSumAmount + safeSoldPropertyAmount,
    section80C: safeSection80C,
    section80CCD1B: safeSection80CCD1B,
    section80D_self: safeSection80D_self,
    section80D_parents: safeSection80D_parents,
    parentsSenior: safeParentsSenior,
    hra: safeHra,
    homeLoanInterest: safeHomeLoanInterest,
    section80EEA: safeSection80EEA,
    incomeSource: safeIncomeSource,
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
    return sendError(
      req,
      res,
      409,
      'Version conflict. Document has been modified concurrently by another process.',
      'PROFILE_VERSION_CONFLICT',
      { currentVersion, expectedVersion },
    );
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

  // Extract deduction fields for update (WG-DEDUCTIONS-COLLECTION)
  const safeSection80C = Number(req.body.section80C !== undefined ? req.body.section80C : (req.body.section_80c !== undefined ? req.body.section_80c : (existingProfile.section80C || 0)));
  const safeSection80CCD1B = Number(
    req.body.section80CCD1B !== undefined ? req.body.section80CCD1B : (
      req.body.section_80ccd1b !== undefined ? req.body.section_80ccd1b : (
        req.body.nps80CCD1B !== undefined ? req.body.nps80CCD1B : (
          req.body.section80CCD !== undefined ? req.body.section80CCD : (
            req.body.section_80ccd !== undefined ? req.body.section_80ccd : (existingProfile.section80CCD1B || 0)
          )
        )
      )
    )
  );
  const safeSection80D_self = Number(req.body.section80D_self !== undefined ? req.body.section80D_self : (req.body.section_80d_self !== undefined ? req.body.section_80d_self : (existingProfile.section80D_self || 0)));
  const safeSection80D_parents = Number(req.body.section80D_parents !== undefined ? req.body.section80D_parents : (req.body.section_80d_parents !== undefined ? req.body.section_80d_parents : (existingProfile.section80D_parents || 0)));
  const safeParentsSenior = Boolean(req.body.parentsSenior !== undefined ? req.body.parentsSenior : (req.body.parents_senior !== undefined ? req.body.parents_senior : existingProfile.parentsSenior));
  const safeHra = Number(req.body.hra !== undefined ? req.body.hra : (existingProfile.hra || 0));
  const safeHomeLoanInterest = Number(req.body.homeLoanInterest !== undefined ? req.body.homeLoanInterest : (req.body.home_loan_interest !== undefined ? req.body.home_loan_interest : (existingProfile.homeLoanInterest || 0)));
  const safeSection80EEA = Number(req.body.section80EEA !== undefined ? req.body.section80EEA : (req.body.section_80eea !== undefined ? req.body.section_80eea : (existingProfile.section80EEA || 0)));
  const safeIncomeSource = req.body.incomeSource || req.body.income_source || existingProfile.incomeSource || 'salary';

  const taxDeductions = {
    basicSalary: safeBasicComponent,
    age,
    section80C: safeSection80C,
    section80CCD1B: safeSection80CCD1B,
    nps80CCD1B: safeSection80CCD1B,
    section80CCD: safeSection80CCD1B,
    section80D_self: safeSection80D_self,
    section80D_parents: safeSection80D_parents,
    parentsSenior: safeParentsSenior,
    parents_senior: safeParentsSenior,
    hra: safeHra,
    homeLoanInterest: safeHomeLoanInterest,
    section80EEA: safeSection80EEA,
  };
  const taxResult = computeTax(annualIncome, taxRegime, taxDeductions, safeIncomeSource);
  const marginalRate = getTaxSlab(annualIncome, taxRegime, taxDeductions, safeIncomeSource);
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
    oneTimeInvestableAmount: safeLumpSumAmount + safeSoldPropertyAmount,
    section80C: safeSection80C,
    section80CCD1B: safeSection80CCD1B,
    section80D_self: safeSection80D_self,
    section80D_parents: safeSection80D_parents,
    parentsSenior: safeParentsSenior,
    hra: safeHra,
    homeLoanInterest: safeHomeLoanInterest,
    section80EEA: safeSection80EEA,
    incomeSource: safeIncomeSource,
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
    return sendError(
      req,
      res,
      409,
      'Version conflict. Document has been modified concurrently by another process.',
      'PROFILE_VERSION_CONFLICT',
    );
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

  // Canonical camelCase response object — single source of truth
  const camelResponse = {
    profileId: p._id,
    version: p.version || 1,
    age: p.age,
    monthlyIncome: p.monthlyIncome,
    monthlySavings: p.savings,
    investmentHorizon: p.investmentHorizon,
    liquidSavings: p.liquid_savings || 0,
    existingDebt: p.existing_debt_emi_ratio_pct || 0,
    dependents: p.dependents || 0,
    emergencyFundMonths: p.emergency_fund_months || 0,
    riskTolerance: p.risk_tolerance || 'Moderate',
    goalType: p.goal_type || 'wealth-building',
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
    annualIncome: p.annualIncome,
    investableAmount: p.investableAmount || p.savings,
    investableAmountMonthly: p.savings,
    investableAmountOnetime: p.oneTimeInvestableAmount !== undefined ? p.oneTimeInvestableAmount : ((p.lumpSumAmount || 0) + (p.soldPropertyAmount || 0)),
    oneTimeInvestableAmount: p.oneTimeInvestableAmount !== undefined ? p.oneTimeInvestableAmount : ((p.lumpSumAmount || 0) + (p.soldPropertyAmount || 0)),
    totalCtc: p.totalCTC,
    basicComponent: p.basicComponent,
    monthlyTakeHome: p.monthlyTakeHome,
    soldPropertyAmount: p.soldPropertyAmount,
    hasLumpSum: p.hasLumpSum,
    lumpSumAmount: p.lumpSumAmount,
    goals: p.goals || [],
    investmentGoals: p.goals || [],
    section80C: p.section80C !== undefined ? p.section80C : (p.section_80c || 0),
    section_80c: p.section80C !== undefined ? p.section80C : (p.section_80c || 0),
    section80CCD1B: p.section80CCD1B !== undefined ? p.section80CCD1B : (p.section_80ccd1b || p.nps80CCD1B || 0),
    section_80ccd1b: p.section80CCD1B !== undefined ? p.section80CCD1B : (p.section_80ccd1b || p.nps80CCD1B || 0),
    nps80CCD1B: p.section80CCD1B !== undefined ? p.section80CCD1B : (p.section_80ccd1b || p.nps80CCD1B || 0),
    section80D_self: p.section80D_self !== undefined ? p.section80D_self : (p.section_80d_self || 0),
    section_80d_self: p.section80D_self !== undefined ? p.section80D_self : (p.section_80d_self || 0),
    section80D_parents: p.section80D_parents !== undefined ? p.section80D_parents : (p.section_80d_parents || 0),
    section_80d_parents: p.section80D_parents !== undefined ? p.section80D_parents : (p.section_80d_parents || 0),
    parentsSenior: Boolean(p.parentsSenior !== undefined ? p.parentsSenior : p.parents_senior),
    parents_senior: Boolean(p.parentsSenior !== undefined ? p.parentsSenior : p.parents_senior),
    hra: p.hra || 0,
    homeLoanInterest: p.homeLoanInterest !== undefined ? p.homeLoanInterest : (p.home_loan_interest || 0),
    home_loan_interest: p.homeLoanInterest !== undefined ? p.homeLoanInterest : (p.home_loan_interest || 0),
    section80EEA: p.section80EEA !== undefined ? p.section80EEA : (p.section_80eea || 0),
    section_80eea: p.section80EEA !== undefined ? p.section80EEA : (p.section_80eea || 0),
    incomeSource: p.incomeSource || p.income_source || 'salary',
    income_source: p.incomeSource || p.income_source || 'salary',
  };

  // WG-012: Auto-generate snake_case aliases via caseConverter (not manual mapping)
  const snakeResponse = toSnakeCase(camelResponse);

  // Merge: snake_case keys for backward compat, camelCase keys as canonical
  return { ...snakeResponse, ...camelResponse };
}

export default router;
