import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, TrendingUp, AlertTriangle, BarChart3, Newspaper, Sparkles, Shield, Zap } from 'lucide-react';
import './InsightsScreen.css';

const InsightsScreen = ({ profile, recommendations }) => {
  const isHighRisk = (profile?.riskCategory || profile?.risk_tolerance || '').includes('Aggressive');
  const horizon = profile?.investment_horizon || 15;
  const savings = Number(profile?.monthly_savings || 0);
  const income = Number(profile?.monthly_income || 0);
  const activeRecs = (recommendations || []).filter(r => (r.monthly_allocation || 0) > 0);
  const recCount = activeRecs.length;
  const savingsRate = income > 0 ? ((savings / income) * 100).toFixed(0) : '0';

  const cards = [
    {
      icon: TrendingUp,
      iconColor: '#f43f5e',
      accentGradient: 'linear-gradient(135deg, #f43f5e, #e11d48)',
      title: 'Stock Market Levels',
      tag: 'Market Signal',
      tagColor: '#f43f5e',
      severity: 'medium',
      body: `The stock market has run up a lot recently. For your long-term goal of ${horizon} years, the best strategy is to keep your monthly savings going regularly, rather than trying to time when the market goes up or down.`,
      action: isHighRisk
        ? 'Keep investing regularly, but be prepared for typical 15–20% market ups and downs.'
        : 'Keep investing regularly — time in the market counts more than trying to time it.',
      delay: 0.1
    },
    {
      icon: BarChart3,
      iconColor: '#2dd4bf',
      accentGradient: 'linear-gradient(135deg, #2dd4bf, #14b8a6)',
      title: 'Safe Income Growth',
      tag: 'Safe Investments',
      tagColor: '#2dd4bf',
      severity: 'low',
      body: 'With government interest rates expected to change, locking in fixed interest rates now protects your savings. We have selected high-quality government and corporate bonds to get you stable growth with lower taxes.',
      action: 'Review your safe allocations to lock in current higher interest rates.',
      delay: 0.2
    },
    {
      icon: Newspaper,
      iconColor: '#fbbf24',
      accentGradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
      title: 'Tax-Free Compounding',
      tag: 'Tax Savings',
      tagColor: '#fbbf24',
      severity: 'high',
      body: 'You can save more on taxes! Placing your safe savings into tax-free plans like EPF or PPF instead of standard bank Fixed Deposits (which are fully taxed) boosts your actual returns by about 1.8% each year.',
      action: 'Check the "Tax Saver" tab to maximize your deductions.',
      delay: 0.3
    },
    {
      icon: AlertTriangle,
      iconColor: '#38bdf8',
      accentGradient: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
      title: 'Investment Diversification',
      tag: 'Risk Checker',
      tagColor: '#38bdf8',
      severity: 'low',
      body: `Your savings are well spread out across ${recCount} different funds. When adding new funds manually, try to avoid putting too much money into the same sector (like IT or Banking) so your risk is well distributed.`,
      action: `${recCount} funds active — check for overlap if you add new investments.`,
      delay: 0.4
    },
    {
      icon: Shield,
      iconColor: '#a78bfa',
      accentGradient: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
      title: 'Monthly Savings Rate',
      tag: 'Savings Check',
      tagColor: '#a78bfa',
      severity: savingsRate >= 30 ? 'low' : savingsRate >= 20 ? 'medium' : 'high',
      body: `Your current savings rate is ${savingsRate}% of your total income (₹${savings.toLocaleString('en-IN')}/mo of ₹${income.toLocaleString('en-IN')}/mo). ${Number(savingsRate) >= 30 ? 'This is excellent — you\'re saving well above the standard 20% mark.' : Number(savingsRate) >= 20 ? 'This is a healthy rate, but saving a bit more would speed up your wealth growth.' : 'Consider saving a bit more each month. Even a 5% increase makes a massive difference over time.'}`,
      action: Number(savingsRate) >= 30
        ? 'Excellent savings habit — consider using a yearly increasing SIP to grow your money faster.'
        : (() => {
          const boost = Math.round((income * 0.05) / 1000) * 1000;
          // Proper SIP FV: P × ((1+r)^n - 1) / r × (1+r), r = 11%/12 (blended avg)
          const r = 0.11 / 12;
          const n = horizon * 12;
          const sipFV = r > 0 ? boost * ((Math.pow(1 + r, n) - 1) / r) * (1 + r) : boost * n;
          return `Saving an extra ₹${boost.toLocaleString('en-IN')}/mo could add ₹${(sipFV / 100000).toFixed(0)} Lakhs+ to your final savings over ${horizon} years.`;
        })(),
      delay: 0.5
    },
  ];

  const severityConfig = {
    low: { label: 'Low Impact', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.08)', border: 'rgba(74, 222, 128, 0.2)' },
    medium: { label: 'Monitor', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.2)' },
    high: { label: 'Action Needed', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.08)', border: 'rgba(244, 63, 94, 0.2)' },
  };

  return (
    <div className="insights-page">
      <div className="insights-ambient">
        <div className="insights-orb insights-orb-1" />
        <div className="insights-orb insights-orb-2" />
      </div>

      {/* Header */}
      <motion.div
        className="insights-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="insights-badge">
          <Sparkles size={12} /> AI-Powered Analysis
        </div>
        <h1 className="insights-title">
          <span className="insights-icon-wrap">
            <Lightbulb size={22} color="#fbbf24" />
          </span>
          Genie AI{' '}
          <span className="insights-title-accent">Insights</span>
        </h1>
        <p className="insights-subtitle">
          Algorithmic market observations mapped to your {horizon}-year trajectory.
        </p>
        <div className="insights-header-divider" />
      </motion.div>

      {/* Cards */}
      <div className="insights-grid">
        {cards.map((card, i) => {
          const IconComp = card.icon;
          const sev = severityConfig[card.severity];
          return (
            <motion.div
              key={i}
              className="insight-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: card.delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{ '--card-color': card.iconColor, '--card-color-rgb': hexToRgb(card.iconColor) }}
            >
              {/* Top accent */}
              <div className="insight-card-accent" style={{ background: card.accentGradient }} />
              
              {/* Ambient glow */}
              <div className="insight-card-glow" style={{ background: `radial-gradient(circle, ${card.iconColor}0a, transparent 70%)` }} />

              {/* Number badge */}
              <div className="insight-number">{String(i + 1).padStart(2, '0')}</div>

              {/* Header */}
              <div className="insight-card-header">
                <div className="insight-icon-wrap" style={{ 
                  background: `linear-gradient(135deg, ${card.iconColor}15, ${card.iconColor}05)`,
                  border: `1px solid ${card.iconColor}30`,
                  boxShadow: `0 0 20px ${card.iconColor}10`
                }}>
                  <IconComp color={card.iconColor} size={20} />
                </div>
                <div className="insight-title-group">
                  <h3 className="insight-card-title">{card.title}</h3>
                  <div className="insight-tags">
                    <span className="insight-tag" style={{ color: card.tagColor, background: `${card.tagColor}12`, borderColor: `${card.tagColor}25` }}>
                      {card.tag}
                    </span>
                    <span className="insight-severity" style={{ color: sev.color, background: sev.bg, borderColor: sev.border }}>
                      {sev.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <p className="insight-card-body">{card.body}</p>

              {/* Action */}
              <div className="insight-action" style={{ borderColor: `${card.iconColor}15` }}>
                <Zap size={13} color={card.iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{card.action}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '56, 189, 248';
}

export default InsightsScreen;
