"""The state machine on its own, with no agent and no booking client.

These are the rules that are code rather than prompt, so they are tested
without a model anywhere in the picture.
"""

from __future__ import annotations

import pytest

from saathi_agent import ConversationStateMachine, InvalidTransition, State, ToolName, is_explicit_yes
from saathi_agent.state import MAX_FAILED_FILLS

READBACK = {"vendor": "ডাঃ শর্মা", "date": "2026-08-13", "time": "16:00", "price": 30000}


def machine_in(state: State) -> ConversationStateMachine:
    """Walk a real machine to `state` - no reaching in and setting the field,
    because an unreachable state would make the test lie."""
    m = ConversationStateMachine()
    paths: dict[State, list[State]] = {
        State.IDLE: [],
        State.INTENT: [State.INTENT],
        State.DISAMBIGUATE: [State.INTENT, State.DISAMBIGUATE],
        State.SLOT_FILL: [State.INTENT, State.SLOT_FILL],
        State.READBACK_CONFIRM: [State.INTENT, State.SLOT_FILL, State.READBACK_CONFIRM],
        State.EXECUTING: [State.INTENT, State.SLOT_FILL, State.READBACK_CONFIRM, State.EXECUTING],
        State.PENDING_GUARDIAN: [
            State.INTENT,
            State.SLOT_FILL,
            State.READBACK_CONFIRM,
            State.EXECUTING,
            State.PENDING_GUARDIAN,
        ],
        State.RECEIPT: [State.INTENT, State.SLOT_FILL, State.READBACK_CONFIRM, State.EXECUTING, State.RECEIPT],
        State.HANDOFF: [State.HANDOFF],
    }
    for step in paths[state]:
        m.transition_to(step, "test setup")
    assert m.state is state
    return m


# --------------------------------------------------------------------------
# The confirm gate
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "state",
    [s for s in State if s is not State.READBACK_CONFIRM],
)
def test_confirm_blocked_outside_readback(state: State) -> None:
    m = machine_in(state)
    m.last_user_utterance = "হ্যাঁ"  # even a yes does not help in the wrong state
    allowed, why = m.can_call(ToolName.CONFIRM_BOOKING)
    assert not allowed
    assert why


def test_confirm_blocked_without_explicit_yes() -> None:
    m = machine_in(State.READBACK_CONFIRM)
    for utterance in ["", "hmm", "আচ্ছা...", "কত টাকা বললেন?", None]:
        m.last_user_utterance = utterance
        allowed, why = m.can_call(ToolName.CONFIRM_BOOKING)
        assert not allowed, f"{utterance!r} must not count as consent"
        assert "explicit yes" in why


@pytest.mark.parametrize("phrase", ["haan", "ঠিক আছে", "theek hai", "confirm", "yes", "হ্যাঁ"])
def test_every_explicit_yes_unlocks_confirm(phrase: str) -> None:
    m = machine_in(State.READBACK_CONFIRM)
    m.last_user_utterance = phrase
    assert m.can_call(ToolName.CONFIRM_BOOKING) == (True, "")


@pytest.mark.parametrize(
    "phrase",
    ["না, ঠিক আছে নয়", "nahi haan nahi", "no, not confirm", "yes ভুল হয়েছে"],
)
def test_negation_vetoes_a_yes(phrase: str) -> None:
    """Fails closed: a sentence carrying both a yes and a no is not consent."""
    assert not is_explicit_yes(phrase)


def test_hold_requires_a_slot_filling_state() -> None:
    for state in (State.IDLE, State.INTENT, State.RECEIPT):
        allowed, _ = machine_in(state).can_call(ToolName.HOLD_SLOT)
        assert not allowed
    for state in (State.DISAMBIGUATE, State.SLOT_FILL, State.READBACK_CONFIRM):
        allowed, _ = machine_in(state).can_call(ToolName.HOLD_SLOT)
        assert allowed


# --------------------------------------------------------------------------
# Distress and failure exits
# --------------------------------------------------------------------------


