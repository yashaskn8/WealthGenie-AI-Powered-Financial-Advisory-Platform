import { Router } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validateQuery, taxComputeSchema, taxCompareSchema } from '../validation/schemas.js';
import { computeTax, compareTaxRegimes, isFYVerified, CURRENT_FY } from '../services/taxEngine.js';
import { CESS_RATE } from '../services/instrumentConstants.js';

const router = Router();

function _parseTaxDeductionsFromQuery(query) {
  return {
    section80C: Number(query.section80C) || 0,
    nps80CCD1B: Number(query.nps80CCD1B) || 0,
    nps80CCD2: Number(query.nps80CCD2) || 0,
    basicSalary: query.basicSalary !== undefined ? Number(query.basicSalary) : undefined,
    isGovtEmployee: query.isGovtEmployee === 'true' || query.isGovtEmployee === true,
    section80D: Number(query.section80D) || 0,
    section80D_self: query.section80D_self !== undefined ? Number(query.section80D_self) : undefined,
    section80D_parents: query.section80D_parents !== undefined ? Number(query.section80D_parents) : undefined,
    parents_senior: query.parents_senior === 'true' || query.parents_senior === true,
    self_senior: query.self_senior === 'true' || query.self_senior === true,
    hra: Number(query.hra) || 0,
    homeLoanInterest: Number(query.homeLoanInterest) || 0,
    other: Number(query.other) || 0,
    age: query.age !== undefined ? Number(query.age) : undefined,
  };
}

/**
 * GET /api/tax/compute?income=1200000&regime=new
 * Compute tax for a specific income and regime.
 */
router.get('/compute', validateQuery(taxComputeSchema), asyncHandler(async (req, res) => {
  // Joi coerces query strings to numbers via taxComputeSchema
  const income = Number(req.query.income);
  const regime = req.query.regime || 'new';

  if (!Number.isFinite(income) || income < 0) {
    return res.status(400).json({ error: 'Income must be a valid positive number.' });
  }

  const deductions = _parseTaxDeductionsFromQuery(req.query);
  const result = computeTax(income, regime, deductions, req.query.incomeSource, req.query.fiscalYear);

  const fiscalYear = result.fiscalYear || req.query.fiscalYear || CURRENT_FY;
  const verified = isFYVerified(fiscalYear);
  const response = { ...result, fiscal_year: fiscalYear, verified };
  if (!verified) {
    response.warning = `UNVERIFIED: Tax slabs for ${fiscalYear} have not been confirmed against an official source. Do not rely on this for tax filing.`;
  }
  res.json(response);
}));

/**
 * GET /api/tax/compare?income=1200000
 * Compare both tax regimes and return the recommended one.
 */
router.get('/compare', validateQuery(taxCompareSchema), asyncHandler(async (req, res) => {
  const income = Number(req.query.income);

  if (!Number.isFinite(income) || income < 0) {
    return res.status(400).json({ error: 'Income must be a valid positive number.' });
  }

  const deductions = _parseTaxDeductionsFromQuery(req.query);
  const { newRegime, oldRegime, recommended } = compareTaxRegimes(income, deductions, req.query.incomeSource, req.query.fiscalYear);
  const saving = Math.abs(newRegime.taxAmount - oldRegime.taxAmount);

  const fiscalYear = newRegime.fiscalYear || req.query.fiscalYear || CURRENT_FY;
  const verified = isFYVerified(fiscalYear);

  const response = {
    income,
    fiscal_year: fiscalYear,
    verified,
    new_regime: {
      tax: newRegime.taxAmount,
      effective_rate: newRegime.effectiveRate,
      rebate_applied: newRegime.rebateApplied,
      taxable_income: newRegime.taxableIncome,
      standard_deduction: newRegime.standardDeduction,
      marginal_relief_applied: newRegime.marginalReliefApplied || false,
      marginal_relief_amount: newRegime.marginalReliefAmount || 0,
      cess: Math.round(newRegime.taxAmount * CESS_RATE / (1 + CESS_RATE)),
      nps80CCD2: newRegime.nps80CCD2 || 0,
      allowed80D: newRegime.allowed80D || 0,
    },
    old_regime: {
      tax: oldRegime.taxAmount,
      effective_rate: oldRegime.effectiveRate,
      rebate_applied: oldRegime.rebateApplied,
      taxable_income: oldRegime.taxableIncome,
      standard_deduction: oldRegime.standardDeduction,
      marginal_relief_applied: oldRegime.marginalReliefApplied || false,
      marginal_relief_amount: oldRegime.marginalReliefAmount || 0,
      cess: Math.round(oldRegime.taxAmount * CESS_RATE / (1 + CESS_RATE)),
      nps80CCD2: oldRegime.nps80CCD2 || 0,
      allowed80D: oldRegime.allowed80D || 0,
    },
    recommended_regime: recommended,
    saving,
    saving_pct: income > 0 ? parseFloat(((saving / income) * 100).toFixed(2)) : 0,
    saving_with: recommended,
  };
  if (!verified) {
    response.warning = `UNVERIFIED: Tax slabs for ${fiscalYear} have not been confirmed against an official source. Do not rely on this for tax filing.`;
  }
  res.json(response);
}));

export default router;
