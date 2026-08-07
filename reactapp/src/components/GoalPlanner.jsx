import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SebiDisclaimer from './SebiDisclaimer';
import api from '../services/api';
import GoalForm from './GoalForm';
import GoalDetailPane from './GoalDetailPane';

const STATUS_CONFIG = {
  on_track:  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', label: 'On Track',  icon: CheckCircle },
  at_risk:   { color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)',   label: 'At Risk',   icon: AlertTriangle },
  off_track: { color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)',   label: 'Off Track', icon: AlertTriangle },
};

const formatINR = (value) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
};

const GoalPlanner = ({ profile: _profile }) => {
  const [goals, setGoals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [simulatedSips, setSimulatedSips] = useState({});

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await api.getGoals();
      setGoals(res.goals || []);
      if (res.goals && res.goals.length > 0) {
        const first = res.goals[0];
        setSelectedGoal(first);
        const gid = first._id || first.goalId;
        setSimulatedSips(prev => ({
          ...prev,
          [gid]: first.recommended_sip
        }));
      }
    } catch (err) {
      console.error('Failed to fetch goals:', err);
    }
  };

  const getLiveProbability = (goal) => {
    const simSip = simulatedSips[goal._id || goal.goalId] || goal.recommended_sip;
    const ratio = simSip / (goal.recommended_sip || 1);
    const baseProb = goal.probability_success || 0.75;
    return Math.min(0.99, Math.max(0.05, baseProb * ratio));
  };

  const getSimulatedChartData = (goal) => {
    if (!goal.chartData) return [];
    const simSip = simulatedSips[goal._id || goal.goalId] || goal.recommended_sip;
    const ratio = simSip / (goal.recommended_sip || 1);
    const initialSaved = goal.current_savings || 0;
    const cagr = goal.expected_cagr || 0.12;

    return goal.chartData.map(d => {
      const year = d.year;
      const initialGrowth = initialSaved * Math.pow(1 + cagr, year);
      
      const scaleField = (val) => {
        if (!val) return 0;
        const sipPortion = val - initialGrowth;
        return initialGrowth + sipPortion * ratio;
      };

      return {
        ...d,
        p10: scaleField(d.p10),
        p50: scaleField(d.p50),
        p90: scaleField(d.p90),
      };
    });
  };

  const handleSubmitGoal = async (goalData) => {
    setLoading(true);
    try {
      const res = await api.createGoal({
        goal_name: goalData.goalName,
        target_amount: goalData.targetAmount,
        target_date: goalData.targetDate,
        current_savings: goalData.currentSavings,
        priority: goalData.priority,
      });

      if (res.goal) {
        setGoals(prev => [...prev, res.goal]);
        setSelectedGoal(res.goal);
        const gid = res.goal._id || res.goal.goalId;
        setSimulatedSips(prev => ({ ...prev, [gid]: res.goal.recommended_sip }));
        setShowForm(false);
      }
    } catch (err) {
      alert('Failed to save goal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (goalId) => {
    if (!window.confirm('Are you sure you want to delete this goal? This cannot be undone.')) return;
    try {
      await api.deleteGoal(goalId);
      const nextGoals = goals.filter(g => (g._id !== goalId && g.goalId !== goalId));
      setGoals(nextGoals);
      if (selectedGoal && (selectedGoal._id === goalId || selectedGoal.goalId === goalId)) {
        setSelectedGoal(nextGoals[0] || null);
      }
    } catch (err) {
      alert('Failed to delete goal: ' + err.message);
    }
  };

  const handlePriorityChange = async (newPriority) => {
    const gid = selectedGoal?._id || selectedGoal?.goalId;
    if (!gid) return;
    try {
      const res = await api.updateGoal(gid, { priority: newPriority });
      if (res.goal) {
        setGoals(prev => prev.map(g => (g._id === gid || g.goalId === gid) ? res.goal : g));
        setSelectedGoal(res.goal);
      }
    } catch (err) {
      alert('Failed to update priority: ' + err.message);
    }
  };

  const handleSaveGoalUpdates = async (updates) => {
    const gid = selectedGoal?._id || selectedGoal?.goalId;
    if (!gid) return;
    try {
      const res = await api.updateGoal(gid, {
        target_amount: updates.targetAmount,
        current_savings: updates.currentSavings
      });
      if (res.goal) {
        const updatedGoal = res.goal;
        const freshList = await api.getGoals();
        setGoals(freshList.goals || []);
        const freshGoal = (freshList.goals || []).find(g => g._id === gid || g.goalId === gid);
        setSelectedGoal(freshGoal || updatedGoal);
      }
    } catch (err) {
      alert('Failed to update goal settings: ' + err.message);
    }
  };

  return (
    <motion.div 
      className="dashboard-page"
      style={{ padding: '32px 40px', boxSizing: 'border-box', maxWidth: 1600, margin: '0 auto', width: '100%', overflowX: 'hidden' }}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <div className="dashboard-header" style={{ marginBottom: 40, flexWrap: 'wrap', gap: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ 
            display: 'flex', width: 64, height: 64, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(139, 92, 246, 0.15))', 
            border: '1px solid rgba(6, 182, 212, 0.4)',
            borderRadius: 18, alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 30px rgba(6, 182, 212, 0.2), inset 0 1px 1px rgba(255,255,255,0.3)'
          }}>
            <Target size={32} color="#38bdf8" />
          </div>
          <div className="dashboard-title-group">
            <span className="dashboard-subtitle">Financial Planning Engine</span>
            <h1 className="dashboard-title">My Goal Planner</h1>
            <p style={{ fontSize: '1.05rem', color: '#94a3b8', marginTop: 8, fontWeight: 500 }}>
              Set your targets, choose your priorities, and see how likely you are to succeed with smart wealth simulations.
            </p>
          </div>
        </div>
        <motion.button
          onClick={() => setShowForm(!showForm)}
          whileHover={{ scale: 1.05, boxShadow: '0 8px 25px rgba(6, 182, 212, 0.4)' }}
          whileTap={{ scale: 0.95 }}
          style={{
            background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)', border: 'none',
            borderRadius: 14, padding: '14px 28px', color: '#fff', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            fontSize: '1rem', boxShadow: '0 4px 15px rgba(6, 182, 212, 0.3), inset 0 1px 1px rgba(255,255,255,0.3)',
            alignSelf: 'center', flexShrink: 0
          }}
        >
          <Plus size={20} /> New Goal Target
        </motion.button>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: showForm || selectedGoal ? '1fr 1.1fr' : '1fr', gap: 32, transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {/* Left Panel — Goal List + Form */}
        <div>
          <AnimatePresence>
            {showForm && (
              <GoalForm 
                onSubmitGoal={handleSubmitGoal}
                onCancel={() => setShowForm(false)}
                loading={loading}
              />
            )}
          </AnimatePresence>

          {/* Goal Cards */}
          {goals.length === 0 && !showForm && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                background: 'rgba(30, 41, 59, 0.4)', borderRadius: 20, padding: 60,
                textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)'
              }}
            >
              <Target size={48} style={{ color: '#64748b', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.25rem', color: '#f8fafc', marginBottom: 8 }}>No active goals found</h3>
              <p style={{ color: '#64748b', fontSize: '0.92rem', maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.5 }}>
                Get started by creating your first financial milestone target.
              </p>
              <button 
                onClick={() => setShowForm(true)}
                style={{
                  background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: 10, padding: '10px 20px', color: '#38bdf8', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Add Your First Goal
              </button>
            </motion.div>
          )}

          <AnimatePresence>
            {goals.map(goal => {
              const cfg = STATUS_CONFIG[goal.status] || STATUS_CONFIG.on_track;
              const StatusIcon = cfg.icon;
              const isSelected = selectedGoal?._id === goal._id || selectedGoal?.goalId === goal.goalId;

              return (
                <motion.div
                  key={goal._id || goal.goalId}
                  whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
                  onClick={() => { setSelectedGoal(goal); setShowForm(false); }}
                  style={{
                    background: isSelected ? 'linear-gradient(145deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.95))' : 'rgba(30, 41, 59, 0.3)',
                    border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)'}`,
                    borderRadius: 20, padding: 24, marginBottom: 16, cursor: 'pointer',
                    boxShadow: isSelected ? '0 10px 30px rgba(6, 182, 212, 0.15)' : 'none',
                    transition: 'border-color 0.2s, background-color 0.2s', position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>
                        {goal.goal_name}
                      </h4>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.82rem', color: '#94a3b8' }}>
                        <span>Target: <strong style={{ color: '#cbd5e1' }}>{formatINR(goal.target_amount)}</strong></span>
                        <span>•</span>
                        <span>Date: <strong style={{ color: '#cbd5e1' }}>{new Date(goal.target_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })}</strong></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        background: cfg.bg, color: cfg.color, padding: '4px 10px',
                        borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${cfg.color}25`
                      }}>
                        <StatusIcon size={12} /> {cfg.label}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(goal._id || goal.goalId); }}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                        title="Delete Goal"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: 6 }}>
                      <span>Goal Success Chance</span>
                      <span style={{ color: cfg.color, fontWeight: 700 }}>{Math.round(getLiveProbability(goal) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 4, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, getLiveProbability(goal) * 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{
                          height: '100%',
                          background: `linear-gradient(90deg, ${cfg.color}40, ${cfg.color})`, borderRadius: 4,
                          boxShadow: `0 0 15px ${cfg.color}80, inset 0 1px 1px rgba(255,255,255,0.4)`
                        }} 
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Right Panel — Goal Details & Monte Carlo */}
        {selectedGoal && (
          <GoalDetailPane 
            selectedGoal={selectedGoal}
            simulatedSips={simulatedSips}
            onChangeSimulatedSip={(val) => setSimulatedSips(prev => ({ ...prev, [selectedGoal._id || selectedGoal.goalId]: val }))}
            onPriorityChange={handlePriorityChange}
            onSaveGoalUpdates={handleSaveGoalUpdates}
            getLiveProbability={getLiveProbability}
            getSimulatedChartData={getSimulatedChartData}
          />
        )}
      </div>
      <SebiDisclaimer />
    </motion.div>
  );
};

export default GoalPlanner;
