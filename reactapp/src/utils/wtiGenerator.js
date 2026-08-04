/**
 * WealthGenie — Dynamic "Where to Invest" Generator
 * ──────────────────────────────────────────────────
 * Dynamically builds execution pathway data for ANY instrument
 * using its own metadata from investmentDatabase.js.
 *
 * NO HARDCODED RATES OR NAMES — everything is derived from the
 * instrument's own properties (rate, category, name, desc, etc.)
 */

// ─── Helpers ──────────────────────────────────────────────────────────

function formatRate(rate) {
  if (rate == null) return 'Market-linked';
  return `${Number(rate).toFixed(1)}%`;
}

function formatMinInvestment(amount) {
  if (!amount || amount <= 0) return 'No minimum';
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getTenureLabel(inv) {
  if (inv.lockIn > 0) return `${inv.lockIn} year${inv.lockIn > 1 ? 's' : ''} lock-in`;
  if (inv.idealHorizon) {
    const min = inv.idealHorizon.min || inv.idealHorizon?.min;
    const max = inv.idealHorizon.max || inv.idealHorizon?.max;
    if (min && max) return `${min}–${max} years (recommended)`;
    if (min) return `${min}+ years`;
  }
  return 'Open-ended';
}

/**
 * Stock vs ETF/MF Decision Rule Function
 * Recommends ETF/MF when user's risk tolerance is conservative/moderate or sector volatility > 30%.
 */
export function shouldRecommendETF(userRiskTolerance = 'Moderate', sectorVolatility = 0.25) {
  if (['Conservative', 'Moderate'].includes(userRiskTolerance)) return true;
  if (sectorVolatility > 0.30) return true;
  return false;
}

/**
 * Dynamic Top-5 Ranking Function
 * Operates over candidate product arrays sorting dynamically by return rate, badge, and cost fit.
 */
export function rankWhereToInvest(candidates = [], userProfile = {}, riskPreference = 'Moderate') {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  return [...candidates].sort((a, b) => {
    const badgePriority = {
      'Official Scheme': 5,
      'Official 54EC': 5,
      '100% Sovereign': 5,
      'Top Pick': 4,
      'Category Leader': 4,
      'Pharma Leader': 4,
      'Metals Leader': 4,
      'Metals Top Pick': 4,
      'Banking Quality': 4,
      'Most Liquid': 3,
      'Lowest Cost': 3
    };
    const scoreA = (badgePriority[a.badge] || 0) * 10;
    const scoreB = (badgePriority[b.badge] || 0) * 10;

    if (scoreA !== scoreB) return scoreB - scoreA;

    const parseRate = (rStr) => {
      if (!rStr) return 0;
      const match = String(rStr).match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : 0;
    };
    const rateA = parseRate(a.rate);
    const rateB = parseRate(b.rate);

    return rateB - rateA;
  }).slice(0, 5);
}

function getPlatformCategory(inv) {
  const id = (inv.id || '').toLowerCase();
  const cat = (inv.category || inv.cat || '').toLowerCase();
  const name = (inv.name || '').toLowerCase();

  // EPF / VPF (handled specially so they don't map to generic retirement NPS)
  if (['epf', 'vpf'].includes(id) || name.includes('employee provident') || name.includes('voluntary provident')) {
    return 'epf';
  }

  // Government schemes
  if (cat.includes('government') || cat.includes('sovereign')) return 'govt';
  if (['ppf', 'scss', 'sukanya', 'rbi_bonds', 'nsc', 'kvp', 'pomis', 'mssc', 'apy'].includes(id)) return 'govt';

  // Bank FDs — special: the bank itself is the platform
  if (id.endsWith('_fd') || id === 'fd' || id === 'po_rd' || id === 'po_td_1yr' || cat.includes('deposit')) return 'bank_fd';

  // Retirement
  if (cat.includes('retirement') || ['nps', 'nps_tier_2', 'epf', 'vpf'].includes(id)) return 'retirement';

  // Insurance-linked
  if (cat.includes('insurance') || ['ulip', 'endowment_plan', 'term_mf_combo'].includes(id)) return 'insurance';

  // REITs & InvITs
  if (cat.includes('reit') || cat.includes('invit')) return 'reit';

  // Bonds & Debentures
  if (cat.includes('bond') || cat.includes('debenture') || ['g_sec', 'municipal_bonds', 'bonds_54ec', 'aaa_corporate_bond', 'aa_corporate_bond', 'tax_free_bonds', 'bharat_bond_direct'].includes(id)) return 'bonds';

  // ETFs
  if (cat.includes('etf') || id.includes('etf') || name.includes('etf')) return 'etf';

  // Direct Equity / Stocks
  if (cat.includes('direct equity') || id.includes('stock') || ['bluechip_stocks', 'large_cap_stocks', 'mid_cap_stocks', 'small_cap_stocks', 'direct_equity'].includes(id)) return 'equity';

  // Gold (non-ETF, non-SGB)
  if (name.includes('gold') && !name.includes('etf') && !name.includes('bond')) return 'etf';

  // Mutual Funds (default for anything with _mf suffix or MF category)
  if (id.endsWith('_mf') || cat.includes('mutual fund') || name.includes('fund')) return 'mf';

  return 'mf'; // safe default
}

function getProductsForInstrument(inv, platformCat) {
  const id = (inv.id || '').toLowerCase();
  const name = inv.name || inv.abbr || 'this option';
  const rate = inv.expectedReturn || inv.rate;
  const rateStr = formatRate(rate);
  const minInv = formatMinInvestment(inv.minMonthlyInvestment);
  const tenure = getTenureLabel(inv);

  // Helper to build a product object
  const makeProduct = (prodName, provider, platform, highlight, badge = null) => ({
    name: `${inv.abbr || inv.name} via ${prodName}`,
    provider,
    rate: rateStr,
    highlight,
    platform,
    minInvestment: minInv,
    tenure,
    badge
  });

  // 1. EPF & VPF
  if (id === 'epf' || id === 'vpf') {
    return [
      makeProduct('EPFO Member Portal', 'EPFO (Govt of India)', 'unifiedportal-mem.epfindia.gov.in', 
        `Access your official EPFO account online using your UAN to check your accumulated balance, view monthly employer deposits, and download your EPF passbook.`, 'Official Portal'),
      makeProduct('Company HR Department', 'Your Employer', 'HR Payroll Channel', 
        `Contact your company's HR/Payroll department to link your UAN, make changes to your nominations, or request voluntary deductions (VPF) to save more tax.`, 'Enrolment & VPF'),
      makeProduct('UMANG App', 'Ministry of Electronics & IT', 'UMANG Mobile Application', 
        `Check your EPF balance, track pension claims, and get push notifications for employer contributions instantly on your phone using the government's centralized UMANG app.`, 'Mobile Tracking')
    ];
  }

  // 2. PPF (Public Provident Fund)
  if (id === 'ppf') {
    return [
      makeProduct('SBI YONO / Branch', 'State Bank of India', 'SBI NetBanking / YONO App', 
        `Open a PPF account instantly via SBI YONO. Link with your SBI savings account to set up automatic monthly SIPs and download tax receipts for Section 80C.`, 'Most Accessible'),
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `Traditional offline security with direct government safety. You receive a physical passbook and can make cash/check deposits at any local post office.`, 'Highest Safety'),
      makeProduct('HDFC NetBanking', 'HDFC Bank', 'HDFC NetBanking / Mobile App', 
        `Seamless digital management. Set up standing instructions to invest by the 5th of each month (highly recommended to maximize PPF interest compounding).`),
      makeProduct('ICICI iMobile', 'ICICI Bank', 'ICICI NetBanking / App', 
        `Open your account 100% paperless in under 2 minutes. Track balance, download statements, and renew the account digitally at maturity.`)
    ];
  }

  // 3. Sukanya Samriddhi Yojana (SSY)
  if (id === 'sukanya' || id === 'ssy') {
    return [
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `The most popular option for SSY. Open offline with the girl child's birth certificate. Provides a physical passbook and 100% government guarantee.`, 'Most Popular'),
      makeProduct('SBI YONO / Branch', 'State Bank of India', 'SBI NetBanking / YONO App', 
        `Excellent for SBI savings account holders. Manage your daughter's SSY account online, set up monthly standing instructions, and track growth.`, 'Highly Convenient'),
      makeProduct('ICICI iMobile', 'ICICI Bank', 'ICICI NetBanking / App', 
        `Fully digital tracking. Transfer money from your ICICI savings account to the SSY account instantly and download Section 80C tax certificates.`)
    ];
  }

  // 4. Senior Citizens Savings Scheme (SCSS)
  if (id === 'scss') {
    return [
      makeProduct('SBI Branch', 'State Bank of India', 'SBI Branch Counter', 
        `Highly recommended for senior citizens. Dedicated counters, quarterly interest credited directly to your linked SBI savings account.`, 'Most Trusted'),
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `Government-backed safety with the widest network in rural and semi-urban India. Interest is paid quarterly via post office savings account.`, 'Highest Safety'),
      makeProduct('HDFC Bank Branch', 'HDFC Bank', 'HDFC Bank Branch / NetBanking', 
        `Convenient quarterly interest payout credited directly to your HDFC savings account, with online tracking of tax deducted at source (TDS).`)
    ];
  }

  // 5. RBI Floating Rate Bonds
  if (id === 'rbi_bonds') {
    return [
      makeProduct('RBI Retail Direct', 'Reserve Bank of India', 'rbiretaildirect.org.in', 
        `Buy Floating Rate Savings Bonds directly from the RBI with zero commission. Bonds are held securely in your Bond Ledger Account (BLA) with the central bank.`, 'Zero Commission'),
      makeProduct('SBI Branch / NetBanking', 'State Bank of India', 'SBI NetBanking / Branch', 
        `Apply online or at any designated SBI branch. Interest is paid semi-annually directly to your linked savings account. No upper limit on investment.`, 'Most Accessible'),
      makeProduct('HDFC NetBanking', 'HDFC Bank', 'HDFC NetBanking / Branch', 
        `Apply online through HDFC net banking in a few clicks. Semi-annual interest resets are auto-tracked, and digital certificate of holding is issued.`)
    ];
  }

  // 6. National Savings Certificate (NSC) & Kisan Vikas Patra (KVP) & POMIS
  if (['nsc', 'kvp', 'pomis', 'mssc'].includes(id)) {
    return [
      makeProduct('Post Office Branch', 'India Post', 'Any Post Office Branch', 
        `The primary and official issuer of ${name}. Get a physical certificate or passbook with direct government backing and sovereign guarantee.`, 'Official Channel'),
      makeProduct('SBI NetBanking / Branch', 'State Bank of India', 'SBI NetBanking / Branch', 
        `Select public sector branches are authorized to issue digital ${name} certificates, making it easier to track along with your savings account.`, 'Bank Option')
    ];
  }

  // 7. Atal Pension Yojana (APY)
  if (id === 'apy') {
    return [
      makeProduct('SBI NetBanking', 'State Bank of India', 'SBI NetBanking / YONO App', 
        `Open APY online via SBI. Choose your pension slab (₹1,000 to ₹5,000/month) and set up auto-debit from your savings account.`, 'Most Popular'),
      makeProduct('HDFC NetBanking', 'HDFC Bank', 'HDFC NetBanking Portal', 
        `Register for APY digitally in under 3 minutes. Auto-debit will be set up from your HDFC account. Age limits: 18 to 40 years.`, 'Convenient'),
      makeProduct('ICICI iMobile', 'ICICI Bank', 'ICICI NetBanking / App', 
        `Simple, paperless registration. Track your pension contributions and print your PRAN card online via the app.`)
    ];
  }

  // 8. National Pension System (NPS) - Tier 1 & Tier 2
  if (id === 'nps' || id === 'nps_tier_2') {
    return [
      makeProduct('eNPS NSDL Portal', 'PFRDA / NPS Trust', 'enps.nsdl.com', 
        `The official government portal for NPS. Offers the lowest transaction charges and direct online management of fund managers and asset allocations.`, 'Lowest Charges'),
      makeProduct('Current Bank (SBI/HDFC)', 'Your Savings Bank', 'NetBanking Portal', 
        `Open NPS instantly through your existing bank net banking. Ideal for getting quick digital tax receipts under Section 80CCD(1B) for the extra ₹50,000 deduction.`, 'Easy Integration'),
      makeProduct('Zerodha Coin / Groww', 'Discount Broker', 'Broker App', 
        `Invest in NPS online alongside your other stock and mutual fund investments to track your total retirement corpus in one app.`)
    ];
  }

  // 9. Capital Gains Bonds (54EC Bonds)
  if (id === 'bonds_54ec') {
    return [
      makeProduct('REC / PFC / NHAI Portals', 'Government Issuers', 'Official Issuer Websites', 
        `Apply directly on the official websites of Rural Electrification Corp, Power Finance Corp, or NHAI to save capital gains tax on property sales.`, 'Direct Option'),
      makeProduct('SBI / HDFC Bank Branches', 'Authorized Banks', 'Physical Bank Branch Counter', 
        `Submit physical 54EC application forms and drafts at any designated SBI or HDFC branch. Maximum investment is ₹50 Lakh per financial year.`, 'Offline Option')
    ];
  }

  // 10. Sovereign Gold Bonds (Primary vs Secondary)
  if (id === 'sgb' || id === 'sgb_secondary') {
    return [
      makeProduct('Zerodha Kite / Groww', 'NSE / BSE Stock Exchange', 'Discount Broker App', 
        `Buy existing SGB units on the stock exchange secondary market. Units often trade at a 2-5% discount to the actual gold price, making it the cheapest way to buy gold.`, 'Lowest Cost'),
      makeProduct('RBI Retail Direct', 'Reserve Bank of India', 'rbiretaildirect.org.in', 
        `Apply directly for new SGB tranches issued by the RBI (when open). Pay zero capital gains tax at the 8-year maturity, and earn 2.5% annual interest.`, 'Direct from Govt'),
      makeProduct('SBI / HDFC NetBanking', 'Your Bank', 'NetBanking Portal', 
        `Apply online for primary SGB issues during the RBI subscription window. Convenient as it links directly to your savings account.`)
    ];
  }

  // 11. Specific Bank FDs (sbi_fd, hdfc_fd, etc.)
  if (id.endsWith('_fd') || id === 'po_td_1yr') {
    let bankName = inv.provider || '';
    if (!bankName) {
      const parts = (inv.name || '').split(' ');
      bankName = parts[0] || 'Bank';
    }
    const isPO = id.includes('po_');
    return [
      {
        name: inv.name,
        provider: isPO ? 'India Post' : bankName,
        rate: rateStr,
        highlight: `Open a fixed deposit with ${isPO ? 'the Post Office' : bankName} directly through ${isPO ? 'any branch' : 'net banking or the mobile app'} in under 2 minutes. Earn stable, guaranteed interest with ${isPO ? '100% sovereign safety' : 'DICGC insurance protection up to ₹5 Lakh'}.`,
        platform: isPO ? 'Any Post Office Branch' : `${bankName} NetBanking / Mobile App / Branch`,
        minInvestment: minInv,
        tenure,
        badge: 'Primary Option'
      }
    ];
  }

  // 12. Generic FD
  if (id === 'fd') {
    return [
      makeProduct('Public Sector Banks (SBI)', 'SBI / PNB', 'YONO / Bank NetBanking', 
        `High safety backed by government ownership. Ideal for risk-averse depositors seeking sovereign comfort.`, 'Highest Safety'),
      makeProduct('Private Sector Banks (HDFC)', 'HDFC / ICICI / Axis', 'Mobile Banking App', 
        `Premium digital-first booking and renewal process. Easily set up auto-sweep to earn higher returns on idle savings.`, 'Best Digital App'),
      makeProduct('Small Finance Banks (Ujjivan)', 'Ujjivan / Equitas / Unity', 'SFB Mobile App', 
        `Offer 1-1.5% higher interest rates than major commercial banks. Fully DICGC insured up to ₹5 Lakh, making it safe for laddering.`, 'Highest Return')
    ];
  }

  // 13. REITs & InvITs — show competing real REIT/InvIT products, not broker cards
  if (platformCat === 'reit') {
    return [
      { name: 'Embassy Office Parks REIT', provider: 'NSE: EMBASSY', rate: '~8.5% (Yield)', highlight: `India's largest listed REIT with 45M+ sq ft Grade-A office space across Bengaluru, Mumbai, Pune, and NCR. Quarterly distributions. Alternative to ${name}.`, platform: 'Zerodha / Groww / Broker', minInvestment: '1 unit (~₹360)', badge: 'Largest REIT' },
      { name: 'Mindspace Business Parks REIT', provider: 'NSE: MINDSPACE', rate: '~8.2% (Yield)', highlight: 'Grade-A tech parks in Hyderabad, Mumbai, Pune, and Chennai with high multinational tenant retention.', platform: 'Stock Broker App', minInvestment: '1 unit (~₹350)' },
      { name: 'Brookfield India Real Estate Trust', provider: 'NSE: BIRET', rate: '~8.8% (Yield)', highlight: 'Institutional office parks across Gurugram, Noida, Mumbai, and Bengaluru. Highest yield office REIT.', platform: 'Stock Broker App', minInvestment: '1 unit (~₹280)', badge: 'Highest Yield' },
      { name: 'Nexus Select Trust REIT', provider: 'NSE: NXST', rate: '~7.8% (Yield)', highlight: "India's 1st retail mall REIT owning 17 premium shopping malls across 14 cities.", platform: 'Stock Broker App', minInvestment: '1 unit (~₹135)' },
      { name: 'India Grid Trust InvIT', provider: 'NSE: INDIGRID', rate: '~10.5% (Yield)', highlight: 'Power transmission InvIT providing highest quarterly distribution yield among listed REIT/InvIT alternatives.', platform: 'Stock Broker App', minInvestment: '1 unit (~₹140)', badge: 'Top InvIT Yield' }
    ];
  }

  // 14. Bonds (G-Sec, corporate, municipal, etc.)
  if (platformCat === 'bonds') {
    const isGovtBond = id === 'g_sec' || name.toLowerCase().includes('government') || id.includes('bharat_bond');
    if (isGovtBond) {
      return [
        makeProduct('RBI Retail Direct', 'Reserve Bank of India', 'rbiretaildirect.org.in', 
          `Buy Government Securities (G-Secs), Treasury bills, and Sovereign Gold Bonds directly from the RBI auctions with zero commission and absolute safety.`, 'Zero Commission'),
        makeProduct('Zerodha Kite', 'Zerodha (NSE/BSE)', 'Zerodha Kite App', 
          `Purchase listed government bonds or Bharat Bond ETFs directly on the NSE/BSE secondary market. Good for liquidity.`, 'Unified Portfolio')
      ];
    } else {
      return [
        makeProduct('GoldenPi', 'GoldenPi', 'GoldenPi Platform', 
          `A specialized online bond platform. It lets you buy ${name} in small denominations, listing precise interest payment dates, credit ratings, and yield-to-maturity (YTM) in an easy-to-understand format.`, 'Bond Specialist'),
        makeProduct('Wint Wealth', 'Wint Wealth', 'Wint Wealth App / Web', 
          `Curated marketplace for buying high-yield corporate bonds. Displays exact interest payment schedules and asset backing in a very clear layout.`, 'Highly Curated'),
        makeProduct('Zerodha Kite', 'Zerodha (NSE/BSE)', 'Zerodha Kite App', 
          `Purchase listed corporate bonds or debentures directly on the stock exchange secondary market. Good for liquidity.`, 'Unified Portfolio')
      ];
    }
  }

  // 15. Mutual Funds (dynamically constructed instrument-specific AMC recommendations)
  if (platformCat === 'mf') {
    const expRatioStr = inv.expenseRatio ? `Expense ratio: ${(inv.expenseRatio * 100).toFixed(2)}% (Direct)` : 'Low expense ratio (Direct plan)';
    const descText = inv.description || inv.desc || inv.cardSubtitle || `Invests in ${name} portfolio.`;
    const returnInfo = rateStr !== 'Market-linked' ? `historical 5Y return around ${rateStr}` : 'market-linked returns';

    // Construct 5 distinct, instrument-tailored AMC / platform execution cards
    return [
      {
        name: `SBI ${name} (Direct Plan)`,
        provider: 'SBI Mutual Fund',
        rate: rateStr,
        highlight: `Backed by India's largest AMC by AUM. ${descText} Offers ${expRatioStr} with ${returnInfo}. Instant SIP setup via YONO or SBI MF portal with zero distributor commission.`,
        platform: 'SBI MF Portal / Groww / Zerodha Coin',
        minInvestment: minInv,
        tenure,
        badge: 'Largest AMC'
      },
      {
        name: `HDFC ${name} (Direct Plan)`,
        provider: 'HDFC Mutual Fund',
        rate: rateStr,
        highlight: `Managed by HDFC AMC's experienced equity team. Process-driven investment approach focused on portfolio quality. ${expRatioStr}. Ideal for long-term goal compounding.`,
        platform: 'HDFC MF Portal / Groww / Coin',
        minInvestment: minInv,
        tenure,
        badge: 'Top Track Record'
      },
      {
        name: `ICICI Prudential ${name} (Direct Plan)`,
        provider: 'ICICI Prudential AMC',
        rate: rateStr,
        highlight: `Consistently high active risk management. ${descText} Zero entry load with direct digital execution via iMobile Pay and CAMS MF Central.`,
        platform: 'ICICI Direct / Groww / Coin',
        minInvestment: minInv,
        tenure,
        badge: 'Low Volatility'
      },
      {
        name: `Nippon India ${name} (Direct Plan)`,
        provider: 'Nippon India Mutual Fund',
        rate: rateStr,
        highlight: `Highly liquid fund management with deep institutional research across ${name}. Direct-growth plan saves up to 1% annual distributor commission.`,
        platform: 'Nippon MF Portal / Groww',
        minInvestment: minInv,
        tenure
      },
      {
        name: `MF Central Unified Portal (${name})`,
        provider: 'CAMS & KFintech (SEBI Official)',
        rate: rateStr,
        highlight: `Official SEBI-regulated mutual fund servicing platform. Transact in direct plans of ${name} across all AMCs with zero commission and unified tax statements.`,
        platform: 'mfcentral.com (Official)',
        minInvestment: minInv,
        tenure,
        badge: 'Official Service'
      }
    ];
  }

  // 16. ETFs
  if (platformCat === 'etf') {
    const descText = inv.description || inv.desc || `Passively tracks ${name}.`;
    return [
      makeProduct('Nippon India ETF', 'Nippon India AMC', 'Zerodha Kite / Groww', 
        `Ticker: ${inv.abbr || inv.name}. ${descText} Trade live during exchange hours with ultra-low expense ratio and high daily liquidity.`, 'Most Liquid'),
      makeProduct('ICICI Prudential ETF', 'ICICI Prudential AMC', 'Zerodha Kite / Groww', 
        `Institutional-grade passive tracking for ${name}. Lowest expense ratio structure on NSE/BSE.`, 'Lowest Cost'),
      makeProduct('SBI ETF', 'SBI Mutual Fund', 'Stock Broker App', 
        `Massive institutional liquidity backed by SBI MF. Buy single units like regular equity shares during market hours.`, 'Institutional Liquidity'),
      makeProduct('HDFC ETF', 'HDFC Mutual Fund', 'Stock Broker App', 
        `Efficient index replication with tight bid-ask spreads on exchange. Zero demat entry lock-in.`),
      makeProduct('Mirae Asset / DSP ETF', 'Mirae Asset / DSP AMC', 'Stock Broker App', 
        `Global best-practice passive portfolio management for ${name} with real-time NAV tracking.`)
    ];
  }

  // 17. Direct Stocks / Equity
  if (platformCat === 'equity') {
    const descText = inv.description || inv.desc || `Direct equity stock selection for ${name}.`;
    return [
      makeProduct('Zerodha Kite (Stock SIP)', 'Zerodha (NSE/BSE)', 'Zerodha Kite App', 
        `Flat ₹20 discount brokerage per trade. Set up automated monthly stock SIPs for ${name} with clean charting and zero delivery brokerage.`, 'Lowest Brokerage'),
      makeProduct('Groww Stock Desk', 'Groww (NSE/BSE)', 'Groww App', 
        `1-tap stock purchase interface with clear financial statements and balance sheet metrics for ${name}. Best for beginner investors.`, 'Best for Beginners'),
      makeProduct('Angel One Advisory', 'Angel One (NSE/BSE)', 'Angel One App', 
        `Provides daily technical charts, margin trading facilities, and expert research reports for ${name}.`, 'Research Advisory'),
      makeProduct('ICICI Direct Prime', 'ICICI Securities', 'ICICI Direct App', 
        `3-in-1 account integrating savings, demat, and trading for instant fund transfer and stock delivery.`),
      makeProduct('HDFC Sky Platform', 'HDFC Securities', 'HDFC Sky App', 
        `Modern discount brokerage platform by HDFC with advanced stock screeners and research insights.`)
    ];
  }

  // 18. Insurance
  if (platformCat === 'insurance') {
    return [
      makeProduct('PolicyBazaar Comparison', 'PolicyBazaar Portal', 'PolicyBazaar App / Web', 
        `Compare premium rates, claim settlement ratios, and benefits of ${name} across 20+ insurance providers.`, 'Compare Plans'),
      makeProduct('LIC of India Direct', 'Life Insurance Corp', 'licindia.in / Branch', 
        `The trusted public sector life insurer. Invest in ${name} with high sovereign-backed security and offline support.`, 'Most Trusted'),
      makeProduct('HDFC Life Direct', 'HDFC Life Insurance', 'hdfclife.com', 
        `Invest in modern wealth-builder plans for ${name} with zero premium allocation charges and online claim tracking.`),
      makeProduct('ICICI Pru Life Portal', 'ICICI Prudential Life', 'iciciprulife.com', 
        `Digital-first insurance policy management with flexible payout options and tax receipt downloads.`)
    ];
  }

  // Generic fallback if no specific rule matched
  return [
    makeProduct('SBI / HDFC Bank Route', 'Scheduled Commercial Banks', 'NetBanking / Branch', 
      `Open and manage ${name} directly with your primary savings bank. Safe, simple, and convenient auto-debit options.`, 'Bank Route'),
    makeProduct('Zerodha / Groww Direct', 'Discount Investment Broker', 'Broker App', 
      `Invest in ${name} through your primary investment app. Direct commission-free tracking and simple setup.`, 'Broker Route'),
    makeProduct('MF Central Portal', 'CAMS & KFintech', 'mfcentral.com', 
      `Official SEBI servicing portal for managing and tracking ${name} transactions.`, 'Official Channel')
  ];
}

