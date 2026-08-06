import React, { useState, useMemo, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { ChevronRight, ChevronDown, Filter, Info, Shield, TrendingUp, Zap, Trophy, BarChart3, AlertCircle, Calendar, Target, Activity, Wallet, PiggyBank, Clock, HelpCircle, Building2, MapPin, Star, User, Edit3 } from 'lucide-react';
import { investmentDatabase, RISK_COLORS, CHART_COLORS } from './investmentDatabase';
import { generateRecommendations, getEligibleInvestments, getWhy, GOAL_PROFILES } from './recommendationEngine';
import { getConfidenceLabel } from './utils/confidenceLabels';
import { INSTRUMENT_EXPLAINERS, CARD_SUBTITLES, RISK_PLAIN_LABELS, getLockInWarning, detectRiskAgeMismatch } from './utils/instrumentExplainers';
import ExplainabilityPanel from './components/ExplainabilityPanel';
import SebiDisclaimer from './components/SebiDisclaimer';
import { formatCompactINR } from './utils/indianNumberFormat';
import JargonTooltip from './components/JargonTooltip';
import { computeSuitabilityMatch } from './ComparisonTableModal';

import './Dashboard.css';

const CATEGORY_COLORS = {
  'Equity': '#6366f1',      // Refined indigo
  'Debt': '#38bdf8',        // Clean sky blue
  'Commodity': '#f59e0b',   // Warm amber
  'Government': '#06b6d4',  // Teal cyan
  'Equity-Debt': '#8b5cf6', // Muted violet
  'Alternative': '#d97706', // Deep amber
  'Hybrid': '#ec4899'       // Pink
};
const DEFAULT_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#a855f7'];

const SOURCE_BADGES = {
  backend: { label: 'Live backend', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.10)', border: 'rgba(56, 189, 248, 0.22)' },
  local_inactive: { label: 'Offline estimate', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)', border: 'rgba(245, 158, 11, 0.24)' },
  local_engine: { label: 'Local estimate', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.16)' },
};

const getSourceBadge = (source) => SOURCE_BADGES[source] || null;

export const BackendFallbackBanner = ({ notice, onDismiss }) => {
  if (!notice) return null;
  return (
    <div
      role="status"
      data-testid="backend-fallback-banner"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
        background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.24)',
        borderRadius: 12, marginBottom: 14, fontSize: '0.78rem', lineHeight: 1.5, color: '#fbbf24'
      }}
    >
      <AlertCircle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, marginBottom: 2 }}>{notice.message || 'Live recommendations unavailable - showing offline estimates'}</div>
        {notice.detail && <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{notice.detail}</div>}
      </div>
      <button
        type="button"
        aria-label="Dismiss fallback notice"
        onClick={onDismiss}
        style={{
          background: 'rgba(10, 16, 30, 0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          color: '#f8fafc', fontSize: '0.68rem', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit'
        }}
      >Dismiss</button>
    </div>
  );
};

const RecommendationSourceBadge = ({ source }) => {
  const badge = getSourceBadge(source);
  if (!badge) return null;
  return (
    <span
      data-testid={'recommendation-source-' + source}
      style={{
        display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
        background: badge.bg, color: badge.color, border: '1px solid ' + badge.border,
        borderRadius: 8, padding: '2px 7px', fontSize: '0.62rem', fontWeight: 700, lineHeight: 1.2
      }}
    >
      {badge.label}
    </span>
  );
};

// Map slider value (1-10) → risk appetite label
const riskValueToLabel = (v) => {
  const n = Number(v);
  if (n <= 3) return 'Low';
  if (n <= 7) return 'Medium';
  return 'High';
};

