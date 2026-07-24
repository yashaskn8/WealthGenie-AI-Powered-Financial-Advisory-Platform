/**
 * WealthGenie XIRR Calculator — Newton-Raphson Implementation
 */
/**
 * Compute NPV (Net Present Value) for a given rate.
 */
function npv(rate, cashflows) {
    const d0 = cashflows[0].date.getTime();
    let total = 0;
    for (let i = 0; i < cashflows.length; i++) {
        const daysDiff = (cashflows[i].date.getTime() - d0) / 86400000; // ms → days
        const exponent = daysDiff / 365.25;
        total += cashflows[i].amount / Math.pow(1 + rate, exponent);
    }
    return total;
}
/**
 * Compute derivative of NPV with respect to rate (for Newton-Raphson).
 */
function npvDerivative(rate, cashflows) {
    const d0 = cashflows[0].date.getTime();
    let total = 0;
    for (let i = 0; i < cashflows.length; i++) {
        const daysDiff = (cashflows[i].date.getTime() - d0) / 86400000;
        const exponent = daysDiff / 365.25;
        total -= exponent * cashflows[i].amount / Math.pow(1 + rate, exponent + 1);
    }
    return total;
}
/**
 * Brent's method solver as fallback for robust root finding.
 */
function brentSolve(low, high, cashflows, tolerance = 1e-10, maxIter = 100) {
    let a = low;
    let b = high;
    let fa = npv(a, cashflows);
    let fb = npv(b, cashflows);
    if (fa === 0) {
        return { rate: a, converged: true, iterations: 0 };
    }
    if (fb === 0) {
        return { rate: b, converged: true, iterations: 0 };
    }
    if (fa * fb > 0) {
        return null;
    }
    let c = a;
    let fc = fa;
    let d = b - a;
    let e = d;
    for (let iter = 0; iter < maxIter; iter++) {
        if (fb === 0 || Math.abs(b - a) < tolerance) {
            return { rate: b, converged: true, iterations: iter };
        }
        if (fa * fb > 0) {
            a = c;
            fa = fc;
            d = b - a;
            e = d;
        }
        if (Math.abs(fa) < Math.abs(fb)) {
            c = b;
            b = a;
            a = c;
            fc = fb;
            fb = fa;
            fa = fc;
        }
        const tol = 2 * 2.220446049250313e-16 * Math.abs(b) + tolerance / 2;
        const m = (a - b) / 2;
        if (Math.abs(m) <= tol || fb === 0) {
            return { rate: b, converged: true, iterations: iter };
        }
        if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
            const s = fb / fa;
            let p, q;
            if (a === c) {
                p = 2 * m * s;
                q = 1 - s;
            }
            else {
                const r = fa / fc;
                const t = fb / fc;
                p = s * (2 * m * r * (r - t) - (b - a) * (t - 1));
                q = (r - 1) * (t - 1) * (s - 1);
            }
            if (p > 0) {
                q = -q;
            }
            else {
                p = -p;
            }
            if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
                e = d;
                d = p / q;
            }
            else {
                d = m;
                e = d;
            }
        }
        else {
            d = m;
            e = d;
        }
        c = b;
        fc = fb;
        if (Math.abs(d) > tol) {
            b += d;
        }
        else {
            b += m > 0 ? tol : -tol;
        }
        fb = npv(b, cashflows);
    }
    return { rate: b, converged: false, iterations: maxIter };
}
/**
 * Compute XIRR using Newton-Raphson iteration.
 */