@pytest.mark.parametrize("state", list(State))
@pytest.mark.parametrize(
    "utterance",
    ["dard ho raha hai", "বুকে ব্যথা", "this is an emergency", "সাহায্য করুন", "chest pain", "সীনে ব্যথা"],
)
def test_distress_hands_off_from_any_state(state: State, utterance: str) -> None:
    m = machine_in(state)
    term = m.observe_user(utterance)
    assert term is not None
    assert m.state is State.HANDOFF


def test_distress_does_not_fire_on_lookalike_words() -> None:
    m = machine_in(State.SLOT_FILL)
    assert m.observe_user("standard consultation, no problem") is None
    assert m.state is State.SLOT_FILL


def test_three_failed_fills_hand_off() -> None:
    m = machine_in(State.SLOT_FILL)
    for _ in range(MAX_FAILED_FILLS - 1):
        assert m.record_failed_fill() is False
        assert m.state is State.SLOT_FILL
    assert m.record_failed_fill() is True
    assert m.state is State.HANDOFF


def test_progress_resets_the_failure_counter() -> None:
    m = machine_in(State.SLOT_FILL)
    m.record_failed_fill()
    m.record_failed_fill()
    m.record_progress()
    assert m.failed_fills == 0
    assert m.record_failed_fill() is False
    assert m.state is State.SLOT_FILL


def test_handoff_is_terminal_for_every_other_tool() -> None:
    m = machine_in(State.HANDOFF)
    for tool in (ToolName.SEARCH_VENDORS, ToolName.HOLD_SLOT, ToolName.CONFIRM_BOOKING):
        allowed, _ = m.can_call(tool)
        assert not allowed
    assert m.can_call(ToolName.HANDOFF_TO_HUMAN)[0]


# --------------------------------------------------------------------------
# Corrections
# --------------------------------------------------------------------------


def test_first_readback_covers_every_field() -> None:
    m = machine_in(State.SLOT_FILL)
    diff = m.set_pending_slots(READBACK)
    assert diff.fields == ["date", "price", "time", "vendor"]
    assert m.readback_fields == ["date", "price", "time", "vendor"]
    assert m.corrections == 0


def test_correction_touches_only_the_changed_field() -> None:
    m = machine_in(State.SLOT_FILL)
    m.set_pending_slots(READBACK)
    m.transition_to(State.READBACK_CONFIRM, "hold")

    diff = m.set_pending_slots({**READBACK, "date": "2026-08-11"})

    assert diff.fields == ["date"]
    assert m.readback_fields == ["date"]
    assert m.corrections == 1
    assert m.pending_slots["vendor"] == READBACK["vendor"]
    assert m.pending_slots["time"] == READBACK["time"]
    assert m.pending_slots["price"] == READBACK["price"]


def test_repeating_the_same_details_is_not_a_correction() -> None:
    m = machine_in(State.READBACK_CONFIRM)
    m.set_pending_slots(READBACK)
    before = list(m.readback_fields)
    diff = m.set_pending_slots(dict(READBACK))
    assert not diff
    assert m.corrections == 0
    assert m.readback_fields == before


def test_confirm_clears_the_attempt_so_the_next_booking_is_not_a_correction() -> None:
    m = machine_in(State.READBACK_CONFIRM)
    m.set_pending_slots(READBACK)
    m.complete_attempt()
    assert m.pending_slots == {}
    assert m.confirmed_slots["vendor"] == READBACK["vendor"]
    diff = m.set_pending_slots({"vendor": "Apollo Pharmacy", "date": "2026-08-14"})
    assert m.corrections == 0
    assert diff.fields == ["date", "vendor"]


# --------------------------------------------------------------------------
# Transitions
# --------------------------------------------------------------------------


def test_illegal_transition_raises() -> None:
    m = ConversationStateMachine()
    with pytest.raises(InvalidTransition):
        m.transition_to(State.READBACK_CONFIRM, "skipping the whole booking flow")


def test_silence_counter_is_reported() -> None:
    m = machine_in(State.READBACK_CONFIRM)
    assert m.record_silence() == 1
    assert m.record_silence() == 2
