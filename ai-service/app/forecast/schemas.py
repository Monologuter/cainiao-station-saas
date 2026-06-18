from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


ForecastGranularity = Literal["DAY", "HOUR"]
ForecastMethod = Literal["MA", "HOLT_WINTERS", "FALLBACK_MEAN"]


class HistoryPoint(BaseModel):
    date: date
    volume: int = Field(ge=0)
    hourBreakdown: Optional[list[int]] = None


class ForecastRequest(BaseModel):
    stationId: str
    granularity: ForecastGranularity
    history: list[HistoryPoint]
    horizon: int = Field(default=7, ge=1, le=30)


class ForecastPoint(BaseModel):
    targetDate: str
    predicted: int
    lower: int
    upper: int
    hourBreakdown: Optional[list[int]] = None


class ForecastResponse(BaseModel):
    method: ForecastMethod
    forecasts: list[ForecastPoint]
