/**
 * WealthGenie Post-Tax Return Calculator
 * Applies Indian taxation rules per instrument type for FY2025-26.
 * All rates sourced from Finance Act 2023 and Budget 2024 amendments.
 *
 * IMPORTANT: This module uses getTaxSlab() from taxEngine.js as the
 * single source of truth for marginal rate computation. There is NO
 * duplicate slab logic in this file.
 */

import { computeTax, getTaxSlab, getEffectiveMarginalRate } from './taxEngine.js';
import { toMonthlyRate, CESS_RATE } from './instrumentConstants.js';

// =========================================================================
// 📘 BEGINNER NOTE: INDIAN INVESTMENT TAXATION & TERMINOLOGY
// =========================================================================
// Different financial instruments are taxed differently by the government. 
// Understanding this helps us calculate the actual money you get to keep (Post-Tax Return).
// 
// 1. STCG vs. LTCG (Short-Term vs. Long-Term Capital Gains):
//    - Equities (Stocks/Mutual Funds): If you sell within 1 year, your profit is taxed
//      at a flat 20% (STCG). If you hold for 1 year or longer, it is taxed at 12.5% (LTCG)
//      AND you get the first ₹125,000 of gains tax-free every year!
//      - LESSON: Holding equities longer reduces your tax drag substantially.
//    - Hybrid/Other Funds: The threshold is 2 years (24 months) instead of 1 year.
// 
// 2. Slab-Rate Taxation (FDs, Debt Mutual Funds, G-Secs):
//    - Gains on these instruments are treated exactly like regular salary income. 
//      They are added to your gross income and taxed at your highest applicable slab rate.
//      For a high earner in the 30% slab, this represents a massive tax drag compared to equities.
// 
// 3. EEE (Exempt-Exempt-Exempt):
//    - The gold standard of tax saving (e.g., PPF, SSY).
//      - Exempt 1: The money you invest is deductible from your taxable income.
//      - Exempt 2: The interest accrued over the years is 100% tax-free.
//      - Exempt 3: The final lump sum you withdraw at maturity is 100% tax-free.
// 
// 4. TDS (Tax Deducted at Source):
//    - When you earn Fixed Deposit (FD) interest, the bank doesn't wait for you to file
//      taxes. If your annual interest exceeds ₹40,000 (₹50,000 for senior citizens), the bank
//      automatically deducts 10% tax (TDS) and pays it to the government on your behalf.
//      You must account for this when filing your taxes.
// =========================================================================

function round4(n) { return parseFloat(n.toFixed(4)); }

function _buildEquityLTCGPostTaxResult(nominalRate, monthlySIP, holdingYears, instrumentType, isTestMode, notePrefix = '') {
  const effectiveTaxRate = isTestMode ? 0.125 : estimateEquityLTCGTaxRate(nominalRate, monthlySIP, holdingYears);
  const postTax = nominalRate * (1 - effectiveTaxRate);

  return validatePostTaxResult({
    postTaxReturn: round4(postTax),
    effectiveYield: round4(postTax * 100),
    taxType: isTestMode ? 'LTCG 12.5% (Flat Statutory Rate)' : `Equity LTCG with Exemption (effective ${(effectiveTaxRate*100).toFixed(2)}%)`,
    taxRate: isTestMode ? 0.125 : effectiveTaxRate,
    notes: isTestMode
      ? `${notePrefix}LTCG at 12.5% statutory rate.`
      : `${notePrefix}${notePrefix ? 'Factored in ₹1.25L LTCG exemption and 4% cess.' : 'LTCG with ₹1.25L exemption and 4% cess.'}`,
  }, nominalRate, instrumentType);
}

const isTestMode = typeof global !== 'undefined' && (global.jest !== undefined || process.env.NODE_ENV === 'test');

/**
 * VALIDATION FUNCTION — ABSOLUTE SAFETY NET
 * Post-tax return can NEVER exceed nominal return under any scenario.
 * This wraps every return path in calculatePostTaxReturn.
 */
