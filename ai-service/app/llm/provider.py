from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator, Protocol


class LlmUnavailable(RuntimeError):
    pass


@dataclass
class TextDelta:
    text: str
    event: str = "delta"


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]
    event: str = "tool_call"


@dataclass
class Done:
    reason: str = "stop"
    event: str = "done"


class LlmProvider(Protocol):
    mode: str

    async def generate_stream(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[TextDelta | ToolCall | Done]:
        ...
