/**
 * WealthGenie — Deep Dive Modal (Refactored Shell)
 * ─────────────────────────────────────────────────
 * Each tab panel is extracted into its own component under ./deepdive/
 * for maintainability. This file handles modal state, layout, and tab routing.
 */
import React, { useState, useMemo } from 'react';
import { X, MapPin, Info, Shield, History as HistoryIcon, IndianRupee, Flame, Calculator as CalcIcon, AlertTriangle } from 'lucide-react';
import { calculateSIPFutureValue } from '../utils/sipCalculator';
import { investmentDatabase } from '../investmentDatabase';
import JargonTooltip from './JargonTooltip';
import './DeepDiveModal.css';

// ── Tab Panel Components ────────────────────────────────────────
import { OverviewTab, WhereToInvestTab, CalculatorTab, TaxTab, HistoryTab, WhyInvestTab, StressTestTab } from './deepdive';

const TABS = [
  { id: 'Overview', icon: <Info size={16} /> },
  { id: 'Where to Invest', icon: <MapPin size={16} /> },
  { id: 'Calculator', icon: <CalcIcon size={16} /> },
  { id: 'Tax', icon: <Shield size={16} /> },
  { id: 'History', icon: <HistoryIcon size={16} /> },
  { id: 'Why Invest', icon: <IndianRupee size={16} /> },
  { id: 'Stress Test', icon: <Flame size={16} /> }
];

