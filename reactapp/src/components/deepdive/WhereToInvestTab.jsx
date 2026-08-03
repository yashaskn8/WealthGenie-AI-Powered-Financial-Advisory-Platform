import React, { useState } from 'react';
import { Building2, Shield, Star, Info, Wallet, Zap, History as HistoryIcon, TrendingUp, AlertTriangle } from 'lucide-react';
import WHERE_TO_INVEST from '../../whereToInvest';
import { generateWTI, rankWhereToInvest, shouldRecommendETF } from '../../utils/wtiGenerator';
import SebiDisclaimer from '../SebiDisclaimer';

const RISK_LEVELS = [
  { label: 'Low', color: '#22c55e', desc: 'Capital is safe. Government-guaranteed or DICGC-insured. Virtually zero chance of loss.' },
  { label: 'Low to Moderate', color: '#84cc16', desc: 'Mostly safe with minor NAV fluctuations. Best for 1–3 year parking of surplus.' },
  { label: 'Moderate', color: '#eab308', desc: 'Price volatility present. Capital may dip temporarily. Suitable for 3+ year horizon.' },
  { label: 'Moderately High', color: '#f97316', desc: 'Significant short-term volatility. Requires 5+ year commitment for reliable returns.' },
  { label: 'High', color: '#ef4444', desc: 'Substantial market risk. 20–30% drawdowns possible. Requires 7+ year horizon.' },
  { label: 'Very High', color: '#dc2626', desc: 'Maximum volatility. 40%+ drawdowns possible. Only for 10+ year aggressive investors.' },
];