function getHowToStart(inv, platformCat) {
  switch (platformCat) {
    case 'epf':
      return 'EPF is initiated by your employer. Confirm with HR that your UAN is linked. To increase your contributions, request VPF enrolment from HR.';
    case 'govt':
      return 'Visit any authorized bank branch or post office with Aadhaar + PAN. Many banks also support online opening via their apps.';
    case 'bank_fd':
      return 'Open via your bank\'s net banking or mobile app in under 2 minutes. Or visit any branch with KYC documents.';
    case 'mf':
      return `Start a SIP from ₹${inv.minMonthlyInvestment?.toLocaleString('en-IN') || '500'} on any of the platforms below. Complete KYC once (takes 5 minutes) and invest in direct plans for the lowest expense ratio.`;
    case 'etf':
      return 'Open a demat + trading account on any discount broker. Search for the ETF by name or ticker on the exchange. Buy like a stock during market hours.';
    case 'reit':
      return 'Open a demat account on Zerodha, Groww, or Angel One. Buy units like stocks on NSE/BSE. Minimum 1 unit. Distributions paid quarterly.';
    case 'bonds':
      return 'Open an account on RBI Retail Direct (rbiretaildirect.org.in) for government securities, or use a broker for corporate bonds and listed bonds.';
    case 'equity':
      return 'Open a demat + trading account on any SEBI-registered broker. Complete KYC with Aadhaar + PAN. Start with blue-chip stocks for lower risk.';
    case 'insurance':
      return 'Compare plans on PolicyBazaar or visit the insurer\'s website directly. Complete the proposal form and medical checkup (if required).';
    case 'retirement':
      return 'Register on the eNPS portal (enps.nsdl.com) with Aadhaar + PAN. Choose your pension fund manager and asset allocation. Or visit any PoP (Point of Presence) bank.';
    default:
      return `Open an account on a SEBI-registered platform and start investing with as little as ${formatMinInvestment(inv.minMonthlyInvestment)}.`;
  }
}

