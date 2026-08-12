# WealthGenie RAG Subsystem — Authoritative Corpus Sources Manifest

This manifest documents the exact provenance, publishing authorities, regulatory framework URLs, trust classifications, effective dates, and live retrieval timestamps for all documents in the WealthGenie RAG knowledge base.

---

## Document Provenance Table

| Document ID / Filename | Document Title | Publishing Authority | Exact Source URL | Trust Tier | Effective Date | Retrieval Timestamp |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `income_tax_act_fy2025_26.md` | Income Tax Regulations FY 2025-26 (AY 2026-27) | Central Board of Direct Taxes (CBDT), Ministry of Finance, Govt of India | `https://www.incometaxindia.gov.in/pages/rules/income-tax-rules-1962.aspx` | Tier 1 - Official Govt | 2025-04-01 | 2026-08-12T19:07:30+05:30 |
| `sebi_mutual_fund_categorization_and_riskometer.md` | SEBI Mutual Fund Scheme Categorization & Risk-o-meter Guidelines | Securities and Exchange Board of India (SEBI) & AMFI | `https://www.sebi.gov.in/legal/circulars/feb-2026/categorization-and-rationalization-of-mutual-fund-schemes_89320.html` | Tier 1 - Official Regulatory Body | 2026-02-26 | 2026-08-12T19:07:30+05:30 |
| `rbi_and_dicgc_guidelines.md` | RBI & DICGC Guidelines on Deposits, Insurance & Sovereign Securities | Reserve Bank of India (RBI) & Deposit Insurance and Credit Guarantee Corporation (DICGC) | `https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=11560` / `https://www.dicgc.org.in/FD_AFAQ.html` | Tier 1 - Official Central Bank / Statutory Corp | 2025-01-01 | 2026-08-12T19:07:30+05:30 |

---

## Regulatory Coverage Summary

1. **Indian Income Tax Act, 1961**:
   - **Section 115BAC (New Tax Regime)**: Tax slabs for FY 2025-26 (0% up to ₹4L, 5% ₹4L-8L, 10% ₹8L-12L, 15% ₹12L-16L, 20% ₹16L-20L, 25% ₹20L-24L, 30% > ₹24L). ₹75,000 standard deduction for salaried individuals. Section 87A rebate for taxable income up to ₹12 Lakhs with marginal relief.
   - **Old Tax Regime**: Slabs (0% up to ₹2.5L, 5% ₹2.5L-5L, 20% ₹5L-10L, 30% > ₹10L). ₹50,000 standard deduction. Section 80C (ELSS, PPF, EPF, principal up to ₹1.5L), Section 80D (health insurance ₹25k / ₹50k senior citizen), Section 80CCD(1B) (NPS additional ₹50k), Section 10(13A) HRA exemption.
   - **Capital Gains Tax**: Equity STCG at 20%, LTCG at 12.5% above ₹1.25L exemption. Debt MFs (post-April 1, 2023) taxed at slab rate. Real Estate & Gold LTCG at 12.5% without indexation (or 20% with indexation for pre-July 23, 2024 property).

2. **SEBI & AMFI Mutual Fund Regulations**:
   - 36 standardized categories across Equity, Debt, Hybrid, and Life Cycle funds.
   - Specific allocation rules: Flexi Cap (min 65% equity), Large Cap (min 80%), Mid Cap (min 65%), ELSS (min 80%, 3-year lock-in), Sectoral/Thematic (min 80%, max 50% overlap).
   - Risk-o-meter: 6 risk levels (Low, Low to Moderate, Moderate, Moderately High, High, Very High) based on liquidity, credit risk rating, and Macaulay Duration scores updated monthly.

3. **RBI & DICGC Banking & Retail Debt Regulations**:
   - **DICGC Deposit Insurance**: Statutory insurance limit up to ₹5,00,000 per depositor per bank for principal and accrued interest across savings, FD, current, and RD accounts. Rules on same capacity/right vs joint accounts. Exclusions: NBFC deposits, mutual funds, stocks, bonds, government securities.
   - **RBI Floating Rate Savings Bonds (FRSB 2020 Taxable)**: 7-year tenure, sovereign guarantee, interest rate reset semi-annually at NSC rate + 0.35%, fully taxable at slab rate, non-transferable.
   - **Sovereign Gold Bonds (SGB)**: 8-year tenure, 2.50% p.a. semi-annual interest, 100% tax exemption on capital gains at maturity u/s 47(viib).
