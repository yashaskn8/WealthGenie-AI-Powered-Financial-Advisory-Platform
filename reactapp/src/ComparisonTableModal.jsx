import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatINR } from './recommendationEngine';
import { X, Lock, Unlock, Info, Search, Link, BarChart3, ArrowUpRight, ArrowDownRight, ChevronLeft, TrendingUp, Shield, Zap, Sparkles, HelpCircle } from 'lucide-react';
import './ComparisonTableModal.css';

const CATEGORY_COLORS = {
  'Debt': '#2dd4bf',
  'Equity-Debt': '#fbbf24', 
  'Government': '#38bdf8', 
  'Equity': '#f43f5e', 
  'Commodity': '#facc15', 
  'Alternative': '#fbbf24'
};

const INVESTMENT_ICONS = {
  'ppf': 'PP', 'scss': 'SC', 'sukanya': 'SS', 'rbi_bonds': 'RB',
  'fd': 'FD', 'debt_mf': 'DM', 'nps': 'NP', 'hybrid_mf': 'HM',
  'index_mf': 'IX', 'gold_etf': 'AU', 'elss': 'EL', 'nifty_etf': 'NF',
  'midcap_mf': 'MC', 'smallcap_mf': 'SM', 'direct_equity': 'EQ',
  'liquid_mf': 'LQ', 'sgb': 'SG'
};

const RISK_LABEL_TO_LEVEL = {
  'Very Low': 15, 'Low': 30, 'Low-Medium': 40, 'Medium-Low': 45, 'Medium': 60, 'High': 80, 'Very High': 95
};

const Sparkline = ({ color, category, riskLevel, rate, invId }) => {
  const seedStr = invId || 'default';
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = Math.imul(31, seed) + seedStr.charCodeAt(i) | 0;
  }
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  const isDebt = category === 'Debt' || category === 'Government';
  const volMulti = (RISK_LABEL_TO_LEVEL[riskLevel] || 50) / 100;
  
  const clampedRate = Math.max(5, Math.min(16, rate || 8));
  const finalY = 18 - ((clampedRate - 5) / 11) * 16;
  
  const pointsCount = isDebt ? 6 : 14; 
  const dx = 100 / (pointsCount - 1);
  
  let points = [{ x: 0, y: 18 }];
  
  for (let i = 1; i < pointsCount - 1; i++) {
    const x = i * dx;
    const progress = i / (pointsCount - 1);
    const trendY = 18 - (18 - finalY) * progress;
    
    let noise = (random() - 0.5) * 20 * volMulti;
    if (isDebt) noise *= 0.15; 
    
    points.push({ x, y: Math.max(2, Math.min(18, trendY + noise)) });
  }
  
  points.push({ x: 100, y: finalY });
  
  let path = `M 0 18`;
  if (isDebt) {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i-1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      path += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
  } else {
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
  }

  return (
    <svg className="sparkline-container" viewBox="0 0 100 20" style={{ width: '80px', height: '24px', flexShrink: 0, overflow: 'visible', filter: `drop-shadow(0 2px 4px ${color}40)` }}>
      {!isDebt && <path d={`${path} L 100 20 L 0 20 Z`} fill={`${color}15`} />}
      <path d={path} fill="none" stroke={color} strokeWidth={isDebt ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="100" cy={finalY} r="2.5" fill={color} />
    </svg>
  );
};

const RiskLiquidityVisual = ({ risk, liquidity }) => {
  const percent = RISK_LABEL_TO_LEVEL[risk] || 50;
  const color = percent <= 30 ? '#34d399' : percent <= 60 ? '#fbbf24' : '#ef4444';
  const liqCount = liquidity === 'High' ? 5 : liquidity === 'Medium' ? 3 : 1;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {[20, 40, 60, 80, 100].map((threshold, i) => (
          <div key={i} style={{
            width: 6, height: percent >= threshold ? 14 : 8,
            borderRadius: 2,
            background: percent >= threshold ? color : 'rgba(255,255,255,0.06)',
            boxShadow: percent >= threshold ? `0 0 4px ${color}50` : 'none',
            transition: 'all 0.3s ease',
            opacity: percent >= threshold ? 1 : 0.4
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: i < liqCount ? '#38bdf8' : 'rgba(255,255,255,0.06)',
            boxShadow: i < liqCount ? '0 0 4px rgba(56,189,248,0.4)' : 'none',
            transition: 'all 0.3s ease'
          }} />
        ))}
      </div>
    </div>
  );
};

