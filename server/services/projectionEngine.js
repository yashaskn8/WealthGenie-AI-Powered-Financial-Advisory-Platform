import { toMonthlyRate } from './instrumentConstants.js';

/**
 * WealthGenie Projection Engine
 * Generates wealth projections using Lump Sum (compound interest) and SIP formulas.
 * Output is structured for direct consumption by Recharts multi-line charts.
 *
 * Mathematical basis:
 *   SIP FV (annuity-due) = P × [((1+r)^n - 1) / r] × (1+r)
 *   Lump Sum FV = PV × (1+r_annual)^years
 * Where r_m = annualRate / 12 (simple monthly rate), n = years × 12.
 *
 * Compounding conventions (aligned with frontend sipCalculator.ts):
 *   - SIPs: discrete monthly compounding with r_m = annualRate / 12
 *   - Lump sums: discrete annual compounding
 */

/**
 * Lump Sum (Compound Interest) Future Value — Annual Compounding.
 * FV = P × (1 + r_annual)^years
 *
 * Uses annual compounding to align with the frontend calculator
 * (sipCalculator.ts calculateLumpSumFutureValue) and Indian retail
 * convention for lump-sum investment projections.
 *
 * @param {number} principal - One-time investment amount (₹)
 * @param {number} annualRate - Post-tax annual return rate (decimal, e.g. 0.07)
 * @param {number} years - Number of years
 * @returns {number} Future value (non-negative)
 */
export function lumpSumFV(principal, annualRate, years) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  if (!Number.isFinite(years) || years <= 0) return 0;
  if (!Number.isFinite(annualRate)) return 0;
  // Clamp rate to prevent absurd values (max 50% p.a.)
  const safeRate = Math.max(-0.5, Math.min(annualRate, 0.50));
  return Math.max(0, principal * Math.pow(1 + safeRate, years));
}

/**
 * SIP (Systematic Investment Plan) Future Value — Annuity Due.
 * FV = P × [((1 + r)^n - 1) / r] × (1 + r)
 *
 * Investment made at the START of each month (annuity-due),
 * so the first SIP earns a full month of returns.
 *
 * @param {number} monthlyInvestment - Monthly SIP amount (₹)
 * @param {number} annualRate - Post-tax annual return rate (decimal, e.g. 0.07)
 * @param {number} years - Number of years
 * @returns {number} Future value (non-negative)
 */
export function sipFV(monthlyInvestment, annualRate, years) {
  if (!Number.isFinite(monthlyInvestment) || monthlyInvestment <= 0) return 0;
  if (!Number.isFinite(years) || years <= 0) return 0;
  if (!Number.isFinite(annualRate)) return 0;

  // Clamp rate to prevent absurd values
  const safeRate = Math.max(-0.5, Math.min(annualRate, 0.50));
  const r = toMonthlyRate(safeRate);
  const n = years * 12;

  // Edge case: zero rate → simple sum
  if (Math.abs(r) < 1e-10) return monthlyInvestment * n;

  return Math.max(0, monthlyInvestment * ((Math.pow(1 + r, n) - 1) / r) * (1 + r));
}

/**
 * Step-Up SIP (Systematic Investment Plan) Future Value.
 * Models annual increase in monthly SIP amount.
 *
 * @param {number} monthlyInvestment - Initial monthly SIP amount (₹)
 * @param {number} annualRate - Post-tax annual return rate (decimal)
 * @param {number} years - Number of years
 * @param {number} annualStepUpRate - Annual step-up percentage (decimal, e.g. 0.10 for 10%)
 * @returns {number} Future value (non-negative)
 */
export function stepUpSipFV(monthlyInvestment, annualRate, years, annualStepUpRate = 0.10) {
  if (!Number.isFinite(monthlyInvestment) || monthlyInvestment <= 0) return 0;
  if (!Number.isFinite(years) || years <= 0) return 0;
  if (!Number.isFinite(annualRate)) return 0;
  if (!Number.isFinite(annualStepUpRate) || annualStepUpRate < 0) annualStepUpRate = 0;

  const r = toMonthlyRate(annualRate);
  const g = annualStepUpRate;

  let balance = 0;
  let currentSIP = monthlyInvestment;

  for (let y = 1; y <= years; y++) {
    // Compound existing balance for 12 months
    const compoundedBalance = balance * Math.pow(1 + r, 12);

    // Contribution from this year's SIP (annuity-due)
    let yearSipFV = 0;
    if (Math.abs(r) < 1e-10) {
      yearSipFV = currentSIP * 12;
    } else {
      yearSipFV = currentSIP * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r);
    }

    balance = compoundedBalance + yearSipFV;

    // Step up SIP for next year
    currentSIP *= (1 + g);
  }

  return Math.max(0, balance);
}

