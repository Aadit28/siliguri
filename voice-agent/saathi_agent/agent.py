"""The tool loop.

Order of operations for every user turn, and the order is the design:

    distress check -> LLM -> state gate -> arg guards -> runtime idempotency
    key -> booking API -> audit -> state effects

The two checks that can stop a booking (distress, and the confirm gate) both
run outside the model. The model chooses *what* to attempt; this module
decides what is allowed to happen.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Protocol

from pydantic import BaseModel, Field

from .booking_client import BookingClient, BookingError
from .guards import RejectionCode, SessionMemory, ToolRejection
from .prompts import (
    ElderContext,
    build_system_prompt,
    handoff_copy,
    polite_close,
    silence_reprompt,
)
from .state import MAX_SILENCES, ConversationStateMachine, State
from .tools import MUTATING_TOOLS, ToolDispatcher, ToolName, ToolOutcome, openai_tool_schemas

#: Tools whose success means the conversation moved forward. A turn with none
#: of these and no new slot value is a failed slot-fill turn.
PROGRESS_TOOLS: frozenset[str] = frozenset(
    {
        ToolName.SEARCH_VENDORS,
        ToolName.SEARCH_SLOTS,
        ToolName.HOLD_SLOT,
        ToolName.CONFIRM_BOOKING,
        ToolName.CANCEL_BOOKING,
        ToolName.CREATE_REMINDER,
        ToolName.CALL_FAMILY_MEMBER,
    }
)


# --------------------------------------------------------------------------
# LLM plumbing
# --------------------------------------------------------------------------


class LLMToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class LLMResponse(BaseModel):
    content: str | None = None
    tool_calls: list[LLMToolCall] = Field(default_factory=list)


class LLMClient(Protocol):
    def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> LLMResponse: ...


class OpenAIChatClient:
    """Any OpenAI-compatible endpoint: OpenAI, Sarvam-M, the existing OpenCode
    Go plan. Which one is a benchmark question (BUILD_GUIDE D.1), not a code
    change - only the three env vars move."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float = 0.2,
    ) -> None:
        from openai import OpenAI  # imported lazily so the tests run offline

        self.model = model or os.environ.get("SAATHI_LLM_MODEL", "gpt-4o-mini")
        self.temperature = temperature
        self._client = OpenAI(
            base_url=base_url or os.environ.get("SAATHI_LLM_BASE_URL") or None,
            api_key=api_key or os.environ.get("SAATHI_LLM_API_KEY", ""),
        )

    def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> LLMResponse:
        completion = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=self.temperature,
        )
        message = completion.choices[0].message
        calls: list[LLMToolCall] = []
        for call in message.tool_calls or []:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                # Malformed JSON is the model's problem to fix; hand it back as
                # bad args rather than crashing the call.
                arguments = {"__unparsed__": call.function.arguments}
            calls.append(LLMToolCall(id=call.id, name=call.function.name, arguments=arguments))
        return LLMResponse(content=message.content, tool_calls=calls)


# --------------------------------------------------------------------------
# Audit trace
# --------------------------------------------------------------------------


class AuditEvent(BaseModel):
    seq: int
    ts: float
    session_id: str
    origin: str  # "model" | "runtime"
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    ok: bool
    data: Any = None
    error: dict[str, Any] | None = None
    idempotency_key: str | None = None
    state_before: str = ""
    state_after: str = ""
    model_supplied_key: bool = False