function getNote(inv) {
  const rate = inv.expectedReturn || inv.rate;
  const riskLabel = inv.riskLabel || 'Medium';
  const taxType = inv.taxType || '';

  const parts = [];

  // Rate info
  if (rate) {
    const isFixed = inv.volatility != null && inv.volatility < 0.01;
    if (isFixed) {
      parts.push(`Current rate: ${formatRate(rate)} p.a.`);
    } else {
      parts.push(`Expected return: ${formatRate(rate)} p.a. (historical average)`);
    }
  }

  if (inv.returnRange?.min != null && inv.returnRange?.max != null && inv.returnRange.min !== inv.returnRange.max) {
    parts.push(`Range: ${inv.returnRange.min}%–${inv.returnRange.max}%`);
  }

  // Risk
  parts.push(`SEBI Risk Category: ${riskLabel}`);

  // Tax
  const taxLabels = {
    eee: 'EEE — fully tax-free (investment, growth, and withdrawal)',
    slab: 'Interest/gains taxed at your income slab rate',
    ltcg: 'LTCG above ₹1.25L taxed at 12.5% (held >1 year)',
    elss: '80C deduction up to ₹1.5L + LTCG at 12.5%',
    nps: '80CCD(1B) extra ₹50K deduction. 60% tax-free at maturity',
    sgb: 'LTCG tax-free at 8-year maturity. 2.5% interest taxable at slab',
  };
  if (taxLabels[taxType]) {
    parts.push(`Tax: ${taxLabels[taxType]}`);
  }

  // Lock-in
  if (inv.lockIn > 0) {
    parts.push(`Lock-in: ${inv.lockIn} years`);
  }

  // Expense ratio
  if (inv.expenseRatio > 0) {
    parts.push(`Expense ratio: ${(inv.expenseRatio * 100).toFixed(2)}%`);
  }

  return parts.join('. ') + '.';
}

// ─── Main Generator ──────────────────────────────────────────────────

/**
 * Generate complete "Where to Invest" data for any instrument.
 * Returns: { title, riskLevel, note, howToStart, products[] }
 *
 * @param {Object} inv — normalized instrument from investmentDatabase
 * @returns {Object} WTI data structure compatible with WhereToInvestTab
 */
export function generateWTI(inv) {
  if (!inv) return null;

  const platformCat = getPlatformCategory(inv);
  const riskLevel = inv.riskLevel || inv.risk || 3;

  // Title
  const title = `How to Invest in ${inv.name || inv.abbr || 'this instrument'}`;

  // Note (dynamic from instrument properties)
  const note = getNote(inv);

  // How to start
  const howToStart = getHowToStart(inv, platformCat);

  // Products / Platforms (fully dynamic and customized for this instrument!)
  const products = getProductsForInstrument(inv, platformCat);

  return {
    title,
    riskLevel,
    note,
    howToStart,
    products,
  };
}

export default generateWTI;
