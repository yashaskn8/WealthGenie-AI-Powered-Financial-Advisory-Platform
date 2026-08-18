import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { formatINR } from '../utils/indianNumberFormat';
import { getTaxSavingRecommendations, SECTION_80C_LIMIT, SECTION_80CCD_1B_LIMIT } from '../utils/taxCalculator';
import { investmentDatabase } from '../investmentDatabase';
import { ShieldCheck, Calculator, Wallet, Receipt, Percent, PiggyBank, TrendingDown, Info, Sparkles, IndianRupee, HelpCircle, Layers, ArrowUpRight, CheckCircle2, Heart, ToggleLeft, ToggleRight, Landmark, Coins } from 'lucide-react';
import JargonTooltip from './JargonTooltip';
import api from '../services/api';
import './TaxScreen.css';

// Section 80D limits
const SECTION_80D_SELF_LIMIT = 25000;
const SECTION_80D_SELF_SENIOR_LIMIT = 50000;
const SECTION_80D_PARENTS_LIMIT = 25000;
const SECTION_80D_PARENTS_SENIOR_LIMIT = 50000;

// Local Fallback Calculator (Fully aligned with latest FY2025-26 rules)
function calculateTaxesLocal(grossIncome, section80C, sectionNPS, hra = 0, homeLoanInterest = 0, other = 0, section80D_self = 0, section80D_parents = 0, parentsSenior = false, age = 30) {
  const stdDeductionNew = 75000;
  const taxableNew = Math.max(0, grossIncome - stdDeductionNew);
  let taxNew = 0;
  
  // Slab details for FY 2025-26 New Regime:
  if (taxableNew <= 1200000) {
    taxNew = 0; // Rebate covers taxable income up to 12L under Sec 87A for FY 2025-26
  } else {
    let temp = taxableNew;
    if (temp > 2400000) { taxNew += (temp - 2400000) * 0.30; temp = 2400000; }
    if (temp > 2000000) { taxNew += (temp - 2000000) * 0.25; temp = 2000000; }
    if (temp > 1600000) { taxNew += (temp - 1600000) * 0.20; temp = 1600000; }
    if (temp > 1200000) { taxNew += (temp - 1200000) * 0.15; temp = 1200000; }
    if (temp > 800000) { taxNew += (temp - 800000) * 0.10; temp = 800000; }
    if (temp > 400000) { taxNew += (temp - 400000) * 0.05; }

    // Marginal relief for 87A (tax cannot exceed the excess over ₹12,00,000)
    const excessOverLimit = taxableNew - 1200000;
    if (taxNew > excessOverLimit) {
      taxNew = excessOverLimit;
    }
  }
  const taxBeforeCessNew = taxNew;
  taxNew = taxNew * 1.04;

  // Section 80D calculation (Old Regime only)
  const selfSenior = (Number(age) || 30) >= 60;
  const max80DSelf = selfSenior ? SECTION_80D_SELF_SENIOR_LIMIT : SECTION_80D_SELF_LIMIT;
  const max80DParents = parentsSenior ? SECTION_80D_PARENTS_SENIOR_LIMIT : SECTION_80D_PARENTS_LIMIT;
  const allowed80DSelf = Math.min(Number(section80D_self) || 0, max80DSelf);
  const allowed80DParents = Math.min(Number(section80D_parents) || 0, max80DParents);
  const total80D = allowed80DSelf + allowed80DParents;

  const stdDeductionOld = 50000;
  const deductionsOld = Math.min(SECTION_80C_LIMIT, Number(section80C) || 0) + 
                        Math.min(SECTION_80CCD_1B_LIMIT, Number(sectionNPS) || 0) +
                        total80D +
                        (Number(hra) || 0) +
                        Math.min(200000, Number(homeLoanInterest) || 0) +
                        (Number(other) || 0);

  const taxableOld = Math.max(0, grossIncome - stdDeductionOld - deductionsOld);
  let taxOld = 0;
  
  // Slab details for Old Regime
  if (taxableOld <= 500000) {
    taxOld = 0;
  } else {
    let temp = taxableOld;
    if (temp > 1000000) { taxOld += (temp - 1000000) * 0.30; temp = 1000000; }
    if (temp > 500000) { taxOld += (temp - 500000) * 0.20; temp = 500000; }
    if (temp > 250000) { taxOld += (temp - 250000) * 0.05; }
  }
  const taxBeforeCessOld = taxOld;
  taxOld = taxOld * 1.04;

  return {
    taxableNew: Math.round(taxableNew),
    taxNew: Math.round(taxNew),
    taxBeforeCessNew: Math.round(taxBeforeCessNew),
    taxableOld: Math.round(taxableOld),
    taxOld: Math.round(taxOld),
    taxBeforeCessOld: Math.round(taxBeforeCessOld),
    difference: Math.round(Math.abs(taxOld - taxNew)),
    betterRegime: taxNew < taxOld ? 'New' : taxOld < taxNew ? 'Old' : 'Either',
    // Deduction breakdown for comparison matrix
    stdDeductionNew: 75000,
    stdDeductionOld: 50000,
    deductionsOld: Math.round(deductionsOld),
    total80D: Math.round(total80D),
    allowed80DSelf: Math.round(allowed80DSelf),
    allowed80DParents: Math.round(allowed80DParents),
  };
}