const WhereToInvestTab = ({ inv }) => {
  const wtiData = WHERE_TO_INVEST[inv.id] || generateWTI(inv);
  const subCategoryMap = wtiData?.sectors || wtiData?.subCategories || null;
  const subKeys = subCategoryMap ? Object.keys(subCategoryMap) : [];

  const [activeSubTab, setActiveSubTab] = useState(subKeys[0] || null);

  if (!wtiData) return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <Building2 size={48} color="var(--ddm-text-muted)" />
      <p style={{ color: 'var(--ddm-text-muted)', marginTop: 16, fontSize: '0.9rem' }}>No product data available for this instrument.</p>
    </div>
  );

  const rawProducts = (subCategoryMap && activeSubTab) ? subCategoryMap[activeSubTab] : wtiData.products;
  const products = rankWhereToInvest(rawProducts || []);

  const level = Math.max(0, Math.min(5, (wtiData.riskLevel || 1) - 1));
  const risk = RISK_LEVELS[level];
  const CX = 140, CY = 125, R = 90, r2 = 62;
  const totalAngle = Math.PI;
  const segGap = 0.025;

  const showEtfSuggestion = inv.id === 'mid_cap_stocks' && shouldRecommendETF('Moderate', 0.25);

  return (
    <div className="tab-fade-in">
      <div className="ddm-section-header">Execution Pathway & Top 5 Recommendations</div>

      {wtiData.note && (
        <div className="wti-note-banner">
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <p>{wtiData.note}</p>
        </div>
      )}

      {/* Sub-Category Sector/Theme Drill-Down Tabs */}
      {subKeys.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {subKeys.map(key => (
            <button
              key={key}
              onClick={() => setActiveSubTab(key)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeSubTab === key ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                background: activeSubTab === key ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                color: activeSubTab === key ? '#38bdf8' : '#94a3b8',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {key.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Stock vs ETF Decision Rule Warning Banner */}
      {showEtfSuggestion && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '1rem',
          display: 'flex',
          gap: '10px',
          fontSize: '0.8rem',
          color: '#fef08a'
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2, color: '#eab308' }} />
          <div>
            <strong>Risk Decision Rule Active:</strong> For moderate-risk investors or high sector volatility, low-cost Sector ETFs/Mutual Funds (e.g. MidCap ETF, Nifty Bank ETF) are recommended over direct stock picking to avoid single-stock drawdown risk.
          </div>
        </div>
      )}

      {/* SEBI Risk-O-Meter */}
      <div className="risk-meter-container">
        <div className="risk-meter-header">
          <Shield size={14} style={{ color: risk.color }} />
          <span>SEBI Risk-O-Meter</span>
          <span className="risk-meter-sebi-tag">SEBI Mandate</span>
        </div>
        <div className="risk-meter-gauge">
          <svg viewBox="0 0 280 155" className="risk-meter-svg">
            <defs>
              <filter id="rmGlow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="rmNeedleShadow">
                <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor={risk.color} floodOpacity="0.6" />
              </filter>
              <linearGradient id="rmNeedleGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor={risk.color} />
              </linearGradient>
              <radialGradient id="rmHubGrad">
                <stop offset="0%" stopColor="rgba(30,41,59,1)" />
                <stop offset="100%" stopColor="rgba(15,23,42,1)" />
              </radialGradient>
            </defs>

            <path
              d={`M ${CX + (R + 8) * Math.cos(Math.PI)} ${CY - (R + 8) * Math.sin(Math.PI)} A ${R + 8} ${R + 8} 0 0 1 ${CX + (R + 8) * Math.cos(0)} ${CY - (R + 8) * Math.sin(0)}`}
              fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"
            />

            {RISK_LEVELS.map((r, i) => {
              const a1 = Math.PI - (i / 6) * totalAngle + segGap;
              const a2 = Math.PI - ((i + 1) / 6) * totalAngle - segGap;
              const ox1 = CX + R * Math.cos(a1), oy1 = CY - R * Math.sin(a1);
              const ox2 = CX + R * Math.cos(a2), oy2 = CY - R * Math.sin(a2);
              const ix2 = CX + r2 * Math.cos(a2), iy2 = CY - r2 * Math.sin(a2);
              const ix1 = CX + r2 * Math.cos(a1), iy1 = CY - r2 * Math.sin(a1);
              const isActive = i === level;
              return (
                <path
                  key={i}
                  d={`M ${ox1} ${oy1} A ${R} ${R} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${r2} ${r2} 0 0 0 ${ix1} ${iy1} Z`}
                  fill={r.color}
                  opacity={isActive ? 1 : 0.18}
                  filter={isActive ? 'url(#rmGlow)' : 'none'}
                  style={{ transition: 'opacity 0.6s ease' }}
                />
              );
            })}

            {RISK_LEVELS.map((r, i) => {
              const midAngle = Math.PI - ((i + 0.5) / 6) * totalAngle;
              const labelR = R + 16;
              const lx = CX + labelR * Math.cos(midAngle);
              const ly = CY - labelR * Math.sin(midAngle);
              const isActive = i === level;
              const rotDeg = -((midAngle * 180) / Math.PI - 90);
              const flip = rotDeg > 90 || rotDeg < -90;
              const finalRot = flip ? rotDeg + 180 : rotDeg;
              return (
                <text
                  key={i}
                  x={lx} y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isActive ? '#f1f5f9' : 'rgba(255,255,255,0.3)'}
                  fontSize={isActive ? '7' : '6'}
                  fontWeight={isActive ? '700' : '400'}
                  fontFamily="Inter, system-ui, sans-serif"
                  transform={`rotate(${finalRot}, ${lx}, ${ly})`}
                  style={{ transition: 'all 0.4s ease' }}
                >
                  {r.label}
                </text>
              );
            })}

            {[0, 1, 2, 3, 4, 5, 6].map(i => {
              const a = Math.PI - (i / 6) * totalAngle;
              const t1 = CX + (R + 1) * Math.cos(a), u1 = CY - (R + 1) * Math.sin(a);
              const t2 = CX + (R + 6) * Math.cos(a), u2 = CY - (R + 6) * Math.sin(a);
              return <line key={i} x1={t1} y1={u1} x2={t2} y2={u2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />;
            })}

            {(() => {
              const needleAngle = Math.PI - ((level + 0.5) / 6) * totalAngle;
              const needleLen = r2 - 6;
              const tipX = CX + needleLen * Math.cos(needleAngle);
              const tipY = CY - needleLen * Math.sin(needleAngle);
              const basePerp = Math.PI / 2;
              const bx1 = CX + 4 * Math.cos(needleAngle + basePerp);
              const by1 = CY - 4 * Math.sin(needleAngle + basePerp);
              const bx2 = CX + 4 * Math.cos(needleAngle - basePerp);
              const by2 = CY - 4 * Math.sin(needleAngle - basePerp);
              return (
                <g filter="url(#rmNeedleShadow)">
                  <polygon
                    points={`${bx1},${by1} ${bx2},${by2} ${tipX},${tipY}`}
                    fill="url(#rmNeedleGrad)"
                  />
                  <circle cx={tipX} cy={tipY} r="2" fill="#f8fafc" />
                </g>
              );
            })()}

            <circle cx={CX} cy={CY} r="12" fill="url(#rmHubGrad)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
            <circle cx={CX} cy={CY} r="5" fill={risk.color} opacity="0.9" />
            <circle cx={CX} cy={CY} r="2.5" fill="#020617" />
            <line x1={CX - R - 4} y1={CY + 1} x2={CX + R + 4} y2={CY + 1} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          </svg>
        </div>
        <div className="risk-meter-result">
          <div className="risk-meter-pill" style={{ '--risk-color': risk.color, color: 'var(--risk-color)', borderColor: 'var(--risk-color)' }}>
            {risk.label}
          </div>
          <p className="risk-meter-desc">{risk.desc}</p>
        </div>
      </div>

      <div className="wti-grid">
        {products.map((product, idx) => (
          <div key={idx} className={`wti-item ${idx === 0 ? 'wti-item--featured' : ''}`}>
            <div className="wti-rank">{idx + 1}</div>
            <div className="wti-card-body">
              <div className="wti-card-top">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h4 className="wti-name">{product.name}</h4>
                    {product.badge && <span className="wti-badge">{product.badge}</span>}
                  </div>
                  <span className="wti-provider">{product.provider}</span>
                </div>
                <div className="wti-rate-chip">{product.rate}</div>
              </div>
              <p className="wti-highlights">{product.highlight}</p>
              <div className="wti-meta-footer">
                <div className="meta-box"><Building2 size={12} /> {product.platform}</div>
                <div className="meta-box"><Wallet size={12} /> Min: {product.minInvestment}</div>
                {product.tenure && <div className="meta-box"><HistoryIcon size={12} /> {product.tenure}</div>}
                {idx === 0 && <div className="meta-box meta-box--pick"><Star size={12} /> Top Pick</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {wtiData.howToStart && (
        <div className="wti-howto">
          <Zap size={14} style={{ flexShrink: 0, color: '#22c55e' }} />
          <div>
            <span className="wti-howto-label">How to get started</span>
            <p>{wtiData.howToStart}</p>
          </div>
        </div>
      )}

      {/* Mandatory SEBI Disclaimer Component */}
      <SebiDisclaimer />
    </div>
  );
};

export default WhereToInvestTab;
