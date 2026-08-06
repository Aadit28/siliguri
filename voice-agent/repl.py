#!/usr/bin/env python
"""Interactive text REPL against MockBookingClient.

    python repl.py                      # live LLM (needs SAATHI_LLM_API_KEY)
    python repl.py --persona happy_path_bengali   # offline, replays a script

In-call commands: /state  /slots  /trace  /dump  /silence  /quit
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from saathi_agent import (
    ElderContext,
    FamilyMember,
    MockBookingClient,
    OpenAIChatClient,
    ScriptedLLM,
    VoiceSession,
)

PERSONA_DIR = Path(__file__).parent / "tests" / "personas"

DEMO_CONTEXT = ElderContext(
    elder_name="অমিয় কাকু",
    language="bn",
    city="Siliguri",
    today_iso="2026-08-10",
    family_members=[
        FamilyMember(id="fam_riya", name="Riya", relation="daughter"),
        FamilyMember(id="fam_arun", name="Arun", relation="son"),
    ],
)


def _utf8_stdout() -> None:
    # Bengali in a Windows console is mojibake on the default code page.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass


def _show(turn, session: VoiceSession) -> None:
    for outcome in turn.outcomes:
        mark = "ok " if outcome.ok else "REJ"
        detail = "" if outcome.ok else f" <- {outcome.rejection.code}: {outcome.rejection.message}"
        if outcome.idempotency_key:
            detail += f"  [key {outcome.idempotency_key[:8]}]"
        print(f"    [{mark}] {outcome.tool}({json.dumps(outcome.args, ensure_ascii=False)}){detail}")
    if turn.reply:
        print(f"  saathi> {turn.reply}")
    print(f"  ({session.state.state})")


def run_persona(persona_id: str) -> int:
    path = PERSONA_DIR / f"{persona_id}.json"
    if not path.exists():
        available = ", ".join(sorted(p.stem for p in PERSONA_DIR.glob("*.json")))
        print(f"No persona {persona_id!r}. Available: {available}")
        return 1
    persona = json.loads(path.read_text(encoding="utf-8"))

    client = MockBookingClient()
    llm = ScriptedLLM([turn.get("steps", []) for turn in persona["turns"]])
    session = VoiceSession(client, llm, DEMO_CONTEXT, session_id=f"persona_{persona_id}")

    print(f"=== {persona['id']}: {persona['description']} ===")
    for turn_spec in persona["turns"]:
        if turn_spec.get("silence"):
            print("  elder > (silence)")
            _show(session.on_silence(), session)
            continue
        print(f"  elder > {turn_spec['user']}")
        _show(session.user_says(turn_spec["user"]), session)
    session.close()
    print(f"final state: {session.state.state}   orphaned holds: {client.orphaned_holds()}")
    return 0


def run_interactive() -> int:
    if not os.environ.get("SAATHI_LLM_API_KEY"):
        print(
            "SAATHI_LLM_API_KEY is not set. Either export it (with optional "
            "SAATHI_LLM_BASE_URL / SAATHI_LLM_MODEL) or run offline:\n"
            "  python repl.py --persona happy_path_bengali"
        )
        return 1

    client = MockBookingClient()
    session = VoiceSession(client, OpenAIChatClient(), DEMO_CONTEXT)
    print(f"Saathi text REPL - session {session.session_id}. /quit to leave.\n")

    while True:
        try:
            line = input("elder > ").strip()
        except (EOFError, KeyboardInterrupt):
            line = "/quit"

        if line == "/quit":
            session.close()
            print(f"orphaned holds at close: {client.orphaned_holds()}")
            return 0
        if line == "/state":
            print(f"  {session.state.state}  pending={session.state.pending_slots} "
                  f"readback={session.state.readback_fields} refs={session.state.refs}")
            continue
        if line == "/slots":
            print(f"  {json.dumps(session.state.pending_slots, ensure_ascii=False, indent=2)}")
            continue
        if line == "/trace":
            print(session.audit.to_jsonl() or "  (empty)")
            continue
        if line == "/dump":
            print(f"  wrote {session.dump_audit()}")
            continue
        if line == "/silence":
            _show(session.on_silence(), session)
            continue

        _show(session.user_says(line), session)


def main() -> int:
    _utf8_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--persona", help="replay a scripted persona offline")
    args = parser.parse_args()
    return run_persona(args.persona) if args.persona else run_interactive()


if __name__ == "__main__":
    raise SystemExit(main())
