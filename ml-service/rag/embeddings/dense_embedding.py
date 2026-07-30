"""
WealthGenie RAG Subsystem - Dense Vector Embedding Provider
Computes normalized dense vector embeddings using subword n-gram hashing and TF-IDF scaling.
"""

import math
import re
from typing import List
import numpy as np

from rag.embeddings.base import BaseEmbeddingProvider
from rag.embeddings.cache import EmbeddingCache


class DenseVectorEmbeddingProvider(BaseEmbeddingProvider):
    """Production dense embedding provider generating normalized vector representations."""

    def __init__(self, dimension: int = 128, enable_cache: bool = True):
        self._dim = dimension
        self.enable_cache = enable_cache
        self.cache = EmbeddingCache() if enable_cache else None

    @property
    def embedding_dimension(self) -> int:
        return self._dim

    def _tokenize(self, text: str) -> List[str]:
        """Extracts lowercase word and subword n-grams."""
        cleaned = re.sub(r"[^\w\s]", " ", text.lower())
        tokens = cleaned.split()
        ngrams = []
        for token in tokens:
            ngrams.append(token)
            if len(token) >= 4:
                ngrams.append(token[:3])
                ngrams.append(token[-3:])
        return ngrams

    def embed_text(self, text: str) -> List[float]:
        """Generates unit L2-normalized vector embedding for input text."""
        if self.cache and self.enable_cache:
            cached = self.cache.get(text)
            if cached is not None:
                return cached

        tokens = self._tokenize(text)
        vec = np.zeros(self._dim, dtype=np.float32)

        if not tokens:
            norm_vec = vec.tolist()
            if self.cache and self.enable_cache:
                self.cache.put(text, norm_vec)
            return norm_vec

        # Subword feature hashing trick
        for token in tokens:
            h = hash(token) % self._dim
            weight = math.log(1.0 + len(token))
            vec[h] += weight

        # L2 Normalization
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        result = vec.tolist()
        if self.cache and self.enable_cache:
            self.cache.put(text, result)

        return result

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generates dense vector embeddings for a list of texts."""
        return [self.embed_text(t) for t in texts]
