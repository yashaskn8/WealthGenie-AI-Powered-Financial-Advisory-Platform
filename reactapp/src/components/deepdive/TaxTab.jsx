/**
 * DeepDiveModal — Tax Tab
 * Extracted from DeepDiveModal.jsx for maintainability.
 */
import React from 'react';
import { X, Shield, Info, Zap, ShieldCheck, Briefcase, History as HistoryIcon } from 'lucide-react';
import JargonTooltip from '../JargonTooltip';

/**
 * Compute instrument-specific tax info (FY 2025-26, Budget 2024 rules)
 */
function getTaxInfo(inv) {
  const name = (inv.name || '').toLowerCase();
  const cat = (inv.category || '').toLowerCase();
  const base = {
    section: inv.tax_section || 'N/A',
    taxBenefit: inv.tax_benefit || false,
    taxFreeInterest: inv.tax_free_interest || false,
    maxDeduction: 'N/A',
    ltcg: '',
    stcg: '',
    specialNote: null,
  };

  if (name.includes('ppf')) {
    return { ...base, taxBenefit: true, section: '80C', taxFreeInterest: true, maxDeduction: '₹1,50,000',
      ltcg: 'Fully exempt (EEE status). Maturity amount + interest = 100% tax-free.',
      stcg: 'Not applicable — PPF has a 15-year lock-in. Partial withdrawal allowed from Year 7.',
      specialNote: 'PPF is the only instrument in India with complete EEE (Exempt-Exempt-Exempt) status.' };
  }
  if (name.includes('elss')) {
    return { ...base, taxBenefit: true, section: '80C', maxDeduction: '₹1,50,000',
      ltcg: 'LTCG above ₹1.25 Lakh taxed at 12.5% (held >1 year, effective from Budget 2024).',
      stcg: 'Not applicable — ELSS has a mandatory 3-year lock-in period.',
      specialNote: 'ELSS is the only equity instrument eligible for Section 80C deduction with the shortest lock-in (3 yrs).' };
  }
  if (name.includes('nps')) {
    return { ...base, taxBenefit: true, section: '80CCD(1B)', maxDeduction: '₹50,000 (additional, over 80C limit)',
      ltcg: '60% of corpus at maturity is tax-free. 40% must be used to buy an annuity (pension income taxed at slab rate).',
      stcg: 'Premature withdrawal: 20% of corpus is taxable at slab rate. Remaining 80% must buy an annuity.',
      specialNote: 'NPS offers an exclusive ₹50,000 additional deduction under 80CCD(1B) — on top of the ₹1.5L under 80C.' };
  }
  if (name.includes('scss')) {
    return { ...base, taxBenefit: true, section: '80C', maxDeduction: '₹1,50,000',
      ltcg: 'Interest is fully taxable at slab rate. TDS deducted if interest exceeds ₹50,000/year.',
      stcg: 'Premature closure: 1.5% penalty if closed in Year 2-3, 1% in Year 4-5.',
      specialNote: 'Available only for senior citizens (60+). Interest rate: 8.2% (Q1 FY26), reviewed quarterly by MoF.' };
  }
  if (name.includes('sukanya') || name.includes('ssy')) {
    return { ...base, taxBenefit: true, section: '80C', taxFreeInterest: true, maxDeduction: '₹1,50,000',
      ltcg: 'Fully exempt (EEE). Maturity proceeds are 100% tax-free.',
      stcg: 'Not applicable — 21-year maturity with partial withdrawal after age 18.',
      specialNote: 'Highest government-guaranteed rate (8.2%). Available only for girl children below 10 years.' };
  }
  if (name.includes('sgb') || (name.includes('gold') && name.includes('bond'))) {
    return { ...base, taxBenefit: false, maxDeduction: 'N/A',
      ltcg: 'LTCG at maturity (8 years) is fully tax-free. If sold on exchange before maturity: 12.5% LTCG without indexation.',
      stcg: 'Sold within 1 year: gains taxed at slab rate. Interest (2.5% p.a.) is always taxable at slab rate.',
      specialNote: 'SGBs are the most tax-efficient way to hold gold. Hold to 8-year maturity for zero capital gains tax.' };
  }
  if (name.includes('fd') || name.includes('fixed deposit')) {
    return { ...base, taxBenefit: name.includes('tax') || name.includes('5yr'), section: name.includes('tax') ? '80C' : 'N/A', maxDeduction: name.includes('tax') ? '₹1,50,000' : 'N/A',
      ltcg: 'No capital gains concept. Interest is taxed at slab rate every year (accrual basis).',
      stcg: 'TDS at 10% if interest >₹40,000/year (₹50,000 for senior citizens). Form 15G/15H to avoid TDS if no tax liability.',
      specialNote: 'FD interest is one of the most tax-inefficient income sources. Post-tax real return is often negative for 30% slab holders.' };
  }
  if (name.includes('gold') && !name.includes('bond')) {
    return { ...base,
      ltcg: 'LTCG (held >2 years for physical, >1 year for ETF) taxed at 12.5% flat — no indexation benefit (Budget 2024).',
      stcg: 'STCG taxed at slab rate.',
      specialNote: 'Physical gold also attracts 3% GST on purchase + making charges. Gold ETFs avoid these costs.' };
  }
  if (cat.includes('equity') || cat.includes('hybrid') || cat.includes('etf') || name.includes('etf') || cat.includes('direct')) {
    return { ...base,
      ltcg: `LTCG above ₹1.25 Lakh taxed at 12.5% (held >1 year). Budget 2024 raised this from ₹1L to ₹1.25L and rate from 10% to 12.5%.`,
      stcg: 'STCG (held <1 year) taxed at 20% flat (increased from 15% in Budget 2024).',
      specialNote: 'Equity MFs held >1 year get the ₹1.25L annual LTCG exemption. SIP units are individually tracked for holding period.' };
  }
  if (cat.includes('reit') || cat.includes('invit')) {
    return { ...base,
      ltcg: 'LTCG above ₹1.25 Lakh taxed at 12.5% (held >1 year, listed units). Dividend/distribution income taxed at slab rate.',
      stcg: 'STCG (held <1 year) taxed at 20% flat. Distributions are taxed as per the nature of income (interest, dividend, or capital repayment).',
      specialNote: 'REIT/InvIT distributions have mixed tax treatment — interest component is taxed at slab, dividend at 10% TDS, and capital repayment reduces cost basis.' };
  }
  if (cat.includes('debt') || cat.includes('deposit') || cat.includes('bond') || name.includes('bond')) {
    return { ...base,
      ltcg: 'No LTCG benefit since April 2023. All gains (regardless of holding period) taxed at slab rate. Indexation benefit removed.',
      stcg: 'All gains taxed at slab rate — no distinction between short/long term.',
      specialNote: 'Post-April 2023, debt MFs lost their indexation advantage over FDs. They are now taxed identically to bank FDs.' };
  }
  if (cat.includes('insurance')) {
    return { ...base,
      taxBenefit: true, section: '80C', maxDeduction: '₹1,50,000',
      ltcg: 'Maturity proceeds are tax-free under Section 10(10D) if annual premium is ≤ ₹5L (Budget 2023 cap). Premium qualifies for 80C deduction.',
      stcg: 'Surrender before maturity: taxable at slab rate after deducting premiums paid.',
      specialNote: 'ULIPs with premium >₹2.5L/year are now taxed as capital gains (Budget 2021). Endowment/traditional plans retain 10(10D) exemption if premium ≤ 10% of sum assured.' };
  }
  if (cat.includes('retirement') || name.includes('epf') || name.includes('vpf')) {
    const isEPF = name.includes('epf') || name.includes('vpf') || name.includes('provident');
    if (isEPF) {
      return { ...base, taxBenefit: true, section: '80C', taxFreeInterest: true, maxDeduction: '₹1,50,000',
        ltcg: 'Fully exempt (EEE) if employee contribution ≤ ₹2.5L/year. Interest on excess is taxable (Budget 2021).',
        stcg: 'Premature withdrawal after 5 years of service is tax-free. Before 5 years: employer contribution + interest taxed at slab rate.',
        specialNote: 'EPF interest rate: 8.25% (FY2025-26). VPF allows voluntary contributions above 12% — same EEE benefit up to ₹2.5L/year limit.' };
    }
  }
  return { ...base,
    ltcg: cat.includes('equity') || cat.includes('etf') ? 'Gains above ₹1.25L taxed at 12.5% (held >1 year)' : 'Taxed as per income slab',
    stcg: cat.includes('equity') || cat.includes('etf') ? 'Taxed at 20% (held <1 year)' : 'Taxed as per income slab',
  };
}

