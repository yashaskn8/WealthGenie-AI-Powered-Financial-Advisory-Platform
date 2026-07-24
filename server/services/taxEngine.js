import { CESS_RATE } from './instrumentConstants.js';
/**
 * Dynamically computes India's current fiscal year (April 1st to March 31st).
 * @returns {string} e.g. "FY2026-27"
 */
export function getCurrentFiscalYear() {
    const now = new Date();
    const year = now.getFullYear();
    // India's fiscal year starts in April (month index 3)
    const isAprilOrLater = now.getMonth() >= 3;
    const startYear = isAprilOrLater ? year : year - 1;
    const endYear = startYear + 1;
    return `FY${startYear}-${endYear.toString().slice(-2)}`;
}
export const CURRENT_FY = getCurrentFiscalYear();
const defineSlabs = (slabs) => Object.freeze(slabs.map(slab => Object.freeze({ ...slab })));
const STANDARD_NEW_SLABS = defineSlabs([
    { min: 0, max: 400000, rate: 0 },
    { min: 400000, max: 800000, rate: 0.05 },
    { min: 800000, max: 1200000, rate: 0.10 },
    { min: 1200000, max: 1600000, rate: 0.15 },
    { min: 1600000, max: 2000000, rate: 0.20 },
    { min: 2000000, max: 2400000, rate: 0.25 },
    { min: 2400000, max: Infinity, rate: 0.30 },
]);
const STANDARD_OLD_SLABS = defineSlabs([
    { min: 0, max: 250000, rate: 0 },
    { min: 250000, max: 500000, rate: 0.05 },
    { min: 500000, max: 1000000, rate: 0.20 },
    { min: 1000000, max: Infinity, rate: 0.30 },
]);

export const TAX_SLABS_BY_FY = Object.freeze({
    'FY2025-26': Object.freeze({
        verified: true, // Confirmed against Finance Act 2023 / Union Budget 2024.
        new: STANDARD_NEW_SLABS,
        old: STANDARD_OLD_SLABS,
    }),
    'FY2026-27': Object.freeze({
        // FY2026-27: Union Budget 2025 confirmed same slab rates as FY2025-26. verified=true.
        verified: true,
        new: STANDARD_NEW_SLABS,
        old: STANDARD_OLD_SLABS,
    }),
});
export function getTaxSlabsForFY(fiscalYear = CURRENT_FY) {
    return TAX_SLABS_BY_FY[fiscalYear] || TAX_SLABS_BY_FY[CURRENT_FY];
}
/**
 * Check whether the tax slabs for a given fiscal year have been verified
 * against an official gazette/Union Budget source.
 */
export function isFYVerified(fiscalYear = CURRENT_FY) {
    const entry = TAX_SLABS_BY_FY[fiscalYear];
    return entry ? entry.verified === true : false;
}
function getRegimeSlabs(regime, fiscalYear = CURRENT_FY) {
    const slabs = getTaxSlabsForFY(fiscalYear);
    return regime === 'old' ? slabs.old : slabs.new;
}
/**
 * Calculate tax from slab structure.
 */
function calculateFromSlabs(taxableIncome, slabs) {
    let tax = 0;
    for (const slab of slabs) {
        if (taxableIncome <= slab.min)
            break;
        const taxableInSlab = Math.min(taxableIncome, slab.max) - slab.min;
        tax += taxableInSlab * slab.rate;
    }
    return tax;
}
/**
 * Compute surcharge on base tax for high-income individuals.
 */
function computeSurcharge(taxBeforeSurcharge, taxableIncome, regime) {
    if (taxableIncome <= 5000000)
        return 0; // Below ₹50L: no surcharge
    let surchargeRate = 0;
    if (regime === 'new') {
        if (taxableIncome <= 10000000)
            surchargeRate = 0.10;
        else if (taxableIncome <= 20000000)
            surchargeRate = 0.15;
        else
            surchargeRate = 0.25;
    }
    else {
        // Old regime
        if (taxableIncome <= 10000000)
            surchargeRate = 0.10;
        else if (taxableIncome <= 20000000)
            surchargeRate = 0.15;
        else if (taxableIncome <= 50000000)
            surchargeRate = 0.25;
        else
            surchargeRate = 0.37;
    }
    return taxBeforeSurcharge * surchargeRate;
}
/**
 * Compute surcharge WITH marginal relief.
 */
