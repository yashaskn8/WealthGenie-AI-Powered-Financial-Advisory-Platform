import { Router } from 'express';
import mongoose from 'mongoose';
import { verifyJWT, isOwner, isValidObjectId } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, goalSchema, goalUpdateSchema } from '../validation/schemas.js';
import Goal from '../models/Goal.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import { reverseSIP, runMonteCarloWithGoal, getInstrumentVolatility } from '../services/monteCarloEngine.js';
import { getGoalAdvisory } from '../services/geminiService.js';
import { idempotency } from '../middleware/idempotency.js';

const router = Router();

function _determineGoalStatus(prob, gap, userMonthlySavings) {
  if (prob !== null && prob !== undefined) {
    if (prob >= 0.65) return 'on_track';
    if (prob >= 0.35) return 'at_risk';
    return 'off_track';
  }
  if (gap <= 0) return 'on_track';
  if (gap <= userMonthlySavings * 0.25) return 'at_risk';
  return 'off_track';
}

/**
 * Detect stale/error advice that should be regenerated.
 */
const STALE_ADVICE_PATTERNS = [
  'temporarily unavailable',
  'could not process',
  'api key not configured',
];

function isStaleAdvice(advice) {
  if (!advice || typeof advice !== 'string' || advice.trim().length === 0) return true;
  const normalisedAdvice = advice.toLowerCase();
  return STALE_ADVICE_PATTERNS.some(p => normalisedAdvice.includes(p));
}

async function findOwnedProfileById(profileId, userId) {
  const id = profileId?.toString?.() || profileId;
  if (!id || !isValidObjectId(id)) return null;
  return FinancialProfile.findOne({ _id: id, userId }).lean();
}

/**
 * Generate AI advice for a goal. Handles errors gracefully with a fallback.
 */
async function generateGoalAdvice(goal, profile, userMonthlySavings) {
  const now = new Date();
  const yearsRemaining = Math.max(1, Math.round(
    (new Date(goal.target_date) - now) / (365.25 * 24 * 60 * 60 * 1000)
  ));

  const profileContext = {
    age: profile?.age || 30,
    annualIncome: profile?.annualIncome || 600000,
    riskCategory: profile?.riskCategory || 'Moderate',
  };

  const prompt = `User is ${goal.status.replace(/_/g, ' ')} for goal "${goal.goal_name}" `
    + `worth ₹${goal.target_amount.toLocaleString('en-IN')} in ${yearsRemaining} years. `
    + `Required SIP: ₹${(goal.recommended_sip || 0).toLocaleString('en-IN')}/month. `
    + `Their current savings capacity: ₹${(userMonthlySavings || 10000).toLocaleString('en-IN')}/month. `
    + `Suggest one specific actionable financial adjustment in 2 sentences.`;

  try {
    const advice = await getGoalAdvisory(prompt, profileContext);
    return advice;
  } catch (_) {
    const instrument = (goal.recommended_instrument || 'Equity MF').replace(/_/g, ' ');
    return `To stay on track for your "${goal.goal_name}" goal, maintain a monthly SIP of `
      + `₹${(goal.recommended_sip || 5000).toLocaleString('en-IN')} in ${instrument}.`;
  }
}

/**
 * POST /api/goals/create [Protected]
 * Create a new financial goal with automated SIP computation and Monte Carlo analysis.
 */
