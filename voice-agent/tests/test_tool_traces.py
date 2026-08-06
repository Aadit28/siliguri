"""Tool-trace assertions - the week-1 gate (BUILD_GUIDE D.8).

Everything here runs offline: MockBookingClient stands in for the booking API
and ScriptedLLM replays canned tool-call sequences, including the ones a real
model would only produce by accident (a fabricated id, a confirm with no
hold). No API key, no network.
"""

from __future__ import annotations

import json

import pytest

from conftest import PERSONA_DIR, load_persona, make_session, persona_ids, run_persona
from saathi_agent import (
    MockBookingClient,
    RejectionCode,
    State,
    ToolName,
    ToolOutcome,
    openai_tool_schemas,
)

SHARMA_SEARCH = {
    "name": "search_vendors",
    "arguments": {"category": "doctor", "query": "শর্মা"},
}
SHARMA_SLOTS = {
    "name": "search_slots",
    "arguments": {"vendor_id": "vnd_dr_sharma", "date_range": "2026-08-11..2026-08-16"},
}
HOLD_THU = {"name": "hold_slot", "arguments": {"slot_id": "slot_sharma_thu_1600"}}


def tool_names(client: MockBookingClient) -> list[str]:
    return [name for name, _ in client.calls]


# --------------------------------------------------------------------------
# 1. confirm_booking never fires without a prior hold in the same session
# --------------------------------------------------------------------------


