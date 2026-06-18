from __future__ import annotations

from typing import Optional

from .keyword import KbEntry, KeywordKnowledgeBase


class VectorKnowledgeBase(KeywordKnowledgeBase):
    """Placeholder for pgvector hybrid retrieval; falls back to keyword behavior."""

    def __init__(self, entries: Optional[list[KbEntry]] = None):
        super().__init__(entries)