class AuditTrace:
    """Flight recorder. Mirrors what the server writes to `audit_log`
    (BUILD_GUIDE B.4) and is what the guardian portal will read back."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.events: list[AuditEvent] = []

    def record(
        self,
        *,
        origin: str,
        outcome: ToolOutcome,
        state_before: State,
        state_after: State,
    ) -> AuditEvent:
        event = AuditEvent(
            seq=len(self.events) + 1,
            ts=time.time(),
            session_id=self.session_id,
            origin=origin,
            tool=outcome.tool,
            args=outcome.args,
            ok=outcome.ok,
            data=outcome.data,
            error=outcome.rejection.as_dict() if outcome.rejection else None,
            idempotency_key=outcome.idempotency_key,
            state_before=str(state_before),
            state_after=str(state_after),
            model_supplied_key=outcome.model_supplied_key,
        )
        self.events.append(event)
        return event

    def tool_sequence(self, *, only_ok: bool = True) -> list[str]:
        return [e.tool for e in self.events if e.ok or not only_ok]

    def to_jsonl(self) -> str:
        return "\n".join(e.model_dump_json() for e in self.events)

    def dump_jsonl(self, path: str | Path) -> Path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(self.to_jsonl() + "\n", encoding="utf-8")
        return target


def _is_progress(outcome: ToolOutcome) -> bool:
    """A search that found nothing has not moved the call forward, and three
    of those in a row should still reach a human."""
    if not outcome.ok or outcome.tool not in PROGRESS_TOOLS:
        return False
    if isinstance(outcome.data, list) and not outcome.data:
        return False
    return True


@dataclass
class AgentTurn:
    reply: str
    outcomes: list[ToolOutcome] = field(default_factory=list)
    state: State = State.IDLE
    handed_off: bool = False
    closed: bool = False


# --------------------------------------------------------------------------
# Session
# --------------------------------------------------------------------------


class VoiceSession:
    """One call. Text in, text out; week 2 replaces the caller with LiveKit."""

    def __init__(
        self,
        booking_client: BookingClient,
        llm: LLMClient,
        context: ElderContext | None = None,
        *,
        session_id: str | None = None,
        max_tool_iterations: int = 6,
    ) -> None:
        self.context = context or ElderContext()
        self.client = booking_client
        self.llm = llm
        self.session_id = session_id or f"vs_{uuid.uuid4().hex[:12]}"
        self.memory = SessionMemory(self.context.member_dicts())
        self.state = ConversationStateMachine()
        self.dispatcher = ToolDispatcher(booking_client, self.memory)
        self.audit = AuditTrace(self.session_id)
        self.tools = openai_tool_schemas()
        self.max_tool_iterations = max_tool_iterations
        self.messages: list[dict[str, Any]] = [
            {"role": "system", "content": build_system_prompt(self.context)}
        ]

    # -- public turns ----------------------------------------------------
    def user_says(self, text: str) -> AgentTurn:
        if not (text or "").strip():
            return self.on_silence()

        before = self.state.state
        distress = self.state.observe_user(text)
        if distress:
            return self._handoff(f"distress:{distress}", state_before=before)

        if self.state.state is State.HANDOFF:
            # A human owns the call. Say the same reviewed line, do nothing.
            return AgentTurn(reply=self._copy(handoff_copy), state=self.state.state, handed_off=True)

        if self.state.state in (State.IDLE, State.RECEIPT):
            self.state.transition_to(State.INTENT, "user utterance")

        self.messages.append({"role": "user", "content": text})
        return self._run_loop()

    def on_silence(self) -> AgentTurn:
        """No speech for the endpointing window. One gentle re-prompt, then
        close politely - holds are released rather than left to rot."""
        count = self.state.record_silence()
        if count < MAX_SILENCES:
            return AgentTurn(reply=self._copy(silence_reprompt), state=self.state.state)
        self.close(reason="silence_x2")
        return AgentTurn(reply=self._copy(polite_close), state=self.state.state, closed=True)

    def close(self, *, reason: str = "call_ended") -> None:
        """End of call. Any hold still standing goes back to capacity now."""
        for hold_id in list(self.memory.live_hold_ids()):
            self._release_hold(hold_id, reason=reason)
        if self.state.state is not State.HANDOFF and self.state.can_transition(State.IDLE):
            self.state.transition_to(State.IDLE, reason)

    def dump_audit(self, path: str | Path | None = None) -> Path:
        return self.audit.dump_jsonl(path or f"traces/{self.session_id}.jsonl")

    # -- loop ------------------------------------------------------------
    def _run_loop(self) -> AgentTurn:
        outcomes: list[ToolOutcome] = []
        reply = ""
        progressed = False

        for _ in range(self.max_tool_iterations):
            response = self.llm.complete(self.messages, self.tools)
            self.messages.append(self._assistant_message(response))

            if not response.tool_calls:
                reply = response.content or ""
                break

            for call in response.tool_calls:
                outcome = self._execute(call)
                outcomes.append(outcome)
                progressed = progressed or _is_progress(outcome)
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": call.name,
                        "content": outcome.tool_content(),
                    }
                )

            if self.state.state is State.HANDOFF:
                return AgentTurn(
                    reply=self._copy(handoff_copy),
                    outcomes=outcomes,
                    state=self.state.state,
                    handed_off=True,
                )
        else:
            # Ran out of iterations mid-tool-loop. Never leave the caller in
            # silence: say something and let the next turn recover.
            reply = response.content or self._copy(silence_reprompt)

        if progressed:
            self.state.record_progress()
        elif self.state.state in (State.INTENT, State.DISAMBIGUATE, State.SLOT_FILL):
            before_fill = self.state.state
            if self.state.record_failed_fill():
                turn = self._handoff("slot_fill_failed_x3", state_before=before_fill)
                turn.outcomes = outcomes + turn.outcomes
                return turn

        return AgentTurn(reply=reply, outcomes=outcomes, state=self.state.state)

    def _assistant_message(self, response: LLMResponse) -> dict[str, Any]:
        message: dict[str, Any] = {"role": "assistant", "content": response.content}
        if response.tool_calls:
            message["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                    },
                }
                for call in response.tool_calls
            ]
        return message

    # -- one tool call ---------------------------------------------------
    def _execute(self, call: LLMToolCall) -> ToolOutcome:
        state_before = self.state.state

        if call.name in MUTATING_TOOLS:
            allowed, why = self.state.can_call(call.name)
            if not allowed:
                outcome = ToolOutcome(
                    tool=call.name,
                    args=call.arguments,
                    ok=False,
                    rejection=ToolRejection(code=RejectionCode.STATE_BLOCKED, message=why),
                )
                self.audit.record(
                    origin="model",
                    outcome=outcome,
                    state_before=state_before,
                    state_after=self.state.state,
                )
                return outcome

        outcome = self.dispatcher.dispatch(call.name, call.arguments)
        if outcome.ok:
            self._apply_effects(outcome)
        self.audit.record(
            origin="model",
            outcome=outcome,
            state_before=state_before,
            state_after=self.state.state,
        )
        return outcome

    def _apply_effects(self, outcome: ToolOutcome) -> None:
        tool, data = outcome.tool, outcome.data

        if tool == ToolName.SEARCH_VENDORS:
            if not data:
                return  # nothing found is not progress; the model re-queries
            target = State.DISAMBIGUATE if len(data) > 1 else State.SLOT_FILL
            if not self.state.can_transition(target):
                target = State.SLOT_FILL
            self.state.transition_to(target, "search_vendors")

        elif tool == ToolName.SEARCH_SLOTS:
            self.state.transition_to(State.SLOT_FILL, "search_slots")

        elif tool == ToolName.HOLD_SLOT:
            previous = self.state.refs.get("hold_id")
            if previous and previous != data["hold_id"]:
                # A correction replaced the slot. Give the old one back at
                # once instead of waiting out its five minutes.
                self._release_hold(previous, reason="replaced_by_correction")
            # Diff runs while the machine is still in READBACK_CONFIRM, which
            # is what makes a correction a patch instead of a restart.
            self.state.set_pending_slots(
                {
                    "vendor": data.get("vendor_name"),
                    "date": data.get("date"),
                    "time": data.get("time"),
                    "price": data.get("price_paise"),
                }
            )
            self.state.refs.update(
                {
                    "vendor_id": data.get("vendor_id"),
                    "slot_id": data.get("slot_id"),
                    "hold_id": data.get("hold_id"),
                }
            )
            self.state.transition_to(State.READBACK_CONFIRM, "hold_slot")

        elif tool == ToolName.CONFIRM_BOOKING:
            self.state.transition_to(State.EXECUTING, "confirm_booking")
            self.state.refs["booking_id"] = data.get("booking_id")
            self.state.refs.pop("hold_id", None)
            self.state.complete_attempt()
            if data.get("status") == "pending_guardian":
                self.state.transition_to(State.PENDING_GUARDIAN, "guardian approval required")
            else:
                self.state.transition_to(State.RECEIPT, str(data.get("status")))

        elif tool in (ToolName.CANCEL_BOOKING, ToolName.CREATE_REMINDER):
            if self.state.can_transition(State.RECEIPT):
                self.state.transition_to(State.RECEIPT, str(tool))

        elif tool == ToolName.HANDOFF_TO_HUMAN:
            if self.state.state is not State.HANDOFF:
                self.state.force_handoff(str(outcome.args.get("reason", "handoff")))
            for hold_id in list(self.memory.live_hold_ids()):
                self._release_hold(hold_id, reason="handoff")

    # -- runtime-initiated actions ---------------------------------------
    def _handoff(self, reason: str, *, state_before: State | None = None) -> AgentTurn:
        """Runtime handoff: distress or three failed fills. The model is not
        consulted - it is told."""
        before = state_before or self.state.state
        if self.state.state is not State.HANDOFF:
            self.state.force_handoff(reason)
        outcome = self.dispatcher.dispatch(ToolName.HANDOFF_TO_HUMAN, {"reason": reason})
        self.audit.record(
            origin="runtime",
            outcome=outcome,
            state_before=before,
            state_after=self.state.state,
        )
        for hold_id in list(self.memory.live_hold_ids()):
            self._release_hold(hold_id, reason=reason)
        return AgentTurn(
            reply=self._copy(handoff_copy),
            outcomes=[outcome],
            state=self.state.state,
            handed_off=True,
        )

    def _release_hold(self, hold_id: str, *, reason: str) -> None:
        state_before = self.state.state
        try:
            data = self.client.release_hold(hold_id)
        except BookingError as exc:
            outcome = ToolOutcome(
                tool="release_hold",
                args={"hold_id": hold_id, "reason": reason},
                ok=False,
                rejection=ToolRejection(
                    code=RejectionCode.UPSTREAM_ERROR,
                    message=f"{exc.code}: {exc.message}",
                    retryable=exc.retryable,
                ),
            )
        else:
            if hold_id in self.memory.holds:
                self.memory.holds[hold_id]["status"] = "released"
            if self.state.refs.get("hold_id") == hold_id:
                self.state.refs.pop("hold_id", None)
            outcome = ToolOutcome(
                tool="release_hold",
                args={"hold_id": hold_id, "reason": reason},
                ok=True,
                data=data,
            )
        self.audit.record(
            origin="runtime",
            outcome=outcome,
            state_before=state_before,
            state_after=self.state.state,
        )

    def _copy(self, chooser: Any) -> str:
        return chooser(self.context.language)
