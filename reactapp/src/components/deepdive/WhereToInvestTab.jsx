import React, { useState } from 'react';
import { Building2, Shield, Star, Info, Wallet, Zap, History as HistoryIcon, TrendingUp, AlertTriangle, Globe, Activity } from 'lucide-react';
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

// Macro Regime Mapping for Active Market Events (War, Covid, Crash, Inflation, Rate Cut)
const MACRO_REGIME_CONFIGS = {
  geopolitical_conflict: {
    title: "Active Macro Regime: Geopolitical Conflict & Supply Shock (War Status)",
    badge: "Tactical Shift: Overweight Defence, Energy & Gold (+15%)",
    color: "#eab308",
    matchingIds: ['defence_sector_mf', 'mfg_sector_mf', 'gold_etf', 'sgb', 'rbi_bonds'],
    description: "During geopolitical conflicts and supply chain shocks (e.g. Russia-Ukraine / Middle East conflicts), domestic defence equipment manufacturers (HAL, BEL), upstream oil/energy producers, and physical Gold/SGB historically outperform while trade-dependent sectors experience margin pressure.",
    disclaimer: "Historical pattern: Tactical +15% tilt to Defence/Gold hedges safe-haven volatility. (Non-executing advisory simulation)."
  },
  pandemic_health_crisis: {
    title: "Active Macro Regime: Health Emergency & Mobility Restriction (Pandemic Status)",
    badge: "Defensive Shift: Overweight Pharma & Digital IT (+20%)",
    color: "#a855f7",
    matchingIds: ['pharma_sector_mf', 'it_sector_mf', 'elss'],
    description: "During global health emergencies and lockdown disruptions (e.g. COVID-19 pandemic), active pharmaceutical ingredient (API) exporters, diagnostic chains, and enterprise digital IT services experience surge demand while physical mobility sectors dip.",
    disclaimer: "Historical pattern: Healthcare/Pharma and Digital IT generate resilient cash flows during mobility shocks."
  },
  broad_market_crash: {
    title: "Active Macro Regime: Broad Market Drawdown (>15% Drop)",
    badge: "Crash Defense: Overweight Blue-Chips & Liquid Funds (+25%)",
    color: "#ef4444",
    matchingIds: ['liquid_mf', 'bluechip_stocks', 'large_cap_stocks', 'fd'],
    description: "During systemic market crashes and liquidity contractions, zero-debt blue-chips with high cash reserves preserve capital while Liquid Funds park dry powder to rebalance at generational bottom valuations.",
    disclaimer: "Historical pattern: Blue-chip capital preservation allows dry powder deployment during market crashes."
  }
};

// Human-readable labels for sub-category tabs (with visual icons)
const SUB_TAB_LABELS = {
  sovereign_gsec: '🇮🇳 Sovereign G-Sec',
  aaa_corporate: '🏆 AAA Corporate',
  section_54ec: '🏛️ Section 54EC',
  tax_free_bonds: '💎 Tax-Free Bonds',
  psu_bonds: '🏢 PSU Bonds',
  broad_market: '📊 Broad Market',
  sectoral_thematic: '🎯 Sectoral & Thematic',
  smart_beta: '⚡ Smart Beta & Factor',
  commodity: '🪙 Commodity ETFs',
  international: '🌐 International ETFs',
  physical_gold_etf: '🥇 Physical Gold ETF',
  silver_etf: '🥈 Silver ETF',
  sgb_secondary: '📜 SGB Secondary',
  largecap_index: '🏢 LargeCap Index',
  next50_midcap: '🚀 Next50 & MidCap',
  smart_beta_factor: '⚡ Smart Beta Factor',
  large_cap: '🏢 Large Cap',
  mid_cap: '🚀 Mid Cap',
  small_cap: '🔥 Small Cap',
  flexi_multi: '🔄 Flexi & Multi Cap',
  sector_thematic: '🎯 Sector & Thematic',
  value_contra: '💎 Value & Contra',
  growth_bluechip: '🌟 Growth & Bluechip',
  momentum_quant: '⚡ Momentum & Quant',
  dividend_yield: '💰 Dividend Yield',
  pharma_healthcare: '💊 Pharma & Healthcare',
  banking_financial: '🏦 Banking & Financial',
  it_technology: '💻 IT & Technology',
  infrastructure: '🏗️ Infrastructure',
  defence_manufacturing: '🛡️ Defence & Mfg',
  energy_metals: '⚡ Energy & Metals',
  consumption_fmcg: '🛒 Consumption & FMCG',
  // midcap/smallcap MF strategy sub-tabs
  growth_momentum: '🚀 Growth & Momentum',
  diversified_core: '🛡️ Diversified Core',
  value_quality: '💎 Value & Quality',
  aggressive_alpha: '🔥 Aggressive Alpha',
  diversified_broad: '📊 Diversified Broad',
  quality_defensive: '🏰 Quality Defensive',
  // direct equity sector sub-tabs
  energy_industrial: '⚡ Energy & Industrial',
  fmcg_consumer: '🛒 FMCG & Consumer',
  // REIT sub-tabs
  office_reits: '🏢 Office REITs',
  retail_reits: '🛍️ Retail REITs',
  infrastructure_invits: '🏗️ Infrastructure InvITs',
};

