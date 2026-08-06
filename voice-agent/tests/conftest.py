"""Shared fixtures. Everything here runs offline: MockBookingClient for the
booking API, ScriptedLLM for the model."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from saathi_agent import (
    ElderContext,
    FamilyMember,
    MockBookingClient,
    ScriptedLLM,
    State,
    VoiceSession,
)

PERSONA_DIR = Path(__file__).parent / "personas"


@pytest.fixture
def context() -> ElderContext:
    return ElderContext(
        elder_name="অমিয় কাকু",
        language="bn",
        city="Siliguri",
        today_iso="2026-08-10",
        family_members=[
            FamilyMember(id="fam_riya", name="Riya", relation="daughter"),
            FamilyMember(id="fam_arun", name="Arun", relation="son"),
        ],
    )


@pytest.fixture
def client() -> MockBookingClient:
    return MockBookingClient()


def make_session(
    client: MockBookingClient,
    turns: list[list[dict[str, Any]]],
    context: ElderContext,
    **kwargs: Any,
) -> VoiceSession:
    """`turns` is one list of scripted model steps per user utterance."""
    return VoiceSession(client, ScriptedLLM(turns), context, **kwargs)


# --------------------------------------------------------------------------
# Persona suites
# --------------------------------------------------------------------------


def persona_ids() -> list[str]:
    return sorted(p.stem for p in PERSONA_DIR.glob("*.json"))


def load_persona(persona_id: str) -> dict[str, Any]:
    return json.loads((PERSONA_DIR / f"{persona_id}.json").read_text(encoding="utf-8"))


@dataclass
class PersonaRun:
    persona: dict[str, Any]
    session: VoiceSession
    client: MockBookingClient
    final_state: State
    replies: list[str] = field(default_factory=list)
    #: Per-turn snapshot; a confirm resets the correction counters, so the
    #: interesting values have to be captured while the turn is still warm.
    snapshots: list[dict[str, Any]] = field(default_factory=list)


def run_persona(persona: dict[str, Any], context: ElderContext) -> PersonaRun:
    client = MockBookingClient()
    session = make_session(
        client,
        [turn.get("steps", []) for turn in persona["turns"]],
        context.model_copy(update={"language": persona.get("language", "bn")}),
        session_id=f"persona_{persona['id']}",
    )

    replies: list[str] = []
    snapshots: list[dict[str, Any]] = []
    for turn in persona["turns"]:
        result = session.on_silence() if turn.get("silence") else session.user_says(turn["user"])
        replies.append(result.reply)
        snapshots.append(
            {
                "state": session.state.state,
                "readback_fields": list(session.state.readback_fields),
                "corrections": session.state.corrections,
                "pending_slots": dict(session.state.pending_slots),
            }
        )

    run = PersonaRun(
        persona=persona,
        session=session,
        client=client,
        final_state=session.state.state,
        replies=replies,
        snapshots=snapshots,
    )
    # Close after snapshotting: closing is what releases anything still held,
    # and the orphan assertion is about the state the call is left in.
    session.close()
    return run
