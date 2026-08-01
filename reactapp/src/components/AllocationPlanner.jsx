import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { Target, PieChart as PieChartIcon, TrendingUp, Landmark, Briefcase, Wallet, Sparkles, ShieldCheck, ArrowUpRight, Percent, Info } from 'lucide-react';
import { computeAllocation } from '../recommendationEngine';
import { getEligibleInvestments } from '../recommendationEngine';
import { RISK_COLORS } from '../investmentDatabase';
import JargonTooltip from './JargonTooltip';
import './AllocationPlanner.css';

const getCategoryIcon = (cat) => {
  if (!cat) return <Wallet size={20} />;
  if (cat.includes('Equity') || cat.includes('MF') || cat.includes('ETF')) return <TrendingUp size={20} />;
  if (cat.includes('Debt') || cat.includes('Govt') || cat.includes('Bond') || cat.includes('NPS')) return <Landmark size={20} />;
  if (cat.includes('Gold') || cat.includes('Commodity')) return <Briefcase size={20} />;
  return <Wallet size={20} />;
};

const RISK_PRESETS = [
  { id: 'Safe & Stable', label: 'Safe & Stable', desc: 'Focus on safety & guaranteed returns' },
  { id: 'Balanced Growth', label: 'Balanced Growth', desc: 'Optimal mix of growth & protection' },
  { id: 'Aggressive Growth', label: 'Aggressive Growth', desc: 'Maximum wealth growth over time' },
];

const CATEGORY_EXPLANATIONS = {
  'Equity': 'Company Shares — High growth potential over time',
  'Debt': 'Fixed Income & FD — Steady, reliable interest income',
  'Government': 'Government Savings — 100% safe capital protection',
  'Equity-Debt': 'Hybrid Funds — Balanced safety and growth',
  'Commodity': 'Gold & Metals — Protects against inflation',
  'Alternative': 'Alternative Assets — Extra portfolio diversification',
  'Gold': 'Gold & Metals — Protects against inflation'
};

