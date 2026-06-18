import pytest

from app.llm.claude_llm import ClaudeLlmProvider
from app.llm.mock_llm import MockLlmProvider
from app.llm.provider import Done, LlmUnavailable, TextDelta
from app.main import create_llm_provider


def test_factory_selects_mock_llm_provider():
    provider = create_llm_provider("mock")

    assert isinstance(provider, MockLlmProvider)
    assert provider.mode == "mock"


def test_factory_selects_claude_provider_with_default_model():
    provider = create_llm_provider("real")

    assert isinstance(provider, ClaudeLlmProvider)
    assert provider.mode == "real"
    assert provider.model == "claude-opus-4-8"


@pytest.mark.anyio
async def test_mock_llm_provider_streams_template_answer():
    provider = MockLlmProvider()

    events = [
        event
        async for event in provider.generate_stream(
            system="你是菜鸟驿站客服",
            messages=[{"role": "user", "content": "怎么寄件？"}],
            tools=[],
        )
    ]

    assert isinstance(events[0], TextDelta)
    assert "怎么寄件" in events[0].text
    assert isinstance(events[-1], Done)


@pytest.mark.anyio
async def test_claude_provider_wraps_sdk_failure_without_leaking_secret():
    async def failing_sdk(**_kwargs):
        raise RuntimeError("bad api key sk-secret")

    provider = ClaudeLlmProvider(api_key="sk-secret", sdk=failing_sdk)

    with pytest.raises(LlmUnavailable) as error:
        async for _event in provider.generate_stream(
            system="system",
            messages=[{"role": "user", "content": "我的包裹到了吗"}],
            tools=[],
        ):
            pass

    assert "sk-secret" not in str(error.value)
    assert "bad api key" in str(error.value)


def test_factory_rejects_unknown_assistant_mode():
    with pytest.raises(RuntimeError, match="Unsupported AI_ASSISTANT_MODE"):
        create_llm_provider("other")