const WhereToInvestTab = ({ inv, userProfile }) => {
  const wtiData = WHERE_TO_INVEST[inv?.id] || generateWTI(inv);
  const subCategoryMap = wtiData?.sectors || wtiData?.subCategories || null;
  const subKeys = subCategoryMap ? Object.keys(subCategoryMap) : [];

  const [activeSubTab, setActiveSubTab] = useState(subKeys[0] || null);
  const [regimeApplied, setRegimeApplied] = useState(false);
  const [sortBy, setSortBy] = useState('score');

  if (!wtiData) return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <Building2 size={48} color="var(--ddm-text-muted)" />
      <p style={{ color: 'var(--ddm-text-muted)', marginTop: 16, fontSize: '0.9rem' }}>No product data available for this instrument.</p>
    </div>
  );

  const userRisk = userProfile?.risk_tolerance || userProfile?.riskCategory || inv?.riskLabel || 'Moderate';
  const sectorVol = inv?.volatility || 0.25;

  // Identify active macro regime banner for current instrument
  const activeRegimeKey = Object.keys(MACRO_REGIME_CONFIGS).find(key => 
    MACRO_REGIME_CONFIGS[key].matchingIds.includes(inv?.id)
  );
  const activeRegime = activeRegimeKey ? MACRO_REGIME_CONFIGS[activeRegimeKey] : null;

  const rawProducts = (subCategoryMap && activeSubTab) ? subCategoryMap[activeSubTab] : wtiData.products;
  const products = rankWhereToInvest(rawProducts || [], userProfile, userRisk, { regimeApplied, activeRegime, sortBy });

  const level = Math.max(0, Math.min(5, (wtiData.riskLevel || 1) - 1));
  const risk = RISK_LEVELS[level];
  const CX = 140, CY = 125, R = 90, r2 = 62;
  const totalAngle = Math.PI;
  const segGap = 0.025;

  const showEtfSuggestion = (inv?.id === 'mid_cap_stocks' || inv?.id === 'direct_equity') && shouldRecommendETF(userRisk, sectorVol, userProfile);

  const isTop5 = products.length >= 5;
  const headerLabel = isTop5 ? 'Execution Pathway & Top 5 Recommendations' : `Execution Pathway (${products.length} Recommended Option${products.length > 1 ? 's' : ''})`;

  return (
    <div className="tab-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
        <div className="ddm-section-header" style={{ marginBottom: 0 }}>{headerLabel}</div>
        
        {/* Interactive Sorting Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(15, 23, 42, 0.7)', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, marginRight: 2 }}>Sort:</span>
          {[
            { id: 'score', label: '🎯 Profile Match' },
            { id: 'postTaxYield', label: '💰 Post-Tax Yield' },
            { id: 'expense', label: '⚡ Low Cost' }
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setSortBy(mode.id)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: sortBy === mode.id ? '1px solid #38bdf8' : '1px solid transparent',
                background: sortBy === mode.id ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: sortBy === mode.id ? '#38bdf8' : '#94a3b8',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Macro Market Regime & Crash Rotation Banner */}
      {activeRegime && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          border: `1px solid ${activeRegime.color}`,
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '1.25rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={18} style={{ color: activeRegime.color }} />
              <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f8fafc' }}>{activeRegime.title}</span>
            </div>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.08)',
              color: activeRegime.color,
              border: `1px solid ${activeRegime.color}`
            }}>
              {activeRegime.badge}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', lineHeight: '1.5', color: '#cbd5e1', margin: '0 0 10px 0' }}>
            {activeRegime.description}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#94a3b8' }}>
              {activeRegime.disclaimer}
            </span>
            <button
              onClick={() => setRegimeApplied(!regimeApplied)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: regimeApplied ? '#22c55e' : activeRegime.color,
                color: '#020617',
                fontSize: '0.75rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.3s ease'
              }}
            >
              <Activity size={14} />
              {regimeApplied ? 'Regime Tilt Applied ✓' : 'Simulate Portfolio Auto-Adjustment'}
            </button>
          </div>
        </div>
      )}

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
              {SUB_TAB_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
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
                    {product.sharpeRatioEst !== undefined && product.sharpeRatioEst > 0 && (
                      <span className="wti-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', borderColor: 'rgba(168, 85, 247, 0.35)' }} title="Sharpe Ratio Risk-Adjusted Efficiency">
                        ⚡ Sharpe {product.sharpeRatioEst}
                      </span>
                    )}
                    {product.profileMatchTag && (
                      <span className="wti-badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.4)' }}>
                        ✓ {product.profileMatchTag}
                      </span>
                    )}
                    {product.investmentRoute && (
                      <span className="wti-badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                        📍 {product.investmentRoute}
                      </span>
                    )}
                  </div>
                  <span className="wti-provider">{product.provider}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div className="wti-rate-chip">{product.rate}</div>
                  {product.postTaxYieldStr && product.postTaxYieldStr !== product.rate && (
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                      {product.postTaxYieldStr}
                    </span>
                  )}
                </div>
              </div>
              <p className="wti-highlights">{product.highlight}</p>

              {product.taxSavingsNote && (
                <div style={{ fontSize: '0.75rem', color: product.taxSavingsNote.startsWith('⚠') ? '#f59e0b' : '#4ade80', fontWeight: 600, margin: '6px 0 4px 0', display: 'flex', alignItems: 'center', gap: 6, background: product.taxSavingsNote.startsWith('⚠') ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${product.taxSavingsNote.startsWith('⚠') ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)'}` }}>
                  <Zap size={12} style={{ color: product.taxSavingsNote.startsWith('⚠') ? '#f59e0b' : '#4ade80', flexShrink: 0 }} />
                  <span>{product.taxSavingsNote}</span>
                </div>
              )}

              {product.realReturnWarning && (
                <div style={{ fontSize: '0.72rem', color: product.realReturnVal < 0 ? '#ef4444' : '#f59e0b', fontWeight: 600, margin: '4px 0 8px 0', display: 'flex', alignItems: 'center', gap: 6, background: product.realReturnVal < 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${product.realReturnVal < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}` }}>
                  <AlertTriangle size={11} style={{ color: product.realReturnVal < 0 ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                  <span>{product.realReturnWarning}</span>
                </div>
              )}

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