function findDeductionCrossoverLocal(grossIncome) {
  const newRegimeTax = calculateTaxesLocal(grossIncome, 0, 0).taxNew;
  if (newRegimeTax === 0) return 0;

  for (let ded = 0; ded <= 600000; ded += 1000) {
    const c80 = Math.min(150000, ded);
    const nps = Math.min(50000, Math.max(0, ded - 150000));
    const testResult = calculateTaxesLocal(grossIncome, c80, nps);
    if (testResult.taxOld <= testResult.taxNew) {
      return ded;
    }
  }
  return null; 
}

function getSlabBreakdownLocal(taxableIncome, isNew) {
  const slabs = isNew 
    ? [
        { limit: 400000, rate: 0.00, label: '₹0 - ₹4L' },
        { limit: 400000, rate: 0.05, label: '₹4L - ₹8L' },
        { limit: 400000, rate: 0.10, label: '₹8L - ₹12L' },
        { limit: 400000, rate: 0.15, label: '₹12L - ₹16L' },
        { limit: 400000, rate: 0.20, label: '₹16L - ₹20L' },
        { limit: 400000, rate: 0.25, label: '₹20L - ₹24L' },
        { limit: Infinity, rate: 0.30, label: 'Above ₹24L' }
      ]
    : [
        { limit: 250000, rate: 0.00, label: '₹0 - ₹2.5L' },
        { limit: 250000, rate: 0.05, label: '₹2.5L - ₹5L' },
        { limit: 500000, rate: 0.20, label: '₹5L - ₹10L' },
        { limit: Infinity, rate: 0.30, label: 'Above ₹10L' }
      ];

  let remaining = taxableIncome;
  const breakdown = [];
  const rebateLimit = isNew ? 1200000 : 500000;
  const qualifiesForRebate = taxableIncome <= rebateLimit;
  let totalTaxBeforeRebate = 0;

  for (let i = 0; i < slabs.length; i++) {
    const slab = slabs[i];
    const width = slab.limit;
    const rate = slab.rate;
    
    if (remaining <= 0) {
      // Don't add empty slabs — they just clutter the table
      continue;
    }
    
    const amountInSlab = Math.min(remaining, width);
    const taxInSlab = Math.round(amountInSlab * rate);
    totalTaxBeforeRebate += taxInSlab;
    
    breakdown.push({
      label: slab.label,
      rate: rate * 100,
      taxableInSlab: Math.round(amountInSlab),
      taxInSlab
    });
    
    remaining -= amountInSlab;
  }

  // If rebate applies, add a rebate row with beginner-friendly language
  if (qualifiesForRebate && totalTaxBeforeRebate > 0) {
    breakdown.push({
      label: 'Government Tax Rebate (Section 87A)',
      rate: '',
      taxableInSlab: 0,
      taxInSlab: -totalTaxBeforeRebate,
      isRebateRow: true
    });
  }

  // Add a total row so user sees the final number clearly
  const finalTax = qualifiesForRebate ? 0 : totalTaxBeforeRebate;
  breakdown.push({
    label: 'Your Total Tax',
    rate: '',
    taxableInSlab: taxableIncome,
    taxInSlab: finalTax,
    isTotalRow: true
  });
  
  return breakdown;
}


