import { describe, it, expect } from 'vitest';
import { generateWTI, rankWhereToInvest, shouldRecommendETF } from '../wtiGenerator';
import WHERE_TO_INVEST from '../../whereToInvest';

describe('WTI Generator & Dynamic Ranking Engine v2', () => {
  it('1. rankWhereToInvest orders candidates dynamically by badge priority and return rate', () => {
    const candidates = [
      { name: 'Standard Candidate', rate: '10.0%', badge: null },
      { name: 'Official Scheme Candidate', rate: '5.25%', badge: 'Official Scheme' },
      { name: 'Top Pick Candidate', rate: '24.0%', badge: 'Top Pick' }
    ];

    const ranked = rankWhereToInvest(candidates);

    expect(ranked[0].name).toBe('Official Scheme Candidate');
    expect(ranked[1].name).toBe('Top Pick Candidate');
    expect(ranked[2].name).toBe('Standard Candidate');
  });

  it('2. rankWhereToInvest adapts to Conservative vs Aggressive profiles dynamically', () => {
    const options = [
      { name: 'Quant Small Cap Fund', rate: '22.5%', badge: 'Highest Returns', highlight: 'high volatility momentum small cap' },
      { name: 'RBI Floating Rate Savings Bonds', rate: '8.05%', badge: '100% Sovereign', highlight: 'sovereign guarantee zero credit risk' }
    ];

    const conservativeRanked = rankWhereToInvest(options, { risk_tolerance: 'Conservative' });
    expect(conservativeRanked[0].name).toContain('RBI Floating Rate');

    const aggressiveRanked = rankWhereToInvest(options, { risk_tolerance: 'Aggressive' });
    expect(aggressiveRanked[0].name).toContain('Quant Small Cap');
  });

  it('3. rankWhereToInvest boosts Senior Citizen options and attaches match tags', () => {
    const options = [
      { name: 'Senior Citizen Savings Scheme (SCSS)', rate: '8.2%', badge: 'Most Trusted', highlight: 'quarterly interest payout' },
      { name: 'Motilal Oswal Midcap Fund', rate: '24.5%', badge: 'Top Pick', highlight: 'high volatility equity' }
    ];

    const seniorRanked = rankWhereToInvest(options, { age: 65, risk_tolerance: 'Conservative' });
    expect(seniorRanked[0].name).toContain('Senior Citizen');
    expect(seniorRanked[0].profileMatchTag).toBe('Senior Citizen Fit');
  });

  it('4. shouldRecommendETF handles risk, sector volatility, age, and budget conditions', () => {
    expect(shouldRecommendETF('Moderate', 0.25)).toBe(true);
    expect(shouldRecommendETF('Conservative', 0.15)).toBe(true);
    expect(shouldRecommendETF('Aggressive', 0.35)).toBe(true);
    expect(shouldRecommendETF('Aggressive', 0.20)).toBe(false);

    // Pre-retirement age rule
    expect(shouldRecommendETF('Aggressive', 0.20, { age: 58 })).toBe(true);
    // Young small budget rule
    expect(shouldRecommendETF('Aggressive', 0.20, { age: 24, monthly_savings: 3000 })).toBe(true);
  });

  it('5. generateWTI returns distinct, customized wti objects for different instrument categories', () => {
    const pharmaWti = generateWTI({ id: 'pharma_sector_mf', name: 'Pharma Sector Fund', cat: 'Equity' });
    const bondWti = generateWTI({ id: 'rbi_bonds', name: 'RBI Floating Rate Bonds', cat: 'Bonds' });

    expect(pharmaWti.title).toContain('Pharma Sector Fund');
    expect(bondWti.title).toContain('RBI Floating Rate Bonds');
    expect(pharmaWti.products[0].highlight).not.toEqual(bondWti.products[0].highlight);
  });

  it('6. WHERE_TO_INVEST database contains subCategories for midcap_mf, smallcap_mf, direct_equity, bonds, and etf', () => {
    expect(WHERE_TO_INVEST.midcap_mf.subCategories).toBeDefined();
    expect(Object.keys(WHERE_TO_INVEST.midcap_mf.subCategories)).toEqual(
      expect.arrayContaining(['growth_momentum', 'diversified_core', 'value_quality'])
    );

    expect(WHERE_TO_INVEST.smallcap_mf.subCategories).toBeDefined();
    expect(Object.keys(WHERE_TO_INVEST.smallcap_mf.subCategories)).toEqual(
      expect.arrayContaining(['aggressive_alpha', 'diversified_broad', 'quality_defensive'])
    );

    expect(WHERE_TO_INVEST.direct_equity.subCategories).toBeDefined();
    expect(Object.keys(WHERE_TO_INVEST.direct_equity.subCategories)).toEqual(
      expect.arrayContaining(['banking_financial', 'it_technology', 'energy_industrial', 'fmcg_consumer', 'pharma_healthcare'])
    );
  });

  it('7. rankWhereToInvest supports regimeApplied tactical tilt and interactive sortBy modes', () => {
    const candidates = [
      { name: 'Nippon India Defence Fund', rate: '18.0%', highlight: 'defence manufacturing order books expense ratio: 0.85%', badge: 'Sector Benchmark' },
      { name: 'SBI Liquid Fund', rate: '7.0%', highlight: 'liquid fund sovereign emergency parking expense ratio: 0.16%', badge: 'Most Liquid' }
    ];

    const activeRegime = {
      title: 'Geopolitical Conflict (War Status)',
      matchingIds: ['defence_sector_mf']
    };

    // Test macro regime tilt
    const regimeRanked = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate' }, 'Moderate', { regimeApplied: true, activeRegime });
    expect(regimeRanked[0].name).toContain('Defence');
    expect(regimeRanked[0].profileMatchTag).toContain('Geopolitical');

    // Test sortBy expense ratio
    const expenseRanked = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate' }, 'Moderate', { sortBy: 'expense' });
    expect(expenseRanked[0].name).toContain('SBI Liquid Fund');
  });

  it('8. rankWhereToInvest computes exact taxSavingsNote and assigns SIP vs Lump-Sum investmentRoute', () => {
    const candidates = [
      { name: 'Public Provident Fund (PPF)', rate: '7.1%', highlight: '80C EEE status', badge: '100% Sovereign' },
      { name: 'Quant Small Cap Fund', rate: '22.5%', highlight: 'momentum small cap high volatility', badge: 'Highest Returns' }
    ];

    // Old regime: 80C note should appear
    const rankedOld = rankWhereToInvest(candidates, { tax_slab: 30, risk_tolerance: 'Moderate', taxRegime: 'old' });
    const ppfOld = rankedOld.find(i => i.name.includes('PPF'));
    expect(ppfOld.taxSavingsNote).toContain('Sec 80C');
    expect(ppfOld.taxSavingsNote).toContain('Old Regime');
    expect(ppfOld.investmentRoute).toBe('Lump-Sum Suitable');

    const smallCap = rankedOld.find(i => i.name.includes('Quant'));
    expect(smallCap.investmentRoute).toBe('Strict SIP Route');
  });

  it('9. Tax regime awareness: new regime warns that 80C is not applicable', () => {
    const candidates = [
      { name: 'Axis ELSS Tax Saver Fund', rate: '14.5%', highlight: '80C 3yr lock-in ELSS', badge: 'Category Leader' }
    ];

    const rankedNew = rankWhereToInvest(candidates, { tax_slab: 30, taxRegime: 'new', risk_tolerance: 'Moderate' });
    expect(rankedNew[0].taxSavingsNote).toContain('not applicable under New Regime');

    const rankedOld = rankWhereToInvest(candidates, { tax_slab: 30, taxRegime: 'old', risk_tolerance: 'Moderate' });
    expect(rankedOld[0].taxSavingsNote).toContain('Sec 80C');
    expect(rankedOld[0].taxSavingsNote).toContain('Old Regime');
  });

  it('10. Inflation-adjusted real return warning flags negative real returns', () => {
    const candidates = [
      { name: 'SBI FD 1 Year', rate: '6.5%', highlight: 'taxed at slab rate', badge: 'Most Trusted' }
    ];

    // 30% slab: post-tax = 6.5 * (1-0.30) = 4.55%, real = 4.55 - 6.0 = -1.45%
    const ranked = rankWhereToInvest(candidates, { tax_slab: 30, risk_tolerance: 'Moderate' });
    expect(ranked[0].realReturnWarning).toContain('negative');
    expect(ranked[0].realReturnVal).toBeLessThan(0);
  });

  it('11. Concentration penalty reduces score for already-held products', () => {
    const candidates = [
      { name: 'Parag Parikh Flexi Cap Fund', rate: '16.0%', highlight: 'flexi cap diversified', badge: 'Category Leader' },
      { name: 'HDFC Balanced Advantage Fund', rate: '12.0%', highlight: 'balanced hybrid equity', badge: 'Most Popular' }
    ];

    const withoutHoldings = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate' });
    const withHoldings = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate', existingHoldings: ['parag parikh flexi'] });

    const ppfWithout = withoutHoldings.find(i => i.name.includes('Parag'));
    const ppfWith = withHoldings.find(i => i.name.includes('Parag'));
    expect(ppfWith._score).toBeLessThan(ppfWithout._score);
  });

  it('12. Income-source fit boosts NPS for salaried and penalizes EPF for business', () => {
    const candidates = [
      { name: 'NPS Tier 1 Account', rate: '10.5%', highlight: '80CCD employer NPS pension', badge: 'Govt Sponsored' },
      { name: 'SBI Liquid Fund', rate: '7.0%', highlight: 'liquid fund emergency parking', badge: 'Most Liquid' }
    ];

    const salariedRanked = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate', incomeSource: 'salaried' });
    const npsScoreSalaried = salariedRanked.find(i => i.name.includes('NPS'))._score;

    const businessRanked = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate', incomeSource: 'business' });
    const npsScoreBusiness = businessRanked.find(i => i.name.includes('NPS'))._score;

    expect(npsScoreSalaried).toBeGreaterThan(npsScoreBusiness);
  });

  it('13. Emergency fund shortfall (<3 months) boosts liquid funds and penalizes long lock-in products', () => {
    const candidates = [
      { name: 'SBI Liquid Fund', rate: '7.0%', highlight: 'liquid fund emergency', badge: 'Most Liquid' },
      { name: 'Public Provident Fund (PPF)', rate: '7.1%', tenure: '15 years', highlight: '80C EEE', badge: '100% Sovereign' }
    ];

    const lowEmergency = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate', emergency_fund_months: 1 });
    expect(lowEmergency[0].name).toContain('Liquid');
  });

  it('14. Sharpe Ratio proxy calculation attaches sharpeRatioEst metric to equity candidates', () => {
    const candidates = [
      { name: 'Nifty 50 Index Fund', rate: '14.0%', highlight: 'nifty 50 index', badge: 'Category Leader' }
    ];

    const ranked = rankWhereToInvest(candidates, { risk_tolerance: 'Moderate' });
    expect(ranked[0].sharpeRatioEst).toBeDefined();
    expect(typeof ranked[0].sharpeRatioEst).toBe('number');
  });

  it('15. Zero generic "via Broker" product names exist in WHERE_TO_INVEST database or generated products', () => {
    const brokerViaRegex = /\bvia\s+(Zerodha|Groww|Angel One|ICICI Direct|Upstox)/i;

    // Check all curated entries in WHERE_TO_INVEST
    Object.entries(WHERE_TO_INVEST).forEach(([id, entry]) => {
      if (entry.products) {
        entry.products.forEach(p => {
          expect(p.name, `Product in ${id} has generic via broker name: ${p.name}`).not.toMatch(brokerViaRegex);
        });
      }
      if (entry.subCategories) {
        Object.values(entry.subCategories).forEach(sub => {
          if (sub.products) {
            sub.products.forEach(p => {
              expect(p.name, `Product in subCategory of ${id} has generic via broker name: ${p.name}`).not.toMatch(brokerViaRegex);
            });
          }
        });
      }
    });

    // Check generated products from generateWTI
    const sampleInstruments = [
      { id: 'gold_etf', name: 'Gold ETF', cat: 'ETF' },
      { id: 'nifty_50_index_mf', name: 'Nifty 50 Index Fund', cat: 'Mutual Fund' },
      { id: 'elss_mf', name: 'ELSS Tax Saver', cat: 'Mutual Fund' }
    ];

    sampleInstruments.forEach(inv => {
      const generated = generateWTI(inv);
      generated.products.forEach(p => {
        expect(p.name, `Generated product for ${inv.id} has generic via broker name: ${p.name}`).not.toMatch(brokerViaRegex);
      });
    });
  });
});







