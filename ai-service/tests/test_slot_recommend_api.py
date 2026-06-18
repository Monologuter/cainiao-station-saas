from fastapi.testclient import TestClient

from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app(service_token="test-token", ocr_provider="mock"))


def test_slot_recommend_scores_candidates_and_sorts_descending():
    api = client()

    response = api.post(
        "/slot/recommend",
        headers={"X-Service-Token": "test-token"},
        json={
            "stationId": "station-1",
            "parcel": {"phoneTail": "1234", "sizeClass": "S", "inboundHour": 10},
            "candidates": [
                {
                    "slotId": "far-hot",
                    "slotCode": "C-09",
                    "sizeCapacity": "S",
                    "distanceRank": 9,
                    "heat": {
                        "pickCount7d": 30,
                        "hourHistogram": [0] * 10 + [8] + [0] * 13,
                    },
                },
                {
                    "slotId": "near-cool",
                    "slotCode": "A-01",
                    "sizeCapacity": "S",
                    "distanceRank": 1,
                    "heat": {
                        "pickCount7d": 4,
                        "hourHistogram": [0] * 24,
                    },
                },
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["modelVersion"].startswith("slot-rule")
    assert [item["slotId"] for item in body["recommendations"]] == [
        "near-cool",
        "far-hot",
    ]
    assert body["recommendations"][0]["score"] > body["recommendations"][1]["score"]
    assert "近门动线" in body["recommendations"][0]["reasons"]


def test_slot_recommend_filters_large_parcel_from_small_slots():
    api = client()

    response = api.post(
        "/slot/recommend",
        headers={"X-Service-Token": "test-token"},
        json={
            "stationId": "station-1",
            "parcel": {"phoneTail": "1234", "sizeClass": "L", "inboundHour": 18},
            "candidates": [
                {
                    "slotId": "small-slot",
                    "slotCode": "S-01",
                    "sizeCapacity": "S",
                    "distanceRank": 1,
                    "heat": {"pickCount7d": 0, "hourHistogram": [0] * 24},
                },
                {
                    "slotId": "large-slot",
                    "slotCode": "L-01",
                    "sizeCapacity": "L",
                    "distanceRank": 3,
                    "heat": {"pickCount7d": 0, "hourHistogram": [0] * 24},
                },
            ],
        },
    )

    assert response.status_code == 200
    assert [item["slotId"] for item in response.json()["recommendations"]] == [
        "large-slot"
    ]


def test_slot_recommend_accepts_empty_candidates():
    api = client()

    response = api.post(
        "/slot/recommend",
        headers={"X-Service-Token": "test-token"},
        json={
            "stationId": "station-1",
            "parcel": {"phoneTail": "1234", "sizeClass": "M", "inboundHour": 9},
            "candidates": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"modelVersion": "slot-rule-v1", "recommendations": []}
