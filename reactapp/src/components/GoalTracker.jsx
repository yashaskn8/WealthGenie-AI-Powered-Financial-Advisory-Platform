import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Palmtree, Diamond, FileText, Shield, TrendingUp, AlertTriangle, CheckCircle, Clock, Zap, IndianRupee, ArrowRight, Lightbulb, Wallet, Save, Sparkles, RefreshCw, Layers, Trash2, Umbrella, Home, GraduationCap, Car } from 'lucide-react';
import { formatINR } from '../utils/indianNumberFormat';
import { calculateSIPFutureValue } from '../utils/sipCalculator';
import api from '../services/api';
import JargonTooltip from './JargonTooltip';
import './GoalTracker.css';
import { GOAL_TYPES, getGoalTypeByLabel, hexToRgb } from '../config/goalCatalog';
import { submitGoal } from '../utils/goalSubmission';

const ICON_MAP = {
  Umbrella,
  Home,
  GraduationCap,
  Shield,
  Car,
  Sparkles,
  TrendingUp,
  FileText,
  Palmtree,
  Diamond,
  Target,
};

/* ─── Smart defaults computed from actual profile & unified GOAL_TYPES catalog ─── */
function computeSmartDefaults(profile) {
  const income = Number(profile?.monthly_income) || 50000;
  const savings = Number(profile?.monthly_savings) || 10000;
  const age = Number(profile?.age) || 30;
  const horizon = Number(profile?.investment_horizon) || 15;
  const annualIncome = income * 12;
  const monthlyExpenses = income - savings;
  const retirementAge = 60;
  const yearsToRetire = Math.max(5, retirementAge - age);

  const quickStartGoals = GOAL_TYPES.filter(g => g.quickStartEligible);
  const defaults = {};

  quickStartGoals.forEach(g => {
    let target = 1000000;
    let yearsToGoal = horizon;
    let description = '';
    let tip = g.tip || '';

    if (g.id === 'retirement') {
      yearsToGoal = g.computeYearsToGoal ? g.computeYearsToGoal(age) : yearsToRetire;
      target = g.computeTarget ? g.computeTarget(monthlyExpenses) : 25 * annualIncome;
      description = `Build ${formatShort(target)} fund (roughly 25 times your annual expenses) by age ${retirementAge}`;
      tip = `Based on your ₹${monthlyExpenses.toLocaleString('en-IN')}/mo expenses, you need about 25 times your annual expenses saved for a comfortable retirement.`;
    } else if (g.id === 'wealth_growth') {
      yearsToGoal = g.computeYearsToGoal ? g.computeYearsToGoal(horizon) : Math.min(horizon, 10);
      target = g.computeTarget ? g.computeTarget(annualIncome) : annualIncome * 5;
      description = `Accumulate 5× annual income (₹${(annualIncome * 5 / 100000).toFixed(0)}L) in ${yearsToGoal} years`;
      tip = 'A common wealth milestone is 5× your annual income in liquid investments.';
    } else if (g.id === 'tax_saving') {
      yearsToGoal = g.defaultYearsToGoal || 1;
      target = g.computeTarget ? g.computeTarget() : 150000;
      description = <span>Save tax on up to ₹1.5 Lakhs under <JargonTooltip term="Section 80C">Section 80C</JargonTooltip></span>;
      tip = <span><JargonTooltip term="ELSS">ELSS</JargonTooltip> (tax-saving equity funds) has the shortest 3-year lock-in period compared to other options.</span>;
    } else if (g.id === 'emergency_fund') {
      yearsToGoal = g.defaultYearsToGoal || 1.5;
      target = g.computeTarget ? g.computeTarget(monthlyExpenses) : monthlyExpenses * 6;
      description = `Build a ₹${(monthlyExpenses * 6 / 100000).toFixed(1)}L safety net (6 months of expenses)`;
      tip = <span>Keep in <JargonTooltip term="Debt Fund">liquid mutual funds</JargonTooltip> or a savings account. Must be accessible within 24 hours.</span>;
    }

    defaults[g.label] = {
      target,
      currentSaved: 0,
      icon: ICON_MAP[g.Icon] || Target,
      themeColor: g.color,
      themeColorRGB: g.themeColorRGB || hexToRgb(g.color),
      returnRate: g.returnRate,
      yearsToGoal,
      description,
      tip,
      priority: g.defaultPriority || 'Medium',
    };
  });

  return defaults;
}