const DeepDiveModal = ({ isOpen, onClose, investment, onSelectInvestment, allRecommendations, horizon, userProfile }) => {
  const [activeTab, setActiveTab] = useState('Overview');
  const calcMode = 'SIP';
  const [calcAmount, setCalcAmount] = useState(5000);
  const [calcYears, setCalcYears] = useState(15);
  const [calcReturn, setCalcReturn] = useState(10);
  const [stressTestAmount, setStressTestAmount] = useState(100000);

  const [prevInvestmentId, setPrevInvestmentId] = useState(investment?.id);
  const [prevHorizon, setPrevHorizon] = useState(horizon);

  // ─── Instrument-Aware Calculator Bounds ───
  const calcBounds = useMemo(() => {
    if (!investment) return { returnMin: 1, returnMax: 30, yearMin: 1, yearMax: 40 };
    const retMin = investment.expected_return_min ?? investment.returnRange?.min ?? (investment.expectedReturn ? investment.expectedReturn * 0.85 : (investment.rate ? investment.rate * 0.85 : 5));
    const retMax = investment.expected_return_max ?? investment.returnRange?.max ?? (investment.expectedReturn || investment.rate || 12);
    const cat = (investment.category || investment.cat || '').toLowerCase();
    const name = (investment.name || investment.abbr || '').toLowerCase();

    let yearMin = 1, yearMax = 30;
    if (name.includes('ppf')) { yearMin = 15; yearMax = 30; }
    else if (name.includes('scss')) { yearMin = 5; yearMax = 8; }
    else if (name.includes('sukanya') || name.includes('ssy')) { yearMin = 15; yearMax = 21; }
    else if (name.includes('nps')) { yearMin = 10; yearMax = 40; }
    else if (name.includes('rbi') && name.includes('bond')) { yearMin = 7; yearMax = 7; }
    else if (name.includes('pmvvy')) { yearMin = 10; yearMax = 10; }
    else if (name.includes('fd') || name.includes('fixed deposit')) { yearMin = 1; yearMax = 10; }
    else if (name.includes('liquid')) { yearMin = 1; yearMax = 3; }
    else if (name.includes('sgb') || name.includes('gold bond')) { yearMin = 5; yearMax = 8; }
    else if (name.includes('elss')) { yearMin = 3; yearMax = 25; }
    else if (cat.includes('equity')) { yearMin = 3; yearMax = 30; }
    else if (cat.includes('hybrid')) { yearMin = 3; yearMax = 25; }
    else if (cat.includes('debt') || cat.includes('deposit') || cat.includes('bond')) { yearMin = 1; yearMax = 10; }

    const sliderRetMin = Math.max(1, Math.floor(retMin - 2));
    const sliderRetMax = Math.min(30, Math.ceil(retMax + 2));

    return { returnMin: sliderRetMin, returnMax: sliderRetMax, yearMin, yearMax };
  }, [investment]);

  // Reset calculator state when instrument changes
  if (investment?.id !== prevInvestmentId || horizon !== prevHorizon) {
    setPrevInvestmentId(investment?.id);
    setPrevHorizon(horizon);

    const retMin = investment ? (investment.expected_return_min ?? investment.returnRange?.min ?? (investment.expectedReturn ? investment.expectedReturn * 0.85 : (investment.rate ? investment.rate * 0.85 : 5))) : 5;
    const retMax = investment ? (investment.expected_return_max ?? investment.returnRange?.max ?? (investment.expectedReturn || investment.rate || 12)) : 12;
    const cat = investment ? (investment.category || investment.cat || '').toLowerCase() : '';
    const name = investment ? (investment.name || investment.abbr || '').toLowerCase() : '';

    let _yearMin = 1, yearMax = 30;
    if (name.includes('ppf')) { _yearMin = 15; yearMax = 30; }
    else if (name.includes('scss')) { _yearMin = 5; yearMax = 8; }
    else if (name.includes('sukanya') || name.includes('ssy')) { _yearMin = 15; yearMax = 21; }
    else if (name.includes('nps')) { _yearMin = 10; yearMax = 40; }
    else if (name.includes('rbi') && name.includes('bond')) { _yearMin = 7; yearMax = 7; }
    else if (name.includes('pmvvy')) { _yearMin = 10; yearMax = 10; }
    else if (name.includes('fd') || name.includes('fixed deposit')) { _yearMin = 1; yearMax = 10; }
    else if (name.includes('liquid')) { _yearMin = 1; yearMax = 3; }
    else if (name.includes('sgb') || name.includes('gold bond')) { _yearMin = 5; yearMax = 8; }
    else if (name.includes('elss')) { _yearMin = 3; yearMax = 25; }
    else if (cat.includes('equity')) { _yearMin = 3; yearMax = 30; }
    else if (cat.includes('hybrid')) { _yearMin = 3; yearMax = 25; }
    else if (cat.includes('debt') || cat.includes('deposit') || cat.includes('bond')) { _yearMin = 1; yearMax = 10; }

    const sliderRetMin = Math.max(1, Math.floor(retMin - 2));
    const sliderRetMax = Math.min(30, Math.ceil(retMax + 2));
    const midReturn = ((sliderRetMin + sliderRetMax) / 2).toFixed(1);

    setCalcReturn(Number(midReturn));
    setCalcYears(Math.min(horizon || 10, yearMax));
    setCalcAmount(5000);
    setActiveTab('Overview');
  }

  // Normalize fields
  const inv = useMemo(() => {
    if (!investment) return {};
    return {
      ...investment,
      expected_return_min: investment.expected_return_min ?? investment.returnRange?.min ?? (investment.expectedReturn ? investment.expectedReturn * 0.85 : (investment.rate ? investment.rate * 0.85 : 8)),
      expected_return_max: investment.expected_return_max ?? investment.returnRange?.max ?? (investment.expectedReturn || investment.rate || 10),
      category: investment.category || investment.cat || 'Other',
      risk_level: investment.risk_level || investment.riskLabel || 'Medium',
      lock_in_years: investment.lock_in_years ?? investment.lockIn ?? 0,
      tax_benefit: investment.tax_benefit ?? false,
      tax_section: investment.tax_section || 'N/A',
      tax_free_interest: investment.tax_free_interest ?? false,
      liquidity: investment.liquidity || 'Medium',
      description: investment.description || investment.desc || 'No description available.',
      name: investment.name || investment.abbr || 'Investment Instrument',
    };
  }, [investment]);

  // Historical data — deterministic simulation
  const historicalData = useMemo(() => {
    const retMin = inv.expected_return_min || 8;
    const retMax = inv.expected_return_max || 10;
    const avgReturn = (retMin + retMax) / 2;
    const spread = (retMax - retMin) / 2;
    const data = [];
    let base = 100; let fdBase = 100; let infBase = 100;
    const cycleFactors = [0.6, 1.2, 0.9, 1.4, -0.3, 1.1, 0.7, 1.3, 0.5, 1.0];
    for (let y = 1; y <= 10; y++) {
      const cycleFactor = cycleFactors[y - 1] || 1.0;
      const yearReturn = avgReturn + (spread * cycleFactor);
      base = base * (1 + yearReturn / 100);
      fdBase = fdBase * (1 + 6.5 / 100);
      infBase = infBase * (1 + 6 / 100);
      data.push({ year: `Year ${y}`, investment: Math.round(base), fd: Math.round(fdBase), inflation: Math.round(infBase) });
    }
    return data;
  }, [inv]);

  if (!isOpen || !investment) return null;

  // ─── Runtime Safety: Missing Catalog ID Fallback ───
  const catalogMatch = investmentDatabase.find(x => x.id === investment?.id);
  if (!catalogMatch) {
    console.warn(`[WealthGenie Diagnostics] Investment ID "${investment?.id}" not found in master catalog.`);
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="ddm-content" onClick={e => e.stopPropagation()} style={{ minHeight: '320px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '48px 32px' }}>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          <div style={{ textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ display: 'inline-flex', padding: '18px', borderRadius: '50%', background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', marginBottom: '20px' }}>
              <AlertTriangle size={36} />
            </div>
            <h3 style={{ color: '#f8fafc', fontSize: '1.2rem', marginBottom: '8px' }}>Investment Details Unavailable</h3>
            <p style={{ fontSize: '0.9rem', maxWidth: '340px', margin: '0 auto 24px auto', lineHeight: '1.6', color: '#94a3b8' }}>
              The profile for <strong style={{ color: '#e2e8f0' }}>"{investment?.name || investment?.id || 'Unknown'}"</strong> is temporarily unavailable or undergoing maintenance.
            </p>
            <button onClick={onClose} style={{ background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#0f172a', border: 'none', borderRadius: '10px', padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Comparison data
  const comparisonData = (allRecommendations || []).slice(0, 8).map(r => ({
    name: (r.name || r.abbr || '').length > 10 ? (r.name || r.abbr || '').substring(0, 10) + '..' : (r.name || r.abbr || ''),
    returnMax: r.expected_return_max || r.rate || 0,
    isThis: r.id === inv.id
  }));

  // Calculator logic
  const maturityValue = calculateSIPFutureValue(calcAmount, calcReturn, calcYears);
  const totalInvested = calcAmount * 12 * calcYears;
  const estimatedReturns = Math.max(0, maturityValue - totalInvested);
  
  const INFLATION_RATE = 6;
  const inflationFactor = Math.pow(1 + INFLATION_RATE / 100, calcYears);
  const realMaturityValue = maturityValue / inflationFactor;
  
  // Post-Tax Estimation
  const postTaxValue = (() => {
    const gains = estimatedReturns;
    if (gains <= 0) return maturityValue;
    const cat = (inv.category || '').toLowerCase();
    const isTaxFree = inv.tax_free_interest || false;
    const name = (inv.name || '').toLowerCase();
    
    if (isTaxFree || name.includes('ppf') || name.includes('sukanya')) return maturityValue;
    if (cat === 'equity' || cat === 'hybrid') {
      const exemptGains = 125000;
      const taxableGains = Math.max(0, gains - exemptGains);
      return maturityValue - (taxableGains * 0.125);
    }
    if (cat === 'debt' || cat === 'government' || name.includes('fd') || name.includes('fixed deposit') || name.includes('rbi') || name.includes('scss') || name.includes('pmvvy') || name.includes('vaya vandana')) {
      if (name.includes('nps')) {
        return maturityValue - (gains * 0.40 * 0.30);
      }
      return maturityValue - (gains * 0.30);
    }
    if (name.includes('gold') || name.includes('sgb')) {
      if (name.includes('sgb')) return maturityValue;
      return maturityValue - (gains * 0.125);
    }
    return maturityValue - (gains * 0.20);
  })();

  // Shared props for calculator-dependent tabs
  const calcProps = { inv, calcAmount, calcReturn, calcYears, calcMode, calcBounds, maturityValue, totalInvested, estimatedReturns, postTaxValue, realMaturityValue };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        /* Scoped overrides for Deep Dive Modal calculator range sliders */
        .calc-field input[type="range"] {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 100% !important;
          height: 20px !important;
          background: transparent !important;
          outline: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-sizing: border-box !important;
          cursor: pointer !important;
        }

        .calc-field input[type="range"]::-webkit-slider-runnable-track {
          width: 100% !important;
          height: 4px !important;
          border-radius: 3px !important;
          border: none !important;
          box-sizing: border-box !important;
          background: linear-gradient(to right, #38bdf8 0%, #38bdf8 var(--slider-pct, 0%), rgba(255,255,255,0.08) var(--slider-pct, 0%), rgba(255,255,255,0.08) 100%) !important;
        }

        .calc-field input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 16px !important;
          width: 16px !important;
          border-radius: 50% !important;
          background: #ffffff !important;
          border: 3px solid #38bdf8 !important;
          cursor: pointer !important;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.5), 0 2px 6px rgba(0, 0, 0, 0.4) !important;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease !important;
          margin-top: -6px !important;
          box-sizing: border-box !important;
        }

        .calc-field input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.15) !important;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5) !important;
        }

        .calc-field input[type="range"]::-moz-range-track {
          width: 100% !important;
          height: 4px !important;
          border-radius: 3px !important;
          border: none !important;
          box-sizing: border-box !important;
          background: linear-gradient(to right, #38bdf8 0%, #38bdf8 var(--slider-pct, 0%), rgba(255,255,255,0.08) var(--slider-pct, 0%), rgba(255,255,255,0.08) 100%) !important;
        }

        .calc-field input[type="range"]::-moz-range-thumb {
          height: 16px !important;
          width: 16px !important;
          border-radius: 50% !important;
          background: #ffffff !important;
          border: 3px solid #38bdf8 !important;
          cursor: pointer !important;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.5), 0 2px 6px rgba(0, 0, 0, 0.4) !important;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease !important;
          box-sizing: border-box !important;
        }

        .calc-field input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.15) !important;
          box-shadow: 0 0 14px rgba(56, 189, 248, 0.7), 0 2px 8px rgba(0, 0, 0, 0.5) !important;
        }
      `}</style>
      <div className="ddm-content" onClick={e => e.stopPropagation()}>
        
        {/* Sticky Header */}
        <div className="ddm-sticky-header">
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          
          <div className="ddm-header-top">
            <span className="premium-badge">{inv.category}</span>
            <h2 className="ddm-title">{inv.name}</h2>
          </div>

          <div className="ddm-quick-metrics">
            <div className="metric-item">
              <span className="metric-label"><JargonTooltip term="Risk Profile">Risk Profile</JargonTooltip></span>
              <span className="metric-value" style={{ color: inv.risk_level.includes('High') ? '#f43f5e' : inv.risk_level.includes('Medium') ? '#f59e0b' : '#22c55e' }}>
                {inv.risk_level}
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label"><JargonTooltip term="Return Potential">Return Potential</JargonTooltip></span>
              <span className="metric-value" style={{ color: '#22c55e' }}>
                {parseFloat(inv.expected_return_min).toFixed(1).replace(/\.0$/, '')}% – {parseFloat(inv.expected_return_max).toFixed(1).replace(/\.0$/, '')}%
              </span>
            </div>
            <div className="metric-item">
              <span className="metric-label"><JargonTooltip term="Lock-in Period">Lock-in Period</JargonTooltip></span>
              <span className="metric-value">{inv.lock_in_years > 0 ? `${inv.lock_in_years} Years` : 'None'}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label"><JargonTooltip term="Tax Benefit">Tax Benefit</JargonTooltip></span>
              <span className="metric-value">{inv.tax_benefit ? `Section ${inv.tax_section}` : 'None'}</span>
            </div>
          </div>

          <div className="ddm-tabs-nav">
            {TABS.map(tab => (
              <button key={tab.id} className={`ddm-tab-btn ${activeTab === tab.id ? 'ddm-tab-btn--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{tab.icon} {tab.id}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="ddm-scroll-container">
          {activeTab === 'Overview' && <OverviewTab inv={inv} comparisonData={comparisonData} onSelectInvestment={onSelectInvestment} />}
          {activeTab === 'Where to Invest' && <WhereToInvestTab inv={inv} userProfile={userProfile} />}
          {activeTab === 'Calculator' && <CalculatorTab {...calcProps} setCalcAmount={setCalcAmount} setCalcYears={setCalcYears} setCalcReturn={setCalcReturn} />}
          {activeTab === 'Tax' && <TaxTab inv={inv} />}
          {activeTab === 'History' && <HistoryTab inv={inv} historicalData={historicalData} />}
          {activeTab === 'Why Invest' && <WhyInvestTab {...calcProps} setActiveTab={setActiveTab} />}
          {activeTab === 'Stress Test' && <StressTestTab inv={inv} stressTestAmount={stressTestAmount} setStressTestAmount={setStressTestAmount} />}
        </div>
      </div>
    </div>
  );
};

export default DeepDiveModal;
