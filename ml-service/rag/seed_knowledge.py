"""
WealthGenie RAG Subsystem - Seed Knowledge Base
Ingests authoritative Indian FY 2025-26 tax regulations, mutual fund guidelines, and MPT rules into the vector store.
"""

from rag.ingestion.pipeline import IngestionPipeline


TAX_REGULATIONS_2025 = """# Indian Progressive Income Tax Regulations FY 2025-26 (AY 2026-27)

## New Tax Regime (Section 115BAC Default)
Under the New Tax Regime for FY 2025-26, income tax slabs and marginal rates are structured as follows:
- Income up to ₹4,00,000: NIL (0%)
- Income ₹4,00,001 to ₹8,00,000: 5%
- Income ₹8,00,001 to ₹12,00,000: 10%
- Income ₹12,00,001 to ₹16,00,000: 15%
- Income ₹16,00,001 to ₹20,00,000: 20%
- Income ₹20,00,001 to ₹24,00,000: 25%
- Income above ₹24,00,000: 30%

### Standard Deduction & Section 87A Rebate
- **Standard Deduction**: Salaried individuals receive a standard deduction of ₹75,000 under the New Regime.
- **Section 87A Rebate**: Full tax rebate applies for taxable income up to ₹12,00,000 under the New Tax Regime, resulting in zero net tax liability. Marginal relief is granted for incomes marginally exceeding ₹12 Lakhs.

## Old Tax Regime
The Old Tax Regime offers deductions under Section 80C, 80D, 80CCD(2), and HRA:
- Income up to ₹2,50,000: NIL (0%)
- Income ₹2,50,001 to ₹5,00,000: 5%
- Income ₹5,00,001 to ₹10,00,000: 20%
- Income above ₹10,00,000: 30%

### Deductions Breakdown
- **Section 80C**: Maximum deduction of ₹1,50,000 for ELSS mutual funds, PPF, EPF, and principal home loan repayment.
- **Section 80D**: Health insurance premium deduction up to ₹25,000 for self/family and ₹50,000 for senior citizen parents.
- **Section 80CCD(1B)**: Additional NPS contribution deduction up to ₹50,000.
"""

MUTUAL_FUNDS_SUITABILITY = """# SEBI & AMFI Mutual Fund Classification & Risk Suitability

## Equity Mutual Funds
- **Flexi Cap / Large Cap Funds**: Suitable for long-term wealth accumulation (>5 years horizon). Higher risk capacity (>0.50). High return expectation (12-15% CAGR).
- **ELSS (Equity Linked Savings Scheme)**: Equity mutual fund with a 3-year mandatory lock-in period. Offers tax deduction under Section 80C up to ₹1.5 Lakhs in Old Regime.

## Debt & Fixed Income Funds
- **Liquid & Money Market Funds**: Suitable for emergency funds and short-term liquidity (<1 year horizon). Low risk capacity. Capital preservation priority.
- **Short Duration / Corporate Bond Funds**: Moderate risk, suitable for 1-3 year investment horizons.

## Fixed Deposits & Government Bonds
- **Bank Fixed Deposits (FD)**: Guaranteed return instrument. Covered by DICGC insurance up to ₹5 Lakhs. Suitable for conservative risk profiles.
- **RBI Floating Rate Savings Bonds**: 7-year lock-in period, sovereign guarantee, interest reset semi-annually. Zero credit risk.
"""


def seed_default_knowledge_base():
    """Populates vector index with default authoritative documents if empty."""
    pipeline = IngestionPipeline()
    stats = pipeline.vector_store.get_stats()

    if stats["total_chunks"] == 0:
        pipeline.ingest_text(
            text=TAX_REGULATIONS_2025,
            title="Income Tax Regulations FY 2025-26",
            source="Income Tax Department Guidelines FY 2025-26",
            author="CBDT / Ministry of Finance",
        )
        pipeline.ingest_text(
            text=MUTUAL_FUNDS_SUITABILITY,
            title="SEBI & AMFI Asset Classification Guidelines",
            source="SEBI & AMFI Mutual Fund Regulations",
            author="SEBI",
        )


if __name__ == "__main__":
    seed_default_knowledge_base()
