export const computeSuitabilityMatch = (inv, profile) => {
  if (!profile && !inv) return 85;
  if (!inv) return 70;
  let score = 65;

  const userRisk = profile?.riskCategory || profile?.risk_tolerance || 'Moderate';
  const instRisk = inv?.riskLabel || inv?.risk_level || inv?.riskLevel || inv?.dynamicData?.risk?.level || 'Medium';

  if (['Conservative', 'Low', 'Very Low'].includes(userRisk)) {
    if (['Very Low', 'Low'].includes(instRisk)) score += 25;
    else if (['Low-Medium', 'Medium-Low'].includes(instRisk)) score += 12;
    else if (['High', 'Very High'].includes(instRisk)) score -= 30;
  } else if (['Moderate', 'Medium'].includes(userRisk)) {
    if (['Low-Medium', 'Medium-Low', 'Medium', 'Moderately High'].includes(instRisk)) score += 22;
    else if (['Low', 'Very Low'].includes(instRisk)) score += 10;
    else if (instRisk === 'Very High') score -= 15;
  } else if (['Aggressive', 'High', 'Very High'].includes(userRisk)) {
    if (['High', 'Very High', 'Moderately High'].includes(instRisk)) score += 25;
    else if (['Medium', 'Low-Medium'].includes(instRisk)) score += 12;
    else if (['Very Low', 'Low'].includes(instRisk)) score -= 15;
  }

  const rate = Number(inv?.rate || inv?.expectedReturn || inv?.nominalReturn || inv?.expected_return_max || inv?.dynamicData?.interestRates || 0);
  if (rate >= 20) score += 10;
  else if (rate >= 14) score += 6;
  else if (rate >= 9) score += 3;
  else if (rate > 0 && rate <= 6) score -= 4;

  const horizon = Number(profile?.investment_horizon || profile?.horizon || profile?.investmentHorizon || 10);
  const lockIn = inv?.lock_in_years !== undefined ? inv.lock_in_years : (inv?.lockIn !== undefined ? inv.lockIn : (inv?.dynamicData?.liquidity?.lockIn || 0));
  if (lockIn > horizon) score -= 35;
  else if (horizon >= 7 && rate >= 12) score += 8;
  else if (horizon <= 3 && lockIn === 0) score += 8;

  const goals = profile?.investment_goals || profile?.goals || [];
  const instCat = (inv?.category || inv?.cat || inv?.assetClass || '').toLowerCase();
  const instId = (inv?.id || '').toLowerCase();
  const isLiquid = lockIn === 0 || instCat.includes('liquid') || instCat.includes('savings') || instId.includes('savings');

  if (goals.includes('Emergency Fund')) {
    if (isLiquid) score += 18;
    else if (lockIn >= 3) score -= 25;
  }
  if (goals.includes('Tax Saving')) {
    const is80C = inv?.taxType === 'elss' || inv?.taxType === 'eee' || inv?.taxType === 'nps' || inv?.tax_benefit;
    if (is80C) score += 12;
  }
  if (goals.includes('Retirement')) {
    if (instCat.includes('equity') || instCat.includes('nps') || instId.includes('ppf') || horizon >= 10) score += 10;
  }

  const age = Number(profile?.age || 35);
  if (age >= 60) {
    if (['Very Low', 'Low'].includes(instRisk) || instId.includes('scss') || instId.includes('fd')) score += 12;
    else if (['High', 'Very High'].includes(instRisk)) score -= 15;
  } else if (age < 35 && horizon >= 5 && (rate >= 11 || instCat.includes('equity'))) {
    score += 6;
  }

  const taxRegime = (profile?.taxRegime || profile?.tax_regime || 'new').toLowerCase();
  const taxType = inv?.taxType || inv?.dynamicData?.taxType || '';
  if (taxRegime === 'old' && (taxType === 'eee' || taxType === 'elss' || taxType === 'nps')) score += 6;
  else if (taxRegime === 'new' && taxType === 'eee') score += 6;

  const expenseRatio = Number(inv?.expenseRatio || inv?.dynamicData?.expenseRatio || 0);
  if (expenseRatio > 0 && expenseRatio <= 0.3) score += 5;

  return Math.min(99, Math.max(45, score));
};
