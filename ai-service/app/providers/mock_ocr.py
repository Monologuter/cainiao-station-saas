from __future__ import annotations

import re

from .ocr_provider import Field, OcrProvider, WaybillResult


COURIER_BY_PREFIX = {
    "SF": ("SF", "顺丰速运"),
    "YTO": ("YTO", "圆通速递"),
    "ZTO": ("ZTO", "中通快递"),
    "STO": ("STO", "申通快递"),
    "YD": ("YD", "韵达快递"),
    "EMS": ("EMS", "中国邮政"),
    "JT": ("JT", "极兔速递"),
    "JD": ("JD", "京东物流"),
}


class MockOcrProvider(OcrProvider):
    code = "mock"

    async def recognize_waybill(
        self, image_bytes: bytes, filename: str
    ) -> WaybillResult:
        source = filename.upper()
        waybill = self._extract_waybill(source) or "SF1234567890123"
        tail = self._extract_tail(source) or "8765"
        courier_code, courier_raw = self._courier_for(waybill)
        return WaybillResult(
            provider=self.code,
            waybill_no=Field(waybill, 0.93),
            phone_tail=Field(tail, 0.88),
            courier=Field(courier_code, 0.81, courier_raw),
            overall_confidence=0.87,
            warnings=[],
        )

    def _extract_waybill(self, source: str) -> str | None:
        match = re.search(r"(SF|YTO|ZTO|STO|YD|EMS|JT|JD)[A-Z0-9]{8,20}", source)
        return match.group(0) if match else None

    def _extract_tail(self, source: str) -> str | None:
        match = re.search(r"(?<!\d)(\d{4})(?!\d)", source)
        return match.group(1) if match else None

    def _courier_for(self, waybill: str) -> tuple[str, str]:
        for prefix, value in COURIER_BY_PREFIX.items():
            if waybill.startswith(prefix):
                return value
        return ("SF", "顺丰速运")