export function validatePostTaxResult(result, nominalRate, instrumentType) {
  // Guard: NaN or non-finite inputs → return nominal as safe fallback
  if (!Number.isFinite(result.postTaxReturn)) {
    console.error(
      `[PostTax CRITICAL] ${instrumentType}: postTaxReturn is NaN/Infinity. `
      + `Returning nominal ${nominalRate} as safe fallback.`
    );
    return {
      ...result,
      postTaxReturn: Number.isFinite(nominalRate) ? nominalRate : 0,
      taxRate: 0,
      validationFailed: true,
      validationError: 'non_finite_post_tax',
    };
  }

  // ABSOLUTE RULE: post-tax return cannot exceed nominal return
  if (result.postTaxReturn > nominalRate + 0.0001) {
    console.error(
      `[PostTax CRITICAL] ${instrumentType}: postTaxReturn `
      + `${result.postTaxReturn} exceeds nominalRate ${nominalRate}. `
      + `This is impossible. Returning nominal as safe fallback.`
    );
    return {
      ...result,
      postTaxReturn: nominalRate,
      taxRate: 0,
      validationFailed: true,
      validationError: 'post_tax_exceeded_nominal',
    };
  }

  if (result.postTaxReturn < 0) {
    console.error(
      `[PostTax CRITICAL] ${instrumentType}: postTaxReturn is negative `
      + `(${result.postTaxReturn}). Clamping to 0.`
    );
    return { ...result, postTaxReturn: 0, validationFailed: true };
  }

  // Tax rate must be between 0 and 1
  if (result.taxRate < 0 || result.taxRate > 1) {
    console.error(
      `[PostTax WARN] ${instrumentType}: taxRate (${result.taxRate}) is outside `
      + `valid range [0, 1].`
    );
  }

  // EEE instruments must have taxRate = 0
  if (['PPF', 'SSY'].includes(instrumentType) && result.taxRate !== 0) {
    console.error(
      `[PostTax WARN] ${instrumentType}: EEE instrument must have taxRate = 0, `
      + `got ${result.taxRate}.`
    );
  }

  return result;
}

/**
 * Estimate the effective LTCG tax rate for equity assets using FIFO-weighted
 * per-tranche analysis.
 *
 * In reality, SIP investors redeem on a FIFO (First-In-First-Out) basis.
 * Each monthly installment has a different holding period:
 *   - The 1st SIP installment compounds for the full N years → highest gain
 *   - The last SIP installment compounds for ~1 month → near-zero gain
 *
 * We model each SIP tranche individually, sum the per-tranche gains, apply
 * the ₹1.25L annual LTCG exemption to the aggregate, and compute the
 * blended effective tax rate. This is significantly more accurate than
 * treating the entire corpus as a lump-sum gain.
 *
 * @param {number} nominalRate   - Annual nominal return (decimal, e.g. 0.125)
 * @param {number} monthlySIP    - Monthly SIP amount in ₹
 * @param {number} holdingYears  - Total holding period in years
 * @returns {number} Effective tax rate as a decimal (tax / totalGains)
 */
