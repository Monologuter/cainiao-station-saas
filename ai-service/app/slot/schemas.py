from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SizeClass = Literal["S", "M", "L"]


class SlotHeat(BaseModel):
    pickCount7d: int = 0
    hourHistogram: list[int] = Field(default_factory=lambda: [0] * 24)


class ParcelFeatures(BaseModel):
    phoneTail: str
    sizeClass: SizeClass
    inboundHour: int = Field(ge=0, le=23)


class SlotCandidate(BaseModel):
    slotId: str
    slotCode: str
    sizeCapacity: SizeClass
    distanceRank: int = Field(ge=1)
    heat: SlotHeat = Field(default_factory=SlotHeat)


class SlotRecommendRequest(BaseModel):
    stationId: str
    parcel: ParcelFeatures
    candidates: list[SlotCandidate]


class SlotRecommendation(BaseModel):
    slotId: str
    slotCode: str
    score: float
    reasons: list[str]


class SlotRecommendResponse(BaseModel):
    modelVersion: str
    recommendations: list[SlotRecommendation]
