"""
WealthGenie RAG Subsystem - Financial Synonym & Term Expander
Maps key financial concepts, tax sections, and regulatory acronyms to rich domain synonyms
to boost vector and BM25 search recall.
"""

import re
from typing import Dict, List

# Authoritative financial synonym mappings
FINANCIAL_SYNONYMS: Dict[str, str] = {
    "80C": "tax deduction section 80C ELSS PPF EPF 1.5 lakh limit",
    "80D": "health medical insurance premium deduction section 80D senior citizen 50k",
    "80CCD": "national pension system NPS additional deduction section 80CCD(1B) 50k",
    "80CCD(1B)": "national pension system NPS additional deduction section 80CCD(1B) 50k",
    "LTCG": "long term capital gains tax equity mutual fund 1.25 lakh exemption 12.5%",
    "STCG": "short term capital gains tax listed equity 20% rate",
    "DICGC": "deposit insurance credit guarantee corporation bank deposit 5 lakh limit RBI",
    "SGB": "sovereign gold bond RBI 2.5% interest capital gains exemption maturity",
    "HRA": "house rent allowance exemption rent paid basic salary 10% 50% metro",
    "ELSS": "equity linked savings scheme 3 year lock in tax saving 80C",
    "NPS": "national pension system 80CCD tier 1 50k extra deduction",
    "PPF": "public provident fund 15 year lock in tax free interest EEE status",
    "RISKOMETER": "SEBI mutual fund risk o meter risk classification low high very high",
    "REBATE": "section 87A tax rebate threshold 12.5 lakh new regime zero tax",
    "87A": "section 87A tax rebate threshold 12.5 lakh new regime zero tax",
    "SLAB": "income tax slabs tax rates FY 2025-26 new regime old regime",
    "SLABS": "income tax slabs tax rates FY 2025-26 new regime old regime",
}


class SynonymExpander:
    """Enriches user query strings with authoritative financial term synonym expansions."""

    def __init__(self, synonym_map: Dict[str, str] = None):
        self.synonym_map = synonym_map or FINANCIAL_SYNONYMS

    def expand_synonyms(self, query: str) -> str:
        """
        Identifies key financial concepts in query and appends domain synonyms.
        """
        if not query:
            return ""

        query_lower = query.lower()
        expansions: List[str] = []

        for key, expansion in self.synonym_map.items():
            # Check exact term or word match in query
            key_pattern = r"\b" + re.escape(key.lower()) + r"\b"
            if re.search(key_pattern, query_lower):
                # Avoid duplicating terms already present in query
                new_words = [
                    w for w in expansion.split()
                    if w.lower() not in query_lower and w not in expansions
                ]
                if new_words:
                    expansions.extend(new_words)

        if expansions:
            return f"{query} {' '.join(expansions)}"
        return query
