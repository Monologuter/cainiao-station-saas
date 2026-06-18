from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class Field:
    value: Optional[str]
    confidence: float
    raw: Optional[str] = None


@dataclass
class WaybillResult:
    provider: str
    waybill_no: Field
    phone_tail: Field
    courier: Field
    overall_confidence: float
    warnings: list[str]
    error_code: Optional[str] = None


class OcrProvider:
    code = "base"

    async def recognize_waybill(
        self, image_bytes: bytes, filename: str
    ) -> WaybillResult:
        raise NotImplementedError