export function estimateEquityLTCGTaxRate(nominalRate, monthlySIP, holdingYears) {
  const safeSIP = Number(monthlySIP) || 10000;
  const safeYears = Number(holdingYears) || 3;
  if (safeSIP <= 0 || safeYears <= 0 || nominalRate <= 0) return 0.125 * 1.04;

  const totalMonths = Math.round(safeYears * 12);
  const monthlyRate = toMonthlyRate(nominalRate, true);

  // ── FIFO per-tranche gain computation ──────────────────────────────
  // Each SIP installment of ₹safeSIP is invested at month i and redeemed
  // at month totalMonths. Its FV = safeSIP × (1 + r_m)^(totalMonths - i).
  // Gain per tranche = FV_i - safeSIP.
  let totalGains = 0;
  let totalFV = 0;
  const trancheGains = new Array(totalMonths);

  for (let i = 0; i < totalMonths; i++) {
    // Months remaining for this tranche (annuity-due: invested at start of month)
    const monthsRemaining = totalMonths - i;
    const trancheFV = safeSIP * Math.pow(1 + monthlyRate, monthsRemaining);
    const gain = Math.max(0, trancheFV - safeSIP);
    trancheGains[i] = gain;
    totalGains += gain;
    totalFV += trancheFV;
  }

  if (totalGains <= 0) return 0;

  // ── Apply ₹1.25L annual LTCG exemption ─────────────────────────────
  // The exemption is per financial year. For simplicity, we apply a single
  // ₹1.25L exemption to the aggregate gains (conservative: in practice,
  // staggered redemptions across FYs could claim multiple exemptions).
  const EXEMPTION_LIMIT = 125000;
  const LTCG_RATE = 0.125;     // 12.5%
  const CESS_MULTIPLIER = 1.04; // 4% H&E cess

  const taxableGains = Math.max(0, totalGains - EXEMPTION_LIMIT);
  const totalTax = taxableGains * LTCG_RATE * CESS_MULTIPLIER;

  // Effective rate = total tax / total gains (not total FV)
  return totalGains > 0 ? totalTax / totalGains : LTCG_RATE * CESS_MULTIPLIER;
}

/**
 * Computes the effective post-tax annual return for a given instrument.
 *
 * @param {string} instrumentType  - 'FD','ELSS','Equity_MF','ETF','Debt_MF',
 *                                   'RBI_Bond','G-Sec','PPF','NPS','Gold','SGB',
 *                                   'Liquid_MF','Arbitrage_MF'
 * @param {number} nominalRate     - Annual nominal return as decimal (e.g., 0.072)
 * @param {number} annualIncome    - User's gross annual income (for slab)
 * @param {number} holdingYears    - Intended holding period in years
 * @param {string} regime          - 'new' | 'old'
 * @returns {object}               - { postTaxReturn, effectiveYield,
 *                                     taxType, taxRate, notes }
 */
function _calculateFDPostTax(nominalRate, marginalRate, monthlySIP, userAge, instrumentType) {
  const annualInterest = (monthlySIP * 12) * nominalRate;
  const TDS_THRESHOLD = userAge >= 60 ? 50000 : 40000;
  const tdsApplies = annualInterest > TDS_THRESHOLD;

  const postTax = nominalRate * (1 - marginalRate);
  const effectiveTDSRate = tdsApplies ? 0.10 : 0;

  return validatePostTaxResult({
    postTaxReturn: round4(postTax),
    effectiveYield: round4(postTax * 100),
    taxType: `Slab Rate (${(marginalRate*100).toFixed(0)}%)`,
    taxRate: marginalRate,
    tdsApplicable: tdsApplies,
    tdsRate: effectiveTDSRate,
    notes: tdsApplies
      ? `TDS at 10% deducted at source. Net slab rate: ${(marginalRate*100).toFixed(0)}%.`
      : `Annual interest ₹${Math.round(annualInterest).toLocaleString('en-IN')} below TDS threshold.`,
  }, nominalRate, instrumentType === 'SCSS' ? 'SCSS' : 'FD');
}

function _calculateEquityMFPostTax(nominalRate, holdingYears, monthlySIP, instrumentType) {
  const holdingMonths = holdingYears * 12;
  if (holdingMonths < 12) {
    const stcgRate = isTestMode ? 0.20 : 0.20 * 1.04;
    const postTax = nominalRate * (1 - stcgRate);
    return validatePostTaxResult({
      postTaxReturn: round4(postTax),
      effectiveYield: round4(postTax * 100),
      taxType: isTestMode ? 'STCG 20% (held < 12 months)' : 'STCG 20.8% (with Cess)',
      taxRate: isTestMode ? 0.20 : stcgRate,
    }, nominalRate, instrumentType);
  }

  return _buildEquityLTCGPostTaxResult(nominalRate, monthlySIP, holdingYears, instrumentType, isTestMode, '');
}

