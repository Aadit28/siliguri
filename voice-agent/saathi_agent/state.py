"""Conversation state machine (BUILD_GUIDE D.3).

The gate on `confirm_booking` lives here, in code. A prompt that says "only
confirm after the readback" is a suggestion; this class is the rule. Nothing
in the model's output can move the machine into READBACK_CONFIRM - only a
successful `hold_slot` does that - and nothing but an explicit yes from the
elder unlocks the irreversible call.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from .guards import SlotDiff, apply_patch, detect_distress, diff_slots, normalize
from .tools import ToolName


class State(StrEnum):
    IDLE = "IDLE"
    INTENT = "INTENT"
    DISAMBIGUATE = "DISAMBIGUATE"
    SLOT_FILL = "SLOT_FILL"
    READBACK_CONFIRM = "READBACK_CONFIRM"
    EXECUTING = "EXECUTING"
    PENDING_GUARDIAN = "PENDING_GUARDIAN"
    RECEIPT = "RECEIPT"
    HANDOFF = "HANDOFF"


class InvalidTransition(RuntimeError):
    pass


# HANDOFF is reachable from everywhere (distress does not wait for a tidy
# state) and is terminal: once a human owns the call, the agent stops acting.
_ALLOWED: dict[State, set[State]] = {
    State.IDLE: {State.INTENT, State.HANDOFF},
    State.INTENT: {State.DISAMBIGUATE, State.SLOT_FILL, State.RECEIPT, State.IDLE, State.HANDOFF},
    State.DISAMBIGUATE: {State.DISAMBIGUATE, State.SLOT_FILL, State.IDLE, State.HANDOFF},
    State.SLOT_FILL: {
        State.SLOT_FILL,
        State.DISAMBIGUATE,
        State.READBACK_CONFIRM,
        State.RECEIPT,
        State.IDLE,
        State.HANDOFF,
    },
    State.READBACK_CONFIRM: {
        State.READBACK_CONFIRM,
        State.SLOT_FILL,
        State.EXECUTING,
        State.IDLE,
        State.HANDOFF,
    },
    State.EXECUTING: {State.RECEIPT, State.PENDING_GUARDIAN, State.SLOT_FILL, State.HANDOFF},
    State.PENDING_GUARDIAN: {State.RECEIPT, State.IDLE, State.HANDOFF},
    State.RECEIPT: {State.IDLE, State.INTENT, State.HANDOFF},
    State.HANDOFF: {State.HANDOFF},
}

#: Exactly the phrases that count as consent. Silence is not consent, and
#: neither is "hmm" or a repeated question. Keep this list short on purpose.
EXPLICIT_YES: tuple[str, ...] = ("haan", "ঠিক আছে", "theek hai", "confirm", "yes", "হ্যাঁ")

#: Vetoes a yes. Deliberately over-eager: "না" is a substring of innocent
#: Bengali words, and a false veto costs one extra question while a false yes
#: costs a booking nobody agreed to.
NEGATIONS: tuple[str, ...] = ("না", "নয়", "nahi", "nahin", "no", "not", "wrong", "galat", "ভুল")

MAX_FAILED_FILLS = 3
MAX_SILENCES = 2


def _matches(text: str, terms: tuple[str, ...]) -> bool:
    for term in terms:
        if term.isascii():
            if re.search(rf"\b{re.escape(term)}\b", text):
                return True
        elif term in text:
            return True
    return False


def is_explicit_yes(text: str | None) -> bool:
    if not text:
        return False
    normalized = normalize(text).lower()
    if _matches(normalized, NEGATIONS):
        return False
    return _matches(normalized, EXPLICIT_YES)


@dataclass
class Transition:
    frm: State
    to: State
    reason: str


@dataclass
class ConversationStateMachine:
    state: State = State.IDLE
    #: What the elder will hear read back: vendor / date / time / price.
    pending_slots: dict[str, Any] = field(default_factory=dict)
    #: Booking internals (vendor_id, slot_id, hold_id). Never read aloud.
    refs: dict[str, Any] = field(default_factory=dict)
    #: On a correction, only the fields that actually changed.
    readback_fields: list[str] = field(default_factory=list)
    #: What was actually booked, snapshotted at confirm.
    confirmed_slots: dict[str, Any] = field(default_factory=dict)
    last_user_utterance: str | None = None
    #: `perf_counter` stamps, not wall clock: the gate only ever compares them
    #: to each other, and only their ordering carries meaning.
    last_utterance_at: float | None = None
    #: When the readback for the CURRENT booking attempt was handed to the
    #: caller to speak. Cleared by every new or corrected hold, so consent is
    #: always consent to the details the elder actually just heard.
    readback_delivered_at: float | None = None
    failed_fills: int = 0
    silences: int = 0
    corrections: int = 0
    distress_term: str | None = None
    history: list[Transition] = field(default_factory=list)

    # -- transitions -----------------------------------------------------
    def transition_to(self, target: State, reason: str = "") -> None:
        if target != self.state and target not in _ALLOWED[self.state]:
            raise InvalidTransition(f"{self.state} -> {target} is not a legal transition")
        self.history.append(Transition(self.state, target, reason))
        self.state = target

    def can_transition(self, target: State) -> bool:
        return target == self.state or target in _ALLOWED[self.state]

    def force_handoff(self, reason: str) -> None:
        self.transition_to(State.HANDOFF, reason)

    def visited(self, state: State) -> bool:
        return any(t.to == state for t in self.history)

    # -- user turns ------------------------------------------------------
    def observe_user(self, text: str) -> str | None:
        """Record the utterance and return a distress term if one fired.

        Runs before the LLM on every turn, in every state.
        """
        self.last_user_utterance = text
        self.last_utterance_at = time.perf_counter()
        term = detect_distress(text)
        if term:
            self.distress_term = term
            if self.state is not State.HANDOFF:
                self.force_handoff(f"distress:{term}")
        return term

    def record_failed_fill(self) -> bool:
        """A turn that moved nothing forward. Three of them and a human takes over."""
        self.failed_fills += 1
        if self.failed_fills >= MAX_FAILED_FILLS and self.state is not State.HANDOFF:
            self.force_handoff("slot_fill_failed_x3")
            return True
        return False

    def record_progress(self) -> None:
        self.failed_fills = 0
        self.silences = 0

    def record_silence(self) -> int:
        self.silences += 1
        return self.silences

    # -- readback delivery -----------------------------------------------
    def mark_readback_pending(self) -> None:
        """A new or corrected hold: whatever was read back before does not
        authorise this attempt. Called on every successful `hold_slot`."""
        self.readback_delivered_at = None

    def mark_readback_delivered(self) -> None:
        """The readback for this attempt has been handed to the caller to say.

        Only utterances that arrive after this point can be consent - which is
        what stops a hold and a confirm chaining inside one turn, where the
        elder's "haan" was answering the *previous* question.
        """
        if self.state is State.READBACK_CONFIRM and self.readback_delivered_at is None:
            self.readback_delivered_at = time.perf_counter()

    @property
    def readback_answered(self) -> bool:
        """Did the elder speak *after* hearing the readback for this attempt?"""
        return (
            self.readback_delivered_at is not None
            and self.last_utterance_at is not None
            and self.last_utterance_at > self.readback_delivered_at
        )

    # -- slots -----------------------------------------------------------
    def set_pending_slots(self, patch: dict[str, Any]) -> SlotDiff:
        """Merge a patch and report what actually changed.

        Once a readback has happened for this booking attempt, any later patch
        is a correction: only the fields that really differ get re-confirmed,
        so "Thursday, not Tuesday" re-reads the day and nothing else.

        The test is "have we read anything back yet", not "are we in
        READBACK_CONFIRM right now" - finding the new day means a
        `search_slots` first, which legitimately drops the machine back to
        SLOT_FILL mid-correction.
        """
        already_read_back = bool(self.pending_slots)
        diff = diff_slots(self.pending_slots, patch)
        self.pending_slots = apply_patch(self.pending_slots, patch)
        if not already_read_back:
            self.readback_fields = sorted(self.pending_slots)
        elif diff:
            self.corrections += 1
            self.readback_fields = diff.fields
        return diff

    def complete_attempt(self) -> dict[str, Any]:
        """Booking committed: the slots stop being pending, so a second
        booking in the same call starts clean instead of looking like a
        correction of the first."""
        self.confirmed_slots = dict(self.pending_slots)
        self.pending_slots = {}
        self.readback_fields = []
        self.corrections = 0
        self.readback_delivered_at = None
        return self.confirmed_slots

    # -- the gate --------------------------------------------------------
    def can_call(self, tool: str) -> tuple[bool, str]:
        """Consulted before every mutating dispatch. Returns (allowed, why not)."""
        if self.state is State.HANDOFF and tool != ToolName.HANDOFF_TO_HUMAN:
            return False, "A human has taken over this call; the agent may not act further."

        if tool == ToolName.CONFIRM_BOOKING:
            if self.state is not State.READBACK_CONFIRM:
                return (
                    False,
                    f"confirm_booking requires state READBACK_CONFIRM (currently {self.state}). "
                    "Hold a slot and read the details back first.",
                )
            if not is_explicit_yes(self.last_user_utterance):
                return (
                    False,
                    "The elder has not said an explicit yes to the readback "
                    f"(last utterance: {self.last_user_utterance!r}). Silence is not consent.",
                )
            if not self.readback_answered:
                # The yes is older than the readback: it answered whatever was
                # asked before the hold existed. Holding and confirming in one
                # turn lands here, which is the point.
                return (
                    False,
                    "The readback for this hold has not been delivered and answered yet. "
                    "Read the vendor, date, time and price back, then wait for the elder's "
                    "reply before confirming.",
                )
            return True, ""

        if tool == ToolName.HOLD_SLOT:
            # DISAMBIGUATE is deliberately not here: while two vendors are
            # still in play there is nothing to hold. It is also the state the
            # transition table refuses to move to READBACK_CONFIRM from, and a
            # gate that disagrees with the table creates a server-side hold and
            # then crashes on the transition.
            if self.state not in (State.SLOT_FILL, State.READBACK_CONFIRM):
                return (
                    False,
                    f"hold_slot requires a slot-filling state (currently {self.state}). "
                    "Search vendors and slots first.",
                )
            if not self.can_transition(State.READBACK_CONFIRM):
                return (
                    False,
                    f"a hold taken in {self.state} would have to move to READBACK_CONFIRM, "
                    "which is not a legal transition from here.",
                )

        return True, ""
