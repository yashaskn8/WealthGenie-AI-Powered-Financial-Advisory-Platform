"""
WealthGenie RAG Subsystem - Query Understanding Pipeline Orchestrator
Chains Normalizer -> Spelling Corrector -> Acronym Expander -> Intent Classifier -> Query Rewriter.
"""

from typing import Dict, Any, Optional

from rag.query_understanding.acronyms import AcronymExpander
from rag.query_understanding.intent import QueryIntentClassifier
from rag.query_understanding.normalizer import QueryNormalizer
from rag.query_understanding.rewriter import QueryRewriter
from rag.query_understanding.spelling import SpellingCorrector


class QueryUnderstandingPipeline:
    """Orchestrates query preprocessing pipeline before vector retrieval."""

    def __init__(
        self,
        normalizer: Optional[QueryNormalizer] = None,
        spelling_corrector: Optional[SpellingCorrector] = None,
        acronym_expander: Optional[AcronymExpander] = None,
        intent_classifier: Optional[QueryIntentClassifier] = None,
        rewriter: Optional[QueryRewriter] = None,
    ):
        self.normalizer = normalizer or QueryNormalizer()
        self.spelling_corrector = spelling_corrector or SpellingCorrector()
        self.acronym_expander = acronym_expander or AcronymExpander()
        self.intent_classifier = intent_classifier or QueryIntentClassifier()
        self.rewriter = rewriter or QueryRewriter()

    def process(self, raw_query: str) -> Dict[str, Any]:
        """
        Executes end-to-end query understanding pipeline.
        Returns processed query representation including raw, normalized, expanded, rewritten query and intent info.
        """
        # 1. Normalize
        normalized = self.normalizer.normalize(raw_query)

        # 2. Correct Typo Spelling
        corrected = self.spelling_corrector.correct(normalized)

        # 3. Expand Acronyms
        expanded = self.acronym_expander.expand(corrected, append_expansion=True)

        # 4. Classify Intent
        intent_info = self.intent_classifier.classify(expanded)

        # 5. Rewrite & Enrich Query for Search
        rewritten = self.rewriter.rewrite(expanded, intent=intent_info["primary_intent"])

        return {
            "raw_query": raw_query,
            "normalized_query": normalized,
            "corrected_query": corrected,
            "expanded_query": expanded,
            "search_query": rewritten,
            "intent": intent_info["primary_intent"],
            "intent_confidence": intent_info["confidence"],
            "intent_scores": intent_info["intent_scores"],
        }
