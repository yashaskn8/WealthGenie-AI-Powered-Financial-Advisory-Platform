/**
 * WealthGenie Monte Carlo Simulation Engine
 * Runs N simulations with log-normally distributed returns (GBM)
 * to produce probabilistic wealth projections (percentile bands).
 */
import { INSTRUMENT_PARAMS as CENTRAL_PARAMS, RISK_FREE_RATE, toMonthlyRate } from './instrumentConstants.js';
const INSTRUMENT_PARAMS = {};
for (const [key, p] of Object.entries(CENTRAL_PARAMS)) {
    INSTRUMENT_PARAMS[key] = { mean: p.nominalRate / 100, stdDev: p.volatility };
}
/**
 * Halton low-discrepancy sequence generator.
 */
export function halton(index, base) {
    let result = 0;
    let f = 1 / base;
    let i = index;
    while (i > 0) {
        result += f * (i % base);
        i = Math.floor(i / base);
        f /= base;
    }
    return result;
}
/**
 * Box-Muller transform — generates a normally distributed random number.
 */
export function boxMuller(u1, u2) {
    if (u1 === undefined || u1 <= 0 || u1 >= 1) {
        u1 = Math.random() || 0.5;
    }
    if (u2 === undefined || u2 <= 0 || u2 >= 1) {
        u2 = Math.random() || 0.5;
    }
    u1 = Math.max(1e-15, Math.min(u1, 1 - 1e-15));
    u2 = Math.max(1e-15, Math.min(u2, 1 - 1e-15));
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}
/**
 * Compute percentile from a sorted array using linear interpolation.
 */
export function percentile(sortedArr, p) {
    if (sortedArr.length === 0)
        return 0;
    const idx = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper)
        return sortedArr[lower];
    return sortedArr[lower] + (sortedArr[upper] - sortedArr[lower]) * (idx - lower);
}
export function buildProjectionHorizon(years) {
    const numericYears = Number(years);
    const requestedYears = Number.isFinite(numericYears) && numericYears > 0 ? numericYears : 1;
    const totalMonths = Math.max(1, Math.round(requestedYears * 12));
    const checkpointMonths = [];
    for (let month = 12; month < totalMonths; month += 12) {
        checkpointMonths.push(month);
    }
    if (!checkpointMonths.includes(totalMonths)) {
        checkpointMonths.push(totalMonths);
    }
    return {
        years: totalMonths / 12,
        totalMonths,
        checkpointMonths,
        yearsArray: checkpointMonths.map(month => Number((month / 12).toFixed(2))),
    };
}
export function annuityDueFV(monthlyInvestment, monthlyRate, totalMonths) {
    if (!monthlyInvestment || monthlyInvestment <= 0 || totalMonths <= 0)
        return 0;
    if (Math.abs(monthlyRate) < 1e-12) {
        return monthlyInvestment * totalMonths;
    }
    return monthlyInvestment
        * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate)
        * (1 + monthlyRate);
}
/**
 * Helper to sample a single monthly log-normal multiplier (GBM).
 */
export function sampleLogNormalMonthly(annualMean, annualVol, zVal) {
    const dt = 1 / 12;
    const drift = (annualMean - 0.5 * annualVol * annualVol) * dt;
    const vol = annualVol * Math.sqrt(dt);
    return Math.exp(drift + vol * zVal);
}
/**
 * Compute Sequence of Returns Risk.
 */
export function computeSequenceRisk(finalValues, simulations, years, monthlyWithdrawal = 0) {
    if (!finalValues || finalValues.length === 0)
        return 0;
    if (monthlyWithdrawal > 0) {
        const bankruptCount = finalValues.filter(v => v <= 0).length;
        return parseFloat((bankruptCount / finalValues.length).toFixed(4));
    }
    const meanVal = finalValues.reduce((a, b) => a + b, 0) / finalValues.length;
    if (meanVal <= 0)
        return 0;
    const variance = finalValues.reduce((s, v) => s + Math.pow(v - meanVal, 2), 0) / finalValues.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / meanVal;
    return parseFloat(cv.toFixed(4));
}
/**
 * Compute implied annual volatility and Sharpe ratio proxy.
 */
export function computeRiskMetrics(p50Values, p10Values, years, riskFreeRate = 0.065, postTaxAnnualReturn = 0.08) {
    if (!p50Values || !p10Values || p50Values.length === 0 || p10Values.length === 0 || years <= 0) {
        return { impliedVol: 0, sharpeRatio: 0 };
    }
    const p50Last = p50Values[p50Values.length - 1];
    const p10Last = p10Values[p10Values.length - 1];
    let impliedVol = 0.05; // default fallback
    if (p50Last > 0 && p10Last > 0 && p50Last > p10Last) {
        impliedVol = Math.log(p50Last / p10Last) / (1.28155 * Math.sqrt(years));
    }
    const sharpeRatio = impliedVol > 0.0001 ? (postTaxAnnualReturn - riskFreeRate) / impliedVol : 0;
    return {
        impliedVol: parseFloat(impliedVol.toFixed(4)),
        sharpeRatio: parseFloat(sharpeRatio.toFixed(4)),
    };
}
/**
 * Run Monte Carlo simulation for SIP investment using GBM.
 */
