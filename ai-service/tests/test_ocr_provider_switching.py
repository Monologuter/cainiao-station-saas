import pytest

from app.main import create_provider
from app.providers.real_ocr import RealOcrProvider


@pytest.mark.anyio
async def test_factory_selects_real_provider_for_tencent():
    provider = create_provider("tencent")

    assert isinstance(provider, RealOcrProvider)
    assert provider.code == "tencent"


@pytest.mark.anyio
async def test_real_provider_normalizes_sdk_result():
    async def sdk(_image_bytes: bytes, _filename: str):
        return {
            "waybillNo": "YTO9876543210",
            "phoneTail": "4321",
            "courierRaw": "圆通速递",
            "courierCode": "YTO",
            "confidence": {
                "waybillNo": 0.91,
                "phoneTail": 0.86,
                "courier": 0.82,
                "overall": 0.84,
            },
        }

    provider = RealOcrProvider(code="tencent", sdk=sdk)
    result = await provider.recognize_waybill(b"image", "label.jpg")

    assert result.provider == "tencent"
    assert result.waybill_no.value == "YTO9876543210"
    assert result.phone_tail.value == "4321"
    assert result.courier.value == "YTO"
    assert result.overall_confidence == 0.84


@pytest.mark.anyio
async def test_real_provider_returns_provider_error_on_sdk_failure():
    async def sdk(_image_bytes: bytes, _filename: str):
        raise RuntimeError("quota exceeded")

    provider = RealOcrProvider(code="tencent", sdk=sdk)
    result = await provider.recognize_waybill(b"image", "label.jpg")

    assert result.provider == "tencent"
    assert result.error_code == "PROVIDER_ERROR"
    assert result.overall_confidence == 0
    assert result.warnings == ["quota exceeded"]


def test_factory_rejects_unknown_provider():
    with pytest.raises(RuntimeError, match="Unsupported OCR_PROVIDER"):
        create_provider("unknown")
