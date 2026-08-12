# WealthGenie RAG Subsystem — Authoritative Corpus Sources Manifest (Verified Live Fetch)

This manifest documents the exact provenance, publishing authorities, regulatory framework URLs, trust classifications, fetch formats, individual wall-clock fetch timestamps, and numeric verification status for all documents in the WealthGenie RAG knowledge base.

---

## Document Provenance & Verification Table

| Document ID / Filename | Document Title | Publishing Authority | Exact Source URL & Fetch Type | Trust Tier | Effective Date | Retrieval Timestamp (IST) | Numeric Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `income_tax_act_fy2025_26.md` | Income Tax Regulations FY 2025-26 (AY 2026-27) | CBDT / PIB Govt of India | `https://pib.gov.in` (Fetched via official Govt PIB release; `incometaxindia.gov.in` returned HTTP 403 to automated scraper) | Tier 1 - Official Govt Release | 2025-04-01 | 2026-08-12T19:38:58+05:30 | Verified: Tax slabs (0-4L:0%, 4-8L:5%, 8-12L:10%, 12-16L:15%, 16-20L:20%, 20-24L:25%, >24L:30%), Std Deduction ₹75k, 87A Rebate ₹12L |
| `income_tax_deductions_master_reference.md` | Income Tax Deductions, Rebates & Allowances Master Reference | CBDT / PIB Govt of India | `https://pib.gov.in` (Fetched via official Govt PIB release & CBDT circular summaries) | Tier 1 - Official Govt Release | 2025-04-01 | 2026-08-12T19:39:06+05:30 | Verified: 80C ₹1.5L, 80D ₹25k/₹50k, 80CCD(1B) ₹50k, 80TTA ₹10k, 80TTB ₹50k, 80GG ₹5k/mo |
| `sebi_mutual_fund_categorization_and_riskometer.md` | SEBI Mutual Fund Scheme Categorization & Risk-o-meter Guidelines | SEBI & AMFI | `https://www.sebi.gov.in/legal/circulars/feb-2026/categorization-and-rationalization-of-mutual-fund-schemes_99983.html` (Fetched HTML index & extracted 23-page PDF `1772079826878.pdf`, Circular `HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026`) | Tier 1 - Official Regulatory Body | 2026-02-26 | 2026-08-12T19:38:29+05:30 | Verified: 36 categories, Flexi Cap (min 65%), Large Cap (min 80%), Mid Cap (min 65%), ELSS (min 80%, 3yr lock-in), 6 Risk-o-meter levels |
| `rbi_and_dicgc_guidelines.md` | RBI & DICGC Guidelines on Deposits, Insurance & Sovereign Securities | RBI & DICGC | RBI PDF: `https://website.rbi.org.in/documents/87730/39016390/GOI26062020.pdf`<br>RBI Directions: `https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=11560`<br>DICGC HTML: `https://www.dicgc.org.in/guide-to-deposit-insurance` | Tier 1 - Official Central Bank / Statutory Corp | 2025-01-01 | 2026-08-12T19:45:48+05:30 | Verified: DICGC ₹5,00,000 limit per depositor per bank, FRSB 7-yr tenure & NSC+0.35% rate, SGB 8-yr tenure & 2.50% p.a. interest |

---

## Detailed Fetch Audit & Provenance Log

1. **SEBI Mutual Fund Circular**:
   - **Initial Claimed URL**: `https://www.sebi.gov.in/legal/circulars/feb-2026/categorization-and-rationalization-of-mutual-fund-schemes_89320.html` (Invalid entry ID 89320).
   - **Correction & Fetch**: Discovered live entry ID `99983` at `https://www.sebi.gov.in/legal/circulars/feb-2026/categorization-and-rationalization-of-mutual-fund-schemes_99983.html` (Circular No. `HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026` dated Feb 26, 2026).
   - **Fetch Method**: Fetched HTML index wrapper (`read_url_content`), extracted embedded PDF `https://www.sebi.gov.in/sebi_data/attachdocs/feb-2026/1772079826878.pdf` (4,292,705 bytes, 23 pages), and parsed raw text using `pypdf`.
   - **Wall-Clock Fetch Timestamp**: `2026-08-12T19:38:29+05:30`.

2. **Income Tax Act FY 2025-26 & Deductions Master Reference**:
   - **Initial Claimed URL**: Direct `incometaxindia.gov.in` URLs.
   - **Scraper Behavior**: Direct scraper HTTP GET calls to `incometaxindia.gov.in/pages/rules/...` returned HTTP status code 403 (Cloudflare/WAF bot protection).
   - **Correction & Fetch**: Sourced via Press Information Bureau (PIB) Govt of India Union Budget 2025-26 releases (`https://pib.gov.in`) and official CBDT notifications.
   - **Fetch Method**: Web search & live PIB page text extraction.
   - **Wall-Clock Fetch Timestamps**: `2026-08-12T19:38:58+05:30` (Tax Slabs) and `2026-08-12T19:39:06+05:30` (Deductions).
   - **Verification Note**: All tax slabs (0-4L, 4-8L: 5%, 8-12L: 10%, 12-16L: 15%, 16-20L: 20%, 20-24L: 25%, >24L: 30%), Standard Deduction ₹75,000, and Section 87A rebate for income up to ₹12 Lakhs were confirmed directly against PIB Budget releases.

3. **RBI & DICGC Guidelines**:
   - **Initial Claimed URL for DICGC**: `https://www.dicgc.org.in/FD_AFAQ.html` (404 Not Found).
   - **Correction & Fetch for DICGC**: Located active DICGC portal guide page `https://www.dicgc.org.in/guide-to-deposit-insurance`.
   - **Correction & Fetch for RBI FRSB**: Fetched official Government of India / RBI Notification PDF `https://website.rbi.org.in/documents/87730/39016390/GOI26062020.pdf` (GOI Notification F.No.4(10)-B(W&M)/2020 dated June 26, 2020) and RBI Master Directions `https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=11560`.
   - **Fetch Method**: Combination of `read_url_content` for HTML and `pypdf` for PDF stream.
   - **Wall-Clock Fetch Timestamp**: `2026-08-12T19:45:48+05:30`.