export function runMonteCarlo({ monthlyInvestment, postTaxAnnualReturn, annualVolatility, years, simulations = 10000, inflationRate = 0.05, isRealTrack = false, currentSavings = 0, }) {
    const horizon = buildProjectionHorizon(years);
    years = horizon.years;
    const safeInvestment = Number.isFinite(Number(monthlyInvestment)) && Number(monthlyInvestment) > 0
        ? Number(monthlyInvestment)
        : 0;
    const safeSavings = Number.isFinite(Number(currentSavings)) && Number(currentSavings) > 0
        ? Number(currentSavings)
        : 0;
    // Input guards
    if (safeInvestment <= 0 && safeSavings <= 0) {
        return emptyResult(years, simulations);
    }
    if (!years || years <= 0 || !Number.isFinite(years)) {
        return emptyResult(1, simulations);
    }
    if (!Number.isFinite(postTaxAnnualReturn))
        postTaxAnnualReturn = 0.08;
    let safeVolatility = (!Number.isFinite(annualVolatility) || annualVolatility < 0) ? 0.05 : annualVolatility;
    // Cap simulations to prevent resource exhaustion (DoS vector)
    simulations = Math.min(Math.max(simulations, 100), 50000);
    // Warn on negative post-tax returns (possible during extreme market conditions)
    if (postTaxAnnualReturn < 0 && !isRealTrack) {
        console.warn(`[MC] Negative post-tax return: ${(postTaxAnnualReturn * 100).toFixed(2)}%. `
            + `Simulation will proceed but projections may show capital erosion.`);
    }
    // Clamp volatility to sane range: 0.1% to 60%
    if (safeVolatility > 0.60) {
        if (!isRealTrack) {
            console.warn(`[MC] Extreme volatility ${(safeVolatility * 100).toFixed(1)}% clamped to 60%.`);
        }
        safeVolatility = 0.60;
    }
    const { totalMonths, checkpointMonths, yearsArray } = horizon;
    const checkpointMonthToIndex = new Map(checkpointMonths.map((month, index) => [month, index]));
    // finalValues[year_index] = array of terminal values across all simulations
    const allSimResults = yearsArray.map(() => []);
    let finalValues = []; // terminal balances for goal probability
    const halfSims = Math.ceil(simulations / 2);
    const actualSims = halfSims * 2;
    // Deterministic SIP + lump sum FV for control variate (aligned with continuous GBM expected yield)
    const r = toMonthlyRate(postTaxAnnualReturn, true);
    const fvSIP = annuityDueFV(safeInvestment, r, totalMonths);
    const fvSavings = safeSavings * Math.pow(1 + r, totalMonths);
    const deterministicFV = fvSIP + fvSavings;
    for (let sim = 0; sim < halfSims; sim++) {
        const useQMC = sim < halfSims * 0.4;
        const zValues = new Array(totalMonths);
        for (let i = 0; i < totalMonths; i++) {
            if (useQMC) {
                const seqIdx = sim * totalMonths + i + 1;
                const base1 = (i % 2 === 0) ? 2 : 5;
                const base2 = (i % 2 === 0) ? 3 : 7;
                const u1 = halton(seqIdx, base1) || 0.5;
                const u2 = halton(seqIdx, base2) || 0.5;
                zValues[i] = boxMuller(u1, u2);
            }
            else {
                zValues[i] = boxMuller();
            }
        }
        // ── Path 1: use +Z ──────────────────────────────────────────────
        let balance1 = safeSavings;
        for (let monthIdx = 0; monthIdx < totalMonths; monthIdx++) {
            balance1 += safeInvestment;
            const z = zValues[monthIdx];
            balance1 *= sampleLogNormalMonthly(postTaxAnnualReturn, safeVolatility, z);
            const checkpointIdx = checkpointMonthToIndex.get(monthIdx + 1);
            if (checkpointIdx !== undefined) {
                allSimResults[checkpointIdx].push(balance1);
            }
        }
        finalValues.push(balance1);
        // ── Path 2: use -Z (antithetic mirror) ──────────────────────────
        let balance2 = safeSavings;
        for (let monthIdx = 0; monthIdx < totalMonths; monthIdx++) {
            balance2 += safeInvestment;
            const z = zValues[monthIdx];
            balance2 *= sampleLogNormalMonthly(postTaxAnnualReturn, safeVolatility, -z);
            const checkpointIdx = checkpointMonthToIndex.get(monthIdx + 1);
            if (checkpointIdx !== undefined) {
                allSimResults[checkpointIdx].push(balance2);
            }
        }
        finalValues.push(balance2);
    }
    // ── MULTIPLICATIVE CONTROL VARIATE CORRECTION ────────────────────────
    for (let y = 0; y < checkpointMonths.length; y++) {
        const totalMonths_y = checkpointMonths[y];
        const fvSIP_y = annuityDueFV(safeInvestment, r, totalMonths_y);
        const fvSavings_y = safeSavings * Math.pow(1 + r, totalMonths_y);
        const deterministicFV_y = fvSIP_y + fvSavings_y;
        const rawMean_y = allSimResults[y].reduce((s, v) => s + v, 0) / allSimResults[y].length;
        if (rawMean_y > 0) {
            const ratio = deterministicFV_y / rawMean_y;
            for (let s = 0; s < allSimResults[y].length; s++) {
                allSimResults[y][s] *= ratio;
            }
        }
    }
    // Update finalValues to contain the corrected terminal values for goal probability
    const terminalIdx = allSimResults.length - 1;
    finalValues = [...allSimResults[terminalIdx]];
    const rawMean = finalValues.reduce((s, v) => s + v, 0) / finalValues.length;
    const controlCorrection = rawMean - deterministicFV;
    // Sort each year's results ONCE, then extract all percentiles
    const p10 = [], p25 = [], p50 = [], p75 = [], p90 = [], mean = [];
    const stdErr = [];
    for (let y = 0; y < allSimResults.length; y++) {
        const sorted = [...allSimResults[y]].sort((a, b) => a - b);
        const yrNom = Math.round(percentile(sorted, 10));
        const yrP25 = Math.round(percentile(sorted, 25));
        const yrP50 = Math.round(percentile(sorted, 50));
        const yrP75 = Math.round(percentile(sorted, 75));
        const yrP90 = Math.round(percentile(sorted, 90));
        const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        const yrMean = Math.round(avg);
        p10.push(yrNom);
        p25.push(yrP25);
        p50.push(yrP50);
        p75.push(yrP75);
        p90.push(yrP90);
        mean.push(yrMean);
        const variance = sorted.reduce((s, v) => s + (v - avg) ** 2, 0) / (sorted.length - 1);
        stdErr.push(Math.round(Math.sqrt(variance / sorted.length)));
    }
    let realTrackResult = null;
    if (!isRealTrack) {
        const realReturn = (1 + postTaxAnnualReturn) / (1 + inflationRate) - 1;
        realTrackResult = runMonteCarlo({
            monthlyInvestment: safeInvestment,
            postTaxAnnualReturn: realReturn,
            annualVolatility: safeVolatility,
            years,
            simulations,
            inflationRate,
            isRealTrack: true,
            currentSavings: safeSavings,
        });
    }
    const p10_real = !isRealTrack && realTrackResult ? realTrackResult.p10 : [];
    const p25_real = !isRealTrack && realTrackResult ? realTrackResult.p25 : [];
    const p50_real = !isRealTrack && realTrackResult ? realTrackResult.p50 : [];
    const p75_real = !isRealTrack && realTrackResult ? realTrackResult.p75 : [];
    const p90_real = !isRealTrack && realTrackResult ? realTrackResult.p90 : [];
    const mean_real = !isRealTrack && realTrackResult ? realTrackResult.mean : [];
    const sequenceOfReturnsRisk = computeSequenceRisk(finalValues, actualSims, years, 0);
    const baseSharpe = safeVolatility > 0.001 ? (postTaxAnnualReturn - RISK_FREE_RATE) / safeVolatility : 0;
    const sharpeSensitivity = {
        minus_5pct: (safeVolatility - 0.05) > 0.001 ? (postTaxAnnualReturn - RISK_FREE_RATE) / (safeVolatility - 0.05) : 0,
        minus_2pct: (safeVolatility - 0.02) > 0.001 ? (postTaxAnnualReturn - RISK_FREE_RATE) / (safeVolatility - 0.02) : 0,
        base: baseSharpe,
        plus_2pct: (postTaxAnnualReturn - RISK_FREE_RATE) / (safeVolatility + 0.02),
        plus_5pct: (postTaxAnnualReturn - RISK_FREE_RATE) / (safeVolatility + 0.05),
    };
    const response = {
        years_array: yearsArray,
        p10, p25, p50, p75, p90, mean,
        p10_real, p25_real, p50_real, p75_real, p90_real, mean_real,
        standard_error: stdErr,
        deterministic_fv: Math.round(deterministicFV),
        control_correction: Math.round(controlCorrection),
        finalValues, // expose for goal probability reuse
        simulations_run: actualSims,
    };
    if (!isRealTrack) {
        response.real = realTrackResult;
        response.inflationRateUsed = inflationRate;
        response.sequenceRisk = sequenceOfReturnsRisk;
        response.riskMetrics = computeRiskMetrics(p50, p10, years, RISK_FREE_RATE, postTaxAnnualReturn);
        response.variance_reduction = 'halton_qmc+antithetic+control_variates';
        response.sequence_of_returns_risk = sequenceOfReturnsRisk;
        response.sharpe_ratio_sensitivity = sharpeSensitivity;
        response.inflation_rate = inflationRate;
    }
    return response;
}
/**
 * Generate an empty result set (for invalid inputs).
 */