const AllocationPlanner = ({ profile }) => {
  const savings = Number(profile?.monthly_savings) || 12000;
  const eligible = useMemo(() => getEligibleInvestments(profile || {}), [profile]);

  // Risk view toggle state
  const [riskView, setRiskView] = useState(
    profile?.risk_appetite === 'High' ? 'Aggressive Growth' : 
    profile?.risk_appetite === 'Low' ? 'Safe & Stable' : 'Balanced Growth'
  );

  // Compute allocation for the selected risk view
  const baseAllocation = useMemo(() => {
    const overrideRisk = riskView === 'Aggressive Growth' ? 'High' : riskView === 'Safe & Stable' ? 'Low' : 'Medium';
    return computeAllocation({ ...profile, risk_appetite: overrideRisk }, eligible);
  }, [profile, eligible, riskView]);

  const allocation = baseAllocation;

  // Compute blended return
  const blendedReturn = useMemo(() => {
    return allocation.reduce((sum, a) => sum + (a.allocationPct / 100) * a.postTaxRate, 0);
  }, [allocation]);

  // KPI exposures
  const equityExposure = useMemo(() =>
    allocation.filter(a => a.cat === "Equity").reduce((s, a) => s + a.allocationPct, 0), [allocation]);
  const debtGovtExposure = useMemo(() =>
    allocation.filter(a => a.cat === "Government" || a.cat === "Debt" || a.cat === "Equity-Debt").reduce((s, a) => s + a.allocationPct, 0), [allocation]);
  const altExposure = useMemo(() =>
    allocation.filter(a => a.cat === "Commodity" || a.cat === "Alternative" || a.cat === "Gold").reduce((s, a) => s + a.allocationPct, 0), [allocation]);
  
  const rationaleText = useMemo(() => {
    if (riskView === 'Aggressive Growth') return "Focuses on growing your money as much as possible over the long term using high-growth equity shares to beat inflation.";
    if (riskView === 'Safe & Stable') return "Prioritizes keeping your hard-earned money safe with government-backed savings and fixed deposits with minimal risk.";
    return "Combines safety and growth. Spreads your money across categories to capture market growth while keeping a strong safety cushion.";
  }, [riskView]);

  const [hoveredSlice, setHoveredSlice] = useState(null);

  if (!allocation || allocation.length === 0) {
    return (
      <motion.div className="ap-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="ap-empty">
          <div className="ap-empty-icon"><PieChartIcon size={48} /></div>
          <h3>No allocation available</h3>
          <p>Adjust your profile settings to unlock personalized investment options.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="ap-page">
      {/* Top Banner Header */}
      <motion.div
        className="ap-header-section"
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="ap-page-badge">
          <Sparkles size={13} className="text-sky" />
          <span>SMART MONEY MIX</span>
        </div>
        <h1 className="ap-page-title">
          Where to <span className="title-gradient">Invest Your Money</span>
        </h1>
        <p className="ap-page-subtitle">
          How to split your <strong>₹{savings.toLocaleString("en-IN")}/month</strong> savings to grow wealth safely.
        </p>

        {/* Risk Presets Segmented Toggle */}
        <div className="risk-presets-container">
          <div className="risk-presets-segmented">
            {RISK_PRESETS.map(preset => {
              const isActive = riskView === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => setRiskView(preset.id)}
                  className={`risk-preset-btn ${isActive ? 'active' : ''}`}
                >
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rationale Banner */}
        <div className="ap-rationale-box">
          <div className="rationale-header">
            <ShieldCheck size={16} className="text-sky" />
            <span>Why This Strategy Works</span>
          </div>
          <p>{rationaleText}</p>
        </div>
      </motion.div>

      {/* MAIN CONTENT GRID */}
      <div className="ap-main-grid">
        {/* LEFT: Visual Donut Chart */}
        <motion.div 
          className="ap-donut-panel"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="donut-chart-wrapper">
            <ResponsiveContainer width="100%" height={360}>
              <PieChart>
                <Pie 
                  data={allocation} 
                  dataKey="allocationPct" 
                  cx="50%" cy="50%"
                  innerRadius={110} outerRadius={160} 
                  paddingAngle={4}
                  cornerRadius={6} 
                  stroke="rgba(10, 16, 30, 0.9)" 
                  strokeWidth={3}
                  onMouseEnter={(_, index) => setHoveredSlice(allocation[index])}
                  onMouseLeave={() => setHoveredSlice(null)}
                >
                  {allocation.map((a, i) => (
                    <Cell 
                      key={i} 
                      fill={a.color} 
                      style={{ 
                        filter: `drop-shadow(0px 4px 12px ${a.color}60)`, 
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                      }} 
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Label */}
            <div className="ap-donut-center">
              {hoveredSlice ? (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
                  <div className="center-hover-name">{hoveredSlice.name}</div>
                  <div className="center-hover-pct" style={{ color: hoveredSlice.color }}>
                    {hoveredSlice.allocationPct.toFixed(1)}%
                  </div>
                  <div className="center-hover-amt">
                    ₹{hoveredSlice.monthlyAmount?.toLocaleString("en-IN")}/mo
                  </div>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                  <div className="donut-value-text">
                    ₹{savings.toLocaleString("en-IN")}
                  </div>
                  <div className="donut-sub-text">PER MONTH</div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Donut Legend */}
          <div className="ap-legend-grid">
            {allocation.map((item, idx) => (
              <div 
                key={idx} 
                className={`legend-chip ${hoveredSlice?.id === item.id ? 'active' : ''}`}
                onMouseEnter={() => setHoveredSlice(item)}
                onMouseLeave={() => setHoveredSlice(null)}
              >
                <span className="legend-dot" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                <span className="legend-name">{item.abbr || item.name}</span>
                <span className="legend-pct" style={{ color: item.color }}>{item.allocationPct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* RIGHT: Detailed Investment Allocation Cards */}
        <div className="ap-cards-panel">
          {allocation.map((a, index) => (
            <motion.div 
              key={a.id} 
              className="ap-alloc-card" 
              style={{ '--card-accent': a.color }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + (index * 0.08) }}
            >
              <div className="ap-card-top">
                <div className="ap-card-info-group">
                  <div className="ap-card-icon" style={{ 
                    background: `linear-gradient(135deg, ${a.color}25, ${a.color}08)`,
                    color: a.color, 
                    borderColor: `${a.color}40`,
                    boxShadow: `0 4px 16px ${a.color}20`
                  }}>
                    {getCategoryIcon(a.cat || a.name)}
                  </div>
                  <div>
                    <div className="ap-card-header-row">
                      <h3 className="ap-card-name">{a.name}</h3>
                    </div>
                    <div className="ap-card-desc">
                      {CATEGORY_EXPLANATIONS[a.cat] || CATEGORY_EXPLANATIONS[a.name] || a.cat || ''}
                    </div>
                  </div>
                </div>

                <div className="ap-card-pct-badge" style={{ color: a.color }}>
                  {a.allocationPct.toFixed(1)}%
                </div>
              </div>

              {/* Card Metrics Row */}
              <div className="ap-card-metrics-grid">
                <div className="metric-pill">
                  <span className="metric-label">Monthly SIP</span>
                  <span className="metric-val text-sky">₹{a.monthlyAmount?.toLocaleString("en-IN")}</span>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">Return (after tax)</span>
                  <span className="metric-val text-green">{a.postTaxRate}%/yr</span>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">Safety & Risk</span>
                  <span className="risk-tag" style={{ color: RISK_COLORS[a.riskLabel] || '#f59e0b', borderColor: `${RISK_COLORS[a.riskLabel] || '#f59e0b'}30` }}>
                    {a.riskLabel} Risk
                  </span>
                </div>
              </div>

              {a.concentrationBadge && (
                <div className="ap-conc-badge">
                  <Info size={13} /> {a.concentrationBadge}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* SUMMARY STATS & BLENDED RETURN BAR */}
      <motion.div 
        className="ap-summary-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="ap-blended-bar">
          <div className="blended-left">
            <div className="blended-label">ESTIMATED ANNUAL RETURN (POST-TAX)</div>
            <div className="blended-value">
              {blendedReturn.toFixed(1)}% <span className="per-year">per year</span>
            </div>
            <div className="blended-sub">
              Calculated using current interest rates & post-tax projections.
            </div>
          </div>
          <div className="blended-right">
            <div className="summary-pill">
              <span className="sp-label">Equity Shares</span>
              <span className="sp-val text-sky">{equityExposure.toFixed(1)}%</span>
            </div>
            <div className="summary-pill">
              <span className="sp-label">FD & Safer Funds</span>
              <span className="sp-val text-purple">{debtGovtExposure.toFixed(1)}%</span>
            </div>
            {altExposure > 0 && (
              <div className="summary-pill">
                <span className="sp-label">Gold & Others</span>
                <span className="sp-val text-orange">{altExposure.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AllocationPlanner;
