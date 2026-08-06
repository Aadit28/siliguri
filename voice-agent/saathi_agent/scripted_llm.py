"""A fake LLM that replays a canned tool-call script.

The eval suite must run with no API key and no network (BUILD_GUIDE D.8): the
thing under test is the tool loop, the state gate and the guards, none of
which are the model's job. Replaying fixed sequences also lets a test script
the exact misbehaviour worth defending against - a fabricated vendor id, a
confirm with no hold - which a real model produces only by accident.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field

from .agent import LLMResponse, LLMToolCall

#: Placeholders resolved from earlier tool results, because hold and booking
#: ids are minted at run time and a script cannot know them.
_PLACEHOLDER = re.compile(r"^\{\{(hold_id|booking_id|slot_id|vendor_id)\}\}$")


class ScriptedStep(BaseModel):
    """One model turn: either some tool calls, or the final spoken reply."""

    content: str | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


class ScriptedLLM:
    """Feed it one list of steps per user turn.

    Turn boundaries are detected from the message list the agent passes in, so
    the script stays in sync even when a turn runs several tool round trips.
    """

    def __init__(self, turns: list[list[ScriptedStep | dict[str, Any]]]) -> None:
        self.turns: list[list[ScriptedStep]] = [
            [s if isinstance(s, ScriptedStep) else ScriptedStep(**s) for s in turn]
            for turn in turns
        ]
        self._turn_index = -1
        self._step_index = 0
        self.calls_made = 0

    def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> LLMResponse:
        self.calls_made += 1
        turn_index = sum(1 for m in messages if m.get("role") == "user") - 1
        if turn_index != self._turn_index:
            self._turn_index = turn_index
            self._step_index = 0

        steps = self.turns[turn_index] if 0 <= turn_index < len(self.turns) else []
        if self._step_index >= len(steps):
            # Script exhausted: say nothing further and let the agent close
            # the turn rather than looping.
            return LLMResponse(content="")

        step = steps[self._step_index]
        self._step_index += 1
        resolved = [
            LLMToolCall(
                id=f"call_{self.calls_made}_{i}",
                name=call["name"],
                arguments=_resolve(call.get("arguments", {}), messages),
            )
            for i, call in enumerate(step.tool_calls)
        ]
        return LLMResponse(content=step.content, tool_calls=resolved)


def _resolve(arguments: dict[str, Any], messages: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in arguments.items():
        match = _PLACEHOLDER.match(value) if isinstance(value, str) else None
        out[key] = _lookup(match.group(1), messages) if match else value
    return out


def _lookup(field: str, messages: list[dict[str, Any]]) -> Any:
    """Most recent value of `field` in any successful tool result so far."""
    for message in reversed(messages):
        if message.get("role") != "tool":
            continue
        try:
            payload = json.loads(message.get("content") or "{}")
        except json.JSONDecodeError:
            continue
        if not payload.get("ok"):
            continue
        data = payload.get("data")
        if isinstance(data, dict) and field in data:
            return data[field]
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and field in item:
                    return item[field]
    return f"<<unresolved:{field}>>"