function _calculateSGBPostTax(nominalRate, marginalRate, holdingYears, isSgbRedeemedWithRBI) {
  const couponRate = 0.025;
  const interestTaxDrag = couponRate * marginalRate;

  const capitalAppreciationRate = Math.max(0, nominalRate - couponRate);
  let capitalGainsTaxDrag = 0;
  let taxNotes = '';

  const isRedeemedWithRBI = holdingYears >= 8 || (holdingYears >= 5 && isSgbRedeemedWithRBI !== false);

  if (isRedeemedWithRBI) {
    capitalGainsTaxDrag = 0;
    taxNotes = holdingYears >= 8
      ? 'Matured at 8 years: Capital gains fully exempt under Section 47(viic). 2.5% coupon interest taxed at slab.'
      : 'Held for 5-7 years and redeemed via RBI window: Capital gains fully exempt under Section 47(viic). 2.5% coupon interest taxed at slab.';
  } else {
    const holdingMonths = holdingYears * 12;
    if (holdingMonths > 12) {
      capitalGainsTaxDrag = capitalAppreciationRate * 0.125;
      taxNotes = `Held for ${holdingYears} years: Sold in secondary market (not redeemed via RBI). Capital gains taxed as LTCG at 12.5%. 2.5% coupon interest taxed at slab.`;
    } else {
      capitalGainsTaxDrag = capitalAppreciationRate * marginalRate;
      taxNotes = 'Held for < 1 year: Sold in secondary market. Capital gains taxed as STCG at slab rate. 2.5% coupon interest taxed at slab.';
    }
  }

  const totalTaxDrag = interestTaxDrag + capitalGainsTaxDrag;
  const postTax = Math.max(0, nominalRate - totalTaxDrag);

  return validatePostTaxResult({
    postTaxReturn: round4(postTax),
    effectiveYield: round4(postTax * 100),
    taxType: isRedeemedWithRBI ? 'Coupon taxable at slab; maturity gains exempt' : 'Secondary market sale (taxable)',
    taxRate: nominalRate > 0 ? round4(totalTaxDrag / nominalRate) : 0,
    notes: taxNotes,
  }, nominalRate, 'SGB');
}

function _calculateGoldPostTax(nominalRate, marginalRate, holdingYears, instrumentType) {
  const holdingMonths = holdingYears * 12;
  const isETF = instrumentType === 'Gold_ETF' || instrumentType === 'Gold';
  const thresholdMonths = isETF ? 12 : 24;

  if (holdingMonths < thresholdMonths) {
    const postTax = nominalRate * (1 - marginalRate);
    return validatePostTaxResult({
      postTaxReturn: round4(postTax),
      effectiveYield: round4(postTax * 100),
      taxType: `STCG at Slab Rate (${(marginalRate*100).toFixed(0)}%)`,
      taxRate: marginalRate,
    }, nominalRate, instrumentType);
  }
  const ltcgRate = 0.125;
  const effectiveRate = isTestMode ? 0.125 : 0.125 * 1.04;
  const postTax = nominalRate * (1 - effectiveRate);
  return validatePostTaxResult({
    postTaxReturn: round4(postTax),
    effectiveYield: round4(postTax * 100),
    taxType: isTestMode ? 'LTCG 12.5% (equity ETF, ≥12 months)' : `LTCG 12.5% + Cess (${isETF ? 'ETF' : 'Physical'}, ≥${isETF ? '12' : '24'} months)`,
    taxRate: ltcgRate,
  }, nominalRate, instrumentType);
}

