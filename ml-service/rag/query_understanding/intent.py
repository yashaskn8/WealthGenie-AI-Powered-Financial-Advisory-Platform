"""
WealthGenie RAG Subsystem - Query Intent Classifier
Classifies query intent into financial domain categories (tax_regime, deduction, asset_suitability, general).
"""

from typing import Dict, Any, List


class QueryIntentClassifier:
    """Classifies financial query intent using domain keyword rule sets."""

    INTENT_KEYWORDS = {
        "tax_regime": ["new regime", "old regime", "slab", "115bac", "rebate", "tax rate", "income tax"],
        "deduction": ["80c", "80d", "80ccd", "hra", "standard deduction", "exemption", "deduction"],
        "asset_suitability": ["elss", "mutual fund", "fixed deposit", "fd", "bond", "equity", "liquid fund", "nps", "risk"],
        "wealth_projection": ["monte carlo", "cagr", "xirr", "sip", "return", "growth", "projection"],
    }

    def classify(self, query: str) -> Dict[str, Any]:
        """Classifies intent category and returns primary intent with confidence score."""
        q_lower = query.lower()
        scores: Dict[str, int] = {intent: 0 for intent in self.INTENT_KEYWORDS}

        for intent, keywords in self.INTENT_KEYWORDS.items():
            for kw in keywords:
                if kw in q_lower:
                    scores[intent] += 1

        best_intent = max(scores, key=scores.get)
        max_score = scores[best_intent]

        primary_intent = best_intent if max_score > 0 else "general_advisory"
        confidence = float(min(1.0, max_score * 0.35)) if max_score > 0 else 0.5

        return {
            "primary_intent": primary_intent,
            "confidence": confidence,
            "intent_scores": scores,
        }
