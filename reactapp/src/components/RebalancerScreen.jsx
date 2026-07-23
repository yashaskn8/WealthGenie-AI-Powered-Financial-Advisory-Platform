import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Scale, HelpCircle, ShieldCheck, CheckCircle2, Check, TrendingUp, Calendar, Sparkles, ArrowRight, Shield, Wallet, PieChart } from 'lucide-react';
import { formatINR } from '../utils/indianNumberFormat';
import JargonTooltip from './JargonTooltip';
import * as api from '../services/api';
import { localToBackendInstrument } from '../utils/instrumentTypeMap';
import './RebalancerScreen.css';

const RISK_COLORS = {
  1: '#10b981', 2: '#34d399', 3: '#f59e0b', 4: '#ef4444', 5: '#dc2626',
  'Very Low': '#10b981', 'Low': '#34d399', 'Low-Medium': '#a3e635', 'Medium-Low': '#fbbf24',
  'Medium': '#f59e0b', 'High': '#ef4444', 'Very High': '#dc2626'
};

const getRiskLabelString = (inv) => {
  if (!inv) return 'Medium';
  if (inv.riskLabel) return inv.riskLabel;
  if (inv.risk_level) return inv.risk_level;
  if (typeof inv.risk === 'string') return inv.risk;
  const numToLabel = { 1: 'Very Low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Very High' };
  return numToLabel[inv.risk] || 'Medium';
};

const AnimatedNumber = ({ value, duration = 800 }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const end = parseInt(value) || 0;
    const startTime = performance.now();
    const startVal = 0;

    if (startVal === end) return;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      if (elapsed >= duration) {
        setDisplayValue(end);
      } else {
        const progress = elapsed / duration;
        const easeProgress = progress * (2 - progress);
        setDisplayValue(Math.round(startVal + (end - startVal) * easeProgress));
        requestAnimationFrame(animate);
      }
    };

    const raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{displayValue}</>;
};

