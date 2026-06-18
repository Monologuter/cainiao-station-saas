from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class KbEntry:
    id: str
    tenant_id: Optional[str]
    category: str
    question: str
    answer: str
    keywords: list[str]
    priority: int = 0
    enabled: bool = True
    source: str = "manual"


@dataclass
class KbHit:
    id: str
    tenant_id: Optional[str]
    category: str
    question: str
    answer: str
    score: float
    source: str


class KeywordKnowledgeBase:
    def __init__(self, entries: Optional[list[KbEntry]] = None):
        self._entries = entries or []

    @property
    def count(self) -> int:
        return len(self._entries)

    def reindex(self, entries: list[KbEntry]) -> None:
        self._entries = entries

    def search(self, query: str, tenant_id: Optional[str], k: int) -> list[KbHit]:
        scored = []
        normalized_query = query.casefold()
        for entry in self._entries:
            if not entry.enabled:
                continue
            if entry.tenant_id is not None and entry.tenant_id != tenant_id:
                continue

            score = self._score(entry, normalized_query)
            if score <= 0:
                continue
            scored.append((score, entry.priority, entry))

        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return [
            KbHit(
                id=entry.id,
                tenant_id=entry.tenant_id,
                category=entry.category,
                question=entry.question,
                answer=entry.answer,
                score=score,
                source=entry.source,
            )
            for score, _priority, entry in scored[: max(k, 0)]
        ]

    def _score(self, entry: KbEntry, normalized_query: str) -> float:
        score = 0.0
        for keyword in entry.keywords:
            if keyword and keyword.casefold() in normalized_query:
                score += 10
        if entry.question.casefold() in normalized_query:
            score += 5
        if normalized_query in entry.question.casefold():
            score += 3
        return score + entry.priority / 1000 if score > 0 else 0
