from __future__ import annotations

from datetime import timedelta
from statistics import mean, pstdev

from .schemas import (
    ForecastPoint,
    ForecastRequest,
    ForecastResponse,
    HistoryPoint,
)


class VolumeForecaster:
    def forecast(self, request: ForecastRequest) -> ForecastResponse:
        history = sorted(request.history, key=lambda item: item.date)
        if len(history) >= 28:
            method = "HOLT_WINTERS"
        elif len(history) >= 7:
            method = "MA"
        else:
            method = "FALLBACK_MEAN"

        forecasts = []
        last_date = history[-1].date if history else None
        for offset in range(1, request.horizon + 1):
            target = (last_date + timedelta(days=offset)) if last_date else None
            predicted = self._predict(history, offset, method)
            lower, upper = self._bounds(history, predicted, method)
            forecasts.append(
                ForecastPoint(
                    targetDate=target.isoformat() if target else f"day-{offset}",
                    predicted=predicted,
                    lower=lower,
                    upper=upper,
                    hourBreakdown=(
                        self._hour_breakdown(history, predicted)
                        if request.granularity == "HOUR"
                        else None
                    ),
                )
            )

        return ForecastResponse(method=method, forecasts=forecasts)

    def _predict(self, history: list[HistoryPoint], offset: int, method: str) -> int:
        if not history:
            return 0
        if method == "HOLT_WINTERS":
            weekday_index = (len(history) + offset - 1) % 7
            values = [
                point.volume for index, point in enumerate(history) if index % 7 == weekday_index
            ]
            return max(round(mean(values)), 0)
        if method == "MA":
            window = history[-7:]
            weights = list(range(1, len(window) + 1))
            weighted = sum(point.volume * weights[index] for index, point in enumerate(window))
            return max(round(weighted / sum(weights)), 0)
        return max(round(mean(point.volume for point in history)), 0)

    def _bounds(
        self,
        history: list[HistoryPoint],
        predicted: int,
        method: str,
    ) -> tuple[int, int]:
        if not history:
            spread = 0
        else:
            volumes = [point.volume for point in history]
            spread = round((pstdev(volumes) if len(volumes) > 1 else predicted * 0.2) * 1.5)
        if method == "FALLBACK_MEAN":
            spread = max(spread, round(predicted * 0.5))
        return max(predicted - spread, 0), predicted + spread

    def _hour_breakdown(self, history: list[HistoryPoint], predicted: int) -> list[int]:
        if predicted == 0:
            return [0] * 24
        histograms = [point.hourBreakdown for point in history if point.hourBreakdown]
        if not histograms:
            base = [0] * 24
            base[10] = predicted
            return base
        totals = [0] * 24
        for histogram in histograms[-7:]:
            for index in range(24):
                totals[index] += int(histogram[index] if index < len(histogram) else 0)
        total = sum(totals)
        if total <= 0:
            return [0] * 24
        raw = [predicted * value / total for value in totals]
        rounded = [int(value) for value in raw]
        remainder = predicted - sum(rounded)
        for index in sorted(range(24), key=lambda i: raw[i] - rounded[i], reverse=True)[
            :remainder
        ]:
            rounded[index] += 1
        return rounded