const RecommendationDashboard = ({ userProfile, recommendations: propRecommendations, onExploreAll, onRebalance, onNavigate, onLearnMore, isLoading: isLoadingProp, explanation, fallbackNotice, onDismissFallbackNotice }) => {
  const defaultHorizon = userProfile?.investment_horizon || 15;
  const [horizon, setHorizon] = useState(defaultHorizon);
  const [initialCapital, setInitialCapital] = useState(Number(userProfile?.existing_savings) || 0);
  const [stepUpPct, setStepUpPct] = useState(10);
  const [inflationAdjusted, setInflationAdjusted] = useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  
  React.useEffect(() => {
    if (isLoadingProp !== undefined) {
      setIsLoading(isLoadingProp);
    } else {
      const timer = setTimeout(() => setIsLoading(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoadingProp]);
  
  const [riskValue, setRiskValue] = useState(userProfile?.risk_appetite === 'High' ? 8 : userProfile?.risk_appetite === 'Medium' ? 6 : 3);

  // Sync local state with profile prop changes (useState ignores updates after mount)
  useEffect(() => {
    setHorizon(userProfile?.investment_horizon || 15);
  }, [userProfile?.investment_horizon]);

  useEffect(() => {
    setRiskValue(userProfile?.risk_appetite === 'High' ? 8 : userProfile?.risk_appetite === 'Medium' ? 6 : 3);
  }, [userProfile?.risk_appetite]);

  // ─── Live re-computation: derive risk label from slider & regenerate recommendations ───
  const derivedRiskLabel = riskValueToLabel(riskValue);
  const recommendations = useMemo(() => {
    // If the slider matches the original profile risk, use prop recommendations (includes backend data)
    if (derivedRiskLabel === (userProfile?.risk_appetite || 'Medium')) {
      return propRecommendations;
    }
    // Otherwise, re-generate locally with the overridden risk appetite + current horizon
    const modifiedProfile = { ...userProfile, risk_appetite: derivedRiskLabel, investment_horizon: horizon };
    return generateRecommendations(modifiedProfile);
  }, [derivedRiskLabel, userProfile, propRecommendations, horizon]);
  const [expandedRows, setExpandedRows] = useState({});
  const [expandedWhyCards, setExpandedWhyCards] = useState({});

  const [sortField, setSortField] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [riskGroupOpen, setRiskGroupOpen] = useState({
    low: true,
    medium: true,
    high: true,
  });
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    !localStorage.getItem('wg_onboarded')
  );
  const [activeTooltip, setActiveTooltip] = useState(null);
  const riskAgeMismatch = useMemo(() => detectRiskAgeMismatch(userProfile), [userProfile]);

  // Eligibility stats — goal-aware
  const isEmergencyFundGoal = (userProfile?.investment_goals || [])[0] === 'Emergency Fund';
  const totalInstruments = investmentDatabase.length;
  const displayedCount = recommendations?.length || 0;
  const eligibleCount = useMemo(() => {
    if (!userProfile) return 0;
    if (isEmergencyFundGoal) return displayedCount;
    return getEligibleInvestments(userProfile).length;
  }, [userProfile, isEmergencyFundGoal, displayedCount]);
  const excludedCount = totalInstruments - eligibleCount;

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleWhyCard = (id) => {
    setExpandedWhyCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Dynamic Data Calculation based on recommendations
  const { allocationDataOuter, tableData, performanceData, currentMonthly, totalProjected } = useMemo(() => {
    if (!recommendations || recommendations.length === 0) return {
      allocationDataOuter: [], tableData: [], performanceData: [], currentMonthly: 0, totalProjected: 0
    };

    // Filter out instruments with zero allocation (dropped by budget constraints)
    const activeRecs = recommendations.filter(r => (r.monthly_allocation || 0) > 0);
    if (activeRecs.length === 0) return {
      allocationDataOuter: [], tableData: [], performanceData: [], currentMonthly: 0, totalProjected: 0
    };

    // First pass: compute total monthly SIP for proportional initial capital split
    const finalTotalMonthly = activeRecs.reduce((sum, r) => sum + (r.monthly_allocation || 0), 0);

    let totalMonthly = 0;
    let proj = 0;
    const catMap = {};
    const innerMap = [];
    const tableGroupMap = {};

    let colorIndex = 0;

    activeRecs.forEach((rec) => {
      totalMonthly += rec.monthly_allocation;
      
      // Calculate projection with step-up SIP and initial capital share
      let rate = rec.rate || rec.expected_return_max || 10;
      let rateMin = rec.expected_return_min || (rate * 0.65);
      
      if (inflationAdjusted) {
        rate = Math.max(0, rate - 6.0);
        rateMin = Math.max(0, rateMin - 6.0);
      }

      // Use SKEWED AVERAGE rate for the headline projected value (donut center)
      // Equity returns have positive skew — the expected/average outcome is closer
      // to nominal (max) than worst-case (min). Using 60% max / 40% min prevents
      // the inversion where Medium risk projects higher than High risk.
      const avgRate = rateMin * 0.4 + rate * 0.6;
      
      // Step-up SIP FV: iterate year-by-year, each year's SIP grows by stepUpPct%
      const avgRateMonth = (avgRate / 100) / 12;
      let sipFV = 0;
      for (let yr = 0; yr < horizon; yr++) {
        const sipThisYear = rec.monthly_allocation * Math.pow(1 + stepUpPct / 100, yr);
        const monthsRemaining = (horizon - yr) * 12;
        // FV of 12 monthly SIPs at end of this year compounded for remaining period
        if (avgRateMonth > 0) {
          sipFV += sipThisYear * ((Math.pow(1 + avgRateMonth, 12) - 1) / avgRateMonth) * (1 + avgRateMonth) * Math.pow(1 + avgRateMonth, monthsRemaining - 12);
        } else {
          sipFV += sipThisYear * 12;
        }
      }
      // Initial capital share (proportional to this instrument's allocation using FINAL total)
      const icShare = finalTotalMonthly > 0 ? (rec.monthly_allocation / finalTotalMonthly) * initialCapital : 0;
      const icFV = avgRateMonth > 0 ? icShare * Math.pow(1 + avgRateMonth, horizon * 12) : icShare;
      const futureValue = sipFV + icFV;
      proj += futureValue;

      // Outer Donut Aggregation
      const cat = rec.cat || rec.category || 'Other';
      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += rec.monthly_allocation;

      // Inner Donut
      innerMap.push({
        name: rec.abbr || rec.name,
        value: rec.monthly_allocation,
        color: rec.color || CATEGORY_COLORS[cat] || DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length]
      });
      colorIndex++;

      // Table Data grouping
      if (!tableGroupMap[cat]) tableGroupMap[cat] = [];
      tableGroupMap[cat].push({
        instId: rec.id,
        name: rec.abbr || rec.name,
        fullName: rec.name,
        weight: 0, // calculated later
        ret: `${rateMin.toFixed(1)}-${rate.toFixed(1)}%`,
        risk: rec.riskLabel || rec.risk_level || 'Medium',
        alloc: rec.monthly_allocation,
        current: (rec.monthly_allocation * 12).toLocaleString(),
        proj: (futureValue / 100000).toFixed(2) + 'L',
        lockIn: rec.lock_in_years || rec.lockIn || 0,
        taxBadge: rec.taxType === "eee" || rec.taxType === "elss" || rec.taxType === "nps" || rec.tax_benefit,
        taxLabel: rec.taxType === "eee" ? "EEE" : rec.taxType === "elss" ? "80C" : rec.taxType === "nps" ? "80CCD" : rec.tax_section || null,
        source: rec._source || null
      });
    });

    const outerData = Object.keys(catMap).map(k => ({
      name: k,
      value: catMap[k],
      color: CATEGORY_COLORS[k] || '#888'
    }));

    // Calculate weights and format table
    const formattedTable = Object.keys(tableGroupMap).map((cat, i) => {
      const children = tableGroupMap[cat].map(c => {
         c.weight = (c.alloc / totalMonthly) * 100;
         return c;
      });
      return {
        id: i.toString(),
        class: cat,
        hasTax: children.some(c => c.taxBadge),
        children
      }
    });

    // Step-up SIP FV helper for trajectory
    const calcStepUpFV = (monthlySIP, annualRate, years) => {
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

    // Generate performance trajectory points (0, 1/3, 2/3, horizon)
    const points = [0, Math.floor(horizon / 3), Math.floor((horizon * 2) / 3), horizon];
    const perfData = points.map(yr => {
      let worst = 0, avg = 0, best = 0;
      if (yr === 0) {
        return { year: yr.toString(), worst: initialCapital + totalMonthly, average: initialCapital + totalMonthly, best: initialCapital + totalMonthly };
      }
      activeRecs.forEach(r => {
         let rate = r.rate || r.expected_return_max || 10;
         let minRate = r.expected_return_min || (rate * 0.65);
         
         if (inflationAdjusted) {
             rate = Math.max(0, rate - 6.0);
             minRate = Math.max(0, minRate - 6.0);
         }
         
         const midRate = minRate * 0.4 + rate * 0.6;
         // Step-up SIP FV for each scenario
         worst += calcStepUpFV(r.monthly_allocation, minRate, yr);
         best += calcStepUpFV(r.monthly_allocation, rate, yr);
         avg += calcStepUpFV(r.monthly_allocation, midRate, yr);
      });
      
      // Initial capital compounding (proportional across instruments — use blended rate)
      const blendedRate = inflationAdjusted ? 0.06 : 0.12;
      const initialFV = initialCapital * Math.pow(1 + blendedRate, yr);
      worst += initialFV * 0.9;
      avg += initialFV;
      best += initialFV * 1.1;
      
      return { year: yr.toString(), worst, average: avg, best };
    });

    return {
      allocationDataOuter: outerData,
      tableData: formattedTable,
      performanceData: perfData,
      currentMonthly: totalMonthly,
      totalProjected: proj
    };
  }, [recommendations, horizon, inflationAdjusted, initialCapital, stepUpPct]);

  useEffect(() => {
    const initialExpanded = {};
    tableData.forEach(t => { initialExpanded[t.id] = true; });
    setExpandedRows(initialExpanded);
  }, [tableData]);

  // Risk-grouped eligible instruments for "Browse by Risk Level"
  const riskGroups = useMemo(() => {
    if (!recommendations || recommendations.length === 0) return { low: [], medium: [], high: [] };
    
    return {
      low: recommendations.filter(r => (r.risk || 0) <= 2),
      medium: recommendations.filter(r => (r.risk || 0) === 3),
      high: recommendations.filter(r => (r.risk || 0) >= 4),
    };
  }, [recommendations]);

  const benchMarkData = useMemo(() => {
    // Compute user's weighted portfolio CAGR from recommendations
    let weightedReturn = 0;
    if (recommendations && recommendations.length > 0 && currentMonthly > 0) {
      recommendations.forEach(r => {
        const weight = r.monthly_allocation / currentMonthly;
        const rate = r.rate || r.expected_return_max || 0;
        weightedReturn += weight * rate;
      });
    }

    const portfolioBar = { name: 'Your Portfolio', value: parseFloat(weightedReturn.toFixed(1)), fill: '#dfbd69' };

    // Goal-aware benchmark selection
    const primaryGoal = (userProfile?.investment_goals || [])[0];
    if (primaryGoal === 'Emergency Fund') {
      return [
        portfolioBar,
        { name: 'Savings A/c', value: 3.5, fill: '#546178' },
        { name: 'RBI Repo', value: 6.5, fill: '#22d3ee' },
        { name: 'Best FD 1yr', value: 7.5, fill: '#4ade80' },
      ];
    }
    if (primaryGoal === 'Tax Saving') {
      return [
        portfolioBar,
        { name: 'FD Post-Tax', value: 6.9, fill: '#546178' },
        { name: 'PPF', value: 7.1, fill: '#4ade80' },
        { name: 'Nifty 50 5yr', value: 12.1, fill: '#ecc94b' },
      ];
    }
    // Default: Retirement / Wealth Growth
    return [
      portfolioBar,
      { name: 'Global 60/40', value: 7.2, fill: '#546178' },
      { name: 'S&P 500 15yr', value: 10.5, fill: '#9f7aea' },
      { name: 'Nifty 50 15yr', value: 12.1, fill: '#ecc94b' },
    ];
  }, [recommendations, currentMonthly, userProfile]);

  // Scroll to recommendation card
  const scrollToCard = (name) => {
    const el = document.getElementById(`rec-card-${name}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="dashboard-page">
      <style>{`
        /* Scoped overrides for dashboard parameter range sliders */
        .dash-range {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 100% !important;
          background: transparent !important;
          height: 20px !important;
          outline: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-sizing: border-box !important;
        }

        .dash-range::-webkit-slider-runnable-track {
          width: 100% !important;
          height: 4px !important;
          background: linear-gradient(to right, var(--accent-teal) var(--value, 0%), rgba(255, 255, 255, 0.06) var(--value, 0%)) !important;
          border-radius: 2px !important;
          border: none !important;
          box-sizing: border-box !important;
        }

        .dash-range::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 12px !important;
          width: 12px !important;
          border-radius: 50% !important;
          background: #ffffff !important;
          border: 2.5px solid var(--accent-teal) !important;
          cursor: pointer !important;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3) !important;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease !important;
          margin-top: -4px !important;
          box-sizing: border-box !important;
        }

        .dash-range::-webkit-slider-thumb:hover {
          transform: scale(1.2) !important;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4) !important;
        }

        .dash-range::-moz-range-track {
          width: 100% !important;
          height: 4px !important;
          background: rgba(255, 255, 255, 0.06) !important;
          border-radius: 2px !important;
          border: none !important;
          box-sizing: border-box !important;
        }

        .dash-range::-moz-range-thumb {
          height: 12px !important;
          width: 12px !important;
          border-radius: 50% !important;
          background: #ffffff !important;
          border: 2.5px solid var(--accent-teal) !important;
          cursor: pointer !important;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3) !important;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease !important;
          box-sizing: border-box !important;
        }

        .dash-range::-moz-range-thumb:hover {
          transform: scale(1.2) !important;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4) !important;
        }
      `}</style>
      <div className="dashboard-container" style={{maxWidth: 1600, margin: '0 auto'}}>
        
        <div className="dashboard-header" style={{position: 'relative', paddingBottom: 20, marginBottom: 6}}>
          <div className="dashboard-title-group">
            <span className="dashboard-subtitle">YOUR PERSONAL SAVINGS & INVESTMENT PLAN</span>
            <h1 className="dashboard-title" style={{fontSize: '1.8rem'}}>
              Your Personal Wealth Plan <span style={{ 
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)', 
                WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' 
              }}>{userProfile?.name ? `for ${userProfile.name}` : ''}</span>
            </h1>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(10, 16, 30, 0.7)', backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.06)', 
              padding: '6px 14px', borderRadius: 20, fontSize: '0.72rem', color: '#94a3b8'
            }}>
              <span style={{width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulseDot 2s ease-in-out infinite'}} />
              Age {userProfile?.age || '--'} · {userProfile?.risk_appetite || 'Medium'} Risk · {(userProfile?.investment_goals || ['Retirement']).join(' + ')}
            </div>
            <span className="last-updated">
               {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          {/* Gradient divider */}
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.15), rgba(139,92,246,0.1), transparent)'}} />
        </div>


        <BackendFallbackBanner notice={fallbackNotice} onDismiss={onDismissFallbackNotice} />

        {/* ─── ELEVATED FINANCIAL PROFILE BANNER AT START AFTER LOGIN ─── */}
        {(() => {
          const monthlyIncome = Number(userProfile?.monthly_income) || (userProfile?.annual_income ? userProfile.annual_income / 12 : 65000);
          const monthlySavings = Number(userProfile?.monthly_savings) || 12000;
          const savingsRate = monthlyIncome > 0 ? ((monthlySavings / monthlyIncome) * 100).toFixed(0) : '18';
          const annualIncomeLakhs = (monthlyIncome * 12 / 100000).toFixed(1);

          return (
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.88) 100%)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderLeft: '4px solid #38bdf8',
              borderRadius: 16,
              padding: '14px 22px',
              marginBottom: 18,
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              flexWrap: 'wrap',
              gap: 16
            }}>
              {/* Ambient Background Glow */}
              <div style={{
                position: 'absolute', top: -40, right: -40, width: 180, height: 180,
                background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12), transparent 70%)',
                pointerEvents: 'none'
              }} />

              {/* Left Group: Avatar + Name + Regime Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 1 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(129, 140, 248, 0.18))',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#38bdf8', flexShrink: 0,
                  boxShadow: '0 4px 16px rgba(56, 189, 248, 0.15)'
                }}>
                  <User size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.3px' }}>
                      {userProfile?.name || 'Investor Financial Profile'}
                    </h3>
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px',
                      background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase'
                    }}>
                      {userProfile?.taxRegime || userProfile?.tax_regime ? `${(userProfile.taxRegime || userProfile.tax_regime).toUpperCase()} REGIME` : 'NEW REGIME'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Middle Group: Sleek Micro Metric Chips with Lucide Icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, justifyContent: 'center', zIndex: 1 }}>
                {/* Age */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.09)',
                  borderRadius: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                }}>
                  <Calendar size={13} color="#94a3b8" />
                  <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Age</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f1f5f9' }}>{userProfile?.age || 35}</span>
                </div>

                {/* Income */}
                <div style={{
                  background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.18)',
                  borderRadius: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(56, 189, 248, 0.08)'
                }}>
                  <Wallet size={13} color="#38bdf8" />
                  <span style={{ fontSize: '0.6rem', color: '#38bdf8', opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Income</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8' }}>₹{annualIncomeLakhs}L/yr</span>
                </div>

                {/* Savings */}
                <div style={{
                  background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.18)',
                  borderRadius: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.08)'
                }}>
                  <PiggyBank size={13} color="#4ade80" />
                  <span style={{ fontSize: '0.6rem', color: '#4ade80', opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Savings</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#4ade80' }}>₹{monthlySavings.toLocaleString()} <span style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>({savingsRate}%)</span></span>
                </div>

                {/* Horizon */}
                <div style={{
                  background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.18)',
                  borderRadius: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.08)'
                }}>
                  <Clock size={13} color="#818cf8" />
                  <span style={{ fontSize: '0.6rem', color: '#818cf8', opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Horizon</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#818cf8' }}>{horizon} Yrs</span>
                </div>
              </div>

              {/* Right Group: Risk Comfort Badge + Edit Profile Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 1 }}>
                <div style={{
                  background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '6px 14px', borderRadius: 12, textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Risk Comfort</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: derivedRiskLabel === 'High' ? '#f43f5e' : derivedRiskLabel === 'Low' ? '#22c55e' : '#dfbd69' }}>
                    {derivedRiskLabel}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('profile')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '9px 16px', borderRadius: 12,
                    background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                    color: '#0f172a', fontWeight: 800, fontSize: '0.8rem',
                    border: 'none', cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(56, 189, 248, 0.28)',
                    transition: 'all 0.2s ease', letterSpacing: '-0.2px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Edit3 size={15} />
                  Edit Profile
                </button>
              </div>
            </div>
          );
        })()}





        {/* ELIGIBILITY NOTICE */}
        {excludedCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            background: isEmergencyFundGoal ? 'rgba(34, 197, 94, 0.04)' : 'rgba(56, 189, 248, 0.04)',
            border: `1px solid ${isEmergencyFundGoal ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.1)'}`,
            borderRadius: 12, marginBottom: 14, fontSize: '0.78rem', color: '#94a3b8'
          }}>
            <Info size={16} color={isEmergencyFundGoal ? '#22c55e' : '#38bdf8'} style={{ flexShrink: 0 }} />
            <span>
              {isEmergencyFundGoal ? (
                <>
                  Showing <strong style={{ color: '#e2e8f0' }}>{eligibleCount} liquid instruments</strong> for Emergency Fund.{' '}
                  <strong style={{ color: '#e2e8f0' }}>{excludedCount}</strong> excluded (lock-in / liquidity mismatch).
                </>
              ) : (
                <>
                  <strong style={{ color: '#e2e8f0' }}>{displayedCount}/{totalInstruments}</strong> instruments shown.{' '}
                  {totalInstruments - eligibleCount > 0 && <>{totalInstruments - eligibleCount} excluded by profile filters. </>}
                  {eligibleCount > displayedCount && (
                    <span>Top {displayedCount} ranked from {eligibleCount} eligible.</span>
                  )}
                </>
              )}
            </span>
          </div>
        )}

        {/* ─── RISK-AGE MISMATCH WARNING (Fix 2) ─── */}
        {riskAgeMismatch.flag && !mismatchDismissed && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px',
            background: riskAgeMismatch.severity === 'warning' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(14, 165, 233, 0.06)',
            border: `1px solid ${riskAgeMismatch.severity === 'warning' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(14, 165, 233, 0.2)'}`,
            borderRadius: 12, marginBottom: 12, fontSize: '0.78rem', lineHeight: 1.5
          }}>
            <AlertCircle size={18} color={riskAgeMismatch.severity === 'warning' ? '#f59e0b' : '#0ea5e9'} style={{flexShrink: 0, marginTop: 1}} />
            <div style={{flex: 1}}>
              <div style={{fontWeight: 700, color: riskAgeMismatch.severity === 'warning' ? '#fbbf24' : '#38bdf8', marginBottom: 4, fontSize: '0.82rem'}}>
                {riskAgeMismatch.title}
              </div>
              <div style={{color: '#94a3b8', marginBottom: 4}}>{riskAgeMismatch.message}</div>
              <div style={{color: '#cbd5e1', fontSize: '0.72rem'}}>{riskAgeMismatch.recommendation}</div>
            </div>
            <button onClick={() => setMismatchDismissed(true)} style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
              color: '#94a3b8', fontSize: '0.68rem', padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit'
            }}>Dismiss</button>
          </div>
        )}

        <div className="status-bar" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 20
        }}>
          {(() => {
            const goals = userProfile?.investment_goals || [];
            const allocatedGoals = goals.filter(g => {
              const sipToGoal = (recommendations || [])
                .filter(r => (r.suitable_for_goals || []).includes(g))
                .reduce((sum, r) => sum + (r.monthly_allocation || 0), 0);
              return sipToGoal > 0;
            });
            const alignmentRatio = goals.length > 0 ? allocatedGoals.length / goals.length : 1;
            const status = alignmentRatio >= 0.7 ? 'On-Track' : alignmentRatio >= 0.4 ? 'At Risk' : 'Off-Track';
            const statusColor = status === 'On-Track' ? '#4ade80' : status === 'At Risk' ? '#f59e0b' : '#ef4444';
            const budgetUsed = userProfile?.monthly_savings ? ((currentMonthly / userProfile.monthly_savings) * 100).toFixed(0) : 100;
            return (
              <>
                <div className="status-item" style={{
                  background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(56, 189, 248, 0.18)',
                  borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                }}>
                  <Target size={15} color="#38bdf8" style={{flexShrink:0}} />
                  <span style={{color:'#94a3b8', fontWeight:600, fontSize:'0.75rem'}}>Goal</span>
                  <span style={{marginLeft:'auto', display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                    {goals.map((g, i) => (
                      <span key={i} style={{
                        background: 'rgba(56, 189, 248, 0.12)', 
                        border: '1px solid rgba(56, 189, 248, 0.25)', 
                        padding: '2px 8px', borderRadius: 20, 
                        fontSize: '0.66rem', fontWeight: 700, color: '#38bdf8'
                      }}>{g}</span>
                    ))}
                  </span>
                </div>

                <div className="status-item" style={{
                  background: 'rgba(15, 23, 42, 0.65)', border: `1px solid ${statusColor}30`,
                  borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                }}>
                  <Activity size={15} color={statusColor} style={{flexShrink:0}} />
                  <span style={{color:'#94a3b8', fontWeight:600, fontSize:'0.75rem'}}>Status</span>
                  <span style={{
                    marginLeft:'auto', color: statusColor, fontWeight: 800, fontSize: '0.78rem',
                    background: `${statusColor}15`, padding: '2px 10px', borderRadius: 20,
                    border: `1px solid ${statusColor}30`, display: 'inline-flex', alignItems: 'center', gap: 4
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                    {status}
                  </span>
                </div>

                <div className="status-item" style={{
                  background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(223, 189, 105, 0.18)',
                  borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                }}>
                  <PiggyBank size={15} color="#dfbd69" style={{flexShrink:0}} />
                  <span style={{color:'#94a3b8', fontWeight:600, fontSize:'0.75rem'}}>SIP Budget</span>
                  <span style={{marginLeft:'auto', fontWeight: 800, color: '#e2e8f0', fontSize: '0.85rem'}}>₹{(userProfile?.monthly_savings || 0).toLocaleString()}</span>
                </div>

                <div className="status-item" style={{
                  background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(56, 189, 248, 0.18)',
                  borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                }}>
                  <Wallet size={15} color={currentMonthly === (userProfile?.monthly_savings || 0) ? '#4ade80' : '#f59e0b'} style={{flexShrink:0}} />
                  <span style={{color:'#94a3b8', fontWeight:600, fontSize:'0.75rem'}}>Allocated</span>
                  <span style={{marginLeft:'auto', color: currentMonthly === (userProfile?.monthly_savings || 0) ? '#4ade80' : '#f59e0b', fontWeight: 800, fontSize: '0.85rem'}}>
                    ₹{currentMonthly.toLocaleString()} <span style={{fontSize:'0.68rem', color:'#64748b', fontWeight: 600}}>({budgetUsed}%)</span>
                  </span>
                </div>

                <div className="status-item" style={{
                  background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(139, 92, 246, 0.18)',
                  borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
                }}>
                  <Clock size={15} color="#8b5cf6" style={{flexShrink:0}} />
                  <span style={{color:'#94a3b8', fontWeight:600, fontSize:'0.75rem'}}>Horizon</span>
                  <span style={{marginLeft:'auto', fontWeight: 800, color: '#818cf8', fontSize: '0.85rem'}}>{horizon} Yrs</span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Top Grid (3 columns) */}
        <div className="top-row-grid">
           
          {/* Panel 1: Portfolio Parameters */}
          <div className="panel-card">
            <div className="panel-header">
               <span className="panel-title">Adjust Your Settings</span>
            </div>

            <div className="param-row">
              <span>Investment Horizon</span>
              <span style={{color: '#e2e8f0', fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>{horizon} <span style={{color:'#64748b', fontWeight:400}}>Yrs</span></span>
            </div>
            <input type="range" min="1" max="30" value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="dash-range" style={{'--value': `${(horizon/30)*100}%`, marginBottom: 16}} />

            <div className="param-row" style={{ marginTop: 10 }}>
              <span><JargonTooltip term="SIP">Monthly SIP</JargonTooltip></span>
              <span style={{color: '#4ade80', fontWeight: 700, fontSize: '0.9rem'}}>₹{currentMonthly.toLocaleString()}</span>
            </div>

            <div style={{height: 1, background: 'rgba(255,255,255,0.04)', margin: '14px 0'}} />

            <div className="param-row">
              <span><JargonTooltip term="Risk Profile">Risk Comfort Level</JargonTooltip></span>
              <span style={{background: derivedRiskLabel === 'High' ? 'rgba(244, 63, 94, 0.12)' : derivedRiskLabel === 'Low' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(223, 189, 105, 0.12)', color: derivedRiskLabel === 'High' ? '#f43f5e' : derivedRiskLabel === 'Low' ? '#22c55e' : '#dfbd69', padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.5px', border: `1px solid ${derivedRiskLabel === 'High' ? 'rgba(244, 63, 94, 0.2)' : derivedRiskLabel === 'Low' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(223, 189, 105, 0.2)'}`}}>{derivedRiskLabel}</span>
            </div>
            <input type="range" min="1" max="10" value={riskValue} onChange={e => setRiskValue(e.target.value)} className="dash-range" style={{'--value': `${((riskValue - 1) / 9) * 100}%`}} />
            <div className="risk-scale">
               {[1,2,3,4,5,6,7,8,9,10].map(v => <span key={v}>{v}</span>)}
            </div>
          </div>

          {/* Panel 2: Multi-Layered Asset Allocation */}
          <div className="panel-card" style={{ position: 'relative' }}>
            <div className="panel-header" style={{ marginBottom: 8 }}>
               <span className="panel-title"><JargonTooltip term="Asset Allocation">Your Investment Mix</JargonTooltip></span>
            </div>
            <div style={{ height: 200, position: 'relative' }}>
              {isLoading ? (
                 <div className="skeleton-box" style={{ width: '160px', height: '160px', borderRadius: '50%', margin: '20px auto' }} />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={allocationDataOuter} 
                        dataKey="value" 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={60} 
                        outerRadius={88} 
                        stroke="rgba(2, 6, 23, 0.8)"
                        strokeWidth={2}
                        paddingAngle={2}
                        cornerRadius={4}
                      >
                        {allocationDataOuter.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        formatter={(val) => [`₹${val.toLocaleString()}/mo`, 'Allocation']} 
                        contentStyle={{
                          background: 'rgba(15, 23, 42, 0.95)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)', 
                          borderRadius: 12, 
                          backdropFilter: 'blur(16px)', 
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                          fontSize: '0.82rem'
                        }} 
                        itemStyle={{color: '#e2e8f0'}} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center projected value */}
                   <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: '100%' }}>
                     {(() => {
                       const val = Number(totalProjected) || 0;
                       if (val >= 10000000) {
                         return (
                           <>
                             <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 20px rgba(56,189,248,0.15)' }}>₹{(val / 10000000).toFixed(2)}</div>
                             <div style={{ fontSize: '0.55rem', color: '#546178', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 3, fontWeight: 700 }}>CRORES AVG.</div>
                           </>
                         );
                       }
                       return (
                         <>
                           <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 20px rgba(56,189,248,0.15)' }}>₹{(val / 100000).toFixed(1)}</div>
                           <div style={{ fontSize: '0.55rem', color: '#546178', letterSpacing: '2px', textTransform: 'uppercase', marginTop: 3, fontWeight: 700 }}>LAKHS AVG.</div>
                         </>
                       );
                     })()}
                   </div>
                 </>
               )}
            </div>
            {/* Category legend with proportion bars */}
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px 0', marginTop: 8 }}>
              {(() => {
                // Pre-compute percentages using largest-remainder method so they always sum to 100%
                const rawPcts = allocationDataOuter.map(item =>
                  currentMonthly > 0 ? (item.value / currentMonthly) * 100 : 0
                );
                const floored = rawPcts.map(p => Math.floor(p));
                let remainder = 100 - floored.reduce((s, f) => s + f, 0);
                // Distribute remainder to items with largest fractional parts
                const fracs = rawPcts.map((p, i) => ({ i, frac: p - floored[i] }));
                fracs.sort((a, b) => b.frac - a.frac);
                for (let k = 0; k < remainder && k < fracs.length; k++) {
                  floored[fracs[k].i]++;
                }
                return allocationDataOuter.map((item, i) => {
                  const pct = floored[i];
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.75rem',
                      padding: '4px 8px', borderRadius: 8, transition: 'background 0.2s ease', cursor: 'default'
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0,
                        boxShadow: `0 0 6px ${item.color}40`
                      }} />
                      <span style={{color: '#cbd5e1', flex: 1, fontSize: '0.75rem', fontWeight: 500}}>{item.name}</span>
                      <div style={{width: 52, height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden', flexShrink: 0}}>
                        <div style={{width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${item.color}cc, ${item.color})`, borderRadius: 3, transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)'}} />
                      </div>
                      <span style={{color: '#f1f5f9', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right', fontSize: '0.78rem'}}>{pct}%</span>
                    </div>
                  );
                });
              })()}
             </div>
          </div>

          {/* Panel 3: Wealth Trajectory / Emergency Fund Timeline */}
          <div className="panel-card">
             <div className="panel-header">
               <span className="panel-title">
                 {(userProfile?.investment_goals || [])[0] === 'Emergency Fund'
                   ? 'Goal Achievement Timeline'
                   : 'Wealth Trajectory'}
               </span>
            </div>

            {(() => {
              const isEF = (userProfile?.investment_goals || [])[0] === 'Emergency Fund';

              if (isEF) {
                // FIX 5: Emergency Fund — correct month-by-month timeline
                const income = Number(userProfile?.monthly_income) || 0;
                const savings = Number(userProfile?.monthly_savings) || 0;
                const monthlyExpenses = income - savings;
                const emergencyTarget = monthlyExpenses * 6;
                // Use blended post-tax rate for liquid portfolio (approx 6.65%)
                const postTaxAnnualRate = 0.0665;
                const r = postTaxAnnualRate / 12;

                // Generate month-by-month data to find exact crossing
                let targetMonthReached = null;
                const efData = [];
                let balance = 0;
                // Extend chart 3 months past target for visual buffer
                const simpleMonths = Math.ceil(emergencyTarget / (savings || 1));
                const maxMonths = Math.min(simpleMonths + 3, 60);
                for (let m = 0; m <= maxMonths; m++) {
                  if (m > 0) balance = (balance + savings) * (1 + r);
                  efData.push({ month: m, value: Math.round(balance), target: emergencyTarget });
                  if (balance >= emergencyTarget && targetMonthReached === null) {
                    targetMonthReached = m;
                  }
                }
                // If target never reached within maxMonths, use simple calc
                if (targetMonthReached === null) targetMonthReached = simpleMonths;

                // Downsample for chart readability (max ~12 points)
                const step = Math.max(1, Math.floor(maxMonths / 12));
                const chartData = efData.filter((_, i) => i === 0 || i === targetMonthReached || i === maxMonths || i % step === 0);

                return (
                  <>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 6, padding: '5px 10px', background: 'rgba(10,16,30,0.5)', borderRadius: 8, display: 'inline-block', border: '1px solid rgba(255,255,255,0.03)' }}>
                      Target: ₹{(emergencyTarget/100000).toFixed(1)}L · {targetMonthReached} months @ ₹{savings.toLocaleString()}/mo
                    </div>
                    <div style={{ height: 200, fontSize: '0.7rem' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{top: 10, right: 30, left: -20, bottom: 0}}>
                          <defs>
                            <linearGradient id="colorEF" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="month" tick={{fill: '#94a3b8', fontSize: 11}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}mo`} />
                          <YAxis tick={{fill: '#94a3b8', fontSize: 11}} axisLine={false} tickLine={false} tickFormatter={(val) => {
                            if (val >= 100000) return `₹${(val/100000).toFixed(1)}L`;
                            return `₹${(val/1000).toFixed(0)}K`;
                          }} />
                          <RechartsTooltip formatter={(val) => `₹${Math.round(val).toLocaleString()}`} contentStyle={{background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 12, backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'}} itemStyle={{color: '#f8fafc'}} />
                          <ReferenceLine y={emergencyTarget} stroke="#fbbf24" strokeDasharray="6 4" label={{ value: `Target ₹${(emergencyTarget/100000).toFixed(1)}L`, fill: '#fbbf24', fontSize: 11, position: 'right' }} />
                          <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorEF)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* FIX 2: Surplus redirect panel */}
                    {targetMonthReached < (horizon * 12) && (
                      <div style={{
                        marginTop: 12, padding: '14px 16px', borderRadius: 12,
                        background: 'rgba(34, 197, 94, 0.06)',
                        border: '1px solid rgba(34, 197, 94, 0.15)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: '#22c55e' }}>✓</span>
                          <strong style={{ fontSize: '0.85rem', color: '#22c55e' }}>Goal on track — plan your surplus</strong>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                          Your Emergency Fund target of ₹{(emergencyTarget/100000).toFixed(1)}L is achievable in approximately {targetMonthReached} months.
                          The remaining {(horizon * 12) - targetMonthReached} months of contributions
                          (≈ ₹{(savings * ((horizon * 12) - targetMonthReached) / 100000).toFixed(1)}L) can be redirected toward a new goal.
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => onNavigate && onNavigate('goal-planner')} style={{
                            background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)',
                            color: '#22c55e', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem',
                            cursor: 'pointer', fontWeight: 600
                          }}>Set a new goal for surplus →</button>
                          <button onClick={() => onNavigate && onNavigate('sip-planner')} style={{
                            background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)',
                            color: '#06b6d4', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem',
                            cursor: 'pointer', fontWeight: 600
                          }}>Increase SIP after target →</button>
                        </div>
                      </div>
                    )}
                  </>
                );
              }

              // Default: Wealth Trajectory
              return (
                <>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: '0.7rem', padding: '6px 12px', background: 'rgba(10,16,30,0.5)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)', width: 'fit-content' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 16, height: 3, background: '#38bdf8', borderRadius: 2, display: 'inline-block', boxShadow: '0 0 4px rgba(56,189,248,0.4)' }} />
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>Projected Growth</span>
                    </span>
                  </div>
                  <div style={{ height: 240, fontSize: '0.72rem' }}>
                    {isLoading ? (
                       <div style={{ display: 'flex', gap: 10, height: '100%', alignItems: 'flex-end', paddingBottom: 20 }}>
                          <div className="skeleton-box" style={{ width: '25%', height: '30%' }} />
                          <div className="skeleton-box" style={{ width: '25%', height: '50%' }} />
                          <div className="skeleton-box" style={{ width: '25%', height: '70%' }} />
                          <div className="skeleton-box" style={{ width: '25%', height: '100%' }} />
                       </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={performanceData} margin={{top: 10, right: 20, left: -10, bottom: 0}}>
                          <defs>
                            <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="year" tick={{fill: '#cbd5e1', fontSize: 11, fontWeight: 500}} axisLine={false} tickLine={false} tickFormatter={(val) => `${val} yrs`} />
                          <YAxis tick={{fill: '#cbd5e1', fontSize: 11, fontWeight: 500}} axisLine={false} tickLine={false} tickFormatter={(val) => {
                            if (val >= 10000000) return `\u20b9${(val/10000000).toFixed(1)}Cr`;
                            if (val >= 100000) return `\u20b9${(val/100000).toFixed(1)}L`;
                            return `\u20b9${(val/1000).toFixed(0)}K`;
                          }} />
                          <RechartsTooltip formatter={(val) => `\u20b9${Math.round(val).toLocaleString()}`} contentStyle={{background: 'rgba(15, 23, 42, 0.92)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 12, backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)', fontSize: '0.78rem'}} itemStyle={{color: '#f8fafc'}} />
                          <Area type="monotone" dataKey="average" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAvg)" dot={false} activeDot={{r: 4, fill: '#38bdf8', stroke: '#fff', strokeWidth: 2}} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {/* Projected endpoint summary */}
                  {!isLoading && performanceData.length > 0 && (() => {
                    const last = performanceData[performanceData.length - 1];
                    const fmt = (v) => v >= 10000000 ? `\u20b9${(v/10000000).toFixed(2)}Cr` : `\u20b9${(v/100000).toFixed(1)}L`;
                    return (
                      <div style={{display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 10}}>
                        <div style={{background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.1)', borderRadius: 10, padding: '8px 10px', textAlign: 'center'}}>
                          <div style={{fontSize: '0.65rem', color: '#546178', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 3}}>Projected Total Value</div>
                          <div style={{fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', fontVariantNumeric: 'tabular-nums'}}>{fmt(last.average)}</div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>

        </div>

        {/* Section divider */}
        <div style={{height: 1, margin: '12px 0', background: 'linear-gradient(90deg, transparent 5%, rgba(56,189,248,0.1) 30%, rgba(139,92,246,0.08) 70%, transparent 95%)'}} />

        {/* Bottom Grid (70/30) */}
        <div className="bottom-row-grid">
          
          {/* Table Panel */}
          <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="panel-header" style={{ padding: '18px 20px 12px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
               <span className="panel-title" style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '2px' }}>
                 <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.15)', marginRight: 8}}>
                   <span style={{color: '#38bdf8', fontSize: '0.6rem', fontWeight: 900}}>✓</span>
                 </span>
                 VERIFIED PORTFOLIO
               </span>
               <div style={{display: 'flex', gap: 8}}>
                 <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                   <option value="all">All Categories</option>
                   <option value="equity">Equity Only</option>
                   <option value="government">Government</option>
                   <option value="has-tax-benefit">Tax Benefit</option>
                   <option value="low-risk-only">Low Risk</option>
                 </select>
                 <select value={sortField} onChange={e => setSortField(e.target.value)}>
                   <option value="">Sort by…</option>
                   <option value="weight_desc">Weight ↓</option>
                   <option value="return_desc">Return ↓</option>
                   <option value="risk_asc">Risk ↑</option>
                   <option value="projection_desc">Projection ↓</option>
                   <option value="sip_asc">SIP ↑</option>
                 </select>
               </div>
            </div>

            {/* FIX 7: Responsive scrollable wrapper */}
            <div className="portfolio-table-wrapper" style={{ marginTop: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="dense-table">
                <thead>
                  <tr>
                    <th style={{ width: '10%', paddingLeft: 32 }}>Tax Benefit</th>
                    <th style={{ width: '22%' }}>Security Name</th>
                    <th style={{ width: '9%' }}>Match</th>
                    <th className="col-weight" style={{ width: '10%' }}>Weight %</th>
                    <th className="col-exp-return" style={{ width: '13%' }}>Exp. Return</th>
                    <th className="col-risk-level" style={{ width: '10%' }}>Risk Level</th>
                    <th style={{ width: '12%' }}>Monthly SIP</th>
                    <th style={{ width: '10%', whiteSpace: 'normal', paddingRight: 20, textAlign: 'right', lineHeight: 1.2 }}>Projected<br/>({horizon} Yrs)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    /* FIX 6: Enhanced skeleton loader */
                    Array(8).fill(0).map((_, i) => (
                      <tr key={i}>
                        <td colSpan="8" style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', gap: 16 }}>
                            <div className="skeleton-box" style={{ height: 16, flex: 2 }} />
                            <div className="skeleton-box" style={{ height: 16, flex: 1 }} />
                            <div className="skeleton-box" style={{ height: 16, flex: 1 }} />
                            <div className="skeleton-box" style={{ height: 16, flex: 1 }} />
                            <div className="skeleton-box" style={{ height: 16, flex: 1 }} />
                            <div className="skeleton-box" style={{ height: 16, flex: 1 }} />
                            <div className="skeleton-box" style={{ height: 16, flex: 1 }} />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : tableData.length === 0 ? (
                    <tr>
                       <td colSpan="8" style={{textAlign:'center', padding: 48}}>
                         <Info size={48} color="#94a3b8" style={{opacity: 0.5, margin: '0 auto 16px auto', display: 'block'}} />
                         <div style={{fontSize: '1rem', color: '#94a3b8'}}>No recommendations match your criteria.</div>
                       </td>
                    </tr>
                  ) : (
                   tableData
                     .filter(group => {
                       if (filterType === 'all') return true;
                       if (filterType === 'equity') return group.class.toLowerCase().includes('equity');
                       if (filterType === 'government') return group.class.toLowerCase().includes('government');
                       if (filterType === 'has-tax-benefit') return group.hasTax;
                       if (filterType === 'low-risk-only') return group.children.every(c => ['very low','low'].includes(c.risk?.toLowerCase()));
                       return true;
                     })
                     .map((group) => {
                       const sortedChildren = [...group.children].sort((a, b) => {
                         const riskOrder = { 'Very Low': 0, 'Low': 1, 'Medium': 2, 'High': 3, 'Very High': 4 };
                         switch (sortField) {
                           case 'weight_desc': return b.weight - a.weight;
                           case 'return_desc': return parseFloat(b.ret) - parseFloat(a.ret);
                           case 'risk_asc': return (riskOrder[a.risk] || 2) - (riskOrder[b.risk] || 2);
                           case 'projection_desc': return parseFloat(b.proj) - parseFloat(a.proj);
                           case 'sip_asc': return a.alloc - b.alloc;
                           default: return 0;
                         }
                       });
                       return (
                    <React.Fragment key={group.id}>
                      <tr style={{ 
                        background: expandedRows[group.id] 
                          ? 'linear-gradient(90deg, rgba(56, 189, 248, 0.06) 0%, rgba(15, 23, 42, 0.4) 100%)' 
                          : 'rgba(255,255,255,0.015)',
                        borderTop: '1px solid rgba(255,255,255,0.04)'
                      }}>
                        <td colSpan="8" style={{ padding: 0, borderBottom: 'none', borderLeft: `3px solid ${
                          (group.class || '').toLowerCase().includes('equity') ? '#38bdf8' 
                          : (group.class || '').toLowerCase().includes('government') ? '#4ade80' 
                          : (group.class || '').toLowerCase().includes('debt') || (group.class || '').toLowerCase().includes('hybrid') ? '#8b5cf6' 
                          : (group.class || '').toLowerCase().includes('commodity') ? '#dfbd69' : '#546178'
                        }`, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }}>
                          <div style={{ 
                            display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
                            fontSize: '0.88rem', fontWeight: 700, color: expandedRows[group.id] ? '#38bdf8' : '#e2e8f0',
                            transition: 'color 0.2s ease', gap: 6
                          }} onClick={() => toggleRow(group.id)}>
                            {expandedRows[group.id] ? <ChevronDown size={14} className="toggle-icon"/> : <ChevronRight size={14} className="toggle-icon"/>}
                            {group.class} 
                            <span style={{fontSize: '0.65rem', color: '#546178', fontWeight: 500, marginLeft: 4}}>{(group.children || []).length} instruments</span>
                            {group.hasTax && <span className="tax-badge" style={{marginLeft: 8}}>Tax Savings</span>}
                          </div>
                        </td>
                      </tr>
                      {expandedRows[group.id] && sortedChildren.map((child, idx) => {
                        const isUnfunded = child.weight < 0.1 || child.alloc === 0;
                        return (
                          <tr key={`${group.id}-${idx}`} style={{ opacity: isUnfunded ? 0.6 : 1 }}>
                            <td style={{ paddingLeft: 32 }}>
                               {child.taxBadge ? <span className="tax-badge">{child.taxLabel || 'Tax'}</span> : <span style={{color: '#475569', fontSize: '0.75rem'}}>—</span>}
                            </td>
                            <td style={{ color: '#fff', fontWeight: 600, letterSpacing: '-0.2px' }}>
                              <div style={{display: 'flex', alignItems: 'center', gap: 5}}>
                                {child.fullName || child.name}
                                <RecommendationSourceBadge source={child.source} />
                                {INSTRUMENT_EXPLAINERS[child.instId] && (
                                  <span
                                    onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === `tbl-${child.instId}` ? null : `tbl-${child.instId}`); }}
                                    style={{cursor: 'pointer', display: 'inline-flex', opacity: 0.4, transition: 'opacity 0.2s'}}
                                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                    onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                                  >
                                    <HelpCircle size={12} color="#38bdf8" />
                                  </span>
                                )}
                              </div>
                              {activeTooltip === `tbl-${child.instId}` && INSTRUMENT_EXPLAINERS[child.instId] && (
                                <div style={{background: 'rgba(10,16,30,0.95)', border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8, padding: '8px 10px', marginTop: 4, fontSize: '0.68rem', lineHeight: 1.5, maxWidth: 320, boxShadow: '0 8px 24px rgba(0,0,0,0.5)'}}>
                                  <div style={{color: '#38bdf8', fontWeight: 600, marginBottom: 3}}>What is this?</div>
                                  <div style={{color: '#94a3b8'}}>{INSTRUMENT_EXPLAINERS[child.instId].what}</div>
                                  {INSTRUMENT_EXPLAINERS[child.instId].who_for && <div style={{color: '#cbd5e1', marginTop: 3, fontSize: '0.65rem'}}><b>Best for:</b> {INSTRUMENT_EXPLAINERS[child.instId].who_for}</div>}
                                </div>
                              )}
                              {(() => { const lw = getLockInWarning({id: child.instId}, horizon); return lw ? <div style={{fontSize: '0.62rem', color: '#f59e0b', marginTop: 2, padding: '2px 6px', background: 'rgba(245,158,11,0.06)', borderRadius: 4, display: 'inline-block'}}>&#x23f0; {lw}</div> : null; })()}
                            </td>
                             <td>
                               {(() => {
                                 const recObj = (recommendations || []).find(r => r.id === child.instId);
                                 const score = recObj ? computeSuitabilityMatch(recObj, userProfile) : null;
                                 if (!score) return <span style={{color:'#475569', fontSize:'0.72rem'}}>—</span>;
                                 const scoreColor = score >= 90 ? '#10b981' : score >= 75 ? '#38bdf8' : score >= 60 ? '#f59e0b' : '#94a3b8';
                                 const scoreBg = score >= 90 ? 'rgba(16, 185, 129, 0.12)' : score >= 75 ? 'rgba(56, 189, 248, 0.12)' : score >= 60 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(148, 163, 184, 0.1)';
                                 const scoreBorder = score >= 90 ? 'rgba(16, 185, 129, 0.28)' : score >= 75 ? 'rgba(56, 189, 248, 0.28)' : score >= 60 ? 'rgba(245, 158, 11, 0.28)' : 'rgba(148, 163, 184, 0.2)';
                                 return (
                                   <span style={{
                                     display: 'inline-flex', alignItems: 'center', gap: 4,
                                     padding: '3px 9px', borderRadius: 20,
                                     fontSize: '0.72rem', fontWeight: 800, color: scoreColor,
                                     background: scoreBg, border: `1px solid ${scoreBorder}`,
                                     boxShadow: `0 2px 8px ${scoreColor}15`,
                                     fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px'
                                   }}>
                                     <span style={{ width: 5, height: 5, borderRadius: '50%', background: scoreColor, flexShrink: 0 }} />
                                     {score}% Match
                                   </span>
                                 );
                               })()}
                             </td>
                            <td className="col-weight" style={{ color: '#94a3b8' }}>
                              {isUnfunded
                                ? <span style={{display: 'inline-block', whiteSpace: 'nowrap', color: '#f59e0b', fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: 6, lineHeight: 1.2}}>Not Funded</span>
                                : <span style={{ color: '#fff' }}>{child.weight.toFixed(1)}%</span>
                              }
                            </td>
                            <td className="col-exp-return" style={{ color: '#38bdf8', fontWeight: 600 }}>{child.ret}</td>
                            <td className="col-risk-level">
                              {(() => {
                                const r = (child.risk || '').toLowerCase();
                                const isLow = r.includes('low');
                                const isHigh = r.includes('high');
                                const styles = isLow 
                                  ? { bg: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: 'rgba(16, 185, 129, 0.2)' }
                                  : isHigh 
                                    ? { bg: 'rgba(244, 63, 94, 0.1)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.2)' }
                                    : { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.2)' };
                                return (
                                  <span style={{
                                    display: 'inline-block',
                                    whiteSpace: 'nowrap',
                                    background: styles.bg, color: styles.color, border: `1px solid ${styles.border}`,
                                    padding: '4px 10px', borderRadius: 12, fontSize: '0.68rem', fontWeight: 600, textTransform: 'capitalize',
                                    lineHeight: 1
                                  }}>
                                    {child.risk}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ color: '#e2e8f0' }}>₹{child.alloc.toLocaleString()}</td>
                            <td style={{color: '#4ade80', fontSize: '1.05em'}}>₹{child.proj}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );}))
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            
            <div className="panel-card" style={{
              padding: 22, 
              borderTop: '2px solid transparent',
              borderImage: 'linear-gradient(90deg, #38bdf8, #8b5cf6, #dfbd69) 1',
              position: 'relative',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(56,189,248,0.04), inset 0 1px 0 rgba(255,255,255,0.08)'
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14}}>
                {(() => {
                  const isEF = (userProfile?.investment_goals || [])[0] === 'Emergency Fund';
                  if (isEF) {
                    const income = Number(userProfile?.monthly_income) || 0;
                    const savings = Number(userProfile?.monthly_savings) || 0;
                    const monthlyExpenses = income - savings;
                    const emergencyTarget = monthlyExpenses * 6;
                    const targetMonths = Math.ceil(emergencyTarget / (savings || 1));
                    return (
                      <>
                        <div>
                          <div style={{fontSize: '0.65rem', color: '#546178', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 4}}>Portfolio at Goal</div>
                          <div style={{fontSize: '1.6rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums'}}>{formatCompactINR(emergencyTarget)}</div>
                          <div style={{fontSize: '0.7rem', color: '#64748b', marginTop: 2}}>Month {targetMonths}</div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                          <div style={{fontSize: '0.65rem', color: '#546178', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 4}}>{horizon}-Year Total</div>
                          <div style={{fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0'}}>{formatCompactINR(totalProjected)}</div>
                          <div style={{fontSize: '0.65rem', color: '#64748b', marginTop: 2}}>incl. surplus</div>
                        </div>
                      </>
                    );
                  }
                  const wealthMultiplier = currentMonthly > 0 ? (totalProjected / (currentMonthly * horizon * 12)).toFixed(1) : '—';
                  return (
                    <>
                      <div>
                        <div style={{fontSize: '0.65rem', color: '#546178', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 4}}>Projected Value</div>
                        <div style={{fontSize: '1.6rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums'}}>
                          {formatCompactINR(totalProjected)}
                        </div>
                      </div>
                      <div style={{textAlign: 'right'}}>
                        <div style={{fontSize: '0.65rem', color: '#546178', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 4}}>Wealth Multiple</div>
                        <div style={{fontSize: '1.2rem', fontWeight: 800, color: '#dfbd69'}}>{wealthMultiplier}x</div>
                        <div style={{fontSize: '0.65rem', color: '#64748b', marginTop: 2}}>on invested capital</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="stats-grid" style={{paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)'}}>
                <div className="mini-stat">
                  Monthly SIP <strong className="stat-green">₹{currentMonthly.toLocaleString()}</strong>
                </div>
                <div className="mini-stat" style={{textAlign: 'right'}}>
                  Horizon <strong>{horizon} Yrs</strong>
                </div>
                <div className="mini-stat">
                  Diversification <strong>{allocationDataOuter.length} {allocationDataOuter.length === 1 ? 'Category' : 'Categories'}</strong>
                </div>
                <div className="mini-stat" style={{textAlign: 'right'}}>
                  Risk Bias <strong style={{color: userProfile?.risk_appetite === 'High' ? '#fb7185' : userProfile?.risk_appetite === 'Low' ? '#34d399' : '#dfbd69'}}>{userProfile?.risk_appetite}</strong>
                </div>
              </div>
            </div>



            {/* Action Buttons with Icons */}
            <div className="buttons-stack">
              <button className="btn-portal btn-portal-primary" onClick={onRebalance} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
                <Zap size={15} /> Rebalance Portfolio
              </button>
              <button className="btn-portal btn-portal-secondary" onClick={onExploreAll} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
                <BarChart3 size={15} /> Compare Scenarios
              </button>
              <button className="btn-portal btn-portal-secondary" onClick={() => window.print()} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.82rem'}}>
                <TrendingUp size={14} /> Export PDF Report
              </button>
            </div>

            {/* Portfolio Insights Card */}
            <div className="panel-card" style={{padding: 16, marginTop: 4}}>
              <div className="panel-title" style={{marginBottom: 12, fontSize: '0.6rem'}}>PORTFOLIO INSIGHTS</div>
              {(() => {
                const recs = recommendations || [];
                const activeRecs = recs.filter(r => (r.monthly_allocation || 0) > 0);
                const totalAllocated = activeRecs.reduce((s, r) => s + (r.monthly_allocation || 0), 0);
                
                let weightedReturn = 0;
                if (totalAllocated > 0) {
                  activeRecs.forEach(r => {
                    const rMax = r.rate || r.expected_return_max || r.nominalReturn || 0;
                    const rMin = r.expected_return_min ?? (r.expected_return_max ? r.expected_return_max * 0.85 : (r.rate ? r.rate * 0.85 : 0));
                    const avg = (rMin + rMax) / 2;
                    const weight = r.monthly_allocation / totalAllocated;
                    weightedReturn += avg * weight;
                  });
                } else if (recs.length > 0) {
                  const sum = recs.reduce((s, r) => {
                    const rMax = r.rate || r.expected_return_max || r.nominalReturn || 0;
                    const rMin = r.expected_return_min ?? (r.expected_return_max ? r.expected_return_max * 0.85 : (r.rate ? r.rate * 0.85 : 0));
                    return s + ((rMin + rMax) / 2);
                  }, 0);
                  weightedReturn = sum / recs.length;
                }
                const avgReturn = (totalAllocated > 0 || recs.length > 0) ? weightedReturn.toFixed(1) : '0';
                const taxSavers = recs.filter(r => r.tax_benefit);
                const taxPct = currentMonthly > 0 
                  ? ((taxSavers.reduce((s, r) => s + (r.monthly_allocation || 0), 0) / currentMonthly) * 100).toFixed(0) 
                  : '0';
                const EQUITY_CATS = ['equity', 'equity-debt'];
                const DEBT_CATS = ['debt', 'government'];
                const COMMODITY_CATS = ['commodity'];
                let equityAlloc = 0, debtAlloc = 0;
                recs.forEach(r => {
                  const cat = (r.cat || r.category || r.asset_class || '').toLowerCase();
                  const alloc = r.monthly_allocation || 0;
                  if (cat.includes('equity-debt') || cat.includes('hybrid')) {
                    equityAlloc += alloc * 0.65;
                    debtAlloc += alloc * 0.35;
                  } else if (cat.includes('equity')) {
                    equityAlloc += alloc;
                  } else if (cat.includes('debt') || cat.includes('government')) {
                    debtAlloc += alloc;
                  }
                });
                const equityPct = currentMonthly > 0 ? ((equityAlloc / currentMonthly) * 100).toFixed(0) : '0';
                const debtPct = currentMonthly > 0 ? ((debtAlloc / currentMonthly) * 100).toFixed(0) : '0';
                return (
                  <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontSize: '0.72rem', color: '#94a3b8'}}>Avg Expected Return</span>
                      <span style={{fontSize: '0.82rem', fontWeight: 700, color: '#4ade80', fontVariantNumeric: 'tabular-nums'}}>{avgReturn}%</span>
                    </div>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.03)'}} />
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontSize: '0.72rem', color: '#94a3b8'}}>Tax-Saving Allocation</span>
                      <span style={{fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8', fontVariantNumeric: 'tabular-nums'}}>{taxPct}%</span>
                    </div>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.03)'}} />
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontSize: '0.72rem', color: '#94a3b8'}}>Equity / Debt Split</span>
                      <span style={{fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums'}}>{equityPct}% / {debtPct}%</span>
                    </div>
                    <div style={{height: 1, background: 'rgba(255,255,255,0.03)'}} />
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontSize: '0.72rem', color: '#94a3b8'}}>Instruments</span>
                      <span style={{fontSize: '0.82rem', fontWeight: 700, color: '#dfbd69', fontVariantNumeric: 'tabular-nums'}}>{recs.length} active</span>
                    </div>

                    {/* Smart Tip */}
                    <div style={{
                      marginTop: 6, padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(139, 92, 246, 0.04)', border: '1px solid rgba(139, 92, 246, 0.1)',
                      fontSize: '0.68rem', color: '#a78bfa', lineHeight: 1.5
                    }}>
                      {Number(equityPct) > 70 
                        ? 'High equity exposure — consider adding debt instruments for stability.' 
                        : Number(debtPct) > 60 
                        ? 'Conservative mix — you may boost equity allocation for higher growth.'
                        : 'Well-balanced portfolio across asset classes. Review quarterly.'}
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>

        </div>

        {/* Section divider */}
        <div style={{height: 1, margin: '16px 0', background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.12), rgba(56,189,248,0.08), rgba(139,92,246,0.06), transparent)'}} />

        {/* ═══════════════════════════════════════════════════════════
            SECTION 8: RANKED RECOMMENDATION CARDS WITH "Why recommended?"
            ═══════════════════════════════════════════════════════════ */}
        {recommendations && recommendations.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18}}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(223, 189, 105, 0.08))',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.1)'
              }}>
                <Trophy size={18} color="#f59e0b" />
              </div>
              <div style={{flex: 1}}>
                <h2 style={{
                  fontSize: '1.15rem', fontWeight: 800, margin: 0, letterSpacing: '-0.4px',
                  background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>AI Ranked Recommendations</h2>
                <span style={{fontSize: '0.65rem', color: '#546178', fontWeight: 400}}>Personalised for your goals & risk profile</span>
              </div>
              <div style={{
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: 20, padding: '4px 12px', fontSize: '0.68rem', color: '#dfbd69', fontWeight: 600,
                fontVariantNumeric: 'tabular-nums'
              }}>{recommendations.length} instruments</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 20 }}>
              {recommendations.map((rec, idx) => {
                const whyReasons = getWhy(rec, userProfile);
                const isExpanded = expandedWhyCards[rec.id];
                const isTop3 = idx < 3;
                const cardAccent = rec.color || '#06b6d4';
                return (
                  <div key={rec.id} id={`rec-card-${rec.id}`} className="rec-card" style={{
                    background: `linear-gradient(165deg, rgba(18, 27, 46, 0.8) 0%, rgba(8, 13, 28, 0.95) 100%)`,
                    backdropFilter: 'blur(40px) saturate(160%)',
                    border: `1px solid ${cardAccent}20`,
                    borderTop: `2px solid ${cardAccent}30`,
                    borderRadius: 22, padding: '22px 24px', position: 'relative', overflow: 'hidden',
                    transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: `0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)`
                  }}>
                    {/* Ambient glow — top-right radial */}
                    <div style={{
                      position: 'absolute', top: -60, right: -60,
                      width: idx === 0 ? 180 : 120, height: idx === 0 ? 180 : 120,
                      background: `radial-gradient(circle, ${cardAccent}${idx === 0 ? '14' : '08'}, transparent 70%)`,
                      pointerEvents: 'none'
                    }} />
                    {/* Bottom-left subtle glow */}
                    <div style={{
                      position: 'absolute', bottom: -40, left: -40,
                      width: 100, height: 100,
                      background: `radial-gradient(circle, rgba(139, 92, 246, 0.05), transparent 70%)`,
                      pointerEvents: 'none'
                    }} />
                    {/* Rank badge */}
                    <div style={{
                      position: 'absolute', top: 14, right: 14,
                      background: idx === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : isTop3 ? `linear-gradient(135deg, rgba(223, 189, 105, 0.12), rgba(223, 189, 105, 0.04))` : 'rgba(255,255,255,0.03)',
                      color: idx === 0 ? '#000' : isTop3 ? '#dfbd69' : '#546178',
                      width: idx === 0 ? 32 : 28, height: idx === 0 ? 32 : 28, borderRadius: idx === 0 ? 10 : 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: idx === 0 ? '0.8rem' : '0.72rem',
                      border: idx === 0 ? 'none' : isTop3 ? '1px solid rgba(223, 189, 105, 0.2)' : '1px solid rgba(255,255,255,0.05)',
                      boxShadow: idx === 0 ? '0 4px 20px rgba(245, 158, 11, 0.4), inset 0 1px 1px rgba(255,255,255,0.3)' : isTop3 ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
                    }}>#{idx + 1}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{
                        width: 4, height: 36, borderRadius: 4,
                        background: `linear-gradient(180deg, ${cardAccent}, ${cardAccent}60)`,
                        boxShadow: `0 0 8px ${cardAccent}30`
                      }} />
                      <div style={{flex: 1}}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f1f5f9', letterSpacing: '-0.3px' }}>{rec.abbr || rec.name}</span>
                          {(() => {
                             const score = computeSuitabilityMatch(rec, userProfile);
                             const scoreColor = score >= 90 ? '#10b981' : score >= 75 ? '#38bdf8' : score >= 60 ? '#f59e0b' : '#94a3b8';
                             const scoreBg = score >= 90 ? 'rgba(16, 185, 129, 0.12)' : score >= 75 ? 'rgba(56, 189, 248, 0.12)' : score >= 60 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(148, 163, 184, 0.1)';
                             const scoreBorder = score >= 90 ? 'rgba(16, 185, 129, 0.28)' : score >= 75 ? 'rgba(56, 189, 248, 0.28)' : score >= 60 ? 'rgba(245, 158, 11, 0.28)' : 'rgba(148, 163, 184, 0.2)';
                             return (
                               <span style={{
                                 display: 'inline-flex', alignItems: 'center', gap: 4,
                                 padding: '3px 10px', borderRadius: 20,
                                 fontSize: '0.7rem', fontWeight: 800, color: scoreColor,
                                 background: scoreBg, border: `1px solid ${scoreBorder}`,
                                 boxShadow: `0 2px 10px ${scoreColor}18`,
                                 fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px', whiteSpace: 'nowrap'
                               }}>
                                 <span style={{ width: 5, height: 5, borderRadius: '50%', background: scoreColor, flexShrink: 0 }} />
                                 {score}% Match
                               </span>
                             );
                           })()}
                          <RecommendationSourceBadge source={rec._source} />

                          {INSTRUMENT_EXPLAINERS[rec.id] && (
                            <span 
                              onClick={(e) => { e.stopPropagation(); setActiveTooltip(activeTooltip === rec.id ? null : rec.id); }}
                              style={{cursor: 'pointer', display: 'inline-flex', opacity: 0.4, transition: 'opacity 0.2s'}}
                              onMouseEnter={e => e.currentTarget.style.opacity = 1}
                              onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                            >
                              <HelpCircle size={13} color="#38bdf8" />
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2, lineHeight: 1.3 }}>{CARD_SUBTITLES[rec.id] || rec.name}</div>
                      </div>
                    </div>
                    {/* Beginner tooltip */}
                    {activeTooltip === rec.id && INSTRUMENT_EXPLAINERS[rec.id] && (
                      <div style={{
                        background: 'rgba(10, 16, 30, 0.95)', border: '1px solid rgba(56,189,248,0.15)',
                        borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: '0.72rem', lineHeight: 1.6,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                      }}>
                        <div style={{fontWeight: 700, color: '#38bdf8', marginBottom: 6, fontSize: '0.75rem'}}>What is {rec.abbr || rec.name}?</div>
                        <div style={{color: '#cbd5e1', marginBottom: 6}}>{INSTRUMENT_EXPLAINERS[rec.id].what}</div>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6}}>
                          <div><span style={{color: '#546178', fontSize: '0.65rem'}}>Risk:</span><br/><span style={{color: '#94a3b8'}}>{INSTRUMENT_EXPLAINERS[rec.id].risk_plain}</span></div>
                          <div><span style={{color: '#546178', fontSize: '0.65rem'}}>Lock-in:</span><br/><span style={{color: '#94a3b8'}}>{INSTRUMENT_EXPLAINERS[rec.id].lock_in_plain}</span></div>
                        </div>
                        {INSTRUMENT_EXPLAINERS[rec.id].who_for && <div style={{color: '#94a3b8'}}><strong style={{color: '#e2e8f0'}}>Best for:</strong> {INSTRUMENT_EXPLAINERS[rec.id].who_for}</div>}
                        {INSTRUMENT_EXPLAINERS[rec.id].example && <div style={{color: '#4ade80', marginTop: 4, fontSize: '0.68rem'}}>{INSTRUMENT_EXPLAINERS[rec.id].example}</div>}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      <div className="stat-box">
                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4, fontWeight: 500 }}>Post-Tax Return</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4ade80', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{typeof rec.postTaxReturn === 'number' ? rec.postTaxReturn.toFixed(1) : (rec.rate || 0).toFixed(1)}%</div>
                      </div>
                      <div className="stat-box">
                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4, fontWeight: 500 }}>Risk Level</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: RISK_COLORS[rec.riskLabel] || '#f59e0b', letterSpacing: '-0.3px' }} title={RISK_PLAIN_LABELS[rec.riskLabel] || ''}>{rec.riskLabel}</div>
                      </div>
                      <div className="stat-box">
                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4, fontWeight: 500 }}>Monthly SIP</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>₹{rec.monthly_allocation?.toLocaleString()}</div>
                      </div>
                      <div className="stat-box">
                        <div style={{ fontSize: '0.6rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4, fontWeight: 500 }}>Lock-in</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.3px' }}
                          title={rec.maturity_type === 'age_based'
                            ? `Matures at age ${rec.maturity_age} (${rec.lock_in_years} years from now)`
                            : undefined}
                        >{rec.lock_in_years != null
                            ? (rec.lock_in_years === 0 ? 'None' : `${rec.lock_in_years}Y`)
                            : (rec.lockIn ? `${rec.lockIn}Y` : 'None')}
                        </div>
                      </div>
                    </div>
                    {/* ELSS Lock-in Warning (Fix 3) */}
                    {(() => {
                      const lockWarning = getLockInWarning(rec, horizon);
                      return lockWarning ? (
                        <div style={{
                          fontSize: '0.68rem', color: '#f59e0b', padding: '5px 10px', marginBottom: 8,
                          background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.12)',
                          borderRadius: 6, lineHeight: 1.4
                        }}>
                          ⏰ {lockWarning}
                        </div>
                      ) : null;
                    })()}

                    {/* Score bar — Fix 4: use actual ML confidence or mark as local */}
                    {(() => {
                      const confidence = rec.ml_confidence;
                      const hasRealConfidence = confidence != null && confidence > 0;
                      
                      if (!hasRealConfidence) {
                        return (
                          <div className="confidence-unavailable" style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', marginBottom: 8 }}>
                            ML scoring unavailable for this instrument
                          </div>
                        );
                      }

                      const confLabel = getConfidenceLabel(confidence || 0);
                      const displayPct = Math.round(confidence * 100);
                      return (
                        <>
                          <div className="confidence-bar-container" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>ML Confidence</span>
                            <span className="confidence-value" style={{ fontSize: '0.72rem', color: confLabel.colour, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {confLabel.label || `${displayPct}%`}
                            </span>
                          </div>
                          <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 100, marginBottom: 8, overflow: 'hidden' }}>
                            <div className="confidence-bar" style={{
                              height: '100%',
                              width: `${Math.min(100, displayPct)}%`,
                              background: `linear-gradient(90deg, ${confLabel.colour}cc, ${confLabel.colour})`,
                              borderRadius: 100,
                              transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                              boxShadow: `0 0 8px ${confLabel.colour}40`
                            }} />
                          </div>
                          {/* Fix 4: Low confidence badge */}
                          {confidence < 0.30 && (
                            <div style={{
                              fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)',
                              border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 8,
                              padding: '3px 8px', marginBottom: 8, textAlign: 'center'
                            }}>
                            <AlertCircle size={14} style={{ marginRight: 6 }} /> Low model confidence — shown for reference only
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Why recommended */}
                    <button
                      onClick={() => toggleWhyCard(rec.id)}
                      style={{
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(139, 92, 246, 0.04))',
                        border: '1px solid rgba(6, 182, 212, 0.15)',
                        color: '#22d3ee', cursor: 'pointer', borderRadius: 10,
                        fontSize: '0.72rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 5,
                        fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        letterSpacing: '0.2px'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.14), rgba(139, 92, 246, 0.08))'; e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.25)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(139, 92, 246, 0.04))'; e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.15)'; }}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      Why recommended?
                    </button>
                    {isExpanded && (
                      <div style={{
                        marginTop: 10, padding: 12,
                        background: 'rgba(6, 182, 212, 0.04)',
                        border: '1px solid rgba(6, 182, 212, 0.1)',
                        borderRadius: 10, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.6
                      }}>
                        {whyReasons.map((reason, i) => (
                          <div key={i} style={{ marginBottom: 6, display: 'flex', gap: 6 }}>
                            <span style={{ color: '#06b6d4' }}>•</span>
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}



                    {/* ═══ LEARN MORE — Opens full deep-dive page ═══ */}
                    {onLearnMore && (
                      <button
                        onClick={() => onLearnMore(rec)}
                        style={{
                          width: '100%', marginTop: 12, padding: '10px 16px',
                          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(56, 189, 248, 0.08))',
                          border: '1px solid rgba(139, 92, 246, 0.25)',
                          borderRadius: 12, color: '#a78bfa', cursor: 'pointer',
                          fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                          letterSpacing: '0.3px'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.22), rgba(56, 189, 248, 0.14))';
                          e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.15)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(56, 189, 248, 0.08))';
                          e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.25)';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        Learn More — Full Deep Dive
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            SECTION 9.5: SHAP EXPLAINABILITY PANEL
            ═══════════════════════════════════════════════════════════ */}
        {explanation && (
          <ExplainabilityPanel
            explanation={explanation}
            instrumentName={(() => {
              const predClass = explanation.predicted_class?.replace('_', ' ');
              const match = recommendations.find(r => 
                r.id === explanation.predicted_class || 
                r.name.includes(predClass) || 
                (predClass === 'Equity MF' && r.name.includes('Equity')) ||
                (predClass === 'Debt MF' && r.name.includes('Debt'))
              );
              return match ? match.name : (recommendations?.[0]?.name || 'the primary pick');
            })()}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════
            SECTION 10: AI ADVISORY CARD — Gemini-generated text
            ═══════════════════════════════════════════════════════════ */}
        {recommendations && recommendations[0]?.advisory_text && (
          <div className="holographic-card" style={{ marginTop: 40, padding: 32 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 8px 24px rgba(6, 182, 212, 0.4), inset 0 1px 1px rgba(255,255,255,0.4)'
              }}>
                <Zap size={28} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8, color: '#fff' }}>
                  Genie's Personal Advisory Summary
                </h3>
                <div style={{
                  fontSize: '1rem', color: '#cbd5e1', lineHeight: 1.7, 
                  whiteSpace: 'pre-line', fontStyle: 'italic'
                }}>
                  {recommendations[0].advisory_text}
                </div>
                <div style={{
                  marginTop: 16, display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: '0.75rem', color: '#94a3b8'
                }}>
                  <Shield size={14} />
                  Powered by Gemini 1.5 Flash • Analysis based on Indian Tax Code FY 2025-26
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            SECTION 9: BROWSE BY INSTRUMENT TYPE / RISK LEVEL
            ═══════════════════════════════════════════════════════════ */}
        {recommendations && recommendations.length > 0 && (() => {
          const isEmergencyFund = (userProfile?.investment_goals || [])[0] === 'Emergency Fund';

          if (isEmergencyFund) {
            // FIX 6: Emergency Fund — Browse by Liquidity
            const liquidGroup = recommendations.filter(r => ['liquid_mf'].includes(r.id));
            const nearLiquidGroup = recommendations.filter(r => ['fd'].includes(r.id));
            const shortTermGroup = recommendations.filter(r => ['debt_mf', 'hybrid_mf'].includes(r.id));
            const groups = [
              { key: 'liquid', label: 'Liquid (T+1 Redemption)', items: liquidGroup, color: '#14b8a6', icon: <Shield size={18} color="#14b8a6" /> },
              { key: 'near_liquid', label: 'Near-Liquid (1–7 days)', items: nearLiquidGroup, color: '#06b6d4', icon: <TrendingUp size={18} color="#06b6d4" /> },
              { key: 'short_term', label: 'Short-Term (< 1 year)', items: shortTermGroup, color: '#f59e0b', icon: <BarChart3 size={18} color="#f59e0b" /> },
            ];

            return (
              <div style={{ marginTop: 40, marginBottom: 40 }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8, color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <BarChart3 size={20} color="#94a3b8" /> Browse by Liquidity
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 20 }}>
                  Emergency funds require instant access. All instruments below have zero lock-in.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                  {groups.map(grp => (
                    <div key={grp.key} style={{
                      background: '#0d141e', border: `1px solid ${grp.color}30`,
                      borderRadius: 16, overflow: 'hidden'
                    }}>
                      <div style={{
                        width: '100%', padding: '14px 18px',
                        color: '#fff', display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: '0.95rem', fontWeight: 600
                      }}>
                        {grp.icon}
                        {grp.label}
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
                          {grp.items.length} instrument{grp.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ padding: '0 18px 16px' }}>
                        {grp.items.length === 0 ? (
                          <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px 0' }}>None in this category.</div>
                        ) : grp.items.map(inv => (
                          <div key={inv.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)'
                          }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e2e8f0' }}>{inv.abbr || inv.name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                Post-tax: {(inv.postTaxReturn || inv.rate || 0).toFixed(1)}% &bull; <span style={{ color: RISK_COLORS[inv.riskLabel] }}>{inv.riskLabel}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => scrollToCard(inv.id)}
                              style={{
                                background: `${grp.color}15`, border: `1px solid ${grp.color}30`,
                                color: grp.color, borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer'
                              }}
                            >View Details</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Default: Browse by Risk Level
          return (
          <div style={{ marginTop: 36, marginBottom: 36 }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20}}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(99, 102, 241, 0.08))',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(139, 92, 246, 0.1)'
              }}>
                <BarChart3 size={18} color="#8b5cf6" />
              </div>
              <div>
                <h2 style={{
                  fontSize: '1.15rem', fontWeight: 800, margin: 0, letterSpacing: '-0.4px',
                  background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>Browse by Risk Level</h2>
                <span style={{fontSize: '0.65rem', color: '#546178'}}>Explore all eligible instruments grouped by risk</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {/* Low Risk Group */}
              <div style={{
                background: 'linear-gradient(165deg, rgba(18, 27, 46, 0.75), rgba(10, 15, 30, 0.9))',
                border: '1px solid rgba(20, 184, 166, 0.12)',
                borderLeft: '3px solid #14b8a6',
                borderRadius: 16, overflow: 'hidden',
                backdropFilter: 'blur(32px) saturate(150%)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.2)'
              }}>
                <button
                  onClick={() => setRiskGroupOpen(prev => ({ ...prev, low: !prev.low }))}
                  style={{
                    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit'
                  }}
                >
                  <Shield size={18} color="#14b8a6" />
                  Low Risk
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {riskGroups.low.length} instruments
                  </span>
                  {riskGroupOpen.low ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {riskGroupOpen.low && (
                  <div style={{ padding: '0 18px 16px' }}>
                    {riskGroups.low.length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px 0' }}>No eligible low-risk instruments for your profile.</div>
                    ) : riskGroups.low.map(inv => (
                      <div key={inv.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e2e8f0' }}>{inv.abbr || inv.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Post-tax: {(inv.postTaxReturn || inv.rate || 0).toFixed(1)}% · <span style={{ color: RISK_COLORS[inv.riskLabel] }}>{inv.riskLabel}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => scrollToCard(inv.id)}
                          style={{
                            background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)',
                            color: '#14b8a6', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer'
                          }}
                        >View Details</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Medium Risk Group */}
              <div style={{
                background: 'linear-gradient(165deg, rgba(18, 27, 46, 0.75), rgba(10, 15, 30, 0.9))',
                border: '1px solid rgba(249, 115, 22, 0.12)',
                borderLeft: '3px solid #f97316',
                borderRadius: 16, overflow: 'hidden',
                backdropFilter: 'blur(32px) saturate(150%)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.2)'
              }}>
                <button
                  onClick={() => setRiskGroupOpen(prev => ({ ...prev, medium: !prev.medium }))}
                  style={{
                    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit'
                  }}
                >
                  <TrendingUp size={18} color="#f97316" />
                  Medium Risk
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {riskGroups.medium.length} instruments
                  </span>
                  {riskGroupOpen.medium ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {riskGroupOpen.medium && (
                  <div style={{ padding: '0 18px 16px' }}>
                    {riskGroups.medium.length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px 0' }}>No eligible medium-risk instruments for your profile.</div>
                    ) : riskGroups.medium.map(inv => (
                      <div key={inv.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e2e8f0' }}>{inv.abbr || inv.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Post-tax: {(inv.postTaxReturn || inv.rate || 0).toFixed(1)}% · <span style={{ color: RISK_COLORS[inv.riskLabel] }}>{inv.riskLabel}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => scrollToCard(inv.id)}
                          style={{
                            background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)',
                            color: '#f97316', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer'
                          }}
                        >View Details</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* High Risk Group */}
              <div style={{
                background: 'linear-gradient(165deg, rgba(18, 27, 46, 0.75), rgba(10, 15, 30, 0.9))',
                border: '1px solid rgba(239, 68, 68, 0.12)',
                borderLeft: '3px solid #ef4444',
                borderRadius: 16, overflow: 'hidden',
                backdropFilter: 'blur(32px) saturate(150%)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.2)'
              }}>
                <button
                  onClick={() => setRiskGroupOpen(prev => ({ ...prev, high: !prev.high }))}
                  style={{
                    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit'
                  }}
                >
                  <Zap size={18} color="#ef4444" />
                  High Risk
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {riskGroups.high.length} instruments
                  </span>
                  {riskGroupOpen.high ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {riskGroupOpen.high && (
                  <div style={{ padding: '0 18px 16px' }}>
                    {riskGroups.high.length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px 0' }}>No eligible high-risk instruments for your profile.</div>
                    ) : riskGroups.high.map(inv => (
                      <div key={inv.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e2e8f0' }}>{inv.abbr || inv.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Post-tax: {(inv.postTaxReturn || inv.rate || 0).toFixed(1)}% · <span style={{ color: RISK_COLORS[inv.riskLabel] }}>{inv.riskLabel}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => scrollToCard(inv.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#ef4444', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer'
                          }}
                        >View Details</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        <SebiDisclaimer />

        {/* First-Time Onboarding Modal (Fix 5) */}
        {showOnboarding && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: 20
          }}>
            <div style={{
              background: 'linear-gradient(160deg, rgba(15, 23, 42, 0.98), rgba(8, 13, 28, 0.99))',
              border: '1px solid rgba(56,189,248,0.15)', borderRadius: 20,
              padding: '32px 28px', maxWidth: 520, width: '100%',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)'
            }}>
              <div style={{textAlign: 'center', marginBottom: 20}}>
                <div style={{fontSize: '2rem', marginBottom: 8}}>&#x1F9DE;</div>
                <h2 style={{fontSize: '1.3rem', fontWeight: 800, color: '#e2e8f0', margin: '0 0 6px'}}>Welcome to WealthGenie</h2>
                <p style={{fontSize: '0.78rem', color: '#94a3b8', margin: 0, lineHeight: 1.5}}>We have built a personalised investment plan based on your profile. Here are three things to know:</p>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24}}>
                <div style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
                  <span style={{fontSize: '1.2rem', lineHeight: 1}}>&#x1F4A1;</span>
                  <div>
                    <div style={{fontWeight: 700, color: '#e2e8f0', fontSize: '0.82rem', marginBottom: 2}}>Returns shown are after tax</div>
                    <div style={{fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5}}>Unlike most apps, WealthGenie shows you what you actually keep after paying tax — not just the headline rate.</div>
                  </div>
                </div>
                <div style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
                  <span style={{fontSize: '1.2rem', lineHeight: 1}}>&#x1F512;</span>
                  <div>
                    <div style={{fontWeight: 700, color: '#e2e8f0', fontSize: '0.82rem', marginBottom: 2}}>Some investments have lock-in periods</div>
                    <div style={{fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5}}>ELSS requires 3 years, NPS until age 60, PPF for 15 years. Tap the <span style={{color: '#38bdf8'}}>?</span> icon on any instrument to learn more.</div>
                  </div>
                </div>
                <div style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
                  <span style={{fontSize: '1.2rem', lineHeight: 1}}>&#x1F4CA;</span>
                  <div>
                    <div style={{fontWeight: 700, color: '#e2e8f0', fontSize: '0.82rem', marginBottom: 2}}>Projections show a range, not a guarantee</div>
                    <div style={{fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.5}}>The Best, Average, and Conservative lines in your Wealth Trajectory chart show three possible futures. Markets are unpredictable — we show all three honestly.</div>
                  </div>
                </div>
              </div>
              <button onClick={() => { localStorage.setItem('wg_onboarded', 'true'); setShowOnboarding(false); }} style={{
                width: '100%', padding: '12px', borderRadius: 12,
                background: 'linear-gradient(135deg, #0369a1, #0284c7)', color: '#fff',
                border: '1px solid rgba(56,189,248,0.3)', fontWeight: 700, fontSize: '0.88rem',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(2,132,199,0.3)'
              }}>Show me my plan</button>
              <p style={{fontSize: '0.62rem', color: '#546178', textAlign: 'center', marginTop: 12, lineHeight: 1.5}}>
                WealthGenie is an educational tool, not a SEBI-registered investment adviser. Always consult a qualified adviser for personal financial decisions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendationDashboard;
