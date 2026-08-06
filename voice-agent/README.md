# saathi voice agent — week 1 (text mode)

The booking agent's brain with no audio attached: tool loop, conversation
state machine, guards, and the eval harness. Per
[`docs/BUILD_GUIDE.md`](../docs/BUILD_GUIDE.md) Part D.7, tool-call traces are
debugged in text first because it is the cheapest place to get them wrong.
Week 2 adds LiveKit + Sarvam STT/TTS and replaces only the caller of
`VoiceSession.user_says`; no LiveKit dependency exists yet.

Moves to `apps/voice-agent/` when the monorepo migration (Part A) lands.

## What is here

| File | Job |
|---|---|
| `saathi_agent/tools.py` | The eight typed tools, their OpenAI schemas, and the dispatcher. Idempotency keys are minted by the runtime, one per booking attempt, and never shown to the model |
| `saathi_agent/state.py` | IDLE → INTENT → DISAMBIGUATE → SLOT_FILL → READBACK_CONFIRM → EXECUTING → PENDING_GUARDIAN/RECEIPT, plus HANDOFF. Holds the confirm gate |
| `saathi_agent/guards.py` | Server-echo id validation, distress detection, correction diffing |
| `saathi_agent/agent.py` | The loop: distress check → LLM → state gate → guards → key → API → audit → state effects |
| `saathi_agent/booking_client.py` | `HttpBookingClient` (the `/api/bookings/*` Part C routes) and `MockBookingClient` (offline, same semantics) |
| `saathi_agent/prompts.py` | System prompt + the fixed reviewed copy for handoff, silence, close |
| `tests/personas/*.json` | Six scripted suites, data not code |

Two rules are enforced in code rather than in the prompt, because prompts are
suggestions: `confirm_booking` is refused unless the machine is in
`READBACK_CONFIRM` **and** the last utterance matched the explicit-yes list
(haan / ঠিক আছে / theek hai / confirm / yes / হ্যাঁ), and a distress word in
any state hands off before the model is even called.

## Run it

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"     # or: pip install pydantic httpx openai pytest
```

Tests (offline — no API key, no network):

```bash
.venv/Scripts/python -m pytest tests/ -q
```

REPL against `MockBookingClient`:

```bash
.venv/Scripts/python repl.py --persona happy_path_bengali   # offline replay
.venv/Scripts/python repl.py                                # live LLM
```

Live mode reads `SAATHI_LLM_BASE_URL`, `SAATHI_LLM_API_KEY`, and
`SAATHI_LLM_MODEL` (default `gpt-4o-mini`); any OpenAI-compatible endpoint
works, which is what makes the GPT-4o-mini vs Sarvam-M benchmark an env
change rather than a code change. In-call commands: `/state`, `/slots`,
`/trace`, `/dump`, `/silence`, `/quit`.

## The gate

Every tool call and result lands in an in-memory audit trace
(`session.dump_audit()` → JSONL), the same shape the server writes to
`audit_log`. The suite asserts, per BUILD_GUIDE D.8:

1. `confirm_booking` never fires without a prior `hold_slot` in the session
2. the same idempotency key is reused on a retried booking attempt
3. no orphaned holds after the suite
4. fabricated vendor / slot / member ids are rejected before the network
5. a distress word mid-booking drops the hold and hands off
6. a readback correction patches one field without restarting

## Deviations from the brief

- **Sync, not async.** Week 1 has no concurrency to gain from; the LiveKit
  worker will wrap these calls rather than the package being async today.
  This also keeps the dependency list at the four named ones — no
  `pytest-asyncio`.
- **Personas are JSON, not YAML.** PyYAML is not in the dependency list and
  is not worth adding for six files.
- `release_hold` exists on the booking client but is not one of the eight
  tools. It is runtime cleanup (correction, handoff, call close) and the
  model cannot call it. Over HTTP it is a cancel of the `held` booking row —
  the sweeper would reclaim the slot eventually, but not while the elder is
  still on the call.
- `search_vendors` over HTTP is served by `/api/bookings/search` reduced to
  distinct vendors: there is no vendor-only route, and a vendor with no open
  slot is not worth offering anyway. Only `MockBookingClient` is exercised
  this week; `HttpBookingClient` gets its first real traffic in week 2.