const TaxTab = ({ inv }) => {
  const taxInfo = getTaxInfo(inv);

  return (
    <div className="tab-fade-in">
      <div className="ddm-section-header">Tax Compliance Framework</div>
      <div className="ddm-pc-grid" style={{ marginBottom: 32 }}>
        <div className="tax-card-premium" style={{ borderTop: `1px solid ${taxInfo.taxBenefit ? 'rgba(34, 197, 94, 0.6)' : 'rgba(244, 63, 94, 0.6)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span className="metric-label" style={{ color: '#94a3b8', fontSize: '0.85rem', letterSpacing: '1.5px', fontWeight: 700 }}><JargonTooltip term="Section 80C">SECTION 80C ELIGIBILITY</JargonTooltip></span>
            <Shield size={20} color={taxInfo.taxBenefit ? '#22c55e' : '#f43f5e'} opacity={0.6} />
          </div>
          <div style={{ margin: '16px 0', flexGrow: 1 }}>
            <span className={`tax-status-chip ${taxInfo.taxBenefit ? 'tax-status-chip--eligible' : 'tax-status-chip--not-eligible'}`} style={{ fontSize: '1.1rem', padding: '12px 20px', borderRadius: '12px', boxShadow: `0 0 24px ${taxInfo.taxBenefit ? 'rgba(34, 197, 94, 0.2)' : 'rgba(244, 63, 94, 0.2)'}` }}>
              {taxInfo.taxBenefit ? <><ShieldCheck size={20} /> QUALIFIED</> : <><X size={20} /> NOT ELIGIBLE</>}
            </span>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Deduction limit</span>
            <strong style={{ color: '#f8fafc', fontSize: '1.1rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px' }}>{taxInfo.maxDeduction}</strong>
          </div>
        </div>
        <div className="tax-card-premium" style={{ borderTop: '1px solid rgba(56, 189, 248, 0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span className="metric-label" style={{ color: '#94a3b8', fontSize: '0.85rem', letterSpacing: '1.5px', fontWeight: 700 }}>TAXABILITY OF INTEREST</span>
            <Briefcase size={20} color="#38bdf8" opacity={0.6} />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, margin: '12px 0', color: '#f8fafc', letterSpacing: '-0.03em', flexGrow: 1, textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
            {taxInfo.taxFreeInterest ? <span style={{ color: '#38bdf8', textShadow: '0 0 24px rgba(56,189,248,0.5)' }}><JargonTooltip term="EEE">Tax-Free (EEE)</JargonTooltip></span> : <span style={{ color: '#f8fafc' }}>Fully Taxable</span>}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>Applicable Section</span>
            <strong style={{ color: '#cbd5e1', fontSize: '1.1rem', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px' }}>{taxInfo.section}</strong>
          </div>
        </div>
      </div>

      <div className="ddm-section-header">Capital Gains (Market Linked)</div>
      <div className="ddm-pc-grid">
        <div className="tax-cg-card" style={{ borderTop: '1px solid rgba(245, 158, 11, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.05))', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.3)', boxShadow: '0 12px 24px -8px rgba(245, 158, 11, 0.2)' }}>
               <HistoryIcon size={28} color="#fcd34d" />
            </div>
            <div>
              <div style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Holding Period</div>
              <div style={{ color: '#f8fafc', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                <JargonTooltip term="LTCG">Long-Term (LTCG)</JargonTooltip>
              </div>
            </div>
          </div>
          <div style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}>
            <p style={{ color: '#e2e8f0', fontSize: '1.1rem', lineHeight: 1.8, margin: 0, fontWeight: 500 }}>{taxInfo.ltcg}</p>
          </div>
        </div>
        <div className="tax-cg-card" style={{ borderTop: '1px solid rgba(244, 63, 94, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.2), rgba(244, 63, 94, 0.05))', borderRadius: '16px', border: '1px solid rgba(244, 63, 94, 0.3)', boxShadow: '0 12px 24px -8px rgba(244, 63, 94, 0.2)' }}>
               <Zap size={28} color="#fda4af" />
            </div>
            <div>
              <div style={{ color: '#fb7185', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Holding Period</div>
              <div style={{ color: '#f8fafc', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                <JargonTooltip term="STCG">Short-Term (STCG)</JargonTooltip>
              </div>
            </div>
          </div>
          <div style={{ padding: '24px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}>
            <p style={{ color: '#e2e8f0', fontSize: '1.1rem', lineHeight: 1.8, margin: 0, fontWeight: 500 }}>{taxInfo.stcg}</p>
          </div>
        </div>
      </div>

      {taxInfo.specialNote && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '16px 20px', borderRadius: 14, marginTop: 20,
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.05), rgba(139, 92, 246, 0.04))',
          border: '1px solid rgba(56, 189, 248, 0.12)',
        }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: '#38bdf8' }} />
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Tax Intelligence</div>
            <p style={{ color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>{taxInfo.specialNote}</p>
          </div>
        </div>
      )}

      {/* Interactive Post-Tax Net Yield Simulator */}
      <InteractiveTaxSimulator inv={inv} />
    </div>
  );
};

const InteractiveTaxSimulator = ({ inv }) => {
  const [selectedSlab, setSelectedSlab] = React.useState(30);
  const nominalReturn = Number(inv?.expectedReturn || inv?.rate || 8);
  const name = (inv?.name || '').toLowerCase();
  const cat = (inv?.category || '').toLowerCase();

  const isEEE = taxInfoIsEEE(name, cat, inv);
  const isEquity = cat.includes('equity') || cat.includes('etf') || name.includes('etf') || name.includes('fund');

  let effectiveTaxRate = isEEE ? 0 : isEquity ? 12.5 : selectedSlab;
  let taxDeductedAmount = Math.round(100000 * (nominalReturn / 100) * (effectiveTaxRate / 100));
  let netPostTaxReturnAmount = Math.round(100000 * (nominalReturn / 100)) - taxDeductedAmount;
  let netPostTaxRate = (nominalReturn * (1 - effectiveTaxRate / 100)).toFixed(2);

  return (
    <div style={{
      marginTop: '2rem',
      padding: '20px',
      background: 'rgba(15, 23, 42, 0.8)',
      border: '1px solid rgba(139, 92, 246, 0.3)',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={20} color="#a855f7" />
          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1rem', fontWeight: 800 }}>
            Interactive Post-Tax Net Yield Simulator (₹1,00,000 Invested)
          </h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Income Tax Slab:</span>
          {[5, 15, 20, 30].map(slab => (
            <button
              key={slab}
              onClick={() => setSelectedSlab(slab)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: selectedSlab === slab ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.1)',
                background: selectedSlab === slab ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.04)',
                color: selectedSlab === slab ? '#e9d5ff' : '#94a3b8',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {slab}%
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Gross Annual Growth</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
            ₹{Math.round(100000 * (nominalReturn / 100)).toLocaleString('en-IN')} ({nominalReturn}%)
          </div>
        </div>
        <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
          <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>Estimated Tax Liability</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f87171', marginTop: 4 }}>
            - ₹{taxDeductedAmount.toLocaleString('en-IN')} ({effectiveTaxRate}%)
          </div>
        </div>
        <div style={{ padding: '14px', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '10px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
          <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}>Net In-Hand Profit</span>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80', marginTop: 4 }}>
            ₹{netPostTaxReturnAmount.toLocaleString('en-IN')} ({netPostTaxRate}% Net)
          </div>
        </div>
      </div>
    </div>
  );
};

function taxInfoIsEEE(name, cat, inv) {
  return (
    name.includes('ppf') ||
    name.includes('sukanya') ||
    name.includes('ssy') ||
    (name.includes('sgb') && !name.includes('secondary')) ||
    inv?.taxType === 'eee' ||
    inv?.tax_free_interest
  );
}

export default TaxTab;