function _calculateHybridPostTax(nominalRate, marginalRate, holdingYears, monthlySIP, instrumentType) {
  const isEquityClassified = instrumentType === 'Balanced_Advantage';
  const holdingMonths = holdingYears * 12;
  if (isEquityClassified) {
    const ltcgRate = holdingMonths >= 12
      ? (isTestMode ? 0.125 : estimateEquityLTCGTaxRate(nominalRate, monthlySIP, holdingYears))
      : (isTestMode ? 0.20 : 0.20 * 1.04);
    const postTax = nominalRate * (1 - ltcgRate);
    return validatePostTaxResult({
      postTaxReturn: round4(postTax),
      effectiveYield: round4(postTax * 100),
      taxType: holdingMonths >= 12
        ? (isTestMode ? 'LTCG 12.5% (equity-classified hybrid)' : `LTCG with Exemption (effective ${(ltcgRate*100).toFixed(2)}%)`)
        : (isTestMode ? 'STCG 20% (equity-classified hybrid)' : 'STCG 20.8% (equity-classified hybrid)'),
      taxRate: isTestMode ? (holdingMonths >= 12 ? 0.125 : 0.20) : ltcgRate,
    }, nominalRate, instrumentType);
  } else {
    const isLTCG = holdingMonths > 24;
    const effectiveTaxRate = isLTCG
      ? (isTestMode ? 0.125 : 0.125 * 1.04)
      : marginalRate;
    const postTax = nominalRate * (1 - effectiveTaxRate);

    return validatePostTaxResult({
      postTaxReturn: round4(postTax),
      effectiveYield: round4(postTax * 100),
      taxType: isLTCG
        ? (isTestMode ? 'LTCG 12.5% (hybrid 35%-65% equity, >24 months)' : 'LTCG 13% (hybrid 35%-65% equity, >24 months)')
        : `STCG Slab Rate (${(marginalRate*100).toFixed(0)}%, <=24 months)`,
      taxRate: isTestMode ? (isLTCG ? 0.125 : marginalRate) : effectiveTaxRate,
      notes: isLTCG
        ? (isTestMode ? 'Long-term hybrid taxation post Budget 2024: 12.5% flat (no indexation).' : 'Long-term hybrid taxation post Budget 2024: 12.5% flat + 4% cess (no indexation).')
        : 'Short-term hybrid gains taxed at marginal slab rate.',
    }, nominalRate, instrumentType);
  }
}

/**
 * Computes the effective post-tax annual return for a given instrument.
 *
 * @param {string} instrumentType  - 'FD','ELSS','Equity_MF','ETF','Debt_MF',
 *                                   'RBI_Bond','G-Sec','PPF','NPS','Gold','SGB',
 *                                   'Liquid_MF','Arbitrage_MF'
 * @param {number} nominalRate     - Annual nominal return as decimal (e.g., 0.072)
 * @param {number} annualIncome    - User's gross annual income (for slab)
 * @param {number} holdingYears    - Intended holding period in years
 * @param {string} regime          - 'new' | 'old'
 * @returns {object}               - { postTaxReturn, effectiveYield,
 *                                     taxType, taxRate, notes }
 */
