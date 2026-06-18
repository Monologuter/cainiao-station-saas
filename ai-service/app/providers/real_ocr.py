from __future__ import annotations

from typing import Awaitable, Callable, Optional

from .ocr_provider import Field, OcrProvider, WaybillResult

SdkCall = Callable[[bytes, str], Awaitable[dict]]


async def unavailable_sdk(_image_bytes: bytes, _filename: str) -> dict:
    raise RuntimeError("real OCR SDK is not configured")


class RealOcrProvider(OcrProvider):
    def __init__(self, code: str, sdk: Optional[SdkCall] = None):
        self.code = code
        self.sdk = sdk or unavailable_sdk

    async def recognize_waybill(
        self, image_bytes: bytes, filename: str
    ) -> WaybillResult:
        try:
            raw = await self.sdk(image_bytes, filename)
        except Exception as exc:  # Provider boundary converts SDK errors.
            return WaybillResult(
                provider=self.code,
                waybill_no=Field(None, 0),
                phone_tail=Field(None, 0),
                courier=Field(None, 0),
                overall_confidence=0,
                warnings=[str(exc)],
                error_code="PROVIDER_ERROR",
            )

        confidence = raw.get("confidence") or {}
        return WaybillResult(
            provider=self.code,
            waybill_no=Field(
                raw.get("waybillNo"),
                float(confidence.get("waybillNo", 0)),
            ),
            phone_tail=Field(
                raw.get("phoneTail"),
                float(confidence.get("phoneTail", 0)),
            ),
            courier=Field(
                raw.get("courierCode"),
                float(confidence.get("courier", 0)),
                raw.get("courierRaw"),
            ),
            overall_confidence=float(confidence.get("overall", 0)),
            warnings=[],
        )
