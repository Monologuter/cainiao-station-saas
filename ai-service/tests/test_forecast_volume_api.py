from fastapi.testclient import TestClient

from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app(service_token="test-token", ocr_provider="mock"))


def test_forecast_volume_uses_moving_average_for_recent_history():
    api = client()

    response = api.post(
        "/forecast/volume",
        headers={"X-Service-Token": "test-token"},
        json={
            "stationId": "station-1",
            "granularity": "DAY",
            "history": [
                {"date": f"2026-06-{day:02d}", "volume": day}
                for day in range(1, 8)
            ],
            "horizon": 3,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "MA"
    assert [item["targetDate"] for item in body["forecasts"]] == [
        "2026-06-08",
        "2026-06-09",
        "2026-06-10",
    ]
    assert body["forecasts"][0]["predicted"] == 5
    assert body["forecasts"][0]["lower"] <= body["forecasts"][0]["predicted"]
    assert body["forecasts"][0]["upper"] >= body["forecasts"][0]["predicted"]


def test_forecast_volume_uses_seasonal_method_with_long_history():
    api = client()

    response = api.post(
        "/forecast/volume",
        headers={"X-Service-Token": "test-token"},
        json={
            "stationId": "station-1",
            "granularity": "DAY",
            "history": [
                {"date": f"2026-05-{day:02d}", "volume": 20 + (day % 7)}
                for day in range(1, 29)
            ],
            "horizon": 1,
        },
    )

    assert response.status_code == 200
    assert response.json()["method"] == "HOLT_WINTERS"


def test_forecast_volume_falls_back_for_empty_history_and_splits_hours():
    api = client()

    response = api.post(
        "/forecast/volume",
        headers={"X-Service-Token": "test-token"},
        json={
            "stationId": "station-1",
            "granularity": "HOUR",
            "history": [],
            "horizon": 1,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["method"] == "FALLBACK_MEAN"
    assert body["forecasts"][0]["predicted"] == 0
    assert body["forecasts"][0]["hourBreakdown"] == [0] * 24
