/**
 * taxCalculator.js — Display Formatter for Tax API Responses
 * ──────────────────────────────────────────────────────────
 * ARCHITECTURE NOTE:
 * All tax computation is performed EXCLUSIVELY by server/services/taxEngine.js.
 * This module contains ZERO slab-rate arrays and ZERO tax computation logic.
 * It only formats backend API responses for the UI and provides display constants.
 *
 * If you need to update tax slabs for a new financial year, update ONLY:
 *   server/services/taxEngine.js
 * Do NOT add slab computation here.
 */

import { computeTax } from '../services/api.js';

// ─── Display Constants (not computation — safe to keep client-side) ──
export const SECTION_80C_LIMIT = 150000;
export const SECTION_80CCD_1B_LIMIT = 50000;

/**
 * Formats a raw tax API response into display-ready strings.
 * @param {Object} taxApiResponse - Response from /api/tax/compute
 */
export function formatTaxBreakdown(taxApiResponse) {
  return {
    taxAmount: formatINR(taxApiResponse.taxAmount),
    effectiveRate: `${taxApiResponse.effectiveRate}%`,
    rebateNote: taxApiResponse.rebateApplied
      ? '87A rebate applied — zero tax liability' : null,
    surchargeNote: taxApiResponse.surchargeApplied
      ? `Surcharge: ${formatINR(taxApiResponse.surchargeAmount)}` : null,
    regime: taxApiResponse.regime === 'new'
      ? 'New Tax Regime (FY2025-26)' : 'Old Tax Regime',
  };
}

/**
 * Fetch tax computation from backend API.
 * @param {number} annualIncome
 * @param {string} regime - 'new' or 'old'
 * @returns {Promise<Object>} Tax breakdown from server/services/taxEngine.js
 */
export async function fetchTaxComputation(annualIncome, regime = 'new') {
  return computeTax(annualIncome, regime);
}

/**
 * Returns tax-saving investment recommendations to fill deduction gaps.
 * This is DISPLAY LOGIC — it filters eligible instruments, not computes tax.
 */
function matchesTaxSection(inv, sectionStr) {
  if (inv.taxType) {
    if (sectionStr === '80C') return inv.taxType === 'eee' || inv.taxType === 'elss';
    if (sectionStr === '80CCD') return inv.taxType === 'nps';
  }
  if (inv.tax_section) return inv.tax_section.includes(sectionStr);
  return false;
}

export function getTaxSavingRecommendations(remaining80C, remaining80CCD, investments) {
  const recs = [];
  if (remaining80C > 0) {
    investments.filter(inv => matchesTaxSection(inv, '80C')).forEach(inv => {
      recs.push({
        ...inv, name: inv.name, id: inv.id,
        expected_return_min: inv.expected_return_min || (inv.rate ? inv.rate * 0.85 : 0),
        expected_return_max: inv.expected_return_max || inv.rate || 0,
        suggestedAmount: Math.min(remaining80C, 150000),
        section: '80C', maxDeduction: SECTION_80C_LIMIT,
      });
    });
  }
  if (remaining80CCD > 0) {
    investments.filter(inv => matchesTaxSection(inv, '80CCD')).forEach(inv => {
      recs.push({
        ...inv, name: inv.name, id: inv.id,
        expected_return_min: inv.expected_return_min || (inv.rate ? inv.rate * 0.85 : 0),
        expected_return_max: inv.expected_return_max || inv.rate || 0,
        suggestedAmount: remaining80CCD,
        section: '80CCD(1B)', maxDeduction: SECTION_80CCD_1B_LIMIT,
      });
    });
  }
  return recs;
}

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}