export function emptyResult(years, simulations) {
    const horizon = buildProjectionHorizon(years);
    const zeros = Array.from({ length: horizon.yearsArray.length }, () => 0);
    return {
        years_array: horizon.yearsArray,
        p10: [...zeros], p25: [...zeros], p50: [...zeros],
        p75: [...zeros], p90: [...zeros], mean: [...zeros],
        finalValues: [],
        simulations_run: simulations || 0,
    };
}
/**
 * Compute the probability that a goal amount is reached.
 */
export function computeGoalProbability(terminalValues, targetAmount) {
    if (!terminalValues || terminalValues.length === 0 || !targetAmount || targetAmount <= 0)
        return 0;
    const successes = terminalValues.filter(v => v >= targetAmount).length;
    return parseFloat((successes / terminalValues.length).toFixed(4));
}
/**
 * Compute the Wilson score confidence interval for a binomial proportion.
 */
export function computeWilsonCI(p, n) {
    if (n <= 0 || p === null)
        return { lower: 0, upper: 0 };
    const z = 1.95996; // 95% confidence level
    const pVal = Math.min(Math.max(p, 0), 1);
    const factor = (z * z) / n;
    const term1 = pVal + factor / 2;
    const term2 = z * Math.sqrt((pVal * (1 - pVal) + factor / 4) / n);
    const denom = 1 + factor;
    const lower = (term1 - term2) / denom;
    const upper = (term1 + term2) / denom;
    return {
        lower: parseFloat(Math.max(0, lower).toFixed(4)),
        upper: parseFloat(Math.min(1, upper).toFixed(4)),
    };
}
/**
 * Run a full Monte Carlo simulation and also compute goal probability.
 */