const getLiquidityLevel = (lockIn) => {
  if (lockIn === 0) return 'High';
  if (lockIn <= 5) return 'Medium';
  return 'Low';
};

export const computeSuitabilityMatch = (inv, profile) => {
  if (!profile && !inv) return 85;
  if (!inv) return 70;
  let score = 65; // base score

  const userRisk = profile?.riskCategory || profile?.risk_tolerance || 'Moderate';
  const instRisk = inv?.riskLabel || inv?.risk_level || inv?.riskLevel || (inv?.dynamicData?.risk?.level) || 'Medium';

  // 1. Risk Congruence
  if (['Conservative', 'Low', 'Very Low'].includes(userRisk)) {
    if (['Very Low', 'Low'].includes(instRisk)) score += 25;
    else if (['Low-Medium', 'Medium-Low'].includes(instRisk)) score += 12;
    else if (['High', 'Very High'].includes(instRisk)) score -= 30;
  } else if (['Moderate', 'Medium'].includes(userRisk)) {
    if (['Low-Medium', 'Medium-Low', 'Medium', 'Moderately High'].includes(instRisk)) score += 22;
    else if (['Low', 'Very Low'].includes(instRisk)) score += 10;
    else if (['Very High'].includes(instRisk)) score -= 15;
  } else if (['Aggressive', 'High', 'Very High'].includes(userRisk)) {
    if (['High', 'Very High', 'Moderately High'].includes(instRisk)) score += 25;
    else if (['Medium', 'Low-Medium'].includes(instRisk)) score += 12;
    else if (['Very Low', 'Low'].includes(instRisk)) score -= 15;
  }

  // 2. Return Potential Quality Boost
  const rate = Number(inv?.rate || inv?.expectedReturn || inv?.nominalReturn || inv?.expected_return_max || inv?.dynamicData?.interestRates || 0);
  if (rate >= 20) score += 10;
  else if (rate >= 14) score += 6;
  else if (rate >= 9) score += 3;
  else if (rate > 0 && rate <= 6) score -= 4;

  // 3. Investment Horizon Constraints
  const horizon = Number(profile?.investment_horizon || profile?.horizon || profile?.investmentHorizon || 10);
  const lockIn = inv?.lock_in_years !== undefined ? inv.lock_in_years : (inv?.lockIn !== undefined ? inv.lockIn : (inv?.dynamicData?.liquidity?.lockIn || 0));
  if (lockIn > horizon) {
    score -= 35;
  } else if (horizon >= 7 && rate >= 12) {
    score += 8; // Long-term compounder bonus
  } else if (horizon <= 3 && lockIn === 0) {
    score += 8; // Liquid parking bonus
  }

  // 4. Goal Alignment Matrix
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
    if (instCat.includes('equity') || instCat.includes('nps') || instId.includes('ppf') || horizon >= 10) {
      score += 10;
    }
  }

  // 5. Age & Lifecycle Suitability
  const age = Number(profile?.age || 35);
  if (age >= 60) {
    if (['Very Low', 'Low'].includes(instRisk) || instId.includes('scss') || instId.includes('fd')) score += 12;
    else if (['High', 'Very High'].includes(instRisk)) score -= 15;
  } else if (age < 35 && horizon >= 5) {
    if (rate >= 11 || instCat.includes('equity')) score += 6;
  }

  // 6. Tax Regime Efficiency Adjustment
  const taxRegime = (profile?.taxRegime || profile?.tax_regime || 'new').toLowerCase();
  const taxType = inv?.taxType || inv?.dynamicData?.taxType || '';
  if (taxRegime === 'old' && (taxType === 'eee' || taxType === 'elss' || taxType === 'nps')) {
    score += 6;
  } else if (taxRegime === 'new' && taxType === 'eee') {
    score += 6; // EEE (PPF/SGB) remains tax-free in New Regime
  }

  // 7. Expense Ratio & Fee Efficiency
  const expenseRatio = Number(inv?.expenseRatio || inv?.dynamicData?.expenseRatio || 0);
  if (expenseRatio > 0 && expenseRatio <= 0.3) score += 5;

  return Math.min(99, Math.max(45, score));
};

