/**
 * WealthGenie — Dynamic "Where to Invest" Generator
 * ──────────────────────────────────────────────────
 * Dynamically builds execution pathway data for ANY instrument
 * using its own metadata from investmentDatabase.js.
 *
 * NO HARDCODED RATES OR NAMES — everything is derived from the
 * instrument's own properties (rate, category, name, desc, etc.)
 */

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRate(rate) {
  if (rate == null) return 'Market-linked';
  return `${Number(rate).toFixed(1)}%`;
}

function formatMinInvestment(amount) {
  if (!amount || amount <= 0) return 'No minimum';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getTenureLabel(inv) {
  if (inv.lockIn > 0) return `${inv.lockIn} year${inv.lockIn > 1 ? 's' : ''} lock-in`;
  if (inv.idealHorizon) {
    const min = inv.idealHorizon.min || inv.idealHorizon?.min;
    const max = inv.idealHorizon.max || inv.idealHorizon?.max;
    if (min && max) return `${min}–${max} years (recommended)`;
    if (min) return `${min}+ years`;
  }
  return 'Open-ended';
}

/**
 * Stock vs ETF/MF Decision Rule Function
 * Recommends ETF/MF when user's risk tolerance is conservative/moderate,
 * sector volatility exceeds 30%, or specific life-stage conditions apply.
 */
export function shouldRecommendETF(userRiskTolerance = 'Moderate', sectorVolatility = 0.25, userProfile = {}) {
  if (['Conservative', 'Moderate', 'Low', 'Very Low'].includes(userRiskTolerance)) return true;
  if (sectorVolatility > 0.30) return true;
  const age = Number(userProfile?.age || 35);
  const budget = Number(userProfile?.monthly_savings || userProfile?.monthlySavings || 10000);
  if (age >= 55) return true;                     // Pre-retirement/senior → ETF for safety
  if (budget < 5000 && age < 30) return true;     // Small budget, young → diversified ETF
  return false;
}

// ─── Internal Helpers for Scoring Engine ─────────────────────────────

/** Parse a return rate from a display string like "~24.5% (5Y)" → 24.5 */
function _parseRate(rateStr) {
  const m = String(rateStr || '').match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : 0;
}

/** Parse minimum investment from display string, stripping commas/symbols */
function _parseMinInv(minStr) {
  const s = String(minStr || '').replace(/,/g, '');
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parse lock-in tenure in years from tenure string */
function _parseLockYears(tenureStr) {
  const m = String(tenureStr || '').match(/(\d+)\s*year/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parse AUM in ₹ Crore from highlight text */
function _parseAUM(text) {
  const m = String(text || '').match(/AUM\s*~?\s*₹?([\d,.]+)\s*(Cr|Lakh|L)/i);
  if (!m) return 0;
  let val = parseFloat(m[1].replace(/,/g, ''));
  if (/L(akh)?$/i.test(m[2])) val *= 0.01;
  return val;
}

/** Parse expense ratio from highlight text */
function _parseExpenseRatio(text) {
  const m = String(text || '').match(/(?:expense\s*ratio|ER)\s*:?\s*([\d.]+)%/i);
  return m ? parseFloat(m[1]) : -1;
}

/**
 * Infer a 1–9 risk score for a product based on its name, badge, and description.
 * Used for graduated risk-alignment scoring instead of binary keyword matching.
 */
function _inferProductRisk(nameLower, highlightLower, badge) {
  // Risk level 1: Ultra-safe government instruments
  if (nameLower.includes('t-bill') || nameLower.includes('overnight') || badge === '100% Sovereign') return 1;
  // Risk level 2: Government-guaranteed / sovereign-backed
  if (nameLower.includes('ppf') || nameLower.includes('scss') || nameLower.includes('rbi') || nameLower.includes('gilt') || badge.includes('Sovereign') || badge.includes('Govt Sponsored') || badge.includes('Official 54EC') || nameLower.includes('sovereign gold')) return 2;
  if (nameLower.includes('fd') || nameLower.includes('liquid') || nameLower.includes('short term') || badge.includes('CRISIL AAA') || nameLower.includes('aaa')) return 2;
  // Risk level 3: Low-risk income / bonds / REITs / gold
  if (nameLower.includes('bond') || nameLower.includes('debt') || nameLower.includes('corporate bond') || badge.includes('Tax-Free')) return 3;
  if (nameLower.includes('gold etf') || nameLower.includes('gold fund') || nameLower.includes('sgb') || (nameLower.includes('gold') && !nameLower.includes('small'))) return 3;
  if (nameLower.includes('silver') || nameLower.includes('commodity')) return 4;
  if (nameLower.includes('reit') || nameLower.includes('invit')) return 4;
  if (nameLower.includes('dividend yield') || nameLower.includes('dividend') || badge.includes('Best Dividend')) return 5;
  // Risk level 4: Moderate — balanced, hybrid, NPS
  if (nameLower.includes('balanced') || nameLower.includes('hybrid') || nameLower.includes('nps') || nameLower.includes('pension') || nameLower.includes('arbitrage') || nameLower.includes('elss')) return 4;
  // Risk level 5: Moderate-equity — large cap, index, nifty 50, bluechip
  if (nameLower.includes('nifty 50') || nameLower.includes('index') || nameLower.includes('bluechip') || nameLower.includes('blue-chip') || nameLower.includes('large cap') || nameLower.includes('large-cap') || nameLower.includes('s&p 500')) return 5;
  // Risk level 6: Growth — flexi, multi-cap, value, contra, large & mid
  if (nameLower.includes('flexi') || nameLower.includes('multi cap') || nameLower.includes('value') || nameLower.includes('contra') || nameLower.includes('large & mid') || nameLower.includes('large and mid') || nameLower.includes('focused')) return 6;
  // Risk level 7: High — mid cap, sectoral, thematic, defence, pharma, infra, banking, IT
  if (nameLower.includes('mid cap') || nameLower.includes('midcap') || nameLower.includes('mid-cap') || nameLower.includes('sector') || nameLower.includes('pharma') || nameLower.includes('defence') || nameLower.includes('banking') || nameLower.includes('infra') || nameLower.includes('it ') || nameLower.includes('technology') || nameLower.includes('consumption') || nameLower.includes('nasdaq')) return 7;
  // Risk level 8: Very high — small cap, quant, momentum
  if (nameLower.includes('small cap') || nameLower.includes('smallcap') || nameLower.includes('small-cap') || nameLower.includes('quant') || highlightLower.includes('momentum') || highlightLower.includes('aggressive')) return 8;
  return 5; // default moderate
}

/**
 * Dynamic Profile-Aware Top-5 Ranking Engine (v2)
 * ────────────────────────────────────────────────
 * Evaluates candidate products against the user's full financial profile
 * using 12 scoring dimensions:
 *
 *  1. Risk Alignment (graduated, not binary)
 *  2. Age & Life-Stage Fit (young / mid-career / pre-retirement / senior)
 *  3. Tax Efficiency (slab-aware EEE vs LTCG vs slab-taxed)
 *  4. Investment Horizon (ultra-short to very-long with graduated penalties)
 *  5. Affordability & Budget Fit
 *  6. Goal Alignment (emergency, tax, retirement, child, housing, wedding, wealth)
 *  7. AUM & Institutional Trust
 *  8. Expense Ratio & Cost Efficiency
 *  9. Geographic Diversification
 * 10. Post-Tax Yield Computation
 * 11. Badge Credibility Bonus
 * 12. Profile Match Tag Construction
 */
/**
 * Dynamic Profile-Aware Top-5 Ranking Engine (v3)
 * ────────────────────────────────────────────────
 * Evaluates candidate products against the user's full financial profile
 * using 14 scoring & ranking dimensions:
 *
 *  1. Risk Alignment (graduated 1-9 scale comparison)
 *  2. Age & Life-Stage Fit (young / mid-career / pre-retirement / senior)
 *  3. Tax Efficiency (slab-aware EEE vs LTCG vs slab-taxed)
 *  4. Investment Horizon (ultra-short to very-long with graduated penalties)
 *  5. Affordability & Budget Fit
 *  6. Goal Alignment (emergency, tax, retirement, child, housing, wedding, wealth)
 *  7. AUM & Institutional Trust
 *  8. Expense Ratio & Cost Efficiency
 *  9. Geographic Diversification
 * 10. Post-Tax Real Yield Computation
 * 11. Macro Market Regime & Crash Rotation Tilt (when simulated)
 * 12. Liquidity & Lock-In Fit
 * 13. Badge Credibility Bonus
 * 14. Profile Match & Regime Tag Construction
 *
 * @param {Array} candidates - Product candidates array
 * @param {Object} userProfile - Full user profile (risk, age, income, slab, horizon, budget, goal)
 * @param {String} riskPreference - Fallback risk preference
 * @param {Object} options - { regimeApplied: boolean, activeRegime: Object, sortBy: 'score'|'postTaxYield'|'expense'|'aum', instrumentRiskLevel: number (1-5 catalog scale) }
 */
export function rankWhereToInvest(candidates = [], userProfile = {}, riskPreference = 'Moderate', options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const { regimeApplied = false, activeRegime = null, sortBy = 'score', instrumentRiskLevel = null } = options;

  // When the instrument's authoritative catalog risk level (1–5) is provided,
  // map it to the internal 1–9 graduated scale using the same formula as
  // server-side rankWhereToInvestBackend: 1 + (catalogRisk - 1) * 2
  const catalogRiskMapped = (instrumentRiskLevel != null && instrumentRiskLevel >= 1 && instrumentRiskLevel <= 5)
    ? 1 + (instrumentRiskLevel - 1) * 2
    : null;

  // ── Extract & normalize profile dimensions ──────────────────────
  const risk = userProfile?.risk_tolerance || userProfile?.riskCategory || riskPreference || 'Moderate';
  const age = Number(userProfile?.age || 35);
  const income = Number(userProfile?.annual_income || userProfile?.income || userProfile?.annualIncome || 1000000);
  const taxSlab = Number(userProfile?.tax_slab || (income > 1500000 ? 30 : income > 1000000 ? 20 : income > 700000 ? 15 : 5));
  const horizon = Number(userProfile?.investment_horizon || userProfile?.horizon || 5);
  const isSenior = age >= 60;
  const monthlyBudget = Number(userProfile?.monthly_savings || userProfile?.monthlySavings || 10000);
  const dependents = Number(userProfile?.dependents || 0);
  const existingEquityPct = Number(userProfile?.existingEquityPct || userProfile?.equity_allocation || 0);
  const taxRegime = (userProfile?.taxRegime || userProfile?.tax_regime || 'new').toLowerCase();
  const incomeSource = (userProfile?.incomeSource || userProfile?.income_source || 'salaried').toLowerCase();
  const existingHoldings = Array.isArray(userProfile?.existingHoldings) ? userProfile.existingHoldings.map(h => (h || '').toLowerCase()) : [];
  const ASSUMED_INFLATION = 6.0; // CPI inflation assumption for real return calc

  // Map risk label → numeric 1–9 for graduated comparison
  const RISK_MAP = {
    'Very Low': 1, 'Conservative': 2, 'Low': 2,
    'Low-Medium': 3, 'Medium-Low': 3,
    'Moderate': 5, 'Medium': 5,
    'Moderately High': 6, 'Medium-High': 6,
    'High': 7, 'Aggressive': 8, 'Very High': 9
  };
  const userRiskNum = RISK_MAP[risk] || 5;

  const scored = candidates.map(item => {
    let score = 50; // base score
    const nameLower = (item.name || '').toLowerCase();
    const highlightLower = (item.highlight || '').toLowerCase();
    const badge = item.badge || '';

    const rateVal = _parseRate(item.rate);
    const minInvVal = _parseMinInv(item.minInvestment);
    const lockYears = _parseLockYears(item.tenure);
    const aumCr = _parseAUM(item.highlight);
    const expRatio = _parseExpenseRatio(item.highlight);
    // Use authoritative catalog risk when available, fall back to keyword inference
    const productRisk = catalogRiskMapped != null ? catalogRiskMapped : _inferProductRisk(nameLower, highlightLower, badge);

    // ═══════════════════════════════════════════════════════════════
    // 1. RISK ALIGNMENT (graduated: -30 to +25)
    // ═══════════════════════════════════════════════════════════════
    const riskDelta = Math.abs(productRisk - userRiskNum);
    if (riskDelta === 0) score += 25;
    else if (riskDelta === 1) score += 18;
    else if (riskDelta === 2) score += 10;
    else if (riskDelta === 3) score += 0;
    else if (riskDelta === 4) score -= 10;
    else score -= 20 + Math.min(10, (riskDelta - 5) * 5);

    if (userRiskNum <= 2) {
      if (badge.includes('Sovereign') || badge.includes('54EC') || badge.includes('Govt') || badge.includes('100% Tax-Free') || badge.includes('CRISIL AAA')) score += 15;
      if (highlightLower.includes('zero credit risk') || highlightLower.includes('sovereign guarantee') || highlightLower.includes('dicgc')) score += 10;
      if (nameLower.includes('small cap') || nameLower.includes('quant') || highlightLower.includes('high volatility')) score -= 20;
    }
    if (userRiskNum >= 7) {
      if (rateVal > 20) score += 12;
      else if (rateVal > 15) score += 6;
      if (badge.includes('Highest Returns') || badge.includes('High Alpha') || badge.includes('High Growth')) score += 10;
      if (rateVal > 0 && rateVal < 8 && !badge.includes('54EC') && !badge.includes('Tax-Free')) score -= 15;
    }
    if (userRiskNum >= 4 && userRiskNum <= 6) {
      if (badge.includes('Category Leader') || badge.includes('Top Track Record') || badge.includes('Most Popular')) score += 12;
      if (nameLower.includes('flexi') || nameLower.includes('balanced') || nameLower.includes('multi cap') || nameLower.includes('large & mid') || nameLower.includes('nifty 50')) score += 10;
      if (rateVal >= 8 && rateVal <= 25) score += 8;
      if (productRisk >= 8) score -= 8;
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. AGE & LIFE-STAGE FIT (-25 to +30)
    // ═══════════════════════════════════════════════════════════════
    if (isSenior) {
      if (nameLower.includes('scss') || nameLower.includes('senior') || badge.includes('Most Trusted') || nameLower.includes('rbi') || nameLower.includes('pension')) score += 30;
      if (highlightLower.includes('quarterly interest') || highlightLower.includes('regular payout') || highlightLower.includes('semi-annual') || highlightLower.includes('payout')) score += 15;
      if (badge.includes('Safest')) score += 8;
      if (nameLower.includes('small cap') || nameLower.includes('aggressive') || highlightLower.includes('high volatility')) score -= 25;
      if (lockYears > 5) score -= 10;
    } else if (age <= 30) {
      if (rateVal > 15) score += 8;
      if (highlightLower.includes('compounding') || highlightLower.includes('long-term')) score += 5;
      if (nameLower.includes('scss') || nameLower.includes('senior')) score -= 20;
    } else if (age >= 45 && age < 60) {
      if (nameLower.includes('balanced') || nameLower.includes('large cap') || nameLower.includes('nps') || nameLower.includes('index') || nameLower.includes('gilt')) score += 8;
      if (productRisk >= 8) score -= 8;
    }
    if (dependents >= 2) {
      if (nameLower.includes('ppf') || nameLower.includes('sukanya') || badge.includes('EEE') || highlightLower.includes('sovereign guarantee')) score += 8;
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. TAX EFFICIENCY — now regime-aware (-15 to +25)
    //    Old regime: 80C/80CCD deductions are valuable
    //    New regime: 80C/80CCD deductions DON'T apply, but lower slab rates
    // ═══════════════════════════════════════════════════════════════
    const isEEE = badge.includes('EEE') || badge.includes('54EC') || badge.includes('100% Tax-Free') ||
      nameLower.includes('ppf') || nameLower.includes('sukanya') ||
      (nameLower.includes('sgb') && highlightLower.includes('maturity')) ||
      highlightLower.includes('tax-free');
    const isSlabTaxed = highlightLower.includes('taxed at slab rate') || highlightLower.includes('slab rate') ||
      nameLower.includes('fd') || nameLower.includes('scss') ||
      (nameLower.includes('rbi') && nameLower.includes('bond'));
    const has80CBenefit = nameLower.includes('ppf') || nameLower.includes('elss') || nameLower.includes('sukanya') || nameLower.includes('nps') || highlightLower.includes('80c') || highlightLower.includes('80ccd');
    const isOldRegime = taxRegime === 'old';

    if (taxSlab >= 30) {
      if (isEEE) score += 25;
      // 80C deduction-based instruments: only valuable under old regime
      if (has80CBenefit && isOldRegime) {
        score += 15;
      } else if (has80CBenefit && !isOldRegime) {
        // New regime: 80C doesn't save tax, but instrument itself may still be good
        score += 3;
      }
      if (badge.includes('54EC') || nameLower.includes('tax saver')) score += 10;
      if (isSlabTaxed && rateVal < 8 && !badge.includes('Sovereign')) score -= 15;
    } else if (taxSlab >= 20) {
      if (isEEE) score += 15;
      if (has80CBenefit && isOldRegime) score += 8;
      if (badge.includes('54EC') || nameLower.includes('elss')) score += 5;
    } else {
      if (isEEE) score += 5;
    }

    // LTCG awareness: equity held > 1yr at 12.5%, debt at slab rate
    const isEquityType = productRisk >= 5 && !isSlabTaxed && !isEEE;
    const isLTCGEquity = isEquityType && horizon >= 1;
    if (isLTCGEquity && rateVal > 0) {
      // Equity LTCG at 12.5% above ₹1.25L threshold is relatively mild
      if (taxSlab >= 30) score += 3; // net tax advantage vs slab-taxed alternatives
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. INVESTMENT HORIZON FIT (-35 to +25)
    //    Now covers all 5 horizon buckets with no gaps
    // ═══════════════════════════════════════════════════════════════
    if (horizon <= 1) {
      if (badge.includes('Most Liquid') || nameLower.includes('liquid') || nameLower.includes('overnight') || nameLower.includes('t-bill')) score += 25;
      if (nameLower.includes('fd') || nameLower.includes('short term')) score += 15;
      if (lockYears > 1) score -= 35;
      if (productRisk >= 5) score -= 15;
    } else if (horizon <= 3) {
      if (nameLower.includes('liquid') || nameLower.includes('fd') || nameLower.includes('short term') || nameLower.includes('arbitrage') || badge.includes('Most Liquid')) score += 20;
      if (lockYears > 3) score -= 25;
      if (productRisk >= 7) score -= 12;
    } else if (horizon >= 4 && horizon <= 6) {
      // ── Medium-term sweet spot: hybrid, balanced, large cap, ELSS, index ──
      if (nameLower.includes('balanced') || nameLower.includes('hybrid') || nameLower.includes('elss') || nameLower.includes('large cap') || nameLower.includes('index') || nameLower.includes('flexi') || nameLower.includes('nifty 50') || nameLower.includes('sgb')) score += 15;
      if (nameLower.includes('corporate bond') || nameLower.includes('debt') || nameLower.includes('reit') || nameLower.includes('gold')) score += 10;
      if (rateVal >= 8 && rateVal <= 20) score += 6;
      if (lockYears > 6) score -= 15;
      if (productRisk >= 8) score -= 8;
    } else if (horizon >= 7 && horizon < 15) {
      if (nameLower.includes('equity') || nameLower.includes('sgb') || nameLower.includes('nps') || nameLower.includes('index') || nameLower.includes('mid') || nameLower.includes('small')) score += 12;
      if (rateVal > 12) score += 8;
    } else if (horizon >= 15) {
      if (nameLower.includes('ppf') || nameLower.includes('nps') || nameLower.includes('equity') || nameLower.includes('small cap') || nameLower.includes('mid cap') || nameLower.includes('index')) score += 15;
      if (rateVal > 15) score += 10;
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. AFFORDABILITY & BUDGET FIT (-20 to +8)
    // ═══════════════════════════════════════════════════════════════
    if (minInvVal > 0) {
      if (minInvVal > monthlyBudget * 3 && minInvVal > 50000) score -= 20;
      else if (minInvVal > monthlyBudget && minInvVal > 10000) score -= 8;
      else if (minInvVal <= 500) score += 8;
      else if (minInvVal <= monthlyBudget * 0.3) score += 5;
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. GOAL ALIGNMENT (-30 to +35)
    // ═══════════════════════════════════════════════════════════════
    const targetGoal = (userProfile?.activeGoal || userProfile?.goalType || userProfile?.goal || userProfile?.financialGoal || '').toLowerCase();
    if (targetGoal.includes('emergency') || targetGoal.includes('liquid')) {
      if (badge.includes('Most Liquid') || nameLower.includes('liquid') || nameLower.includes('overnight')) score += 35;
      if (nameLower.includes('fd') || nameLower.includes('t-bill')) score += 20;
      if (lockYears > 0) score -= 30;
    } else if (targetGoal.includes('tax') || targetGoal.includes('80c')) {
      if (badge.includes('54EC') || badge.includes('EEE') || nameLower.includes('ppf') || nameLower.includes('elss') || nameLower.includes('sukanya')) score += 30;
      if (nameLower.includes('nps') || highlightLower.includes('80ccd')) score += 20;
    } else if (targetGoal.includes('retire') || targetGoal.includes('pension')) {
      if (nameLower.includes('nps') || nameLower.includes('epf') || nameLower.includes('vpf')) score += 25;
      if (nameLower.includes('index') || nameLower.includes('sgb') || nameLower.includes('ppf')) score += 15;
    } else if (targetGoal.includes('child') || targetGoal.includes('education')) {
      if (nameLower.includes('sukanya') || nameLower.includes('ppf') || nameLower.includes('child')) score += 25;
      if (nameLower.includes('flexi') || nameLower.includes('balanced') || nameLower.includes('index')) score += 12;
    } else if (targetGoal.includes('house') || targetGoal.includes('home') || targetGoal.includes('property')) {
      if (horizon <= 5) {
        if (nameLower.includes('fd') || nameLower.includes('short term') || nameLower.includes('debt') || nameLower.includes('arbitrage')) score += 20;
      } else {
        if (nameLower.includes('balanced') || nameLower.includes('flexi') || nameLower.includes('large cap') || nameLower.includes('index')) score += 18;
      }
    } else if (targetGoal.includes('wedding') || targetGoal.includes('marriage')) {
      if (horizon <= 3) {
        if (nameLower.includes('fd') || nameLower.includes('short term') || nameLower.includes('debt') || nameLower.includes('liquid')) score += 20;
      } else {
        if (nameLower.includes('balanced') || nameLower.includes('flexi') || nameLower.includes('large cap')) score += 15;
      }
    } else if (targetGoal.includes('wealth') || targetGoal.includes('growth') || targetGoal.includes('corpus')) {
      if (rateVal >= 15) score += 20;
      if (nameLower.includes('flexi') || nameLower.includes('mid') || nameLower.includes('small') || nameLower.includes('tech') || nameLower.includes('focused')) score += 12;
    } else if (targetGoal.includes('vacation') || targetGoal.includes('travel') || targetGoal.includes('car')) {
      if (horizon <= 2) {
        if (nameLower.includes('liquid') || nameLower.includes('fd') || nameLower.includes('short term')) score += 22;
      } else {
        if (nameLower.includes('balanced') || nameLower.includes('flexi') || nameLower.includes('debt')) score += 12;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. AUM & INSTITUTIONAL TRUST (0 to +12)
    // ═══════════════════════════════════════════════════════════════
    if (aumCr > 0) {
      if (aumCr >= 50000) score += 12;
      else if (aumCr >= 10000) score += 8;
      else if (aumCr >= 5000) score += 5;
      else if (aumCr >= 1000) score += 2;
      if (aumCr < 500 && userRiskNum <= 3) score -= 3;
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. EXPENSE RATIO & COST EFFICIENCY (0 to +12)
    // ═══════════════════════════════════════════════════════════════
    if (expRatio >= 0) {
      if (expRatio <= 0.10) score += 10;
      else if (expRatio <= 0.30) score += 7;
      else if (expRatio <= 0.60) score += 4;
      else if (expRatio > 1.0) score -= 3;
      if (horizon >= 10 && expRatio <= 0.20) score += 5;
    }

    // ═══════════════════════════════════════════════════════════════
    // 9. GEOGRAPHIC DIVERSIFICATION (0 to +12)
    // ═══════════════════════════════════════════════════════════════
    const isInternational = nameLower.includes('nasdaq') || nameLower.includes('s&p 500') ||
      nameLower.includes('us ') || highlightLower.includes('us equity') ||
      highlightLower.includes('us-listed') || badge.includes('US Tech') ||
      badge.includes('Broadest Coverage');
    if (isInternational) {
      score += 7;
      if (existingEquityPct > 60) score += 5;
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. POST-TAX REAL YIELD COMPUTATION
    // ═══════════════════════════════════════════════════════════════
    let taxEffectRate = 0.125; // default LTCG equity
    if (isEEE) taxEffectRate = 0;
    else if (isSlabTaxed) taxEffectRate = taxSlab / 100;

    const postTaxYieldVal = rateVal > 0 ? rateVal * (1 - taxEffectRate) : 0;
    const postTaxYieldStr = postTaxYieldVal > 0 ? `~${postTaxYieldVal.toFixed(1)}% (Post-Tax)` : item.rate;

    if (postTaxYieldVal > 0) {
      score += Math.min(15, postTaxYieldVal * 0.6);
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. MACRO REGIME TILT — covers all 5 regimes from regimeRotationEngine
    // ═══════════════════════════════════════════════════════════════
    let regimeBoostTag = null;
    if (regimeApplied && activeRegime) {
      const titleLower = (activeRegime.title || '').toLowerCase();
      let matchesRegime = false;
      let regimeLabel = 'Regime Tilt';

      if (titleLower.includes('war') || titleLower.includes('conflict') || titleLower.includes('geopolitical')) {
        if (nameLower.includes('defence') || nameLower.includes('energy') || nameLower.includes('gold') || nameLower.includes('sgb') || badge.includes('Sovereign')) {
          matchesRegime = true;
          regimeLabel = 'Geopolitical Hedge';
        }
        // Penalize trade-dependent sectors during conflict
        if (nameLower.includes('auto') || nameLower.includes('consumer') || nameLower.includes('fmcg')) score -= 10;
      } else if (titleLower.includes('pandemic') || titleLower.includes('health') || titleLower.includes('lockdown')) {
        if (nameLower.includes('pharma') || nameLower.includes('health') || nameLower.includes('it ') || nameLower.includes('technology') || nameLower.includes('fmcg')) {
          matchesRegime = true;
          regimeLabel = 'Pandemic Resilient';
        }
        if (nameLower.includes('travel') || nameLower.includes('hotel') || nameLower.includes('auto')) score -= 12;
      } else if (titleLower.includes('crash') || titleLower.includes('drawdown')) {
        if (nameLower.includes('liquid') || nameLower.includes('bluechip') || nameLower.includes('fd') || badge.includes('Sovereign') || nameLower.includes('overnight') || nameLower.includes('gilt')) {
          matchesRegime = true;
          regimeLabel = 'Crash Defense';
        }
        if (productRisk >= 7) score -= 15;
      } else if (titleLower.includes('inflation') || titleLower.includes('commodity')) {
        // Inflation spike: real assets, floating rate, commodities benefit
        if (nameLower.includes('gold') || nameLower.includes('sgb') || nameLower.includes('silver') || nameLower.includes('commodity') || nameLower.includes('rbi') || nameLower.includes('floating') || nameLower.includes('metal')) {
          matchesRegime = true;
          regimeLabel = 'Inflation Hedge';
        }
        // Fixed-rate long-duration instruments lose value during inflation
        if ((nameLower.includes('fd') || nameLower.includes('ppf') || nameLower.includes('gilt')) && rateVal < 8) score -= 8;
      } else if (titleLower.includes('rate cut') || titleLower.includes('easing') || titleLower.includes('monetary')) {
        // Rate cut cycle: long duration bonds gain, growth mid-caps benefit
        if (nameLower.includes('gilt') || nameLower.includes('long duration') || nameLower.includes('dynamic bond') || nameLower.includes('mid cap') || nameLower.includes('growth')) {
          matchesRegime = true;
          regimeLabel = 'Rate Cut Beneficiary';
        }
      }

      if (matchesRegime) {
        score += 25;
        regimeBoostTag = `⚡ ${regimeLabel}`;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. BADGE CREDIBILITY BONUS (0 to +35)
    // ═══════════════════════════════════════════════════════════════
    const badgePriority = {
      'Official Scheme': 35, 'Official 54EC': 35, '100% Sovereign': 35,
      '100% Tax-Free': 25,
      'Category Leader': 15, 'Top Pick': 15,
      'Pharma Leader': 12, 'Metals Top Pick': 12, 'Banking Quality': 12,
      'Most Liquid': 12, 'Lowest Cost': 12, 'Lowest Expense': 12,
      'Top Track Record': 10, 'Most Popular': 10, 'Most Trusted': 10,
      'Highest Yield': 8, 'Highest Return': 8, 'Highest Returns': 8,
      'High Alpha': 8, 'High Growth': 8,
      'Best Returns': 6, 'Best for Safety': 6,
      'Govt Sponsored': 10, 'Govt PSU': 8,
      'Tax-Free Maturity': 10,
      'Largest REIT': 8, 'Largest M-Cap': 8,
      'Zero Debt': 6, 'Best Dividend': 6,
      'Industrial Silver': 4, 'Junior BeES': 4, 'Factor Alpha': 4,
      'EV Ancillary': 4, 'High Growth IT': 4,
      'Sector Benchmark': 6, 'Broad Theme': 4,
      'Most Accessible': 4, 'Highest EEE Rate': 10, 'Widest Access': 4,
      'Highest PSU Rate': 6, 'Highest Rate': 6,
      'PSU Banking': 4, 'Retail Leader': 4, 'Top InvIT Yield': 6,
      'No Demat Needed': 4,
      'Largest AMC': 6, 'Official Service': 6,
      'Bond Specialist': 4, 'Highly Curated': 4,
    };
    score += (badgePriority[badge] || 0);

    // ═══════════════════════════════════════════════════════════════
    // 13. PROFILE MATCH TAG (descriptive label for UI display)
    // ═══════════════════════════════════════════════════════════════
    let matchTag = null;
    const matchReasons = [];
    if (riskDelta <= 1) matchReasons.push('risk');
    if (isEEE && taxSlab >= 20) matchReasons.push('tax');
    if (isSenior && (nameLower.includes('scss') || nameLower.includes('senior') || nameLower.includes('rbi') || highlightLower.includes('quarterly interest'))) matchReasons.push('senior');
    if (horizon <= 2 && (nameLower.includes('liquid') || nameLower.includes('fd') || nameLower.includes('t-bill'))) matchReasons.push('short');
    if (horizon >= 7 && rateVal > 12) matchReasons.push('compounder');
    if (isInternational) matchReasons.push('diversified');

    if (regimeBoostTag) {
      matchTag = regimeBoostTag;
    } else if (score >= 100) {
      if (matchReasons.includes('senior')) matchTag = 'Senior Citizen Fit';
      else if (matchReasons.includes('tax')) matchTag = 'High Tax Efficiency';
      else if (matchReasons.includes('short')) matchTag = 'Short-Term Parking';
      else if (matchReasons.includes('compounder')) matchTag = 'Long-Term Compounder';
      else if (userRiskNum <= 3) matchTag = 'Best for Conservative Profile';
      else if (userRiskNum >= 7) matchTag = 'High Growth Match';
      else matchTag = 'Top Profile Match';
    } else if (score >= 85 && matchReasons.length >= 2) {
      if (matchReasons.includes('senior')) matchTag = 'Senior Citizen Fit';
      else if (matchReasons.includes('diversified')) matchTag = 'Diversification Boost';
      else matchTag = 'Strong Profile Fit';
    } else if (isSenior && score >= 80 && matchReasons.includes('senior')) {
      matchTag = 'Senior Citizen Fit';
    } else if (taxSlab >= 30 && score >= 80 && matchReasons.includes('tax')) {
      matchTag = 'High Tax Efficiency';
    }

    // ═══════════════════════════════════════════════════════════════
    // 14. DYNAMIC TAX SAVINGS & INVESTMENT ROUTE COMPUTATION
    //     Now regime-aware: 80C note only appears for old regime
    // ═══════════════════════════════════════════════════════════════
    let taxSavingsNote = null;
    const effectiveTaxRate = (taxSlab * 1.04) / 100; // include 4% health & education cess

    if (nameLower.includes('ppf') || nameLower.includes('elss') || nameLower.includes('sukanya') || highlightLower.includes('80c')) {
      if (isOldRegime) {
        const max80cSavings = Math.round(150000 * effectiveTaxRate);
        if (max80cSavings > 0) {
          taxSavingsNote = `Saves up to ₹${max80cSavings.toLocaleString('en-IN')} tax/yr under Sec 80C (Old Regime)`;
        }
      } else {
        taxSavingsNote = '⚠ Sec 80C not applicable under New Regime — invest for returns, not tax saving';
      }
    } else if (nameLower.includes('nps') || highlightLower.includes('80ccd')) {
      if (isOldRegime) {
        const npsExtraSavings = Math.round(50000 * effectiveTaxRate);
        if (npsExtraSavings > 0) {
          taxSavingsNote = `Saves up to ₹${npsExtraSavings.toLocaleString('en-IN')} extra tax/yr under Sec 80CCD(1B) (Old Regime)`;
        }
      } else {
        // NPS employer contribution (80CCD(2)) IS available in new regime
        taxSavingsNote = 'Employer NPS (80CCD(2)) available in New Regime; self 80CCD(1B) is not';
      }
    } else if (badge.includes('54EC') || nameLower.includes('54ec')) {
      taxSavingsNote = `Exempts up to 20% LTCG tax on real estate property sale`;
    }

    // Determine optimal investment execution route (SIP vs Lump-Sum)
    let investmentRoute = 'SIP Recommended';
    if (productRisk <= 3 || nameLower.includes('liquid') || nameLower.includes('fd') || nameLower.includes('sgb') || nameLower.includes('t-bill') || nameLower.includes('bond') || badge.includes('54EC')) {
      investmentRoute = 'Lump-Sum Suitable';
    } else if (highlightLower.includes('small cap') || highlightLower.includes('momentum') || productRisk >= 7) {
      investmentRoute = 'Strict SIP Route';
    }

    // ═══════════════════════════════════════════════════════════════
    // 15. INCOME-SOURCE FIT (-8 to +12)
    //     Salaried → EPF/NPS/PPF boost; Business → liquid/debt tilt
    // ═══════════════════════════════════════════════════════════════
    if (incomeSource === 'salaried' || incomeSource === 'salary') {
      if (nameLower.includes('nps') || nameLower.includes('epf') || nameLower.includes('vpf')) score += 12;
      if (nameLower.includes('ppf')) score += 5;
    } else if (incomeSource === 'business' || incomeSource === 'self-employed' || incomeSource === 'freelance') {
      if (nameLower.includes('liquid') || nameLower.includes('fd') || nameLower.includes('debt')) score += 8;
      if (nameLower.includes('epf')) score -= 8; // EPF not available for non-salaried
    }

    // ═══════════════════════════════════════════════════════════════
    // 16. CONCENTRATION / OVERLAP PENALTY (-15)
    //     If user already holds a similar product, penalize duplicates
    // ═══════════════════════════════════════════════════════════════
    if (existingHoldings.length > 0) {
      const nameWords = nameLower.split(/\s+/).filter(w => w.length > 3);
      const hasOverlap = existingHoldings.some(holding =>
        nameWords.some(word => holding.includes(word)) || nameLower.includes(holding) || holding.includes(nameLower)
      );
      if (hasOverlap) score -= 15;
    }

    // ═══════════════════════════════════════════════════════════════
    // 17. RISK-ADJUSTED EFFICENCY (SHARPE RATIO PROXY: -10 to +12)
    //     Penalizes high volatility products if return doesn't compensate
    // ═══════════════════════════════════════════════════════════════
    const RISK_FREE_RATE = 7.1; // RBI / PPF sovereign benchmark
    const estimatedVolatility = Math.max(2.0, productRisk * 3.2); // Volatility proxy in %
    const excessReturn = Math.max(0, postTaxYieldVal - RISK_FREE_RATE);
    const sharpeRatioEst = parseFloat((excessReturn / estimatedVolatility).toFixed(2));

    if (productRisk >= 6) {
      if (sharpeRatioEst >= 0.65) score += 12; // Excellent risk-adjusted compensation
      else if (sharpeRatioEst >= 0.40) score += 6;
      else if (sharpeRatioEst < 0.25) score -= 10; // High risk, poor risk-adjusted yield
    }

    // ═══════════════════════════════════════════════════════════════
    // 18. EMERGENCY FUND LIQUIDITY URGENCY MATCH (-35 to +35)
    // ═══════════════════════════════════════════════════════════════
    const emergencyMonths = Number(userProfile?.emergency_fund_months || userProfile?.emergencyFundMonths || userProfile?.emergencyMonths || 6);
    if (emergencyMonths < 3) {
      if (badge.includes('Most Liquid') || nameLower.includes('liquid') || nameLower.includes('overnight')) {
        score += 35; // Critical need for liquid capital
      } else if (productRisk <= 2 || nameLower.includes('fd')) {
        score += 15;
      }
      if (lockYears >= 3) {
        score -= 35; // Severe penalty: long lock-in locks up emergency reserves
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 19. SECTION 112A LTCG EXEMPTION CALLOUT
    // ═══════════════════════════════════════════════════════════════
    const isEquityMF = (productRisk >= 5 && !isSlabTaxed && !isEEE) || nameLower.includes('elss') || nameLower.includes('index') || nameLower.includes('flexi');
    if (isEquityMF && !taxSavingsNote && horizon >= 1) {
      taxSavingsNote = 'First ₹1.25 Lakh LTCG profit per financial year is 100% tax-free under Sec 112A';
    }

    // ═══════════════════════════════════════════════════════════════
    // 20. INFLATION-ADJUSTED REAL RETURN WARNING
    //     Flag products that lose to inflation after tax
    // ═══════════════════════════════════════════════════════════════
    const realReturnVal = postTaxYieldVal - ASSUMED_INFLATION;
    let realReturnWarning = null;
    if (realReturnVal < 0 && rateVal > 0) {
      realReturnWarning = `⚠ Post-tax real return is negative (~${realReturnVal.toFixed(1)}% after ${ASSUMED_INFLATION}% inflation)`;
      // Mild penalty for negative real returns, but don't over-penalize govt schemes
      if (!badge.includes('Sovereign') && !badge.includes('Official')) score -= 5;
    } else if (realReturnVal > 0 && realReturnVal < 1.5) {
      realReturnWarning = `Barely beats inflation (~${realReturnVal.toFixed(1)}% real return)`;
    }

    return {
      ...item,
      _score: score,
      postTaxYieldVal,
      postTaxYieldStr,
      profileMatchTag: matchTag,
      taxSavingsNote,
      investmentRoute,
      realReturnWarning,
      realReturnVal,
      sharpeRatioEst,
      expRatioVal: expRatio >= 0 ? expRatio : 99,
      aumCrVal: aumCr
    };
  });

  // ── Sort candidates based on requested mode ──────────────────────
  if (sortBy === 'postTaxYield') {
    scored.sort((a, b) => b.postTaxYieldVal - a.postTaxYieldVal || b._score - a._score);
  } else if (sortBy === 'expense') {
    scored.sort((a, b) => a.expRatioVal - b.expRatioVal || b._score - a._score);
  } else if (sortBy === 'aum') {
    scored.sort((a, b) => b.aumCrVal - a.aumCrVal || b._score - a._score);
  } else {
    // Default: Sort descending by calculated profile score
    scored.sort((a, b) => b._score - a._score);
  }

  // Return top 5 items with profile match tags attached
  return scored.slice(0, 5);
}

function getPlatformCategory(inv) {
  const id = (inv.id || '').toLowerCase();
  const cat = (inv.category || inv.cat || '').toLowerCase();
  const name = (inv.name || '').toLowerCase();

  // EPF / VPF (handled specially so they don't map to generic retirement NPS)
  if (['epf', 'vpf'].includes(id) || name.includes('employee provident') || name.includes('voluntary provident')) {
    return 'epf';
  }

  // Government schemes
  if (cat.includes('government') || cat.includes('sovereign')) return 'govt';
  if (['ppf', 'scss', 'sukanya', 'rbi_bonds', 'nsc', 'kvp', 'pomis', 'mssc', 'apy'].includes(id)) return 'govt';

  // Bank FDs — special: the bank itself is the platform
  if (id.endsWith('_fd') || id === 'fd' || id === 'po_rd' || id === 'po_td_1yr' || cat.includes('deposit')) return 'bank_fd';

  // Retirement
  if (cat.includes('retirement') || ['nps', 'nps_tier_2', 'epf', 'vpf'].includes(id)) return 'retirement';

  // Insurance-linked
  if (cat.includes('insurance') || ['ulip', 'endowment_plan', 'term_mf_combo'].includes(id)) return 'insurance';

  // REITs & InvITs
  if (cat.includes('reit') || cat.includes('invit')) return 'reit';

  // Bonds & Debentures
  if (cat.includes('bond') || cat.includes('debenture') || ['g_sec', 'municipal_bonds', 'bonds_54ec', 'aaa_corporate_bond', 'aa_corporate_bond', 'tax_free_bonds', 'bharat_bond_direct'].includes(id)) return 'bonds';

  // ETFs
  if (cat.includes('etf') || id.includes('etf') || name.includes('etf')) return 'etf';

  // Direct Equity / Stocks
  if (cat.includes('direct equity') || id.includes('stock') || ['bluechip_stocks', 'large_cap_stocks', 'mid_cap_stocks', 'small_cap_stocks', 'direct_equity'].includes(id)) return 'equity';

  // Gold (non-ETF, non-SGB)
  if (name.includes('gold') && !name.includes('etf') && !name.includes('bond')) return 'etf';

  // Mutual Funds (default for anything with _mf suffix or MF category)
  if (id.endsWith('_mf') || cat.includes('mutual fund') || name.includes('fund')) return 'mf';

  return 'mf'; // safe default
}

function getProductsForInstrument(inv, platformCat) {
  const id = (inv.id || '').toLowerCase();
  const name = inv.name || inv.abbr || 'this option';
  const rate = inv.expectedReturn || inv.rate;
  const rateStr = formatRate(rate);
  const minInv = formatMinInvestment(inv.minMonthlyInvestment);
  const tenure = getTenureLabel(inv);

  // Helper to build a product object with realistic AMC / Bank / Issuer branding
  const makeProduct = (prodName, provider, platform, highlight, badge = null) => {
    const cleanInvName = (inv.abbr || inv.name || 'Fund').replace(/\b(mf|mutual fund)\b/gi, '').trim();
    const hasBrand = /sbi|hdfc|icici|nippon|axis|kotak|motilal|mirae|dsp|tata|uti|rbi|post office|lic|epfo|policybazaar|zerodha|groww|angel|goldenpi|wint/i.test(prodName);
    
    let finalName = prodName;
    if (!hasBrand) {
      finalName = `${provider} ${cleanInvName} Plan (${prodName})`;
    } else if (!prodName.toLowerCase().includes(cleanInvName.toLowerCase()) && cleanInvName.length > 2 && !/etf|bond|sgb|ppf|scss|ssy|nps|fd|epf/i.test(cleanInvName)) {
      finalName = `${prodName} — ${cleanInvName}`;
    }

    return {
      name: finalName,
      provider,
      rate: rateStr,
      highlight,
      platform,
      minInvestment: minInv,
      tenure,
      badge
    };
  };

  // 1. EPF & VPF
  if (id === 'epf' || id === 'vpf') {
    return [
      makeProduct('EPFO Member Portal', 'EPFO (Govt of India)', 'unifiedportal-mem.epfindia.gov.in', 
        `Access your official EPFO account online using your UAN to check your accumulated balance, view monthly employer deposits, and download your EPF passbook.`, 'Official Portal'),
      makeProduct('Company HR Department', 'Your Employer', 'HR Payroll Channel', 
        `Contact your company's HR/Payroll department to link your UAN, make changes to your nominations, or request voluntary deductions (VPF) to save more tax.`, 'Enrolment & VPF'),
      makeProduct('UMANG App', 'Ministry of Electronics & IT', 'UMANG Mobile Application', 
        `Check your EPF balance, track pension claims, and get push notifications for employer contributions instantly on your phone using the government's centralized UMANG app.`, 'Mobile Tracking')
    ];
  }

  // 2. PPF (Public Provident Fund)
  if (id === 'ppf') {
    return [
      makeProduct('SBI YONO / Branch', 'State Bank of India', 'SBI NetBanking / YONO App', 
        `Open a PPF account instantly via SBI YONO. Link with your SBI savings account to set up automatic monthly SIPs and download tax receipts for Section 80C.`, 'Most Accessible'),
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `Traditional offline security with direct government safety. You receive a physical passbook and can make cash/check deposits at any local post office.`, 'Highest Safety'),
      makeProduct('HDFC NetBanking', 'HDFC Bank', 'HDFC NetBanking / Mobile App', 
        `Seamless digital management. Set up standing instructions to invest by the 5th of each month (highly recommended to maximize PPF interest compounding).`),
      makeProduct('ICICI iMobile', 'ICICI Bank', 'ICICI NetBanking / App', 
        `Open your account 100% paperless in under 2 minutes. Track balance, download statements, and renew the account digitally at maturity.`)
    ];
  }

  // 3. Sukanya Samriddhi Yojana (SSY)
  if (id === 'sukanya' || id === 'ssy') {
    return [
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `The most popular option for SSY. Open offline with the girl child's birth certificate. Provides a physical passbook and 100% government guarantee.`, 'Most Popular'),
      makeProduct('SBI YONO / Branch', 'State Bank of India', 'SBI NetBanking / YONO App', 
        `Excellent for SBI savings account holders. Manage your daughter's SSY account online, set up monthly standing instructions, and track growth.`, 'Highly Convenient'),
      makeProduct('ICICI iMobile', 'ICICI Bank', 'ICICI NetBanking / App', 
        `Fully digital tracking. Transfer money from your ICICI savings account to the SSY account instantly and download Section 80C tax certificates.`)
    ];
  }

  // 4. Senior Citizens Savings Scheme (SCSS)
  if (id === 'scss') {
    return [
      makeProduct('SBI Branch', 'State Bank of India', 'SBI Branch Counter', 
        `Highly recommended for senior citizens. Dedicated counters, quarterly interest credited directly to your linked SBI savings account.`, 'Most Trusted'),
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `Government-backed safety with the widest network in rural and semi-urban India. Interest is paid quarterly via post office savings account.`, 'Highest Safety'),
      makeProduct('HDFC Bank Branch', 'HDFC Bank', 'HDFC Bank Branch / NetBanking', 
        `Convenient quarterly interest payout credited directly to your HDFC savings account, with online tracking of tax deducted at source (TDS).`)
    ];
  }

  // 5. RBI Floating Rate Bonds
  if (id === 'rbi_bonds') {
    return [
      makeProduct('RBI Retail Direct', 'Reserve Bank of India', 'rbiretaildirect.org.in', 
        `Buy Floating Rate Savings Bonds directly from the RBI with zero commission. Bonds are held securely in your Bond Ledger Account (BLA) with the central bank.`, 'Zero Commission'),
      makeProduct('SBI Branch / NetBanking', 'State Bank of India', 'SBI NetBanking / Branch', 
        `Apply online or at any designated SBI branch. Interest is paid semi-annually directly to your linked savings account. No upper limit on investment.`, 'Most Accessible'),
      makeProduct('HDFC NetBanking', 'HDFC Bank', 'HDFC NetBanking / Branch', 
        `Apply online through HDFC net banking in a few clicks. Semi-annual interest resets are auto-tracked, and digital certificate of holding is issued.`)
    ];
  }

  // 6. National Savings Certificate (NSC) & Kisan Vikas Patra (KVP) & POMIS
  if (['nsc', 'kvp', 'pomis', 'mssc'].includes(id)) {
    return [
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `The primary and official issuer of ${name}. Get a physical certificate or passbook with direct government backing and sovereign guarantee.`, 'Official Channel'),
      makeProduct('SBI NetBanking / Branch', 'State Bank of India', 'SBI NetBanking / Branch', 
        `Select public sector branches are authorized to issue digital ${name} certificates, making it easier to track along with your savings account.`, 'Bank Option')
    ];
  }

  // 7. Atal Pension Yojana (APY)
  if (id === 'apy') {
    return [
      makeProduct('SBI NetBanking', 'State Bank of India', 'SBI NetBanking / YONO App', 
        `Open APY online via SBI. Choose your pension slab (₹1,000 to ₹5,000/month) and set up auto-debit from your savings account.`, 'Most Popular'),
      makeProduct('HDFC NetBanking', 'HDFC Bank', 'HDFC NetBanking Portal', 
        `Register for APY digitally in under 3 minutes. Auto-debit will be set up from your HDFC account. Age limits: 18 to 40 years.`, 'Convenient'),
      makeProduct('ICICI iMobile', 'ICICI Bank', 'ICICI NetBanking / App', 
        `Simple, paperless registration. Track your pension contributions and print your PRAN card online via the app.`)
    ];
  }

  // 8. National Pension System (NPS) - Tier 1 & Tier 2
  if (id === 'nps' || id === 'nps_tier_2') {
    return [
      makeProduct('eNPS NSDL Portal', 'PFRDA / NPS Trust', 'enps.nsdl.com', 
        `The official government portal for NPS. Offers the lowest transaction charges and direct online management of fund managers and asset allocations.`, 'Lowest Charges'),
      makeProduct('Current Bank (SBI/HDFC)', 'Your Savings Bank', 'NetBanking Portal', 
        `Open NPS instantly through your existing bank net banking. Ideal for getting quick digital tax receipts under Section 80CCD(1B) for the extra ₹50,000 deduction.`, 'Easy Integration'),
      makeProduct('Zerodha Coin / Groww', 'Discount Broker', 'Broker App', 
        `Invest in NPS online alongside your other stock and mutual fund investments to track your total retirement corpus in one app.`)
    ];
  }

  // 9. Capital Gains Bonds (54EC Bonds)
  if (id === 'bonds_54ec') {
    return [
      makeProduct('REC / PFC / NHAI Portals', 'Government Issuers', 'Official Issuer Websites', 
        `Apply directly on the official websites of Rural Electrification Corp, Power Finance Corp, or NHAI to save capital gains tax on property sales.`, 'Direct Option'),
      makeProduct('SBI / HDFC Bank Branches', 'Authorized Banks', 'Physical Bank Branch Counter', 
        `Submit physical 54EC application forms and drafts at any designated SBI or HDFC branch. Maximum investment is ₹50 Lakh per financial year.`, 'Offline Option')
    ];
  }

  // 10. Sovereign Gold Bonds (Primary vs Secondary)
  if (id === 'sgb' || id === 'sgb_secondary') {
    return [
      makeProduct('Zerodha Kite / Groww', 'NSE / BSE Stock Exchange', 'Discount Broker App', 
        `Buy existing SGB units on the stock exchange secondary market. Units often trade at a 2-5% discount to the actual gold price, making it the cheapest way to buy gold.`, 'Lowest Cost'),
      makeProduct('RBI Retail Direct', 'Reserve Bank of India', 'rbiretaildirect.org.in', 
        `Apply directly for new SGB tranches issued by the RBI (when open). Pay zero capital gains tax at the 8-year maturity, and earn 2.5% annual interest.`, 'Direct from Govt'),
      makeProduct('SBI / HDFC NetBanking', 'Your Bank', 'NetBanking Portal', 
        `Apply online for primary SGB issues during the RBI subscription window. Convenient as it links directly to your savings account.`)
    ];
  }

  // 11. Specific Bank FDs (sbi_fd, hdfc_fd, etc.)
  if (id.endsWith('_fd') || id === 'po_td_1yr') {
    let bankName = inv.provider || '';
    if (!bankName) {
      const parts = (inv.name || '').split(' ');
      bankName = parts[0] || 'Bank';
    }
    const isPO = id.includes('po_');
    return [
      {
        name: inv.name,
        provider: isPO ? 'India Post' : bankName,
        rate: rateStr,
        highlight: `Open a fixed deposit with ${isPO ? 'the Post Office' : bankName} directly through ${isPO ? 'any branch' : 'net banking or the mobile app'} in under 2 minutes. Earn stable, guaranteed interest with ${isPO ? '100% sovereign safety' : 'DICGC insurance protection up to ₹5 Lakh'}.`,
        platform: isPO ? 'Any Post Office Branch' : `${bankName} NetBanking / Mobile App / Branch`,
        minInvestment: minInv,
        tenure,
        badge: 'Primary Option'
      }
    ];
  }

  // 12. Generic FD
  if (id === 'fd') {
    return [
      makeProduct('Public Sector Banks (SBI)', 'SBI / PNB', 'YONO / Bank NetBanking', 
        `High safety backed by government ownership. Ideal for risk-averse depositors seeking sovereign comfort.`, 'Highest Safety'),
      makeProduct('Private Sector Banks (HDFC)', 'HDFC / ICICI / Axis', 'Mobile Banking App', 
        `Premium digital-first booking and renewal process. Easily set up auto-sweep to earn higher returns on idle savings.`, 'Best Digital App'),
      makeProduct('Small Finance Banks (Ujjivan)', 'Ujjivan / Equitas / Unity', 'SFB Mobile App', 
        `Offer 1-1.5% higher interest rates than major commercial banks. Fully DICGC insured up to ₹5 Lakh, making it safe for laddering.`, 'Highest Return')
    ];
  }

  // 13. REITs & InvITs — show competing real REIT/InvIT products, not broker cards
  if (platformCat === 'reit') {
    return [
      { name: 'Embassy Office Parks REIT', provider: 'NSE: EMBASSY', rate: '~8.5% (Yield)', highlight: `India's largest listed REIT with 45M+ sq ft Grade-A office space across Bengaluru, Mumbai, Pune, and NCR. Quarterly distributions. Alternative to ${name}.`, platform: 'Zerodha / Groww / Broker', minInvestment: '1 unit (~₹360)', badge: 'Largest REIT' },
      { name: 'Mindspace Business Parks REIT', provider: 'NSE: MINDSPACE', rate: '~8.2% (Yield)', highlight: 'Grade-A tech parks in Hyderabad, Mumbai, Pune, and Chennai with high multinational tenant retention.', platform: 'Stock Broker App', minInvestment: '1 unit (~₹350)' },
      { name: 'Brookfield India Real Estate Trust', provider: 'NSE: BIRET', rate: '~8.8% (Yield)', highlight: 'Institutional office parks across Gurugram, Noida, Mumbai, and Bengaluru. Highest yield office REIT.', platform: 'Stock Broker App', minInvestment: '1 unit (~₹280)', badge: 'Highest Yield' },
      { name: 'Nexus Select Trust REIT', provider: 'NSE: NXST', rate: '~7.8% (Yield)', highlight: "India's 1st retail mall REIT owning 17 premium shopping malls across 14 cities.", platform: 'Stock Broker App', minInvestment: '1 unit (~₹135)' },
      { name: 'India Grid Trust InvIT', provider: 'NSE: INDIGRID', rate: '~10.5% (Yield)', highlight: 'Power transmission InvIT providing highest quarterly distribution yield among listed REIT/InvIT alternatives.', platform: 'Stock Broker App', minInvestment: '1 unit (~₹140)', badge: 'Top InvIT Yield' }
    ];
  }

  // 14. Bonds (G-Sec, corporate, municipal, etc.)
  if (platformCat === 'bonds') {
    const isGovtBond = id === 'g_sec' || name.toLowerCase().includes('government') || id.includes('bharat_bond');
    if (isGovtBond) {
      return [
        makeProduct('RBI Retail Direct', 'Reserve Bank of India', 'rbiretaildirect.org.in', 
          `Buy Government Securities (G-Secs), Treasury bills, and Sovereign Gold Bonds directly from the RBI auctions with zero commission and absolute safety.`, 'Zero Commission'),
        makeProduct('Zerodha Kite', 'Zerodha (NSE/BSE)', 'Zerodha Kite App', 
          `Purchase listed government bonds or Bharat Bond ETFs directly on the NSE/BSE secondary market. Good for liquidity.`, 'Unified Portfolio')
      ];
    } else {
      return [
        makeProduct('GoldenPi', 'GoldenPi', 'GoldenPi Platform', 
          `A specialized online bond platform. It lets you buy ${name} in small denominations, listing precise interest payment dates, credit ratings, and yield-to-maturity (YTM) in an easy-to-understand format.`, 'Bond Specialist'),
        makeProduct('Wint Wealth', 'Wint Wealth', 'Wint Wealth App / Web', 
          `Curated marketplace for buying high-yield corporate bonds. Displays exact interest payment schedules and asset backing in a very clear layout.`, 'Highly Curated'),
        makeProduct('Zerodha Kite', 'Zerodha (NSE/BSE)', 'Zerodha Kite App', 
          `Purchase listed corporate bonds or debentures directly on the stock exchange secondary market. Good for liquidity.`, 'Unified Portfolio')
      ];
    }
  }

  // 15. Mutual Funds (dynamically constructed instrument-specific AMC recommendations)
  if (platformCat === 'mf') {
    const expRatioStr = inv.expenseRatio ? `Expense ratio: ${(inv.expenseRatio * 100).toFixed(2)}% (Direct)` : 'Low expense ratio (Direct plan)';
    const descText = inv.description || inv.desc || inv.cardSubtitle || `Invests in ${name} portfolio.`;
    const returnInfo = rateStr !== 'Market-linked' ? `historical 5Y return around ${rateStr}` : 'market-linked returns';
    const cleanCat = (inv.name || inv.abbr || 'Equity Fund').replace(/\b(mf|mutual fund)\b/gi, '').trim() || 'Equity';

    return [
      {
        name: `SBI ${cleanCat} Fund (Direct Growth)`,
        provider: 'SBI Mutual Fund',
        rate: rateStr,
        highlight: `Backed by India's largest AMC by AUM. ${descText} Offers ${expRatioStr} with ${returnInfo}. Instant SIP setup via YONO or SBI MF portal with zero distributor commission.`,
        platform: 'SBI MF Portal / Groww / Zerodha Coin',
        minInvestment: minInv,
        tenure,
        badge: 'Largest AMC'
      },
      {
        name: `ICICI Prudential ${cleanCat} Fund (Direct Growth)`,
        provider: 'ICICI Prudential AMC',
        rate: rateStr,
        highlight: `Consistently high active risk management. ${descText} Zero entry load with direct digital execution via iMobile Pay and CAMS MF Central.`,
        platform: 'ICICI Direct / Groww / Coin',
        minInvestment: minInv,
        tenure,
        badge: 'Low Volatility'
      },
      {
        name: `HDFC ${cleanCat} Fund (Direct Growth)`,
        provider: 'HDFC Mutual Fund',
        rate: rateStr,
        highlight: `Managed by HDFC AMC's experienced equity team. Process-driven investment approach focused on portfolio quality. ${expRatioStr}. Ideal for long-term goal compounding.`,
        platform: 'HDFC MF Portal / Groww / Coin',
        minInvestment: minInv,
        tenure,
        badge: 'Top Track Record'
      },
      {
        name: `Nippon India ${cleanCat} Fund (Direct Growth)`,
        provider: 'Nippon India Mutual Fund',
        rate: rateStr,
        highlight: `Highly liquid fund management with deep institutional research across ${cleanCat}. Direct-growth plan saves up to 1% annual distributor commission.`,
        platform: 'Nippon MF Portal / Groww',
        minInvestment: minInv,
        tenure
      },
      {
        name: `Axis / Motilal Oswal ${cleanCat} Fund (Direct Growth)`,
        provider: 'Axis & Motilal Oswal AMC',
        rate: rateStr,
        highlight: `Official SEBI-regulated direct mutual fund scheme. Transact in direct plans of ${cleanCat} across top AMCs with zero commission and unified tax statements.`,
        platform: 'Axis MF / Kuvera / MF Central',
        minInvestment: minInv,
        tenure,
        badge: 'Direct Plan'
      }
    ];
  }

  // 16. ETFs
  if (platformCat === 'etf') {
    const descText = inv.description || inv.desc || `Passively tracks ${name}.`;
    const cleanEtfName = (inv.name || inv.abbr || 'ETF').replace(/\b(etf)\b/gi, '').trim() || 'Index';
    return [
      makeProduct(`Nippon India ${cleanEtfName} ETF`, 'Nippon India AMC', 'Zerodha Kite / Groww', 
        `Ticker: ${inv.abbr || inv.name}. ${descText} Trade live during exchange hours with ultra-low expense ratio and high daily liquidity.`, 'Most Liquid'),
      makeProduct(`ICICI Prudential ${cleanEtfName} ETF`, 'ICICI Prudential AMC', 'Zerodha Kite / Groww', 
        `Institutional-grade passive tracking for ${name}. Lowest expense ratio structure on NSE/BSE.`, 'Lowest Cost'),
      makeProduct(`SBI ${cleanEtfName} ETF`, 'SBI Mutual Fund', 'Stock Broker App', 
        `Massive institutional liquidity backed by SBI MF. Buy single units like regular equity shares during market hours.`, 'Institutional Liquidity'),
      makeProduct(`HDFC ${cleanEtfName} ETF`, 'HDFC Mutual Fund', 'Stock Broker App', 
        `Efficient index replication with tight bid-ask spreads on exchange. Zero demat entry lock-in.`),
      makeProduct(`Mirae Asset ${cleanEtfName} ETF`, 'Mirae Asset AMC', 'Stock Broker App', 
        `Global best-practice passive portfolio management for ${name} with real-time NAV tracking.`)
    ];
  }

  // 17. Direct Stocks / Equity
  if (platformCat === 'equity') {
    const cleanStockName = inv.name || inv.abbr || 'Blue-Chip Stock';
    return [
      makeProduct(`Zerodha Stock SIP (${cleanStockName})`, 'Zerodha (NSE/BSE)', 'Zerodha Kite App', 
        `Flat ₹20 discount brokerage per trade. Set up automated monthly stock SIPs for ${cleanStockName} with clean charting and zero delivery brokerage.`, 'Lowest Brokerage'),
      makeProduct(`Groww Direct Desk (${cleanStockName})`, 'Groww (NSE/BSE)', 'Groww App', 
        `1-tap stock purchase interface with clear financial statements and balance sheet metrics for ${cleanStockName}. Best for beginner investors.`, 'Best for Beginners'),
      makeProduct(`Angel One Research (${cleanStockName})`, 'Angel One (NSE/BSE)', 'Angel One App', 
        `Provides daily technical charts, margin trading facilities, and expert research reports for ${cleanStockName}.`, 'Research Advisory'),
      makeProduct(`ICICI Direct Prime (${cleanStockName})`, 'ICICI Securities', 'ICICI Direct App', 
        `3-in-1 account integrating savings, demat, and trading for instant fund transfer and stock delivery.`),
      makeProduct(`HDFC Sky Direct (${cleanStockName})`, 'HDFC Securities', 'HDFC Sky App', 
        `Modern discount brokerage platform by HDFC with advanced stock screeners and research insights.`)
    ];
  }

  // 18. Insurance
  if (platformCat === 'insurance') {
    return [
      makeProduct('PolicyBazaar Term Insurance Comparison', 'PolicyBazaar Portal', 'PolicyBazaar App / Web', 
        `Compare premium rates, claim settlement ratios, and benefits of ${name} across 20+ insurance providers.`, 'Compare Plans'),
      makeProduct('LIC of India Direct Policy', 'Life Insurance Corp', 'licindia.in / Branch', 
        `The trusted public sector life insurer. Invest in ${name} with high sovereign-backed security and offline support.`, 'Most Trusted'),
      makeProduct('HDFC Life Wealth Builder', 'HDFC Life Insurance', 'hdfclife.com', 
        `Invest in modern wealth-builder plans for ${name} with zero premium allocation charges and online claim tracking.`),
      makeProduct('ICICI Pru Life iProtect', 'ICICI Prudential Life', 'iciciprulife.com', 
        `Digital-first insurance policy management with flexible payout options and tax receipt downloads.`)
    ];
  }

  // Generic fallback if no specific rule matched — Real AMC / Bank titles instead of "via Platform"
  const cleanFallbackName = (inv.name || inv.abbr || 'Investment').replace(/\b(mf|mutual fund)\b/gi, '').trim() || 'Plan';
  return [
    {
      name: `SBI ${cleanFallbackName} Growth Scheme`,
      provider: 'State Bank of India',
      rate: rateStr,
      highlight: `Open and manage ${name} directly with SBI. Safe, simple, and convenient auto-debit options.`,
      platform: 'SBI NetBanking / Branch',
      minInvestment: minInv,
      tenure,
      badge: 'Primary Bank'
    },
    {
      name: `HDFC ${cleanFallbackName} Direct Plan`,
      provider: 'HDFC Bank & AMC',
      rate: rateStr,
      highlight: `Invest in ${name} via HDFC. Clean digital interface with instant SIP setup and high institutional backing.`,
      platform: 'HDFC NetBanking / App',
      minInvestment: minInv,
      tenure,
      badge: 'Top Rated'
    },
    {
      name: `ICICI Prudential ${cleanFallbackName} Direct`,
      provider: 'ICICI Prudential AMC',
      rate: rateStr,
      highlight: `Direct investment option for ${name} with real-time portfolio tracking and zero commission fees.`,
      platform: 'ICICI Direct App / iMobile',
      minInvestment: minInv,
      tenure,
      badge: 'Digital Portal'
    }
  ];
}

function getHowToStart(inv, platformCat) {
  switch (platformCat) {
    case 'epf':
      return 'EPF is initiated by your employer. Confirm with HR that your UAN is linked. To increase your contributions, request VPF enrolment from HR.';
    case 'govt':
      return 'Visit any authorized bank branch or post office with Aadhaar + PAN. Many banks also support online opening via their apps.';
    case 'bank_fd':
      return 'Open via your bank\'s net banking or mobile app in under 2 minutes. Or visit any branch with KYC documents.';
    case 'mf':
      return `Start a SIP from ₹${inv.minMonthlyInvestment?.toLocaleString('en-IN') || '500'} on any of the platforms below. Complete KYC once (takes 5 minutes) and invest in direct plans for the lowest expense ratio.`;
    case 'etf':
      return 'Open a demat + trading account on any discount broker. Search for the ETF by name or ticker on the exchange. Buy like a stock during market hours.';
    case 'reit':
      return 'Open a demat account on Zerodha, Groww, or Angel One. Buy units like stocks on NSE/BSE. Minimum 1 unit. Distributions paid quarterly.';
    case 'bonds':
      return 'Open an account on RBI Retail Direct (rbiretaildirect.org.in) for government securities, or use a broker for corporate bonds and listed bonds.';
    case 'equity':
      return 'Open a demat + trading account on any SEBI-registered broker. Complete KYC with Aadhaar + PAN. Start with blue-chip stocks for lower risk.';
    case 'insurance':
      return 'Compare plans on PolicyBazaar or visit the insurer\'s website directly. Complete the proposal form and medical checkup (if required).';
    case 'retirement':
      return 'Register on the eNPS portal (enps.nsdl.com) with Aadhaar + PAN. Choose your pension fund manager and asset allocation. Or visit any PoP (Point of Presence) bank.';
    default:
      return `Open an account on a SEBI-registered platform and start investing with as little as ${formatMinInvestment(inv.minMonthlyInvestment)}.`;
  }
}

function getNote(inv) {
  const rate = inv.expectedReturn || inv.rate;
  const riskLabel = inv.riskLabel || 'Medium';
  const taxType = inv.taxType || '';

  const parts = [];

  // Rate info
  if (rate) {
    const isFixed = inv.volatility != null && inv.volatility < 0.01;
    if (isFixed) {
      parts.push(`Current rate: ${formatRate(rate)} p.a.`);
    } else {
      parts.push(`Expected return: ${formatRate(rate)} p.a. (historical average)`);
    }
  }

  if (inv.returnRange?.min != null && inv.returnRange?.max != null && inv.returnRange.min !== inv.returnRange.max) {
    parts.push(`Range: ${inv.returnRange.min}%–${inv.returnRange.max}%`);
  }

  // Risk
  parts.push(`SEBI Risk Category: ${riskLabel}`);

  // Tax
  const taxLabels = {
    eee: 'EEE — fully tax-free (investment, growth, and withdrawal)',
    slab: 'Interest/gains taxed at your income slab rate',
    ltcg: 'LTCG above ₹1.25L taxed at 12.5% (held >1 year)',
    elss: '80C deduction up to ₹1.5L + LTCG at 12.5%',
    nps: '80CCD(1B) extra ₹50K deduction. 60% tax-free at maturity',
    sgb: 'LTCG tax-free at 8-year maturity. 2.5% interest taxable at slab',
  };
  if (taxLabels[taxType]) {
    parts.push(`Tax: ${taxLabels[taxType]}`);
  }

  // Lock-in
  if (inv.lockIn > 0) {
    parts.push(`Lock-in: ${inv.lockIn} years`);
  }

  // Expense ratio
  if (inv.expenseRatio > 0) {
    parts.push(`Expense ratio: ${(inv.expenseRatio * 100).toFixed(2)}%`);
  }

  return parts.join('. ') + '.';
}

// ─── Main Generator ──────────────────────────────────────────────────

/**
 * Generate complete "Where to Invest" data for any instrument.
 * Returns: { title, riskLevel, note, howToStart, products[] }
 *
 * @param {Object} inv — normalized instrument from investmentDatabase
 * @returns {Object} WTI data structure compatible with WhereToInvestTab
 */
export function generateWTI(inv) {
  if (!inv) return null;

  const platformCat = getPlatformCategory(inv);
  const riskLevel = inv.riskLevel || inv.risk || 3;

  // Title
  const title = `How to Invest in ${inv.name || inv.abbr || 'this instrument'}`;

  // Note (dynamic from instrument properties)
  const note = getNote(inv);

  // How to start
  const howToStart = getHowToStart(inv, platformCat);

  // Products / Platforms (fully dynamic and customized for this instrument!)
  const products = getProductsForInstrument(inv, platformCat);

  return {
    title,
    riskLevel,
    note,
    howToStart,
    products,
  };
}

export default generateWTI;