/**
 * Reverse SIP — compute the monthly SIP required to accumulate a target FV.
 * P = FV / [((1 + r)^n - 1) / r × (1 + r)]
 *
 * @param {number} targetFV - Target future value (₹)
 * @param {number} annualRate - Post-tax annual return rate (decimal)
 * @param {number} years - Time horizon
 * @returns {number} Required monthly SIP (₹)
 */
export function reverseSIPFromFV(targetFV, annualRate, years) {
  if (!Number.isFinite(targetFV) || targetFV <= 0) return 0;
  if (!Number.isFinite(years) || years <= 0) return 0;
  if (!Number.isFinite(annualRate)) return 0;

  const r = toMonthlyRate(annualRate);
  const n = years * 12;

  if (Math.abs(r) < 1e-10) return targetFV / n;
  return targetFV * r / ((Math.pow(1 + r, n) - 1) * (1 + r));
}

/**
 * Compute CAGR (Compound Annual Growth Rate) from initial and final values.
 * CAGR = (FV/PV)^(1/n) - 1
 *
 * Uses the standard discrete CAGR formula used in industry reports,
 * replacing the previous continuously compounded (log-return) formula.
 *
 * @param {number} initialValue - Starting value
 * @param {number} finalValue - Ending value
 * @param {number} years - Number of years
 * @returns {number} CAGR as decimal (e.g. 0.12 for 12%)
 */
export function computeCAGR(initialValue, finalValue, years) {
  if (!Number.isFinite(initialValue) || initialValue <= 0) return 0;
  if (!Number.isFinite(finalValue) || finalValue <= 0) return 0;
  if (!Number.isFinite(years) || years <= 0) return 0;
  return Math.pow(finalValue / initialValue, 1 / years) - 1;
}

/**
 * Compute inflation-adjusted (real) return.
 * real_rate = ((1 + nominal) / (1 + inflation)) - 1
 *
 * @param {number} nominalRate - Nominal annual return (decimal)
 * @param {number} inflationRate - Annual inflation rate (decimal, default 5%)
 * @returns {number} Real return as decimal
 */
export function realReturn(nominalRate, inflationRate = 0.05) {
  if (!Number.isFinite(nominalRate)) return 0;
  if (!Number.isFinite(inflationRate) || inflationRate <= -1) return nominalRate;
  return ((1 + nominalRate) / (1 + inflationRate)) - 1;
}

/**
 * Generate multi-instrument projections for Recharts consumption.
 *
 * @param {number} monthlyInvestment - Monthly SIP amount per instrument (₹)
 * @param {Array<{name: string, type: string}>} instruments - Array of instrument objects
 * @param {Object} postTaxRates - Map of instrument name → post-tax annual rate (decimal)
 * @param {number[]} years - Projection years (default: [5, 10, 15, 20])
 * @returns {{ labels, series, totalInvested, chartData }}
 */