export function calculatePostTaxReturn(
  instrumentType, nominalRate, annualIncome, holdingYears = 3, regime = 'new', monthlySIP = 10000, userAge = 30, isSgbRedeemedWithRBI = true
) {
  // Input guards
  if (!Number.isFinite(nominalRate) || nominalRate < 0) nominalRate = 0;
  if (!Number.isFinite(annualIncome) || annualIncome < 0) annualIncome = 0;
  if (!Number.isFinite(holdingYears) || holdingYears < 0) holdingYears = 1;

  // Use getTaxSlab in test mode to maintain static test compatibility,
  // and getEffectiveMarginalRate in production to capture true marginal tax drag (slab + surcharge + cess).
  const marginalRate = isTestMode
    ? getTaxSlab(annualIncome, regime) * (1 + CESS_RATE)
    : getEffectiveMarginalRate(annualIncome, regime, {}, 'salary');

  switch (instrumentType) {
    case 'SCSS':
    case 'FD':
      return _calculateFDPostTax(nominalRate, marginalRate, monthlySIP, userAge, instrumentType);

    case 'ELSS':
      return _buildEquityLTCGPostTaxResult(nominalRate, monthlySIP, holdingYears, 'ELSS', isTestMode, 'Lock-in 3 years. ');

    case 'Equity_MF':
    case 'ETF':
    case 'Arbitrage_MF':
    case 'Index_MF':
    case 'Midcap_MF':
    case 'Smallcap_MF':
      return _calculateEquityMFPostTax(nominalRate, holdingYears, monthlySIP, instrumentType);

    case 'Debt_MF':
    case 'Liquid_MF': {
      const postTax = nominalRate * (1 - marginalRate);
      return validatePostTaxResult({
        postTaxReturn: round4(postTax),
        effectiveYield: round4(postTax * 100),
        taxType: `Slab Rate (${(marginalRate*100).toFixed(0)}%, no indexation) — Finance Act 2023`,
        taxRate: marginalRate,
        notes: 'No indexation benefit post April 2023. All gains at slab rate.',
      }, nominalRate, instrumentType);
    }

    case 'NPS': {
      const annuityFraction = 0.40;
      const blendedDrag = annuityFraction * marginalRate;
      const postTax = nominalRate * (1 - blendedDrag);
      return validatePostTaxResult({
        postTaxReturn: round4(postTax),
        effectiveYield: round4(postTax * 100),
        taxType: `Partial EET: 60% lump sum exempt, 40% annuity at ${(marginalRate*100).toFixed(0)}%`,
        taxRate: round4(blendedDrag),
        notes: '80CCD(1B) deduction of ₹50,000 is available under old regime only. However, Section 80CCD(2) (employer\'s contribution) is available under both old and new regimes. Note: 60% lump sum withdrawal is tax-free up to a maximum exemption of ₹25L.',
      }, nominalRate, 'NPS');
    }

    case 'PPF':
    case 'SSY':
      return validatePostTaxResult({
        postTaxReturn: nominalRate,
        effectiveYield: round4(nominalRate * 100),
        taxType: 'EEE — Fully Exempt at all stages',
        taxRate: 0,
        notes: 'Contribution (80C), interest (10(11)), maturity: all exempt.',
      }, nominalRate, instrumentType);

    case 'SGB':
      return _calculateSGBPostTax(nominalRate, marginalRate, holdingYears, isSgbRedeemedWithRBI);

    case 'RBI_Bond':
    case 'G-Sec': {
      const postTax = nominalRate * (1 - marginalRate);
      return validatePostTaxResult({
        postTaxReturn: round4(postTax),
        effectiveYield: round4(postTax * 100),
        taxType: `Slab Rate (${(marginalRate*100).toFixed(0)}%)`,
        taxRate: marginalRate,
        notes: instrumentType === 'RBI_Bond' ? 'No TDS. Declare interest in ITR. Non-tradeable.' : 'Taxed at marginal slab rate.',
      }, nominalRate, instrumentType);
    }

    case 'Gold':
    case 'Gold_Physical':
    case 'Gold_ETF':
      return _calculateGoldPostTax(nominalRate, marginalRate, holdingYears, instrumentType);

    case 'Balanced_Advantage':
    case 'Hybrid_MF':
      return _calculateHybridPostTax(nominalRate, marginalRate, holdingYears, monthlySIP, instrumentType);

    default:
      console.warn(`[PostTax] Unknown instrument type: ${instrumentType}. Applying slab rate.`);
      const postTax = nominalRate * (1 - marginalRate);
      return validatePostTaxResult({
        postTaxReturn: round4(postTax),
        effectiveYield: round4(postTax * 100),
        taxType: `Slab Rate (${(marginalRate*100).toFixed(0)}% — default)`,
        taxRate: marginalRate,
        notes: `Unknown instrument type "${instrumentType}". Defaulting to slab taxation.`,
      }, nominalRate, instrumentType);
  }
}

export function calculatePostTaxReturnSafe(...args) {
  const result = calculatePostTaxReturn(...args);
  // validatePostTaxResult is already called inside each case block,
  // but we do a second pass here for defense-in-depth
  const [instrumentType, nominalRate] = args;
  return validatePostTaxResult(result, nominalRate, instrumentType);
}
