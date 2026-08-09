/**
 * WealthGenie — Client-Side Tax Computation Utilities
 * ────────────────────────────────────────────────────
 * Extracted from recommendationEngine.js for maintainability.
 * Contains marginal rate computation, equity LTCG estimation,
 * and post-tax return calculation for all instrument tax types.
 *
 * ⚠️  WARNING (WG-038): getMarginalRate() does NOT implement Section 87A
 * rebate (₹0 tax for new-regime taxable income ≤ ₹12,00,000) or the
 * marginal relief zone above that threshold. It returns a non-zero slab
 * rate for incomes that actually owe zero tax under the new regime.
 *
 * DO NOT use this module's functions for any user-facing tax-drag number.
 * PostTaxAnalysis.jsx has been rewired (WG-038) to use the backend's
 * calculatePostTaxReturnSafe() via POST /api/tax/post-tax-return/batch,
 * which correctly implements rebate + marginal relief + surcharge + cess.
 *
 * These functions are retained ONLY because scoringEngine.js,
 * recommendationEngine.js, and goalFiltering.js depend on them for
 * synchronous real-time scoring that cannot trivially be async API calls.
 * See WG-039 (follow-up) for full elimination plan.
 */

// ─── MARGINAL RATE (New Regime default) ───────────────────────────
// Must apply standard deduction BEFORE slab lookup to match backend.
// FY2025-26: New regime ₹75K deduction, Old regime ₹50K deduction.
export function getMarginalRate(annualIncome, regime = 'new') {
  const standardDeduction = regime === 'new' ? 75000 : 50000;
  const taxableIncome = Math.max(0, annualIncome - standardDeduction);

  let rate = 0;
  if (regime === 'old') {
    if (taxableIncome > 1000000) rate = 0.30;
    else if (taxableIncome > 500000)  rate = 0.20;
    else if (taxableIncome > 250000)  rate = 0.05;
  } else {
    // New regime FY2025-26 slabs (on taxable income after ₹75K deduction)
    if (taxableIncome > 2400000) rate = 0.30;
    else if (taxableIncome > 2000000) rate = 0.25;
    else if (taxableIncome > 1600000) rate = 0.20;
    else if (taxableIncome > 1200000) rate = 0.15;
    else if (taxableIncome > 800000)  rate = 0.10;
    else if (taxableIncome > 400000)  rate = 0.05;
  }

  let surchargeRate = 0;
  if (taxableIncome > 5000000) {
    if (regime === 'new') {
      if (taxableIncome <= 10000000) surchargeRate = 0.10;
      else if (taxableIncome <= 20000000) surchargeRate = 0.15;
      else surchargeRate = 0.25;
    } else {
      if (taxableIncome <= 10000000) surchargeRate = 0.10;
      else if (taxableIncome <= 20000000) surchargeRate = 0.15;
      else if (taxableIncome <= 50000000) surchargeRate = 0.25;
      else surchargeRate = 0.37;
    }
  }

  return rate * (1 + surchargeRate) * 1.04;
}

export function estimateEquityLTCGTaxRate(nominalRate, monthlySIP, holdingYears) {
  const safeSIP = Number(monthlySIP) || 10000;
  const safeYears = Number(holdingYears) || 3;
  if (safeSIP <= 0 || safeYears <= 0 || nominalRate <= 0) return 0.125 * 1.04;

  const totalMonths = Math.round(safeYears * 12);
  const monthlyRate = Math.exp(nominalRate / 12) - 1;

  let totalGains = 0;
  for (let i = 0; i < totalMonths; i++) {
    const monthsRemaining = totalMonths - i;
    const trancheFV = safeSIP * Math.pow(1 + monthlyRate, monthsRemaining);
    const gain = Math.max(0, trancheFV - safeSIP);
    totalGains += gain;
  }

  if (totalGains <= 0) return 0;

  const EXEMPTION_LIMIT = 125000;
  const LTCG_RATE = 0.125;
  const CESS_MULTIPLIER = 1.04;

  const taxableGains = Math.max(0, totalGains - EXEMPTION_LIMIT);
  const totalTax = taxableGains * LTCG_RATE * CESS_MULTIPLIER;

  return totalGains > 0 ? totalTax / totalGains : LTCG_RATE * CESS_MULTIPLIER;
}

