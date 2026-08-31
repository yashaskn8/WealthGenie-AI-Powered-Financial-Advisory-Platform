import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Banknote, Wallet, Scale, Target, Telescope, Save, Pencil, X, Check, Users, CreditCard, ShieldCheck, PiggyBank } from 'lucide-react';
import * as api from './services/api';

const GOALS_OPTIONS = ['Retirement', 'Wealth Growth', 'Tax Saving', 'Emergency Fund'];


const DEFAULT_PROFILE = {
  age: 32,
  monthly_income: 65000,
  monthly_savings: 12000,
  investment_goals: ['Retirement', 'Wealth Growth'],
  investment_horizon: 15,
  taxRegime: 'new',
  liquid_savings: 0,
  existing_debt: 0,
  dependents: 0,
  emergency_fund_months: 0,
  risk_tolerance: 'Moderate',
  goal_type: 'wealth-building',
  section80C: 0,
  section80CCD1B: 0,
  section80D_self: 0,
  section80D_parents: 0,
  parentsSenior: false,
  hra: 0,
  homeLoanInterest: 0,
  section80EEA: 0,
  incomeSource: 'salary',
};

const ProfileEditor = ({ userProfile, onProfileUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Editable draft state with comprehensive safety fallbacks
  const safeProfile = React.useMemo(() => ({
    ...DEFAULT_PROFILE,
    ...(userProfile || {}),
    investment_goals: Array.isArray(userProfile?.investment_goals) ? userProfile.investment_goals : DEFAULT_PROFILE.investment_goals
  }), [userProfile]);

  const [draft, setDraft] = useState(safeProfile);

  React.useEffect(() => {
    setDraft(safeProfile);
  }, [safeProfile]);

  const getTaxRegimeRecommendation = (monthlyIncome) => {
    const annualIncome = Number(monthlyIncome) * 12;
    if (!annualIncome) return '';
    if (annualIncome <= 775000) {
      return '💡 Recommended: New Regime (You pay ₹0 tax under New Regime for this income bracket)';
    }
    return '💡 Recommended: New Regime (Usually saves more tax unless you have >₹2.5L in HRA, home loan, or 80C exemptions)';
  };

  const getHorizonRecommendation = (age, goals) => {
    const numAge = Number(age);
    if (!numAge) return '';
    if (goals && goals.includes('Retirement')) {
      const suggested = Math.max(5, 60 - numAge);
      return `💡 Suggested for Retirement: ${suggested} years (target age 60)`;
    }
    if (goals && goals.includes('Emergency Fund')) {
      return '💡 Suggested for Emergency Fund: 1–3 years (prioritize quick access)';
    }
    if (goals && goals.includes('Tax Saving')) {
      return '💡 Suggested for Tax Saving: 3–5 years (minimum ELSS lock-in)';
    }
    return '';
  };

  const savingsRate = Number(draft.monthly_income) > 0
    ? ((Number(draft.monthly_savings) / Number(draft.monthly_income)) * 100).toFixed(0)
    : 0;

  const profileFields = [
    { key: 'age', label: 'Age', icon: <Clock size={20} color="#94a3b8" />, type: 'number', min: 18, max: 80, help: 'Helps determine investment ratios (100 minus age rule).' },
    { key: 'monthly_income', label: 'Monthly Income', icon: <Banknote size={20} color="#34d399" />, type: 'currency', min: 1000, max: 100000000, help: 'Helps us calculate tax slabs and budget health.' },
    { key: 'monthly_savings', label: 'Investable Amount (SIP)', icon: <Wallet size={20} color="#38bdf8" />, type: 'currency', min: 500, max: 100000000, help: 'How much money you plan to save and invest monthly.' },

    { key: 'risk_tolerance', label: 'Risk Tolerance', icon: <Scale size={20} color="#fbbf24" />, type: 'tolerance', help: 'Your comfort with short-term market ups and downs. This drives investment mix.' },
    { key: 'taxRegime', label: 'Tax Regime', icon: <Banknote size={20} color="#a78bfa" />, type: 'regime', help: 'Old vs New tax regimes used to estimate post-tax returns.' },
    { key: 'investment_goals', label: 'Investment Goals', icon: <Target size={20} color="#fb7185" />, type: 'goals', help: 'The main reasons why you are building wealth.' },
    { key: 'investment_horizon', label: 'Investment Horizon', icon: <Telescope size={20} color="#a78bfa" />, type: 'slider', min: 1, max: 30, suffix: ' years', help: 'Number of years you plan to keep this money growing.' },

    { key: 'liquid_savings', label: 'Liquid Savings', icon: <PiggyBank size={20} color="#34d399" />, type: 'currency', min: 0, max: 1000000000, help: 'Savings held in liquid accounts or bank balances.' },
    { key: 'existing_debt', label: 'Existing Debt (EMI % of Income)', icon: <CreditCard size={20} color="#f87171" />, type: 'number', min: 0, max: 100, suffix: '%', help: 'Monthly debt EMI commitments as a percentage of income.' },
    { key: 'dependents', label: 'Dependents', icon: <Users size={20} color="#fbbf24" />, type: 'number', min: 0, max: 20, help: 'Number of financial dependents (spouse, children, parents).' },
    { key: 'emergency_fund_months', label: 'Emergency Fund (Months)', icon: <ShieldCheck size={20} color="#38bdf8" />, type: 'number', min: 0, max: 60, suffix: ' months', help: 'Months of living expenses saved for emergencies.' },

    // Deduction fields (WG-DEDUCTIONS-COLLECTION)
    { key: 'section80C', label: 'Section 80C (ELSS/PPF/EPF)', icon: <Banknote size={20} color="#34d399" />, type: 'currency', min: 0, max: 150000, help: 'ELSS, PPF, EPF, Life Insurance deductions (Max ₹1,50,000).' },
    { key: 'section80CCD1B', label: 'Section 80CCD(1B) NPS', icon: <Banknote size={20} color="#38bdf8" />, type: 'currency', min: 0, max: 50000, help: 'NPS self-contribution deduction (Max ₹50,000).' },
    { key: 'section80D_self', label: 'Section 80D Health (Self)', icon: <ShieldCheck size={20} color="#fbbf24" />, type: 'currency', min: 0, max: 50000, help: 'Health insurance premium for self and family (Max ₹25k / ₹50k for seniors).' },
    { key: 'section80D_parents', label: 'Section 80D Health (Parents)', icon: <ShieldCheck size={20} color="#fb7185" />, type: 'currency', min: 0, max: 50000, help: 'Health insurance premium for parents (Max ₹25k / ₹50k for senior parents).' },
    { key: 'hra', label: 'HRA Exemption', icon: <Wallet size={20} color="#a78bfa" />, type: 'currency', min: 0, max: 10000000, help: 'Annual House Rent Allowance exemption amount.' },
    { key: 'homeLoanInterest', label: 'Home Loan Interest (Sec 24b)', icon: <CreditCard size={20} color="#f87171" />, type: 'currency', min: 0, max: 200000, help: 'Home loan interest deduction (Max ₹2,00,000).' },
    { key: 'section80EEA', label: 'Section 80EEA Interest', icon: <CreditCard size={20} color="#38bdf8" />, type: 'currency', min: 0, max: 150000, help: 'First-time home buyer additional interest deduction (Max ₹1,50,000).' },
  ];

  const handleEdit = () => {
    setDraft({ ...userProfile });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft({ ...userProfile });
    setIsEditing(false);
  };

  const handleSave = async () => {
    const numIncome = Number(draft.monthly_income);
    const numSavings = Number(draft.monthly_savings);
    const numAge = Number(draft.age);
    const numLiquid = Number(draft.liquid_savings || 0);
    const numDebt = Number(draft.existing_debt || 0);
    const numDeps = Number(draft.dependents || 0);
    const numEf = Number(draft.emergency_fund_months || 0);

    if (!numAge || numAge < 18 || numAge > 80) {
      alert('Age must be between 18 and 80.');
      return;
    }
    if (!numIncome || numIncome < 1000 || numIncome > 100000000) {
      alert('Monthly income must be between ₹1,00,000 and ₹10,00,00,000.');
      return;
    }
    if (!numSavings || numSavings < 500 || numSavings > 100000000) {
      alert('Monthly savings must be between ₹500 and ₹10,00,00,000.');
      return;
    }
    if (numSavings >= numIncome) {
      alert('Monthly savings must be less than monthly income.');
      return;
    }
    if (isNaN(numLiquid) || numLiquid < 0) {
      alert('Liquid savings must be at least 0.');
      return;
    }
    if (isNaN(numDebt) || numDebt < 0 || numDebt > 100) {
      alert('Debt EMI burden percentage must be between 0 and 100.');
      return;
    }
    if (isNaN(numDeps) || numDeps < 0) {
      alert('Dependents count must be at least 0.');
      return;
    }
    if (isNaN(numEf) || numEf < 0) {
      alert('Emergency fund months must be at least 0.');
      return;
    }

    setIsSaving(true);
    try {
      const profileId = userProfile?._id || userProfile?.profileId || draft.profileId || draft._id;
      let response;
      const payload = {
        monthly_income: numIncome,
        age: numAge,
        monthly_savings: numSavings,
        regime: draft.taxRegime || 'new',
        investment_horizon: draft.investment_horizon || 15,
        liquid_savings: numLiquid,
        existing_debt: numDebt,
        dependents: numDeps,
        emergency_fund_months: numEf,
        risk_tolerance: draft.risk_tolerance || 'Moderate',
        goal_type: draft.goal_type || 'wealth-building',
        total_ctc: draft.total_ctc || (numIncome * 12),
        basic_component: draft.basic_component || ((draft.total_ctc || (numIncome * 12)) * 0.5),
        monthly_take_home: draft.monthly_take_home || numIncome,
        soldPropertyAmount: draft.sold_property_amount || draft.soldPropertyAmount || 0,
        sold_property_amount: draft.sold_property_amount || draft.soldPropertyAmount || 0,
        hasLumpSum: Boolean(draft.has_lump_sum || draft.hasLumpSum),
        has_lump_sum: Boolean(draft.has_lump_sum || draft.hasLumpSum),
        lumpSumAmount: (draft.has_lump_sum || draft.hasLumpSum) ? (draft.lump_sum_amount || draft.lumpSumAmount || 0) : 0,
        lump_sum_amount: (draft.has_lump_sum || draft.hasLumpSum) ? (draft.lump_sum_amount || draft.lumpSumAmount || 0) : 0,
        // Deduction fields (WG-DEDUCTIONS-COLLECTION)
        section80C: Number(draft.section80C !== undefined ? draft.section80C : (draft.section_80c || 0)),
        section_80c: Number(draft.section80C !== undefined ? draft.section80C : (draft.section_80c || 0)),
        section80CCD1B: Number(draft.section80CCD1B !== undefined ? draft.section80CCD1B : (draft.section_80ccd1b || draft.nps80CCD1B || 0)),
        section_80ccd1b: Number(draft.section80CCD1B !== undefined ? draft.section80CCD1B : (draft.section_80ccd1b || draft.nps80CCD1B || 0)),
        section80D_self: Number(draft.section80D_self !== undefined ? draft.section80D_self : (draft.section_80d_self || 0)),
        section_80d_self: Number(draft.section80D_self !== undefined ? draft.section80D_self : (draft.section_80d_self || 0)),
        section80D_parents: Number(draft.section80D_parents !== undefined ? draft.section80D_parents : (draft.section_80d_parents || 0)),
        section_80d_parents: Number(draft.section80D_parents !== undefined ? draft.section80D_parents : (draft.section_80d_parents || 0)),
        parentsSenior: Boolean(draft.parentsSenior !== undefined ? draft.parentsSenior : draft.parents_senior),
        parents_senior: Boolean(draft.parentsSenior !== undefined ? draft.parentsSenior : draft.parents_senior),
        hra: Number(draft.hra || 0),
        homeLoanInterest: Number(draft.homeLoanInterest !== undefined ? draft.homeLoanInterest : (draft.home_loan_interest || 0)),
        home_loan_interest: Number(draft.homeLoanInterest !== undefined ? draft.homeLoanInterest : (draft.home_loan_interest || 0)),
        section80EEA: Number(draft.section80EEA !== undefined ? draft.section80EEA : (draft.section_80eea || 0)),
        section_80eea: Number(draft.section80EEA !== undefined ? draft.section80EEA : (draft.section_80eea || 0)),
        incomeSource: draft.incomeSource || draft.income_source || 'salary',
        income_source: draft.incomeSource || draft.income_source || 'salary',
        version: draft.version || 1,
      };

      if (profileId) {
        response = await api.updateProfile(profileId, payload);
      } else {
        response = await api.buildProfile(payload);
      }
      onProfileUpdate({ ...draft, ...(response || {}), profileId: response?.profileId || profileId || null, version: response?.version || (draft.version || 1) + 1 });
      setIsEditing(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2500);
    } catch (err) {
      alert("Error updating profile: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleGoal = (goal) => {
    setDraft(prev => {
      const currentGoals = Array.isArray(prev?.investment_goals) ? prev.investment_goals : [];
      return {
        ...prev,
        investment_goals: currentGoals.includes(goal)
          ? currentGoals.filter(g => g !== goal)
          : [...currentGoals, goal]
      };
    });
  };

  const renderValue = (field) => {
    const val = draft[field.key];
    if (field.type === 'currency') return `₹${Number(val || 0).toLocaleString('en-IN')}`;
    if (field.type === 'goals') return Array.isArray(val) ? val.join(', ') : (val || '');
    if (field.type === 'slider') return `${val || field.min || 0}${field.suffix || ''}`;
    return val || '';
  };

  const renderEditField = (field) => {
    const val = draft[field.key];

    if (field.type === 'number' || field.type === 'currency') {
      return (
        <input
          data-testid={`profile-input-${field.key}`}
          type="number"
          value={val === 0 || val === '0' ? '' : val}
          min={field.min}
          max={field.max}
          onChange={e => {
            let raw = e.target.value.replace(/^0+/, '');
            let num = raw === '' ? '' : Number(raw);
            // Clamp to max if defined
            if (field.max !== undefined && num !== '' && num > field.max) num = field.max;
            setDraft(prev => ({ ...prev, [field.key]: num }));
          }}
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#f8fafc',
            fontSize: '1.05rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => e.target.style.borderColor = '#38bdf8'}
          onBlur={e => e.target.style.borderColor = 'rgba(56, 189, 248, 0.3)'}
        />
      );
    }




    if (field.type === 'tolerance') {
      const options = ['Conservative', 'Moderate', 'Aggressive'];
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          {options.map(o => (
            <button
              key={o}
              onClick={() => setDraft(prev => ({ ...prev, risk_tolerance: o }))}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 10,
                border: val === o ? '1.5px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                background: val === o ? 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(139,92,246,0.1))' : 'rgba(15,23,42,0.4)',
                color: val === o ? '#38bdf8' : '#94a3b8',
                fontWeight: val === o ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }


    if (field.type === 'regime') {
      const regimes = ['old', 'new'];
      const currentRegime = val || 'new';
      const recText = getTaxRegimeRecommendation(draft.monthly_income);
      return (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {regimes.map(r => (
              <button
                key={r}
                onClick={() => setDraft(prev => ({ ...prev, taxRegime: r }))}
                style={{
                  flex: 1,
                  padding: '9px 14px',
                  borderRadius: 10,
                  border: currentRegime === r ? '1.5px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
                  background: currentRegime === r ? 'rgba(167,139,250,0.15)' : 'rgba(15,23,42,0.4)',
                  color: currentRegime === r ? '#a78bfa' : '#94a3b8',
                  fontWeight: currentRegime === r ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s',
                }}
              >
                {r} Regime
              </button>
            ))}
          </div>
          {recText && (
            <div style={{
              background: 'rgba(167, 139, 250, 0.12)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#c084fc',
              fontSize: '0.75rem',
              fontWeight: 500,
              lineHeight: 1.3,
            }}>
              {recText}
            </div>
          )}
        </div>
      );
    }


    if (field.type === 'goals') {
      const goalsArray = Array.isArray(val) ? val : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GOALS_OPTIONS.map(g => {
            const active = goalsArray.includes(g);
            return (
              <button
                key={g}
                onClick={() => toggleGoal(g)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 10,
                  border: active ? '1.5px solid #fb7185' : '1px solid rgba(255,255,255,0.08)',
                  background: active ? 'rgba(251,113,133,0.12)' : 'rgba(15,23,42,0.4)',
                  color: active ? '#fb7185' : '#94a3b8',
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                {active && <Check size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                {g}
              </button>
            );
          })}
        </div>
      );
    }

    if (field.type === 'slider') {
      const pct = ((val - field.min) / (field.max - field.min)) * 100;
      const unitLabel = field.suffix ? (val === 1 ? field.suffix.replace(/s$/, '') : field.suffix) : '';
      const recText = getHorizonRecommendation(draft.age, draft.investment_goals);
      return (
        <div>
          <input
            type="range"
            min={field.min}
            max={field.max}
            value={val}
            onChange={e => setDraft(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
            style={{
              width: '100%',
              accentColor: '#38bdf8',
              background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
              borderRadius: 6,
              height: 6,
              cursor: 'pointer',
            }}
            className="tax-slider"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: 6, marginBottom: recText ? 8 : 0 }}>
            <span>{field.min}</span>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>{val}{unitLabel}</span>
            <span>{field.max}</span>
          </div>
          {recText && (
            <div style={{
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#38bdf8',
              fontSize: '0.75rem',
              fontWeight: 500,
              lineHeight: 1.3,
            }}>
              {recText}
            </div>
          )}
        </div>
      );
    }


    return <span style={{ color: '#f8fafc', fontWeight: 600 }}>{val}</span>;
  };

  const basicFields = profileFields.filter(f => ['age', 'monthly_income', 'monthly_savings', 'investment_goals'].includes(f.key));
  const advancedFields = profileFields.filter(f => ['risk_tolerance', 'taxRegime', 'investment_horizon'].includes(f.key));

  return (
    <div style={{ padding: '40px 28px', maxWidth: 960, margin: '0 auto', color: '#fff', position: 'relative' }}>
      <div className="profile-mesh-bg" />

      {/* Header */}
      <motion.div
        style={{ position: 'relative', zIndex: 2, marginBottom: 12 }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#38bdf8', marginBottom: 8, opacity: 0.9 }}>
          FINANCIAL COMMAND CENTER
        </div>
        <h1 className="page-title" style={{ fontSize: '2.4rem', marginBottom: 6 }}>
          My <span style={{
            background: 'linear-gradient(135deg, #38bdf8, #a78bfa)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>Profile</span>
        </h1>
        <p className="page-title-sub" style={{ marginBottom: 0, fontSize: '0.95rem' }}>
          Your personalized wealth parameters driving AI recommendations
        </p>
      </motion.div>

      {/* Summary Stats Bar */}
      <motion.div
        className="profile-summary-bar"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="profile-summary-item">
          <div className="summary-number" style={{ color: '#f43f5e' }}>₹{Number(draft.monthly_income * 12).toLocaleString('en-IN')}</div>
          <div className="summary-label">Annual Income</div>
        </div>
        <div className="profile-summary-item">
          <div className="summary-number" style={{ color: '#34d399' }}>{savingsRate}%</div>
          <div className="summary-label">Savings Rate</div>
        </div>
        <div className="profile-summary-item">
          <div className="summary-number" style={{ color: '#38bdf8' }}>₹{Number(draft.monthly_savings).toLocaleString('en-IN')}</div>
          <div className="summary-label">Monthly SIP Budget</div>
        </div>
        <div className="profile-summary-item">
          <div className="summary-number" style={{ color: '#a78bfa', textTransform: 'capitalize' }}>{draft.taxRegime || 'new'}</div>
          <div className="summary-label">Tax Regime</div>
        </div>
      </motion.div>

      {/* Saved toast */}
      <AnimatePresence>
        {showSaved && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'relative', zIndex: 10, marginBottom: 16,
              background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10,
              color: '#34d399', fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            <Check size={18} /> Profile updated successfully! Recommendations will recalculate.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Card */}
      <motion.div
        className="hud-profile-card"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 100 }}
        style={{ maxWidth: '100%' }}
      >
        <div className="profile-section-group">
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8', marginBottom: 14, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.9 }}>
            Basic Information
          </h3>
          <div className="hud-profile-grid" style={{ marginBottom: 28 }}>
            {basicFields.map((field, index) => (
              <motion.div
                key={field.key}
                className="hud-stat-box"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + (index * 0.06) }}
                style={isEditing ? { padding: '18px 20px' } : {}}
              >
                <div className="hud-stat-icon">{field.icon}</div>
                <div className="hud-stat-content" style={{ flex: 1, minWidth: 0 }}>
                  <span className="hud-stat-label">{field.label}</span>
                  {isEditing ? (
                    <>
                      {renderEditField(field)}
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, display: 'block', lineHeight: 1.3 }}>{field.help}</span>
                    </>
                  ) : (
                    <>
                      <span className="hud-stat-value">{renderValue(field)}</span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4, display: 'block', lineHeight: 1.3 }}>{field.help}</span>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="profile-section-group" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, marginTop: 12 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#a78bfa', marginBottom: 14, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.9 }}>
            Advanced Preferences
          </h3>
          <div className="hud-profile-grid">
            {advancedFields.map((field, index) => (
              <motion.div
                key={field.key}
                className="hud-stat-box"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + (index * 0.06) }}
                style={isEditing ? { padding: '18px 20px' } : {}}
              >
                <div className="hud-stat-icon">{field.icon}</div>
                <div className="hud-stat-content" style={{ flex: 1, minWidth: 0 }}>
                  <span className="hud-stat-label">{field.label}</span>
                  {isEditing ? (
                    <>
                      {renderEditField(field)}
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4, display: 'block', lineHeight: 1.3 }}>{field.help}</span>
                    </>
                  ) : (
                    <>
                      <span className="hud-stat-value">{renderValue(field)}</span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4, display: 'block', lineHeight: 1.3 }}>{field.help}</span>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <motion.div
          style={{ display: 'flex', gap: 12, marginTop: 8 }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
        >
          {isEditing ? (
            <>
              <button
                data-testid="profile-save"
                className="hud-profile-btn"
                onClick={handleSave}
                disabled={isSaving}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className="hud-profile-btn"
                onClick={handleCancel}
                style={{
                  flex: 0.5,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                <X size={16} /> Cancel
              </button>
            </>
          ) : (
            <button
              data-testid="profile-edit"
              className="hud-profile-btn"
              onClick={handleEdit}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Pencil size={16} /> Edit Profile
            </button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};


export default ProfileEditor;
