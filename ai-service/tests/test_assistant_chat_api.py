import json

from fastapi.testclient import TestClient

from app.kb.keyword import KbEntry
from app.main import create_app


def client() -> TestClient:
    return TestClient(
        create_app(
            service_token="test-token",
            ocr_provider="mock",
            kb_entries=[
                KbEntry(
                    id="faq-shipping",
                    tenant_id=None,
                    category="SHIPPING",
                    question="怎么在线寄件？",
                    answer="进入寄件页面填写信息并支付。",
                    keywords=["寄件"],
                    priority=10,
                )
            ],
        )
    )


def test_assistant_chat_streams_mock_answer_with_citations():
    api = client()

    response = api.post(
        "/assistant/chat",
        headers={"X-Service-Token": "test-token"},
        json={"tenantId": "tenant-1", "question": "怎么寄件？"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    assert events[0]["event"] == "citation"
    assert events[0]["data"][0]["id"] == "faq-shipping"
    assert any(event["event"] == "delta" and "怎么寄件" in event["data"]["text"] for event in events)
    assert events[-1]["event"] == "done"
    assert events[-1]["data"]["degraded"] is True
    assert events[-1]["data"]["mode"] == "mock"


def test_assistant_chat_emits_tool_call_and_accepts_tool_result():
    api = client()

    response = api.post(
        "/assistant/chat",
        headers={"X-Service-Token": "test-token"},
        json={"tenantId": "tenant-1", "question": "我的包裹到了吗？"},
    )

    events = parse_sse(response.text)
    tool = next(event for event in events if event["event"] == "tool_call")
    assert tool["data"]["toolName"] == "query_my_parcels"
    assert tool["data"]["args"] == {"status": "STORED"}

    continued = api.post(
        f"/assistant/chat/{tool['data']['turnId']}/tool_result",
        headers={"X-Service-Token": "test-token"},
        json={
            "toolName": "query_my_parcels",
            "result": {
                "items": [
                    {
                        "stationName": "城南驿站",
                        "pickupCode": "A123",
                        "slotLabel": "O-01",
                    }
                ]
            },
        },
    )

    assert continued.status_code == 200
    continued_events = parse_sse(continued.text)
    assert any(
        event["event"] == "delta" and "A123" in event["data"]["text"]
        for event in continued_events
    )
    assert continued_events[-1]["event"] == "done"


def test_assistant_chat_requires_service_token():
    api = client()

    response = api.post(
        "/assistant/chat",
        json={"tenantId": "tenant-1", "question": "怎么寄件？"},
    )

    assert response.status_code == 401


def parse_sse(payload: str):
    events = []
    for chunk in payload.strip().split("\n\n"):
        lines = chunk.splitlines()
        event = lines[0].replace("event: ", "")
        data = "\n".join(line.replace("data: ", "", 1) for line in lines[1:])
        events.append({"event": event, "data": json.loads(data)})
    return events
