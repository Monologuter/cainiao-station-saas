from __future__ import annotations

import os
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

from .provider import Done, LlmUnavailable, TextDelta, ToolCall


class ClaudeLlmProvider:
    mode = "real"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        sdk: Optional[Callable[..., Awaitable[Any]]] = None,
    ):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.model = model or os.getenv("AI_LLM_MODEL", "claude-opus-4-8")
        self._sdk = sdk

    async def generate_stream(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextDelta | ToolCall | Done]:
        if self._sdk is None:
            raise LlmUnavailable("Claude SDK is not configured")

        try:
            result = await self._sdk(
                api_key=self.api_key,
                model=self.model,
                system=system,
                messages=messages,
                tools=tools,
                thinking={"type": "adaptive"},
            )
        except Exception as error:
            raise LlmUnavailable(self._redact(str(error))) from error

        for event in self._normalize_result(result):
            yield event

    def _normalize_result(self, result: Any) -> list[TextDelta | ToolCall | Done]:
        if isinstance(result, str):
            return [TextDelta(text=result), Done()]
        return [Done()]

    def _redact(self, message: str) -> str:
        if self.api_key:
            return message.replace(self.api_key, "[redacted]")
        return message
