from fastapi.testclient import TestClient

from app.kb.keyword import KbEntry, KeywordKnowledgeBase
from app.main import create_app


def test_keyword_kb_search_merges_platform_and_tenant_entries():
    kb = KeywordKnowledgeBase(
        [
            KbEntry(
                id="platform-shipping",
                tenant_id=None,
                category="SHIPPING",
                question="怎么在线寄件？",
                answer="进入寄件页面填写信息并支付。",
                keywords=["寄件", "下单"],
                priority=10,
            ),
            KbEntry(
                id="tenant-pickup",
                tenant_id="tenant-1",
                category="PICKUP",
                question="取件码在哪里？",
                answer="打开取件码页面查看。",
                keywords=["取件码"],
                priority=20,
            ),
            KbEntry(
                id="other-tenant",
                tenant_id="tenant-2",
                category="PICKUP",
                question="其它租户取件",
                answer="不应返回。",
                keywords=["取件码"],
                priority=100,
            ),
            KbEntry(
                id="disabled",
                tenant_id=None,
                category="GENERAL",
                question="禁用条目",
                answer="不应返回。",
                keywords=["取件码"],
                enabled=False,
                priority=200,
            ),
        ],
    )

    hits = kb.search("取件码在哪里", tenant_id="tenant-1", k=5)

    assert [hit.id for hit in hits] == ["tenant-pickup"]
    assert hits[0].score > 0


def test_assistant_kb_reindex_requires_service_token():
    api = TestClient(create_app(service_token="test-token", ocr_provider="mock"))

    denied = api.post("/assistant/kb/reindex", json=[])
    assert denied.status_code == 401

    accepted = api.post(
        "/assistant/kb/reindex",
        headers={"X-Service-Token": "test-token"},
        json=[
            {
                "id": "faq-1",
                "tenantId": None,
                "category": "GENERAL",
                "question": "在线客服可以做什么？",
                "answer": "可以回答取件、寄件和包裹状态问题。",
                "keywords": ["客服", "帮助"],
                "priority": 10,
                "enabled": True,
            }
        ],
    )

    assert accepted.status_code == 200
    assert accepted.json() == {"indexed": 1}
    assert api.get("/assistant/healthz").json() == {
        "status": "ok",
        "mode": "mock",
        "kbReady": True,
        "entries": 1,
    }
