/**
 * WealthGenie — Client-Side Tax Computation Utilities
 * ────────────────────────────────────────────────────
 * Extracted from recommendationEngine.js for maintainability.
 * Contains marginal rate computation, equity LTCG estimation,
 * and post-tax return calculation for all instrument tax types.
 *
 * ℹ️ WG-043: getMarginalRate() is a client-side port of
 * server/services/taxEngine.js's getEffectiveMarginalRate(). It is kept in
 * sync manually so that synchronous client-side UI features (AllocationPlanner,
 * RecommendationDashboard, UserContext, App) produce identical tax drag results
 * to the backend without asynchronous API round-trips.
 *
 * ⚠️ MAINTENANCE RISK: Any future changes to server/services/taxEngine.js's
 * tax computation logic (e.g. Union Budget slab/rebate updates) MUST be
 * manually mirrored here as well to avoid client/backend calculation drift.
 */

function calculateTaxFromSlabs(taxableIncome, slabs) {
  let tax = 0;
  for (const slab of slabs) {
    if (taxableIncome <= slab.min) break;
    const taxableInSlab = Math.min(taxableIncome, slab.max) - slab.min;
    tax += taxableInSlab * slab.rate;
  }
  return tax;
}

function computeTaxLiability(annualIncome, regime = 'new') {
  let safeIncome = annualIncome;
  if (!Number.isFinite(safeIncome) || safeIncome < 0) safeIncome = 0;
  const safeRegime = regime === 'old' ? 'old' : 'new';
  const standardDeduction = safeRegime === 'new' ? 75000 : 50000;
  const taxableIncome = Math.max(0, safeIncome - standardDeduction);

  const slabs = safeRegime === 'new' ? [
    { min: 0, max: 400000, rate: 0 },
    { min: 400000, max: 800000, rate: 0.05 },
    { min: 800000, max: 1200000, rate: 0.10 },
    { min: 1200000, max: 1600000, rate: 0.15 },
    { min: 1600000, max: 2000000, rate: 0.20 },
    { min: 2000000, max: 2400000, rate: 0.25 },
    { min: 2400000, max: Infinity, rate: 0.30 },
  ] : [
    { min: 0, max: 250000, rate: 0 },
    { min: 250000, max: 500000, rate: 0.05 },
    { min: 500000, max: 1000000, rate: 0.20 },
    { min: 1000000, max: Infinity, rate: 0.30 },
  ];

  let taxBeforeCess = calculateTaxFromSlabs(taxableIncome, slabs);
  const rebateLimit = safeRegime === 'new' ? 1200000 : 500000;

  if (taxableIncome <= rebateLimit) {
    taxBeforeCess = 0;
  } else {
    // Marginal relief for Section 87A: tax cannot exceed excess over rebate limit
    const excessOverLimit = taxableIncome - rebateLimit;
    if (taxBeforeCess > excessOverLimit) {
      taxBeforeCess = excessOverLimit;
    }
  }

  // Surcharge
  let surchargeRate = 0;
  if (taxableIncome > 5000000) {
    if (safeRegime === 'new') {
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
  const surcharge = taxBeforeCess * surchargeRate;

  // Surcharge marginal relief
  let relief = 0;
  if (taxableIncome > 5000000) {
    const SURCHARGE_THRESHOLDS = safeRegime === 'new'
      ? [5000000, 10000000, 20000000]
      : [5000000, 10000000, 20000000, 50000000];
    let threshold = 5000000;
    for (const t of SURCHARGE_THRESHOLDS) {
      if (taxableIncome > t) threshold = t;
    }
    const baseTaxAtThreshold = calculateTaxFromSlabs(threshold, slabs);
    let thresholdSurchargeRate = 0;
    if (threshold === 10000000) thresholdSurchargeRate = 0.10;
    else if (threshold === 20000000) thresholdSurchargeRate = 0.15;
    else if (threshold === 50000000 && safeRegime === 'old') thresholdSurchargeRate = 0.25;

    const taxAtThreshold = baseTaxAtThreshold * (1 + thresholdSurchargeRate);
    const totalActual = taxBeforeCess + surcharge;
    const incomeGain = taxableIncome - threshold;
    const maxAllowedTax = taxAtThreshold + incomeGain;
    relief = totalActual > maxAllowedTax ? totalActual - maxAllowedTax : 0;
    relief = Math.round(relief);
  }

  const taxAfterSurcharge = taxBeforeCess + surcharge - relief;
  const cess = taxAfterSurcharge * 0.04;
  return Math.round(taxAfterSurcharge + cess);
}

// ─── MARGINAL RATE (Client-Side Port of taxEngine.js getEffectiveMarginalRate) ───
export function getMarginalRate(annualIncome, regime = 'new') {
  const actualTax = computeTaxLiability(annualIncome, regime);
  if (actualTax === 0) return 0;

  const delta = 10000;
  const highIncome = annualIncome + delta;
  const lowIncome = Math.max(0, annualIncome - delta);
  const highTax = computeTaxLiability(highIncome, regime);
  const lowTax = computeTaxLiability(lowIncome, regime);
  const deltaIncome = highIncome - lowIncome;
  if (deltaIncome <= 0) return 0;
  const deltaTax = highTax - lowTax;
  const effectiveMarginal = deltaTax / deltaIncome;
  return parseFloat(Math.max(0, Math.min(effectiveMarginal, 0.45)).toFixed(4));
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
