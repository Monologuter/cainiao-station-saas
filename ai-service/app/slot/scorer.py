from __future__ import annotations

from .schemas import (
    SlotCandidate,
    SlotRecommendation,
    SlotRecommendRequest,
    SlotRecommendResponse,
)

MODEL_VERSION = "slot-rule-v1"
SIZE_RANK = {"S": 1, "M": 2, "L": 3}


class SlotScorer:
    def recommend(self, request: SlotRecommendRequest) -> SlotRecommendResponse:
        if not request.candidates:
            return SlotRecommendResponse(modelVersion=MODEL_VERSION, recommendations=[])

        max_distance = max(candidate.distanceRank for candidate in request.candidates)
        max_pick = max(candidate.heat.pickCount7d for candidate in request.candidates) or 1
        rows = []
        for candidate in request.candidates:
            if not self._fits(request.parcel.sizeClass, candidate.sizeCapacity):
                continue
            score, reasons = self._score(
                candidate,
                request.parcel.sizeClass,
                request.parcel.inboundHour,
                max_distance,
                max_pick,
            )
            rows.append(
                SlotRecommendation(
                    slotId=candidate.slotId,
                    slotCode=candidate.slotCode,
                    score=round(score, 4),
                    reasons=reasons,
                )
            )

        rows.sort(key=lambda item: item.score, reverse=True)
        return SlotRecommendResponse(modelVersion=MODEL_VERSION, recommendations=rows)

    def _score(
        self,
        candidate: SlotCandidate,
        size_class: str,
        inbound_hour: int,
        max_distance: int,
        max_pick: int,
    ) -> tuple[float, list[str]]:
        path_score = 1 - ((candidate.distanceRank - 1) / max(max_distance - 1, 1))
        freq_score = candidate.heat.pickCount7d / max_pick
        hour_value = self._hour_value(candidate, inbound_hour)
        max_hour = max(candidate.heat.hourHistogram or [0]) or 1
        time_score = 1 - (hour_value / max_hour)
        size_score = self._size_score(size_class, candidate.sizeCapacity)

        score = (
            0.4 * path_score
            + 0.3 * freq_score
            + 0.2 * time_score
            + 0.1 * size_score
        )
        return score, self._reasons(path_score, time_score, size_score)

    def _fits(self, size_class: str, capacity: str) -> bool:
        return SIZE_RANK[capacity] >= SIZE_RANK[size_class]

    def _size_score(self, size_class: str, capacity: str) -> float:
        if size_class == capacity:
            return 1.0
        return 0.75 if SIZE_RANK[capacity] - SIZE_RANK[size_class] == 1 else 0.55

    def _hour_value(self, candidate: SlotCandidate, inbound_hour: int) -> int:
        histogram = candidate.heat.hourHistogram or []
        if inbound_hour >= len(histogram):
            return 0
        return int(histogram[inbound_hour] or 0)

    def _reasons(
        self,
        path_score: float,
        time_score: float,
        size_score: float,
    ) -> list[str]:
        reasons = []
        if path_score >= 0.7:
            reasons.append("近门动线")
        if time_score >= 0.7:
            reasons.append("错峰取放")
        if size_score >= 0.95:
            reasons.append("尺寸匹配")
        if not reasons:
            reasons.append("综合评分较优")
        return reasons