const AnimatedCurrency = ({ value, duration = 800 }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = displayValue;
    const end = parseInt(value) || 0;
    if (start === end) return;

    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      if (elapsedTime >= duration) {
        setDisplayValue(end);
      } else {
        const progress = elapsedTime / duration;
        const easeProgress = progress * (2 - progress);
        const currentVal = Math.round(start + (end - start) * easeProgress);
        setDisplayValue(currentVal);
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <>{formatINR(displayValue)}</>;
};


/**
 * Build allocation percentages from recommendation list.
 * Normalizes so sum === 100.
 */
const buildAllocations = (recs, savings) => {
  const allocs = {};
  let sum = 0;
  const safeSavings = Number(savings) || 12000;
  const safeRecs = recs || [];

  safeRecs.forEach(inv => {
    if (!inv || !inv.id) return;
    const allocVal = Number(inv.monthly_allocation) || 0;
    const pct = safeSavings > 0 ? (allocVal / safeSavings) * 100 : 0;
    allocs[inv.id] = pct;
    sum += pct;
  });

  // Normalize to 100%
  if (sum > 0 && Math.abs(sum - 100) > 0.01) {
    Object.keys(allocs).forEach(k => {
      allocs[k] = (allocs[k] / sum) * 100;
    });
  } else if (sum === 0 && safeRecs.length > 0) {
    const count = safeRecs.filter(inv => inv && inv.id).length;
    safeRecs.forEach(inv => {
      if (inv && inv.id) {
        allocs[inv.id] = 100 / count;
      }
    });
  }
  return allocs;
};

const clientSipFV = (monthlyInvestment, annualRate, years) => {
  const r = annualRate / 12 / 100;
  const n = years * 12;
  if (r <= 0) return monthlyInvestment * n;
  return monthlyInvestment * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
};

const clientPortfolioFallback = (totalSavings, recs, allocations, years = 10) => {
  let weightedRate = 0;
  let weightedVol = 0;
  let totalPct = 0;

  recs.forEach(inv => {
    const pct = allocations[inv.id] || 0;
    if (pct > 0) {
      weightedRate += (inv.rate || 10.0) * pct;
      let vol = 0.15;
      const category = (inv.category || inv.cat || '').toLowerCase();
      if (inv.id === 'nifty_etf' || category.includes('etf')) {
        vol = 0.16;
      } else if (inv.id === 'index_mf' || inv.id === 'equity_mf' || inv.id === 'elss' || category.includes('equity')) {
        vol = 0.18;
      } else if (inv.id === 'debt_mf' || inv.id === 'liquid_mf' || category.includes('debt') || category.includes('fd')) {
        vol = 0.03;
      }
      weightedVol += vol * pct;
      totalPct += pct;
    }
  });

  const r = totalPct > 0 ? (weightedRate / totalPct) : 10.0;
  const vol = totalPct > 0 ? (weightedVol / totalPct) : 0.15;

  const p50 = clientSipFV(totalSavings, r, years);
  const sigmaTotal = vol * Math.sqrt(years) * 0.6;
  const p10 = p50 * Math.exp(-1.282 * sigmaTotal);
  const p90 = p50 * Math.exp(1.282 * sigmaTotal);

  return {
    p10: Math.round(p10),
    p50: Math.round(p50),
    p90: Math.round(p90),
    isFallback: true
  };
};

const PRESET_ALLOCATIONS = {
  Safe: { equity: 20, etf: 30, debt: 50 },
  Balanced: { equity: 45, etf: 35, debt: 20 },
  Growth: { equity: 65, etf: 25, debt: 10 },
  'High Growth': { equity: 80, etf: 15, debt: 5 }
};

const applyPreset = (presetName, recs) => {
  const target = PRESET_ALLOCATIONS[presetName];
  if (!target) return null;

  const newAllocs = {};
  let totalWeight = 0;

  recs.forEach(inv => {
    let type = 'debt'; // default fallback
    const id = inv.id;
    const category = inv.category || inv.cat || '';
    if (id === 'nifty_etf' || category.includes('ETF')) {
      type = 'etf';
    } else if (id === 'index_mf' || id === 'equity_mf' || id === 'elss' || category.includes('Equity')) {
      type = 'equity';
    } else if (id === 'debt_mf' || id === 'liquid_mf' || category.includes('Debt')) {
      type = 'debt';
    }
    const val = target[type] || 0;
    newAllocs[id] = val;
    totalWeight += val;
  });

  // Normalize to exactly 100%
  if (totalWeight > 0) {
    Object.keys(newAllocs).forEach(k => {
      newAllocs[k] = (newAllocs[k] / totalWeight) * 100;
    });
  } else if (recs.length > 0) {
    recs.forEach(inv => {
      newAllocs[inv.id] = 100 / recs.length;
    });
  }

  return newAllocs;
};

const detectPreset = (allocations, recs) => {
  for (const presetName of ['Safe', 'Balanced', 'Growth', 'High Growth']) {
    const targetAllocs = applyPreset(presetName, recs);
    if (!targetAllocs) continue;
    let match = true;
    for (const id of Object.keys(targetAllocs)) {
      if (Math.abs((allocations[id] || 0) - (targetAllocs[id] || 0)) > 0.5) {
        match = false;
        break;
      }
    }
    if (match) return presetName;
  }
  return 'Custom';
};

const RebalancerScreen = ({ profile, recommendations, onSave }) => {
  const totalSavings = Number(profile?.monthly_savings) || 12000;
  const recs = useMemo(() => recommendations || [], [recommendations]);

  const [allocations, setAllocations] = useState(() => buildAllocations(recs, totalSavings));
  const [preset, setPreset] = useState(() => detectPreset(allocations, recs));
  const [prevRecs, setPrevRecs] = useState(recommendations);

  // The original recommended allocations — used to compute balance score
  const originalAllocations = useMemo(() => buildAllocations(recs, totalSavings), [recs, totalSavings]);

  // Sync allocations when recommendations change during render
  if (recommendations !== prevRecs) {
    setPrevRecs(recommendations);
    const newAllocs = buildAllocations(recommendations || [], totalSavings);
    setAllocations(newAllocs);
    setPreset(detectPreset(newAllocs, recommendations || []));
  }

  const [loadingProjection, setLoadingProjection] = useState(false);
  const [projectionData, setProjectionData] = useState(null);
  const [projectionError, setProjectionError] = useState(null);

  const fetchProjections = useCallback(async (currentAllocs) => {
    try {
      setLoadingProjection(true);
      setProjectionError(null);
      
      const profileId = profile?.profileId;
      if (!profileId) {
        throw new Error("No profile ID available");
      }

      // Map local IDs to backend keys
      const keys = recs.map(inv => localToBackendInstrument(inv.id));
      const response = await api.getProjections(profileId, keys, totalSavings, [10]);
      setProjectionData(response);
    } catch (err) {
      console.warn("Backend projection failed, using client-side fallback:", err.message);
      setProjectionError(err.message);
    } finally {
      setLoadingProjection(false);
    }
  }, [profile?.profileId, recs, totalSavings]);

  const [loadingMC, setLoadingMC] = useState(false);
  const [mcData, setMcData] = useState(null);
  const [mcError, setMcError] = useState(null);

  const fetchMonteCarlo = useCallback(async (currentAllocs) => {
    try {
      setLoadingMC(true);
      setMcError(null);
      
      const profileId = profile?.profileId;
      if (!profileId) {
        throw new Error("No profile ID available");
      }

      const activeRecs = recs.filter(inv => (currentAllocs[inv.id] || 0) > 0);
      const promises = activeRecs.map(async (inv) => {
        const pct = currentAllocs[inv.id] || 0;
        const amt = Math.round((pct / 100) * totalSavings / 100) * 100;
        const backendKey = localToBackendInstrument(inv.id);
        const result = await api.runMonteCarlo(backendKey, amt, 10, null, profileId);
        return { id: inv.id, result };
      });

      const results = await Promise.all(promises);
      const map = {};
      results.forEach(r => {
        map[r.id] = r.result;
      });
      setMcData(map);
    } catch (err) {
      console.warn("Monte Carlo fetch failed, using client-side fallback:", err.message);
      setMcError(err.message);
    } finally {
      setLoadingMC(false);
    }
  }, [profile?.profileId, recs, totalSavings]);

  // Debounce backend requests
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProjections(allocations);
      fetchMonteCarlo(allocations);
    }, 300);

    return () => clearTimeout(timer);
  }, [allocations, fetchProjections, fetchMonteCarlo]);

  const projectionResults = useMemo(() => {
    let wealth10y = 0;
    let fallbackUsed = false;

    if (projectionData && !projectionError) {
      const yearIdx = projectionData.labels?.indexOf(10) ?? -1;
      if (yearIdx !== -1) {
        recs.forEach(inv => {
          const pct = allocations[inv.id] || 0;
          const backendKey = localToBackendInstrument(inv.id);
          const series = projectionData.series?.find(s => s.name === backendKey);
          if (series && series.data && series.data[yearIdx] !== undefined) {
            wealth10y += (pct / 100) * series.data[yearIdx];
          } else {
            const rate = inv.rate || 7.0;
            const amt = (pct / 100) * totalSavings;
            wealth10y += clientSipFV(amt, rate, 10);
          }
        });
      } else {
        fallbackUsed = true;
      }
    } else {
      fallbackUsed = true;
    }

    if (fallbackUsed) {
      recs.forEach(inv => {
        const pct = allocations[inv.id] || 0;
        const rate = inv.rate || 7.0;
        const amt = (pct / 100) * totalSavings;
        wealth10y += clientSipFV(amt, rate, 10);
      });
    }

    const totalInvested10y = totalSavings * 12 * 10;
    const estReturns = Math.max(0, wealth10y - totalInvested10y);

    return {
      wealth10y: Math.round(wealth10y),
      totalInvested10y,
      estReturns: Math.round(estReturns),
      isFallback: fallbackUsed
    };
  }, [projectionData, projectionError, allocations, recs, totalSavings]);

  const thermometerRisk = useMemo(() => {
    let weightedRisk = 0;
    let totalAlloc = 0;
    recs.forEach(inv => {
      const pct = allocations[inv.id] || 0;
      const id = inv.id;
      const category = inv.category || inv.cat || '';
      let invRisk = 3;
      if (id === 'nifty_etf' || category.includes('ETF')) {
        invRisk = 3;
      } else if (id === 'index_mf' || id === 'equity_mf' || id === 'elss' || category.includes('Equity')) {
        invRisk = 5;
      } else if (id === 'debt_mf' || id === 'liquid_mf' || category.includes('Debt')) {
        invRisk = 1;
      }
      weightedRisk += invRisk * pct;
      totalAlloc += pct;
    });
    const avgRisk = totalAlloc > 0 ? (weightedRisk / totalAlloc) : 3;
    const positionPct = ((avgRisk - 1) / 4) * 100;

    let label = 'Balanced';
    let color = '#34d399';
    let desc = 'A balanced approach with moderate fluctuations for steady growth.';
    if (avgRisk < 1.8) {
      label = 'Very Safe';
      color = '#10b981';
      desc = 'Expect steady, slow growth with minimum volatility.';
    } else if (avgRisk < 2.5) {
      label = 'Safe';
      color = '#34d399';
      desc = 'Expect stable returns with minor ups and downs.';
    } else if (avgRisk < 3.2) {
      label = 'Balanced';
      color = '#f59e0b';
      desc = 'A balanced approach with moderate fluctuations for steady growth.';
    } else if (avgRisk < 4.0) {
      label = 'Growth';
      color = '#f97316';
      desc = 'Focused on higher growth with noticeable ups and downs.';
    } else {
      label = 'High Growth';
      color = '#ef4444';
      desc = 'Expect larger ups and downs, but higher long-term growth.';
    }

    return { avgRisk, positionPct, label, color, desc };
  }, [allocations, recs]);

  const scenarioResults = useMemo(() => {
    let p10 = 0;
    let p50 = 0;
    let p90 = 0;
    let fallbackUsed = false;

    if (mcData && !mcError) {
      recs.forEach(inv => {
        const pct = allocations[inv.id] || 0;
        if (pct > 0) {
          const result = mcData[inv.id];
          if (result && result.percentile_summary) {
            p10 += result.percentile_summary.p10 || 0;
            p50 += result.percentile_summary.p50 || 0;
            p90 += result.percentile_summary.p90 || 0;
          } else {
            const rate = inv.rate || 7.0;
            const amt = (pct / 100) * totalSavings;
            const instrumentP50 = clientSipFV(amt, rate, 10);
            p10 += instrumentP50 * 0.7;
            p50 += instrumentP50;
            p90 += instrumentP50 * 1.4;
          }
        }
      });
      if (p50 === 0) {
        fallbackUsed = true;
      }
    } else {
      fallbackUsed = true;
    }

    if (fallbackUsed) {
      return clientPortfolioFallback(totalSavings, recs, allocations, 10);
    }

    return {
      p10: Math.round(p10),
      p50: Math.round(p50),
      p90: Math.round(p90),
      isFallback: false
    };
  }, [mcData, mcError, allocations, recs, totalSavings]);

  const showEmergencyWarning = useMemo(() => {
    let safePct = 0;
    recs.forEach(inv => {
      const pct = allocations[inv.id] || 0;
      const category = (inv.category || inv.cat || '').toLowerCase();
      const id = inv.id;
      if (id === 'debt_mf' || id === 'liquid_mf' || id === 'fd' || id === 'ppf' || id === 'rbi_bonds' || category.includes('debt') || category.includes('liquid') || category.includes('guaranteed') || category.includes('fixed')) {
        safePct += pct;
      }
    });
    return safePct < 15;
  }, [allocations, recs]);

  const summaryAllocation = useMemo(() => {
    let equitySum = 0;
    let etfSum = 0;
    let debtSum = 0;

    recs.forEach(inv => {
      const pct = allocations[inv.id] || 0;
      const category = (inv.category || inv.cat || '').toLowerCase();
      const id = inv.id.toLowerCase();
      if (id === 'nifty_etf' || category.includes('etf')) {
        etfSum += pct;
      } else if (id === 'index_mf' || id === 'equity_mf' || id === 'elss' || id.includes('smallcap') || id.includes('midcap') || category.includes('equity') || category.includes('elss')) {
        equitySum += pct;
      } else {
        debtSum += pct;
      }
    });

    return {
      equity: Math.round(equitySum),
      etf: Math.round(etfSum),
      debt: Math.round(debtSum)
    };
  }, [allocations, recs]);

  const horizon = Number(profile?.investment_horizon) || 10;

  const whyMixReasons = useMemo(() => {
    const age = Number(profile?.age) || 24;
    const goal = profile?.investment_goals?.[0] || profile?.goal_type || 'wealth-building';
    const friendlyGoal = goal.replace(/-/g, ' ');
    const reasons = [];

    if (age <= 28) {
      reasons.push(`You're only ${age}, so your investments have more time to grow and recover from market dips.`);
    } else if (age <= 45) {
      reasons.push(`At ${age}, you're in your peak earning years — a growth-oriented mix maximises compounding.`);
    } else {
      reasons.push(`At ${age}, a balanced allocation protects your capital while still beating inflation.`);
    }

    reasons.push(`Your monthly savings of ${formatINR(totalSavings)} comfortably support this SIP.`);
    reasons.push(`This mix is structured around your ${friendlyGoal} goal with a ${horizon}-year timeline.`);

    let hasSafeAssets = false;
    recs.forEach(inv => {
      const pct = allocations[inv.id] || 0;
      const cat = (inv.category || inv.cat || '').toLowerCase();
      if (pct > 0 && (inv.id === 'debt_mf' || inv.id === 'liquid_mf' || cat.includes('debt'))) {
        hasSafeAssets = true;
      }
    });
    if (hasSafeAssets) {
      reasons.push('Adding debt funds helps reduce volatility and cushions your portfolio in down markets.');
    }

    return reasons;
  }, [profile, totalSavings, horizon, allocations, recs]);

  // ─── Goals Integration for Investment Journey ──────────────────
  const [userGoals, setUserGoals] = useState([]);

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const goals = await api.getGoals();
        if (Array.isArray(goals)) setUserGoals(goals);
        else if (goals?.goals) setUserGoals(goals.goals);
      } catch (e) {
        // Goals not available — fallback milestones will be used
      }
    };
    fetchGoals();
  }, []);

  // Compute the weighted portfolio return rate from current allocations
  const weightedReturnRate = useMemo(() => {
    let totalRate = 0;
    let totalPct = 0;
    recs.forEach(inv => {
      const pct = allocations[inv.id] || 0;
      if (pct > 0) {
        totalRate += (inv.rate || 10) * pct;
        totalPct += pct;
      }
    });
    return totalPct > 0 ? totalRate / totalPct : 10;
  }, [allocations, recs]);

  const journeyMilestones = useMemo(() => {
    const age = Number(profile?.age) || 25;
    const goal = (profile?.investment_goals?.[0] || profile?.goal_type || 'wealth-building').toLowerCase().replace(/-/g, ' ');
    const milestones = [];

    // Helper: compute future value at N years
    const fvAt = (years) => Math.round(clientSipFV(totalSavings, weightedReturnRate, years));

    // If user has real goals, map them into journey milestones
    if (userGoals.length > 0) {
      userGoals.forEach(g => {
        const yrs = Number(g.target_years || g.years) || 5;
        const targetAmt = Number(g.target_amount) || fvAt(yrs);
        const name = g.name || g.goal_name || 'Your Goal';
        milestones.push({
          year: yrs,
          amount: fvAt(yrs),
          label: name,
          isGoal: true,
          targetAmount: targetAmt
        });
      });
    }

    // Generate default milestones based on profile
    const defaultMilestones = [];

    // Year 1 — Emergency fund
    defaultMilestones.push({
      year: 1,
      amount: fvAt(1),
      label: 'Emergency fund nearly complete'
    });

    // Year 3 — Profile-based
    if (age < 30) {
      defaultMilestones.push({ year: 3, amount: fvAt(3), label: 'Enough for a bike' });
    } else if (age < 40) {
      defaultMilestones.push({ year: 3, amount: fvAt(3), label: 'Car down payment ready' });
    } else {
      defaultMilestones.push({ year: 3, amount: fvAt(3), label: 'Children\'s education fund' });
    }

    // Year 5
    if (goal.includes('home') || goal.includes('house')) {
      defaultMilestones.push({ year: 5, amount: fvAt(5), label: 'Home down payment' });
    } else if (goal.includes('business') || goal.includes('startup')) {
      defaultMilestones.push({ year: 5, amount: fvAt(5), label: 'Startup seed fund ready' });
    } else if (age < 30) {
      defaultMilestones.push({ year: 5, amount: fvAt(5), label: 'Home down payment target' });
    } else {
      defaultMilestones.push({ year: 5, amount: fvAt(5), label: 'Major life milestone fund' });
    }

    // Year 10 — Link to projection
    defaultMilestones.push({
      year: 10,
      amount: projectionResults.wealth10y || fvAt(10),
      label: 'Current projection',
      highlight: true
    });

    // Year 20 — Retirement / long-term
    if (age + 20 >= 55) {
      defaultMilestones.push({ year: 20, amount: fvAt(20), label: 'Retirement corpus' });
    } else {
      defaultMilestones.push({ year: 20, amount: fvAt(20), label: 'Retirement corpus' });
    }

    // If we have real goals, merge with defaults to fill gaps
    if (milestones.length > 0) {
      // Add any default milestones that don't overlap with goal years
      const goalYears = new Set(milestones.map(m => m.year));
      defaultMilestones.forEach(dm => {
        if (!goalYears.has(dm.year)) {
          milestones.push(dm);
        }
      });
      milestones.sort((a, b) => a.year - b.year);
      return milestones.slice(0, 5); // Cap at 5 milestones
    }

    return defaultMilestones;
  }, [profile, totalSavings, weightedReturnRate, userGoals, projectionResults.wealth10y]);

  /**
   * Compute a simple balance score (0–100) by measuring how close
   * the user's current slider positions are to the initial recommendation.
   * 100 = perfect match, 0 = completely different.
   */
  const score = useMemo(() => {
    const ids = Object.keys(originalAllocations);
    if (ids.length === 0) return 100;

    let totalDrift = 0;
    ids.forEach(id => {
      const orig = originalAllocations[id] || 0;
      const curr = allocations[id] || 0;
      totalDrift += Math.abs(orig - curr);
    });

    // totalDrift ranges from 0 (perfect) to ~200 (complete opposite).
    // Map to a 0–100 score. Cap drift at 100 to avoid negatives.
    return Math.max(0, Math.round(100 - Math.min(totalDrift, 100)));
  }, [allocations, originalAllocations]);

  const riskScore = useMemo(() => {
    const userRisk = (profile?.risk_appetite || 'Medium').toLowerCase();
    if (preset === 'Safe') {
      return userRisk === 'low' ? 100 : userRisk === 'medium' ? 70 : 40;
    } else if (preset === 'Balanced') {
      return userRisk === 'medium' ? 100 : 80;
    } else if (preset === 'Growth') {
      return userRisk === 'high' ? 100 : userRisk === 'medium' ? 80 : 50;
    } else if (preset === 'High Growth') {
      return userRisk === 'high' ? 100 : userRisk === 'medium' ? 60 : 30;
    }

    let weightedRisk = 0;
    let totalAlloc = 0;
    recs.forEach(inv => {
      const pct = allocations[inv.id] || 0;
      const id = inv.id;
      const category = inv.category || inv.cat || '';
      let invRisk = 3;
      if (id === 'nifty_etf' || category.includes('ETF')) {
        invRisk = 3;
      } else if (id === 'index_mf' || id === 'equity_mf' || id === 'elss' || category.includes('Equity')) {
        invRisk = 5;
      } else if (id === 'debt_mf' || id === 'liquid_mf' || category.includes('Debt')) {
        invRisk = 1;
      }
      weightedRisk += invRisk * pct;
      totalAlloc += pct;
    });
    const avgRisk = totalAlloc > 0 ? (weightedRisk / totalAlloc) : 3;

    if (userRisk === 'low') {
      return avgRisk <= 2 ? 100 : Math.max(0, Math.round(100 - (avgRisk - 2) * 30));
    } else if (userRisk === 'high') {
      return avgRisk >= 4 ? 100 : Math.max(0, Math.round(100 - (4 - avgRisk) * 30));
    } else {
      return Math.max(0, Math.round(100 - Math.abs(avgRisk - 3) * 30));
    }
  }, [preset, allocations, recs, profile]);


  const goalScore = useMemo(() => {
    let equityPct = 0;
    Object.keys(allocations).forEach(id => {
      const pct = allocations[id] || 0;
      const inv = recs.find(r => r.id === id);
      const category = inv?.category || inv?.cat || '';
      if (id === 'nifty_etf' || id === 'index_mf' || id === 'equity_mf' || id === 'elss' || category.includes('Equity') || category.includes('ETF')) {
        equityPct += pct;
      }
    });

    if (horizon <= 3) {
      return Math.max(0, Math.round(100 - equityPct * 2));
    } else if (horizon >= 8) {
      return Math.max(0, Math.round(100 - Math.max(0, 30 - equityPct) * 2));
    } else {
      return Math.max(0, Math.round(100 - Math.abs(equityPct - 50) * 1.5));
    }
  }, [allocations, recs, profile, horizon]);

  const affordabilityScore = useMemo(() => {
    const income = Number(profile?.monthly_income) || 60000;
    if (income <= 0) return 100;
    const savings = Number(profile?.monthly_savings) || 12000;
    const pctOfIncome = (savings / income) * 100;
    if (pctOfIncome >= 20 && pctOfIncome <= 30) {
      return 100;
    } else if (pctOfIncome < 20) {
      return Math.max(0, Math.round(100 - (20 - pctOfIncome) * 4));
    } else {
      return Math.max(70, Math.round(100 - (pctOfIncome - 30) * 1));
    }
  }, [profile]);

  const recommendationMatch = useMemo(() => {
    const composite = (score * 0.6) + (riskScore * 0.2) + (goalScore * 0.1) + (affordabilityScore * 0.1);
    return Math.min(100, Math.max(0, Math.round(composite)));
  }, [score, riskScore, goalScore, affordabilityScore]);

  const statusColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const matchColor = recommendationMatch >= 90 ? '#10b981' : recommendationMatch >= 75 ? '#f59e0b' : '#ef4444';

  /**
   * Slider change handler - redistributes remaining % proportionally
   * among other instruments so total stays at 100%.
   */
  const handleSliderChange = useCallback((id, newPct) => {
    setPreset('Custom');
    setAllocations(prev => {
      const oldPct = prev[id] || 0;
      const diff = newPct - oldPct;
      const otherIds = Object.keys(prev).filter(k => k !== String(id));
      const otherTotal = otherIds.reduce((s, k) => s + (prev[k] || 0), 0);

      const newAllocs = { ...prev, [id]: newPct };

      if (otherTotal > 0) {
        otherIds.forEach(k => {
          const proportion = prev[k] / otherTotal;
          newAllocs[k] = Math.max(0, prev[k] - diff * proportion);
        });
      } else if (diff < 0 && otherIds.length > 0) {
        const split = Math.abs(diff) / otherIds.length;
        otherIds.forEach(k => {
          newAllocs[k] = split;
        });
      }

      // Re-normalize
      const total = Object.values(newAllocs).reduce((a, b) => a + b, 0);
      if (total > 0 && Math.abs(total - 100) > 0.01) {
        Object.keys(newAllocs).forEach(k => {
          newAllocs[k] = (newAllocs[k] / total) * 100;
        });
      }

      return newAllocs;
    });
  }, []);

  const handlePresetClick = useCallback((presetName) => {
    const newAllocs = applyPreset(presetName, recs);
    if (newAllocs) {
      setAllocations(newAllocs);
      setPreset(presetName);
      fetchProjections(newAllocs);
      fetchMonteCarlo(newAllocs);
    }
  }, [recs, fetchProjections, fetchMonteCarlo]);

  const handleSave = () => {
    const updated = recs.map(inv => {
      const pct = allocations[inv.id] || 0;
      return {
        ...inv,
        monthly_allocation: Math.round((pct / 100) * totalSavings / 100) * 100
      };
    });
    if (onSave) onSave(updated);
  };

  return (
    <div className="rebalancer-page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
      <div className="ambient-background">
        <div className="ambient-orb orb-1" />
        <div className="ambient-orb orb-2" />
        <div className="ambient-orb orb-3" />
      </div>

      {/* ─── Header ─── */}
      <motion.div
        className="page-header"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 100 }}
        style={{ marginBottom: '24px' }}
      >
        <div className="page-header-badge">
          <Scale size={12} />
          <span>Investment Mix</span>
        </div>
        <h1 className="page-title">
          Customize Your <span className="title-gradient">Investment Mix</span>
        </h1>
        <p className="page-subtitle">
          Decide how your monthly savings are split across different investments. Adjust the sliders below to match your comfort level.
        </p>
      </motion.div>

      {/* Two-Column Grid */}
      <div className="rebalancer-grid">
        
        <motion.div
          className="ai-recs-hero-card premium-glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="ai-recs-header">
            <div className="ai-recs-title-row">
              <div className="ai-recs-sparkle-bg">
                <Sparkles className="ai-recs-sparkle-icon" size={18} />
              </div>
              <div>
                <h3 className="ai-recs-title">AI Recommended Mix</h3>
                <p className="ai-recs-subtitle">Optimised for compounding growth</p>
              </div>
            </div>
            <span className="ai-recs-badge">Target Match</span>
          </div>

          <div className="ai-recs-body">
            {recs.map(inv => {
              const origPct = originalAllocations[inv.id] || 0;
              if (origPct <= 0) return null;
              const riskLabel = getRiskLabelString(inv);
              const color = RISK_COLORS[riskLabel] || RISK_COLORS[inv.risk] || '#818cf8';
              return (
                <div key={inv.id} className="ai-rec-item">
                  <div className="ai-rec-item-info">
                    <div className="ai-rec-item-left">
                      <span className="ai-rec-item-name">{inv.name}</span>
                      <span 
                        className="ai-rec-item-risk-tag"
                        style={{ color: color, background: `${color}15`, borderColor: `${color}25` }}
                      >
                        {riskLabel} Risk
                      </span>
                    </div>
                    <span className="ai-rec-item-pct" style={{ color: color }}>{origPct.toFixed(0)}%</span>
                  </div>
                  <div className="ai-rec-progress-track">
                    <div 
                      className="ai-rec-progress-bar" 
                      style={{ width: `${origPct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ai-recs-footer-container">
            <button
              type="button"
              onClick={() => {
                const targetAllocs = buildAllocations(recs, totalSavings);
                setAllocations(targetAllocs);
                setPreset(detectPreset(targetAllocs, recs));
                fetchProjections(targetAllocs);
                fetchMonteCarlo(targetAllocs);
              }}
              className="btn-ai-recommendation-premium"
            >
              <span>Apply AI Recommended Mix</span>
              <ArrowRight size={16} className="btn-ai-arrow" />
            </button>
            <div className="ai-recs-caption">
              ⚡ Instantly overwrites the current sliders with the recommended split.
            </div>
          </div>
        </motion.div>

          <motion.div
            className="rebal-sliders-container premium-glass"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
          >
            <div className="sliders-summary-header" style={{ marginBottom: 20 }}>
              <div className="sliders-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="sliders-header-label" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                  <JargonTooltip term="Asset Allocation">Your Investment Split</JargonTooltip>
                </span>
                <span className="sliders-total-badge" style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.82rem', color: '#38bdf8', fontWeight: 700 }}>
                  Total: 100%
                </span>
              </div>
              <p className="sliders-hint" style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 6, marginBottom: 0 }}>
                Drag any slider to change how much of your savings goes into each investment. The rest will adjust automatically to keep the total at 100%.
              </p>
            </div>

            <div className="preset-selector-row">
              {['Safe', 'Balanced', 'Growth', 'High Growth'].map(name => {
                const isActive = preset === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`preset-btn ${isActive ? 'active' : ''}`}
                    onClick={() => handlePresetClick(name)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {preset === 'Custom' && (
              <div className="custom-mix-badge-row">
                <span className="custom-mix-badge">
                  ⚠️ Custom Mix
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAllocations(originalAllocations);
                    setPreset(detectPreset(originalAllocations, recs));
                    fetchProjections(originalAllocations);
                  }}
                  className="btn-reset-ai"
                >
                  Reset to AI Mix
                </button>
              </div>
            )}

            {showEmergencyWarning && (
              <div className="emergency-warning-card">
                <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>⚠️</span>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fca5a5', marginBottom: '2px' }}>Low Safe Assets Warning</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
                    Your safe allocation (Debt/Liquid/FD) is below 15%. Consider keeping 3–6 months of expenses in a Liquid Fund or Fixed Deposit for emergencies before investing aggressively in equity.
                  </div>
                </div>
              </div>
            )}

            {/* ─── Monthly Money Breakdown ─── */}
            <div className="rupee-summary-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>Monthly Money Breakdown</span>
                <span style={{ color: '#f8fafc', fontSize: '0.9rem', fontWeight: 700 }}>Total: {formatINR(totalSavings)}/month</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recs.map(inv => {
                  const pct = allocations[inv.id] || 0;
                  const amt = Math.round((pct / 100) * totalSavings / 100) * 100;
                  if (amt <= 0) return null;
                  const riskLabel = inv.risk_level || inv.riskLabel || 'Medium';
                  const color = RISK_COLORS[riskLabel] || '#0ea5e9';
                  return (
                     <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem' }}>
                       <div style={{ width: '80px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color, transition: 'width 0.3s ease' }} />
                      </div>
                      <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1 }}>
                        {inv.name}
                      </span>
                      <span style={{ color: '#f8fafc', fontWeight: 700, minWidth: '70px', textAlign: 'right' }}>{formatINR(amt)}</span>
                      <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 600, minWidth: '36px', textAlign: 'right' }}>({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rebal-sliders" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {recs.map(inv => {
                const pct = allocations[inv.id] || 0;
                const amt = Math.round((pct / 100) * totalSavings / 100) * 100;
                const riskLabel = inv.risk_level || inv.riskLabel || 'Medium';
                const color = RISK_COLORS[riskLabel] || '#0ea5e9';
                const isAllocated = pct > 0;

                return (
                  <div
                    key={inv.id}
                    className={`rebal-slider-row ${isAllocated ? 'allocated' : 'unallocated'}`}
                  >
                    <div className="slider-info-col" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="slider-instrument-name" style={{ fontWeight: 600, color: isAllocated ? '#f1f5f9' : '#94a3b8', fontSize: '0.9rem' }}>{inv.name}</span>
                      <span className="slider-instrument-risk" style={{ color: isAllocated ? color : '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                        {riskLabel} Risk
                      </span>
                    </div>
                    <div className="slider-range-col">
                      <input
                        type="range"
                        className="rebal-range"
                        min="0" max="100" step="0.5"
                        value={pct}
                        onChange={e => handleSliderChange(inv.id, Number(e.target.value))}
                        style={{
                          '--slider-color': isAllocated ? color : '#475569',
                          '--slider-pct': `${pct}%`
                        }}
                      />
                    </div>
                    <span className="slider-pct-value" style={{ color: isAllocated ? color : '#64748b', fontWeight: 700, fontSize: '0.9rem', textAlign: 'right' }}>
                      {pct.toFixed(0)}%
                    </span>
                    <span className={`slider-amount-value ${isAllocated ? 'allocated-label' : 'unallocated-label'}`} style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.9rem', color: isAllocated ? '#f8fafc' : '#475569' }}>
                      {isAllocated ? `${formatINR(amt)}` : '₹0'}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Investment Journey Timeline Card */}
          <motion.div
            className="investment-journey-card premium-glass"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <h3 className="journey-title">
              Your Investment Journey
            </h3>
            <p className="journey-subtitle">
              Where your {formatINR(totalSavings)}/mo SIP could take you
            </p>

            <div className="journey-timeline">
              {journeyMilestones.map((m, idx) => {
                return (
                  <div key={idx} className={`journey-milestone ${m.highlight ? 'highlight' : ''} ${m.isGoal ? 'is-goal' : ''}`}>
                    <div className="milestone-dot" />
                    <div className="milestone-content-row">
                      <span className="milestone-year">Year {m.year}</span>
                      <span className="milestone-amount">
                        <AnimatedCurrency value={m.amount} />
                      </span>
                      <span className="milestone-label">
                        {m.isGoal && <span className="milestone-goal-badge">Goal</span>}
                        {m.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {userGoals.length > 0 && (
              <div className="journey-goals-note">
                Linked to {userGoals.length} goal{userGoals.length > 1 ? 's' : ''} from your Goal Planner
              </div>
            )}

            {/* Insight stats footer to fill empty space */}
            <div className="journey-insight-footer">
              <div className="journey-insight-stat">
                <div className="insight-value">
                  {formatINR(totalSavings * 12 * 10)}
                </div>
                <div className="insight-label">Total Invested (10Y)</div>
              </div>
              <div className="journey-insight-stat">
                <div className="insight-value">
                  {weightedReturnRate.toFixed(1)}
                  <span className="insight-suffix">%</span>
                </div>
                <div className="insight-label">Expected Return</div>
              </div>
              <div className="journey-insight-stat">
                <div className="insight-value">
                  {projectionResults.wealth10y > 0 ? (projectionResults.wealth10y / (totalSavings * 12 * 10)).toFixed(1) : '—'}
                  <span className="insight-suffix">x</span>
                </div>
                <div className="insight-label">Wealth Multiplier</div>
              </div>
            </div>
          </motion.div>
          
          {/* Recommendation Match Card */}
          <motion.div
            className="recommendation-match-card premium-glass"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="match-card-header">
              <div className="match-header-info">
                <span className="match-title">Recommendation Match</span>
                <p className="match-subtitle">
                  How closely this custom plan matches your recommended advisor profile.
                </p>
              </div>

              <div 
                className="match-badge-premium" 
                style={{ color: matchColor, background: `${matchColor}12`, borderColor: `${matchColor}25` }}
              >
                <span className="match-badge-value">{recommendationMatch}%</span>
                <span className="match-badge-label">
                  {recommendationMatch >= 90 ? 'Perfect' : recommendationMatch >= 75 ? 'Good' : recommendationMatch >= 50 ? 'Fair' : 'Poor'}
                </span>
              </div>
            </div>

            <div className="match-metrics-grid">
              <div className="match-metric-tile">
                <div className="match-metric-icon-wrap" style={{ '--icon-color': score >= 80 ? '#10b981' : '#f59e0b' }}>
                  <PieChart size={16} />
                </div>
                <div className="match-metric-details">
                  <span className="match-metric-label">Asset Allocation</span>
                  <span className="match-metric-value">{score}% Match</span>
                </div>
                <div className="match-metric-status" style={{ color: score >= 80 ? '#10b981' : '#f59e0b' }}>✓</div>
              </div>

              <div className="match-metric-tile">
                <div className="match-metric-icon-wrap" style={{ '--icon-color': riskScore >= 80 ? '#10b981' : '#f59e0b' }}>
                  <Shield size={16} />
                </div>
                <div className="match-metric-details">
                  <span className="match-metric-label">Risk Profile</span>
                  <span className="match-metric-value">{profile?.risk_appetite || 'Medium'}</span>
                </div>
                <div className="match-metric-status" style={{ color: riskScore >= 80 ? '#10b981' : '#f59e0b' }}>✓</div>
              </div>

              <div className="match-metric-tile">
                <div className="match-metric-icon-wrap" style={{ '--icon-color': goalScore >= 80 ? '#10b981' : '#f59e0b' }}>
                  <Calendar size={16} />
                </div>
                <div className="match-metric-details">
                  <span className="match-metric-label">Goal Horizon</span>
                  <span className="match-metric-value">{horizon} Years</span>
                </div>
                <div className="match-metric-status" style={{ color: goalScore >= 80 ? '#10b981' : '#f59e0b' }}>✓</div>
              </div>

              <div className="match-metric-tile">
                <div className="match-metric-icon-wrap" style={{ '--icon-color': affordabilityScore >= 80 ? '#10b981' : '#f59e0b' }}>
                  <Wallet size={16} />
                </div>
                <div className="match-metric-details">
                  <span className="match-metric-label">Monthly SIP</span>
                  <span className="match-metric-value">{formatINR(totalSavings)}</span>
                </div>
                <div className="match-metric-status" style={{ color: affordabilityScore >= 80 ? '#10b981' : '#f59e0b' }}>✓</div>
              </div>
            </div>
          </motion.div>

          {/* Future Wealth Projection Card */}
          <motion.div
            className="projection-card premium-glass"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '16px', marginTop: 0 }}>
              Future Wealth Projection
            </h3>

            {loadingProjection ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ height: '20px', width: '60%', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ height: '60px', width: '100%', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ height: '20px', width: '80%', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite ease-in-out' }} />
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>Monthly Investment</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>{formatINR(totalSavings)}/mo</span>
                </div>
                
                <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.1)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Estimated Value (10 Years)</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}><AnimatedCurrency value={projectionResults.wealth10y} /></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                  <span style={{ color: '#94a3b8' }}>Estimated Returns</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>+<AnimatedCurrency value={projectionResults.estReturns} /></span>
                </div>

                {projectionResults.isFallback && (
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '12px', textAlign: 'center', background: 'rgba(245, 158, 11, 0.05)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                    ⚠️ Offline estimates (using standard compounding fallback)
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Risk Thermometer Card */}
          <motion.div
            className="risk-thermometer-card premium-glass"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>Your Risk Profile</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ height: '8px', width: '8px', borderRadius: '50%', background: thermometerRisk.color }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: thermometerRisk.color }}>
                  {thermometerRisk.label}
                </span>
              </div>
            </div>

            <div className="thermometer-wrapper">
              {/* Thermometer track */}
              <div className="thermometer-track" />
              {/* Indicator dot */}
              <div 
                className="thermometer-indicator"
                style={{
                  '--risk-color': thermometerRisk.color,
                  left: `${thermometerRisk.positionPct}%`
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
              <span>Safe</span>
              <span>Balanced</span>
              <span>High Growth</span>
            </div>
          </motion.div>

          {/* Market Scenarios Card */}
          <motion.div
            className="scenarios-card premium-glass"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34 }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '16px', marginTop: 0 }}>
              Market Scenario Projections (10 Years)
            </h3>

            {loadingMC ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ height: '48px', width: '100%', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ height: '48px', width: '100%', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ height: '48px', width: '100%', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite ease-in-out' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* Weak Market */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.08)', borderRadius: '12px', padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fca5a5' }}>
                      <JargonTooltip term="P10">Weak Market (P10)</JargonTooltip>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>90% chance of exceeding this</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}><AnimatedCurrency value={scenarioResults.p10} /></div>
                </div>

                {/* Typical Market */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(56, 189, 248, 0.03)', border: '1px solid rgba(56, 189, 248, 0.08)', borderRadius: '12px', padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                      <JargonTooltip term="P50">Typical Market (P50)</JargonTooltip>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>50% chance of exceeding this</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}><AnimatedCurrency value={scenarioResults.p50} /></div>
                </div>

                {/* Strong Market */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.08)', borderRadius: '12px', padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#6ee7b7' }}>
                      <JargonTooltip term="P90">Strong Market (P90)</JargonTooltip>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>10% chance of exceeding this</div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}><AnimatedCurrency value={scenarioResults.p90} /></div>
                </div>

                {scenarioResults.isFallback && (
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '4px', textAlign: 'center', background: 'rgba(245, 158, 11, 0.05)', padding: '6px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                    ⚠️ Offline scenario estimates (using statistical model)
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Why This Mix Card */}
          <motion.div
            className="why-mix-details-card premium-glass"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36 }}
          >
            <h3 className="journey-title">
              Why This Mix Fits You
            </h3>
            <p className="journey-subtitle" style={{ marginBottom: '20px' }}>
              Personalised to your financial profile
            </p>
            
            <div className="why-mix-reasons-list">
              {whyMixReasons.map((reason, idx) => {
                let title = 'Investment Benefit';
                if (idx === 0) title = 'Age-Matched Growth';
                else if (idx === 1) title = 'SIP Affordability';
                else if (idx === 2) title = 'Goal-Aligned Timeline';
                else if (idx === 3) title = 'Volatility Cushion';

                return (
                  <div key={idx} className="why-mix-reason-item">
                    <div className="why-mix-check">
                      <Check size={13} strokeWidth={3} />
                    </div>
                    <div>
                      <div className="why-mix-reason-title">{title}</div>
                      <div className="why-mix-reason-desc">
                        {reason}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="why-mix-footer">
              <div className="why-mix-footer-dot" />
              Analysis based on your profile, goals & risk appetite
            </div>
          </motion.div>
          {/* Investment Summary (Save section) */}
          <motion.div
            className="confirmation-summary-card premium-glass"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            style={{ marginTop: '12px' }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 20px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#818cf8" /> Investment Summary
            </h3>
            
            <div className="summary-stats-grid">
              
              {/* Stat 1: Monthly SIP */}
              <div className="summary-stat-card">
                <div className="summary-stat-label">Monthly SIP</div>
                <div className="summary-stat-value">
                  {formatINR(totalSavings)}
                </div>
              </div>

              {/* Stat 2: Allocation Overview */}
              <div className="summary-stat-card">
                <div className="summary-stat-label">Allocation</div>
                
                <div className="mini-allocation-track">
                  {summaryAllocation.equity > 0 && (
                    <div className="track-segment segment-equity" style={{ width: `${summaryAllocation.equity}%` }} />
                  )}
                  {summaryAllocation.etf > 0 && (
                    <div className="track-segment segment-etf" style={{ width: `${summaryAllocation.etf}%` }} />
                  )}
                  {summaryAllocation.debt > 0 && (
                    <div className="track-segment segment-debt" style={{ width: `${summaryAllocation.debt}%` }} />
                  )}
                </div>

                <div className="mini-allocation-tags">
                  {summaryAllocation.equity > 0 && (
                    <span className="allocation-tag">
                      <span className="tag-dot dot-equity" />
                      {summaryAllocation.equity}% Equity
                    </span>
                  )}
                  {summaryAllocation.etf > 0 && (
                    <span className="allocation-tag">
                      <span className="tag-dot dot-etf" />
                      {summaryAllocation.etf}% ETF
                    </span>
                  )}
                  {summaryAllocation.debt > 0 && (
                    <span className="allocation-tag">
                      <span className="tag-dot dot-debt" />
                      {summaryAllocation.debt}% Debt
                    </span>
                  )}
                </div>
              </div>

              {/* Stat 3: Expected Value */}
              <div className="summary-stat-card">
                <div className="summary-stat-label">Expected Value (10Y)</div>
                <div className="summary-stat-value value-blue">
                  {loadingProjection ? (
                    <span style={{ fontSize: '1rem', color: '#64748b' }}>Calculating...</span>
                  ) : (
                    <>₹{(projectionResults.wealth10y / 100000).toFixed(2)} L</>
                  )}
                </div>
              </div>

              {/* Stat 4: Recommendation Match */}
              <div className="summary-stat-card">
                <div className="summary-stat-label">Recommendation Match</div>
                <div className="summary-stat-value value-green" style={{ color: matchColor }}>
                  <AnimatedNumber value={recommendationMatch} />%
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <button 
                type="button"
                className="btn-primary-glow" 
                onClick={handleSave}
                style={{ width: '100%', maxWidth: '380px', padding: '14px 28px', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              >
                <ShieldCheck size={20} />
                Save My Investment Mix
              </button>
              <p className="cta-helper-text">
                This will save your chosen investment split and update all your projections
              </p>
            </div>
          </motion.div>

      </div>
    </div>
  );
};

export default RebalancerScreen;
