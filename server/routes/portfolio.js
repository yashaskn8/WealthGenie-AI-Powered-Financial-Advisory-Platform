/**
 * WealthGenie Portfolio Optimisation Route
 * ─────────────────────────────────────────
 * POST /api/portfolio/optimise
 *
 * Accepts an asset universe and strategy, computes post-tax returns
 * for the authenticated user's tax profile, and returns optimal weights.
 *
 * @module routes/portfolio
 */

import { Router } from 'express';
import { verifyJWT, isOwner, isValidObjectId } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { optimisePortfolio, computeRebalance } from '../services/portfolioEngine.js';
import { calculatePostTaxReturnSafe } from '../services/postTaxCalculator.js';
import { INSTRUMENT_PARAMS } from '../services/instrumentConstants.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { validate, rebalanceSchema } from '../validation/schemas.js';

const router = Router();

/** Default asset universe when client doesn't specify */
const DEFAULT_ASSETS = ['Equity_MF', 'Debt_MF', 'Gold', 'PPF', 'FD'];

/** Allowed optimisation strategies */
const VALID_STRATEGIES = ['min_variance', 'max_sharpe', 'risk_parity'];

/**
 * POST /api/portfolio/optimise [Protected]
 *
 * Body:
 *   profileId  {string}    — MongoDB ObjectId for the user's FinancialProfile
 *   assets     {string[]}  — (optional) asset classes to include (default: DEFAULT_ASSETS)
 *   strategy   {string}    — (optional) 'min_variance' | 'max_sharpe' | 'risk_parity' (default: 'max_sharpe')
 *
 * Response:
 *   {
 *     strategy,
 *     weights:             { asset: weight },
 *     expected_return,
 *     volatility,
 *     sharpe_ratio,
 *     risk_contributions?  (only for risk_parity)
 *   }
 */
router.post(
  '/optimise',
  verifyJWT,
  asyncHandler(async (req, res) => {
    const { profileId, assets, strategy } = req.body;

    /* ── Validate profileId ─────────────────────────────────────────── */
    if (!profileId || !isValidObjectId(profileId)) {
      throw createError(400, `Invalid profileId: ${profileId}`, 'A valid profile ID is required.');
    }

    /* ── Validate strategy ──────────────────────────────────────────── */
    const selectedStrategy = strategy || 'max_sharpe';
    if (!VALID_STRATEGIES.includes(selectedStrategy)) {
      throw createError(
        400,
        `Invalid strategy: ${strategy}`,
        `Strategy must be one of: ${VALID_STRATEGIES.join(', ')}`
      );
    }

    /* ── Validate and resolve asset keys ────────────────────────────── */
    const assetKeys = Array.isArray(assets) && assets.length > 0 ? assets : DEFAULT_ASSETS;

    // Ensure every requested asset exists in INSTRUMENT_PARAMS
    for (const key of assetKeys) {
      if (!INSTRUMENT_PARAMS[key]) {
        throw createError(
          400,
          `Unknown asset key: ${key}`,
          `"${key}" is not a recognised instrument. Check /api/instruments for valid keys.`
        );
      }
    }

    if (assetKeys.length < 2) {
      throw createError(
        400,
        'At least 2 assets required for portfolio optimisation',
        'Please provide at least 2 asset classes for meaningful diversification.'
      );
    }

    /* ── Fetch profile ──────────────────────────────────────────────── */
    const profile = await FinancialProfile.findOne({ _id: profileId, userId: req.user.userId }).lean();
    if (!profile) {
      throw createError(404, `Profile not found: ${profileId}`, 'Financial profile not found.');
    }
    if (!isOwner(profile, req.user.userId)) {
      throw createError(403, `Unauthorised profile access: ${profileId}`, 'Access denied.');
    }

    /* ── Compute post-tax returns for each asset ────────────────────── */
    const postTaxReturns = assetKeys.map((key) => {
      const nominalRate = INSTRUMENT_PARAMS[key].nominalRate / 100; // decimal
      const ptResult = calculatePostTaxReturnSafe(
        key,
        nominalRate,
        profile.annualIncome,
        profile.investmentHorizon || 15,
        profile.taxRegime || 'new'
      );
      return ptResult.postTaxReturn; // already decimal
    });

    /* ── Run optimiser ──────────────────────────────────────────────── */
    const result = optimisePortfolio(assetKeys, postTaxReturns, selectedStrategy);

    /* ── Format response ────────────────────────────────────────────── */
    const response = {
      strategy: result.strategy,
      weights: result.weights,
      expected_return: result.expectedReturn,
      volatility: result.volatility,
    };

    if (result.sharpe !== undefined) {
      response.sharpe_ratio = result.sharpe;
    }
    if (result.riskContributions) {
      response.risk_contributions = result.riskContributions;
    }

    res.json(response);
  })
);

/**
 * POST /api/portfolio/rebalance [Protected]
 * Calculates weight drift, overweight/underweight positions, suggested correction actions,
 * and before/after CAGRs and risk scores.
 */
router.post(
  '/rebalance',
  verifyJWT,
  validate(rebalanceSchema),
  asyncHandler(async (req, res) => {
    const { current_allocation, target_allocation, threshold, partial_ratio, holding_months } = req.body;

    const result = computeRebalance(
      current_allocation,
      target_allocation,
      threshold,
      partial_ratio,
      holding_months
    );

    res.json(result);
  })
);

export default router;