export function runMonteCarloWithGoal(params) {
    const { targetAmount, ...mcParams } = params;
    const result = runMonteCarlo(mcParams);
    // Reuse terminal values from the primary simulation run
    const goalProbability = targetAmount && result.finalValues
        ? computeGoalProbability(result.finalValues, targetAmount)
        : null;
    const goalProbabilityCI = goalProbability !== null
        ? computeWilsonCI(goalProbability, result.simulations_run)
        : null;
    // Remove raw finalValues from response
    const { finalValues, ...cleanResult } = result;
    if (cleanResult.real) {
        delete cleanResult.real.finalValues;
    }
    return {
        ...cleanResult,
        goal_probability: goalProbability,
        goal_probability_ci: goalProbabilityCI,
        target_amount: targetAmount || null,
    };
}
/**
 * Get default volatility parameters for an instrument type.
 */
export function getInstrumentVolatility(instrumentType, overrideMean) {
    const params = INSTRUMENT_PARAMS[instrumentType];
    if (!params) {
        console.warn(`[MC] Unknown instrument type: '${instrumentType}'. Using default params {mean: 0.08, stdDev: 0.05}.`);
    }
    const defaults = params || { mean: 0.08, stdDev: 0.05 };
    return {
        mean: overrideMean !== undefined ? overrideMean : defaults.mean,
        stdDev: defaults.stdDev,
    };
}
/**
 * Reverse SIP formula — compute monthly SIP required to reach a target.
 */
export function reverseSIP(targetAmount, annualRate, years, currentSavings = 0) {
    if (!Number.isFinite(targetAmount) || targetAmount <= 0)
        return 0;
    if (!Number.isFinite(years) || years <= 0)
        return 0;
    if (!Number.isFinite(annualRate) || annualRate < 0)
        annualRate = 0;
    if (!Number.isFinite(currentSavings) || currentSavings < 0)
        currentSavings = 0;
    const r = toMonthlyRate(annualRate, true);
    const n = years * 12;
    const fvCurrent = currentSavings > 0
        ? currentSavings * Math.pow(1 + r, n)
        : 0;
    const remaining = Math.max(0, targetAmount - fvCurrent);
    if (remaining === 0)
        return 0;
    if (r === 0)
        return remaining / n;
    return remaining * r / ((Math.pow(1 + r, n) - 1) * (1 + r));
}