export function generateProjections(
  monthlyInvestment,
  instruments,
  postTaxRates,
  years = [5, 10, 15, 20],
  inflationRate = 0.05,
  annualStepUpRate = 0.10,
  initialLumpSum = 0
) {
  // Input guards
  if (!Number.isFinite(monthlyInvestment) || monthlyInvestment <= 0) {
    return { labels: years, series: [], totalInvested: {}, chartData: [] };
  }
  if (!instruments || instruments.length === 0) {
    return { labels: years, series: [], totalInvested: {}, chartData: [] };
  }
  if (!Number.isFinite(inflationRate) || inflationRate < 0) inflationRate = 0.05;
  if (!Number.isFinite(annualStepUpRate) || annualStepUpRate < 0) annualStepUpRate = 0.10;
  const safeLumpSum = Math.max(0, Number(initialLumpSum) || 0);

  const labels = [...years].filter(y => Number.isFinite(y) && y > 0);

  // Total invested at each year mark (nominal, flat SIP + initial lump sum)
  const totalInvested = {};
  labels.forEach(y => {
    totalInvested[y] = (monthlyInvestment * 12 * y) + safeLumpSum;
  });

  // Total invested at each year mark (nominal, step-up SIP + initial lump sum)
  const totalInvestedStepUp = {};
  labels.forEach(y => {
    let sumInvested = safeLumpSum;
    let currentSIP = monthlyInvestment;
    for (let yr = 1; yr <= y; yr++) {
      sumInvested += currentSIP * 12;
      currentSIP *= (1 + annualStepUpRate);
    }
    totalInvestedStepUp[y] = Math.round(sumInvested);
  });

  // Build series for each instrument
  const series = instruments.map(inst => {
    let rate = postTaxRates[inst.name] || postTaxRates[inst.type] || 0;

    // Guard: NaN or Infinity rates default to 0
    if (!Number.isFinite(rate)) {
      console.warn(`[Projection] Non-finite rate for ${inst.name}: ${rate}, defaulting to 0`);
      rate = 0;
    }

    // CRITICAL: postTaxRates values come from effectiveYield which is in PERCENTAGE (e.g. 6.5 for 6.5%).
    // sipFV expects a DECIMAL rate (e.g. 0.065). Convert here.
    const decimalRate = rate > 1 ? rate / 100 : rate;

    if (decimalRate === 0) {
      console.warn(`[Projection] Zero effective rate for ${inst.name}. Chart will show flat-line (no growth).`);
    }

    // Nominal projections (flat SIP + initial lump sum)
    const data = labels.map(y => Math.round(sipFV(monthlyInvestment, decimalRate, y) + lumpSumFV(safeLumpSum, decimalRate, y)));

    // Inflation-adjusted (real) projections (flat SIP + initial lump sum)
    const realRate = ((1 + decimalRate) / (1 + inflationRate)) - 1;
    const realData = labels.map(y => Math.round(sipFV(monthlyInvestment, realRate, y) + lumpSumFV(safeLumpSum, realRate, y)));

    // Step-up projections (nominal & real + initial lump sum)
    const stepUpData = labels.map(y => Math.round(stepUpSipFV(monthlyInvestment, decimalRate, y, annualStepUpRate) + lumpSumFV(safeLumpSum, decimalRate, y)));
    const stepUpRealRate = ((1 + decimalRate) / (1 + inflationRate)) - 1;
    const stepUpRealData = labels.map(y => Math.round(stepUpSipFV(monthlyInvestment, stepUpRealRate, y, annualStepUpRate) + lumpSumFV(safeLumpSum, stepUpRealRate, y)));

    // Wealth multiplier: how many times your invested amount grows
    const finalNominal = data[data.length - 1] || 0;
    const finalInvested = totalInvested[labels[labels.length - 1]] || 1;
    const wealthMultiplier = parseFloat((finalNominal / finalInvested).toFixed(2));

    const finalStepUpNominal = stepUpData[stepUpData.length - 1] || 0;
    const finalStepUpInvested = totalInvestedStepUp[labels[labels.length - 1]] || 1;
    const stepUpWealthMultiplier = parseFloat((finalStepUpNominal / finalStepUpInvested).toFixed(2));

    return {
      name: inst.name,
      type: inst.type || 'Unknown',
      postTaxRate: parseFloat((decimalRate * 100).toFixed(2)),
      realRate: parseFloat((realRate * 100).toFixed(2)),
      data,
      realData,
      stepUpData,
      stepUpRealData,
      wealthMultiplier,
      stepUpWealthMultiplier,
    };
  });

  // Recharts-friendly dataset (array of objects per year)
  const chartData = labels.map((year, idx) => {
    const point = {
      year,
      invested: totalInvested[year],
      invested_stepUp: totalInvestedStepUp[year]
    };
    series.forEach(s => {
      point[s.name] = s.data[idx];
      point[`${s.name}_real`] = s.realData[idx];
      point[`${s.name}_stepUp`] = s.stepUpData[idx];
      point[`${s.name}_stepUp_real`] = s.stepUpRealData[idx];
    });
    return point;
  });

  return {
    labels,
    series,
    totalInvested,
    totalInvestedStepUp,
    chartData,
    inflationRate,
    annualStepUpRate,
  };
}

/**
 * Format large INR values in Lakhs/Crores for chart display.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatINR(value) {
  if (!Number.isFinite(value)) return '₹0';
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const sign = isNegative ? '-' : '';

  if (absValue >= 10000000) {
    return `${sign}₹${(absValue / 10000000).toFixed(2)} Cr`;
  }
  if (absValue >= 100000) {
    return `${sign}₹${(absValue / 100000).toFixed(2)} L`;
  }
  return `${sign}₹${Math.round(absValue).toLocaleString('en-IN')}`;
}
