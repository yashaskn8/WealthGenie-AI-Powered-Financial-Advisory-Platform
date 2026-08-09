import React, { useMemo, useState, useEffect } from 'react';
import JargonTooltip from './components/JargonTooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Scale, Percent, AlertCircle, TrendingUp, TrendingDown, Info, ShieldCheck, PiggyBank, Layers, Award, ChevronDown, ChevronUp, Zap, Eye, EyeOff, ArrowRight, Sparkles, Target, Shield } from 'lucide-react';
import { computeRealReturn } from './utils/postTaxEngine';
import { formatINR } from './recommendationEngine';
import { computePostTaxReturnBatch } from './services/api';
import './PostTaxAnalysis.css';

const PostTaxAnalysis = ({ profile, recommendations }) => {
  const regime = profile?.taxRegime || 'new';
  const inflationRate = 6.0;
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [backendPostTaxResults, setBackendPostTaxResults] = useState(null);
  const [postTaxLoading, setPostTaxLoading] = useState(false);

  // ── WG-038: Fetch post-tax returns from backend (single source of truth) ──
  // This replaces the previous client-side computePostTaxReturn() from
  // engine/taxComputation.js which was missing Section 87A rebate logic.
  const instrumentTypeMap = {
    eee: 'PPF', slab: 'FD', ltcg: 'Equity_MF', elss: 'ELSS',
    nps: 'NPS', sgb: 'SGB',
  };

  useEffect(() => {
    if (!profile || !recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
      setBackendPostTaxResults(null);
      return;
    }
    const annualIncome = (profile.monthly_income || 0) * 12;
    const annualSavings = (profile.monthly_savings || 0) * 12;
    const horizon = profile.investment_horizon || 15;
    const age = profile.age || 30;

    const instruments = recommendations.map(inv => {
      const nominalRate = inv.nominalReturn !== undefined ? inv.nominalReturn : (inv.expectedReturn || inv.rate || 0);
      return {
        instrumentType: inv.type || instrumentTypeMap[inv.taxType] || 'FD',
        nominalRate: nominalRate / 100,
        holdingYears: horizon,
        monthlySIP: (annualSavings / 12) || 10000,
      };
    });

    let cancelled = false;
    setPostTaxLoading(true);

    computePostTaxReturnBatch(instruments, annualIncome, regime, age)
      .then(data => {
        if (!cancelled && data?.results) setBackendPostTaxResults(data.results);
      })
      .catch(err => {
        console.error('[PostTaxAnalysis] Backend post-tax-return/batch failed:', err);
        if (!cancelled) setBackendPostTaxResults(null);
      })
      .finally(() => { if (!cancelled) setPostTaxLoading(false); });

    return () => { cancelled = true; };
  }, [profile, recommendations, regime]);

  // 1. Calculate Marginal Tax Rate
  const { marginalRate, effectiveRate: _effectiveRate } = useMemo(() => {
    if (!profile) return { marginalRate: 0, effectiveRate: 0 };

    // WG-038: Use backend taxRate from first slab-taxed result if available
    if (backendPostTaxResults && backendPostTaxResults.length > 0) {
      const slabResult = backendPostTaxResults.find(r => r.taxRate > 0) || backendPostTaxResults[0];
      const mr = slabResult?.taxRate || 0;
      return { marginalRate: mr, effectiveRate: mr };
    }

    // Fallback: inline effective rate calculation (rebate-aware for display header)
    const annualIncome = (profile.monthly_income || 0) * 12;
    const stdDeduction = regime === 'new' ? 75000 : 50000;
    const taxable = Math.max(0, annualIncome - stdDeduction);
    let tax = 0;

    if (regime === 'new') {
      const slabs = [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 0.05 },
        { min: 800000, max: 1200000, rate: 0.10 },
        { min: 1200000, max: 1600000, rate: 0.15 },
        { min: 1600000, max: 2000000, rate: 0.20 },
        { min: 2000000, max: 2400000, rate: 0.25 },
        { min: 2400000, max: Infinity, rate: 0.30 },
      ];
      for (const slab of slabs) {
        if (taxable <= slab.min) break;
        const taxableInSlab = Math.min(taxable, slab.max) - slab.min;
        tax += taxableInSlab * slab.rate;
      }
      // Section 87A rebate: zero tax for taxable income <= ₹12L
      if (taxable <= 1200000) {
        tax = 0;
      } else {
        const excess = taxable - 1200000;
        if (tax > excess) tax = excess;
      }
    } else {
      const slabs = [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.20 },
        { min: 1000000, max: Infinity, rate: 0.30 },
      ];
      for (const slab of slabs) {
        if (taxable <= slab.min) break;
        const taxableInSlab = Math.min(taxable, slab.max) - slab.min;
        tax += taxableInSlab * slab.rate;
      }
      if (taxable <= 500000) tax = 0;
    }

    let surchargeRate = 0;
    if (taxable > 5000000) {
      if (regime === 'new') {
        if (taxable <= 10000000) surchargeRate = 0.10;
        else if (taxable <= 20000000) surchargeRate = 0.15;
        else surchargeRate = 0.25;
      } else {
        if (taxable <= 10000000) surchargeRate = 0.10;
        else if (taxable <= 20000000) surchargeRate = 0.15;
        else if (taxable <= 50000000) surchargeRate = 0.25;
        else surchargeRate = 0.37;
      }
    }

    const surcharge = tax * surchargeRate;
    const totalTax = (tax + surcharge) * 1.04;
    // When below rebate threshold, marginal rate is effectively 0
    const mr = (tax === 0) ? 0 : (annualIncome > 0 ? totalTax / annualIncome : 0);
    const er = annualIncome > 0 ? (totalTax / annualIncome) : 0;
    return { marginalRate: mr, effectiveRate: er };
  }, [profile, regime, backendPostTaxResults]);

  // 2. Map recommendations to Post-Tax Metrics (WG-038: sourced from backend)
  const postTaxData = useMemo(() => {
    if (!profile || !recommendations || !Array.isArray(recommendations)) return [];
    const horizon = profile.investment_horizon || 15;
    const stepUpPct = 10; 

    // Step-up SIP FV helper
    const calcStepUpFV = (monthlySIP, annualRate, years) => {
      if (!monthlySIP || monthlySIP <= 0 || !years || years <= 0) return 0;
      const r = (annualRate / 100) / 12;
      let fv = 0;
      for (let yr = 0; yr < years; yr++) {
        const sip = monthlySIP * Math.pow(1 + stepUpPct / 100, yr);
        const mRem = (years - yr) * 12;
        if (r > 0) {
          fv += sip * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r) * Math.pow(1 + r, mRem - 12);
        } else {
          fv += sip * 12;
        }
      }
      return fv;
    };

    return recommendations.map((inv, idx) => {
      const totalInvested = (inv.monthly_allocation || 0) * horizon * 12;
      const nominalReturn = inv.nominalReturn !== undefined ? inv.nominalReturn : (inv.expectedReturn || inv.rate || 0);

      // WG-038: Use backend post-tax result if available
      let postTaxReturn = nominalReturn; // fallback = nominal (no tax drag shown)
      if (backendPostTaxResults && backendPostTaxResults[idx] && !backendPostTaxResults[idx].error) {
        const backendResult = backendPostTaxResults[idx];
        // Backend returns postTaxReturn as decimal (e.g. 0.07); convert to pct points
        postTaxReturn = (backendResult.postTaxReturn || 0) * 100;
      }

      const realReturn = computeRealReturn(postTaxReturn, inflationRate / 100);

      const nominalFV = calcStepUpFV(inv.monthly_allocation, nominalReturn, horizon);
      const postTaxFV = calcStepUpFV(inv.monthly_allocation, postTaxReturn, horizon);
      const postTaxGain = Math.max(0, postTaxFV - totalInvested);

      const taxDragWealth = Math.max(0, nominalFV - postTaxFV);
      const taxDragCAGR = Math.max(0, nominalReturn - postTaxReturn);

      const effectiveTaxPct = nominalReturn > 0
        ? Math.max(0, ((nominalReturn - postTaxReturn) / nominalReturn) * 100)
        : 0;

      const taxTypeLabels = {
        eee: 'Fully Tax-Free (EEE)', slab: 'Taxed at Slab Rate',
        ltcg: 'Equity Tax (12.5% LTCG)', elss: 'ELSS Tax-Saver (12.5% LTCG)',
        nps: 'Retirement Scheme (Partial Tax-Exempt)', sgb: 'Gold Bond (SGB) Rules',
      };
      const taxType = taxTypeLabels[inv.taxType] || 'Capital Gains';

      return {
        ...inv,
        taxDetails: { taxType, taxRatePercent: parseFloat(effectiveTaxPct.toFixed(1)), postTaxGain, taxDragWealth, taxDragCAGR },
        totalInvested,
        wealthGained: postTaxGain,
        nominalReturn,
        postTaxReturn,
        realReturn,
      };
    });
  }, [recommendations, profile, regime, backendPostTaxResults]);

  const totalTaxDragRupees = useMemo(() => {
    return postTaxData.reduce((sum, d) => sum + d.taxDetails.taxDragWealth, 0);
  }, [postTaxData]);

  const bottomLineMetrics = useMemo(() => {
    if (!profile || !postTaxData || postTaxData.length === 0) return { blendedNominal: 0, blendedReal: 0, keptAmount: 0 };
    const totalSavings = Number(profile.monthly_savings) || 12000;
    const blendedNominal = postTaxData.reduce((sum, a) => sum + (a.monthly_allocation / totalSavings) * a.nominalReturn, 0);
    const blendedReal = postTaxData.reduce((sum, a) => sum + (a.monthly_allocation / totalSavings) * a.realReturn, 0);
    const fraction = blendedNominal > 0 ? (blendedReal / blendedNominal) : 0;
    const keptAmount = Math.max(0, Math.round(1000 * fraction));
    return { blendedNominal, blendedReal, keptAmount };
  }, [postTaxData, profile]);

  const efficiencyPercent = useMemo(() => {
    return Math.max(0, Math.min(100, (bottomLineMetrics.keptAmount / 10)));
  }, [bottomLineMetrics.keptAmount]);

  const strokeDashoffset = useMemo(() => {
    return 251.2 - (251.2 * efficiencyPercent) / 100;
  }, [efficiencyPercent]);

  const actionableInsights = useMemo(() => {
    const list = [];
    let hasHighSlabDebt = false;
    let hasGoldPhysical = false;

    postTaxData.forEach(d => {
      if (d.taxType === 'slab' && d.id === 'fd') hasHighSlabDebt = true;
      if (d.id === 'gold_physical') hasGoldPhysical = true;
    });

    if (marginalRate >= 0.20 && hasHighSlabDebt) {
      list.push({
        title: 'Optimize Safe Assets',
        body: 'You are in a high tax bracket. Consider routing safe allocations into Arbitrage Funds or PPF instead of bank Fixed Deposits to shield interest from high slab taxes.',
        icon: <ShieldCheck size={18} />,
        color: 'blue',
      });
    }

    if (marginalRate >= 0.10 && !postTaxData.some(d => d.id === 'nps')) {
      list.push({
        title: 'NPS Tax Break',
        body: 'Claim an additional ₹50,000 deduction under Section 80CCD(1B) by investing in National Pension System (NPS). This growth is largely tax-exempt.',
        icon: <PiggyBank size={18} />,
        color: 'purple',
      });
    }

    if (hasGoldPhysical) {
      list.push({
        title: 'Switch to SGBs',
        body: 'Physical Gold and Gold ETFs attract capital gains tax. Sovereign Gold Bonds (SGB) offer 2.5% annual interest and are 100% tax-free at maturity.',
        icon: <Scale size={18} />,
        color: 'amber',
      });
    }

    if (list.length === 0) {
      list.push({
        title: 'Sustain Allocation',
        body: 'Your portfolio is tax-efficient. Continue systematic contributions to maintain current compounding returns.',
        icon: <ShieldCheck size={18} />,
        color: 'green',
      });
    }

    return list;
  }, [postTaxData, marginalRate]);

  if (!profile || !recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
    return (
      <div className="pta-empty-state">
        <div className="pta-empty-icon"><Target size={48} /></div>
        <h3>No Recommendations Yet</h3>
        <p>Set up your financial profile to see your actual returns after tax and inflation.</p>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.04 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 16 } }
  };

  const getTaxBadgeClass = (taxType) => {
    const t = taxType.toLowerCase();
    if (t.includes('eee') || t.includes('free')) return 'pta-badge--green';
    if (t.includes('slab')) return 'pta-badge--red';
    if (t.includes('equity') || t.includes('elss') || t.includes('gains') || t.includes('capital')) return 'pta-badge--purple';
    if (t.includes('retirement') || t.includes('nps')) return 'pta-badge--blue';
    if (t.includes('gold') || t.includes('sgb')) return 'pta-badge--amber';
    return 'pta-badge--default';
  };

  const barColors = ['#38bdf8', '#c084fc', '#34d399', '#fbbf24', '#fb7185', '#f472b6'];

  return (
    <motion.div
      className="pta-root"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Ambient background */}
      <div className="pta-bg-glow pta-bg-glow--1" />
      <div className="pta-bg-glow pta-bg-glow--2" />
      <div className="pta-bg-glow pta-bg-glow--3" />

      {/* ═══════ HEADER ═══════ */}
      <motion.header className="pta-header" variants={itemVariants}>
        <div className="pta-header-badge">
          <Sparkles size={13} />
          Tax & Inflation Engine
        </div>
        <h1 className="pta-header-title">
          Actual Returns Summary
        </h1>
        <p className="pta-header-subtitle">
          Your true growth after Indian tax laws & {inflationRate}% inflation drag
        </p>
      </motion.header>

      {/* ═══════ HERO KPI STRIP ═══════ */}
      <motion.div className="pta-kpi-strip" variants={itemVariants}>
        <div className="pta-kpi-card pta-kpi-card--regime">
          <div className="pta-kpi-icon-wrap pta-kpi-icon--blue">
            <Layers size={18} />
          </div>
          <div className="pta-kpi-content">
            <span className="pta-kpi-label">Tax Regime</span>
            <span className="pta-kpi-value">{regime === 'new' ? 'New System' : 'Old System'}</span>
          </div>
        </div>

        <div className="pta-kpi-divider" />

        <div className="pta-kpi-card pta-kpi-card--bracket">
          <div className="pta-kpi-icon-wrap pta-kpi-icon--purple">
            <Award size={18} />
          </div>
          <div className="pta-kpi-content">
            <span className="pta-kpi-label">Max Tax Bracket</span>
            <span className="pta-kpi-value">{(marginalRate * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div className="pta-kpi-divider" />

        <div className="pta-kpi-card pta-kpi-card--inflation">
          <div className="pta-kpi-icon-wrap pta-kpi-icon--amber">
            <TrendingDown size={18} />
          </div>
          <div className="pta-kpi-content">
            <span className="pta-kpi-label">Inflation Rate</span>
            <span className="pta-kpi-value">{inflationRate}%</span>
          </div>
        </div>

        <div className="pta-kpi-divider" />

        <div className="pta-kpi-card pta-kpi-card--erosion">
          <div className="pta-kpi-icon-wrap pta-kpi-icon--rose">
            <AlertCircle size={18} />
          </div>
          <div className="pta-kpi-content">
            <span className="pta-kpi-label">Total Tax Drag</span>
            <span className="pta-kpi-value pta-kpi-value--rose">{formatINR(totalTaxDragRupees)}</span>
          </div>
        </div>
      </motion.div>

      {/* ═══════ MAIN GRID ═══════ */}
      <div className="pta-main-grid">
        {/* ─── LEFT COLUMN ─── */}
        <div className="pta-col">
          {/* Chart Card */}
          <motion.div className="pta-card" variants={itemVariants}>
            <div className="pta-card-header">
              <div>
                <h3 className="pta-card-title">Return Drag Comparison</h3>
                <p className="pta-card-subtitle">Before Tax → After Tax → Real (inflation-adjusted)</p>
              </div>
            </div>

            <div className="pta-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postTaxData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradNominal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#0284c7" stopOpacity={0.6}/>
                    </linearGradient>
                    <linearGradient id="gradPostTax" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c084fc" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.6}/>
                    </linearGradient>
                    <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }} tickFormatter={(val) => `${val}%`} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)', radius: 6 }}
                    contentStyle={{ background: 'rgba(2, 6, 18, 0.96)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 14, color: '#f8fafc', fontSize: '0.82rem', fontWeight: 600, padding: '12px 16px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
                    formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                  />
                  <Legend verticalAlign="top" height={40} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.3px' }}/>
                  <Bar dataKey="nominalReturn" name="Before Tax" fill="url(#gradNominal)" radius={[6,6,0,0]} barSize={22} />
                  <Bar dataKey="postTaxReturn" name="After Tax" fill="url(#gradPostTax)" radius={[6,6,0,0]} barSize={22} />
                  <Bar dataKey="realReturn" name="Real Return" fill="url(#gradReal)" radius={[6,6,0,0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Detailed Rates Table */}
          <motion.div className="pta-card pta-card--flush" variants={itemVariants}>
            <div className="pta-table-header" onClick={() => setShowBreakdown(!showBreakdown)} role="button" tabIndex={0}>
              <div className="pta-table-header-left">
                <h3 className="pta-card-title">Detailed Breakdown</h3>
                <span className="pta-table-count">{postTaxData.length} assets</span>
              </div>
              <div className="pta-table-header-right">
                <span className="pta-inflation-chip">
                  <TrendingDown size={12} /> {inflationRate}% inflation
                </span>
                <motion.div
                  animate={{ rotate: showBreakdown ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="pta-chevron-wrap"
                >
                  <ChevronDown size={18} />
                </motion.div>
              </div>
            </div>

            <AnimatePresence>
              {showBreakdown && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="pta-table-scroll">
                    <table className="pta-table">
                      <thead>
                        <tr>
                          <th className="pta-th--left">Asset</th>
                          <th className="pta-th--left">Tax Treatment</th>
                          <th className="pta-th--center">Nominal</th>
                          <th className="pta-th--center">Post-Tax</th>
                          <th className="pta-th--center">Real</th>
                          <th className="pta-th--right">Projected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {postTaxData.map((data, i) => (
                          <tr key={i} className="pta-table-row">
                            <td className="pta-td--asset">
                              <div className="pta-asset-color" style={{ background: barColors[i % barColors.length] }} />
                              <div>
                                <span className="pta-asset-name">{data.name}</span>
                                <span className="pta-asset-cat">{data.category}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`pta-badge ${getTaxBadgeClass(data.taxDetails.taxType)}`}>
                                {data.taxDetails.taxType}
                              </span>
                            </td>
                            <td className="pta-td--mono pta-td--center pta-td--dim">
                              {data.nominalReturn.toFixed(1)}%
                            </td>
                            <td className="pta-td--mono pta-td--center pta-td--purple">
                              {data.postTaxReturn.toFixed(1)}%
                            </td>
                            <td className={`pta-td--mono pta-td--center ${data.realReturn > 0 ? 'pta-td--green' : 'pta-td--rose'}`}>
                              <span className="pta-real-cell">
                                {data.realReturn > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {data.realReturn > 0 ? '+' : ''}{data.realReturn.toFixed(1)}%
                              </span>
                            </td>
                            <td className="pta-td--mono pta-td--right pta-td--blue pta-td--bold">
                              {formatINR(data.wealthGained)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div className="pta-col">
          {/* Profit Retention Efficiency - Hero Widget */}
          <motion.div className="pta-card pta-retention-hero" variants={itemVariants}>
            <h3 className="pta-retention-label">Profit Retention Efficiency</h3>

            <div className="pta-donut-container">
              <svg className="pta-donut-svg" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="ptaProgressGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                {/* Background track */}
                <circle cx="50" cy="50" r="40" className="pta-donut-track" />
                {/* Eroded portion (red) */}
                <circle cx="50" cy="50" r="40"
                  className="pta-donut-eroded"
                  strokeDasharray="251.2"
                  strokeDashoffset="0"
                  transform="rotate(-90 50 50)"
                />
                {/* Retained portion (green) */}
                <circle cx="50" cy="50" r="40"
                  className="pta-donut-fill"
                  strokeDasharray="251.2"
                  strokeDashoffset={strokeDashoffset}
                  transform="rotate(-90 50 50)"
                />
              </svg>

              <div className="pta-donut-center">
                <span className="pta-donut-pct">{efficiencyPercent.toFixed(1)}%</span>
                <span className="pta-donut-sub">RETAINED</span>
              </div>

              {/* Outer glow ring */}
              <div className="pta-donut-glow" />
            </div>

            <div className="pta-retention-metrics">
              <div className="pta-metric-pill pta-metric-pill--green">
                <span className="pta-metric-label">You Keep</span>
                <span className="pta-metric-value">₹{bottomLineMetrics.keptAmount}</span>
              </div>
              <div className="pta-metric-pill pta-metric-pill--rose">
                <span className="pta-metric-label">Eroded</span>
                <span className="pta-metric-value">₹{1000 - bottomLineMetrics.keptAmount}</span>
              </div>
            </div>
            <p className="pta-retention-footnote">Per ₹1,000 of gross profits</p>
          </motion.div>

          {/* Tax Erosion Warning */}
          {totalTaxDragRupees > 0 && (
            <motion.div className="pta-card pta-erosion-card" variants={itemVariants}>
              <div className="pta-erosion-icon-wrap">
                <AlertCircle size={20} />
              </div>
              <div className="pta-erosion-content">
                <h4 className="pta-erosion-title">Projected Tax Erosion</h4>
                <p className="pta-erosion-text">
                  Taxes will reduce your total projected savings by roughly <strong>{formatINR(totalTaxDragRupees)}</strong> over your investment timeline.
                </p>
              </div>
            </motion.div>
          )}

          {/* Advisory Actions */}
          <motion.div className="pta-card pta-advisory-card" variants={itemVariants}>
            <h3 className="pta-advisory-header">
              <Zap size={15} className="pta-advisory-icon" />
              Advisory Actions
            </h3>
            <div className="pta-advisory-list">
              {actionableInsights.map((insight, idx) => (
                <motion.div
                  key={idx}
                  className={`pta-advisory-item pta-advisory-item--${insight.color}`}
                  whileHover={{ x: 4, scale: 1.005 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className={`pta-advisory-item-icon pta-advisory-item-icon--${insight.color}`}>
                    {insight.icon}
                  </div>
                  <div className="pta-advisory-item-body">
                    <h4 className="pta-advisory-item-title">{insight.title}</h4>
                    <p className="pta-advisory-item-desc">{insight.body}</p>
                  </div>
                  <ArrowRight size={14} className="pta-advisory-arrow" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default PostTaxAnalysis;
