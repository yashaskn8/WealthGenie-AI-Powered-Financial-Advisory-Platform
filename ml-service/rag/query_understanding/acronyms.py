"""
WealthGenie RAG Subsystem - Financial Acronym Expander
Expands Indian financial and taxation acronyms to boost search recall.
"""

import re
from typing import Dict

# Dictionary mapping acronyms to full canonical terms
FINANCIAL_ACRONYMS: Dict[str, str] = {
    "ELSS": "Equity Linked Savings Scheme",
    "NPS": "National Pension System",
    "PPF": "Public Provident Fund",
    "EPF": "Employees Provident Fund",
    "FD": "Fixed Deposit",
    "RD": "Recurring Deposit",
    "HRA": "House Rent Allowance",
    "LTA": "Leave Travel Allowance",
    "MF": "Mutual Fund",
    "ETF": "Exchange Traded Fund",
    "NAV": "Net Asset Value",
    "SIP": "Systematic Investment Plan",
    "SWP": "Systematic Withdrawal Plan",
    "STP": "Systematic Transfer Plan",
    "CAGR": "Compound Annual Growth Rate",
    "XIRR": "Extended Internal Rate of Return",
    "SEBI": "Securities and Exchange Board of India",
    "AMFI": "Association of Mutual Funds in India",
    "DICGC": "Deposit Insurance and Credit Guarantee Corporation",
    "CBDT": "Central Board of Direct Taxes",
    "SGB": "Sovereign Gold Bond",
    "RBI": "Reserve Bank of India",
}


class AcronymExpander:
    """Expands acronyms in query strings with full expanded terminology."""

    def __init__(self, acronym_map: Dict[str, str] = None):
        self.acronym_map = acronym_map or FINANCIAL_ACRONYMS

    def expand(self, query: str, append_expansion: bool = True) -> str:
        """
        Expands recognized acronyms in text.
        If append_expansion is True, appends (Expansion) after the acronym.
        """
        if not query:
            return ""

        words = query.split()
        expanded_words = []

        for word in words:
            clean_word = re.sub(r"[^\w]", "", word).upper()
            if clean_word in self.acronym_map:
                expansion = self.acronym_map[clean_word]
                if append_expansion and expansion.lower() not in query.lower():
                    expanded_words.append(f"{word} ({expansion})")
                else:
                    expanded_words.append(word)
            else:
                expanded_words.append(word)

        return " ".join(expanded_words)