/* ── Deep Comparison Detail Panel ─────────────────────────── */
const ComparisonDetailPanel = ({ selectedInvestments, profile, onBack }) => {
  const itemsWithScores = useMemo(() => {
    if (!selectedInvestments.length) return [];
    return selectedInvestments.map(inv => ({
      ...inv,
      matchScore: computeSuitabilityMatch(inv, profile)
    }));
  }, [selectedInvestments, profile]);

  if (!selectedInvestments.length) return null;

  const metrics = [
    { key: 'matchScore', label: 'Match Score', fmt: v => `${v}%`, icon: <Sparkles size={14}/>, higher: true },
    { key: 'rate', label: 'Return Rate', fmt: v => `${v}%`, icon: <TrendingUp size={14}/>, higher: true },
    { key: 'riskLabel', label: 'Risk Level', fmt: v => v, icon: <Shield size={14}/> },
    { key: 'lockIn', label: 'Lock-in (yrs)', fmt: v => v === 0 ? 'None' : `${v} yrs`, icon: <Lock size={14}/>, higher: false },
    { key: 'taxType', label: 'Tax Treatment', fmt: v => v?.toUpperCase() || 'Slab', icon: <Zap size={14}/> },
    { key: 'minMonthlyInvestment', label: 'Min Investment', fmt: v => formatINR(v || 0), icon: <BarChart3 size={14}/>, higher: false },
  ];
  const bestRate = Math.max(...selectedInvestments.map(i => i.rate || 0));
  const bestLock = Math.min(...selectedInvestments.map(i => i.lockIn ?? i.lock_in_years ?? 99));

  const bestMatch = Math.max(...itemsWithScores.map(i => i.matchScore));

  return (
    <motion.div className="comparison-detail-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
      <div className="detail-header">
        <button className="detail-back-btn" onClick={onBack}><ChevronLeft size={18}/> Back to Table</button>
        <h3>Deep Comparison — {selectedInvestments.length} Instruments</h3>
      </div>
      <div className="detail-grid" style={{ gridTemplateColumns: `200px repeat(${selectedInvestments.length}, 1fr)` }}>
        {/* Header row */}
        <div className="detail-cell detail-label-cell" />
        {itemsWithScores.map(inv => (
          <div key={inv.id} className="detail-cell detail-header-cell">
            <div className="detail-inv-icon" style={{ background: `${(CATEGORY_COLORS[inv.cat] || '#888')}20`, borderColor: `${(CATEGORY_COLORS[inv.cat] || '#888')}40` }}>
              <span style={{ color: CATEGORY_COLORS[inv.cat], fontWeight: 800, fontSize: '0.7rem' }}>{INVESTMENT_ICONS[inv.id] || 'IN'}</span>
            </div>
            <span className="detail-inv-name">{inv.abbr || inv.name}</span>
            <span className="detail-inv-cat" style={{ color: CATEGORY_COLORS[inv.cat] }}>{inv.cat}</span>
          </div>
        ))}
        {/* Metric rows */}
        {metrics.map(m => (
          <React.Fragment key={m.key}>
            <div className="detail-cell detail-label-cell">
              <span className="detail-metric-icon">{m.icon}</span>
              {m.label}
            </div>
            {itemsWithScores.map(inv => {
              const val = inv[m.key];
              const isBest = m.key === 'rate' ? (inv.rate === bestRate) 
                : m.key === 'lockIn' ? ((inv.lockIn ?? inv.lock_in_years ?? 99) === bestLock)
                : m.key === 'matchScore' ? (inv.matchScore === bestMatch)
                : false;
              return (
                <div key={inv.id} className={`detail-cell detail-value-cell ${isBest ? 'best-value' : ''}`}>
                  {m.fmt(val)}
                  {isBest && m.higher !== undefined && <span className="best-badge" style={m.key === 'matchScore' ? { background: '#10b981', color: '#fff' } : {}}>Best</span>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
        {/* Verdict row */}
        <div className="detail-cell detail-label-cell" style={{ fontWeight: 700, color: '#38bdf8' }}>AI Match Verdict</div>
        {itemsWithScores.map(inv => {
          const isWinner = inv.matchScore === bestMatch;
          return (
            <div key={inv.id} className={`detail-cell detail-value-cell ${isWinner ? 'verdict-winner' : ''}`}>
              {isWinner ? (
                <span className="winner-badge"><ArrowUpRight size={12}/> AI Top Pick</span>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Good Option</span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

const categoryInfo = [
  {
    key: 'Equity',
    title: 'Equity (Shares)',
    desc: 'Buy tiny pieces of companies. High growth, but values fluctuate.',
    growth: 'High (12.5% - 23%)',
    risk: 'High',
    lockIn: 'None (except ELSS: 3 yrs)',
    color: '#f43f5e'
  },
  {
    key: 'Debt',
    title: 'Debt (Savings & Bonds)',
    desc: 'Lend money for stable interest. Safe and steady income.',
    growth: 'Moderate (6.5% - 8.2%)',
    risk: 'Low',
    lockIn: 'Varies (0 - 15 yrs)',
    color: '#2dd4bf'
  },
  {
    key: 'Gold/Alternatives',
    title: 'Gold & Alternatives',
    desc: 'Tangible assets & balanced funds to shield from inflation.',
    growth: 'Moderate-High (13% - 14%)',
    risk: 'Medium',
    lockIn: 'Varies (0 - 8 yrs)',
    color: '#fbbf24'
  }
];

const getRiskColor = (riskLabel) => {
  const percent = RISK_LABEL_TO_LEVEL[riskLabel] || 50;
  return percent <= 30 ? '#2dd4bf' : percent <= 60 ? '#fbbf24' : '#f43f5e';
};

const ComparisonTableModal = ({ isOpen, onClose, allInvestments, embedded, profile }) => {
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterTax, setFilterTax] = useState(false);
  const [riskRange, setRiskRange] = useState(100);
  const [minInvRange, setMinInvRange] = useState(50000);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [sortBy, setSortBy] = useState('matchScore'); // default sort by Match Score
  const [showDetailedComparison, setShowDetailedComparison] = useState(false);

  const filtered = useMemo(() => {
    // 1. Map suitability scores to all items
    const scoredList = allInvestments.map(inv => {
      const lockIn = inv.lock_in_years !== undefined ? inv.lock_in_years : (inv.lockIn !== undefined ? inv.lockIn : 0);
      const riskLbl = inv.riskLabel || inv.risk_level || 'Medium';
      const rate = inv.rate || inv.expected_return_max || 0;
      return {
        ...inv,
        lockIn,
        riskLbl,
        rate,
        matchScore: computeSuitabilityMatch(inv, profile)
      };
    });

    // 2. Filter list based on criteria
    const filteredList = scoredList.filter(inv => {
      const cat = inv.cat || inv.category || '';
      if (filterCategory !== "All") {
        if (filterCategory === 'Equity') {
          if (cat !== 'Equity') return false;
        } else if (filterCategory === 'Debt') {
          if (cat !== 'Debt' && cat !== 'Government') return false;
        } else if (filterCategory === 'Gold/Alternatives') {
          if (cat !== 'Commodity' && cat !== 'Equity-Debt') return false;
        } else {
          if (cat !== filterCategory) return false;
        }
      }
      const hasTax = inv.taxType === "eee" || inv.taxType === "elss" || inv.taxType === "nps" || inv.tax_benefit;
      if (filterTax && !hasTax) return false;
      const minInv = inv.minMonthlyInvestment || inv.min_investment_inr || 0;
      if (minInv > minInvRange) return false;
      
      const riskPct = RISK_LABEL_TO_LEVEL[inv.riskLbl] || 50;
      if (riskPct > riskRange) return false;
      return true;
    });

    // 3. Sort list based on sortBy choice
    return [...filteredList].sort((a, b) => {
      if (sortBy === 'matchScore') return b.matchScore - a.matchScore;
      if (sortBy === 'rate') return b.rate - a.rate;
      if (sortBy === 'name') return (a.abbr || a.name).localeCompare(b.abbr || b.name);
      return 0;
    });
  }, [allInvestments, filterCategory, filterTax, minInvRange, riskRange, sortBy, profile]);

  if (!isOpen) return null;

  const categories = ["All", "Government", "Debt", "Equity", "Equity-Debt", "Commodity"];

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className={embedded ? "comparison-embedded" : "comparison-modal-overlay"} onClick={embedded ? undefined : onClose}>
      <div className={embedded ? "comparison-embedded-container" : "comparison-modal-container"} onClick={e => e.stopPropagation()}>
        
        {!embedded && (
          <header className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-box">
                <div style={{ width: 18, height: 14, background: '#38bdf8', borderRadius: '4px 4px 8px 8px', boxShadow: '0 0 12px #38bdf8' }}></div>
              </div>
              <div>
                <h2>Compare Investments</h2>
                <p>Compare {filtered.length} eligible investments side by side</p>
              </div>
            </div>
            <button className="modal-close-btn" onClick={onClose}><X size={32} color="#64748b" /></button>
          </header>
        )}

        <section className="filter-bar-container">
          <div className="filter-row filter-row-top">
            <div className="category-group" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: '#fff', fontSize: '0.85rem' }}>Category:</span>
              {categories.map(c => (
                <button 
                  key={c} 
                  className={`pill-btn ${filterCategory === c ? 'active' : ''}`}
                  onClick={() => setFilterCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            
            <div className="toggle-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Only Show Tax Beneficial</span>
              <label className="switch">
                <input type="checkbox" checked={filterTax} onChange={e => setFilterTax(e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="filter-row" style={{ marginTop: 20, gap: 40 }}>
            {/* Max Risk Slider */}
            <div className="range-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Max Risk Tolerance</span>
                <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.85rem' }}>{riskRange}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={riskRange} 
                onChange={e => setRiskRange(Number(e.target.value))} 
                className="filter-range-slider"
                style={{
                  '--filter-pct': `${riskRange}%`,
                  '--filter-gradient': `linear-gradient(to right, #fbbf24 0%, #ef4444 ${riskRange}%, rgba(255,255,255,0.1) ${riskRange}%, rgba(255,255,255,0.1) 100%)`
                }}
              />
            </div>

            {/* Max Min Investment Slider */}
            <div className="range-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Max Minimum Monthly SIP</span>
                <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.85rem' }}>₹{Number(minInvRange).toLocaleString()}</span>
              </div>
              <input 
                type="range" 
                min="500" max="50000" step="500" 
                value={minInvRange} 
                onChange={e => setMinInvRange(Number(e.target.value))} 
                className="filter-range-slider"
                style={{
                  '--filter-pct': `${(minInvRange/50000)*100}%`,
                  '--filter-gradient': `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${(minInvRange/50000)*100}%, rgba(255,255,255,0.1) ${(minInvRange/50000)*100}%, rgba(255,255,255,0.1) 100%)`
                }}
              />
            </div>

            {/* Sorting group */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Rank Priority:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '8px 12px', color: '#e2e8f0', outline: 'none', cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                <option value="matchScore">Suitability Match</option>
                <option value="rate">Expected Return</option>
                <option value="name">Alphabetical Name</option>
              </select>
            </div>
          </div>
        </section>

        {/* Category overview cards layout */}
        <div className="category-cards-container">
          {categoryInfo.map(cat => {
            const isActive = filterCategory === cat.key;
            return (
              <div 
                key={cat.key} 
                className={`category-overview-card ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (isActive) {
                    setFilterCategory("All");
                  } else {
                    setFilterCategory(cat.key);
                  }
                }}
                style={{ borderColor: isActive ? cat.color : undefined }}
              >
                <div className="card-cat-header">
                  <span className="card-cat-icon-wrapper" style={{ backgroundColor: `${cat.color}15` }}>
                    {cat.key === 'Equity' ? <TrendingUp size={20} style={{ color: cat.color }} /> :
                     cat.key === 'Debt' ? <Shield size={20} style={{ color: cat.color }} /> :
                     <Sparkles size={20} style={{ color: cat.color }} />}
                  </span>
                  <h3>{cat.title}</h3>
                </div>
                <p className="card-cat-desc">{cat.desc}</p>
                <div className="card-cat-tags">
                  <span className="cat-tag" style={{ border: `1px solid ${cat.color}30`, background: `${cat.color}05` }}>
                    <TrendingUp size={11} style={{ marginRight: 4 }} />
                    Growth: {cat.growth}
                  </span>
                  <span className="cat-tag" style={{ border: `1px solid ${cat.color}30`, background: `${cat.color}05` }}>
                    <Shield size={11} style={{ marginRight: 4 }} />
                    Risk: {cat.risk}
                  </span>
                  <span className="cat-tag" style={{ border: `1px solid ${cat.color}30`, background: `${cat.color}05` }}>
                    <Lock size={11} style={{ marginRight: 4 }} />
                    Lock-in: {cat.lockIn}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="toggle-details-container">
          <button 
            className="compare-action-btn secondary"
            onClick={() => setShowDetailedComparison(prev => !prev)}
            style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}
          >
            {showDetailedComparison ? (
              <>
                <Info size={14}/>
                Show Simplified Cards
              </>
            ) : (
              <>
                <BarChart3 size={14}/>
                Show Detailed Comparison Table
              </>
            )}
          </button>
        </div>

        {showDetailedComparison ? (
          <div className="table-scroll">
            <table className="comparison-grid-table">
              <thead>
                <tr>
                  <th>INVESTMENT NAME</th>
                  <th>AI SUITABILITY</th>
                  <th>EXPECTED return</th>
                  <th>RISK & LIQUIDITY</th>
                  <th>LOCK-IN <span style={{fontSize: '0.6rem'}}>(YRS)</span></th>
                  <th>TAX TREATMENT</th>
                  <th>MIN. INV.</th>
                  <th>SELECT</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const cat = inv.cat || inv.category || '';
                  const lockIn = inv.lockIn;
                  const riskLbl = inv.riskLbl;
                  const liquidity = getLiquidityLevel(lockIn);
                  const hasTax = inv.taxType === "eee" || inv.taxType === "elss" || inv.taxType === "nps" || inv.tax_benefit;
                  const taxLabel = inv.taxType ? inv.taxType.toUpperCase() : (inv.tax_section || 'None');
                  const minInv = inv.minMonthlyInvestment || inv.min_investment_inr || 0;
                  const rate = inv.rate;
                  const invId = inv.id;
                  const isSelected = selectedIds.includes(invId);
                  const matchScore = inv.matchScore;

                  let defaultTaxText = 'Slab';
                  if (cat === 'Equity') {
                    defaultTaxText = 'STCG / LTCG';
                  } else if (cat === 'Equity-Debt') {
                    defaultTaxText = 'Equity Tax / Slab';
                  } else if (cat === 'Commodity') {
                    defaultTaxText = 'LTCG / Slab';
                  }

                  const matchColor = matchScore >= 85 ? '#10b981' : matchScore >= 60 ? '#38bdf8' : '#64748b';
                  const matchBg = matchScore >= 85 ? 'rgba(16,185,129,0.12)' : matchScore >= 60 ? 'rgba(56,189,248,0.12)' : 'rgba(100,116,139,0.12)';
                  const matchBorder = matchScore >= 85 ? 'rgba(16,185,129,0.3)' : matchScore >= 60 ? 'rgba(56,189,248,0.3)' : 'rgba(100,116,139,0.3)';

                  return (
                    <tr key={invId} className={isSelected ? 'selected-row' : ''}>
                      <td>
                        <div className="inv-name-group">
                          <div className="inv-icon-wrapper" style={{
                            background: `linear-gradient(135deg, ${(CATEGORY_COLORS[cat] || '#888')}18, ${(CATEGORY_COLORS[cat] || '#888')}08)`,
                            borderColor: `${(CATEGORY_COLORS[cat] || '#888')}30`
                          }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.5px',
                              color: CATEGORY_COLORS[cat] || '#94a3b8',
                              fontFamily: 'Inter, monospace'
                            }}>{INVESTMENT_ICONS[invId] || inv.abbr?.substring(0,2) || 'IN'}</span>
                          </div>
                          <div className="inv-name-details">
                            <div className="inv-title">{inv.abbr || inv.name}</div>
                            <div className="inv-category-pill" style={{
                              color: isSelected ? undefined : CATEGORY_COLORS[cat],
                              borderColor: isSelected ? undefined : `${(CATEGORY_COLORS[cat] || '#888')}30`,
                              background: isSelected ? undefined : `${(CATEGORY_COLORS[cat] || '#888')}0a`
                            }}>{cat}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            color: matchColor, background: matchBg, border: `1px solid ${matchBorder}`,
                            padding: '4px 10px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 800,
                            boxShadow: matchScore >= 85 ? '0 0 10px rgba(16,185,129,0.1)' : 'none'
                          }}>
                            {matchScore}% Match
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, minWidth: '45px' }}>{rate}%</span>
                          <Sparkline 
                            color={CATEGORY_COLORS[cat] || '#888'} 
                            category={cat}
                            riskLevel={riskLbl}
                            rate={rate}
                            invId={invId}
                          />
                        </div>
                      </td>
                      <td>
                        <RiskLiquidityVisual risk={riskLbl} liquidity={liquidity} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                           <span style={{ fontWeight: 600 }}>{lockIn || 'None'}</span>
                           {lockIn ? <Lock size={12} color="#f43f5e" /> : <Unlock size={12} color="#64748b" />}
                        </div>
                      </td>
                      <td>
                        {hasTax ? (
                          <span className="tax-benefit-tag" style={taxLabel==='NPS'?{color:'#38bdf8', borderColor:'rgba(56,189,248,0.3)', background:'rgba(56,189,248,0.1)'}:{}}>{taxLabel}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{defaultTaxText}</span>
                        )}
                      </td>
                      <td>
                        <div style={{fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6}}>
                          {formatINR(minInv)}
                          <Link size={12} color="#fbbf24" style={{opacity: 0.8}} />
                        </div>
                      </td>
                      <td>
                        <label className="switch">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelect(invId)}
                          />
                          <span className="slider"></span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="simple-cards-scroll">
            <div className="simple-cards-grid">
              {filtered.map(inv => {
                const cat = inv.cat || inv.category || '';
                const lockIn = inv.lockIn;
                const riskLbl = inv.riskLbl;
                const rate = inv.rate;
                const invId = inv.id;
                const isSelected = selectedIds.includes(invId);
                const matchScore = inv.matchScore;
                
                const matchColor = matchScore >= 85 ? '#10b981' : matchScore >= 60 ? '#38bdf8' : '#64748b';
                const matchBg = matchScore >= 85 ? 'rgba(16,185,129,0.1)' : matchScore >= 60 ? 'rgba(56,189,248,0.1)' : 'rgba(100,116,139,0.1)';
                
                return (
                  <div 
                    key={invId} 
                    className={`simple-explorer-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelect(invId)}
                  >
                    <div className="simple-card-header">
                      <div className="simple-card-title-group">
                        <div className="simple-card-icon" style={{ color: CATEGORY_COLORS[cat], border: `1px solid ${(CATEGORY_COLORS[cat] || '#888')}30`, background: `${(CATEGORY_COLORS[cat] || '#888')}12` }}>
                          {INVESTMENT_ICONS[invId] || inv.abbr?.substring(0,2) || 'IN'}
                        </div>
                        <div>
                          <h4>{inv.abbr || inv.name}</h4>
                          <span className="simple-card-cat" style={{ color: CATEGORY_COLORS[cat] }}>{cat}</span>
                        </div>
                      </div>
                      <span className="simple-card-match" style={{ color: matchColor, background: matchBg, borderColor: `${matchColor}30` }}>
                        {matchScore}% Match
                      </span>
                    </div>

                    <p className="simple-card-desc">{inv.desc}</p>

                    <div className="simple-card-metrics">
                      <div className="simple-card-metric">
                        <span className="metric-label">Expected Growth</span>
                        <span className="metric-value highlight">{rate}%</span>
                      </div>
                      <div className="simple-card-metric">
                        <span className="metric-label">Risk Level</span>
                        <span className="metric-value" style={{ color: getRiskColor(riskLbl) }}>{riskLbl}</span>
                      </div>
                      <div className="simple-card-metric">
                        <span className="metric-label">Lock-in</span>
                        <span className="metric-value">{lockIn ? `${lockIn} Years` : 'None'}</span>
                      </div>
                    </div>

                    <div className="simple-card-footer">
                      <span className="select-action-text">{isSelected ? '✓ Selected for Compare' : 'Click to Select'}</span>
                      <label className="switch" onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelect(invId)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Deep Comparison Panel */}
        <AnimatePresence>
          {showComparison && (
            <ComparisonDetailPanel
              selectedInvestments={allInvestments.filter(i => selectedIds.includes(i.id))}
              profile={profile}
              onBack={() => setShowComparison(false)}
            />
          )}
        </AnimatePresence>

        <footer className="comparison-footer">
          {selectedIds.length > 0 ? (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="selected-count-badge">
                  <BarChart3 size={14}/> {selectedIds.length} Selected
                </div>
                <button className="clear-selection-btn" onClick={() => { setSelectedIds([]); setShowComparison(false); }}>
                  Clear All
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="compare-action-btn secondary"
                  onClick={() => setShowComparison(!showComparison)}
                  disabled={selectedIds.length < 2}
                >
                  <BarChart3 size={14}/>
                  {showComparison ? 'Hide Comparison' : 'Deep Compare'}
                </button>
                <button
                  className="compare-action-btn primary"
                  onClick={() => {
                    setSelectedIds([]);
                    setShowComparison(false);
                  }}
                >
                  <ArrowUpRight size={14}/>
                  Add to Portfolio
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="legend">
                <span className="legend-item"><span style={{color: '#2dd4bf'}}>●</span> Low Risk</span>
                <span className="legend-item"><span style={{color: '#fbbf24'}}>●</span> Moderate Risk</span>
                <span className="legend-item"><span style={{color: '#f43f5e'}}>●</span> High Risk</span>
              </div>
              <div className="pagination">
                <span>1-{filtered.length} of {allInvestments.length} investments</span>
              </div>
            </>
          )}
        </footer>

      </div>
    </div>
  );
};

export default ComparisonTableModal;
