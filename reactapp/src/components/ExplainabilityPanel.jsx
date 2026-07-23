import React from 'react';
import { getConfidenceLabel } from '../utils/confidenceLabels';
import JargonTooltip from './JargonTooltip';

// Emerald green for positive, Rose red for negative
const FEATURE_COLORS = {
  positive: '#10b981',
  negative: '#f43f5e',
};

const CLEAN_FEATURE_NAMES = {
  annual_income: 'Annual Income Level',
  monthly_savings: 'Monthly Savings Capacity',
  liquid_savings: 'Liquid Cash Savings',
  age: 'Your Age Profile',
  investment_horizon: 'Investment Horizon',
  existing_debt: 'Existing Debt Load',
  dependents: 'Family Dependents Burden',
  emergency_fund_months: 'Emergency Fund Size (Months)',
  savings_rate: 'Savings-to-Income Rate',
  debt_to_income_ratio: 'Debt-to-Income Ratio',
  emergency_fund_adequacy_ratio: 'Emergency Fund Adequacy',
  risk_score: 'Calculated Risk Capacity',
  stated_tolerance_score: 'Stated Risk Appetite',
  risk_capacity_vs_stated_tolerance_gap: 'Risk Capacity vs Tolerance Gap',
  horizon_adjusted_urgency_score: 'Time Horizon Urgency',
  dependents_adjusted_burden_score: 'Dependents Financial Burden',
};

function formatRawValue(feature, value) {
  if (value == null) return 'N/A';
  if (feature === 'annual_income' || feature === 'monthly_savings' || feature === 'liquid_savings') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(value);
  }
  if (feature === 'age') return `${value} years`;
  if (feature === 'investment_horizon') return `${value} years`;
  if (feature === 'existing_debt') return `${value}% of income`;
  if (feature === 'dependents') return `${value} ${value === 1 ? 'dependent' : 'dependents'}`;
  if (feature === 'emergency_fund_months') return `${value} ${value === 1 ? 'month' : 'months'} of expenses`;
  if (feature === 'savings_rate') return `${(value * 100).toFixed(1)}%`;
  if (feature === 'debt_to_income_ratio') return `${(value * 100).toFixed(1)}%`;
  if (feature === 'emergency_fund_adequacy_ratio') return `${value.toFixed(1)}x target`;
  if (feature === 'risk_score' || feature === 'stated_tolerance_score') {
    return `${value.toFixed(0)} / 100`;
  }
  if (feature === 'risk_capacity_vs_stated_tolerance_gap') return `${value > 0 ? '+' : ''}${value.toFixed(0)}`;
  if (feature === 'horizon_adjusted_urgency_score' || feature === 'dependents_adjusted_burden_score') {
    return `${value.toFixed(0)} / 100`;
  }
  return typeof value === 'number' ? value.toFixed(1) : value;
}

