from __future__ import annotations

import os
import time
import json
from typing import Any, Callable, Optional

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .kb.keyword import KbEntry, KeywordKnowledgeBase
from .llm.claude_llm import ClaudeLlmProvider
from .llm.mock_llm import MockLlmProvider
from .llm.provider import LlmProvider
from .providers.mock_ocr import MockOcrProvider
from .providers.ocr_provider import OcrProvider, WaybillResult
from .providers.real_ocr import RealOcrProvider
from .rag.orchestrator import AssistantOrchestrator
from .slot.scorer import SlotScorer
from .slot.schemas import SlotRecommendRequest


def create_app(
    service_token: Optional[str] = None,
    ocr_provider: Optional[str] = None,
    provider_factory: Optional[Callable[[], OcrProvider]] = None,
    kb_entries: Optional[list[KbEntry]] = None,
    assistant_mode: Optional[str] = None,
    llm_provider_factory: Optional[Callable[[], LlmProvider]] = None,
) -> FastAPI:
    token = service_token or os.getenv("SERVICE_TOKEN", "dev-service-token")
    provider_name = ocr_provider or os.getenv("OCR_PROVIDER", "mock")
    provider = provider_factory() if provider_factory else create_provider(provider_name)
    llm_mode = assistant_mode or os.getenv("AI_ASSISTANT_MODE", "mock")
    llm_provider = (
        llm_provider_factory()
        if llm_provider_factory
        else create_llm_provider(llm_mode)
    )

    app = FastAPI(title="Cainiao Station AI Service")
    app.state.ocr_provider = provider
    app.state.llm_provider = llm_provider
    app.state.knowledge_base = KeywordKnowledgeBase(kb_entries)
    app.state.assistant = AssistantOrchestrator(
        app.state.knowledge_base,
        app.state.llm_provider,
    )
    app.state.slot_scorer = SlotScorer()
    app.state.service_token = token

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "provider": provider.code}

    @app.get("/readyz")
    async def readyz():
        return {"status": "ready", "provider": provider.code}

    @app.get("/assistant/healthz")
    async def assistant_healthz():
        kb = app.state.knowledge_base
        return {
            "status": "ok",
            "mode": llm_provider.mode,
            "kbReady": True,
            "entries": kb.count,
        }

    @app.post("/assistant/kb/reindex")
    async def reindex_assistant_kb(
        entries: list[dict[str, Any]],
        x_service_token: Optional[str] = Header(
            default=None,
            alias="X-Service-Token",
        ),
    ):
        if x_service_token != token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        kb_entries = [to_kb_entry(entry) for entry in entries]
        app.state.knowledge_base.reindex(kb_entries)
        return {"indexed": len(kb_entries)}

    @app.post("/assistant/chat")
    async def assistant_chat(
        payload: dict[str, Any],
        x_service_token: Optional[str] = Header(
            default=None,
            alias="X-Service-Token",
        ),
    ):
        if x_service_token != token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        return StreamingResponse(
            to_sse(
                app.state.assistant.chat(
                    tenant_id=str(payload["tenantId"]),
                    question=str(payload["question"]),
                )
            ),
            media_type="text/event-stream",
        )

    @app.post("/assistant/chat/{turn_id}/tool_result")
    async def assistant_tool_result(
        turn_id: str,
        payload: dict[str, Any],
        x_service_token: Optional[str] = Header(
            default=None,
            alias="X-Service-Token",
        ),
    ):
        if x_service_token != token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        return StreamingResponse(
            to_sse(
                app.state.assistant.continue_with_tool_result(
                    turn_id=turn_id,
                    tool_name=str(payload["toolName"]),
                    result=dict(payload.get("result") or {}),
                )
            ),
            media_type="text/event-stream",
        )

    @app.post("/slot/recommend")
    async def slot_recommend(
        payload: SlotRecommendRequest,
        x_service_token: Optional[str] = Header(
            default=None,
            alias="X-Service-Token",
        ),
    ):
        if x_service_token != token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        return app.state.slot_scorer.recommend(payload)

    @app.post("/ocr/waybill")
    async def recognize_waybill(
        image: UploadFile = File(...),
        x_service_token: Optional[str] = Header(
            default=None,
            alias="X-Service-Token",
        ),
        x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
    ):
        if x_service_token != token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        started = time.perf_counter()
        result = await provider.recognize_waybill(
            await image.read(),
            image.filename or "",
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        return to_response(result, x_request_id, latency_ms)

    return app


def to_kb_entry(payload: dict[str, Any]) -> KbEntry:
    return KbEntry(
        id=str(payload["id"]),
        tenant_id=payload.get("tenantId") or payload.get("tenant_id"),
        category=str(payload["category"]),
        question=str(payload["question"]),
        answer=str(payload["answer"]),
        keywords=list(payload.get("keywords") or []),
        priority=int(payload.get("priority") or 0),
        enabled=bool(payload.get("enabled", True)),
        source=str(payload.get("source") or "reindex"),
    )


async def to_sse(events):
    async for event in events:
        yield f"event: {event['event']}\n"
        yield f"data: {json.dumps(event['data'], ensure_ascii=False)}\n\n"


def create_provider(name: str) -> OcrProvider:
    if name == "mock":
        return MockOcrProvider()
    if name == "tencent":
        return RealOcrProvider(code="tencent")
    raise RuntimeError(f"Unsupported OCR_PROVIDER: {name}")


def create_llm_provider(mode: Optional[str] = None) -> LlmProvider:
    selected = mode or os.getenv("AI_ASSISTANT_MODE", "mock")
    if selected == "mock":
        return MockLlmProvider()
    if selected == "real":
        return ClaudeLlmProvider()
    raise RuntimeError(f"Unsupported AI_ASSISTANT_MODE: {selected}")


def to_response(result: WaybillResult, request_id: Optional[str], latency_ms: int):
    body = {
        "requestId": request_id,
        "provider": result.provider,
        "fields": {
            "waybillNo": {
                "value": result.waybill_no.value,
                "confidence": result.waybill_no.confidence,
            },
            "phoneTail": {
                "value": result.phone_tail.value,
                "confidence": result.phone_tail.confidence,
            },
            "courier": {
                "value": result.courier.value,
                "raw": result.courier.raw,
                "confidence": result.courier.confidence,
            },
        },
        "overallConfidence": result.overall_confidence,
        "latencyMs": latency_ms,
        "warnings": result.warnings,
    }
    if result.error_code:
        body["errorCode"] = result.error_code
    return body


app = create_app()
