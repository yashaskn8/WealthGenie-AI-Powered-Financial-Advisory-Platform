"""
WealthGenie RAG Subsystem - Spelling Corrector Interface & Heuristic Dictionary
Fixes common typographical errors in financial and taxation search queries.
"""

from typing import Dict

COMMON_FINANCIAL_TYPOS: Dict[str, str] = {
    "rebte": "rebate",
    "rebat": "rebate",
    "detuction": "deduction",
    "deducation": "deduction",
    "deducton": "deduction",
    "regim": "regime",
    "regimne": "regime",
    "txe": "tax",
    "taxe": "tax",
    "insturment": "instrument",
    "protfolio": "portfolio",
    "mutualfund": "mutual fund",
    "limt": "limit",
    "exempion": "exemption",
    "slab": "slab",
    "salery": "salary",
    "salaried": "salaried",
}


class SpellingCorrector:
    """Corrects common domain-specific typos in query terms."""

    def __init__(self, typos_map: Dict[str, str] = None):
        self.typos_map = typos_map or COMMON_FINANCIAL_TYPOS

    def correct(self, query: str) -> str:
        """Replaces common typos in query text."""
        if not query:
            return ""

        words = query.split()
        corrected_words = []

        for w in words:
            clean_lower = w.lower().strip("?,.!")
            if clean_lower in self.typos_map:
                corrected_words.append(self.typos_map[clean_lower])
            else:
                corrected_words.append(w)

        return " ".join(corrected_words)
