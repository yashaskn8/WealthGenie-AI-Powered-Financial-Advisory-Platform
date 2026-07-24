import { Router } from 'express';
import { verifyJWT, isOwner, isValidObjectId } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate, monteCarloSchema } from '../validation/schemas.js';
import { runMonteCarloWithGoal, getInstrumentVolatility } from '../services/monteCarloEngine.js';
import { getLiveInstrumentParams } from '../services/marketDataService.js';
import { calculatePostTaxReturn } from '../services/postTaxCalculator.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { getCache, setCache } from '../config/redis.js';

const router = Router();

/**
 * POST /api/montecarlo/montecarlo [Protected]
 * Run Monte Carlo simulation for a specific instrument.
 *
 * When a profileId is provided, the simulation uses:
 *   1. Live Nifty-derived volatility params (from AMFI/Yahoo Finance)
 *   2. Post-tax adjusted returns (from the user's marginal slab)
 */
router.post('/montecarlo', verifyJWT, validate(monteCarloSchema), asyncHandler(async (req, res) => {
  const { instrument, monthly_investment, years, target_amount, profileId, current_savings } = req.body;

  // ── Step 1: Fetch live instrument parameters (Nifty-derived for equity) ──
  const liveResult = await getLiveInstrumentParams();
  const liveParams = liveResult.params[instrument]
    || getInstrumentVolatility(instrument);

  let effectiveRate = liveParams.mean;
  let effectiveVolatility = liveParams.stdDev;
  let dataSource = liveParams.source || 'static';
  let postTaxInfo = null;

  // ── Step 2: If profileId provided, compute post-tax adjusted rate ──
  if (profileId) {
    if (!isValidObjectId(profileId)) {
      throw createError(400, 'Invalid profileId in montecarlo', 'Invalid profile ID.');
    }

    const profile = await FinancialProfile.findOne({ _id: profileId, userId: req.user.userId }).lean();
    if (!profile) {
      throw createError(404, `Profile not found for Monte Carlo: ${profileId}`, 'Profile not found.');
    }

    // Authorization check
    if (!isOwner(profile, req.user.userId)) {
      throw createError(403, `Unauthorized MC profile access: ${profileId}`, 'Access denied.');
    }

    const annualIncome = profile.annualIncome || (profile.income * 12);
    const regime = profile.taxRegime || 'new';

    try {
      const postTaxResult = calculatePostTaxReturn(
        instrument,
        liveParams.mean,
        annualIncome,
        years,
        regime,
        monthly_investment,   // monthlySIP for accurate FD TDS / ELSS LTCG
        profile.age || 30     // userAge for senior citizen TDS thresholds
      );

      effectiveRate = postTaxResult.postTaxReturn;
      postTaxInfo = {
        nominal_rate: liveParams.mean,
        post_tax_rate: postTaxResult.postTaxReturn,
        tax_type: postTaxResult.taxType,
        tax_rate: postTaxResult.taxRate,
        tds_applicable: postTaxResult.tdsApplicable || false,
        regime,
      };
    } catch (taxErr) {
      console.warn('[MonteCarlo] Post-tax calculation failed, using pre-tax rate:', taxErr.message);
    }
  }

  // ── Step 3: Check Redis cache ──
  // Round effectiveRate to 4 decimal places to avoid cache fragmentation from float precision
  const rateKey = effectiveRate.toFixed(4);
  const volatilityKey = effectiveVolatility.toFixed(4);
  const targetKey = target_amount === undefined || target_amount === null
    ? 'none'
    : Number(target_amount).toFixed(0);
  const savingsKey = current_savings === undefined || current_savings === null
    ? '0'
    : Number(current_savings).toFixed(0);
  const cacheKey = `mc:${req.user.userId}:${instrument}:${years}:${monthly_investment}:${savingsKey}:${targetKey}:${rateKey}:${volatilityKey}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  // ── Step 4: Run Monte Carlo simulation with live + post-tax params ──
  const result = runMonteCarloWithGoal({
    monthlyInvestment: monthly_investment,
    postTaxAnnualReturn: effectiveRate,
    annualVolatility: effectiveVolatility,
    years,
    simulations: 10000,
    targetAmount: target_amount || null,
    currentSavings: current_savings || 0,
  });

  // ── Step 5: Build Recharts-friendly chart data ──
  const chartData = result.years_array.map((yr, i) => ({
    year: yr,
    p10: result.p10[i],
    p25: result.p25[i],
    p50: result.p50[i],
    p75: result.p75[i],
    p90: result.p90[i],
    mean: result.mean[i],
    // Inflation-adjusted (real) values
    p10_real: result.p10_real ? result.p10_real[i] : undefined,
    p50_real: result.p50_real ? result.p50_real[i] : undefined,
    p90_real: result.p90_real ? result.p90_real[i] : undefined,
    standard_error: result.standard_error ? result.standard_error[i] : undefined,
  }));

  // Confidence interval width: how tight the estimates are
  // Narrower = more reliable. CI_width = (p75 - p25) / p50 at terminal year
  const termIdx = result.p50.length - 1;
  const ciWidth = termIdx >= 0 && result.p50[termIdx] > 0
    ? parseFloat(((result.p75[termIdx] - result.p25[termIdx]) / result.p50[termIdx]).toFixed(3))
    : null;

  const response = {
    instrument,
    years,
    monthly_investment,
    chartData,
    goal_probability: result.goal_probability,
    target_amount: result.target_amount,
    simulations_run: result.simulations_run,
    variance_reduction: result.variance_reduction || 'none',
    percentile_summary: {
      p10: result.p10[termIdx],
      p25: result.p25[termIdx],
      p50: result.p50[termIdx],
      p75: result.p75[termIdx],
      p90: result.p90[termIdx],
    },
    percentile_summary_real: result.p50_real ? {
      p10: result.p10_real[termIdx],
      p25: result.p25_real[termIdx],
      p50: result.p50_real[termIdx],
      p75: result.p75_real[termIdx],
      p90: result.p90_real[termIdx],
    } : null,
    confidence_interval_width: ciWidth,
    data_source: dataSource,
    post_tax_rate_used: effectiveRate,
    volatility_used: effectiveVolatility,
    nifty_derived: dataSource === 'live',
    post_tax_info: postTaxInfo,
    sequence_of_returns_risk: result.sequence_of_returns_risk || null,
    sharpe_ratio_sensitivity: result.sharpe_ratio_sensitivity || null,
    inflation_rate: result.inflation_rate || 0.05,
    cached: false,
  };

  // Cache for 30 minutes
  await setCache(cacheKey, response, 1800);
  res.json(response);
}));

export default router;