router.post('/create', verifyJWT, idempotency(), validate(goalSchema), asyncHandler(async (req, res) => {
  const { goal_name, target_amount, target_date, current_savings, profileId, priority } = req.body;

  // Validate profileId ownership if provided
  let profile = null;
  if (profileId) {
    if (!isValidObjectId(profileId)) {
      throw createError(400, 'Invalid profileId in goal create', 'Invalid profile ID.');
    }
    profile = await FinancialProfile.findById(profileId).lean();
    if (!profile) {
      throw createError(404, `Profile not found for goal create: ${profileId}`, 'Profile not found.');
    }
    if (!isOwner(profile, req.user.userId)) {
      throw createError(403, `Unauthorized goal-profile access: ${profileId}`, 'Access denied.');
    }
  }

  // Fall back to latest profile
  if (!profile) {
    profile = await FinancialProfile.findOne({ userId: req.user.userId })
      .sort({ createdAt: -1 }).lean();
  }

  // Calculate years remaining with invariant checks
  const targetDateObj = new Date(target_date);
  const now = new Date();

  // Invariant: target_date must be at least 6 months in the future
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  if (targetDateObj < sixMonthsFromNow) {
    throw createError(400,
      `Goal target_date too close: ${target_date} (minimum: ${sixMonthsFromNow.toISOString()})`,
      'Target date must be at least 6 months from today for meaningful projections.'
    );
  }

  // Duplicate goal name check - prevent data confusion
  const existingGoal = await Goal.findOne({
    userId: req.user.userId,
    goal_name: { $regex: new RegExp(`^${goal_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).lean();
  if (existingGoal) {
    throw createError(409,
      `Duplicate goal name: "${goal_name}" for user ${req.user.userId}`,
      `A goal named "${goal_name}" already exists. Use a different name.`
    );
  }

  const msRemaining = targetDateObj - now;
  const rawYears = msRemaining / (365.25 * 24 * 60 * 60 * 1000);
  const yearsRemaining = Math.max(0.5, Math.floor(rawYears * 4) / 4);

  // Guard: if yearsRemaining is somehow NaN (invalid date), reject
  if (!Number.isFinite(yearsRemaining)) {
    throw createError(400, `Invalid target_date produced NaN years: ${target_date}`, 'Invalid target date.');
  }

  // Find the user's latest recommendation
  let latestRec = null;
  if (profile?._id) {
    latestRec = await Recommendation.findOne({ userId: req.user.userId, profileId: profile._id })
      .sort({ generatedAt: -1 }).lean();
  }
  if (!latestRec) {
    latestRec = await Recommendation.findOne({ userId: req.user.userId })
      .sort({ generatedAt: -1 }).lean();
  }
  const recommendedInstrument = latestRec?.instruments?.[0]?.type || 'Equity_MF';

  // Get volatility params for the recommended instrument
  const vol = getInstrumentVolatility(recommendedInstrument);

  // Compute post-tax adjusted rate if profile is available
  let postTaxRate = vol.mean;
  if (profile) {
    try {
      const { calculatePostTaxReturn } = await import('../services/postTaxCalculator.js');
      const ptResult = calculatePostTaxReturn(
        recommendedInstrument, vol.mean,
        profile.annualIncome || (profile.income * 12),
        yearsRemaining, profile.taxRegime || 'new'
      );
      postTaxRate = ptResult.postTaxReturn;
    } catch (_) {
      // Fallback to pre-tax if post-tax calc fails
    }
  }

  // Compute inflation-adjusted target amount (default inflation: 5%)
  const inflationRate = 0.05;
  const inflationAdjustedTarget = Math.round(target_amount * Math.pow(1 + inflationRate, yearsRemaining));

  // Compute required monthly SIP using reverse formula with POST-TAX rate against inflation-adjusted target
  const rawSIP = reverseSIP(inflationAdjustedTarget, postTaxRate, yearsRemaining, current_savings || 0);
  const requiredSIP = Math.max(500, Math.round(Number.isFinite(rawSIP) ? rawSIP : 5000));

  // Run Monte Carlo with the required SIP and POST-TAX rate against inflation-adjusted target
  const mcResult = runMonteCarloWithGoal({
    monthlyInvestment: requiredSIP,
    postTaxAnnualReturn: postTaxRate,
    annualVolatility: vol.stdDev,
    years: yearsRemaining,
    simulations: 5000,
    targetAmount: inflationAdjustedTarget,
    currentSavings: current_savings || 0,
  });

  // Self-check invariants on Monte Carlo output
  if (mcResult.goal_probability !== null) {
    if (!Number.isFinite(mcResult.goal_probability) || mcResult.goal_probability < 0 || mcResult.goal_probability > 1) {
      console.error(`[Goals INVARIANT] goal_probability out of bounds: ${mcResult.goal_probability}. Clamping.`);
      mcResult.goal_probability = Math.max(0, Math.min(1, mcResult.goal_probability || 0));
    }
  }
  const lastIdx = mcResult.p50.length - 1;
  if (lastIdx >= 0 && mcResult.p10[lastIdx] > mcResult.p90[lastIdx]) {
    console.error('[Goals INVARIANT] p10 > p90 - Monte Carlo band inversion detected.');
  }

  // Determine status using PROBABILITY-BASED classification
  const userMonthlySavings = profile?.savings || 10000;
  const gap = requiredSIP - userMonthlySavings;
  const status = _determineGoalStatus(mcResult.goal_probability, gap, userMonthlySavings);

  // Generate Gemini advice for this goal
  const goalForAdvice = {
    goal_name,
    target_amount,
    target_date: targetDateObj,
    recommended_sip: requiredSIP,
    recommended_instrument: recommendedInstrument,
    status,
  };
  const geminiAdvice = await generateGoalAdvice(goalForAdvice, profile, userMonthlySavings);

  // Build Recharts chart data
  const chartData = mcResult.years_array.map((yr, i) => ({
    year: yr,
    p10: mcResult.p10[i],
    p25: mcResult.p25[i],
    p50: mcResult.p50[i],
    p75: mcResult.p75[i],
    p90: mcResult.p90[i],
  }));

  // Mongoose transaction wrapper for multi-document writes (Goal + FinancialProfile).
  // Gracefully degrades to sequential writes if MongoDB doesn't support transactions
  // (standalone mode without replica set).
  const goalData = {
    userId: req.user.userId,
    profileId: profile?._id,
    goal_name,
    target_amount,
    inflation_adjusted_target: inflationAdjustedTarget,
    target_date: targetDateObj,
    current_savings: current_savings || 0,
    recommended_sip: requiredSIP,
    recommended_instrument: recommendedInstrument,
    probability_of_success: mcResult.goal_probability,
    gap_amount: Math.max(0, gap),
    status,
    priority: priority || 'Medium',
    monte_carlo_summary: {
      p10: mcResult.p10[lastIdx],
      p25: mcResult.p25[lastIdx],
      p50: mcResult.p50[lastIdx],
      p75: mcResult.p75[lastIdx],
      p90: mcResult.p90[lastIdx],
      simulations_run: mcResult.simulations_run,
    },
    chart_data: chartData,
    mc_computed_at: new Date(),
    years_remaining: yearsRemaining,
    gemini_advice: geminiAdvice,
  };

  let goal = null;
  let usedTransaction = false;

  try {
  try {
    // Attempt transactional write
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const goals = await Goal.create([goalData], { session });
      goal = goals[0];

      if (profile?._id) {
        await FinancialProfile.updateOne(
          { _id: profile._id },
          { $set: { lastGoalCreatedAt: new Date() } },
          { session }
        );
      }

      await session.commitTransaction();
      usedTransaction = true;
    } catch (txErr) {
      try { await session.abortTransaction(); } catch (_) { /* already aborted */ }

      // If transactions aren't supported (standalone MongoDB), fall back
      const msg = txErr.message || '';
      if (msg.includes('Transaction numbers are only allowed on a replica set') ||
          msg.includes('transaction') && msg.includes('not supported')) {
        console.warn('[Goals] Transactions not supported — falling back to sequential writes.');
        goal = null; // reset, will create below
      } else {
        throw txErr; // real error, propagate
      }
    } finally {
      session.endSession();
    }
  } catch (sessionErr) {
    // startSession itself can fail on very old drivers — fall back
    const msg = sessionErr.message || '';
    if (!msg.includes('replica set') && !msg.includes('not supported') && !msg.includes('session')) {
      throw sessionErr;
    }
    console.warn('[Goals] Session not available — falling back to sequential writes.');
  }

  // Fallback: sequential writes (no atomicity guarantee, but functional)
  if (!goal) {
    goal = await Goal.create(goalData);
    if (profile?._id) {
      await FinancialProfile.updateOne(
        { _id: profile._id },
        { $set: { lastGoalCreatedAt: new Date() } }
      );
    }
  }
  } catch (createErr) {
    // Handle race condition: two concurrent requests both passed the findOne
    // duplicate check, but the unique compound index on {userId, goal_name}
    // rejected the second insert with a duplicate key error.
    if (createErr.code === 11000) {
      throw createError(409,
        `Concurrent duplicate goal name: "${goal_name}" for user ${req.user.userId}`,
        `A goal named "${goal_name}" already exists. Use a different name.`
      );
    }
    throw createErr;
  }

  res.status(201).json({
    goalId: goal._id,
    ...goal.toObject(),
    chartData,
    years_remaining: yearsRemaining,
  });
}));

/**
 * GET /api/goals [Protected]
 * List all goals for the current user.
 * Automatically regenerates AI advice if it contains stale/error text.
 */
router.get('/', verifyJWT, asyncHandler(async (req, res) => {
  const goals = await Goal.find({ userId: req.user.userId }).sort({ target_date: 1 });

  const staleGoals = goals.filter(g => isStaleAdvice(g.gemini_advice));

  if (staleGoals.length > 0) {
    // Regenerate advice with a timeout - don't block the response for too long
    const regenerationPromises = staleGoals.map(async (g) => {
      try {
        const profile = await findOwnedProfileById(g.profileId, req.user.userId);
        const userMonthlySavings = profile?.savings || 10000;
        const newAdvice = await generateGoalAdvice(g, profile, userMonthlySavings);

        if (!isStaleAdvice(newAdvice)) {
          await Goal.findByIdAndUpdate(g._id, { gemini_advice: newAdvice });
        }
      } catch (e) {
        console.warn('[Goals] Advice regeneration failed for', g.goal_name, ':', e.message);
      }
    });

    // Wait up to 8 seconds for regeneration, then respond with whatever we have
    let regenerationTimerId;
    const timeoutPromise = new Promise(resolve => {
      regenerationTimerId = setTimeout(resolve, 8000);
    });
    await Promise.race([
      Promise.allSettled(regenerationPromises),
      timeoutPromise,
    ]);
    clearTimeout(regenerationTimerId);
  }

  // Refetch goals to ensure fresh advice is included, and compute dynamic chartData for all goals
  const freshGoals = await Goal.find({ userId: req.user.userId }).sort({ target_date: 1 });
  
  const goalsArr = await Promise.all(freshGoals.map(async (g) => {
    const targetDateObj = new Date(g.target_date);
    const now = new Date();
    const msRemaining = targetDateObj - now;
    const rawYears = msRemaining / (365.25 * 24 * 60 * 60 * 1000);
    const yearsRemaining = Math.max(0.5, Math.floor(rawYears * 4) / 4);
    
    let chartData;
    const isCacheValid = g.chart_data && 
                         g.chart_data.length > 0 && 
                         g.mc_computed_at && 
                         g.years_remaining === yearsRemaining && 
                         (Date.now() - new Date(g.mc_computed_at).getTime()) < 24 * 60 * 60 * 1000;

    if (isCacheValid) {
      // Use cached chartData from Goal model
      chartData = g.chart_data.map(item => ({
        year: item.year,
        p10: item.p10,
        p25: item.p25,
        p50: item.p50,
        p75: item.p75,
        p90: item.p90,
      }));
    } else {
      // Cache is stale or missing - run Monte Carlo and update DB
      const vol = getInstrumentVolatility(g.recommended_instrument || 'Equity_MF');
      
      let postTaxRate = vol.mean;
      const profile = await findOwnedProfileById(g.profileId, req.user.userId);
      if (profile) {
        try {
          const { calculatePostTaxReturn } = await import('../services/postTaxCalculator.js');
          const ptResult = calculatePostTaxReturn(
            g.recommended_instrument || 'Equity_MF', vol.mean,
            profile.annualIncome || (profile.income * 12),
            yearsRemaining, profile.taxRegime || 'new'
          );
          postTaxRate = ptResult.postTaxReturn;
        } catch (err) {
          console.warn('[Goals] Failed to calculate post-tax return during Monte Carlo:', err.message);
        }
      }
      
      const targetAmt = g.inflation_adjusted_target || g.target_amount;
      const mcResult = runMonteCarloWithGoal({
        monthlyInvestment: g.recommended_sip || 5000,
        postTaxAnnualReturn: postTaxRate,
        annualVolatility: vol.stdDev,
        years: yearsRemaining,
        simulations: 2000,
        targetAmount: targetAmt,
        currentSavings: g.current_savings || 0,
      });

      chartData = mcResult.years_array.map((yr, i) => ({
        year: yr,
        p10: mcResult.p10[i],
        p25: mcResult.p25[i],
        p50: mcResult.p50[i],
        p75: mcResult.p75[i],
        p90: mcResult.p90[i],
      }));

      // Cache it back to database asynchronously (don't block the request)
      Goal.findByIdAndUpdate(g._id, {
        chart_data: chartData,
        mc_computed_at: new Date(),
        years_remaining: yearsRemaining,
        probability_of_success: mcResult.goal_probability,
        monte_carlo_summary: {
          p10: mcResult.p10[mcResult.p10.length - 1],
          p25: mcResult.p25[mcResult.p25.length - 1],
          p50: mcResult.p50[mcResult.p50.length - 1],
          p75: mcResult.p75[mcResult.p75.length - 1],
          p90: mcResult.p90[mcResult.p90.length - 1],
          simulations_run: mcResult.simulations_run,
        }
      }).catch(err => console.error('[Goals Cache] Failed to write cache to DB:', err.message));
    }

    return {
      ...g.toObject(),
      chartData,
      years_remaining: yearsRemaining,
    };
  }));

  res.json({ goals: goalsArr });
}));

/**
 * PATCH /api/goals/:goalId/refresh-advice [Protected]
 * Manually refresh AI advice for a specific goal.
 */
router.patch('/:goalId/refresh-advice', verifyJWT, asyncHandler(async (req, res) => {
  const { goalId } = req.params;

  if (!isValidObjectId(goalId)) {
    throw createError(400, 'Invalid goalId', 'Invalid goal ID.');
  }

  const goal = await Goal.findOne({ _id: goalId, userId: req.user.userId });
  if (!goal) {
    throw createError(404, `Goal not found: ${goalId}`, 'Goal not found.');
  }

  const profile = await findOwnedProfileById(goal.profileId, req.user.userId);
  const userMonthlySavings = profile?.savings || 10000;
  const newAdvice = await generateGoalAdvice(goal, profile, userMonthlySavings);

  goal.gemini_advice = newAdvice;
  await goal.save();

  res.json({ goalId: goal._id, gemini_advice: newAdvice });
}));

/**
 * PATCH /api/goals/:goalId [Protected]
 * Update a goal's priority, savings, or target, and recompute Monte Carlo fields.
 */
router.patch('/:goalId', verifyJWT, validate(goalUpdateSchema), asyncHandler(async (req, res) => {
  const { goalId } = req.params;
  const { priority, current_savings, target_amount } = req.body;

  if (!isValidObjectId(goalId)) {
    throw createError(400, 'Invalid goalId', 'Invalid goal ID.');
  }

  const goal = await Goal.findOne({ _id: goalId, userId: req.user.userId });
  if (!goal) {
    throw createError(404, `Goal not found: ${goalId}`, 'Goal not found.');
  }

  if (priority !== undefined) goal.priority = priority;
  if (current_savings !== undefined) goal.current_savings = Number(current_savings);
  if (target_amount !== undefined) goal.target_amount = Number(target_amount);

  if (current_savings !== undefined || target_amount !== undefined) {
    const profile = await findOwnedProfileById(goal.profileId, req.user.userId) ||
                    await FinancialProfile.findOne({ userId: req.user.userId }).sort({ createdAt: -1 }).lean();
    
    const targetDateObj = new Date(goal.target_date);
    const now = new Date();
    const msRemaining = targetDateObj - now;
    const rawYears = msRemaining / (365.25 * 24 * 60 * 60 * 1000);
    const yearsRemaining = Math.max(0.5, Math.floor(rawYears * 4) / 4);

    const vol = getInstrumentVolatility(goal.recommended_instrument || 'Equity_MF');
    let postTaxRate = vol.mean;
    if (profile) {
      try {
        const { calculatePostTaxReturn } = await import('../services/postTaxCalculator.js');
        const ptResult = calculatePostTaxReturn(
          goal.recommended_instrument || 'Equity_MF', vol.mean,
          profile.annualIncome || (profile.income * 12),
          yearsRemaining, profile.taxRegime || 'new'
        );
        postTaxRate = ptResult.postTaxReturn;
      } catch (err) {
        console.warn('[Goals] Failed to calculate post-tax return during goal initialization:', err.message);
      }
    }

    const inflationRate = 0.05;
    const inflationAdjustedTarget = Math.round(goal.target_amount * Math.pow(1 + inflationRate, yearsRemaining));
    goal.inflation_adjusted_target = inflationAdjustedTarget;

    const rawSIP = reverseSIP(inflationAdjustedTarget, postTaxRate, yearsRemaining, goal.current_savings);
    goal.recommended_sip = Math.max(500, Math.round(Number.isFinite(rawSIP) ? rawSIP : 5000));

    const mcResult = runMonteCarloWithGoal({
      monthlyInvestment: goal.recommended_sip,
      postTaxAnnualReturn: postTaxRate,
      annualVolatility: vol.stdDev,
      years: yearsRemaining,
      simulations: 2000,
      targetAmount: inflationAdjustedTarget,
      currentSavings: goal.current_savings || 0,
    });

    goal.probability_of_success = mcResult.goal_probability;
    goal.gap_amount = Math.max(0, goal.recommended_sip - (profile?.savings || 10000));
    
    const lastIdx = mcResult.p50.length - 1;
    goal.monte_carlo_summary = {
      p10: mcResult.p10[lastIdx],
      p25: mcResult.p25[lastIdx],
      p50: mcResult.p50[lastIdx],
      p75: mcResult.p75[lastIdx],
      p90: mcResult.p90[lastIdx],
      simulations_run: mcResult.simulations_run,
    };

    // Cache chart data
    const chartData = mcResult.years_array.map((yr, i) => ({
      year: yr,
      p10: mcResult.p10[i],
      p25: mcResult.p25[i],
      p50: mcResult.p50[i],
      p75: mcResult.p75[i],
      p90: mcResult.p90[i],
    }));
    goal.chart_data = chartData;
    goal.mc_computed_at = new Date();
    goal.years_remaining = yearsRemaining;

    if (mcResult.goal_probability >= 0.65) goal.status = 'on_track';
    else if (mcResult.goal_probability >= 0.35) goal.status = 'at_risk';
    else goal.status = 'off_track';

    goal.gemini_advice = await generateGoalAdvice(goal, profile, profile?.savings || 10000);
  }

  await goal.save();
  res.json({ success: true, goal });
}));

/**
 * DELETE /api/goals/:goalId [Protected]
 * Delete a financial goal.
 */
router.delete('/:goalId', verifyJWT, asyncHandler(async (req, res) => {
  const { goalId } = req.params;

  if (!isValidObjectId(goalId)) {
    throw createError(400, 'Invalid goalId', 'Invalid goal ID.');
  }

  const goal = await Goal.findOneAndDelete({ _id: goalId, userId: req.user.userId });
  if (!goal) {
    throw createError(404, `Goal not found for delete: ${goalId}`, 'Goal not found.');
  }

  res.json({ deleted: true, goalId });
}));

export default router;

