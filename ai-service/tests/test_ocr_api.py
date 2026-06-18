from fastapi.testclient import TestClient

from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app(service_token="test-token", ocr_provider="mock"))


def test_health_and_ready_report_provider():
    api = client()

    assert api.get("/healthz").json() == {"status": "ok", "provider": "mock"}
    assert api.get("/readyz").json() == {"status": "ready", "provider": "mock"}


def test_ocr_requires_service_token():
    api = client()

    response = api.post(
        "/ocr/waybill",
        files={"image": ("sf-label.jpg", b"fake image", "image/jpeg")},
    )

    assert response.status_code == 401


def test_mock_ocr_waybill_returns_structured_fields():
    api = client()

    response = api.post(
        "/ocr/waybill",
        headers={"X-Service-Token": "test-token", "X-Request-Id": "req-1"},
        files={"image": ("SF1234567890123_8765.jpg", b"fake image", "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requestId"] == "req-1"
    assert body["provider"] == "mock"
    assert body["fields"]["waybillNo"] == {
        "value": "SF1234567890123",
        "confidence": 0.93,
    }
    assert body["fields"]["phoneTail"] == {"value": "8765", "confidence": 0.88}
    assert body["fields"]["courier"] == {
        "value": "SF",
        "raw": "顺丰速运",
        "confidence": 0.81,
    }
    assert body["overallConfidence"] == 0.87
    assert body["latencyMs"] >= 0
    assert body["warnings"] == []