const TaxScreen = ({ profile, onLearnMore }) => {
  const defaultIncome = (profile?.monthly_income || 65000) * 12;
  const [annualIncome, setAnnualIncome] = useState(defaultIncome);
  const [regime, setRegime] = useState(profile?.taxRegime || 'new');
  const [existing80C, setExisting80C] = useState(profile?.section80C || profile?.section_80c ? String(profile?.section80C || profile?.section_80c) : '');
  const [existing80CCD, setExisting80CCD] = useState(profile?.section80CCD1B || profile?.section_80ccd1b || profile?.nps80CCD1B ? String(profile?.section80CCD1B || profile?.section_80ccd1b || profile?.nps80CCD1B) : '');
  const [existingHRA, setExistingHRA] = useState(profile?.hra ? String(profile.hra) : '');
  const [existingHomeLoan, setExistingHomeLoan] = useState(profile?.homeLoanInterest || profile?.home_loan_interest ? String(profile?.homeLoanInterest || profile?.home_loan_interest) : '');
  const [existingOther, setExistingOther] = useState('');
  const [existing80DSelf, setExisting80DSelf] = useState(profile?.section80D_self || profile?.section_80d_self ? String(profile?.section80D_self || profile?.section_80d_self) : '');
  const [existing80DParents, setExisting80DParents] = useState(profile?.section80D_parents || profile?.section_80d_parents ? String(profile?.section80D_parents || profile?.section_80d_parents) : '');
  const [parentsSenior, setParentsSenior] = useState(Boolean(profile?.parentsSenior !== undefined ? profile.parentsSenior : profile?.parents_senior));
  const [showSlabBreakdown, setShowSlabBreakdown] = useState(false);

  // Server state tracking
  const [serverTaxData, setServerTaxData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const [prevIncome, setPrevIncome] = useState(defaultIncome);

  if (defaultIncome !== prevIncome) {
    setPrevIncome(defaultIncome);
    setAnnualIncome(defaultIncome);
    setRegime(profile?.taxRegime || 'new');
    setExisting80C(profile?.section80C || profile?.section_80c ? String(profile?.section80C || profile?.section_80c) : '');
    setExisting80CCD(profile?.section80CCD1B || profile?.section_80ccd1b || profile?.nps80CCD1B ? String(profile?.section80CCD1B || profile?.section_80ccd1b || profile?.nps80CCD1B) : '');
    setExistingHRA(profile?.hra ? String(profile.hra) : '');
    setExistingHomeLoan(profile?.homeLoanInterest || profile?.home_loan_interest ? String(profile?.homeLoanInterest || profile?.home_loan_interest) : '');
    setExisting80DSelf(profile?.section80D_self || profile?.section_80d_self ? String(profile?.section80D_self || profile?.section_80d_self) : '');
    setExisting80DParents(profile?.section80D_parents || profile?.section_80d_parents ? String(profile?.section80D_parents || profile?.section_80d_parents) : '');
    setParentsSenior(Boolean(profile?.parentsSenior !== undefined ? profile.parentsSenior : profile?.parents_senior));
  }

  // ── Debounced API Synchronisation ──
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setApiError(null);

    const timer = setTimeout(async () => {
      try {
        const payload = {
          section80C: existing80C === '' ? 0 : Number(existing80C),
          nps80CCD1B: existing80CCD === '' ? 0 : Number(existing80CCD),
          hra: existingHRA === '' ? 0 : Number(existingHRA),
          homeLoanInterest: existingHomeLoan === '' ? 0 : Number(existingHomeLoan),
          other: existingOther === '' ? 0 : Number(existingOther),
          section80D_self: existing80DSelf === '' ? 0 : Number(existing80DSelf),
          section80D_parents: existing80DParents === '' ? 0 : Number(existing80DParents),
          parents_senior: parentsSenior,
          age: profile?.age || 30,
        };
        const response = await api.compareTax(annualIncome, payload);
        if (active) {
          setServerTaxData(response);
          setApiError(null);
        }
      } catch (err) {
        console.error("Backend tax query failed, sliding into high-fidelity local calculator:", err);
        if (active) {
          setApiError(err.message || "Failed to synchronise with tax slabs server.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }, 450); // Debounce delay prevents API throttling

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [annualIncome, existing80C, existing80CCD, existingHRA, existingHomeLoan, existingOther, existing80DSelf, existing80DParents, parentsSenior, profile?.age]);

  // Fast Local Fallback (instant responses while sliding)
  const localTax = useMemo(() => {
    return calculateTaxesLocal(
      annualIncome, 
      existing80C, 
      existing80CCD, 
      existingHRA, 
      existingHomeLoan, 
      existingOther,
      existing80DSelf,
      existing80DParents,
      parentsSenior,
      profile?.age || 30
    );
  }, [annualIncome, existing80C, existing80CCD, existingHRA, existingHomeLoan, existingOther, existing80DSelf, existing80DParents, parentsSenior, profile?.age]);

  const remaining80C = Math.max(0, SECTION_80C_LIMIT - (Number(existing80C) || 0));
  const remaining80CCD = Math.max(0, SECTION_80CCD_1B_LIMIT - (Number(existing80CCD) || 0));
  const self80DLimit = (Number(profile?.age) || 30) >= 60 ? SECTION_80D_SELF_SENIOR_LIMIT : SECTION_80D_SELF_LIMIT;
  const parents80DLimit = parentsSenior ? SECTION_80D_PARENTS_SENIOR_LIMIT : SECTION_80D_PARENTS_LIMIT;
  const allowed80DSelf = Math.min(self80DLimit, Number(existing80DSelf) || 0);
  const allowed80DParents = Math.min(parents80DLimit, Number(existing80DParents) || 0);

  const taxSavingRecs = useMemo(() => {
    return getTaxSavingRecommendations(remaining80C, remaining80CCD, investmentDatabase);
  }, [remaining80C, remaining80CCD]);

  // Resolve values: backend primary, local fallback secondary
  const totalTax = serverTaxData
    ? (regime === 'new' ? serverTaxData.new_regime.tax : serverTaxData.old_regime.tax)
    : (regime === 'new' ? localTax.taxNew : localTax.taxOld);

  const taxableIncome = serverTaxData
    ? (regime === 'new' ? serverTaxData.new_regime.taxable_income : serverTaxData.old_regime.taxable_income)
    : (regime === 'new' ? localTax.taxableNew : localTax.taxableOld);

  const effectiveRate = serverTaxData
    ? (regime === 'new' ? serverTaxData.new_regime.effective_rate : serverTaxData.old_regime.effective_rate)
    : (annualIncome > 0 ? ((totalTax / annualIncome) * 100).toFixed(1) : 0);

  const standardDeduction = serverTaxData
    ? (regime === 'new' ? serverTaxData.new_regime.standard_deduction : serverTaxData.old_regime.standard_deduction)
    : (regime === 'new' ? 75000 : 50000);

  const taxBeforeCess = serverTaxData
    ? (regime === 'new' ? serverTaxData.new_regime.tax - serverTaxData.new_regime.cess : serverTaxData.old_regime.tax - serverTaxData.old_regime.cess)
    : (regime === 'new' ? localTax.taxBeforeCessNew : localTax.taxBeforeCessOld);

  const marginalRate = taxBeforeCess > 0 ? (taxBeforeCess / taxableIncome) : 0;
  const potentialSaving = regime === 'old' ? Math.round((remaining80C + remaining80CCD) * marginalRate * 1.04) : 0;

  const betterRegime = serverTaxData
    ? (serverTaxData.saving === 0 ? 'Either' : (serverTaxData.recommended_regime === 'new' ? 'New' : 'Old'))
    : localTax.betterRegime;

  const betterRegimeSavings = serverTaxData ? serverTaxData.saving : localTax.difference;

  // Breakdown lists for slabs tables
  const newRegimeSlabs = useMemo(() => {
    const tInc = serverTaxData ? serverTaxData.new_regime.taxable_income : localTax.taxableNew;
    return getSlabBreakdownLocal(tInc, true);
  }, [serverTaxData, localTax.taxableNew]);

  const oldRegimeSlabs = useMemo(() => {
    const tInc = serverTaxData ? serverTaxData.old_regime.taxable_income : localTax.taxableOld;
    return getSlabBreakdownLocal(tInc, false);
  }, [serverTaxData, localTax.taxableOld]);

  const activeSlabs = regime === 'new' ? newRegimeSlabs : oldRegimeSlabs;

  // Crossover breakpoint
  const crossoverBreakpoint = useMemo(() => findDeductionCrossoverLocal(annualIncome), [annualIncome]);
  const currentDeductions = (Number(existing80C) || 0) + (Number(existing80CCD) || 0) + (Number(existingHRA) || 0) + (Number(existingHomeLoan) || 0) + allowed80DSelf + allowed80DParents + (Number(existingOther) || 0);

  const taxOldVal = serverTaxData ? serverTaxData.old_regime.tax : localTax.taxOld;
  const taxNewVal = serverTaxData ? serverTaxData.new_regime.tax : localTax.taxNew;

  const regimeChartData = [
    { label: 'Old Regime', value: taxOldVal, fill: 'url(#colorOld)' },
    { label: 'New Regime', value: taxNewVal, fill: 'url(#colorNew)' },
  ];

  const optimizationChartData = [
    { label: 'Current Tax', value: totalTax, fill: 'url(#colorCurrent)' },
    { label: 'After Optimization', value: Math.max(0, totalTax - potentialSaving), fill: 'url(#colorOpt)' },
  ];

  return (
    <div className="tax-page">
      {/* Visual Ambient Orbs */}
      <div className="tax-bg-orb tax-bg-orb--1" />
      <div className="tax-bg-orb tax-bg-orb--2" />

      <motion.header 
        className="tax-page-header"
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="tax-page-badge">
          <ShieldCheck size={11} style={{ marginRight: 6 }} />
          Tax Optimizer
        </div>
        <h1 className="tax-page-title">Save Money on Taxes</h1>
        <p className="tax-page-subtitle">
          Find out how much tax you owe, which tax system saves you more, and discover easy ways to reduce your tax bill.
        </p>
        <div className="tax-header-divider" />
      </motion.header>

      {/* UNVERIFIED TAX DATA WARNING */}
      <AnimatePresence>
        {serverTaxData && (serverTaxData.verified === false || serverTaxData.warning) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="tax-warning-banner"
          >
            <div className="tax-warning-icon-wrapper">
              <Info size={22} />
            </div>
            <div>
              <h2 className="tax-warning-title">UNVERIFIED TAX DATA</h2>
              <p className="tax-warning-text">
                {serverTaxData.warning || 'The tax slabs used for this calculation have not been confirmed against an official gazette source. Do not use this for actual tax filing.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verdict Banner */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="tax-verdict-banner"
      >
        <div className="tax-verdict-icon-wrapper">
          <Sparkles size={24} />
        </div>
        <div>
          <h2 className="tax-verdict-title">Our Recommendation</h2>
          <p className="tax-verdict-text">
            {betterRegime !== 'Either' ? (
              <span>You'll pay less tax with the <strong>{betterRegime} Regime</strong> - saving <strong>{formatINR(betterRegimeSavings)}</strong> compared to the other option!</span>
            ) : (
              <span>Good news! Both tax systems cost you the same amount - so you can pick whichever you prefer.</span>
            )}
          </p>
        </div>
      </motion.div>

      {/* Sync / Loading Indicator */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="tax-sync-loader"
          >
            <div className="spinner-loader" />
            Calculating your taxes...
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Mode Indicator */}
      <AnimatePresence>
        {apiError && !isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="tax-offline-notice"
          >
            <Info size={14} />
            <span>Using high-fidelity local tax calculator.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebration Banner for Zero Tax */}
      <AnimatePresence>
        {totalTax === 0 && (
          <motion.div 
            className="tax-zero-banner"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <CheckCircle2 size={28} className="tax-zero-icon-green" />
            <div>
              <div style={{ fontWeight: 800 }}>You Pay Zero Tax</div>
              <div style={{ fontSize: '0.85rem', color: '#a7f3d0', marginTop: 2 }}>
                Your income is below the tax-free limit. You do not need to pay any income tax under the {regime === 'new' ? 'New' : 'Old'} Regime.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inputs Section */}
      <motion.div 
        className="tax-controls"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Gross Income Slider Card */}
        <div className="tax-control-card">
          <div className="tax-control-card-header">
            <div className="tax-control-card-icon tax-control-card-icon--blue">
              <Wallet size={20} />
            </div>
            <label>Your Yearly Income (before tax)</label>
          </div>
          
          <input 
            type="range" 
            aria-label="Yearly gross income before tax"
            min="300000" 
            max="12000000" 
            step="50000" 
            value={annualIncome}
            onChange={(e) => setAnnualIncome(Number(e.target.value))}
            className="tax-slider"
            style={{ 
              '--val': `${((annualIncome - 300000) / (12000000 - 300000)) * 100}%` 
            }}
          />

          <div className="tax-income-display">{formatINR(annualIncome)}</div>
          <div className="tax-income-sub">
            <span>Monthly Salary: {formatINR(Math.round(annualIncome / 12))}</span>
            <span className="tax-income-badge">Tax Year 2025-26 (Latest Rules)</span>
          </div>
        </div>

        {/* Regime Switcher Card */}
        <div className="tax-control-card">
          <div className="tax-control-card-header">
            <div className="tax-control-card-icon tax-control-card-icon--purple">
              <Calculator size={20} />
            </div>
            <label>Choose Your Tax System</label>
          </div>
          <div className="tax-regime-toggle">
            <button 
              className={`regime-btn ${regime === 'old' ? 'regime-btn--active' : ''}`} 
              onClick={() => setRegime('old')}
            >
              Old Regime
            </button>
            <button 
              className={`regime-btn ${regime === 'new' ? 'regime-btn--active' : ''}`} 
              onClick={() => setRegime('new')}
            >
              New Regime
            </button>
          </div>
          {betterRegime !== 'Either' ? (
            <div className="tax-better-badge">
              <CheckCircle2 size={14} style={{ marginRight: 6, flexShrink: 0 }} />
              <span><strong>Tip:</strong> The {betterRegime} Regime saves you <strong>{formatINR(betterRegimeSavings)}</strong></span>
            </div>
          ) : (
            <div className="tax-better-badge tax-better-badge--info">
              <Info size={14} style={{ marginRight: 6, flexShrink: 0 }} />
              <span>Both systems charge the same tax. You can pick either one.</span>
            </div>
          )}
        </div>

        {/* Tax-Saving Deductions Panel (Old Regime Only) */}
        <AnimatePresence>
          {regime === 'old' && (
            <motion.div 
              className="tax-deductions-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {/* 80C Deduction */}
              <div className="tax-control-card tax-control-card--small">
                <label className="tax-input-label" htmlFor="tax-80c-input">
                  <JargonTooltip term="Section 80C">Tax-Saving Investments (80C)</JargonTooltip>
                </label>
                <div className="tax-input-subtext">
                  PPF, ELSS, Life Insurance, Tax-saver FD, etc.
                </div>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input 
                    id="tax-80c-input"
                    aria-label="Tax-Saving Investments Section 80C"
                    type="number" 
                    value={existing80C} 
                    onChange={e => setExisting80C(e.target.value === '' ? '' : Math.min(SECTION_80C_LIMIT, Number(e.target.value)))} 
                    max={SECTION_80C_LIMIT} 
                    className="tax-input" 
                    placeholder="0"
                  />
                </div>
                <div className="tax-input-hint">Limit: {formatINR(SECTION_80C_LIMIT)} per year</div>
              </div>

              {/* NPS 80CCD */}
              <div className="tax-control-card tax-control-card--small">
                <label className="tax-input-label" htmlFor="tax-nps-input">
                  <JargonTooltip term="NPS">Pension (NPS) Savings</JargonTooltip>
                </label>
                <div className="tax-input-subtext">
                  Extra ₹50K deduction for NPS contributions
                </div>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input 
                    id="tax-nps-input"
                    aria-label="Pension NPS Savings Section 80CCD 1B"
                    type="number" 
                    value={existing80CCD} 
                    onChange={e => setExisting80CCD(e.target.value === '' ? '' : Math.min(SECTION_80CCD_1B_LIMIT, Number(e.target.value)))} 
                    max={SECTION_80CCD_1B_LIMIT} 
                    className="tax-input" 
                    placeholder="0"
                  />
                </div>
                <div className="tax-input-hint">Limit: {formatINR(SECTION_80CCD_1B_LIMIT)} per year</div>
              </div>

              {/* HRA Exemption */}
              <div className="tax-control-card tax-control-card--small">
                <label className="tax-input-label" htmlFor="tax-hra-input">
                  Rent Allowance (HRA)
                </label>
                <div className="tax-input-subtext">
                  Tax-free portion of your rent allowance from salary
                </div>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input 
                    id="tax-hra-input"
                    aria-label="House Rent Allowance HRA Exemption"
                    type="number" 
                    value={existingHRA} 
                    onChange={e => setExistingHRA(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="tax-input" 
                    placeholder="0"
                  />
                </div>
                <div className="tax-input-hint">Enter the HRA exemption amount from your salary slip</div>
              </div>

              {/* Home Loan Interest (Sec 24b) */}
              <div className="tax-control-card tax-control-card--small">
                <label className="tax-input-label" htmlFor="tax-homeloan-input">
                  Home Loan Interest
                </label>
                <div className="tax-input-subtext" style={{ minHeight: '34px' }}>
                  Interest portion of EMI
                </div>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input 
                    id="tax-homeloan-input"
                    aria-label="Home Loan Interest Section 24b"
                    type="number" 
                    value={existingHomeLoan} 
                    onChange={e => setExistingHomeLoan(e.target.value === '' ? '' : Math.min(200000, Number(e.target.value)))} 
                    max={200000} 
                    className="tax-input" 
                    placeholder="0"
                  />
                </div>
                <div className="tax-input-hint">Yearly interest limit: {formatINR(200000)}</div>
              </div>

              {/* Medical Insurance 80D - Self/Family */}
              <div className="tax-control-card tax-control-card--small">
                <label className="tax-input-label" htmlFor="tax-80d-self-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Heart size={13} /> Medical Insurance
                </label>
                <div className="tax-input-subtext" style={{ minHeight: '34px' }}>
                  Self, spouse, and children (Sec 80D)
                </div>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input
                    id="tax-80d-self-input"
                    aria-label="Medical Insurance Self and Family Section 80D"
                    type="number"
                    value={existing80DSelf}
                    onChange={e => setExisting80DSelf(e.target.value === '' ? '' : Math.min(self80DLimit, Number(e.target.value)))}
                    max={self80DLimit}
                    className="tax-input"
                    placeholder="0"
                  />
                </div>
                <div className="tax-input-hint">Limit: {formatINR(self80DLimit)} per year</div>
              </div>

              {/* Medical Insurance 80D - Parents */}
              <div className="tax-control-card tax-control-card--small">
                <label className="tax-input-label" htmlFor="tax-80d-parents-input" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Heart size={13} /> Parent Insurance
                </label>
                <button
                  type="button"
                  onClick={() => setParentsSenior(prev => !prev)}
                  className={`tax-toggle-senior-btn ${parentsSenior ? 'tax-toggle-senior-btn--active' : 'tax-toggle-senior-btn--inactive'}`}
                  aria-label="Toggle senior citizen parents for tax deduction limits"
                >
                  {parentsSenior ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  Senior citizen parents
                </button>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input
                    id="tax-80d-parents-input"
                    aria-label="Medical Insurance Parents Section 80D"
                    type="number"
                    value={existing80DParents}
                    onChange={e => setExisting80DParents(e.target.value === '' ? '' : Math.min(parents80DLimit, Number(e.target.value)))}
                    max={parents80DLimit}
                    className="tax-input"
                    placeholder="0"
                  />
                </div>
                <div className="tax-input-hint">Limit: {formatINR(parents80DLimit)} per year</div>
              </div>

              {/* Other Deductions */}
              <div className="tax-control-card tax-control-card--small" style={{ gridColumn: 'span 3' }}>
                <label className="tax-input-label" htmlFor="tax-other-input">
                  Other Deductions
                </label>
                <div className="tax-input-subtext">
                  LTA, education loan interest, donations, and other eligible deductions.
                </div>
                <div className="tax-input-wrapper">
                  <span className="tax-input-prefix">₹</span>
                  <input 
                    id="tax-other-input"
                    aria-label="Other eligible tax deductions"
                    type="number" 
                    value={existingOther} 
                    onChange={e => setExistingOther(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="tax-input" 
                    placeholder="0"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Tax Summary KPIs Grid */}
      <motion.div 
        className="tax-summary-grid"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="tax-summary-card">
          <div className="tax-sum-icon"><Wallet size={20} /></div>
          <span className="tax-sum-label">Taxable Income (Salary after deductions)</span>
          <span className="tax-sum-value">{formatINR(taxableIncome)}</span>
        </div>
        <div className="tax-summary-card">
          <div className="tax-sum-icon"><Receipt size={20} /></div>
          <span className="tax-sum-label">Total Income Tax</span>
          <span className="tax-sum-value">{formatINR(totalTax)}</span>
        </div>
        <div className="tax-summary-card">
          <div className="tax-sum-icon"><Percent size={20} /></div>
          <span className="tax-sum-label">Average Tax Rate</span>
          <span className="tax-sum-value">{effectiveRate}%</span>
        </div>
        <div className="tax-summary-card">
          <div className="tax-sum-icon"><PiggyBank size={20} /></div>
          <span className="tax-sum-label">Potential Tax Savings</span>
          <span className="tax-sum-value">{formatINR(potentialSaving)}</span>
        </div>
      </motion.div>

      {/* Crossover Threshold Breakpoint Advisories */}
      {crossoverBreakpoint !== null && crossoverBreakpoint > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="tax-crossover-banner"
        >
          <div className="tax-crossover-icon-wrapper">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="tax-crossover-title">When Should You Switch Regimes?</h2>
            <p className="tax-crossover-text">
              With your income of <strong>{formatINR(annualIncome)}</strong>, you need to invest at least <strong>{formatINR(crossoverBreakpoint)}</strong> in tax-saving options (like PF, home loan, or medical insurance) to make the Old Regime cheaper than the New Regime.
              {currentDeductions >= crossoverBreakpoint ? (
                <span> You have already declared <strong>{formatINR(currentDeductions)}</strong> in savings - which means the <strong>Old Regime is the cheaper option for you!</strong></span>
              ) : (
                <span> Currently, you have declared <strong>{formatINR(currentDeductions)}</strong> in savings. If you invest an extra <strong>{formatINR(crossoverBreakpoint - currentDeductions)}</strong> in tax-saving options, the <strong>Old Regime will become cheaper and save you money!</strong> Otherwise, the New Regime is better.</span>
              )}
            </p>
          </div>
        </motion.div>
      )}

      {/* Toggle Slab Details */}
      <div className="tax-toggle-breakdown-wrapper">
        <button
          onClick={() => setShowSlabBreakdown(!showSlabBreakdown)}
          className="tax-toggle-breakdown-btn"
        >
          {showSlabBreakdown ? 'Hide Detailed Breakdown' : 'Show Detailed Tax Breakdown & Charts'}
        </button>
      </div>

      {showSlabBreakdown && (
        <>
          {/* Slab Breakdown Details */}
          <div className="tax-slabs-grid">
            {/* Slabs table */}
            <div className="tax-slabs-container">
              <h2 className="tax-slabs-header">
                <Layers size={18} color="#38bdf8" />
                How Your Tax is Calculated ({regime === 'new' ? 'New' : 'Old'} Regime)
              </h2>
              <p className="tax-slabs-subtext">
                Your salary is split into ranges. Each range has a different tax rate. Only the income that falls in each range is taxed at that rate.
              </p>
              <table className="tax-slabs-table">
                <thead>
                  <tr>
                    <th>Income Range</th>
                    <th>Tax %</th>
                    <th>Your Income Here</th>
                    <th style={{ textAlign: 'right' }}>Tax You Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSlabs.map((s, idx) => {
                    const isRebate = s.isRebateRow;
                    const isTotal = s.isTotalRow;

                    if (isTotal) {
                      return (
                        <tr key={idx} className={`tax-slabs-row tax-slabs-row--total ${s.taxInSlab === 0 ? 'tax-slabs-row--total-zero' : 'tax-slabs-row--total-taxed'}`}>
                          <td colSpan={3}>
                            {s.taxInSlab === 0 ? 'Your Total Tax = ZERO' : 'Your Total Tax'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {s.taxInSlab === 0 ? '₹0' : formatINR(s.taxInSlab)}
                          </td>
                        </tr>
                      );
                    }

                    if (isRebate) {
                      return (
                        <tr key={idx} className="tax-slabs-row tax-slabs-row--rebate">
                          <td colSpan={2}>{s.label}</td>
                          <td style={{ fontSize: '0.78rem' }}>
                            Government waives your tax
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            - {formatINR(Math.abs(s.taxInSlab))}
                          </td>
                        </tr>
                      );
                    }

                    // Regular slab row
                    return (
                      <tr key={idx} className={`tax-slabs-row ${s.taxableInSlab > 0 ? 'tax-slabs-row--active' : ''}`}>
                        <td style={{ fontWeight: 600 }}>
                          {s.label}
                          {s.rate === 0 && <span className="tax-slab-free-label">Tax free!</span>}
                        </td>
                        <td style={{ color: s.rate === 0 ? '#34d399' : '#cbd5e1' }}>
                          {s.rate === 0 ? 'FREE' : `${s.rate}%`}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatINR(s.taxableInSlab)}
                        </td>
                        <td style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: s.taxInSlab > 0 ? '#f59e0b' : '#34d399'
                        }}>
                          {s.taxInSlab > 0 ? formatINR(s.taxInSlab) : '₹0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Beginner-friendly rebate explanation */}
              {activeSlabs.some(s => s.isRebateRow) && (
                <div className="tax-rebate-explainer">
                  <strong style={{ color: '#34d399' }}>What does this mean?</strong><br/>
                  The government gives a <strong>tax rebate</strong> (a full discount) to people earning up to {regime === 'new' ? '₹12 Lakh' : '₹5 Lakh'} in taxable income.
                  Even though your income falls into taxable ranges, the government waives all the tax — so <strong>you pay ₹0 in tax!</strong>
                </div>
              )}
            </div>

            {/* Smart Insights Panel */}
            <div className="tax-insights-panel">
              <h2 className="tax-insights-header">
                <Sparkles size={18} color="#fbbf24" />
                Helpful Insights
              </h2>
              <div className="tax-insight-items">
                <div className="tax-insight-item">
                  <div className="tax-insight-icon tax-insight-icon-blue"><IndianRupee size={16} /></div>
                  <div>
                    <div className="tax-insight-title">Monthly Tax from Salary</div>
                    <div className="tax-insight-desc">
                      About {formatINR(Math.round(totalTax / 12))}/month will be deducted from your salary as <JargonTooltip term="TDS">TDS</JargonTooltip>.
                    </div>
                  </div>
                </div>

                <div className="tax-insight-item">
                  <div className="tax-insight-icon tax-insight-icon-purple"><TrendingDown size={16} /></div>
                  <div>
                    <div className="tax-insight-title">What You Take Home</div>
                    <div className="tax-insight-desc">
                      About {formatINR(Math.round((annualIncome - totalTax) / 12))}/month in your bank account after tax.
                    </div>
                  </div>
                </div>

                <div className="tax-insight-item">
                  <div className="tax-insight-icon tax-insight-icon-green"><Info size={16} /></div>
                  <div>
                    <div className="tax-insight-title">Extra Charges on Tax</div>
                    <div className="tax-insight-desc">
                      {serverTaxData?.new_regime.marginal_relief_applied || serverTaxData?.old_regime.marginal_relief_applied 
                        ? `Marginal relief has been dynamically applied by server: ${formatINR(serverTaxData?.new_regime.marginal_relief_applied ? serverTaxData.new_regime.marginal_relief_amount : serverTaxData.old_regime.marginal_relief_amount)} saved.`
                        : "A small 4% extra charge (called 'cess') is added on top of your tax - it funds healthcare and education."}
                    </div>
                  </div>
                </div>

                <div className="tax-insight-item">
                  <div className="tax-insight-icon tax-insight-icon-yellow"><HelpCircle size={16} /></div>
                  <div>
                    <div className="tax-insight-title">Automatic Tax-Free Amount</div>
                    <div className="tax-insight-desc">
                      The government automatically exempts <strong>{formatINR(standardDeduction)}</strong> of your income from tax - no paperwork needed!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Layout: Chart + Recommendations */}
          <div className="tax-two-col">
            {/* Old vs New Regime Comparison Chart */}
            <motion.div 
              className="tax-chart-wrapper"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2>Old vs New Regime - Which Costs Less?</h2>
              <div className="tax-bar-chart-container tax-bar-chart-glow">
                <ResponsiveContainer>
                  <BarChart data={regimeChartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorOld" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#ea580c" stopOpacity={0.8}/>
                      </linearGradient>
                      <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#0369a1" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 13 }} axisLine={false} />
                    <YAxis tickFormatter={(v) => formatINR(v)} stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                    <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(14, 165, 233, 0.4)', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
                    <Bar dataKey="value" name="Tax Payable" radius={[10, 10, 0, 0]} barSize={80}>
                      {regimeChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Slabs optimization chart (only Old regime) */}
            <div className="tax-chart-wrapper">
              <h2>Before vs After Tax-Saving Investments</h2>
              {totalTax > 0 && regime === 'old' && potentialSaving > 0 ? (
                <div className="tax-bar-chart-container tax-bar-chart-glow">
                  <ResponsiveContainer>
                    <BarChart data={optimizationChartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                      <defs>
                        <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.8}/>
                        </linearGradient>
                        <linearGradient id="colorOpt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#15803d" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} axisLine={false} />
                      <YAxis tickFormatter={(v) => formatINR(v)} stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} />
                      <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(14, 165, 233, 0.4)', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
                      <Bar dataKey="value" name="Tax Payable" radius={[10, 10, 0, 0]} barSize={80}>
                        {optimizationChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="tax-chart-placeholder">
                  <div className="tax-chart-placeholder-content">
                    <Info size={36} color="#475569" />
                    Tax-saving deductions only apply in the Old Regime. In the New Regime, you get lower tax rates instead - no need to make special investments.
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Slabs Limits Progress (Only for Old Regime) */}
      {regime === 'old' && (
        <div className="tax-limits-row">
          <div className="tax-limit-card">
            <div className="tax-limit-header"><JargonTooltip term="Section 80C">Tax-Saving Investments (80C)</JargonTooltip> - How Much You've Used</div>
            <div className="tax-limit-bar-track">
              <div className="tax-limit-bar-fill" style={{ width: `${((SECTION_80C_LIMIT - remaining80C) / SECTION_80C_LIMIT) * 100}%` }} />
            </div>
            <div className="tax-limit-info">
              Deductions Claimed: {formatINR(SECTION_80C_LIMIT - remaining80C)} / {formatINR(SECTION_80C_LIMIT)}
              <span>Remaining: {formatINR(remaining80C)}</span>
            </div>
          </div>
          <div className="tax-limit-card">
            <div className="tax-limit-header"><JargonTooltip term="Section 80CCD(1B)">Pension (NPS) Deduction</JargonTooltip> - How Much You've Used</div>
            <div className="tax-limit-bar-track">
              <div className="tax-limit-bar-fill tax-limit-bar-fill--purple" style={{ width: `${((SECTION_80CCD_1B_LIMIT - remaining80CCD) / SECTION_80CCD_1B_LIMIT) * 100}%` }} />
            </div>
            <div className="tax-limit-info">
              Deductions Claimed: {formatINR(SECTION_80CCD_1B_LIMIT - remaining80CCD)} / {formatINR(SECTION_80CCD_1B_LIMIT)}
              <span>Remaining: {formatINR(remaining80CCD)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tax-saving Instruments Suggestions */}
      {regime === 'old' && taxSavingRecs.length > 0 && (
        <motion.div 
          className="tax-recs-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          style={{ marginTop: 32 }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PiggyBank size={22} color="#34d399" />
            Smart Ways to Save on Taxes
          </h2>
          <div className="tax-recs-grid">
            {taxSavingRecs.map((rec, i) => {
              const getInstrumentIcon = (name) => {
                const n = name.toLowerCase();
                if (n.includes('bond')) return <Landmark size={18} />;
                if (n.includes('provident') || n.includes('epf') || n.includes('vpf')) return <PiggyBank size={18} />;
                if (n.includes('insurance') || n.includes('ulip') || n.includes('linked') || n.includes('endowment')) return <Heart size={18} />;
                if (n.includes('elss') || n.includes('saver') || n.includes('mutual')) return <Coins size={18} />;
                if (n.includes('pension') || n.includes('nps')) return <ShieldCheck size={18} />;
                return <Wallet size={18} />;
              };

              return (
                <motion.div 
                  key={rec.id + rec.section} 
                  className="tax-rec-card"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + (i * 0.05) }}
                  whileHover={{ y: -6, scale: 1.01 }}
                  onClick={() => onLearnMore && onLearnMore(rec)}
                  style={{ cursor: onLearnMore ? 'pointer' : 'default' }}
                >
                  <div className="tax-rec-card-glow" />
                  <div className="tax-rec-card-header">
                    <div className="tax-rec-icon-wrapper">
                      {getInstrumentIcon(rec.name)}
                    </div>
                    <span className="tax-rec-badge">
                      Section {rec.section}
                    </span>
                  </div>
                  
                  <h3 className="tax-rec-name">{rec.name}</h3>
                  
                  <div className="tax-rec-stats">
                    <div className="tax-rec-stat">
                      <span className="tax-rec-stat-label">Investment Limit</span>
                      <span className="tax-rec-stat-value">{formatINR(rec.suggestedAmount)}</span>
                    </div>
                    <div className="tax-rec-stat">
                      <span className="tax-rec-stat-label">Expected Return</span>
                      <span className="tax-rec-stat-value text-green">
                        {Number(rec.expected_return_min).toFixed(0)}% - {Number(rec.expected_return_max).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="tax-rec-footer">
                    <span className="tax-rec-explore-btn">
                      Explore Details <ArrowUpRight size={14} style={{ transition: 'transform 0.2s ease' }} />
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default TaxScreen;
