from __future__ import annotations

import os
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

import httpx

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
        self._sdk = sdk or self._call_anthropic

    async def generate_stream(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextDelta | ToolCall | Done]:
        if not self.api_key:
            raise LlmUnavailable("ANTHROPIC_API_KEY is not configured")

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
        if isinstance(result, dict):
            events: list[TextDelta | ToolCall | Done] = []
            for item in result.get("content", []):
                if item.get("type") == "text":
                    events.append(TextDelta(text=str(item.get("text") or "")))
                if item.get("type") == "tool_use":
                    events.append(
                        ToolCall(
                            id=str(item.get("id") or ""),
                            name=str(item.get("name") or ""),
                            args=dict(item.get("input") or {}),
                        )
                    )
            events.append(Done(reason=str(result.get("stop_reason") or "stop")))
            return events
        return [Done()]

    async def _call_anthropic(
        self,
        api_key: str,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        thinking: dict[str, Any],
    ) -> Any:
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": int(os.getenv("AI_LLM_MAX_TOKENS", "1024")),
            "system": system,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
        if thinking:
            payload["thinking"] = thinking

        timeout = float(os.getenv("AI_LLM_TIMEOUT_SECONDS", "20"))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    def _redact(self, message: str) -> str:
        if self.api_key:
            return message.replace(self.api_key, "[redacted]")
        return message