export function computeXIRR(cashflows, guess = 0.1, tolerance = 1e-10, maxIterations = 100) {
    if (!Array.isArray(cashflows) || cashflows.length < 2) {
        return { rate: 0, converged: false, iterations: 0, npvResidual: NaN, error: 'Need at least 2 cashflows', annualizedReturn: '0.00%' };
    }
    let safeGuess = Number.isFinite(Number(guess)) ? Number(guess) : 0.1;
    safeGuess = Math.max(-0.99, Math.min(safeGuess, 50.0));
    // Normalize dates to UTC midnight and aggregate cashflows on the same date
    const dateGroups = new Map();
    for (const cf of cashflows) {
        const d = cf.date instanceof Date ? cf.date : new Date(cf.date);
        if (!Number.isFinite(d.getTime())) {
            return {
                rate: 0,
                converged: false,
                iterations: 0,
                npvResidual: NaN,
                error: `Invalid cashflow date: ${cf.date}`,
                annualizedReturn: '0.00%',
            };
        }
        const utcTime = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const amount = Number(cf.amount);
        if (Number.isFinite(amount) && Number.isFinite(utcTime)) {
            dateGroups.set(utcTime, (dateGroups.get(utcTime) || 0) + amount);
        }
    }
    const normalized = Array.from(dateGroups.entries()).map(([time, amount]) => ({
        amount,
        date: new Date(time),
    }));
    // Validate: at least one positive and one negative cashflow
    const hasPositive = normalized.some(cf => cf.amount > 0);
    const hasNegative = normalized.some(cf => cf.amount < 0);
    if (!hasPositive || !hasNegative) {
        return { rate: 0, converged: false, iterations: 0, npvResidual: NaN, error: 'Need both positive and negative cashflows', annualizedReturn: '0.00%' };
    }
    // Sort by date (ascending)
    normalized.sort((a, b) => a.date.getTime() - b.date.getTime());
    // Search bounds for bracket finding
    let lowRate = -0.99;
    let highRate = 50.0;
    let foundBracket = false;
    const gridSteps = 400;
    const gridMin = -0.99;
    const gridMax = 50.0;
    const gridRange = gridMax - gridMin;
    let prevR = gridMin;
    let prevV = npv(prevR, normalized);
    for (let step = 1; step <= gridSteps; step++) {
        const r = gridMin + (gridRange / gridSteps) * step;
        const v = npv(r, normalized);
        if (prevV * v < 0) {
            lowRate = prevR;
            highRate = r;
            foundBracket = true;
            break;
        }
        prevR = r;
        prevV = v;
    }
    const cashflowScale = normalized.reduce((sum, cf) => sum + Math.abs(cf.amount), 0);
    const npvTolerance = Math.max(cashflowScale * 1e-9, 1e-12);
    let rate = safeGuess;
    let iterations = 0;
    let converged = false;
    let methodUsed = 'Bisection';
    let newtonIterations = 0;
    let brentIterations = 0;

    // PHASE 1: If we have a bracket, use bisection to narrow it to a tight interval first
    if (foundBracket) {
        let lo = lowRate, hi = highRate;
        for (let i = 0; i < 100; i++) {
            iterations++;
            const mid = (lo + hi) / 2;
            const valMid = npv(mid, normalized);
            if (Math.abs(valMid) < npvTolerance || (hi - lo) < tolerance) {
                rate = mid;
                converged = true;
                methodUsed = 'Bisection';
                break;
            }
            if (npv(lo, normalized) * valMid < 0) {
                hi = mid;
            }
            else {
                lo = mid;
            }
        }
        if (!converged) {
            rate = (lo + hi) / 2;
            lowRate = lo;
            highRate = hi;
        }
    }

    // PHASE 2: Polish with Newton-Raphson (if not already converged)
    if (!converged) {
        for (let i = 0; i < maxIterations; i++) {
            iterations++;
            newtonIterations++;
            const val = npv(rate, normalized);
            if (Math.abs(val) < npvTolerance) {
                converged = true;
                methodUsed = 'Newton';
                break;
            }
            const deriv = npvDerivative(rate, normalized);
            let nextRate;
            if (Math.abs(deriv) > 1e-12) {
                nextRate = rate - val / deriv;
            }
            else {
                nextRate = foundBracket ? (lowRate + highRate) / 2 : rate + 0.05;
            }
            nextRate = Math.max(-0.99, Math.min(nextRate, 50.0));
            if (foundBracket && (nextRate <= lowRate || nextRate >= highRate)) {
                nextRate = (lowRate + highRate) / 2;
            }
            if (foundBracket) {
                const valNext = npv(nextRate, normalized);
                const valLow = npv(lowRate, normalized);
                if (valNext * valLow < 0) {
                    highRate = nextRate;
                }
                else {
                    lowRate = nextRate;
                }
            }
            if (Math.abs(nextRate - rate) < tolerance && Math.abs(npv(nextRate, normalized)) < npvTolerance) {
                rate = nextRate;
                converged = true;
                methodUsed = 'Newton';
                break;
            }
            rate = nextRate;
        }
    }

    // PHASE 3: Brent's Method fallback
    if (!converged && foundBracket) {
        const brentResult = brentSolve(lowRate, highRate, normalized, tolerance, maxIterations);
        if (brentResult) {
            rate = brentResult.rate;
            brentIterations = brentResult.iterations;
            iterations += brentResult.iterations;
            converged = brentResult.converged;
            if (converged) {
                methodUsed = 'Brent';
            }
        }
    }

    const finalNpv = npv(rate, normalized);
    if (converged) {
        return {
            rate: parseFloat(rate.toFixed(8)),
            converged: true,
            iterations,
            newtonIterations,
            brentIterations,
            methodUsed,
            npvResidual: parseFloat(finalNpv.toFixed(6)),
            annualizedReturn: `${(rate * 100).toFixed(2)}%`,
        };
    }

    return {
        rate: parseFloat(rate.toFixed(8)),
        converged: false,
        iterations,
        newtonIterations,
        brentIterations,
        methodUsed: 'Failed',
        npvResidual: parseFloat(finalNpv.toFixed(6)),
        annualizedReturn: `${(rate * 100).toFixed(2)}%`,
        warning: 'Newton-Raphson and Brent solvers did not converge within max iterations',
    };
}
function addMonthsClamp(date, months) {
    const d = new Date(date.getTime());
    const expectedMonth = (d.getMonth() + months) % 12;
    d.setMonth(d.getMonth() + months);
    if (d.getMonth() !== expectedMonth) {
        d.setDate(0); // set to last day of expected month
    }
    return d;
}
/**
 * Compute XIRR for a SIP investment.
 */
export function computeSIPXIRR(monthlySIP, months, currentValue, startDate) {
    if (!Number.isFinite(monthlySIP) || monthlySIP <= 0)
        return { rate: 0, converged: false, iterations: 0, npvResidual: NaN, error: 'Invalid SIP amount', annualizedReturn: '0.00%' };
    if (!Number.isFinite(months) || months < 1)
        return { rate: 0, converged: false, iterations: 0, npvResidual: NaN, error: 'Invalid months', annualizedReturn: '0.00%' };
    if (!Number.isFinite(currentValue) || currentValue <= 0)
        return { rate: 0, converged: false, iterations: 0, npvResidual: NaN, error: 'Invalid current value', annualizedReturn: '0.00%' };
    const now = new Date();
    let start = startDate;
    if (!start) {
        start = new Date(now.getTime());
        start.setMonth(start.getMonth() - months);
    }
    const cashflows = [];
    for (let i = 0; i < months; i++) {
        const date = addMonthsClamp(start, i);
        cashflows.push({ amount: -monthlySIP, date });
    }
    cashflows.push({ amount: currentValue, date: now });
    return computeXIRR(cashflows);
}
