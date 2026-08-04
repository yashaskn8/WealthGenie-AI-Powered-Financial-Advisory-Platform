/**
 * WealthGenie — "Where to Invest" Real Product Database
 * ──────────────────────────────────────────────────────
 * Maps each investment category to specific real-world products,
 * mutual funds, banks, or platforms where a beginner can actually invest.
 *
 * Data sourced from AMFI, SEBI, RBI, and verified financial portals.
 * Last verified: May 2026
 *
 * DISCLAIMER: Past performance does not guarantee future results.
 * All data is for educational purposes only.
 */

const WHERE_TO_INVEST = {

  // ═══════════════════ PPF ═══════════════════
  ppf: {
    title: "Where to Open PPF Account",
    riskLevel: 1,
    note: "Interest rate is fixed by the Government (currently 7.1% p.a., stable since April 2020) — same across all banks and post offices. EEE tax status: contributions (80C up to ₹1.5L), interest, and maturity are all tax-free.",
    howToStart: "Open via net banking if you already have a savings account, or visit any bank branch / post office with Aadhaar + PAN.",
    products: [
      { name: "SBI PPF Account", provider: "State Bank of India", rate: "7.1%", highlight: "India's largest bank with 22,000+ branches ensures you can manage your PPF from anywhere. Open instantly via YONO app with zero paperwork — auto-debit SIP facility available for annual contributions. Inter-branch transfer and nomination change can be done online.", platform: "SBI Branch / YONO App", minInvestment: "₹500/year", tenure: "15 years", badge: "Most Accessible" },
      { name: "HDFC Bank PPF Account", provider: "HDFC Bank", rate: "7.1%", highlight: "Industry-best digital PPF experience — set up monthly auto-debit SIP to maximize compounding (invest by 5th of each month for that month's interest). Instant balance checks and contribution history via NetBanking. Partial withdrawal after Year 7 is processed within 3 business days.", platform: "HDFC NetBanking / Branch", minInvestment: "₹500/year", tenure: "15 years" },
      { name: "ICICI Bank PPF Account", provider: "ICICI Bank", rate: "7.1%", highlight: "Quick online setup via iMobile Pay — entire account lifecycle managed digitally including extensions, partial withdrawals, and nominations. Automatic interest credit on March 31. Free quarterly e-statements for tax filing.", platform: "ICICI NetBanking / Branch", minInvestment: "₹500/year", tenure: "15 years" },
      { name: "Post Office PPF", provider: "India Post", rate: "7.1%", highlight: "Available at 1.55 lakh+ post offices — the widest physical access network in India, ideal for rural and semi-urban investors. No bank account required to open. Government-operated with sovereign guarantee. Transfer to any post office or authorized bank is free.", platform: "Any Post Office Branch", minInvestment: "₹500/year", tenure: "15 years" },
    ]
  },

  // ═══════════════════ SCSS ═══════════════════
  scss: {
    title: "Where to Open SCSS Account",
    riskLevel: 1,
    note: "Rate fixed by Government at 8.2% p.a. (Q1 FY2026-27). Quarterly interest payouts. Only for age 60+ (55-60 for VRS/superannuation retirees). Max limit: ₹30 lakh. Interest is fully taxable at slab rate. TDS if interest > ₹50,000/year.",
    howToStart: "Visit any authorized bank branch or post office with age proof, Aadhaar, PAN, and passport-size photos.",
    products: [
      { name: "SBI SCSS", provider: "State Bank of India", rate: "8.2%", highlight: "Most branches nationwide (22,000+) — ideal for senior citizens needing easy physical access. Quarterly interest payout directly credited to linked SBI savings account. Premature withdrawal allowed after 1 year with 1.5% penalty, after 2 years with 1% penalty.", platform: "SBI Branch", minInvestment: "₹1,000", tenure: "5 years", badge: "Most Trusted" },
      { name: "Post Office SCSS", provider: "India Post", rate: "8.2%", highlight: "Available at all 1.55 lakh post offices — the largest physical network for senior citizens in rural India. Government-operated with sovereign guarantee. Interest paid via ECS or post office savings account. One-time extension of 3 years available at maturity.", platform: "Post Office Branch", minInvestment: "₹1,000", tenure: "5 years" },
      { name: "HDFC Bank SCSS", provider: "HDFC Bank", rate: "8.2%", highlight: "Seamless for existing HDFC customers — quarterly interest auto-credited to your HDFC savings account. Premium branch experience with dedicated senior citizen counters at select locations. Digital tracking of interest payouts via NetBanking.", platform: "HDFC Branch", minInvestment: "₹1,000", tenure: "5 years" },
      { name: "Canara Bank SCSS", provider: "Canara Bank", rate: "8.2%", highlight: "Strong PSU bank with excellent branch density in South India (Karnataka, Kerala, Tamil Nadu). Senior citizens get priority service. Quarterly interest credit with SMS alerts. Joint account option available with spouse.", platform: "Canara Bank Branch", minInvestment: "₹1,000", tenure: "5 years" },
    ]
  },


  // ═══════════════════ SSY ═══════════════════
  sukanya: {
    title: "Where to Open Sukanya Samriddhi Account",
    riskLevel: 1,
    note: "Highest EEE return at 8.2% p.a. (Q1 FY2026-27). Only for girl child under 10 years. Max ₹1.5L/year deposit. Full EEE status: 80C deduction + tax-free interest + tax-free maturity. 21-year tenure from date of opening.",
    howToStart: "Visit any authorized bank or post office with girl child's birth certificate, parent's Aadhaar + PAN.",
    products: [
      { name: "SBI Sukanya Samriddhi", provider: "State Bank of India", rate: "8.2%", highlight: "Open online via YONO app with girl child's birth certificate. Set up auto-debit for monthly contributions to maximize compounding. Partial withdrawal (up to 50% of balance) allowed after girl turns 18 for education expenses. Account matures 21 years from opening or on girl's marriage after age 18.", platform: "SBI Branch / YONO", minInvestment: "₹250/year", tenure: "21 years", badge: "Highest EEE Rate" },
      { name: "Post Office SSY", provider: "India Post", rate: "8.2%", highlight: "Available at all 1.55 lakh post offices — ideal for families in smaller towns and rural areas. Sovereign guarantee on both principal and interest. Account transfer between post offices is free. Deposit must be made for minimum 15 years; account matures at 21 years.", platform: "Post Office Branch", minInvestment: "₹250/year", tenure: "21 years" },
      { name: "ICICI Bank SSY", provider: "ICICI Bank", rate: "8.2%", highlight: "Fully digital account management via iMobile Pay app — track contributions, view interest accrued, and download statements for tax filing. Auto-debit SIP available for systematic monthly deposits. Nomination and account details can be updated online.", platform: "ICICI Branch", minInvestment: "₹250/year", tenure: "21 years" },
    ]
  },

  // ═══════════════════ RBI BONDS ═══════════════════
  rbi_bonds: {
    title: "Where to Buy RBI Floating Rate Bonds",
    riskLevel: 1,
    note: "Currently 8.05% p.a. (Jan–Jun 2026), linked to NSC rate + 35 bps. Reset semi-annually on Jan 1 & Jul 1. Sovereign guarantee. 7-year lock-in (premature exit only for 60+ after 4 yrs). Interest is fully taxable at slab rate. No 80C benefit.",
    howToStart: "Apply through any scheduled commercial bank. No demat required. Digital application facilities expanding by Sep 2026.",
    products: [
      { name: "RBI Bond via SBI", provider: "State Bank of India", rate: "8.05%", highlight: "Apply at any of 22,000+ SBI branches — the widest distribution for RBI bonds. Interest paid semi-annually (Jan & Jul) directly to your SBI savings account. No upper investment limit. Rate resets every 6 months linked to NSC rate + 35 bps, providing inflation protection.", platform: "SBI Branch", minInvestment: "₹1,000", tenure: "7 years", badge: "Widest Access" },
      { name: "RBI Bond via HDFC Bank", provider: "HDFC Bank", rate: "8.05%", highlight: "Streamlined application process for existing HDFC customers — apply at any branch with just KYC documents. Semi-annual interest auto-credited to your HDFC savings account. Digital bond certificate issued. Premature exit allowed for senior citizens (60+ after 4 yrs, 70+ after 3 yrs, 80+ after 2 yrs).", platform: "HDFC Branch", minInvestment: "₹1,000", tenure: "7 years" },
      { name: "RBI Bond via ICICI Bank", provider: "ICICI Bank", rate: "8.05%", highlight: "Quick processing with same-day bond issuance at most ICICI branches. Interest credited to linked savings account on Jan 1 and Jul 1. Tax-compliant Form 16A provided for ITR filing. No demat account required — held in RBI's Bond Ledger Account (BLA) system.", platform: "ICICI Branch", minInvestment: "₹1,000", tenure: "7 years" },
    ]
  },

  // ═══════════════════ FD ═══════════════════
  fd: {
    title: "Best Fixed Deposit Rates by Bank",
    riskLevel: 1,
    note: "Rates vary by bank and tenure (as of May 2026). All scheduled banks are DICGC-insured up to ₹5 lakh. Senior citizens get 0.25-0.50% extra. Interest is taxable at slab rate. TDS deducted if interest > ₹40,000/year (₹50,000 for seniors).",
    howToStart: "Open via your bank's net banking / mobile app, or visit any branch. No special documents needed beyond KYC.",
    products: [
      { name: "SBI Fixed Deposit", provider: "State Bank of India", rate: "6.25%", highlight: "India's largest PSU bank with 22,000+ branches. Best for trust and accessibility — open FDs instantly via YONO app. 1-year rate: 6.25%. 2-3yr: 6.40-6.45%. Senior citizens get +0.50% extra. DICGC insured up to ₹5 lakh per depositor.", platform: "SBI YONO / Branch", minInvestment: "₹1,000", tenure: "1–3 years" },
      { name: "HDFC Bank FD", provider: "HDFC Bank", rate: "6.50%", highlight: "Premium digital FD experience — book, renew, and break FDs from the HDFC app in under 2 minutes. 1-year: 6.25%, 2-3yr: 6.45-6.50%. Offers auto-sweep facility to earn FD rates on idle savings. Senior citizens get up to 7.00%. Strong NRI FD options available.", platform: "HDFC NetBanking / App", minInvestment: "₹5,000", tenure: "1–3 years" },
      { name: "ICICI Bank FD", provider: "ICICI Bank", rate: "6.50%", highlight: "Flexible tenure options from 7 days to 10 years. iMobile Pay app makes FD management seamless. Special FD scheme 'iWish' lets you create goal-based deposits. Senior citizens get up to 7.00%. Partial withdrawal allowed.", platform: "ICICI iMobile / Branch", minInvestment: "₹10,000", tenure: "1–3 years" },
      { name: "Canara Bank FD", provider: "Canara Bank", rate: "6.77%", highlight: "Special 555-day FD at 6.77% — among the highest PSU bank rates. Regular 1-3yr tenure: ~6.40%. Strong branch network in South India. Senior citizens get up to 7.29%. Government-backed PSU bank with sovereign comfort. Monthly interest payout option available.", platform: "Canara Bank Branch / App", minInvestment: "₹1,000", tenure: "555 days (special)", badge: "Highest PSU Rate" },
      { name: "Shivalik SFB FD", provider: "Shivalik Small Finance Bank", rate: "7.80%", highlight: "Among the highest FD rates for small finance banks — up to 7.80% for general depositors. Senior citizens get up to 8.30%. Fully DICGC insured up to ₹5 lakh. Online FD opening available. Best for laddering strategy with short tenures.", platform: "Shivalik Bank Branch", minInvestment: "₹1,000", tenure: "1–2 years", badge: "Highest Rate" },
    ]
  },

  // ═══════════════════ SGB ═══════════════════
  sgb: {
    title: "How to Buy Sovereign Gold Bonds",
    riskLevel: 3,
    note: "Primary issuance by RBI is currently paused. Buy existing SGBs from the stock exchange secondary market via demat. 2.5% p.a. interest (taxable at slab). LTCG on redemption at maturity is TAX-FREE. If sold on exchange before maturity: LTCG at 12.5% after 1 year.",
    howToStart: "Open a demat + trading account on Zerodha, Groww, or Angel One. Search for 'SGB' or 'SGBAUG29' on the exchange.",
    products: [
      { name: "SGB via Zerodha", provider: "Zerodha (NSE/BSE)", rate: "2.5% + gold", highlight: "India's largest discount broker — zero brokerage on SGB delivery trades. Search 'SGB' or specific series like 'SGBAUG29' on Kite app. Gold price appreciation is TAX-FREE if held to 8-year maturity. 5Y gold CAGR has been ~13-15% (May 2021–2026) but past returns don't guarantee future performance.", platform: "Zerodha Kite App", minInvestment: "1 unit (~₹7,500)", tenure: "8 years", badge: "Most Popular" },
      { name: "SGB via Groww", provider: "Groww (NSE/BSE)", rate: "2.5% + gold", highlight: "Most beginner-friendly interface for first-time SGB buyers — clean search, easy order placement, and portfolio tracking. SGB units held in your demat account and can be sold on exchange after 5 years (or anytime on secondary market). Groww provides real-time gold price tracking alongside your SGB holdings.", platform: "Groww App", minInvestment: "1 unit (~₹7,500)", tenure: "8 years" },
      { name: "SGB via Angel One", provider: "Angel One (NSE/BSE)", rate: "2.5% + gold", highlight: "Full-service broker with dedicated research reports on gold price trends and SGB series comparison. Priority customer support for SGB-related queries. Angel One's Smart Money feature provides alerts when SGBs trade at a discount to NAV on the secondary market.", platform: "Angel One App", minInvestment: "1 unit (~₹7,500)", tenure: "8 years" },
    ]
  },

  // ═══════════════════ LIQUID MF ═══════════════════
  liquid_mf: {
    title: "Best Liquid Mutual Funds",
    riskLevel: 1,
    note: "Liquid funds invest in high-quality debt securities maturing within 91 days. T+1 redemption (instant withdrawal up to ₹50,000 via iSIP). Gains are taxed at your income slab rate.",
    howToStart: "Open an account on digital platforms like Groww, Zerodha Coin, or Kuvera, or directly via the fund house (AMC) website.",
    products: [
      { name: "SBI Liquid Fund", provider: "SBI MF", rate: "~7.0% (1Y Return)", highlight: "India's largest liquid fund by AUM (~₹70,000 Cr). Extremely safe portfolio consisting of sovereign and AAA commercial papers. T+1 redemption with instant withdrawal up to ₹50,000 via iSIP. Expense ratio: 0.16% (Direct). Best choice for core emergency fund parking.", platform: "SBI MF / Groww / Coin", minInvestment: "₹500", badge: "Top Pick" },
      { name: "ICICI Prudential Liquid Fund", provider: "ICICI Pru MF", rate: "~7.05% (1Y Return)", highlight: "AUM ~₹45,000 Cr. Consistently maintains a highly liquid portfolio with high allocation in Sovereign T-Bills. Expense ratio: 0.15% (Direct-Growth). Provides clean, low-cost cash management with instant redemption options.", platform: "ICICI MF / Groww / Coin", minInvestment: "₹99", badge: "Lowest Expense" },
      { name: "HDFC Liquid Fund", provider: "HDFC MF", rate: "~7.0% (1Y Return)", highlight: "AUM ~₹55,000 Cr. Conservative fund management from one of India's most respected fund houses. Zero credit-risk exposure, high liquidity, and instant withdrawal facilities up to ₹50,000.", platform: "HDFC MF / Groww / Coin", minInvestment: "₹100" },
      { name: "Nippon India Liquid Fund", provider: "Nippon India MF", rate: "~7.02% (1Y Return)", highlight: "AUM ~₹30,000 Cr. Highly diversified portfolio across short-term papers. Efficient digital execution via Nippon India app with instant redemption features.", platform: "Nippon MF / Groww / Coin", minInvestment: "₹100" }
    ]
  },

  // ═══════════════════ DEBT MF ═══════════════════
  debt_mf: {
    title: "Best Debt Mutual Funds to Consider",
    riskLevel: 2,
    note: "Post April 2023: ALL gains taxed at your income slab rate (no LTCG benefit, no indexation). Choose Direct-Growth plans for lowest expense ratio. Best for parking short-term surplus or emergency funds.",
    howToStart: "Invest via AMC website (direct plan), or apps like Groww, Zerodha Coin, or Kuvera. KYC required (Aadhaar + PAN).",
    products: [
      { name: "HDFC Short Term Debt Fund", provider: "HDFC AMC", rate: "~6.55% (5Y CAGR)", highlight: "AUM ~₹15,000 Cr with 90%+ portfolio in AAA/sovereign-rated instruments. Expense ratio: 0.27% (Direct). Modified duration of 2.5–3.5 years provides a sweet spot between yield and interest rate risk. Ideal for 2–3 year parking of surplus funds. Note: Post April 2023, debt fund gains are taxed at slab rate — no LTCG advantage.", platform: "HDFC MF / Groww / Kuvera", minInvestment: "₹100 SIP", badge: "Top Pick" },
      { name: "ICICI Pru Short Term Fund", provider: "ICICI Prudential AMC", rate: "~7.1% (5Y CAGR)", highlight: "AUM ~₹20,000 Cr — one of the largest short-term debt funds. Expense ratio: 0.35% (Direct). Strong risk management with credit profile consistently >95% in AAA/sovereign papers. ICICI Prudential's fixed-income division is among the most experienced in India with 20+ years of track record.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" },
      { name: "SBI Short Term Debt Fund", provider: "SBI MF", rate: "~7.0% (5Y CAGR)", highlight: "Backed by India's largest fund house by AUM. Expense ratio: 0.30% (Direct). Conservative portfolio focused on PSU bonds and government securities. Lower volatility compared to peers due to higher sovereign allocation. Ideal for risk-averse investors who want stability over marginal extra returns.", platform: "SBI MF / Groww / Kuvera", minInvestment: "₹500 SIP" },
      { name: "SBI Liquid Fund", provider: "SBI MF", rate: "~6.1% (5Y CAGR)", highlight: "India's most trusted liquid fund with AUM ~₹70,000 Cr. T+1 redemption (instant up to ₹50,000 via iSIP). Expense ratio: 0.16% (Direct). Invests only in ≤91-day maturity instruments. Zero credit risk with 100% in sovereign/AAA. Best choice for emergency fund parking with near-zero volatility.", platform: "SBI MF / Groww", minInvestment: "₹500", badge: "Most Liquid" },
    ]
  },

  // ═══════════════════ NPS ═══════════════════
  nps: {
    title: "Best NPS Fund Managers (Tier 1)",
    riskLevel: 4,
    note: "Extra ₹50K deduction under 80CCD(1B) over ₹1.5L 80C limit. Choose Active Choice to pick equity-debt split. 60% corpus tax-free at retirement; 40% must buy annuity (annuity income taxable). You can switch fund manager once/year.",
    howToStart: "Register on enps.nsdl.com with Aadhaar + PAN. Choose a Pension Fund Manager and asset allocation.",
    products: [
      { name: "HDFC Pension Fund (Scheme E)", provider: "HDFC Pension Management", rate: "~12.6%* (5Y)", highlight: "Consistently #1 or #2 ranked equity scheme (Tier I). AUM ~₹55,000 Cr. Portfolio focuses on large-cap quality stocks with a blend of growth and value. HDFC Pension's active management has outperformed the NPS Equity benchmark. 5Y CAGR ~12.59% (May 2026). Best choice for aggressive long-term retirement accumulation.", platform: "eNPS Portal", minInvestment: "₹500/month", badge: "Top Performer" },
      { name: "ICICI Pru Pension Fund (Scheme E)", provider: "ICICI Prudential", rate: "~11.5–12%* (5Y)", highlight: "Close competitor to HDFC with marginally lower volatility due to diversified stock selection. AUM ~₹40,000 Cr. ICICI Prudential's equity research department leverages the same platform as ICICI Prudential AMC — India's largest non-bank AMC. Smoother ride during market corrections compared to HDFC Pension.", platform: "eNPS Portal", minInvestment: "₹500/month" },
      { name: "SBI Pension Fund", provider: "SBI Pension Funds", rate: "~11–12%* (5Y)", highlight: "India's largest NPS fund manager with AUM ~₹4 lakh Cr (across all schemes). Default choice for government employees. Conservative large-cap focused portfolio with lower drawdowns. SBI Pension's scale provides excellent liquidity and tight bid-ask spreads in underlying securities.", platform: "eNPS Portal", minInvestment: "₹500/month" },
      { name: "LIC Pension Fund (Scheme G)", provider: "LIC Pension Fund", rate: "~8–9%* (5Y)", highlight: "Best choice for the government bonds/gilt allocation of your NPS. 100% invested in G-Secs and SDL — zero credit risk. LIC Pension's bond fund has consistently outperformed the NPS Gilt benchmark. Ideal for those nearing retirement who want to shift from equity to safety. Combine with Scheme E for balanced allocation.", platform: "eNPS Portal", minInvestment: "₹500/month", badge: "Safest" },
    ]
  },

  // ═══════════════════ HYBRID / BAF ═══════════════════
  hybrid_mf: {
    title: "Best Balanced Advantage Funds",
    riskLevel: 4,
    note: "Dynamically shift between equity and debt. Taxed as equity if 65%+ in equities (LTCG >₹1.25L at 12.5% after 1 yr, STCG at 20%). Choose Direct-Growth plans. Ideal for moderate-risk investors seeking auto-rebalancing.",
    howToStart: "Invest via AMC website, Groww, Zerodha Coin, or Kuvera. Start a monthly SIP for rupee cost averaging.",
    products: [
      { name: "HDFC Balanced Advantage Fund", provider: "HDFC AMC", rate: "~16.6–17.5%* (5Y)", highlight: "AUM ~₹90,000 Cr — India's largest BAF. Expense ratio: 0.74% (Direct). Maintains 65–80% net equity exposure, making it more aggressive than peers. Strong alpha in bull markets — but expect higher drawdowns in corrections. Outperforms category average (~9.5%) by 7–8% over 5Y. Taxed as equity fund.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Best Returns" },
      { name: "ICICI Pru Balanced Advantage Fund", provider: "ICICI Prudential AMC", rate: "~11.7–12.1%* (5Y)", highlight: "India's oldest and most battle-tested BAF with AUM ~₹60,000 Cr. Expense ratio: 0.88% (Direct). Uses a proprietary valuation model (P/B based) to dynamically shift equity exposure between 30–80%. Proved its worth in 2020 COVID crash with only 15% drawdown vs 35%+ for pure equity. Best choice for conservative investors seeking equity-like returns with debt-like stability.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Best for Safety" },
      { name: "SBI Balanced Advantage Fund", provider: "SBI MF", rate: "~11.0–11.4%* (SI)", highlight: "Launched Aug 2021 — does not have a 5Y track record yet. AUM ~₹30,000 Cr. Expense ratio: 0.65% (Direct). Takes a middle-ground approach between HDFC's aggression and ICICI's conservatism. Equity exposure typically ranges 55–75%. Backed by SBI MF's strong fixed-income research for the debt component. Good choice for first-time equity investors who want a single all-weather fund.", platform: "SBI MF / Groww / Kuvera", minInvestment: "₹500 SIP" },
    ]
  },

  // ═══════════════════ INDEX FUND ═══════════════════
  index_mf: {
    title: "Best Nifty 50 Index Funds",
    riskLevel: 6,
    note: "All track the same Nifty 50 index. Key differentiator: expense ratio & tracking error. Always choose Direct-Growth plan. Equity taxation: LTCG >₹1.25L at 12.5% (after 1 yr), STCG at 20%.",
    howToStart: "Invest via AMC website (direct plan), or apps like Groww, Zerodha Coin, Kuvera. Start with as little as ₹100 SIP.",
    products: [
      { name: "UTI Nifty 50 Index Fund", provider: "UTI AMC", rate: "~10.7–11.3%* (5Y)", highlight: "India's most popular index fund with AUM ~₹24,000 Cr and tracking error of just 0.03%. Expense ratio: 0.18% (Direct). UTI was the first to launch a Nifty index fund in India — unmatched track record since 2000. Ideal core portfolio holding for passive investors who believe in India's long-term GDP growth story.", platform: "UTI MF / Groww / Kuvera", minInvestment: "₹100 SIP", badge: "Most Popular" },
      { name: "HDFC Nifty 50 Index Fund", provider: "HDFC AMC", rate: "~10.7–11.3%* (5Y)", highlight: "AUM ~₹20,600 Cr with excellent tracking accuracy (TE: 0.04%). Expense ratio: 0.20% (Direct). Backed by India's most trusted AMC brand. Benefits from HDFC AMC's operational scale — minimal cash drag and efficient rebalancing during index reconstitution. Same returns as UTI but with HDFC's service ecosystem.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Nippon India Nifty 50 Index Fund", provider: "Nippon India AMC", rate: "~10.7–11.3%* (5Y)", highlight: "Lowest expense ratio in the category at 0.07% (Direct) — saves ~₹1,100 per lakh invested annually vs the average. AUM ~₹9,000 Cr. Joint venture with Japan's Nippon Life brings global best practices in passive management. Ideal for cost-conscious long-term SIP investors where every basis point matters over 20+ year horizons.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Lowest Cost" },
      { name: "SBI Nifty Index Fund", provider: "SBI MF", rate: "~10.7–11.3%* (5Y)", highlight: "AUM ~₹10,000 Cr backed by SBI MF — India's largest fund house. Expense ratio: 0.18% (Direct). Reliable tracking with 0.05% TE. Best choice for investors already in the SBI ecosystem (SBI savings, YONO app). Automatic SIP setup via YONO with one-tap investment.", platform: "SBI MF / Groww / Kuvera", minInvestment: "₹500 SIP" },
    ]
  },

  // ═══════════════════ GOLD ETF ═══════════════════
  gold_etf: {
    title: "Best Gold ETFs & Secondary SGB Options in India",
    riskLevel: 5,
    note: "Requires demat account. Tracks domestic gold price. Tax: STCG (< 1 yr) at slab rate; LTCG (> 1 yr) at 12.5% without indexation. No lock-in.",
    howToStart: "Open a demat + trading account on Zerodha, Groww, or Angel One. Buy units during market hours like stocks.",
    subCategories: {
      physical_gold_etf: [
        { name: "Nippon India Gold BeES", provider: "Nippon India AMC", rate: "~25.9% (5Y)", highlight: "India's oldest and most liquid Gold ETF (launched 2007) with AUM ~₹12,000 Cr. Expense ratio: 0.79%. Highest daily trading volume.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)", badge: "Most Liquid" },
        { name: "HDFC Gold ETF", provider: "HDFC AMC", rate: "~25.8% (5Y)", highlight: "Lowest expense ratio among Gold ETFs at 0.59% — saves ~₹200/lakh annually. AUM ~₹5,000 Cr with excellent tracking accuracy.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)", badge: "Lowest Cost" },
        { name: "SBI Gold ETF", provider: "SBI MF", rate: "~25.5% (5Y)", highlight: "AUM ~₹4,500 Cr with strong institutional participation. Backed by SBI MF's trusted vault infrastructure.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)" }
      ],
      silver_etf: [
        { name: "HDFC Silver ETF", provider: "HDFC AMC", rate: "~28.1% (1Y)", highlight: "Tracks physical silver prices stored in LBMA vaults. Benefits from industrial EV & solar demand.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹90)", badge: "Industrial Silver" },
        { name: "ICICI Pru Silver ETF", provider: "ICICI Prudential AMC", rate: "~27.8% (1Y)", highlight: "High liquidity silver ETF on NSE/BSE with real-time silver spot price tracking.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹90)" }
      ],
      sgb_secondary: [
        { name: "Sovereign Gold Bond (SGBAUG29)", provider: "RBI / Secondary Market", rate: "2.5% + Gold", highlight: "Buy existing SGB units on NSE/BSE secondary market. Tax-free LTCG if held to 8Y maturity.", platform: "Stock Broker App", minInvestment: "1 unit (~₹7,500)", badge: "Tax-Free Maturity" }
      ]
    },
    products: [
      { name: "Nippon India Gold BeES", provider: "Nippon India AMC", rate: "~25.9%* (5Y)", highlight: "India's oldest and most liquid Gold ETF (launched 2007) with AUM ~₹12,000 Cr. Expense ratio: 0.79%. Highest daily trading volume ensures tight bid-ask spread — you won't lose money to illiquidity. Each unit represents ~0.01 gram of 99.5% pure gold stored in LBMA-accredited vaults. 5Y CAGR driven by central bank buying and geopolitical demand.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)", badge: "Most Liquid" },
      { name: "HDFC Gold ETF", provider: "HDFC AMC", rate: "~25.8%* (5Y)", highlight: "Lowest expense ratio among Gold ETFs at 0.59% — saves ~₹200/lakh annually vs peers. AUM ~₹5,000 Cr with excellent tracking accuracy to domestic gold prices. HDFC AMC's operational efficiency minimizes cash drag. Best choice for long-term buy-and-hold gold allocation in your portfolio.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)", badge: "Lowest Cost" },
      { name: "SBI Gold ETF", provider: "SBI MF", rate: "~25.5%* (5Y)", highlight: "AUM ~₹4,500 Cr with strong institutional participation (insurance companies, pension funds). Expense ratio: 0.65%. Backed by SBI MF's trusted brand and custody infrastructure. Good secondary market liquidity. Gold price has been driven by central bank buying, de-dollarization trends, and geopolitical uncertainty.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)" }
    ]
  },

  // ═══════════════════ ELSS ═══════════════════
  elss: {
    title: "Best ELSS Tax-Saving Mutual Funds",
    riskLevel: 6,
    note: "3-year lock-in per SIP installment. 80C deduction up to ₹1.5L. Equity taxation applies: LTCG >₹1.25L at 12.5% after 1 yr. Choose Direct-Growth plans for lowest cost.",
    howToStart: "Invest via AMC website (direct plan), Groww, Zerodha Coin, or Kuvera. Start SIP before March 31 for tax benefit.",
    products: [
      { name: "SBI Long Term Equity Fund", provider: "SBI MF", rate: "~18.5–18.7%* (5Y)", highlight: "One of India's oldest ELSS funds (since 1993) with AUM ~₹27,000 Cr. Expense ratio: 0.75% (Direct). Follows a disciplined value-oriented approach with focus on undervalued large and mid-cap stocks. Consistently in top quartile across 5Y, 10Y, and 15Y periods. Fund manager's contrarian bets have generated significant alpha over Nifty 500.", platform: "SBI MF / Groww / Kuvera", minInvestment: "₹500 SIP", badge: "Top Pick" },
      { name: "Quant ELSS Tax Saver Fund", provider: "Quant AMC", rate: "~17.8–18.2%* (5Y)", highlight: "Aggressive momentum-driven strategy — highest alpha potential but with higher volatility. AUM ~₹12,500 Cr. Expense ratio: 0.57% (Direct). Uses proprietary VLRT framework (Valuation, Liquidity, Risk, Timing) for stock selection. Can deliver exceptional returns in trending markets but may underperform in range-bound markets.", platform: "Quant MF / Groww", minInvestment: "₹500 SIP", badge: "High Alpha" },
      { name: "Parag Parikh ELSS Tax Saver", provider: "PPFAS AMC", rate: "~15.1–15.5%* (5Y)", highlight: "Unique international diversification — allocates 15–30% to US-listed stocks (Alphabet, Microsoft, Amazon) providing geographic hedging. AUM ~₹5,600 Cr. Expense ratio: 0.63% (Direct). Conservative, Buffett-style value investing approach. Lower drawdowns than peers in India-specific corrections. 3-year lock-in per SIP installment.", platform: "PPFAS MF / Kuvera", minInvestment: "₹500 SIP" },
      { name: "Mirae Asset ELSS Tax Saver Fund", provider: "Mirae Asset AMC", rate: "~14.3–14.7%* (5Y)", highlight: "AUM ~₹26,000 Cr — one of the most popular ELSS choices. Expense ratio: 0.55% (Direct). Growth-oriented portfolio with overweight in financials, IT, and consumer sectors. Korean parent Mirae Asset Global brings world-class research. Consistent compounder with a focus on high-quality businesses with strong moats.", platform: "Mirae Asset MF / Groww", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ NIFTY ETF ═══════════════════
  nifty_etf: {
    title: "Best Nifty 50 ETFs",
    riskLevel: 6,
    note: "Requires demat account. Real-time trading on NSE/BSE. Expense ratio is even lower than index funds. Equity taxation: LTCG >₹1.25L at 12.5% after 1 yr, STCG at 20%.",
    howToStart: "Open a demat + trading account. Search for the ETF ticker (e.g., NIFTYBEES) and buy during market hours.",
    subCategories: {
      largecap_nifty: [
        { name: "Nippon India Nifty BeES", provider: "Nippon India AMC", rate: "~11.2% (5Y)", highlight: "Ticker: NIFTYBEES. India's largest and most liquid ETF with ~₹30,000 Cr AUM. Expense ratio: 0.04%.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹260)", badge: "Most Liquid" },
        { name: "ICICI Pru Nifty 50 ETF", provider: "ICICI Prudential AMC", rate: "~11.2% (5Y)", highlight: "Lowest expense ratio at 0.02% (Direct) — effectively free index tracking.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹260)", badge: "Lowest Cost" },
        { name: "SBI Nifty 50 ETF", provider: "SBI MF", rate: "~11.2% (5Y)", highlight: "Largest AUM (~₹1,60,000 Cr) preferred by institutional pension funds.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹260)" }
      ],
      nifty_next_50: [
        { name: "Nippon India Nifty Next 50 ETF (Junior BeES)", provider: "Nippon India AMC", rate: "~14.5% (5Y)", highlight: "Tracks Nifty Next 50 (stocks ranked 51-100). Higher growth potential than Nifty 50.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹650)", badge: "Junior BeES" },
        { name: "ICICI Pru Nifty Next 50 ETF", provider: "ICICI Prudential AMC", rate: "~14.3% (5Y)", highlight: "Low expense ratio passive exposure to emerging blue-chip market leaders.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹650)" }
      ],
      smart_beta_nifty: [
        { name: "Nifty200 Alpha 30 ETF", provider: "ICICI Prudential AMC", rate: "~19.4% (3Y)", highlight: "Factor ETF selecting top 30 momentum stocks from Nifty 200 index.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹45)", badge: "Factor Alpha" },
        { name: "Nifty100 Low Volatility 30 ETF", provider: "ICICI Prudential AMC", rate: "~15.6% (3Y)", highlight: "Smart-beta ETF picking lowest volatility large-caps to minimize drawdowns.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹60)" }
      ]
    },
    products: [
      { name: "Nippon India Nifty BeES", provider: "Nippon India AMC", rate: "~10.7–11.3%* (5Y)", highlight: "India's oldest Nifty ETF (ticker: NIFTYBEES) with AUM ~₹30,000 Cr and daily volume of ~₹500 Cr. Expense ratio: 0.04% — the absolute cheapest way to own the Nifty 50. Real-time NAV tracking during market hours. No demat minimum quantity — buy even 1 unit. The gold standard for passive Nifty 50 exposure.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹260)", badge: "Most Liquid" },
      { name: "ICICI Pru Nifty 50 ETF", provider: "ICICI Prudential AMC", rate: "~10.7–11.3%* (5Y)", highlight: "Lowest expense ratio at 0.02% (Direct) — effectively free index tracking. AUM ~₹12,000 Cr. ICICI Prudential's institutional-grade fund management ensures minimal tracking error. Growing liquidity with increasing retail adoption. Best for large lump-sum investors and institutions seeking exact Nifty replication.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹260)", badge: "Lowest Cost" },
      { name: "SBI Nifty 50 ETF", provider: "SBI MF", rate: "~10.7–11.3%* (5Y)", highlight: "AUM ~₹1,60,000 Cr (largest by far) — massive institutional holding including EPFO. Expense ratio: 0.07%. SBI MF's scale ensures excellent tracking accuracy and deep liquidity. Preferred ETF for government mandates and CPSE allocations. Retail investors benefit from institutional-grade pricing.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹260)" }
    ]
  },

  // ═══════════════════ MID-CAP MF ═══════════════════
  midcap_mf: {
    title: "Best Mid-Cap Mutual Funds",
    riskLevel: 6,
    note: "High growth potential with higher volatility. Min 7-year horizon recommended. Equity taxation: LTCG >₹1.25L at 12.5% after 1 yr, STCG at 20%. Choose Direct-Growth plans.",
    howToStart: "Start a monthly SIP via Groww, Zerodha Coin, Kuvera, or AMC website. ₹500-1000/month SIP is ideal to start.",
    subCategories: {
      growth_momentum: [
        { name: "Motilal Oswal Midcap Fund", provider: "Motilal Oswal AMC", rate: "~24.5–24.9%* (5Y)", highlight: "High-conviction 25–30 stock concentrated portfolio — top 5Y performer in mid-cap category. AUM ~₹18,000 Cr. Expense ratio: 0.57% (Direct). Bold sectoral bets amplify returns in bull cycles. Higher tracking volatility — expect 15–20% drawdowns in corrections. Best for aggressive investors with 7+ year horizon.", platform: "Motilal Oswal MF / Groww", minInvestment: "₹500 SIP", badge: "Top Pick" },
        { name: "Quant Midcap Fund", provider: "Quant AMC", rate: "~27.2%* (5Y)", highlight: "AUM ~₹9,200 Cr. Aggressive momentum rotation using VLRT framework. Highest return potential but highest volatility — can swing ±25% annually. Expense ratio: 0.52% (Direct). Only for investors comfortable with high drawdowns.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Returns" },
        { name: "Edelweiss Mid Cap Fund", provider: "Edelweiss AMC", rate: "~23.8%* (5Y)", highlight: "AUM ~₹7,100 Cr. Growth-oriented stock picker with strong earnings momentum tilt. Expense ratio: 0.42% (Direct). Balances momentum with quality filters.", platform: "Edelweiss MF / Groww", minInvestment: "₹100 SIP" },
      ],
      diversified_core: [
        { name: "Nippon India Growth Fund", provider: "Nippon India AMC", rate: "~23.1–23.3%* (5Y)", highlight: "Well-diversified 60–70 stock portfolio spreading risk across sectors. AUM ~₹30,000 Cr. Expense ratio: 0.85% (Direct). One of the oldest mid-cap funds (since 1995) with proven track record through multiple market cycles. Lower concentration risk with competitive long-term returns.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Most Diversified" },
        { name: "HDFC Mid-Cap Opportunities Fund", provider: "HDFC AMC", rate: "~22.1–22.6%* (5Y)", highlight: "Largest mid-cap fund in India with AUM ~₹75,000 Cr. Expense ratio: 0.73% (Direct). Steady process-driven approach — won't chase momentum but compounds reliably over decades. Fund manager Chirag Setalvad since 2007. The 'boring but reliable' pick.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
        { name: "SBI Midcap Fund", provider: "SBI MF", rate: "~20.8%* (5Y)", highlight: "AUM ~₹22,000 Cr. Balanced sector allocation with SBI's institutional research. Expense ratio: 0.62% (Direct). Conservative mid-cap approach with lower drawdowns.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      ],
      value_quality: [
        { name: "Kotak Midcap Fund", provider: "Kotak AMC", rate: "~20–22%* (5Y)", highlight: "AUM ~₹60,000 Cr with emphasis on quality businesses with clean balance sheets. Expense ratio: 0.42% (Direct) — lowest in category. Avoids highly leveraged turnaround stories. Lower drawdowns during corrections. Best for moderate-risk mid-cap exposure.", platform: "Kotak MF / Groww / Kuvera", minInvestment: "₹100 SIP", badge: "Lowest Cost" },
        { name: "Axis Midcap Fund", provider: "Axis AMC", rate: "~18.6%* (5Y)", highlight: "AUM ~₹28,000 Cr. Quality-first approach — focuses on companies with high ROE, low debt, and proven unit economics. Expense ratio: 0.48% (Direct). Least volatile mid-cap fund, ideal for conservative investors wanting mid-cap exposure.", platform: "Axis MF / Groww", minInvestment: "₹100 SIP", badge: "Least Volatile" },
        { name: "DSP Midcap Fund", provider: "DSP Investment Managers", rate: "~19.4%* (5Y)", highlight: "AUM ~₹18,500 Cr. Balanced mid-cap selection with strong emphasis on governance quality and free cash flow generation. Expense ratio: 0.68% (Direct).", platform: "DSP MF / Groww / Kuvera", minInvestment: "₹100 SIP" },
      ],
    },
    products: [
      { name: "Motilal Oswal Midcap Fund", provider: "Motilal Oswal AMC", rate: "~24.5–24.9%* (5Y)", highlight: "High-conviction 25–30 stock concentrated portfolio — top 5Y performer in mid-cap category. AUM ~₹18,000 Cr. Expense ratio: 0.57% (Direct). Fund manager takes bold sectoral bets which amplifies returns in bull cycles. Higher tracking volatility than diversified peers — expect 15–20% drawdowns in corrections. Best for aggressive investors with 7+ year horizon.", platform: "Motilal Oswal MF / Groww", minInvestment: "₹500 SIP", badge: "Top Pick" },
      { name: "Nippon India Growth Fund", provider: "Nippon India AMC", rate: "~23.1–23.3%* (5Y)", highlight: "Well-diversified 60–70 stock portfolio spreading risk across sectors. AUM ~₹30,000 Cr. Expense ratio: 0.85% (Direct). One of the oldest mid-cap funds (since 1995) with a proven track record through multiple market cycles. Lower concentration risk than Motilal Oswal but with competitive long-term returns.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP" },
      { name: "HDFC Mid-Cap Opportunities Fund", provider: "HDFC AMC", rate: "~22.1–22.6%* (5Y)", highlight: "Largest mid-cap fund in India with AUM ~₹75,000 Cr. Expense ratio: 0.73% (Direct). Follows a steady process-driven approach — won't chase momentum but compounds reliably over decades. Fund manager Chirag Setalvad has managed this fund since 2007. The 'boring but reliable' pick for disciplined long-term wealth building.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Kotak Midcap Fund", provider: "Kotak AMC", rate: "~20–22%* (5Y)", highlight: "AUM ~₹60,000 Cr with emphasis on quality businesses with clean balance sheets. Expense ratio: 0.42% (Direct) — lowest in category. Avoids highly leveraged and turnaround stories. Lower drawdowns during corrections compared to peers. Best for moderate-risk mid-cap exposure.", platform: "Kotak MF / Groww / Kuvera", minInvestment: "₹100 SIP" },
    ]
  },

  // ═══════════════════ SMALL-CAP MF ═══════════════════
  smallcap_mf: {
    title: "Best Small-Cap Mutual Funds",
    riskLevel: 6,
    note: "Highest return potential but highest volatility. Min 10-year horizon. Limit to 10-15% of portfolio. Equity taxation: LTCG >₹1.25L at 12.5% after 1 yr, STCG at 20%.",
    howToStart: "Start a monthly SIP via Groww, Zerodha Coin, or AMC website. Never invest lump sum in small-caps.",
    subCategories: {
      aggressive_alpha: [
        { name: "Quant Small Cap Fund", provider: "Quant AMC", rate: "~22.0–22.6%* (5Y)", highlight: "High return potential using aggressive momentum and quant-driven VLRT strategy. AUM ~₹26,000 Cr. Expense ratio: 0.57% (Direct). Can swing 30–40% in either direction annually. Only for investors who won't panic during 40%+ drawdowns.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Returns" },
        { name: "Bandhan Small Cap Fund", provider: "Bandhan AMC", rate: "~24.1%* (5Y)", highlight: "AUM ~₹8,500 Cr. Aggressive stock selection in micro-cap to small-cap universe with high turnover. Expense ratio: 0.38% (Direct). Strong alpha in bull markets but can drawdown 35%+ in corrections.", platform: "Bandhan MF / Groww", minInvestment: "₹100 SIP", badge: "High Alpha" },
      ],
      diversified_broad: [
        { name: "Nippon India Small Cap Fund", provider: "Nippon India AMC", rate: "~22.7–23.6%* (5Y)", highlight: "Largest small-cap fund in India with AUM ~₹60,000 Cr, holding 170+ stocks for maximum diversification. Expense ratio: 0.68% (Direct). Fund manager Samir Rachh discovers future mid-cap leaders early. SIP route recommended for disciplined entry.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Most Popular" },
        { name: "HDFC Small Cap Fund", provider: "HDFC AMC", rate: "~21.4%* (5Y)", highlight: "AUM ~₹32,000 Cr. Process-driven bottom-up selection across 80+ stocks. Expense ratio: 0.58% (Direct). Steady compounder with well-diversified sector allocation — avoids concentrated sectoral bets.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
        { name: "Tata Small Cap Fund", provider: "Tata AMC", rate: "~20.8%* (5Y)", highlight: "AUM ~₹9,800 Cr. Focused on capital-efficient small businesses with strong promoter quality. Expense ratio: 0.28% (Direct) — one of the lowest in category.", platform: "Tata MF / Groww", minInvestment: "₹100 SIP", badge: "Lowest Cost" },
      ],
      quality_defensive: [
        { name: "SBI Small Cap Fund", provider: "SBI MF", rate: "~20–22%* (5Y)", highlight: "AUM ~₹30,000 Cr with a disciplined quality-focused approach — avoids speculative micro-caps. Expense ratio: 0.58% (Direct). Lowest max drawdown among top small-cap funds. Fund manager focuses on proven unit economics before scaling. Best for risk-conscious small-cap exposure.", platform: "SBI MF / Groww / Kuvera", minInvestment: "₹500 SIP", badge: "Least Volatile" },
        { name: "Kotak Small Cap Fund", provider: "Kotak AMC", rate: "~19.2%* (5Y)", highlight: "AUM ~₹17,500 Cr. Quality-first portfolio avoiding highly leveraged companies. Expense ratio: 0.48% (Direct). Lower concentration risk with clean balance sheet focus.", platform: "Kotak MF / Kuvera", minInvestment: "₹100 SIP" },
        { name: "Axis Small Cap Fund", provider: "Axis AMC", rate: "~18.8%* (5Y)", highlight: "AUM ~₹22,000 Cr. Conservative stock selection focusing on small companies with high governance and cash flow visibility. Expense ratio: 0.44% (Direct). Least volatile small-cap fund.", platform: "Axis MF / Groww", minInvestment: "₹100 SIP", badge: "Best for Safety" },
      ],
    },
    products: [
      { name: "Quant Small Cap Fund", provider: "Quant AMC", rate: "~22.0–22.6%* (5Y)", highlight: "High return potential in the small-cap space using aggressive momentum and quant-driven strategy. AUM ~₹26,000 Cr. Expense ratio: 0.57% (Direct). Uses VLRT framework for tactical sector rotation. High volatility — can swing 30–40% in either direction annually. Only for investors who won't panic during 40%+ drawdowns.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Returns" },
      { name: "Nippon India Small Cap Fund", provider: "Nippon India AMC", rate: "~22.7–23.6%* (5Y)", highlight: "Largest small-cap fund in India with AUM ~₹60,000 Cr, holding 170+ stocks for maximum diversification. Expense ratio: 0.68% (Direct). Fund manager Samir Rachh has built a reputation for discovering future mid-cap leaders early. Closed to lump-sum investment temporarily due to size — SIP route recommended for disciplined entry.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Most Popular" },
      { name: "SBI Small Cap Fund", provider: "SBI MF", rate: "~20–22%* (5Y)", highlight: "AUM ~₹30,000 Cr with a disciplined quality-focused approach — avoids speculative micro-caps. Expense ratio: 0.58% (Direct). Lowest max drawdown among top small-cap funds during corrections. Fund manager focuses on businesses with proven unit economics before scaling. Best for risk-conscious investors who want small-cap exposure without extreme volatility.", platform: "SBI MF / Groww / Kuvera", minInvestment: "₹500 SIP", badge: "Least Volatile" },
    ]
  },

  // ═══════════════════ DIRECT EQUITY ═══════════════════
  direct_equity: {
    title: "Beginner-Friendly Blue-Chip Stocks",
    riskLevel: 6,
    note: "Direct stocks require research and monitoring. Start with Nifty 50 blue-chips. Diversify across 10-15 stocks and sectors. Equity taxation: LTCG >₹1.25L at 12.5% after 1 yr, STCG at 20%. Dividends taxed at slab rate.",
    howToStart: "Open a demat + trading account on Zerodha, Groww, or Angel One. Start with blue-chip large-caps.",
    subCategories: {
      banking_financial: [
        { name: "HDFC Bank", provider: "NSE: HDFCBANK", rate: "~14–16%* (5Y)", highlight: "India's most valued private bank with consistent 15–18% ROE for 20+ years. Post-merger with HDFC Ltd, largest private bank by total assets (~₹35L Cr). GNPA <1.5%. India's banking has structural tailwinds from rising credit penetration.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,900)", badge: "Banking Leader" },
        { name: "ICICI Bank", provider: "NSE: ICICIBANK", rate: "~22.4%* (5Y)", highlight: "Top ROA growth in Indian banking. Digital-first strategy driving 20%+ retail credit growth. AUM rising across mutual funds, insurance, and securities verticals.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,250)", badge: "Top Growth" },
        { name: "State Bank of India", provider: "NSE: SBIN", rate: "~21.8%* (5Y)", highlight: "India's largest PSU bank with sovereign trust and 22,000+ branch footprint. Rising ROE driven by cleanup of legacy NPAs and digital transformation.", platform: "Any Stock Broker", minInvestment: "1 share (~₹840)" },
        { name: "Bajaj Finance", provider: "NSE: BAJFINANCE", rate: "~12.5%* (5Y)", highlight: "India's most premium NBFC with 80M+ customers. 25%+ AUM growth and industry-best asset quality. Gold standard in consumer lending.", platform: "Any Stock Broker", minInvestment: "1 share (~₹7,200)" },
      ],
      it_technology: [
        { name: "TCS (Tata Consultancy)", provider: "NSE: TCS", rate: "~12–14%* (5Y)", highlight: "World's second-largest IT services company with zero debt and ₹60,000 Cr cash reserves. Consistent 70%+ dividend payout ratio. $29B+ annual revenue with 600,000+ employees across 55 countries.", platform: "Any Stock Broker", minInvestment: "1 share (~₹3,800)", badge: "Zero Debt" },
        { name: "Infosys", provider: "NSE: INFY", rate: "~12–14%* (5Y)", highlight: "Global digital transformation leader with $19B+ revenue. Industry-leading 21%+ operating margins. Strong AI/cloud pivot generating 60%+ revenue from digital services.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,500)" },
        { name: "HCL Technologies", provider: "NSE: HCLTECH", rate: "~14.8%* (5Y)", highlight: "India's 3rd largest IT exporter. Strong mode 2/3 services revenue from infrastructure management and product engineering. Attractive 3.5%+ dividend yield.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,700)" },
      ],
      energy_industrial: [
        { name: "Reliance Industries", provider: "NSE: RELIANCE", rate: "~15–18%* (5Y)", highlight: "India's largest company by market cap (~₹20L Cr). Diversified revenue across energy (O2C), retail (16,000+ stores), telecom (Jio: 480M+ subscribers), and new energy. Net-debt free since 2020.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,300)", badge: "Largest Company" },
        { name: "Larsen & Toubro (L&T)", provider: "NSE: LT", rate: "~24.2%* (5Y)", highlight: "India's premier engineering & infrastructure conglomerate with massive order backlog exceeding ₹4.5L Cr. Capturing India's infrastructure capex boom.", platform: "Any Stock Broker", minInvestment: "1 share (~₹3,600)" },
        { name: "NTPC", provider: "NSE: NTPC", rate: "~26.1%* (5Y)", highlight: "India's largest power generator. Expanding rapidly into solar and green hydrogen. 70,000+ MW installed capacity. Reliable 3%+ dividend yield.", platform: "Any Stock Broker", minInvestment: "1 share (~₹360)" },
      ],
      fmcg_consumer: [
        { name: "ITC Limited", provider: "NSE: ITC", rate: "~10–12%* (5Y)", highlight: "India's highest dividend-yield large-cap (~3% yield). FMCG revenue ₹20,000+ Cr. Hotels division 150+ properties growing 20%+ post-COVID. Cigarettes provide cash-flow fortress with 75%+ EBITDA margins.", platform: "Any Stock Broker", minInvestment: "1 share (~₹440)", badge: "Best Dividend" },
        { name: "Hindustan Unilever", provider: "NSE: HINDUNILVR", rate: "~5–8%* (5Y)", highlight: "India's largest FMCG company with unmatched rural + urban distribution reach. 50+ brands including Lux, Surf Excel, Dove. Defensive stock with low drawdowns.", platform: "Any Stock Broker", minInvestment: "1 share (~₹2,400)", badge: "Most Defensive" },
        { name: "Nestlé India", provider: "NSE: NESTLEIND", rate: "~8–10%* (5Y)", highlight: "Market leader in packaged food (Maggi, KitKat, Nescafé). Consistent 20%+ ROE with zero debt. Premium stock for long-term wealth preservation.", platform: "Any Stock Broker", minInvestment: "1 share (~₹2,300)" },
      ],
      pharma_healthcare: [
        { name: "Sun Pharmaceutical", provider: "NSE: SUNPHARMA", rate: "~18.2%* (5Y)", highlight: "India's largest pharma company by market cap. Global specialty pharma leader with growing dermatology and oncology portfolio. 72% revenue from international markets.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,800)", badge: "Pharma Leader" },
        { name: "Dr. Reddy's Laboratories", provider: "NSE: DRREDDY", rate: "~15.4%* (5Y)", highlight: "Premium pharma with strong US FDA-approved portfolio. Industry-leading biosimilar pipeline. Clean balance sheet with high free cash flow generation.", platform: "Any Stock Broker", minInvestment: "1 share (~₹6,400)" },
        { name: "Apollo Hospitals", provider: "NSE: APOLLOHOSP", rate: "~28.5%* (5Y)", highlight: "India's largest private hospital chain with 72+ hospitals. Digital health platform Apollo 24|7 with 40M+ users. Structural tailwind from rising healthcare spend.", platform: "Any Stock Broker", minInvestment: "1 share (~₹6,800)", badge: "High Growth" },
      ],
    },
    products: [
      { name: "Reliance Industries", provider: "NSE: RELIANCE", rate: "~15–18%* (5Y)", highlight: "India's largest company by market cap (~₹20L Cr). Diversified revenue across energy (O2C), retail (16,000+ stores), telecom (Jio: 480M+ subscribers), and new energy (green hydrogen, solar). Net-debt free since 2020. Proven capital allocation by Mukesh Ambani's leadership. Institutional ownership >30% including marquee global funds.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,300)", sector: "Conglomerate", badge: "Largest Company" },
      { name: "TCS (Tata Consultancy)", provider: "NSE: TCS", rate: "~12–14%* (5Y)", highlight: "World's second-largest IT services company with zero debt and ₹60,000 Cr cash reserves. Consistent 70%+ dividend payout ratio — reliable income stock. $29B+ annual revenue with 600,000+ employees across 55 countries. Tata Group's governance adds a trust premium. Resilient through economic cycles with 98%+ client retention.", platform: "Any Stock Broker", minInvestment: "1 share (~₹3,800)", sector: "IT Services" },
      { name: "HDFC Bank", provider: "NSE: HDFCBANK", rate: "~14–16%* (5Y)", highlight: "India's most valued private bank with consistent 15–18% ROE for 20+ years. Post-merger with HDFC Ltd, it's the largest private bank by total assets (~₹35L Cr). Best-in-class asset quality with GNPA consistently <1.5%. India's banking sector has structural tailwinds from rising credit penetration (credit-to-GDP at 57% vs 150%+ for developed nations).", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,900)", sector: "Banking" },
      { name: "Infosys", provider: "NSE: INFY", rate: "~12–14%* (5Y)", highlight: "Global digital transformation leader with $19B+ revenue. Known for strongest corporate governance in Indian IT — Narayana Murthy's legacy. Industry-leading 21%+ operating margins. Strong AI/cloud pivot generating 60%+ revenue from digital services. Consistent buyback and dividend payouts.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,500)", sector: "IT Services" },
      { name: "ITC Limited", provider: "NSE: ITC", rate: "~10–12%* (5Y)", highlight: "India's highest dividend-yield large-cap (~3% yield). FMCG revenue now at ₹20,000+ Cr (Aashirvaad, Sunfeast, Bingo). Hotels division (150+ properties) growing 20%+ post-COVID. Cigarettes provide a cash-flow fortress with 75%+ EBITDA margins. ITC's demerger of hotels business (announced 2023) could unlock significant value.", platform: "Any Stock Broker", minInvestment: "1 share (~₹440)", sector: "FMCG", badge: "Best Dividend" },
    ]
  },

  // ═══════════════════ MID-CAP STOCKS (SECTOR DRILL-DOWN) ═══════════════════
  mid_cap_stocks: {
    title: "Verified SEBI Mid-Cap Growth Stocks by Sector",
    riskLevel: 6,
    note: "SEBI defines mid-caps as 101st to 250th companies by market cap (~₹15,000 Cr to ₹60,000 Cr). Requires active monitoring.",
    howToStart: "Invest via discount brokers (Zerodha, Groww, Angel One). Select sub-sectors based on earnings momentum.",
    sectors: {
      pharma: [
        { name: "Lupin Limited", provider: "NSE: LUPIN", rate: "~21.4% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹52,000 Cr m-cap). Leader in respiratory and complex generic formulations for US & India markets.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,150)", badge: "Pharma Leader" },
        { name: "Glenmark Pharmaceuticals", provider: "NSE: GLENMARK", rate: "~24.8% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹41,000 Cr m-cap). Strong API exports and respiratory pipeline across US, Europe, and LATAM.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,450)" },
        { name: "Laurus Labs", provider: "NSE: LAURUSLABS", rate: "~15.2% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹23,000 Cr m-cap). Rapidly scaling CDMO synthesis and active pharmaceutical ingredients.", platform: "Any Stock Broker", minInvestment: "1 share (~₹430)" },
        { name: "IPCA Laboratories", provider: "NSE: IPCALAB", rate: "~18.6% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹34,000 Cr m-cap). Domestic formulation leader with strong active API manufacturing footprint.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,320)" }
      ],
      metals: [
        { name: "Jindal Stainless", provider: "NSE: JSL", rate: "~38.5% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹58,000 Cr m-cap). India's largest stainless steel manufacturer with high EBITDA/ton realization.", platform: "Any Stock Broker", minInvestment: "1 share (~₹710)", badge: "Metals Top Pick" },
        { name: "National Aluminium (NALCO)", provider: "NSE: NATIONALUM", rate: "~26.2% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹35,000 Cr m-cap). Integrated PSU bauxite-alumina producer benefiting from global metal prices.", platform: "Any Stock Broker", minInvestment: "1 share (~₹190)" },
        { name: "Hindustan Copper", provider: "NSE: HINDCOPPER", rate: "~32.1% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹28,000 Cr m-cap). Only vertically integrated copper miner in India benefiting from EV/grid demand.", platform: "Any Stock Broker", minInvestment: "1 share (~₹290)" }
      ],
      banking: [
        { name: "Federal Bank", provider: "NSE: FEDERALBNK", rate: "~18.4% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹48,000 Cr m-cap). Strong retail deposit franchise with industry-leading asset quality (<2.1% GNPA).", platform: "Any Stock Broker", minInvestment: "1 share (~₹195)", badge: "Banking Quality" },
        { name: "AU Small Finance Bank", provider: "NSE: AUBANK", rate: "~16.2% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹46,000 Cr m-cap). Fast-growing retail liabilities and commercial vehicle lending franchise.", platform: "Any Stock Broker", minInvestment: "1 share (~₹640)" },
        { name: "IDFC First Bank", provider: "NSE: IDFCFIRSTB", rate: "~17.8% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹51,000 Cr m-cap). High CASA ratio (~46%) and rapid credit expansion post Capital First merger.", platform: "Any Stock Broker", minInvestment: "1 share (~₹72)" }
      ],
      auto: [
        { name: "Uno Minda Limited", provider: "NSE: UNOMINDA", rate: "~28.6% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹55,000 Cr m-cap). Tier-1 automotive supplier leading EV lighting, switches, and alloy wheels.", platform: "Any Stock Broker", minInvestment: "1 share (~₹960)", badge: "EV Ancillary" },
        { name: "Balkrishna Industries", provider: "NSE: BALKRISIND", rate: "~14.2% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹54,000 Cr m-cap). Global off-highway tire exporter with high operating cash flows.", platform: "Any Stock Broker", minInvestment: "1 share (~₹2,800)" }
      ],
      it: [
        { name: "Persistent Systems", provider: "NSE: PERSISTENT", rate: "~42.1% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹82,000 Cr m-cap). Premium software product engineering and enterprise AI cloud solutions.", platform: "Any Stock Broker", minInvestment: "1 share (~₹5,300)", badge: "High Growth IT" },
        { name: "Coforge Limited", provider: "NSE: COFORGE", rate: "~21.5% (3Y CAGR)", highlight: "Verified SEBI Mid-Cap (~₹41,000 Cr m-cap). Focused domain expertise in travel, transportation, and banking IT.", platform: "Any Stock Broker", minInvestment: "1 share (~₹6,200)" }
      ]
    },
    products: [
      { name: "Jindal Stainless", provider: "NSE: JSL", rate: "~38.5% (3Y)", highlight: "Verified SEBI Mid-Cap (~₹58,000 Cr m-cap). India's largest stainless steel producer with low leverage.", platform: "Any Stock Broker", minInvestment: "1 share (~₹710)", badge: "Metals Leader" },
      { name: "Lupin Limited", provider: "NSE: LUPIN", rate: "~21.4% (3Y)", highlight: "Verified SEBI Mid-Cap (~₹52,000 Cr m-cap). Global respiratory and generic formulation specialist.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,150)", badge: "Pharma Leader" },
      { name: "Federal Bank", provider: "NSE: FEDERALBNK", rate: "~18.4% (3Y)", highlight: "Verified SEBI Mid-Cap (~₹48,000 Cr m-cap). Consistently high ROA and ROE private sector mid-cap bank.", platform: "Any Stock Broker", minInvestment: "1 share (~₹195)", badge: "Banking Pick" },
      { name: "Uno Minda", provider: "NSE: UNOMINDA", rate: "~28.6% (3Y)", highlight: "Verified SEBI Mid-Cap (~₹55,000 Cr m-cap). Leading automotive components and EV powertrain supplier.", platform: "Any Stock Broker", minInvestment: "1 share (~₹960)" },
      { name: "Persistent Systems", provider: "NSE: PERSISTENT", rate: "~42.1% (3Y)", highlight: "Verified SEBI Mid-Cap (~₹82,000 Cr m-cap). Fast-growing digital product engineering specialist.", platform: "Any Stock Broker", minInvestment: "1 share (~₹5,300)" }
    ]
  },

  // ═══════════════════ MANUFACTURING SECTOR FUNDS ═══════════════════
  mfg_sector_mf: {
    title: "Best Manufacturing Sector Mutual Funds",
    riskLevel: 6,
    note: "Focuses on Make-in-India themes: industrial capital goods, electronics manufacturing, defense, and auto.",
    howToStart: "Invest in direct plans via AMC websites or zero-commission platforms like Groww and Zerodha Coin.",
    products: [
      { name: "ICICI Pru Manufacturing Fund", provider: "ICICI Prudential AMC", rate: "~26.4% (3Y)", highlight: "AUM ~₹5,800 Cr. Focused on industrial capital goods, auto ancillaries, and defense manufacturing.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "HDFC Manufacturing Fund", provider: "HDFC AMC", rate: "~24.8% (3Y)", highlight: "AUM ~₹4,200 Cr. High exposure to electronics manufacturing services (EMS) and heavy machinery.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Axis India Manufacturing Fund", provider: "Axis AMC", rate: "~23.1% (3Y)", highlight: "AUM ~₹3,100 Cr. Balanced growth portfolio across chemical processing and industrial manufacturing.", platform: "Axis MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "SBI Manufacturing Opportunities Fund", provider: "SBI MF", rate: "~22.5% (3Y)", highlight: "AUM ~₹2,900 Cr. Backed by SBI MF's extensive industrial equity research team.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "Mirae Asset Manufacturing Fund", provider: "Mirae Asset AMC", rate: "~21.9% (3Y)", highlight: "AUM ~₹1,800 Cr. Quality-first stock selection targeting export-oriented manufacturing leaders.", platform: "Mirae MF / Kuvera", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ DEFENCE SECTOR FUNDS ═══════════════════
  defence_sector_mf: {
    title: "Best Defence Sector Mutual Funds & Index Funds",
    riskLevel: 6,
    note: "Beneficiaries of indigenization, defence procurement expansion, and HAL/BEL export contracts.",
    howToStart: "Invest via AMC portal or discount brokers. Official scheme names verified against SEBI filings.",
    products: [
      { name: "Motilal Oswal Nifty India Defence Index Fund", provider: "Motilal Oswal AMC", rate: "~64.2% (1Y)", highlight: "Official AMC Scheme (launched June 2024). Tracks Nifty India Defence Index (HAL, BEL, Mazagon Dock, Solar Ind).", platform: "Motilal Oswal MF / Groww", minInvestment: "₹500 SIP", badge: "Official Scheme" },
      { name: "HDFC Defence Fund", provider: "HDFC AMC", rate: "~58.7% (1Y)", highlight: "Active equity scheme focusing on domestic defence equipment manufacturing and shipbuilding order books.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Active Alpha" },
      { name: "ICICI Pru Housing & Defence Allocation", provider: "ICICI Prudential AMC", rate: "~38.4% (1Y)", highlight: "Thematic hybrid fund allocating between infrastructure/defence suppliers and real estate equipment.", platform: "ICICI Direct / Coin", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ BONDS SUB-CATEGORIES ═══════════════════
  bonds: {
    title: "Verified Indian Bond Investments by Sub-Category",
    riskLevel: 2,
    note: "Post Finance Act 2023: Bond returns are taxed at your income slab rate. Match holding period to maturity.",
    howToStart: "Use RBI Retail Direct for G-Secs, or specialized bond portals (GoldenPi, Wint Wealth) for corporate bonds.",
    subCategories: {
      sovereign_gsec: [
        { name: "RBI 91-Day Treasury Bill (T-Bill)", provider: "Reserve Bank of India", rate: "6.85%", highlight: "Zero credit risk. Issued at discount to face value directly by Government of India.", platform: "RBI Retail Direct", minInvestment: "₹10,000", tenure: "91 days", badge: "100% Sovereign" },
        { name: "10-Year Benchmark G-Sec (7.18% GS 2033)", provider: "Reserve Bank of India", rate: "7.18%", highlight: "The sovereign benchmark bond. Semi-annual interest paid directly into your bank account.", platform: "RBI Retail Direct / Kite", minInvestment: "₹10,000", tenure: "10 years" }
      ],
      aaa_corporate: [
        { name: "HDFC Bank AAA Corporate Bond", provider: "HDFC Bank Ltd", rate: "7.75%", highlight: "Highest credit rating (CRISIL AAA). High liquidity and semi-annual coupon payouts.", platform: "GoldenPi / Wint Wealth", minInvestment: "₹10,000", tenure: "3 years", badge: "CRISIL AAA" },
        { name: "L&T Finance AAA Debenture", provider: "L&T Finance", rate: "8.10%", highlight: "CRISIL AAA rated corporate NCD backed by Larsen & Toubro Group's balance sheet.", platform: "GoldenPi / Broker", minInvestment: "₹10,000", tenure: "5 years" }
      ],
      section_54ec: [
        { name: "REC Section 54EC Capital Gains Bond", provider: "Rural Electrification Corp", rate: "5.25%", highlight: "Official Section 54EC tax saver for property capital gains. 5-year lock-in. Fully tax-exempt gains.", platform: "REC Official Portal / Bank", minInvestment: "₹20,000", tenure: "5 years", badge: "Official 54EC" },
        { name: "PFC Section 54EC Capital Gains Bond", provider: "Power Finance Corp", rate: "5.25%", highlight: "Government-backed 54EC bond. Save LTCG tax on property sales up to ₹50 Lakh per FY.", platform: "PFC Official Portal / Bank", minInvestment: "₹20,000", tenure: "5 years", badge: "Official 54EC" },
        { name: "IRFC Section 54EC Capital Gains Bond", provider: "Indian Railway Finance Corp", rate: "5.25%", highlight: "Official 54EC issuer under Ministry of Railways. Direct sovereign comfort with 5Y lock-in.", platform: "IRFC Portal / Bank", minInvestment: "₹20,000", tenure: "5 years", badge: "Official 54EC" }
      ],
      tax_free_bonds: [
        { name: "NHAI 8.20% Tax-Free Bond", provider: "National Highways Authority", rate: "8.20% (Tax-Free)", highlight: "100% Tax-Free annual interest Payout. Listed on NSE/BSE secondary market.", platform: "GoldenPi / Broker", minInvestment: "₹10,000", tenure: "10–15 years", badge: "100% Tax-Free" },
        { name: "REC 8.30% Tax-Free Bond", provider: "Rural Electrification Corp", rate: "8.30% (Tax-Free)", highlight: "Sovereign PSU tax-free interest bond with zero TDS and zero income tax liability.", platform: "GoldenPi / Broker", minInvestment: "₹10,000", tenure: "15 years", badge: "100% Tax-Free" },
        { name: "PFC 8.20% Tax-Free Bond", provider: "Power Finance Corp", rate: "8.20% (Tax-Free)", highlight: "High coupon tax-free bond backed by Power Finance Corporation.", platform: "GoldenPi / Broker", minInvestment: "₹10,000", tenure: "10 years" }
      ],
      psu_bonds: [
        { name: "SBI Tier-2 Perpetual Bond", provider: "State Bank of India", rate: "7.95%", highlight: "Institutional-grade PSU bank bond offering attractive yield with high safety.", platform: "GoldenPi / Broker", minInvestment: "₹1,00,000", tenure: "10 years", badge: "PSU Banking" },
        { name: "NABARD Rural Infrastructure Bond", provider: "NABARD (Govt PSU)", rate: "7.60%", highlight: "Government-owned PSU bond supporting rural infrastructure and agricultural development.", platform: "GoldenPi / Bank Branch", minInvestment: "₹10,000", tenure: "3–5 years", badge: "Govt PSU" }
      ]
    },
    products: [
      { name: "REC Section 54EC Capital Gains Bond", provider: "Rural Electrification Corp", rate: "5.25%", highlight: "Exempts capital gains tax under Section 54EC on property sales up to ₹50L. 5Y lock-in.", platform: "REC Portal / Bank", minInvestment: "₹20,000", tenure: "5 years", badge: "Official 54EC" },
      { name: "RBI 10-Year Benchmark G-Sec", provider: "Reserve Bank of India", rate: "7.18%", highlight: "100% sovereign safety. Direct RBI Retail Direct access with zero commission.", platform: "RBI Retail Direct", minInvestment: "₹10,000", tenure: "10 years", badge: "Sovereign" },
      { name: "HDFC Bank AAA Corporate Bond", provider: "HDFC Bank", rate: "7.75%", highlight: "CRISIL AAA rating. Highest safety among private corporate fixed income.", platform: "GoldenPi / Wint Wealth", minInvestment: "₹10,000", tenure: "3 years" },
      { name: "NABARD Rural Infrastructure Bond", provider: "NABARD", rate: "7.60%", highlight: "Government PSU bond with attractive annual interest payouts.", platform: "GoldenPi / Bank Branch", minInvestment: "₹10,000", tenure: "5 years" }
    ]
  },

  // ═══════════════════ ETF SUB-CATEGORIES ═══════════════════
  etf: {
    title: "Verified Indian Exchange Traded Funds (ETFs) by Category",
    riskLevel: 4,
    note: "Tradeable live during stock exchange hours on NSE/BSE. Lower expense ratios than mutual funds.",
    howToStart: "Open a Demat account with Zerodha, Groww, or Angel One. Search by ticker name.",
    subCategories: {
      broad_market: [
        { name: "Nippon India Nifty BeES", provider: "Nippon India AMC", rate: "~11.2% (5Y)", highlight: "Ticker: NIFTYBEES. India's largest and most liquid ETF with ~₹30,000 Cr AUM. Expense ratio: 0.04%.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹260)", badge: "Most Liquid" },
        { name: "ICICI Pru Nifty 50 ETF", provider: "ICICI Prudential AMC", rate: "~11.2% (5Y)", highlight: "Ticker: ICICINIFTY. Lowest expense ratio in India at 0.02% (Direct).", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹260)", badge: "Lowest Cost" }
      ],
      sectoral_thematic: [
        { name: "Nifty Bank ETF (BANKBEES)", provider: "Nippon India AMC", rate: "~12.8% (5Y)", highlight: "Tracks top 12 banking stocks in India. High liquidity on NSE/BSE.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹510)", badge: "Sector Benchmark" },
        { name: "Motilal Oswal Nifty India Defence Index Fund", provider: "Motilal Oswal AMC", rate: "~64.2% (1Y)", highlight: "Official AMC Scheme tracking Defence order books and manufacturing.", platform: "Motilal Oswal / Broker", minInvestment: "1 unit (~₹25)", badge: "Official Scheme" }
      ],
      smart_beta: [
        { name: "Nifty200 Alpha 30 ETF", provider: "ICICI Prudential AMC", rate: "~19.4% (3Y)", highlight: "Factor ETF selecting top 30 momentum stocks from Nifty 200 index.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹45)", badge: "Factor Alpha" },
        { name: "Nifty100 Low Volatility 30 ETF", provider: "ICICI Prudential AMC", rate: "~15.6% (3Y)", highlight: "Smart-beta ETF picking lowest volatility large-caps to minimize drawdowns.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹60)" }
      ],
      commodity: [
        { name: "Nippon India Gold BeES", provider: "Nippon India AMC", rate: "~25.9% (5Y)", highlight: "Ticker: GOLDBEES. Physical gold backed by 99.5% pure vault gold. 0.79% expense ratio.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)", badge: "Gold Leader" },
        { name: "HDFC Silver ETF", provider: "HDFC AMC", rate: "~28.1% (1Y)", highlight: "Tracks physical silver prices stored in LBMA vaults. Industrial & monetary demand.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹90)" }
      ],
      international: [
        { name: "Motilal Oswal Nasdaq 100 ETF", provider: "Motilal Oswal AMC", rate: "~22.4% (5Y)", highlight: "Ticker: N100. Direct INR exposure to Apple, Microsoft, Nvidia, and Meta.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹175)", badge: "US Tech" },
        { name: "Mirae Asset S&P 500 Top 50 ETF", provider: "Mirae Asset AMC", rate: "~18.2% (5Y)", highlight: "Tracks the 50 largest blue-chip companies in the US S&P 500 index.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹65)" }
      ]
    },
    products: [
      { name: "Nippon India Nifty BeES", provider: "Nippon India AMC", rate: "~11.2% (5Y)", highlight: "Ticker: NIFTYBEES. Gold standard for Nifty 50 passive index tracking.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹260)", badge: "Most Liquid" },
      { name: "Nippon India Gold BeES", provider: "Nippon India AMC", rate: "~25.9% (5Y)", highlight: "Ticker: GOLDBEES. 100% physical gold backed by LBMA vaults.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹75)", badge: "Safe Haven" },
      { name: "Motilal Oswal Nifty India Defence Index Fund", provider: "Motilal Oswal AMC", rate: "~64.2% (1Y)", highlight: "Official AMC Scheme tracking Defence manufacturing leaders.", platform: "Motilal Oswal / Broker", minInvestment: "1 unit (~₹25)" }
    ]
  },

  // ═══════════════════ REITS & INVITS ═══════════════════
  reit: {
    title: "Best Indian Real Estate Investment Trusts (REITs) & InvITs",
    riskLevel: 3,
    note: "SEBI mandated: REITs & InvITs must distribute 90%+ of net cash flows as quarterly dividends/interest. Taxed based on dividend vs interest vs capital repayment split.",
    howToStart: "Buy units on NSE/BSE via Zerodha, Groww, or Angel One during market hours.",
    subCategories: {
      office_reits: [
        { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Distribution Yield)", highlight: "India's largest office REIT with 45M+ sq ft grade-A office space in Bengaluru, Mumbai, Pune, and NCR.", platform: "Zerodha / Groww / Angel One", minInvestment: "1 unit (~₹360)", badge: "Largest REIT" },
        { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Distribution Yield)", highlight: "Prime commercial office portfolio across Mumbai Region, Hyderabad, Pune, and Chennai.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹350)", badge: "High Occupancy" },
        { name: "Brookfield India Real Estate Trust", provider: "NSE: BIRET", rate: "~8.8% (Distribution Yield)", highlight: "Institutional office park portfolio across Gurugram, Noida, Mumbai, and Bengaluru.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹280)", badge: "Highest Yield" }
      ],
      retail_reits: [
        { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Distribution Yield)", highlight: "India's 1st retail mall REIT owning 17 premium shopping malls across 14 major cities.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹135)", badge: "Retail Leader" }
      ],
      infrastructure_invits: [
        { name: "India Grid Trust (IndiGrid)", provider: "NSE: INDIGRID", rate: "~10.5% (Distribution Yield)", highlight: "Power transmission & solar assets providing highly predictable AAA-backed quarterly cash distributions.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹140)", badge: "Top InvIT Yield" },
        { name: "PowerGrid Infrastructure Investment Trust", provider: "NSE: PGINVIT", rate: "~9.8% (Distribution Yield)", highlight: "Sovereign-backed power transmission InvIT sponsored by Power Grid Corporation of India.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹98)", badge: "Govt Sponsored" }
      ]
    },
    products: [
      { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "India's largest commercial REIT (~45M sq ft). High quarterly dividend payouts.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹360)", badge: "Largest REIT" },
      { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "Grade-A tech parks in Hyderabad, Mumbai & Pune with high multinational tenant retention.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹350)" },
      { name: "Brookfield India REIT", provider: "NSE: BIRET", rate: "~8.8% (Yield)", highlight: "Institutional grade office parks with attractive quarterly distribution yield.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹280)", badge: "Highest Yield" },
      { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "India's premier retail mall REIT with strong footfall and rental growth.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹135)" },
      { name: "India Grid Trust (IndiGrid InvIT)", provider: "NSE: INDIGRID", rate: "~10.5% (Yield)", highlight: "Power transmission grid asset yielding ~10.5% annual cash distributions.", platform: "Zerodha / Groww", minInvestment: "1 unit (~₹140)", badge: "Top InvIT Yield" }
    ]
  },
  embassy_reit: {
    title: "Embassy Office Parks REIT — Investment Pathway",
    riskLevel: 3,
    note: "India's pioneer listed REIT holding ~45M sq ft of Grade-A commercial office space. Quarterly tax-efficient payouts.",
    howToStart: "Buy units directly on NSE/BSE via discount or full-service brokers.",
    products: [
      { name: "Embassy Office Parks REIT (Direct Purchase)", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "Direct stock exchange purchase. Quarterly rental distribution credited straight to your bank account.", platform: "Zerodha / Groww / Broker", minInvestment: "1 unit (~₹360)", badge: "Top Pick" },
      { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "Alternative Grade-A office REIT focused on Mumbai and Hyderabad tech hubs.", platform: "Stock Broker App", minInvestment: "1 unit (~₹350)" },
      { name: "Brookfield India Real Estate Trust", provider: "NSE: BIRET", rate: "~8.8% (Yield)", highlight: "Alternative office REIT with assets in NCR and Mumbai.", platform: "Stock Broker App", minInvestment: "1 unit (~₹280)" },
      { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "Retail mall REIT diversification option.", platform: "Stock Broker App", minInvestment: "1 unit (~₹135)" },
      { name: "India Grid Trust InvIT", provider: "NSE: INDIGRID", rate: "~10.5% (Yield)", highlight: "High-yield power transmission infrastructure alternative.", platform: "Stock Broker App", minInvestment: "1 unit (~₹140)" }
    ]
  },

  // ═══════════════════ LARGE CAP / BLUECHIP STOCKS ═══════════════════
  bluechip_stocks: {
    title: "Verified Nifty 50 Blue-Chip Stocks by Sector",
    riskLevel: 5,
    note: "Top 100 Indian companies by market capitalization. Stable balance sheets with long-term compound growth.",
    howToStart: "Invest via discount brokers (Zerodha, Groww, Angel One). Select sub-sectors based on preference.",
    sectors: {
      banking: [
        { name: "HDFC Bank", provider: "NSE: HDFCBANK", rate: "~15.2% (5Y)", highlight: "India's largest private bank with ~₹35L Cr balance sheet and GNPA <1.4%.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,900)", badge: "Banking Leader" },
        { name: "ICICI Bank", provider: "NSE: ICICIBANK", rate: "~22.4% (5Y)", highlight: "Top performer among large-cap banks with robust ROA (>2.2%) and digital credit growth.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,250)", badge: "Top Growth" },
        { name: "State Bank of India", provider: "NSE: SBIN", rate: "~21.8% (5Y)", highlight: "India's largest PSU bank backed by sovereign trust and 22,000+ branch footprint.", platform: "Any Stock Broker", minInvestment: "1 share (~₹840)" }
      ],
      it_services: [
        { name: "TCS (Tata Consultancy Services)", provider: "NSE: TCS", rate: "~12.6% (5Y)", highlight: "World's 2nd largest IT exporter with zero debt and ₹60,000 Cr cash reserves.", platform: "Any Stock Broker", minInvestment: "1 share (~₹3,800)", badge: "Zero Debt" },
        { name: "Infosys", provider: "NSE: INFY", rate: "~13.1% (5Y)", highlight: "Enterprise digital transformation leader with strong cloud & generative AI pipeline.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,500)" }
      ],
      conglomerate_energy: [
        { name: "Reliance Industries", provider: "NSE: RELIANCE", rate: "~16.5% (5Y)", highlight: "India's largest company (~₹20L Cr m-cap) spanning Telecom (Jio), Retail, and New Energy.", platform: "Any Stock Broker", minInvestment: "1 share (~₹1,300)", badge: "Largest M-Cap" },
        { name: "Larsen & Toubro (L&T)", provider: "NSE: LT", rate: "~24.2% (5Y)", highlight: "India's premier engineering & infrastructure conglomerate with massive order backlog.", platform: "Any Stock Broker", minInvestment: "1 share (~₹3,600)" }
      ]
    },
    products: [
      { name: "Reliance Industries", provider: "NSE: RELIANCE", rate: "~16.5% (5Y)", highlight: "India's largest market-cap company across Telecom (Jio), Retail, and Green Energy.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,300)", badge: "Largest M-Cap" },
      { name: "HDFC Bank", provider: "NSE: HDFCBANK", rate: "~15.2% (5Y)", highlight: "India's most trusted private bank with 20+ years of 15%+ compounding.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,900)", badge: "Banking Leader" },
      { name: "TCS", provider: "NSE: TCS", rate: "~12.6% (5Y)", highlight: "Zero-debt IT titan from Tata Group paying consistent quarterly dividends.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹3,800)", badge: "Zero Debt" },
      { name: "ICICI Bank", provider: "NSE: ICICIBANK", rate: "~22.4% (5Y)", highlight: "Industry-leading digital banking ROE and retail credit growth.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,250)" },
      { name: "Larsen & Toubro (L&T)", provider: "NSE: LT", rate: "~24.2% (5Y)", highlight: "India's mega infrastructure builder capturing domestic capital expenditure boom.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹3,600)" }
    ]
  },
  large_cap_stocks: {
    title: "Verified Nifty 50 Blue-Chip Stocks",
    riskLevel: 5,
    note: "Top 100 Indian market leaders. High liquidity and lower drawdown risk compared to mid/small caps.",
    howToStart: "Buy shares on NSE/BSE via Zerodha, Groww, or Angel One.",
    products: [
      { name: "Reliance Industries", provider: "NSE: RELIANCE", rate: "~16.5% (5Y)", highlight: "India's largest company across Telecom, Retail, and Oil-to-Chemicals.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,300)", badge: "Top Pick" },
      { name: "HDFC Bank", provider: "NSE: HDFCBANK", rate: "~15.2% (5Y)", highlight: "Private banking gold standard with robust asset quality.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,900)" },
      { name: "ICICI Bank", provider: "NSE: ICICIBANK", rate: "~22.4% (5Y)", highlight: "Top ROA growth in Indian banking sector.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,250)" },
      { name: "TCS", provider: "NSE: TCS", rate: "~12.6% (5Y)", highlight: "Zero-debt IT giant with 70%+ dividend payout ratio.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹3,800)" },
      { name: "Infosys", provider: "NSE: INFY", rate: "~13.1% (5Y)", highlight: "Global IT leader with strong AI transformation contracts.", platform: "Zerodha / Groww", minInvestment: "1 share (~₹1,500)" }
    ]
  },

  // ═══════════════════ FOCUSED EQUITY MUTUAL FUNDS ═══════════════════
  focused_mf: {
    title: "Best Focused Equity Mutual Funds (Max 30 Stocks)",
    riskLevel: 6,
    note: "Concentrated stock selection (max 25-30 stocks). Higher return potential through high-conviction portfolio bets.",
    howToStart: "Invest in direct-growth plans via AMC portal or platforms like Groww and Zerodha Coin.",
    products: [
      { name: "360 ONE Focused Equity Fund", provider: "360 ONE AMC", rate: "~21.4% (5Y)", highlight: "AUM ~₹7,200 Cr. High-conviction 25-stock portfolio focused on market leaders with pricing power.", platform: "360 ONE / Groww / Coin", minInvestment: "₹500 SIP", badge: "Category Leader" },
      { name: "HDFC Focused 30 Fund", provider: "HDFC AMC", rate: "~22.8% (5Y)", highlight: "AUM ~₹11,500 Cr. Value-oriented concentrated bets managed by Roshi Jain. Strong alpha generation.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Top Track Record" },
      { name: "ICICI Pru Focused Equity Fund", provider: "ICICI Prudential AMC", rate: "~19.6% (5Y)", highlight: "AUM ~₹8,400 Cr. Dynamic multi-cap allocation constrained to 30 top conviction stocks.", platform: "ICICI Direct / Coin", minInvestment: "₹100 SIP" },
      { name: "Quant Focused Fund", provider: "Quant AMC", rate: "~23.1% (5Y)", highlight: "AUM ~₹1,200 Cr. Quant-driven momentum rotation across top liquid equities.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Return" },
      { name: "SBI Focused Equity Fund", provider: "SBI MF", rate: "~18.2% (5Y)", highlight: "AUM ~₹33,000 Cr. Conservative large-cap biased concentrated portfolio backed by SBI research.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ FLEXI CAP MUTUAL FUNDS ═══════════════════
  flexi_cap_mf: {
    title: "Best Flexi Cap Mutual Funds",
    riskLevel: 5,
    note: "Fund manager has complete freedom to dynamically shift between large, mid, and small cap stocks without regulatory caps.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "Parag Parikh Flexi Cap Fund", provider: "PPFAS AMC", rate: "~21.5% (5Y)", highlight: "AUM ~₹72,000 Cr. Includes 15-20% US equity allocation (Alphabet, Microsoft, Amazon). Value investing gold standard.", platform: "PPFAS Portal / Groww / Kuvera", minInvestment: "₹1,000 SIP", badge: "Category Leader" },
      { name: "HDFC Flexi Cap Fund", provider: "HDFC AMC", rate: "~23.4% (5Y)", highlight: "AUM ~₹62,000 Cr. Managed by Roshi Jain. Strong outperformance in industrial, banking, and energy themes.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Top Track Record" },
      { name: "JM Flexi Cap Fund", provider: "JM Financial AMC", rate: "~25.2% (5Y)", highlight: "AUM ~₹3,400 Cr. Aggressive momentum growth strategy with high turnover and high alpha.", platform: "JM MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Return" },
      { name: "Quant Flexi Cap Fund", provider: "Quant AMC", rate: "~24.1% (5Y)", highlight: "AUM ~₹7,800 Cr. Predictive analytics framework for agile market-cap rotation.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP" },
      { name: "SBI Flexi Cap Fund", provider: "SBI MF", rate: "~17.8% (5Y)", highlight: "AUM ~₹21,000 Cr. Process-driven large and mid-cap blend for stable long-term compounding.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ LARGE CAP MUTUAL FUNDS ═══════════════════
  large_cap_mf: {
    title: "Best Large-Cap Mutual Funds",
    riskLevel: 4,
    note: "Mandated to invest 80%+ in Nifty 100 top companies. Low drawdown volatility for conservative equity investors.",
    howToStart: "Invest via AMC portal or zero-commission mutual fund apps.",
    products: [
      { name: "ICICI Pru Bluechip Fund", provider: "ICICI Prudential AMC", rate: "~18.2% (5Y)", highlight: "AUM ~₹58,000 Cr. India's premier large-cap equity fund with ultra-stable large-cap portfolio.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "Nippon India Large Cap Fund", provider: "Nippon India AMC", rate: "~19.5% (5Y)", highlight: "AUM ~₹31,000 Cr. High active share over Nifty 50 with disciplined sector weights.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Top Return" },
      { name: "HDFC Top 100 Fund", provider: "HDFC AMC", rate: "~18.6% (5Y)", highlight: "AUM ~₹35,000 Cr. Legacy blue-chip fund focused on market leaders with strong cash flows.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Mirae Asset Large Cap Fund", provider: "Mirae Asset AMC", rate: "~16.4% (5Y)", highlight: "AUM ~₹41,000 Cr. Quality growth selection across banking, IT, and consumer giants.", platform: "Mirae MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "SBI Bluechip Fund", provider: "SBI MF", rate: "~16.8% (5Y)", highlight: "AUM ~₹48,000 Cr. Conservative blue-chip portfolio backed by SBI MF research.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ PHARMA SECTOR FUNDS ═══════════════════
  pharma_sector_mf: {
    title: "Best Pharma & Healthcare Sector Funds",
    riskLevel: 6,
    note: "Focuses on Indian pharmaceutical exporters, hospital chains, and active pharmaceutical ingredient (API) manufacturers.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "Nippon India Pharma Fund", provider: "Nippon India AMC", rate: "~22.8% (5Y)", highlight: "AUM ~₹7,500 Cr. Category benchmark leader with deep research in US FDA approved formulation facilities.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "ICICI Pru Healthcare Fund", provider: "ICICI Prudential AMC", rate: "~21.4% (5Y)", highlight: "AUM ~₹5,200 Cr. High exposure to domestic diagnostic networks and private hospital chains.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" },
      { name: "Tata India Pharma & Healthcare Fund", provider: "Tata AMC", rate: "~20.6% (5Y)", highlight: "AUM ~₹1,800 Cr. Balanced growth portfolio across API manufacturing and specialty biotech.", platform: "Tata MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "SBI Healthcare Opportunities Fund", provider: "SBI MF", rate: "~19.8% (5Y)", highlight: "AUM ~₹3,100 Cr. Conservative healthcare theme portfolio backed by SBI research.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "UTI Healthcare Fund", provider: "UTI AMC", rate: "~19.2% (5Y)", highlight: "AUM ~₹1,200 Cr. Long-standing pharmaceutical fund focused on high ROE pharma exporters.", platform: "UTI MF / Groww", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ INFRASTRUCTURE SECTOR FUNDS ═══════════════════
  infra_sector_mf: {
    title: "Best Infrastructure Sector Mutual Funds",
    riskLevel: 6,
    note: "Focuses on power generation, capital goods, cement, ports, railways, and national highway construction.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "ICICI Pru Infrastructure Fund", provider: "ICICI Prudential AMC", rate: "~28.4% (5Y)", highlight: "AUM ~₹6,100 Cr. Top 5Y performer benefiting from India's national capital expenditure expansion.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "HDFC Infrastructure Fund", provider: "HDFC AMC", rate: "~26.8% (5Y)", highlight: "AUM ~₹3,500 Cr. Concentrated bets on power utilities, defense suppliers, and engineering giants.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Top Track Record" },
      { name: "Kotak Infrastructure & Economic Reform", provider: "Kotak AMC", rate: "~25.2% (5Y)", highlight: "AUM ~₹2,800 Cr. Capitalizes on public sector spending and logistics corridor construction.", platform: "Kotak MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "Nippon India Power & Infra Fund", provider: "Nippon India AMC", rate: "~27.1% (5Y)", highlight: "AUM ~₹5,400 Cr. Specialized focus on renewable energy, transmission grids, and power equipment.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP" },
      { name: "SBI Infrastructure Fund", provider: "SBI MF", rate: "~23.5% (5Y)", highlight: "AUM ~₹4,200 Cr. Value-driven infrastructure fund capturing government capex mandates.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" }
    ]
  },

  // ═══════════════════ BANKING SECTOR FUNDS ═══════════════════
  banking_sector_mf: {
    title: "Best Banking & Financial Services Mutual Funds",
    riskLevel: 6,
    note: "Focuses on private commercial banks, PSU banks, NBFCs, housing finance, and wealth management companies.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "Nippon India Banking & Financial Services", provider: "Nippon India AMC", rate: "~18.6% (5Y)", highlight: "AUM ~₹5,900 Cr. Deep research across Tier-1 private banks and high-growth retail NBFCs.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "ICICI Pru Banking & Financial Services", provider: "ICICI Prudential AMC", rate: "~17.8% (5Y)", highlight: "AUM ~₹7,400 Cr. Dynamic valuation-based allocation between private and public sector banks.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" },
      { name: "HDFC Banking & Financial Services Fund", provider: "HDFC AMC", rate: "~16.9% (5Y)", highlight: "AUM ~₹4,100 Cr. Concentrated quality bank bets with strong balance sheet underwriting.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "SBI Banking & Financial Services Fund", provider: "SBI MF", rate: "~16.2% (5Y)", highlight: "AUM ~₹5,100 Cr. Captures financial inclusion growth and credit penetration in Tier 2/3 India.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "Axis Banking & Financial Services Fund", provider: "Axis AMC", rate: "~15.4% (5Y)", highlight: "AUM ~₹2,600 Cr. Focuses on tech-first private banks and asset management companies.", platform: "Axis MF / Kuvera", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ IT SECTOR FUNDS ═══════════════════
  it_sector_mf: {
    title: "Best Technology & IT Sector Mutual Funds",
    riskLevel: 6,
    note: "Focuses on global software services exporters, cloud engineering specialists, and digital product firms.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "ICICI Pru Technology Fund", provider: "ICICI Prudential AMC", rate: "~21.5% (5Y)", highlight: "AUM ~₹11,800 Cr. Category pioneer with top 5Y return tracking global tech transformation.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "Tata Digital India Fund", provider: "Tata AMC", rate: "~20.8% (5Y)", highlight: "AUM ~₹9,200 Cr. High allocation to mid-cap IT engineering firms with high margin growth.", platform: "Tata MF / Groww", minInvestment: "₹100 SIP", badge: "Top Track Record" },
      { name: "SBI Technology Opportunities Fund", provider: "SBI MF", rate: "~19.4% (5Y)", highlight: "AUM ~₹3,800 Cr. Large-cap IT biased portfolio (TCS, Infosys, HCL Tech) providing lower drawdowns.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "Franklin India Technology Fund", provider: "Franklin Templeton AMC", rate: "~19.1% (5Y)", highlight: "AUM ~₹1,400 Cr. Global tech allocation including US software leaders alongside Indian IT.", platform: "Franklin MF / Kuvera", minInvestment: "₹500 SIP" },
      { name: "Aditya Birla Sun Life Digital India Fund", provider: "Aditya Birla Sun Life AMC", rate: "~18.6% (5Y)", highlight: "AUM ~₹4,100 Cr. Concentrated IT services and telecom ecosystem portfolio.", platform: "ABSL MF / Groww", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ SPECIFIC REITS & INVITS ═══════════════════
  mindspace_reit: {
    title: "Mindspace Business Parks REIT — Investment Pathway",
    riskLevel: 3,
    note: "Grade-A commercial office parks across Mumbai Region, Hyderabad, Pune, and Chennai. 90%+ quarterly distribution mandate under SEBI.",
    howToStart: "Buy units directly on NSE/BSE via any stock broker during market hours.",
    products: [
      { name: "Mindspace Business Parks REIT (Direct Purchase)", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "India's 2nd largest office REIT. Quarterly rental distributions credited to your bank account.", platform: "Zerodha / Groww / Broker", minInvestment: "1 unit (~₹350)", badge: "Top Pick" },
      { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "India's largest REIT with 45M+ sq ft grade-A office space. Higher yield alternative.", platform: "Stock Broker App", minInvestment: "1 unit (~₹360)", badge: "Largest REIT" },
      { name: "Brookfield India Real Estate Trust", provider: "NSE: BIRET", rate: "~8.8% (Yield)", highlight: "Institutional office parks in Gurugram, Noida, Mumbai, and Bengaluru.", platform: "Stock Broker App", minInvestment: "1 unit (~₹280)" },
      { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "India's 1st retail mall REIT — diversification from office to consumer.", platform: "Stock Broker App", minInvestment: "1 unit (~₹135)" },
      { name: "India Grid Trust InvIT", provider: "NSE: INDIGRID", rate: "~10.5% (Yield)", highlight: "Power transmission grid InvIT with highest distribution yield among listed alternatives.", platform: "Stock Broker App", minInvestment: "1 unit (~₹140)" }
    ]
  },
  brookfield_reit: {
    title: "Brookfield India Real Estate Trust — Investment Pathway",
    riskLevel: 3,
    note: "Institutional-grade office parks sponsored by Brookfield Asset Management across Delhi-NCR, Mumbai, and Bengaluru.",
    howToStart: "Buy units on NSE/BSE via any stock broker. Quarterly distributions credited to demat-linked bank account.",
    products: [
      { name: "Brookfield India REIT (Direct Purchase)", provider: "NSE: BIRET", rate: "~8.8% (Yield)", highlight: "Highest yield office REIT in India. Institutional campus assets across premium tech corridors.", platform: "Zerodha / Groww / Broker", minInvestment: "1 unit (~₹280)", badge: "Highest Yield" },
      { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "India's largest listed REIT for diversification.", platform: "Stock Broker App", minInvestment: "1 unit (~₹360)" },
      { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "Grade-A tech parks in Hyderabad and Mumbai.", platform: "Stock Broker App", minInvestment: "1 unit (~₹350)" },
      { name: "PowerGrid InvIT", provider: "NSE: PGINVIT", rate: "~9.8% (Yield)", highlight: "Sovereign-backed power transmission InvIT.", platform: "Stock Broker App", minInvestment: "1 unit (~₹98)" },
      { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "Retail mall REIT diversification option.", platform: "Stock Broker App", minInvestment: "1 unit (~₹135)" }
    ]
  },
  nexus_reit: {
    title: "Nexus Select Trust REIT — Investment Pathway",
    riskLevel: 3,
    note: "India's 1st and only listed retail mall REIT. Owns 17 Grade-A urban consumption shopping centers across 14 cities.",
    howToStart: "Buy units on NSE/BSE via any stock broker. Quarterly distributions include rental income from anchor retailers.",
    products: [
      { name: "Nexus Select Trust REIT (Direct Purchase)", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "Unique consumption-theme REIT with anchor tenants like Zara, H&M, PVR, and Starbucks across 17 malls.", platform: "Zerodha / Groww / Broker", minInvestment: "1 unit (~₹135)", badge: "Retail Leader" },
      { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "Office REIT diversification — largest listed REIT in India.", platform: "Stock Broker App", minInvestment: "1 unit (~₹360)" },
      { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "Commercial office REIT alternative.", platform: "Stock Broker App", minInvestment: "1 unit (~₹350)" },
      { name: "India Grid Trust InvIT", provider: "NSE: INDIGRID", rate: "~10.5% (Yield)", highlight: "Highest yield InvIT for income-focused investors.", platform: "Stock Broker App", minInvestment: "1 unit (~₹140)", badge: "Highest Yield" },
      { name: "Brookfield India REIT", provider: "NSE: BIRET", rate: "~8.8% (Yield)", highlight: "Institutional office parks with strong quarterly distributions.", platform: "Stock Broker App", minInvestment: "1 unit (~₹280)" }
    ]
  },
  indigrid_invit: {
    title: "India Grid Trust (IndiGrid InvIT) — Investment Pathway",
    riskLevel: 3,
    note: "Power transmission & solar grid infrastructure InvIT sponsored by KKR / Sterlite Power. AAA-backed predictable quarterly cash distributions.",
    howToStart: "Buy units on NSE/BSE like stocks. Distributions (interest + principal repayment) credited quarterly.",
    products: [
      { name: "India Grid Trust InvIT (Direct Purchase)", provider: "NSE: INDIGRID", rate: "~10.5% (Yield)", highlight: "India's highest-yield listed InvIT. Transmission line assets with 25-year concession agreements providing highly predictable cash flows.", platform: "Zerodha / Groww / Broker", minInvestment: "1 unit (~₹140)", badge: "Highest Yield" },
      { name: "PowerGrid InvIT", provider: "NSE: PGINVIT", rate: "~9.8% (Yield)", highlight: "Sovereign-backed alternative InvIT sponsored by Power Grid Corporation of India.", platform: "Stock Broker App", minInvestment: "1 unit (~₹98)", badge: "Govt Sponsored" },
      { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "Office REIT — diversification from infrastructure to commercial real estate.", platform: "Stock Broker App", minInvestment: "1 unit (~₹360)" },
      { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "Grade-A tech park REIT alternative.", platform: "Stock Broker App", minInvestment: "1 unit (~₹350)" },
      { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "Retail mall REIT for consumer spending exposure.", platform: "Stock Broker App", minInvestment: "1 unit (~₹135)" }
    ]
  },
  powergrid_invit: {
    title: "PowerGrid Infrastructure Investment Trust — Investment Pathway",
    riskLevel: 2,
    note: "Sovereign-backed power transmission InvIT sponsored by Power Grid Corporation of India (Maharatna PSU). Quarterly distributions.",
    howToStart: "Buy units on NSE/BSE via any stock broker during market hours.",
    products: [
      { name: "PowerGrid InvIT (Direct Purchase)", provider: "NSE: PGINVIT", rate: "~9.8% (Yield)", highlight: "Government-backed transmission InvIT. Power Grid Corp transfers operating power lines with 35-year useful life into this trust.", platform: "Zerodha / Groww / Broker", minInvestment: "1 unit (~₹98)", badge: "Govt Sponsored" },
      { name: "India Grid Trust InvIT", provider: "NSE: INDIGRID", rate: "~10.5% (Yield)", highlight: "Higher-yield private sector power transmission InvIT backed by KKR.", platform: "Stock Broker App", minInvestment: "1 unit (~₹140)", badge: "Highest Yield" },
      { name: "Embassy Office Parks REIT", provider: "NSE: EMBASSY", rate: "~8.5% (Yield)", highlight: "Largest office REIT for real estate diversification.", platform: "Stock Broker App", minInvestment: "1 unit (~₹360)" },
      { name: "Mindspace Business Parks REIT", provider: "NSE: MINDSPACE", rate: "~8.2% (Yield)", highlight: "Commercial office REIT alternative.", platform: "Stock Broker App", minInvestment: "1 unit (~₹350)" },
      { name: "Nexus Select Trust REIT", provider: "NSE: NXST", rate: "~7.8% (Yield)", highlight: "Retail mall REIT for consumer spending exposure.", platform: "Stock Broker App", minInvestment: "1 unit (~₹135)" }
    ]
  },

  // ═══════════════════ VALUE / CONTRA MUTUAL FUNDS ═══════════════════
  value_mf: {
    title: "Best Value Equity Mutual Funds",
    riskLevel: 5,
    note: "Value funds buy undervalued stocks trading below intrinsic worth. Typically outperform in recovery & mean-reversion cycles.",
    howToStart: "Invest in direct-growth plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "ICICI Pru Value Discovery Fund", provider: "ICICI Prudential AMC", rate: "~22.4% (5Y)", highlight: "AUM ~₹46,000 Cr. India's largest value fund. Disciplined P/E & P/B based deep-value stock picking.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "HDFC Capital Builder Value Fund", provider: "HDFC AMC", rate: "~20.8% (5Y)", highlight: "AUM ~₹8,500 Cr. Multi-cap value approach targeting mean-reversion opportunities.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Nippon India Value Fund", provider: "Nippon India AMC", rate: "~21.2% (5Y)", highlight: "AUM ~₹8,100 Cr. Quantitative deep-value screening across mid and large caps.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP" },
      { name: "UTI Value Fund", provider: "UTI AMC", rate: "~19.5% (5Y)", highlight: "AUM ~₹10,800 Cr. Seasoned value investing approach with well-diversified sector allocation.", platform: "UTI MF / Kuvera", minInvestment: "₹500 SIP" },
      { name: "Tata Equity PE Fund", provider: "Tata AMC", rate: "~18.8% (5Y)", highlight: "AUM ~₹7,200 Cr. Invests in stocks with PE ratio below Nifty 50 trailing PE.", platform: "Tata MF / Groww", minInvestment: "₹100 SIP" }
    ]
  },
  contra_mf: {
    title: "Best Contra / Contrarian Mutual Funds",
    riskLevel: 5,
    note: "Contrarian funds buy out-of-favour stocks that the market has over-punished. Only 1 fund per AMC is allowed by SEBI in this category.",
    howToStart: "Invest in direct-growth plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "SBI Contra Fund", provider: "SBI MF", rate: "~24.6% (5Y)", highlight: "AUM ~₹38,000 Cr. India's most popular contrarian fund. Picks stocks beaten down by temporary cyclical issues with strong balance sheets.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP", badge: "Category Leader" },
      { name: "Kotak India EQ Contra Fund", provider: "Kotak AMC", rate: "~19.8% (5Y)", highlight: "AUM ~₹4,200 Cr. Focuses on out-of-favour large-caps with improving fundamentals.", platform: "Kotak MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "Invesco India Contra Fund", provider: "Invesco AMC", rate: "~21.2% (5Y)", highlight: "AUM ~₹14,200 Cr. Multi-cap contrarian bets on sectors facing temporary headwinds.", platform: "Invesco MF / Groww", minInvestment: "₹100 SIP" },
      { name: "ICICI Pru Value Discovery Fund", provider: "ICICI Prudential AMC", rate: "~22.4% (5Y)", highlight: "AUM ~₹46,000 Cr. Value fund with contrarian overlap — buys deeply discounted quality stocks.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" },
      { name: "HDFC Capital Builder Value Fund", provider: "HDFC AMC", rate: "~20.8% (5Y)", highlight: "AUM ~₹8,500 Cr. Value-oriented fund seeking mean-reversion in mid and large cap universe.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ GILT / GOVERNMENT BOND FUNDS ═══════════════════
  gilt_mf: {
    title: "Best Gilt Mutual Funds (Government Securities)",
    riskLevel: 2,
    note: "Zero credit risk — invests only in Government of India securities (G-Secs & SDLs). High interest rate sensitivity. Benefits most during rate-cut cycles.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "ICICI Pru Gilt Fund", provider: "ICICI Prudential AMC", rate: "~8.2% (5Y)", highlight: "AUM ~₹5,400 Cr. Active duration management across short and long G-Secs. Industry-leading risk management.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "SBI Magnum Gilt Fund", provider: "SBI MF", rate: "~8.0% (5Y)", highlight: "AUM ~₹10,800 Cr. Conservative gilt fund backed by SBI MF's deep government bond research.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "HDFC Gilt Fund", provider: "HDFC AMC", rate: "~7.8% (5Y)", highlight: "AUM ~₹3,200 Cr. Focus on 10-year benchmark G-Sec with high sensitivity to rate cuts.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Nippon India Gilt Securities Fund", provider: "Nippon India AMC", rate: "~7.5% (5Y)", highlight: "AUM ~₹2,400 Cr. Diversified SDL and G-Sec portfolio with quarterly interest accruals.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Kotak Gilt Fund", provider: "Kotak AMC", rate: "~7.6% (5Y)", highlight: "AUM ~₹3,800 Cr. Laddered G-Sec portfolio providing stable accrual income.", platform: "Kotak MF / Kuvera", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ MULTI CAP MUTUAL FUNDS ═══════════════════
  multi_cap_mf: {
    title: "Best Multi-Cap Mutual Funds",
    riskLevel: 5,
    note: "SEBI mandated: Must allocate min 25% each in large, mid, and small caps. True all-cap diversification in a single fund.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "Nippon India Multi Cap Fund", provider: "Nippon India AMC", rate: "~25.8% (5Y)", highlight: "AUM ~₹38,000 Cr. Top performer with disciplined 25/25/25 split across market caps.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "HDFC Multi Cap Fund", provider: "HDFC AMC", rate: "~24.1% (5Y)", highlight: "AUM ~₹14,500 Cr. Process-driven multi-cap allocation with strong stock selection alpha.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "ICICI Pru Multicap Fund", provider: "ICICI Prudential AMC", rate: "~22.6% (5Y)", highlight: "AUM ~₹12,800 Cr. Dynamic tactical allocation within the 25% floor mandates.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" },
      { name: "Kotak Multicap Fund", provider: "Kotak AMC", rate: "~21.2% (5Y)", highlight: "AUM ~₹11,400 Cr. Quality-first stock selection with lower portfolio turnover.", platform: "Kotak MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "Quant Multi Asset Fund", provider: "Quant AMC", rate: "~26.4% (5Y)", highlight: "AUM ~₹5,200 Cr. Aggressive momentum-driven multi-cap rotation.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Return" }
    ]
  },

  // ═══════════════════ LARGE & MIDCAP MUTUAL FUNDS ═══════════════════
  large_mid_mf: {
    title: "Best Large & Mid-Cap Mutual Funds",
    riskLevel: 5,
    note: "SEBI mandated: Must invest min 35% in large-caps and min 35% in mid-caps. Blended growth-stability allocation.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "Quant Large & Mid Cap Fund", provider: "Quant AMC", rate: "~26.8% (5Y)", highlight: "AUM ~₹4,200 Cr. Aggressive momentum strategy blending large and mid-cap alpha.", platform: "Quant MF / Groww", minInvestment: "₹100 SIP", badge: "Highest Return" },
      { name: "HDFC Large & Mid Cap Fund", provider: "HDFC AMC", rate: "~22.4% (5Y)", highlight: "AUM ~₹22,000 Cr. Process-driven portfolio balancing blue-chip stability with mid-cap growth.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "SBI Large & Midcap Fund", provider: "SBI MF", rate: "~21.6% (5Y)", highlight: "AUM ~₹26,000 Cr. Conservative blend backed by SBI MF research.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "Mirae Asset Large & Midcap Fund", provider: "Mirae Asset AMC", rate: "~20.8% (5Y)", highlight: "AUM ~₹38,000 Cr. Quality growth pick with strong downside protection.", platform: "Mirae MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "Kotak Equity Opportunities Fund", provider: "Kotak AMC", rate: "~21.1% (5Y)", highlight: "AUM ~₹25,000 Cr. Balanced large-mid allocation with low expense ratio.", platform: "Kotak MF / Groww", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ CONSUMPTION / FMCG SECTOR FUNDS ═══════════════════
  consumption_mf: {
    title: "Best Consumption & FMCG Sector Funds",
    riskLevel: 5,
    note: "Focuses on rising domestic consumption: FMCG, consumer durables, retail, quick-commerce, and hospitality.",
    howToStart: "Invest in direct plans via AMC portal or Groww / Zerodha Coin.",
    products: [
      { name: "ICICI Pru FMCG Fund", provider: "ICICI Prudential AMC", rate: "~15.8% (5Y)", highlight: "AUM ~₹2,600 Cr. Focused on consumer staples leaders (HUL, ITC, Nestlé, Dabur) with defensive earnings stability.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP", badge: "Category Leader" },
      { name: "Nippon India Consumption Fund", provider: "Nippon India AMC", rate: "~18.4% (5Y)", highlight: "AUM ~₹2,100 Cr. Broader consumption theme including retail, hospitality, and consumer discretionary.", platform: "Nippon MF / Groww", minInvestment: "₹100 SIP", badge: "Broad Theme" },
      { name: "Tata India Consumer Fund", provider: "Tata AMC", rate: "~17.2% (5Y)", highlight: "AUM ~₹2,800 Cr. Balanced allocation across FMCG, QSR, consumer durables, and quick-commerce.", platform: "Tata MF / Groww", minInvestment: "₹100 SIP" },
      { name: "SBI Consumption Opportunities Fund", provider: "SBI MF", rate: "~16.8% (5Y)", highlight: "AUM ~₹2,400 Cr. Rural-urban consumption blend backed by SBI research.", platform: "SBI MF / Groww", minInvestment: "₹500 SIP" },
      { name: "Mirae Asset Great Consumer Fund", provider: "Mirae Asset AMC", rate: "~18.1% (5Y)", highlight: "AUM ~₹3,600 Cr. Premium brand-focused consumer portfolio with strong brand moat stocks.", platform: "Mirae MF / Kuvera", minInvestment: "₹100 SIP" }
    ]
  },

  // ═══════════════════ INTERNATIONAL ETFS ═══════════════════
  nasdaq_etf: {
    title: "Best Nasdaq 100 ETFs & Index Funds (India-Listed)",
    riskLevel: 6,
    note: "Invest in US tech giants (Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta) from India in INR. RBI LRS limit: $250K/year. Gains taxed at slab rate.",
    howToStart: "Buy ETF units on NSE/BSE via any stock broker, or invest in index fund via AMC portal / Groww.",
    products: [
      { name: "Motilal Oswal Nasdaq 100 ETF", provider: "Motilal Oswal AMC", rate: "~22.4% (5Y)", highlight: "India's most liquid Nasdaq 100 ETF. Ticker: N100. AUM ~₹8,400 Cr. Direct INR exposure to Apple, Microsoft, Nvidia, and Meta.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹175)", badge: "Most Liquid" },
      { name: "Motilal Oswal Nasdaq 100 Index Fund", provider: "Motilal Oswal AMC", rate: "~22.1% (5Y)", highlight: "AUM ~₹5,200 Cr. No demat needed — invest via SIP like any mutual fund. Same Nasdaq 100 exposure.", platform: "Motilal Oswal MF / Groww", minInvestment: "₹500 SIP", badge: "No Demat Needed" },
      { name: "ICICI Pru Nasdaq 100 Index Fund", provider: "ICICI Prudential AMC", rate: "~21.8% (5Y)", highlight: "AUM ~₹4,800 Cr. Low expense ratio Nasdaq index tracking via SIP route.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" },
      { name: "Kotak Nasdaq 100 FoF", provider: "Kotak AMC", rate: "~21.4% (5Y)", highlight: "AUM ~₹3,200 Cr. Fund-of-Fund structure investing in iShares Nasdaq 100 UCITS ETF.", platform: "Kotak MF / Kuvera", minInvestment: "₹100 SIP" },
      { name: "Navi Nasdaq 100 FoF", provider: "Navi AMC", rate: "~21.2% (5Y)", highlight: "AUM ~₹2,100 Cr. Lowest expense ratio (0.06%) Nasdaq 100 fund in India.", platform: "Navi MF / Groww", minInvestment: "₹10 SIP", badge: "Lowest Cost" }
    ]
  },
  sp500_etf: {
    title: "Best S&P 500 ETFs & Index Funds (India-Listed)",
    riskLevel: 5,
    note: "Invest in the 500 largest US companies from India in INR. Broader diversification than Nasdaq 100 with lower tech concentration.",
    howToStart: "Buy ETF units on NSE/BSE, or invest in index fund via AMC portal / Groww.",
    products: [
      { name: "Motilal Oswal S&P 500 Index Fund", provider: "Motilal Oswal AMC", rate: "~16.8% (5Y)", highlight: "AUM ~₹6,400 Cr. India's most popular S&P 500 fund. Broader US market exposure across all 11 GICS sectors.", platform: "Motilal Oswal MF / Groww", minInvestment: "₹500 SIP", badge: "Most Popular" },
      { name: "Mirae Asset S&P 500 Top 50 ETF", provider: "Mirae Asset AMC", rate: "~18.2% (5Y)", highlight: "AUM ~₹2,800 Cr. Concentrated exposure to top 50 S&P 500 stocks.", platform: "Any Stock Broker", minInvestment: "1 unit (~₹65)" },
      { name: "HDFC S&P 500 Index Fund", provider: "HDFC AMC", rate: "~16.4% (5Y)", highlight: "AUM ~₹1,200 Cr. Full S&P 500 replication via HDFC AMC's institutional infrastructure.", platform: "HDFC MF / Groww", minInvestment: "₹100 SIP" },
      { name: "Navi US Total Stock Market FoF", provider: "Navi AMC", rate: "~15.8% (5Y)", highlight: "AUM ~₹1,800 Cr. Broadest US market exposure — entire US equity market, not just S&P 500.", platform: "Navi MF / Groww", minInvestment: "₹10 SIP", badge: "Broadest Coverage" },
      { name: "ICICI Pru US Bluechip Equity Fund", provider: "ICICI Prudential AMC", rate: "~15.2% (5Y)", highlight: "AUM ~₹3,400 Cr. Actively managed US large-cap fund — can outperform passive S&P 500 tracking.", platform: "ICICI Direct / Groww", minInvestment: "₹100 SIP" }
    ]
  }
};

export default WHERE_TO_INVEST;



