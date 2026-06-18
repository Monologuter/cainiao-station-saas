from __future__ import annotations

import os
import time
from typing import Callable, Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile

from .providers.mock_ocr import MockOcrProvider
from .providers.ocr_provider import OcrProvider, WaybillResult


def create_app(
    service_token: Optional[str] = None,
    ocr_provider: Optional[str] = None,
    provider_factory: Optional[Callable[[], OcrProvider]] = None,
) -> FastAPI:
    token = service_token or os.getenv("SERVICE_TOKEN", "dev-service-token")
    provider_name = ocr_provider or os.getenv("OCR_PROVIDER", "mock")
    provider = provider_factory() if provider_factory else create_provider(provider_name)

    app = FastAPI(title="Cainiao Station AI Service")
    app.state.ocr_provider = provider
    app.state.service_token = token

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "provider": provider.code}

    @app.get("/readyz")
    async def readyz():
        return {"status": "ready", "provider": provider.code}

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


def create_provider(name: str) -> OcrProvider:
    if name == "mock":
        return MockOcrProvider()
    raise RuntimeError(f"Unsupported OCR_PROVIDER: {name}")


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