const ExplainabilityPanel = ({ explanation, instrumentName }) => {
  if (!explanation || !explanation.feature_contributions) return null;

  const explanationInstrument = explanation?.predicted_class?.replace('_', ' ');
  const titleInstrument = instrumentName || 'this instrument';

  const isConsistent = explanationInstrument &&
    (titleInstrument.toLowerCase().includes(explanationInstrument.toLowerCase()) ||
     explanationInstrument.toLowerCase().includes(titleInstrument.toLowerCase()) ||
     (explanationInstrument === 'Equity MF' && titleInstrument.includes('Equity')) ||
     (explanationInstrument === 'Debt MF' && titleInstrument.includes('Debt')) ||
     (explanationInstrument === 'ETF' && titleInstrument.includes('ETF')));

  const displaySubtitle = isConsistent
    ? explanation.top_reason
    : `Feature contributions below represent TreeSHAP values for a classifier trained on historical AMFI NAV performance statistics.`;

  const contributions = explanation.feature_contributions.map(c => {
    const featureKey = c.feature || c.display_name?.toLowerCase().replace(/ /g, '_');
    const cleanName = CLEAN_FEATURE_NAMES[featureKey] || c.display_name;
    return {
      name: cleanName,
      display_name: cleanName,
      feature: featureKey,
      value: c.shap_value || 0,
      magnitude: Math.abs(c.shap_value || 0),
      direction: c.direction,
      raw_value: c.raw_value,
    };
  });

  const totalMagnitude = contributions.reduce((sum, c) => sum + c.magnitude, 0) || 1;
  const maxShap = Math.max(...contributions.map(c => c.magnitude), 0.1);
  const conf = getConfidenceLabel(explanation.confidence || 0);
  const isLowConfidence = explanation.low_confidence || (explanation.confidence || 0) < 0.55;

  return (
    <div className="explainability-card">
      <style>{`
        .explainability-card {
          margin-top: 28px;
          padding: 30px;
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.45) 0%, rgba(30, 41, 59, 0.2) 100%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(24px);
          position: relative;
          overflow: hidden;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .explainability-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .ai-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 10px;
          background: linear-gradient(135deg, #0284c7, #3b82f6);
          border-radius: 8px;
          font-size: 0.70rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.5px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .explainability-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: #f8fafc;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .explainability-subtitle {
          font-size: 0.85rem;
          line-height: 1.65;
          color: #94a3b8;
          margin: 0 0 20px;
        }

        .low-conf-banner {
          margin-bottom: 20px;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.25);
          color: #fcd34d;
          font-size: 0.80rem;
          line-height: 1.5;
        }

        .legend-container {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.76rem;
          font-weight: 600;
          color: #cbd5e1;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .shap-table {
          width: 100%;
          display: flex;
          flex-direction: column;
          margin-bottom: 28px;
        }

        .shap-table-header {
          display: flex;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.72rem;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .shap-table-row {
          display: flex;
          align-items: center;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          position: relative;
          transition: background-color 0.2s ease;
        }

        .shap-col-factor {
          width: 38%;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .shap-col-chart {
          width: 48%;
          padding: 0 16px;
          position: relative;
        }

        .shap-col-weight {
          width: 14%;
          text-align: right;
        }

        .factor-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #f1f5f9;
        }

        .factor-raw {
          font-size: 0.76rem;
          color: #64748b;
          font-family: 'JetBrains Mono', monospace;
        }

        .weight-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.86rem;
          font-weight: 700;
        }

        .weight-value--positive { color: #10b981; }
        .weight-value--negative { color: #f43f5e; }

        .bar-track {
          height: 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.02);
        }

        .center-line {
          position: absolute;
          left: 50%;
          top: -2px;
          bottom: -2px;
          width: 1px;
          background: rgba(255, 255, 255, 0.25);
          z-index: 2;
        }

        .active-bar {
          position: absolute;
          top: 0; bottom: 0;
          border-radius: 4px;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .active-bar--positive {
          left: 50%;
          background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
        }

        .active-bar--negative {
          right: 50%;
          background: linear-gradient(90deg, #fb7185 0%, #f43f5e 100%);
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.35);
        }

        .row-tooltip {
          opacity: 0;
          pointer-events: none;
          position: absolute;
          background: rgba(15, 23, 42, 0.98);
          border: 1px solid rgba(56, 189, 248, 0.3);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 0.76rem;
          color: #f1f5f9;
          z-index: 10;
          bottom: 110%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          line-height: 1.45;
          width: 290px;
          white-space: normal;
        }

        .shap-table-row:hover .row-tooltip {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        .confidence-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 20px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .confidence-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 20px;
        }

        .confidence-note {
          font-size: 0.76rem;
          color: #64748b;
          max-width: 480px;
          line-height: 1.5;
        }
      `}</style>

      <div className="explainability-header">
        <span className="ai-badge">NAV MODEL</span>
        <h3 className="explainability-title">NAV Performance Model Factor Attribution</h3>
      </div>
      <p className="explainability-subtitle">{displaySubtitle}</p>

      {isLowConfidence && (
        <div className="low-conf-banner">
          <strong>Exploratory / Low-Confidence Recommendation:</strong> Prediction confidence is below serving threshold. The system has automatically falling back to rule-based evaluation.
        </div>
      )}

      {/* Legend Section */}
      <div className="legend-container">
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: FEATURE_COLORS.positive }} />
          Pulls model toward this asset class
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: FEATURE_COLORS.negative }} />
          Pulls model away from this asset class
        </div>
      </div>

      {/* TreeSHAP Table Grid */}
      <div className="shap-table">
        <div className="shap-table-header">
          <div className="shap-col-factor">Factor / What You Entered</div>
          <div className="shap-col-chart" style={{ textAlign: 'center' }}>Impact on Model Prediction</div>
          <div className="shap-col-weight">Weight</div>
        </div>

        {contributions.map((item, idx) => {
          const influencePercent = ((item.magnitude / totalMagnitude) * 100).toFixed(0);
          const barWidthPercent = ((item.magnitude / maxShap) * 50).toFixed(1);

          return (
            <div key={idx} className="shap-table-row">
              <div className="row-tooltip">
                <strong style={{ color: item.value >= 0 ? '#34d399' : '#fb7185', fontSize: '0.8rem' }}>
                  {item.value >= 0 ? '✓ Positive Feature Weight' : '⚠ Negative Feature Weight'}
                </strong>
                <div style={{ marginTop: 6 }}>
                  TreeSHAP feature contribution: <strong>{influencePercent}%</strong> of model output probability based on input <strong>{formatRawValue(item.feature, item.raw_value)}</strong>.
                </div>
              </div>

              <div className="shap-col-factor">
                <span className="factor-name">
                  <JargonTooltip term={item.name}>{item.name}</JargonTooltip>
                </span>
                <span className="factor-raw">
                  Value: {formatRawValue(item.feature, item.raw_value)}
                </span>
              </div>

              <div className="shap-col-chart">
                <div className="bar-track">
                  <div className="center-line" />
                  {item.value >= 0 ? (
                    <div 
                      className="active-bar active-bar--positive" 
                      style={{ width: `${barWidthPercent}%` }}
                    />
                  ) : (
                    <div 
                      className="active-bar active-bar--negative" 
                      style={{ width: `${barWidthPercent}%`, left: `calc(50% - ${barWidthPercent}%)` }}
                    />
                  )}
                </div>
              </div>

              <div className="shap-col-weight">
                <span className={`weight-value ${item.value >= 0 ? 'weight-value--positive' : 'weight-value--negative'}`}>
                  {item.value >= 0 ? '+' : '-'}{influencePercent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confidence Footer */}
      <div className="confidence-footer">
        <span 
          className="confidence-badge" 
          style={{ 
            color: conf.colour, 
            backgroundColor: `${conf.colour}12`,
            border: `1px solid ${conf.colour}22`
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: conf.colour }} />
          {conf.label}
        </span>
        {conf.note && (
          <span className="confidence-note">{conf.note}</span>
        )}
      </div>
    </div>
  );
};

export default ExplainabilityPanel;