def test_confirm_without_any_hold_is_blocked_before_it_reaches_the_api(client, context) -> None:
    session = make_session(
        client,
        [[{"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "hold_1"}}]},
          {"content": "দুঃখিত, আগে সময় ঠিক করি।"}]],
        context,
    )

    turn = session.user_says("ডাক্তার বুক করে দাও, তাড়াতাড়ি")

    rejected = turn.outcomes[0]
    assert rejected.ok is False
    assert rejected.rejection.code is RejectionCode.STATE_BLOCKED
    assert "confirm_booking" not in tool_names(client)
    assert client.bookings == {}


def test_confirm_after_a_search_but_before_a_hold_is_still_blocked(client, context) -> None:
    session = make_session(
        client,
        [[
            {"tool_calls": [SHARMA_SEARCH]},
            {"tool_calls": [SHARMA_SLOTS]},
            {"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "hold_1"}}]},
            {"content": "কোন দিন আসবেন?"},
        ]],
        context,
    )

    turn = session.user_says("ডাঃ শর্মার কাছে বুক করে দাও")

    confirm = [o for o in turn.outcomes if o.tool == ToolName.CONFIRM_BOOKING][0]
    assert confirm.ok is False
    assert confirm.rejection.code is RejectionCode.STATE_BLOCKED
    assert session.state.state is State.SLOT_FILL
    assert "confirm_booking" not in tool_names(client)


def test_hold_and_confirm_in_one_turn_cannot_book(client, context) -> None:
    """Regression: a yes that predates the readback is not consent.

    The elder says "haan" about the vendor, and the model tries to hold and
    confirm in the same response. The hold legitimately moves the machine to
    READBACK_CONFIRM mid-turn, so the state check alone passes - but the
    readback has not been spoken yet, and the elder cannot have agreed to a
    fee they have not heard.
    """
    session = make_session(
        client,
        [[
            {"tool_calls": [SHARMA_SEARCH]},
            {"tool_calls": [SHARMA_SLOTS]},
            {"tool_calls": [HOLD_THU, {"name": "confirm_booking",
                                       "arguments": {"hold_id": "{{hold_id}}"}}]},
            {"content": "ডাঃ শর্মা, বৃহস্পতিবার বিকেল ৪টা, ৩০০ টাকা। ঠিক আছে?"},
        ]],
        context,
    )

    turn = session.user_says("haan, Dr. Sharma theek hai")

    confirm = [o for o in turn.outcomes if o.tool == ToolName.CONFIRM_BOOKING][0]
    assert confirm.ok is False
    assert confirm.rejection.code is RejectionCode.STATE_BLOCKED
    assert "confirm_booking" not in tool_names(client)
    assert client.bookings == {}
    assert session.state.state is State.READBACK_CONFIRM

    session.close()


def test_the_yes_after_the_readback_still_books(client, context) -> None:
    """The other half of the same rule: the legitimate two-turn flow works."""
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "৩০০ টাকা। ঠিক আছে?"}],
            [{"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}]},
             {"content": "হয়ে গেছে।"}],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    session.user_says("বৃহস্পতিবার")
    turn = session.user_says("হ্যাঁ")

    assert turn.outcomes[0].ok is True
    assert len(client.bookings) == 1


def test_a_search_from_pending_guardian_does_not_crash_the_turn(client, context) -> None:
    """Regression: searches are not gated, so their state effect must be able
    to do nothing. PENDING_GUARDIAN has no edge to DISAMBIGUATE or SLOT_FILL,
    and an InvalidTransition here left the elder listening to silence."""
    banerjee_search = {"name": "search_vendors",
                       "arguments": {"category": "doctor", "query": "ব্যানার্জি"}}
    session = make_session(
        client,
        [
            [{"tool_calls": [banerjee_search]},
             {"tool_calls": [{"name": "search_slots",
                              "arguments": {"vendor_id": "vnd_dr_banerjee",
                                            "date_range": "2026-08-11..2026-08-16"}}]},
             {"content": "কোন দিন?"}],
            [{"tool_calls": [{"name": "hold_slot",
                              "arguments": {"slot_id": "slot_banerjee_fri_1100"}}]},
             {"content": "৬০০ টাকা। ঠিক আছে?"}],
            [{"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}]},
             {"content": "রিয়াদিদির অনুমতি লাগবে।"}],
            # While the guardian is still deciding, the elder asks about
            # something else. Both searches are illegal transitions from here.
            [{"tool_calls": [{"name": "search_vendors", "arguments": {"category": "doctor"}}]},
             {"tool_calls": [SHARMA_SLOTS]},
             {"content": "ডাঃ শর্মার মঙ্গলবার আর বৃহস্পতিবার ফাঁকা।"}],
        ],
        context,
    )
    session.user_says("ডাঃ ব্যানার্জি")
    session.user_says("শুক্রবার")
    assert session.user_says("হ্যাঁ").state is State.PENDING_GUARDIAN

    turn = session.user_says("আর ডাঃ শর্মার কী অবস্থা?")

    assert [o.ok for o in turn.outcomes] == [True, True]
    assert turn.reply
    assert session.state.state is State.PENDING_GUARDIAN, "a lookup must not move a booked call"
    # And the turn was still audited, one event per call.
    assert session.audit.events[-1].tool == ToolName.SEARCH_SLOTS


def test_hold_from_disambiguate_is_refused_before_any_capacity_is_taken(client, context) -> None:
    """Regression: can_call allowed a hold the transition table then refused,
    so a real server-side hold existed before the crash. The rejection now
    happens before dispatch - nothing is held, and the turn survives."""
    session = make_session(
        client,
        [[
            {"tool_calls": [SHARMA_SEARCH]},
            {"tool_calls": [SHARMA_SLOTS]},
            # Two doctors match, so the machine drops back to DISAMBIGUATE.
            {"tool_calls": [{"name": "search_vendors", "arguments": {"category": "doctor"}}]},
            {"tool_calls": [HOLD_THU]},
            {"content": "শর্মা না ব্যানার্জি, কার কাছে?"},
        ]],
        context,
    )

    turn = session.user_says("ডাক্তার দেখাতে হবে")

    hold = [o for o in turn.outcomes if o.tool == ToolName.HOLD_SLOT][0]
    assert hold.ok is False
    assert hold.rejection.code is RejectionCode.STATE_BLOCKED
    assert "hold_slot" not in tool_names(client)
    assert client.holds == {}
    assert client.slots["slot_sharma_thu_1600"]["booked"] == 0
    assert session.state.state is State.DISAMBIGUATE
    assert turn.reply


@pytest.mark.parametrize("persona_id", persona_ids())
def test_every_confirm_in_every_persona_follows_its_own_hold(persona_id, context) -> None:
    run = run_persona(load_persona(persona_id), context)

    held: set[str] = set()
    for event in run.session.audit.events:
        if not event.ok:
            continue
        if event.tool == ToolName.HOLD_SLOT:
            held.add(event.data["hold_id"])
        if event.tool == ToolName.CONFIRM_BOOKING:
            assert event.args["hold_id"] in held, "confirmed a hold this session never took"


# --------------------------------------------------------------------------
# 2. Idempotency keys are runtime-owned and reused on retry
# --------------------------------------------------------------------------


def test_hold_retry_reuses_one_key_and_takes_one_hold(client, context) -> None:
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            # The same hold twice: a timed-out call the model reissues.
            [{"tool_calls": [HOLD_THU]}, {"tool_calls": [HOLD_THU]}, {"content": "ঠিক আছে?"}],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    turn = session.user_says("বৃহস্পতিবার")

    holds = [o for o in turn.outcomes if o.tool == ToolName.HOLD_SLOT]
    assert len(holds) == 2
    assert holds[0].idempotency_key == holds[1].idempotency_key
    assert holds[0].data["hold_id"] == holds[1].data["hold_id"]
    assert len(client.holds) == 1, "a retry must not consume a second unit of capacity"
    assert client.slots["slot_sharma_thu_1600"]["booked"] == 1

    sent_keys = {args["idempotency_key"] for name, args in client.calls if name == "hold_slot"}
    assert len(sent_keys) == 1

    session.close()


def test_confirm_inherits_the_hold_key_and_a_duplicate_confirm_is_refused(client, context) -> None:
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "ঠিক আছে?"}],
            [
                {"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}]},
                {"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}]},
                {"content": "হয়ে গেছে।"},
            ],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    hold_turn = session.user_says("বৃহস্পতিবার")
    confirm_turn = session.user_says("ঠিক আছে")

    hold_key = hold_turn.outcomes[0].idempotency_key
    confirms = [o for o in confirm_turn.outcomes if o.tool == ToolName.CONFIRM_BOOKING]
    assert confirms[0].ok and confirms[0].idempotency_key == hold_key

    # The second confirm never reaches the API: the state gate already moved
    # past READBACK_CONFIRM, so a double-book is impossible locally too.
    assert confirms[1].ok is False
    assert confirms[1].rejection.code is RejectionCode.STATE_BLOCKED
    assert len(client.bookings) == 1


def test_a_model_supplied_idempotency_key_is_discarded(client, context) -> None:
    poisoned = {
        "name": "hold_slot",
        "arguments": {"slot_id": "slot_sharma_thu_1600", "idempotency_key": "chosen-by-the-model"},
    }
    session = make_session(
        client,
        [[{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"tool_calls": [poisoned]},
          {"content": "ঠিক আছে?"}]],
        context,
    )

    turn = session.user_says("ডাঃ শর্মা, বৃহস্পতিবার")

    hold = [o for o in turn.outcomes if o.tool == ToolName.HOLD_SLOT][0]
    assert hold.ok
    assert hold.model_supplied_key is True
    assert hold.idempotency_key != "chosen-by-the-model"
    assert client.holds[hold.data["hold_id"]]["idempotency_key"] == hold.idempotency_key
    session.close()


def test_the_model_is_never_shown_the_idempotency_parameter() -> None:
    for schema in openai_tool_schemas():
        params = schema["function"]["parameters"]
        assert "idempotency_key" not in params["properties"]
        assert "idempotency_key" not in params["required"]


def test_the_idempotency_key_never_reaches_the_model_in_a_result(client, context) -> None:
    """Regression: stripping the key from the arguments covered half the door.

    The booking rows come back carrying it, and `tool_content` serialises them
    verbatim - so the key landed in model context on every hold and confirm,
    where it can be spoken over TTS or lifted by an injection in a vendor name.
    """
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "ঠিক আছে?"}],
            [{"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}]},
             {"content": "হয়ে গেছে।"}],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    hold_turn = session.user_says("বৃহস্পতিবার")
    confirm_turn = session.user_says("ঠিক আছে")

    key = hold_turn.outcomes[0].idempotency_key
    assert key

    for outcome in (hold_turn.outcomes[0], confirm_turn.outcomes[0]):
        assert "idempotency_key" not in json.loads(outcome.tool_content())["data"]

    # Nothing else leaked it into the transcript either.
    assert key not in json.dumps(session.messages, ensure_ascii=False)
    # The runtime still has it, and the server still received it.
    assert client.holds[hold_turn.outcomes[0].data["hold_id"]]["idempotency_key"] == key


def test_tool_content_redacts_runtime_fields_whatever_the_client_returns() -> None:
    """The choke point, tested on its own: a transport that echoes the key back
    (the real API does) must not be able to put it in front of the model."""
    leaky = ToolOutcome(
        tool=ToolName.HOLD_SLOT,
        args={"slot_id": "slot_sharma_thu_1600"},
        ok=True,
        data={"hold_id": "hold_1", "idempotency_key": "leaked-key",
              "nested": [{"idempotency_key": "leaked-key"}]},
        idempotency_key="leaked-key",
    )
    assert "leaked-key" not in leaky.tool_content()
    assert json.loads(leaky.tool_content())["data"]["hold_id"] == "hold_1"


def test_a_released_hold_retires_its_slot_key(client) -> None:
    from saathi_agent.tools import IdempotencyStore

    store = IdempotencyStore()
    first = store.for_slot("slot_sharma_thu_1600")
    assert store.for_slot("slot_sharma_thu_1600") == first, "one key per attempt, not per call"

    assert store.drop_slot("slot_sharma_thu_1600") == first
    assert store.for_slot("slot_sharma_thu_1600") != first, "a new attempt needs a new key"


def test_re_holding_a_released_slot_takes_a_live_hold_not_the_dead_one(client, context) -> None:
    """Regression: the key was pinned to the slot for the whole call, so a
    re-hold replayed the released row - the agent then read a dead hold back
    and confirm failed with hold_expired forever."""
    hold_tue = {"name": "hold_slot", "arguments": {"slot_id": "slot_sharma_tue_1600"}}
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "বৃহস্পতিবার। ঠিক আছে?"}],
            [{"tool_calls": [hold_tue]}, {"content": "মঙ্গলবার। ঠিক আছে?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "আবার বৃহস্পতিবার। ঠিক আছে?"}],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    first = session.user_says("বৃহস্পতিবার").outcomes[0]
    session.user_says("না, মঙ্গলবার")  # releases the Thursday hold
    again = session.user_says("না না, বৃহস্পতিবারই").outcomes[0]

    assert again.ok is True
    assert again.idempotency_key != first.idempotency_key
    assert again.data["hold_id"] != first.data["hold_id"]
    assert again.data["status"] == "held", "the elder must not hear a released hold read back"
    assert client.holds[first.data["hold_id"]]["status"] == "released"
    assert client.slots["slot_sharma_thu_1600"]["booked"] == 1

    session.close()
    assert client.orphaned_holds() == []


# --------------------------------------------------------------------------
# 3. No orphaned holds after the suite
# --------------------------------------------------------------------------


@pytest.mark.parametrize("persona_id", persona_ids())
def test_persona_leaves_no_orphaned_hold(persona_id, context) -> None:
    run = run_persona(load_persona(persona_id), context)
    assert run.client.orphaned_holds() == []
    for slot in run.client.slots.values():
        assert slot["booked"] <= slot["capacity"]


def test_whole_suite_leaves_no_orphaned_hold_and_no_stuck_capacity(context) -> None:
    """The suite-level version of the same gate: every persona, one assertion."""
    leftovers = {}
    for persona_id in persona_ids():
        run = run_persona(load_persona(persona_id), context)
        held = run.client.orphaned_holds()
        if held:
            leftovers[persona_id] = held
    assert leftovers == {}


# --------------------------------------------------------------------------
# 4. Fabricated ids are rejected
# --------------------------------------------------------------------------


def test_fabricated_vendor_id_is_rejected_and_the_agent_recovers(client, context) -> None:
    session = make_session(
        client,
        [[
            {"tool_calls": [SHARMA_SEARCH]},
            {"tool_calls": [{"name": "search_slots",
                             "arguments": {"vendor_id": "vnd_dr_ghosh", "date_range": "this week"}}]},
            {"tool_calls": [SHARMA_SLOTS]},
            {"content": "মঙ্গলবার না বৃহস্পতিবার?"},
        ]],
        context,
    )

    turn = session.user_says("ডাঃ শর্মার সময় দেখো")

    rejected = turn.outcomes[1]
    assert rejected.ok is False
    assert rejected.rejection.code is RejectionCode.UNKNOWN_VENDOR_ID
    assert "search_vendors" in rejected.rejection.message
    # Never left the process.
    assert all(args.get("vendor_id") != "vnd_dr_ghosh" for _, args in client.calls)
    # And the agent carried on with a real id instead of giving up.
    assert turn.outcomes[2].ok is True
    assert session.state.state is State.SLOT_FILL


def test_fabricated_slot_and_member_ids_are_rejected(client, context) -> None:
    session = make_session(
        client,
        [[
            {"tool_calls": [SHARMA_SEARCH]},
            {"tool_calls": [{"name": "hold_slot", "arguments": {"slot_id": "slot_made_up_1600"}}]},
            {"tool_calls": [{"name": "call_family_member", "arguments": {"member_id": "fam_stranger"}}]},
            {"content": "একটু দেখে বলছি।"},
        ]],
        context,
    )

    turn = session.user_says("ডাক্তার আর মেয়েকে ফোন")

    assert turn.outcomes[1].rejection.code is RejectionCode.UNKNOWN_SLOT_ID
    assert turn.outcomes[2].rejection.code is RejectionCode.UNKNOWN_MEMBER_ID
    assert turn.outcomes[2].rejection.retryable is False
    assert "hold_slot" not in tool_names(client)
    assert "call_family_member" not in tool_names(client)


def test_a_real_family_member_id_goes_through(client, context) -> None:
    session = make_session(
        client,
        [[{"tool_calls": [{"name": "call_family_member", "arguments": {"member_id": "fam_riya"}}]},
          {"content": "রিয়াকে লাগাচ্ছি।"}]],
        context,
    )
    turn = session.user_says("মেয়েকে একটু ফোন লাগাও")
    assert turn.outcomes[0].ok is True
    assert ("call_family_member", {"member_id": "fam_riya"}) in client.calls


# --------------------------------------------------------------------------
# 5. Distress interrupts a booking in flight
# --------------------------------------------------------------------------


def test_distress_mid_booking_hands_off_and_drops_the_hold(client, context) -> None:
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "ঠিক আছে?"}],
            # Scripted, but never reached: distress short-circuits the LLM.
            [{"tool_calls": [{"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}]}],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    session.user_says("বৃহস্পতিবার")
    assert session.state.state is State.READBACK_CONFIRM
    assert len(client.orphaned_holds()) == 1
    llm_calls_before = session.llm.calls_made

    turn = session.user_says("বুকে খুব ব্যথা হচ্ছে")

    assert turn.handed_off is True
    assert session.state.state is State.HANDOFF
    assert client.orphaned_holds() == [], "a hold must not survive a handoff"
    assert client.bookings == {}
    assert "confirm_booking" not in tool_names(client)
    assert session.llm.calls_made == llm_calls_before, "the distress turn never reached the model"

    handoff = [e for e in session.audit.events if e.tool == ToolName.HANDOFF_TO_HUMAN][0]
    assert handoff.origin == "runtime"
    assert handoff.args["reason"].startswith("distress:")
    assert handoff.state_before == str(State.READBACK_CONFIRM)


def test_agent_refuses_to_act_after_a_handoff(client, context) -> None:
    session = make_session(
        client,
        [[{"tool_calls": [SHARMA_SEARCH]}], [{"tool_calls": [SHARMA_SEARCH]}]],
        context,
    )
    session.user_says("সাহায্য করুন")
    before = len(session.audit.events)

    turn = session.user_says("ডাক্তার খুঁজে দাও")

    assert turn.handed_off is True
    assert len(session.audit.events) == before, "no tool ran after the handoff"
    assert "search_vendors" not in tool_names(client)


def test_three_empty_turns_reach_a_human(client, context) -> None:
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"content": "মঙ্গলবার না বৃহস্পতিবার, কোনটা?"}],
            [{"content": "দিনটা একবার বলবেন?"}],
            [{"content": "কোন দিন আসতে পারবেন?"}],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মা")
    session.user_says("যেটা ভালো বোঝো")
    session.user_says("তুমিই দেখে নাও")
    turn = session.user_says("জানি না তো")

    assert session.state.state is State.HANDOFF
    assert turn.handed_off is True
    reasons = [a["reason"] for n, a in client.calls if n == "handoff_to_human"]
    assert reasons == ["slot_fill_failed_x3"]


# --------------------------------------------------------------------------
# 6. A correction patches one field without restarting
# --------------------------------------------------------------------------


def test_correction_patches_one_field_without_restarting(context) -> None:
    run = run_persona(load_persona("mid_call_correction"), context)
    session = run.session

    correction_turn = run.snapshots[2]
    assert correction_turn["corrections"] == 1
    assert correction_turn["readback_fields"] == ["date"], "only the day is re-confirmed"
    assert correction_turn["pending_slots"]["time"] == "16:00"
    assert correction_turn["pending_slots"]["price"] == 30000
    assert correction_turn["state"] is State.READBACK_CONFIRM

    # No restart: the machine never went back through intent or vendor choice
    # after the first readback, and the vendor was never re-searched.
    after_first_readback = [
        t for t in session.state.history[session.state.history.index(
            next(t for t in session.state.history if t.to is State.READBACK_CONFIRM)
        ):]
    ]
    assert not any(t.to in (State.INTENT, State.DISAMBIGUATE) for t in after_first_readback)
    assert tool_names(run.client).count("search_vendors") == 1

    # The dropped hold went straight back to capacity, and the booking is the
    # Tuesday slot the elder actually asked for.
    assert tool_names(run.client).count("release_hold") == 1
    assert run.client.slots["slot_sharma_thu_1600"]["booked"] == 0
    booking = next(iter(run.client.bookings.values()))
    assert booking["slot_id"] == "slot_sharma_tue_1600"
    assert booking["status"] == "confirmed"


# --------------------------------------------------------------------------
# Persona suites end to end
# --------------------------------------------------------------------------


def test_six_persona_suites_exist() -> None:
    assert len(persona_ids()) == 6
    assert set(persona_ids()) == {
        "distress_trigger",
        "happy_path_bengali",
        "happy_path_hinglish",
        "mid_call_correction",
        "silence_abandon",
        "wrong_vendor_disambiguation",
    }


@pytest.mark.parametrize("persona_id", persona_ids())
def test_persona_matches_its_expected_trace(persona_id, context) -> None:
    persona = load_persona(persona_id)
    expect = persona["expect"]
    run = run_persona(persona, context)

    assert str(run.final_state) == expect["final_state"]
    assert run.session.audit.tool_sequence() == expect["tool_sequence"]

    rejections = [e.error["code"] for e in run.session.audit.events if not e.ok]
    assert rejections == expect.get("rejections", [])
    assert len(run.client.bookings) == expect.get("bookings", 0)

    if "corrections" in expect:
        assert max(s["corrections"] for s in run.snapshots) == expect["corrections"]
    if "readback_fields_after_correction" in expect:
        corrected = next(s for s in run.snapshots if s["corrections"] == 1)
        assert corrected["readback_fields"] == expect["readback_fields_after_correction"]


@pytest.mark.parametrize("persona_id", persona_ids())
def test_persona_audit_trace_dumps_as_jsonl(persona_id, context, tmp_path) -> None:
    run = run_persona(load_persona(persona_id), context)
    path = run.session.dump_audit(tmp_path / f"{persona_id}.jsonl")

    lines = path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == len(run.session.audit.events)
    for line in lines:
        event = json.loads(line)
        assert event["session_id"] == run.session.session_id
        assert event["origin"] in ("model", "runtime")
        assert event["state_before"] and event["state_after"]


def test_personas_are_data_not_code() -> None:
    """The suite grows by adding JSON, not by editing the harness."""
    for path in PERSONA_DIR.glob("*.json"):
        persona = json.loads(path.read_text(encoding="utf-8"))
        assert persona["id"] == path.stem
        assert persona["description"]
        assert persona["turns"]
        assert persona["expect"]["final_state"] in set(State)