function formatShort(val) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val}`;
}

const PRIORITY_CONFIG = {
  Critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' },
  High:     { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.3)' },
  Medium:   { color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.3)' },
  Low:      { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)' },
};

const MAX_TARGET = 1000000000;
const MAX_SAVED = 500000000;

function clampValue(val, min = 0, max = MAX_TARGET) {
  if (val === '') return '';
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

/* ─── Goal Card ───────────────────────────────────────────────────── */
const GoalCard = ({ 
  goalName, 
  defaults, 
  goalObj, 
  onSaveUpdates, 
  onDeleteGoal,
  monthlyAllocation, 
  horizon, 
  returnRate, 
  index, 
  totalSavings 
}) => {
  // Use DB object values if available, otherwise local defaults (for computed sandbox)
  const isDbGoal = !!goalObj;
  const initialTarget = isDbGoal ? goalObj.target_amount : defaults.target;
  const initialSaved = isDbGoal ? goalObj.current_savings : defaults.currentSaved;

  const [target, setTarget] = useState(initialTarget);
  const [currentSaved, setCurrentSaved] = useState(initialSaved);
  const [isUpdating, setIsUpdating] = useState(false);

  // Re-sync with state changes
  useEffect(() => {
    setTarget(initialTarget);
    setCurrentSaved(initialSaved);
  }, [initialTarget, initialSaved]);

  const actualTarget = Number(target) || 0;
  const actualSaved = Number(currentSaved) || 0;
  const lumpSumGrowth = actualSaved > 0 ? actualSaved * Math.pow(1 + returnRate / 100, horizon) : 0;
  
  // Projected value calculation
  const projectedValue = isDbGoal && goalObj.monte_carlo_summary?.p50
    ? goalObj.monte_carlo_summary.p50
    : calculateSIPFutureValue(monthlyAllocation, returnRate, horizon) + lumpSumGrowth;

  // MC projections target the inflation-adjusted amount, so compare against that
  const comparisonTarget = isDbGoal && goalObj?.inflation_adjusted_target
    ? goalObj.inflation_adjusted_target
    : actualTarget;

  const progressPercent = Math.min((actualSaved / (actualTarget || 1)) * 100, 100);
  const projectedPercent = Math.min((projectedValue / (comparisonTarget || 1)) * 100, 100);

  const rawGap = comparisonTarget - projectedValue;
  // If projected covers 99% or more of target, or gap is negligible (< 500), consider goal fully funded
  const isFullyFunded = projectedValue >= comparisonTarget * 0.99 || rawGap <= 500;
  const gap = isFullyFunded ? 0 : rawGap;
  const gapPositive = !isFullyFunded && gap > 0;

  const completionPct = Math.min(Math.round((projectedValue / (comparisonTarget || 1)) * 100), 999);

  let status, statusClass, StatusIcon;
  if (isFullyFunded || completionPct >= 100) {
    status = 'On Track (Highly Likely)'; statusClass = 'status--ontrack'; StatusIcon = CheckCircle;
  } else if (isDbGoal) {
    if (goalObj.status === 'on_track') {
      status = 'On Track (Highly Likely)'; statusClass = 'status--ontrack'; StatusIcon = CheckCircle;
    } else if (goalObj.status === 'at_risk' || completionPct >= 70) {
      status = 'Slightly Behind (Needs Boost)'; statusClass = 'status--almost'; StatusIcon = TrendingUp;
    } else {
      status = 'Off Track (Action Required)'; statusClass = 'status--behind'; StatusIcon = AlertTriangle;
    }
  } else {
    if (completionPct >= 70) {
      status = 'Slightly Behind (Needs Boost)'; statusClass = 'status--almost'; StatusIcon = TrendingUp;
    } else {
      status = 'Off Track (Action Required)'; statusClass = 'status--behind'; StatusIcon = AlertTriangle;
    }
  }

  const IconComponent = defaults.icon || Target;
  const priority = isDbGoal ? goalObj.priority || 'Medium' : defaults.priority || 'Medium';

  const hasChanged = target !== initialTarget || currentSaved !== initialSaved;

  const handleCommitUpdates = async () => {
    if (!isDbGoal) return;
    setIsUpdating(true);
    try {
      await onSaveUpdates(goalObj._id || goalObj.goalId, {
        target_amount: actualTarget,
        current_savings: actualSaved,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.div
      className="goal-card-item premium-glass"
      style={{
        '--theme-color': defaults.themeColor || '#6366f1',
        '--theme-color-rgb': defaults.themeColorRGB || '99, 102, 241'
      }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + (index * 0.05), type: 'spring', stiffness: 100, damping: 20 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <div className="card-glow-bg"></div>

      {/* Header */}
      <div className="goal-card-header">
        <div className="goal-card-icon-wrapper" style={{ boxShadow: `0 0 20px rgba(${defaults.themeColorRGB || '99,102,241'}, 0.2)` }}>
          <IconComponent size={20} color={defaults.themeColor || '#6366f1'} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 className="goal-card-title">{goalName}</h3>
            <span className={`goal-priority-badge badge-glow-${priority === 'Critical' ? 'rose' : priority === 'High' ? 'amber' : priority === 'Medium' ? 'cyan' : 'emerald'}`} style={{
              fontSize: '0.65rem', padding: '2px 8px', borderRadius: 6, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.6px'
            }}>
              {priority}
            </span>
          </div>
          <p className="goal-card-desc">{isDbGoal && goalObj.recommended_instrument ? `Saving through ${goalObj.recommended_instrument.replace('_', ' ')}` : defaults.description}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
          <span className={`goal-status-badge ${statusClass}`} style={{ margin: 0 }}>
            <StatusIcon size={12} style={{ marginRight: 4 }} /> {status}
          </span>
          {isDbGoal && (
            <button
              onClick={() => onDeleteGoal(goalObj._id || goalObj.goalId)}
              className="goal-delete-btn"
              title="Delete Goal"
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f43f5e',
                cursor: 'pointer',
                transition: 'all 0.2s',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.2)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(244, 63, 94, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Inputs */}
      <div className="goal-inputs-row">
        <div className="goal-input-group">
          <div className="goal-input-label-row">
            <label><Target size={12} style={{marginRight:4, color:'#38bdf8'}} /> Goal Target</label>
            <span className="goal-input-hint-badge">{formatShort(actualTarget)}</span>
          </div>
          <div className="goal-input-wrapper">
            <span className="goal-input-prefix">₹</span>
            <input
              type="number"
              value={target}
              placeholder="0"
              min={1000}
              max={MAX_TARGET}
              disabled={!isDbGoal}
              onChange={e => setTarget(clampValue(e.target.value, 1000, MAX_TARGET))}
              className="goal-amount-input"
            />
          </div>
        </div>
        <div className="goal-input-group">
          <div className="goal-input-label-row">
            <label><Wallet size={12} style={{marginRight:4, color:'#10b981'}} /> Current Savings</label>
            <span className="goal-input-hint-badge">{formatShort(actualSaved)}</span>
          </div>
          <div className="goal-input-wrapper">
            <span className="goal-input-prefix">₹</span>
            <input
              type="number"
              value={currentSaved}
              placeholder="0"
              min={0}
              max={MAX_SAVED}
              disabled={!isDbGoal}
              onChange={e => setCurrentSaved(clampValue(e.target.value, 0, MAX_SAVED))}
              className="goal-amount-input"
            />
          </div>
        </div>
      </div>

      {/* Save Button for DB Goal changes */}
      {isDbGoal && hasChanged && (
        <motion.button
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleCommitUpdates}
          disabled={isUpdating}
          style={{
            background: 'linear-gradient(135deg, #0ea5e9, #10b981)', border: 'none',
            borderRadius: 10, padding: '8px 16px', color: '#fff', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.8rem', width: '100%', justifyContent: 'center', marginBottom: 20,
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
          }}
        >
          {isUpdating ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes & Update Projections
        </motion.button>
      )}

      {/* Visual Progress */}
      <div className="goal-progress-section">
        <div className="goal-progress-labels">
          <div className="progress-label-left">
            <span className="label-title">Saved So Far</span>
            <span className="label-value">{formatShort(actualSaved)}</span>
          </div>
          <div className="progress-label-right">
            <span className="label-title">Goal Target</span>
            <span className="label-value" style={{ color: defaults.themeColor || '#6366f1' }}>{formatShort(actualTarget)}</span>
          </div>
        </div>
        
        <div className="goal-progress-track">
          <div 
            className="goal-progress-fill goal-progress-fill--projected" 
            style={{ 
              width: `${Math.min(projectedPercent, 100)}%`,
              background: `linear-gradient(90deg, rgba(${defaults.themeColorRGB || '99,102,241'}, 0.2), rgba(${defaults.themeColorRGB || '99,102,241'}, 0.5))`
            }} 
          />
          <div 
            className="goal-progress-fill goal-progress-fill--current" 
            style={{ 
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg, ${defaults.themeColor || '#6366f1'}, #fff)`,
              boxShadow: `0 0 10px rgba(${defaults.themeColorRGB || '99,102,241'}, 0.5)`
            }} 
          />
        </div>
        
        <div className="goal-progress-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: defaults.themeColor || '#6366f1', boxShadow: `0 0 6px rgba(${defaults.themeColorRGB || '99,102,241'}, 0.8)` }}></span>
            Saved <span className="legend-pct">({progressPercent.toFixed(0)}% of Target)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: defaults.themeColor || '#6366f1', opacity: 0.5 }}></span>
            Projected <span className="legend-pct">({completionPct}% of Target)</span>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="goal-card-footer">
        <div className="goal-metric">
          <span className="goal-metric-label"><IndianRupee size={12} /> Target Monthly SIP</span>
          <span className="goal-metric-value">{formatINR(monthlyAllocation)}</span>
          <span className="goal-metric-sub">
            {totalSavings > 0 
              ? monthlyAllocation <= totalSavings 
                ? `${Math.round((monthlyAllocation / totalSavings) * 100)}% of your monthly savings`
                : `Target SIP (${formatShort(monthlyAllocation)})`
              : '--'}
          </span>
        </div>
        <div className="goal-metric">
          <span className="goal-metric-label"><Clock size={12} /> Time Remaining</span>
          <span className="goal-metric-value">{horizon}y</span>
          <span className="goal-metric-sub">@ {returnRate}% expected yearly growth</span>
        </div>
        <div className="goal-metric">
          <span className="goal-metric-label"><TrendingUp size={12} /> Expected Future Value</span>
          <span className="goal-metric-value" style={{ color: defaults.themeColor || '#6366f1' }}>{formatShort(projectedValue)}</span>
          <span className="goal-metric-sub">{isFullyFunded ? 'Goal Fully Covered!' : `${completionPct}% of Target`}</span>
        </div>
        <div className="goal-metric">
          <span className="goal-metric-label">{isFullyFunded ? 'Fund Status' : 'Still Need (Gap)'}</span>
          <span className="goal-metric-value" style={{ color: isFullyFunded ? '#10b981' : '#f43f5e' }}>
            {isFullyFunded ? '₹0 Gap' : formatShort(gap)}
          </span>
          <span className="goal-metric-sub">{isFullyFunded ? 'Fully on track to target' : 'Save more to reach target'}</span>
        </div>
      </div>

      {/* Actionable Insight */}
      <div className="goal-action-container">
        {isDbGoal && goalObj.gemini_advice ? (
          <motion.div className="goal-action-card">
            <div className="action-card-highlight" style={{ background: gapPositive ? '#eab308' : '#10b981' }}></div>
            <Sparkles size={16} color={gapPositive ? '#eab308' : '#10b981'} style={{ flexShrink: 0, marginTop: 2, zIndex: 1 }} />
            <div style={{ zIndex: 1, fontSize: '0.8rem' }}>
              <strong>Your Adviser Says:</strong>
              {goalObj.gemini_advice}
            </div>
          </motion.div>
        ) : defaults.tip ? (
          <div className="goal-tip" style={{ borderLeftColor: defaults.themeColor || '#6366f1' }}>
            <Lightbulb size={14} color={defaults.themeColor || '#6366f1'} style={{ flexShrink: 0, marginRight: 4 }} /> {defaults.tip}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};

/* ─── Main Component ──────────────────────────────────────────────── */
const GoalTracker = ({ profile, recommendations }) => {
  const [dbGoals, setDbGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);

  const horizon = profile?.investment_horizon || 15;
  const totalSavings = Number(profile?.monthly_savings) || 0;

  const smartDefaults = useMemo(() => computeSmartDefaults(profile), [profile]);

  useEffect(() => {
    fetchActiveGoals();
  }, []);

  const fetchActiveGoals = async () => {
    try {
      setLoading(true);
      const res = await api.getGoals();
      setDbGoals(res.goals || []);
    } catch (e) {
      console.error("Failed to load goals for tracker:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeDefaults = async () => {
    setIsInitializing(true);
    setBootstrapResult(null);
    const results = { succeeded: [], failed: [] };
    const defaultKeys = Object.keys(smartDefaults);

    try {
      for (const key of defaultKeys) {
        const def = smartDefaults[key];
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + Math.round(def.yearsToGoal * 12));
        
        const res = await submitGoal(api, {
          goalName: key,
          targetAmount: def.target,
          targetDate,
          currentSavings: def.currentSaved,
          profileId: profile?._id || profile?.profileId,
          priority: def.priority || 'Medium',
        });

        if (res.success) {
          results.succeeded.push(key);
        } else {
          results.failed.push({ key, message: res.error });
        }
      }
    } finally {
      // ALWAYS refresh dbGoals after the loop, regardless of partial failure
      try {
        const fresh = await api.getGoals();
        setDbGoals(fresh.goals || []);
      } catch (e) {
        console.error("Failed to refresh goals after bootstrap:", e);
      }
      setIsInitializing(false);

      const total = defaultKeys.length;
      if (results.failed.length > 0) {
        if (results.succeeded.length > 0) {
          const failedDetails = results.failed.map(f => `${f.key} (${f.message})`).join(', ');
          setBootstrapResult({
            type: 'partial',
            message: `Created ${results.succeeded.length} of ${total} goals. Skipped: ${failedDetails}`,
            succeeded: results.succeeded,
            failed: results.failed,
          });
        } else {
          const firstReason = results.failed[0]?.message || 'Unknown error';
          setBootstrapResult({
            type: 'total_failure',
            message: `Couldn't create any goals: ${firstReason}`,
            succeeded: [],
            failed: results.failed,
          });
        }
      } else {
        setBootstrapResult(null);
      }
    }
  };

  const handleGoalCardUpdate = async (goalId, patchData) => {
    try {
      const res = await api.updateGoal(goalId, patchData);
      if (res.success) {
        // Fetch list to ensure recalculations are pulled
        const freshList = await api.getGoals();
        setDbGoals(freshList.goals || []);
      }
    } catch (err) {
      alert("Failed to save changes: " + (err.message || "Unknown error"));
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!window.confirm("Are you sure you want to delete this goal? This will permanently remove it from your tracker.")) return;
    try {
      const res = await api.deleteGoal(goalId);
      if (res.deleted) {
        const freshList = await api.getGoals();
        setDbGoals(freshList.goals || []);
      }
    } catch (err) {
      alert("Failed to delete goal: " + (err.message || "Unknown error"));
    }
  };

  // Determine whether to show custom database goals or local sandbox defaults
  const showDbGoals = dbGoals.length > 0;

  // Goals list to map in UI
  const mappedGoals = useMemo(() => {
    if (showDbGoals) {
      return dbGoals.map(g => ({
        name: g.goal_name,
        isDb: true,
        obj: g,
        key: g._id || g.goalId,
        horizon: g.years_remaining || horizon,
        returnRate: 11,
        // Match icon/theme from presets, or default
        defaults: smartDefaults[g.goal_name] || (() => {
          const cat = getGoalTypeByLabel(g.goal_name);
          return cat ? {
            icon: ICON_MAP[cat.Icon] || Target,
            themeColor: cat.color,
            themeColorRGB: cat.themeColorRGB || hexToRgb(cat.color),
            description: `Custom goal targeted in ${Math.round(g.years_remaining || horizon)}y`,
            tip: 'Create structured savings plans to meet targets.',
            priority: g.priority || 'Medium',
          } : {
            icon: Target,
            themeColor: '#0ea5e9',
            themeColorRGB: '14, 165, 233',
            description: `Custom goal targeted in ${Math.round(g.years_remaining || horizon)}y`,
            tip: 'Create structured savings plans to meet targets.',
            priority: g.priority || 'Medium',
          };
        })()
      }));
    } else {
      // Local fallback
      const defaultGoals = profile?.investment_goals || ['Retirement', 'Wealth Growth'];
      return defaultGoals.map(g => ({
        name: g,
        isDb: false,
        obj: null,
        key: g,
        horizon: smartDefaults[g]?.yearsToGoal || (g === 'Emergency Fund' ? Math.min(2, horizon) : horizon),
        returnRate: smartDefaults[g]?.returnRate || 10,
        defaults: smartDefaults[g] || (() => {
          const cat = getGoalTypeByLabel(g);
          return cat ? {
            icon: ICON_MAP[cat.Icon] || Target,
            themeColor: cat.color,
            themeColorRGB: cat.themeColorRGB || hexToRgb(cat.color),
            description: '',
            tip: '',
            yearsToGoal: horizon,
            returnRate: cat.returnRate || 10,
            priority: cat.defaultPriority || 'Medium',
          } : {
            icon: Target,
            themeColor: '#6366f1',
            themeColorRGB: '99, 102, 241',
            description: '',
            tip: '',
            yearsToGoal: horizon,
            returnRate: 10,
            priority: 'Medium',
          };
        })()
      }));
    }
  }, [showDbGoals, dbGoals, profile, smartDefaults, horizon]);

  // Compute total monthly allocations per goal
  const goalAllocations = useMemo(() => {
    const allocs = {};

    // For DB goals, use the backend-computed recommended_sip for each goal
    // (more accurate than reverse-engineering from recommendation matching)
    if (showDbGoals) {
      mappedGoals.forEach(g => {
        allocs[g.name] = g.obj?.recommended_sip || 0;
      });
      return allocs;
    }

    // For local goals, distribute based on recommendation-goal matching
    mappedGoals.forEach(g => { allocs[g.name] = 0; });
    
    // Dynamic matching of allocations from recommendations
    (recommendations || []).forEach(inv => {
      (inv.suitable_for_goals || []).forEach(gName => {
        if (allocs[gName] !== undefined) {
          allocs[gName] += (inv.monthly_allocation || 0) / inv.suitable_for_goals.length;
        }
      });
    });

    const totalAllocated = Object.values(allocs).reduce((a, b) => a + b, 0);
    if (totalAllocated === 0 && totalSavings > 0) {
      mappedGoals.forEach(g => { allocs[g.name] = totalSavings / mappedGoals.length; });
    }
    return allocs;
  }, [mappedGoals, recommendations, totalSavings, showDbGoals]);

  // Combined calculations for the HUD
  const totalTarget = useMemo(() => {
    if (showDbGoals) {
      return dbGoals.reduce((sum, g) => sum + (Number(g.target_amount) || 0), 0);
    }
    return mappedGoals.reduce((sum, g) => sum + (smartDefaults[g.name]?.target || 1000000), 0);
  }, [showDbGoals, dbGoals, mappedGoals, smartDefaults]);

  const totalCurrent = useMemo(() => {
    if (showDbGoals) {
      return dbGoals.reduce((sum, g) => sum + (Number(g.current_savings) || 0), 0);
    }
    return mappedGoals.reduce((sum, g) => sum + (smartDefaults[g.name]?.currentSaved || 0), 0);
  }, [showDbGoals, dbGoals, mappedGoals, smartDefaults]);

  const totalProjected = useMemo(() => {
    return mappedGoals.reduce((sum, g) => {
      if (g.isDb && g.obj.monte_carlo_summary?.p50) {
        return sum + g.obj.monte_carlo_summary.p50;
      }
      const yr = g.horizon;
      const rate = g.returnRate;
      const localAlloc = goalAllocations[g.name] || 0;
      const localSaved = g.isDb ? g.obj.current_savings : (smartDefaults[g.name]?.currentSaved || 0);
      return sum + calculateSIPFutureValue(localAlloc, rate, yr) + Number(localSaved) * Math.pow(1 + rate / 100, yr);
    }, 0);
  }, [mappedGoals, goalAllocations, smartDefaults]);

  const totalMonthlySIP = useMemo(() => {
    if (showDbGoals) {
      return dbGoals.reduce((sum, g) => sum + (g.recommended_sip || 0), 0);
    }
    return Object.values(goalAllocations).reduce((a, b) => a + b, 0);
  }, [showDbGoals, dbGoals, goalAllocations]);

  // MC projections target inflation-adjusted amounts, so use those for health calculation
  const totalInflationAdjustedTarget = useMemo(() => {
    if (showDbGoals) {
      return dbGoals.reduce((sum, g) => sum + (Number(g.inflation_adjusted_target || g.target_amount) || 0), 0);
    }
    return totalTarget;
  }, [showDbGoals, dbGoals, totalTarget]);

  const overallHealth = totalInflationAdjustedTarget > 0 ? Math.min(Math.round((totalProjected / totalInflationAdjustedTarget) * 100), 100) : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '60vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <RefreshCw size={44} color="#06b6d4" className="animate-spin" />
        <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>Loading your goals...</span>
      </div>
    );
  }

  return (
    <motion.div
      className="goal-tracker-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="ambient-background">
        <div className="ambient-orb orb-1"></div>
        <div className="ambient-orb orb-2"></div>
      </div>

      <motion.div
        className="page-header"
        style={{ textAlign: 'center', marginBottom: 8 }}
        initial={{ y: -15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <div className="gt-page-badge">
          <Target size={11} />
          {showDbGoals ? 'Your Saved Goals' : 'Suggested Goals (Preview)'}
        </div>
        <h1 className="gt-page-title">My Financial Goals</h1>
        <p className="gt-page-subtitle">
          Based on your ₹{(Number(profile?.monthly_income) || 0).toLocaleString('en-IN')}/mo income over {profile?.investment_horizon || 15} years
        </p>
        <div className="gt-header-divider" />
      </motion.div>

      {/* Partial / Total Bootstrap Result Banner */}
      {bootstrapResult && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="gt-bootstrap-result-banner"
          style={{
            background: bootstrapResult.type === 'partial' 
              ? 'rgba(245, 158, 11, 0.15)' 
              : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${bootstrapResult.type === 'partial' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <AlertTriangle 
              size={20} 
              color={bootstrapResult.type === 'partial' ? '#f59e0b' : '#ef4444'} 
              style={{ flexShrink: 0 }} 
            />
            <span style={{ 
              color: '#f8fafc', 
              fontSize: '0.9rem', 
              fontWeight: 600, 
              lineHeight: 1.4 
            }}>
              {bootstrapResult.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBootstrapResult(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '1.2rem',
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 8,
              lineHeight: 1,
            }}
            title="Dismiss notification"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Bootstrap Defaults Banner */}
      {!showDbGoals && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: 20, padding: 24, marginBottom: 32, display: 'flex',
            alignItems: 'center', justifySelf: 'center', gap: 20, flexWrap: 'wrap',
            boxShadow: '0 8px 32px rgba(6, 182, 212, 0.05)'
          }}
        >
          <div style={{ background: 'rgba(6, 182, 212, 0.1)', padding: 12, borderRadius: 12, display: 'flex' }}>
            <Layers size={28} color="#38bdf8" />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h4 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800 }}>Welcome to your Goals Dashboard</h4>
            <p style={{ color: '#cbd5e1', margin: 0, fontSize: '0.88rem', lineHeight: 1.4 }}>
              We've suggested <strong>{mappedGoals.length} starter goals</strong> based on your income. Click "Save My Goals" to save them and see how they might grow!
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={isInitializing}
            onClick={handleInitializeDefaults}
            style={{
              background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)', border: 'none',
              padding: '12px 24px', borderRadius: 12, color: '#fff', fontWeight: 700,
              cursor: isInitializing ? 'not-allowed' : 'pointer', fontSize: '0.88rem',
              display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 15px rgba(6, 182, 212, 0.2)'
            }}
          >
            {isInitializing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isInitializing ? 'Saving Goals...' : 'Save My Goals'}
          </motion.button>
        </motion.div>
      )}

      {/* ── Overview Card ────────────────────────────────── */}
      <motion.div
        className="goal-overview-card premium-glass"
        initial={{ scale: 0.98, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 120, damping: 20 }}
      >
        <div className="overview-glow-line"></div>
        
        <div className="goal-overview-stat">
          <span className="goal-overview-label">What You're Saving For</span>
          <span className="goal-overview-value text-gradient-primary">{formatShort(totalTarget)}</span>
          <span className="goal-overview-sub">Across {mappedGoals.length} goals</span>
        </div>
        
        <div className="goal-overview-divider"></div>
        
        <div className="goal-overview-stat">
          <span className="goal-overview-label">Already Saved</span>
          <span className="goal-overview-value">{formatShort(totalCurrent)}</span>
          <span className="goal-overview-sub">{totalTarget > 0 ? `${Math.round((totalCurrent / totalTarget) * 100)}% of target` : ''}</span>
        </div>
        
        <div className="goal-overview-divider"></div>
        
        <div className="goal-overview-stat">
          <span className="goal-overview-label">Expected Growth</span>
          <span className="goal-overview-value">{formatShort(totalProjected)}</span>
          <span className="goal-overview-sub">Monthly Savings Needed: {showDbGoals ? `₹${Math.round(totalMonthlySIP).toLocaleString('en-IN')}/mo` : `₹${Math.round(totalSavings).toLocaleString('en-IN')}/mo`}</span>
        </div>
        
        <div className="goal-overview-divider"></div>
        
        <div className="goal-overview-stat">
          <span className="goal-overview-label">Overall Progress</span>
          <span className="goal-overview-value health-value" style={{
            color: overallHealth >= 80 ? '#10b981' : overallHealth >= 50 ? '#f59e0b' : '#ef4444',
            textShadow: `0 0 20px ${overallHealth >= 80 ? 'rgba(16,185,129,0.4)' : overallHealth >= 50 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)'}`
          }}>
            {overallHealth}%
          </span>
          <span className="goal-overview-sub" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="health-dot" style={{ 
              backgroundColor: overallHealth >= 80 ? '#10b981' : overallHealth >= 50 ? '#f59e0b' : '#ef4444',
              boxShadow: `0 0 10px ${overallHealth >= 80 ? '#10b981' : overallHealth >= 50 ? '#f59e0b' : '#ef4444'}`
            }} />
            {overallHealth >= 80 ? 'On Track' : overallHealth >= 50 ? 'Could Use a Boost' : 'Needs Attention'}
          </span>
        </div>
      </motion.div>

      {/* ── Goal Cards ────────────────────────────────────── */}
      <div className="goal-cards-grid">
        <AnimatePresence>
          {mappedGoals.map((g, index) => (
            <GoalCard
              key={g.key}
              index={index}
              goalName={g.name}
              defaults={g.defaults}
              goalObj={g.obj}
              onSaveUpdates={handleGoalCardUpdate}
              onDeleteGoal={handleDeleteGoal}
              monthlyAllocation={goalAllocations[g.name] || 0}
              horizon={g.horizon}
              returnRate={g.returnRate}
              totalSavings={totalSavings}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default GoalTracker;
