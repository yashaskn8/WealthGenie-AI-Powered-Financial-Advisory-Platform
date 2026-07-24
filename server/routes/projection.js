import { Router } from 'express';
import { verifyJWT, isOwner, isValidObjectId } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, projectionSchema } from '../validation/schemas.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { generateProjections } from '../services/projectionEngine.js';
import { calculatePostTaxReturnSafe } from '../services/postTaxCalculator.js';
import { computeXIRR, computeSIPXIRR } from '../services/xirrCalculator.js';
import { buildRateLookup } from '../services/instrumentConstants.js';

const router = Router();

const RATE_LOOKUP = buildRateLookup();

/**
 * POST /api/projection [Protected]
 * Generate wealth projections for multiple instruments over time.
 */
router.post('/', verifyJWT, validate(projectionSchema), asyncHandler(async (req, res) => {
  const { profileId, instruments, monthly_investment, years } = req.body;

  if (!isValidObjectId(profileId)) {
    throw createError(400, 'Invalid profileId', 'Invalid profile ID.');
  }

  const profile = await FinancialProfile.findOne({ _id: profileId, userId: req.user.userId }).lean();
  if (!profile) {
    throw createError(404, `Profile not found: ${profileId}`, 'Profile not found.');
  }

  // Authorization: verify the profile belongs to the requesting user
  if (!isOwner(profile, req.user.userId)) {
    throw createError(403, `Unauthorized profile access: ${profileId}`, 'Access denied.');
  }

  const investAmount = monthly_investment || profile.savings;
  const projYears = years || [5, 10, 15, 20];

  // Guard: reject zero or negative investment amounts instead of producing misleading flat-line projections
  if (!Number.isFinite(investAmount) || investAmount <= 0) {
    throw createError(400,
      `Invalid investment amount: ${investAmount} (monthly_investment: ${monthly_investment}, profile.savings: ${profile.savings})`,
      'Monthly investment amount must be greater than zero.'
    );
  }

  // Build instrument list with post-tax rates
  const instKeys = instruments || ['FD', 'ELSS', 'Equity_MF', 'Debt_MF'];
  const instList = instKeys.map(key => {
    const nominalRate = RATE_LOOKUP[key];
    if (nominalRate === undefined) {
      console.warn(`[Projection] Unknown instrument key: '${key}'. Using 7.0% default. Add this key to RATE_LOOKUP.`);
    }
    const safeRate = nominalRate ?? 7.0;
    const ptResult = calculatePostTaxReturnSafe(
      key,
      safeRate / 100,
      profile.annualIncome,
      profile.investmentHorizon || 15,
      profile.taxRegime || 'new'
    );

    // Invariant check: post-tax rate should not exceed nominal rate
    if (ptResult.effectiveYield > safeRate + 0.01) {
      console.error(`[Projection INVARIANT] ${key}: effectiveYield ${ptResult.effectiveYield}% exceeds nominal ${safeRate}%. Clamping.`);
      ptResult.effectiveYield = safeRate;
    }

    return { name: key, type: key, postTaxRate: ptResult.effectiveYield };
  });

  const postTaxRates = {};
  instList.forEach(i => { postTaxRates[i.name] = i.postTaxRate; });

  const projections = generateProjections(investAmount, instList, postTaxRates, projYears);

  res.json(projections);
}));

/**
 * POST /api/projection/xirr [Protected]
 * Compute XIRR (Extended Internal Rate of Return) for irregular cashflows.
 * Uses Newton-Raphson iteration — the institutional standard for evaluating
 * SIP performance where each installment has a different holding period.
 *
 * Body: { cashflows: [{amount, date}], guess?: number }
 *   OR: { monthlySIP, months, currentValue }  (SIP convenience mode)
 */
router.post('/xirr', verifyJWT, asyncHandler(async (req, res) => {
  const { cashflows, monthlySIP, months, currentValue, guess } = req.body;

  // SIP convenience mode
  if (monthlySIP && months && currentValue) {
    if (!Number.isFinite(monthlySIP) || monthlySIP <= 0) {
      throw createError(400, 'Invalid monthlySIP', 'Monthly SIP must be a positive number.');
    }
    if (!Number.isFinite(months) || months < 1 || months > 1200) {
      throw createError(400, 'Invalid months', 'Months must be between 1 and 1200 (max 100 years).');
    }
    if (!Number.isFinite(currentValue) || currentValue <= 0) {
      throw createError(400, 'Invalid currentValue', 'Current value must be a positive number.');
    }
    const result = computeSIPXIRR(monthlySIP, months, currentValue);
    return res.json({ mode: 'sip', ...result });
  }

  // General XIRR mode
  if (!Array.isArray(cashflows) || cashflows.length < 2) {
    throw createError(400, 'Invalid cashflows', 'Provide at least 2 cashflows with amount and date.');
  }

  if (cashflows.length > 1000) {
    throw createError(400, 'Too many cashflows', 'Maximum 1000 cashflows allowed to prevent server overhead.');
  }

  // Validate each cashflow
  for (const cf of cashflows) {
    if (!Number.isFinite(cf.amount)) {
      throw createError(400, `Invalid cashflow amount: ${cf.amount}`, 'Each cashflow must have a finite amount.');
    }
    if (!cf.date) {
      throw createError(400, 'Missing cashflow date', 'Each cashflow must have a date.');
    }
    const parsedDate = new Date(cf.date);
    if (!Number.isFinite(parsedDate.getTime())) {
      throw createError(400, `Invalid cashflow date: ${cf.date}`, 'Each cashflow must have a valid date.');
    }
  }

  let safeGuess = guess;
  if (guess !== undefined) {
    safeGuess = Number(guess);
    if (!Number.isFinite(safeGuess)) {
      throw createError(400, `Invalid XIRR guess: ${guess}`, 'Guess must be a finite number.');
    }
  }

  const result = computeXIRR(cashflows, safeGuess);
  res.json({ mode: 'general', ...result });
}));

export default router;
