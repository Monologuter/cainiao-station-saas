from __future__ import annotations

from typing import Any, AsyncIterator

from .provider import Done, TextDelta


class MockLlmProvider:
    mode = "mock"

    async def generate_stream(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextDelta | Done]:
        _ = system, tools
        question = self._last_user_message(messages)
        yield TextDelta(
            text=f"我已收到您的问题「{question}」。您可以继续询问取件、寄件或包裹状态。",
        )
        yield Done()

    def _last_user_message(self, messages: list[dict[str, Any]]) -> str:
        for message in reversed(messages):
            if message.get("role") == "user":
                return str(message.get("content") or "")
        return ""
