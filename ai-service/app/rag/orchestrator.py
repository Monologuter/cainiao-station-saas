from __future__ import annotations

from typing import Any, AsyncIterator
from uuid import uuid4

from ..kb.keyword import KbHit, KeywordKnowledgeBase
from ..llm.provider import Done, LlmProvider, TextDelta, ToolCall


class AssistantOrchestrator:
    def __init__(self, kb: KeywordKnowledgeBase, llm: LlmProvider):
        self._kb = kb
        self._llm = llm
        self._pending_turns: dict[str, dict[str, Any]] = {}

    async def chat(
        self,
        tenant_id: str,
        question: str,
    ) -> AsyncIterator[dict[str, Any]]:
        if self._needs_parcel_tool(question):
            turn_id = str(uuid4())
            self._pending_turns[turn_id] = {
                "tenantId": tenant_id,
                "question": question,
            }
            yield {
                "event": "tool_call",
                "data": {
                    "turnId": turn_id,
                    "toolName": "query_my_parcels",
                    "args": {"status": "STORED"},
                },
            }
            return

        hits = self._kb.search(question, tenant_id=tenant_id, k=3)
        if hits:
            yield {"event": "citation", "data": [self._citation(hit) for hit in hits]}

        async for event in self._llm.generate_stream(
            system="你是菜鸟驿站智能客服，只回答驿站业务相关问题。",
            messages=[{"role": "user", "content": question}],
            tools=[],
        ):
            if isinstance(event, TextDelta):
                yield {"event": "delta", "data": {"text": event.text}}
            elif isinstance(event, ToolCall):
                yield {
                    "event": "tool_call",
                    "data": {
                        "turnId": str(uuid4()),
                        "toolName": event.name,
                        "args": event.args,
                    },
                }
            elif isinstance(event, Done):
                yield {
                    "event": "done",
                    "data": {
                        "reason": event.reason,
                        "degraded": self._llm.mode == "mock",
                        "mode": self._llm.mode,
                    },
                }

    async def continue_with_tool_result(
        self,
        turn_id: str,
        tool_name: str,
        result: dict[str, Any],
    ) -> AsyncIterator[dict[str, Any]]:
        if turn_id not in self._pending_turns:
            yield {
                "event": "done",
                "data": {"reason": "missing_turn", "degraded": True, "mode": self._llm.mode},
            }
            return
        self._pending_turns.pop(turn_id, None)

        text = self._format_tool_result(tool_name, result)
        yield {"event": "delta", "data": {"text": text}}
        yield {
            "event": "done",
            "data": {"reason": "stop", "degraded": self._llm.mode == "mock", "mode": self._llm.mode},
        }

    def _needs_parcel_tool(self, question: str) -> bool:
        return "我的包裹" in question or "取件码" in question or "到了吗" in question

    def _citation(self, hit: KbHit) -> dict[str, Any]:
        return {
            "id": hit.id,
            "category": hit.category,
            "question": hit.question,
            "score": hit.score,
            "source": hit.source,
        }

    def _format_tool_result(self, tool_name: str, result: dict[str, Any]) -> str:
        if tool_name != "query_my_parcels":
            return "查询已完成。"
        items = result.get("items") or []
        if not items:
            return "暂未查到您的在库待取包裹。"
        first = items[0]
        return (
            f"您有 {len(items)} 件包裹待取。"
            f"{first.get('stationName', '驿站')}，取件码 {first.get('pickupCode', '--')}，"
            f"库位 {first.get('slotLabel', '--')}。"
        )