// ─── POST-TAX COMPUTATION (FIXED: post-tax NEVER exceeds nominal) ─
// Tax savings (80C, 80CCD) are reported separately and NEVER added
// to the postTaxRate. The taxEquivalentYield is provided separately
// for comparison purposes only — it must NEVER populate postTaxReturn.
export function computePostTaxReturn(inv, annualSavings, annualIncome, profile) {
  const mr = getMarginalRate(annualIncome, profile?.taxRegime || 'new');
  const rate = typeof inv === 'number' ? inv : inv.rate;
  const taxType = typeof inv === 'object' ? inv.taxType : 'slab';
  const invId = typeof inv === 'object' ? inv.id : null;
  const age = Number(profile?.age) || 30;

  switch (taxType) {
    case "eee": {
      // EEE instruments: NO tax at any stage. Post-tax = nominal EXACTLY.
      const taxSaving = Math.min(150000, annualSavings) * mr;
      return {
        postTaxRate: rate, // NEVER exceeds nominal
        taxSaving,
        taxPaid: 0,
        marginalRate: mr,
        // Tax-equivalent yield is for COMPARISON ONLY — never display as post-tax return
        taxEquivalentYield: mr > 0 ? parseFloat((rate / (1 - mr)).toFixed(2)) : rate,
      };
    }

    case "slab": {
      // Interest fully taxed at marginal slab rate
      const postTaxRate = rate * (1 - mr);

      if (invId === "fd") {
        const interest = annualSavings * rate / 100;
        const tdsThreshold = age >= 60 ? 50000 : 40000;
        const tdsApplies = interest > tdsThreshold;
        return {
          postTaxRate: parseFloat(postTaxRate.toFixed(2)),
          taxSaving: 0,
          taxPaid: Math.round(interest * mr),
          marginalRate: mr,
          tdsNote: tdsApplies
            ? `TDS at 10% applies on FD interest above ₹${tdsThreshold.toLocaleString("en-IN")}/yr. Claim it back when filing ITR if your total tax is lower.`
            : null,
        };
      }

      return {
        postTaxRate: parseFloat(postTaxRate.toFixed(2)),
        taxSaving: 0,
        taxPaid: Math.round(annualSavings * rate / 100 * mr),
        marginalRate: mr,
      };
    }

    case "ltcg": {
      // Equity LTCG: 12.5% on gains -> Upgraded to detailed FIFO tranche analysis
      const nominalRate = rate / 100;
      const monthlySIP = (annualSavings || 0) / 12;
      const holdingYears = Number(profile?.investment_horizon || profile?.investmentHorizon) || 15;
      
      const effectiveLtcgRate = estimateEquityLTCGTaxRate(nominalRate, monthlySIP, holdingYears);
      const postTaxRate = rate * (1 - effectiveLtcgRate);
      return {
        postTaxRate: parseFloat(postTaxRate.toFixed(2)),
        taxSaving: 0,
        taxPaid: Math.round(annualSavings * nominalRate * effectiveLtcgRate),
        marginalRate: mr,
      };
    }

    case "elss": {
      // ELSS: LTCG 12.5% on gains; 80C deduction reported separately -> Upgraded to FIFO tranche
      const nominalRate = rate / 100;
      const monthlySIP = (annualSavings || 0) / 12;
      const holdingYears = Number(profile?.investment_horizon || profile?.investmentHorizon) || 15;
      
      const effectiveLtcgRate = estimateEquityLTCGTaxRate(nominalRate, monthlySIP, holdingYears);
      const postTaxRate = rate * (1 - effectiveLtcgRate);
      const taxSaving = Math.min(150000, annualSavings) * mr;
      return {
        postTaxRate: parseFloat(postTaxRate.toFixed(2)),
        taxSaving,
        taxPaid: Math.round(annualSavings * nominalRate * effectiveLtcgRate),
        marginalRate: mr,
      };
    }

    case "nps": {
      // NPS: Partial EET — 40% annuity taxed at slab
      // 80CCD(1B) deduction is available ONLY under old regime
      const regime = profile?.taxRegime || 'new';
      const annuityFraction = 0.40;
      const blendedTaxDrag = annuityFraction * mr;
      const postTaxRate = rate * (1 - blendedTaxDrag);
      const ccd1bDeduction = regime === 'old' ? Math.min(50000, annualSavings) : 0;
      const taxSaving = ccd1bDeduction * mr;
      return {
        postTaxRate: parseFloat(postTaxRate.toFixed(2)),
        taxSaving: Math.round(taxSaving),
        taxPaid: 0,
        marginalRate: mr,
        npsNote: regime === 'old'
          ? `80CCD(1B) deduction of ₹${ccd1bDeduction.toLocaleString("en-IN")} saves ₹${Math.round(taxSaving).toLocaleString("en-IN")} annually. This is SEPARATE from your ₹1.5L 80C limit. 60% lump sum at age 60 is tax-free.`
          : `Under the new tax regime, 80CCD(1B) deduction is not available. However, 60% of your NPS corpus at age 60 is still tax-free. Consider old regime if you want the ₹50K extra deduction.`,
      };
    }

    case "sgb": {
      // SGB: 2.5% p.a. interest taxed at slab; capital gains exempt at maturity
      // IMPORTANT: rate is in percentage form (e.g., 13.0), so interest must also be in pct points
      const interestPctPts = 2.5;
      const taxOnInterest = interestPctPts * mr; // e.g., 2.5 * 0.30 = 0.75 pct pts
      const postTaxRate = rate - taxOnInterest;
      return {
        postTaxRate: parseFloat(Math.max(0, postTaxRate).toFixed(2)),
        taxSaving: 0,
        taxPaid: Math.round(annualSavings * (interestPctPts / 100) * mr),
        marginalRate: mr,
      };
    }

    default: {
      // Default: slab-taxed
      const postTaxRate = rate * (1 - mr);
      return {
        postTaxRate: parseFloat(Math.max(0, postTaxRate).toFixed(2)),
        taxSaving: 0,
        taxPaid: Math.round(annualSavings * rate / 100 * mr),
        marginalRate: mr,
      };
    }
  }
}