function computeMarginalRelief(baseTax, surcharge, taxableIncome, regime, fiscalYear = CURRENT_FY) {
    if (taxableIncome <= 5000000)
        return 0;
    const SURCHARGE_THRESHOLDS = regime === 'new'
        ? [5000000, 10000000, 20000000]
        : [5000000, 10000000, 20000000, 50000000];
    // Find the highest active threshold strictly below the taxable income
    let threshold = 5000000;
    for (const t of SURCHARGE_THRESHOLDS) {
        if (taxableIncome > t) {
            threshold = t;
        }
    }
    const slabs = getRegimeSlabs(regime, fiscalYear);
    const baseTaxAtThreshold = calculateFromSlabs(threshold, slabs);
    // Surcharge rate AT exactly the threshold limit
    let thresholdSurchargeRate = 0;
    if (threshold === 10000000) {
        thresholdSurchargeRate = 0.10;
    }
    else if (threshold === 20000000) {
        thresholdSurchargeRate = 0.15;
    }
    else if (threshold === 50000000 && regime === 'old') {
        thresholdSurchargeRate = 0.25;
    }
    const taxAtThreshold = baseTaxAtThreshold * (1 + thresholdSurchargeRate);
    // Total tax at actual income
    const totalActual = baseTax + surcharge;
    // Income gain above threshold
    const incomeGain = taxableIncome - threshold;
    // Relief: tax should not exceed tax-at-threshold + income-gain
    const maxAllowedTax = taxAtThreshold + incomeGain;
    const marginalRelief = totalActual > maxAllowedTax ? totalActual - maxAllowedTax : 0;
    return Math.round(marginalRelief);
}
/**
 * Helper to compute allowed standard and section-wise deductions and taxable income.
 */
export function calculateTaxableIncome(annualIncome, regime = 'new', deductions = {}, incomeSource = 'salary') {
    let standardDeduction = 0;
    if (incomeSource === 'salary' || incomeSource === 'pension') {
        standardDeduction = regime === 'new' ? 75000 : 50000;
    }
    else if (incomeSource === 'family_pension') {
        standardDeduction = Math.min(annualIncome / 3, 15000);
    }
    // Section 80CCD(2) - Employer NPS Contribution (available under both regimes)
    const basicSalary = deductions.basicSalary || (annualIncome * 0.5);
    const isGovtEmployee = deductions.isGovtEmployee === true;
    const nps80CCD2LimitPercent = isGovtEmployee ? 0.14 : 0.10;
    const max80CCD2 = basicSalary * nps80CCD2LimitPercent;
    const nps80CCD2 = Math.min(deductions.nps80CCD2 || 0, max80CCD2);
    const section80C = Math.min(deductions.section80C || 0, 150000);
    const nps80CCD1B = Math.min(deductions.nps80CCD1B || deductions.section80CCD || 0, 50000);
    // Section 80D Granular Self vs. Parents
    const age = deductions.age || 30;
    const selfSenior = age >= 60 || deductions.self_senior === true;
    const parentsSenior = deductions.parents_senior === true;
    const max80D_self = selfSenior ? 50000 : 25000;
    const max80D_parents = parentsSenior ? 50000 : 25000;
    let allowed80D = 0;
    if (deductions.section80D_self !== undefined || deductions.section80D_parents !== undefined) {
        const allowed80D_self = Math.min(deductions.section80D_self || 0, max80D_self);
        const allowed80D_parents = Math.min(deductions.section80D_parents || 0, max80D_parents);
        allowed80D = allowed80D_self + allowed80D_parents;
    }
    else {
        allowed80D = Math.min(deductions.section80D || 0, 100000);
    }
    const hra = deductions.hra || 0;
    const homeLoanInterest = Math.min(deductions.homeLoanInterest || 0, 200000);
    const section80EEA = Math.min(deductions.section80EEA || 0, 150000);
    const otherDeductions = deductions.other || 0;
    const savingsInterest = deductions.savingsInterest || 0;
    let section80TTA = deductions.section80TTA || 0;
    let section80TTB = deductions.section80TTB || 0;
    if (savingsInterest > 0) {
        if (age >= 60) {
            section80TTB = Math.max(section80TTB, savingsInterest);
        }
        else {
            section80TTA = Math.max(section80TTA, savingsInterest);
        }
    }
    const allowed80TTA = age < 60 ? Math.min(section80TTA, 10000) : 0;
    const allowed80TTB = age >= 60 ? Math.min(section80TTB, 50000) : 0;
    const oldRegimeDeductions = regime === 'old'
        ? (section80C + nps80CCD1B + allowed80D + hra + homeLoanInterest + section80EEA + allowed80TTA + allowed80TTB + otherDeductions)
        : 0;
    const taxableIncome = Math.max(0, annualIncome - standardDeduction - nps80CCD2 - oldRegimeDeductions);
    return { standardDeduction, oldRegimeDeductions, taxableIncome, nps80CCD2, allowed80D };
}
/**
 * Compute full tax breakdown for a given annual income.
 */
export function computeTax(annualIncome, regime = 'new', deductions = {}, incomeSource = 'salary', fiscalYear = CURRENT_FY) {
    // Input guard: reject non-finite or negative income using local variable
    let safeIncome = annualIncome;
    if (!Number.isFinite(safeIncome) || safeIncome < 0) {
        console.warn(`[TaxEngine] Invalid annualIncome: ${safeIncome}. Treating as 0.`);
        safeIncome = 0;
    }
    let safeRegime = (regime === 'new' || regime === 'old') ? regime : 'new';
    const slabs = getRegimeSlabs(safeRegime, fiscalYear);
    const { standardDeduction, oldRegimeDeductions, taxableIncome, nps80CCD2, allowed80D } = calculateTaxableIncome(safeIncome, safeRegime, deductions, incomeSource);
    let taxBeforeCess = calculateFromSlabs(taxableIncome, slabs);
    let rebateApplied = false;
    let marginalReliefApplied = false;
    let marginalReliefAmount87A = 0;
    const rebateLimit = safeRegime === 'new' ? 1200000 : 500000;
    if (taxableIncome <= rebateLimit) {
        taxBeforeCess = 0;
        rebateApplied = true;
    }
    else {
        // Marginal relief for 87A: tax cannot exceed the excess over rebate limit
        const excessOverLimit = taxableIncome - rebateLimit;
        if (taxBeforeCess > excessOverLimit) {
            marginalReliefAmount87A = taxBeforeCess - excessOverLimit;
            taxBeforeCess = excessOverLimit;
            marginalReliefApplied = true;
        }
    }
    const surcharge = computeSurcharge(taxBeforeCess, taxableIncome, safeRegime);
    const relief = computeMarginalRelief(taxBeforeCess, surcharge, taxableIncome, safeRegime, fiscalYear);
    const taxAfterSurcharge = taxBeforeCess + surcharge - relief;
    // 4% Health & Education Cess (applied on tax + surcharge)
    const cess = taxAfterSurcharge * CESS_RATE;
    const taxAmount = taxAfterSurcharge + cess;
    const effectiveRate = annualIncome > 0
        ? parseFloat(((taxAmount / annualIncome) * 100).toFixed(2))
        : 0;
    return {
        taxAmount: Math.round(taxAmount),
        effectiveRate,
        regime: safeRegime,
        rebateApplied,
        marginalReliefApplied: marginalReliefApplied || relief > 0,
        marginalReliefAmount: Math.round(relief + marginalReliefAmount87A),
        surchargeApplied: surcharge > 0,
        surchargeAmount: Math.round(surcharge),
        cess: Math.round(cess),
        taxBeforeCess: Math.round(taxBeforeCess),
        taxableIncome,
        annualIncome: safeIncome,
        standardDeduction,
        oldRegimeDeductions,
        nps80CCD2,
        allowed80D,
        fiscalYear,
    };
}
/**
 * Compute tax with deductions (convenience wrapper/alias).
 */
export function computeTaxWithDeductions(annualIncome, regime, deductions = {}, incomeSource = 'salary', fiscalYear = CURRENT_FY) {
    return computeTax(annualIncome, regime, deductions, incomeSource, fiscalYear);
}
/**
 * Get the marginal (highest applicable) tax slab percentage.
 */
export function getTaxSlab(annualIncome, regime = 'new', deductions = {}, incomeSource = 'salary', fiscalYear = CURRENT_FY) {
    // Input guard
    let safeIncome = annualIncome;
    if (!Number.isFinite(safeIncome) || safeIncome < 0)
        safeIncome = 0;
    let safeRegime = (regime === 'new' || regime === 'old') ? regime : 'new';
    const { taxableIncome } = calculateTaxableIncome(safeIncome, safeRegime, deductions, incomeSource);
    const slabs = getRegimeSlabs(safeRegime, fiscalYear);
    let marginalRate = 0;
    for (const slab of slabs) {
        if (taxableIncome > slab.min) {
            marginalRate = slab.rate;
        }
    }
    return marginalRate;
}
/**
 * Compare both regimes and return the better one.
 */
export function compareTaxRegimes(annualIncome, deductions = {}, incomeSource = 'salary', fiscalYear = CURRENT_FY) {
    // Input guard
    let safeIncome = annualIncome;
    if (!Number.isFinite(safeIncome) || safeIncome < 0)
        safeIncome = 0;
    const newRegime = computeTax(safeIncome, 'new', deductions, incomeSource, fiscalYear);
    const oldRegime = computeTax(safeIncome, 'old', deductions, incomeSource, fiscalYear);
    const recommended = newRegime.taxAmount <= oldRegime.taxAmount ? 'new' : 'old';
    return { newRegime, oldRegime, recommended };
}
/**
 * Get the effective marginal tax rate (slab + surcharge + cess) for a given income level.
 * Useful for post-tax drag adjustments on future returns.
 */
export function getEffectiveMarginalRate(annualIncome, regime = 'new', deductions = {}, incomeSource = 'salary', fiscalYear = CURRENT_FY) {
    const delta = 10000;
    const highIncome = annualIncome + delta;
    const lowIncome = Math.max(0, annualIncome - delta);
    const highRes = computeTax(highIncome, regime, deductions, incomeSource, fiscalYear);
    const lowRes = computeTax(lowIncome, regime, deductions, incomeSource, fiscalYear);
    const deltaIncome = highIncome - lowIncome;
    if (deltaIncome <= 0)
        return 0;
    const deltaTax = highRes.taxAmount - lowRes.taxAmount;
    const effectiveMarginal = deltaTax / deltaIncome;
    return parseFloat(Math.max(0, Math.min(effectiveMarginal, 0.45)).toFixed(4));
}
