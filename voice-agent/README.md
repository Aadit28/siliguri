# saathi voice agent — week 1 (text mode) + week 2 (audio loop) + week 3 (latency)

The booking agent's brain, and the audio layer wrapped around it. Per
[`docs/BUILD_GUIDE.md`](../docs/BUILD_GUIDE.md) Part D.7, tool-call traces are
debugged in text first because it is the cheapest place to get them wrong, so
the brain is a synchronous text-in/text-out package with no idea that LiveKit
exists. Week 2 adds `saathi_agent/voice/`, which replaces the caller of
`VoiceSession.user_says` and nothing else.

The split is load-bearing, not tidiness: **the base install has no LiveKit**
and the whole text suite runs without it. Only `pip install -e ".[voice]"`
pulls the audio stack in.

Moves to `apps/voice-agent/` when the monorepo migration (Part A) lands.

## What is here

| File | Job |
|---|---|
| `saathi_agent/tools.py` | The eight typed tools, their OpenAI schemas, and the dispatcher. Idempotency keys are minted by the runtime, one per booking attempt, and never shown to the model |
| `saathi_agent/state.py` | IDLE → INTENT → DISAMBIGUATE → SLOT_FILL → READBACK_CONFIRM → EXECUTING → PENDING_GUARDIAN/RECEIPT, plus HANDOFF. Holds the confirm gate |
| `saathi_agent/guards.py` | Server-echo id validation, distress detection, correction diffing |
| `saathi_agent/agent.py` | The loop: distress check → LLM → state gate → guards → key → API → audit → state effects |
| `saathi_agent/booking_client.py` | `HttpBookingClient` (the `/api/bookings/*` Part C routes) and `MockBookingClient` (offline, same semantics) |
| `saathi_agent/prompts.py` | System prompt + the fixed reviewed copy for greeting, handoff, silence, close |
| `tests/personas/*.json` | Six scripted suites, data not code |
| **`saathi_agent/voice/worker.py`** | The LiveKit Agents entrypoint: room → Saaras → `VoiceSession` → Bulbul → room |
| **`saathi_agent/voice/sarvam_stt.py`** | `livekit.agents.stt.STT` over Saaras (`saaras:v3`) — WebSocket, REST fallback |
| **`saathi_agent/voice/sarvam_tts.py`** | `livekit.agents.tts.TTS` over Bulbul — WebSocket + sentence chunking, REST fallback |
| **`saathi_agent/voice/lock.py`** | The readback interruption lock, as pure functions. No LiveKit import |
| **`saathi_agent/voice/config.py`** | Env wiring, the D.4 elder tuning numbers, job-metadata → `ElderContext`. No LiveKit import |
| **`saathi_agent/voice/sarvam_ws.py`** | The Sarvam WebSocket contract as pure functions: URLs, client frames, a decoder. No LiveKit import |
| **`saathi_agent/voice/cache.py`** | Pre-synthesized fixed frames on disk + the `warm` CLI. No LiveKit import |
| **`saathi_agent/voice/metrics.py`** | Per-turn latency records + the `report` CLI. No LiveKit import |

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

## Run the voice worker (week 2)

```bash
.venv/Scripts/python -m pip install -e ".[dev,voice]"
.venv/Scripts/python -m saathi_agent.voice.worker download-files   # silero VAD weights
.venv/Scripts/python -m saathi_agent.voice.worker dev              # local, hot reload
.venv/Scripts/python -m saathi_agent.voice.worker start            # production
```

Standard LiveKit Agents CLI, so `connect --room <name>`, `console` and
`download-files` all work too. The worker is long-running and holds a
WebSocket — Fly / Railway / a small ap-south-1 box, never Vercel (D.1).

### Environment

| Var | Default | What it does |
|---|---|---|
| `LIVEKIT_URL` | — | `wss://…` of the LiveKit project. Mumbai region, per D.5 |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | — | Worker registration. Read by the framework, not by our code |
| `SARVAM_API_KEY` | — | Required. Sent as `api-subscription-key` to both Sarvam endpoints |
| `SAARAS_MODEL` | `saaras:v3` | STT model |
| `SARVAM_STT_LANGUAGE` | `unknown` | `unknown` = detect per utterance, the only setting that survives a sentence that starts Bengali and ends English |
| `BULBUL_MODEL` | `bulbul:v3` | TTS model |
| `BULBUL_VOICE` | `anushka` | Bulbul speaker |
| `SARVAM_TTS_SAMPLE_RATE` | `22050` | Drop to `8000` for the Exotel phone channel (D.9) |
| `SARVAM_TTS_PACE` | `0.9` | Slightly under natural pace |
| `SAATHI_API_BASE_URL` | — | Part C booking API. **Unset falls back to `MockBookingClient`** and the worker says so loudly: bookings would not be real |
| `SAATHI_API_TOKEN`, `SAATHI_ELDER_ID` | — | Booking API auth, as in week 1 |
| `SAATHI_LLM_BASE_URL`, `SAATHI_LLM_API_KEY`, `SAATHI_LLM_MODEL` | `gpt-4o-mini` | The tool-calling model, unchanged from week 1 |
| `SAATHI_LOG_LEVEL` | `INFO` | — |
| `SARVAM_STREAMING` | `1` | `0`/`false`/`no`/`off` puts **both** adapters back on REST. Anything else, including a typo, leaves the sockets on — disabling them has to be deliberate |
| `SARVAM_STT_WS_URL` | `wss://api.sarvam.ai/speech-to-text/ws` | Saaras socket. Overridable so a moved endpoint is an env change, not a release |
| `SARVAM_TTS_WS_URL` | `wss://api.sarvam.ai/text-to-speech/ws` | Bulbul socket |
| `SARVAM_STT_SAMPLE_RATE` | `16000` | The socket takes 16k or 8k only. `8000` for the Exotel phone channel (D.9) |
| `SARVAM_TTS_CODEC` | `linear16` | Streaming output codec. `linear16` is raw PCM (`audio/pcm`), which skips the framework decoder and the `livekit-agents[codecs]` extra |
| `SAATHI_TTS_CACHE_DIR` | `voice-agent/.cache/tts` | Pre-synthesized fixed frames |
| `SAATHI_METRICS_DIR` | `voice-agent/.metrics` | Per-turn latency JSONL, one file per call |

Who is on the call comes from the job dispatch metadata, not the environment:
`{"elder_name": …, "language": "bn", "city": …, "family_members": [{"id", "name", "relation"}]}`
becomes the same `ElderContext` week 1 uses. Malformed metadata degrades to
defaults rather than killing the job.

### The readback lock

Barge-in is on for the whole call except one utterance. `lock.py` decides,
and it decides on the state the turn *ended* in — a turn that ends in
`READBACK_CONFIRM` is a turn whose reply reads the booking back, because only
a successful `hold_slot` can put the machine there.

- locked ⇒ `session.say(..., allow_interruptions=False)`, so "haan haan"
  over the fee does not cut the sentence off
- anything transcribed *during* locked playback is dropped, because the elder
  cannot have been answering a question they had not finished hearing — this
  is the difference between a confirmed booking and a confirmed booking
  nobody agreed to
- so is anything *queued* before it finished: `ReadbackGate` carries an epoch
  across the turn lock, so a transcript that waited out the readback is not
  processed as the reply to it
- distress is the one thing that gets through that filter, which is why
  LiveKit's own `discard_audio_if_uninterruptible` stays off — deleting the
  audio would delete the transcript the carve-out reads
- handoff and close are never locked

Both decisions are pure functions over `State`, tested in
`tests/test_voice_scaffold.py` with no audio stack present.

## Latency (week 3)

Four changes, all of them outside the confirm gate.

**Both Sarvam adapters stream.** STT goes up the Saaras socket in 50ms
base64 frames as the elder speaks, so the transcript is not waiting on an
upload that starts only once endpointing has fired. TTS comes back down the
Bulbul socket, so playback starts on the first chunk instead of the last.
`SARVAM_STREAMING=0` puts both back on REST, and a socket that will not open
falls back to REST for that turn rather than failing it — after the first
refusal the adapter stops re-paying the connect timeout.

**The sentence tokenizer is ours now.** The framework only inserts its own
(`tts.StreamAdapter`) in front of a TTS whose capabilities say
`streaming=False`. Declare `streaming=True` and the reply arrives as text, so
`_SarvamSynthesizeStream` runs `tokenize.basic.SentenceTokenizer` itself and
pushes sentence by sentence. Getting this wrong is silent — one synthesis
request for the whole reply, and the first audio a sentence and a half late.

**Fixed frames are pre-synthesized.** Six lines are reviewed copy rather than
model output (greeting, handoff, silence re-prompt, polite close, error
apology, the readback's fixed tail). They are synthesized once to
`.cache/tts/<voice>/` and played from disk on an exact text match:

```bash
python -m saathi_agent.voice.cache warm                 # everything missing
python -m saathi_agent.voice.cache warm --dry-run       # no key needed
python -m saathi_agent.voice.cache list
```

The key covers voice, model, language, sample rate and pace, so changing any
of them is a miss rather than yesterday's voice halfway through a call. An
unwarmed worker logs a warning and synthesizes normally.

**Every turn is timed.** One JSONL line per turn in `.metrics/<session>.jsonl`:
`user_speech_end → stt_final → llm_done → tts_first_chunk → playback_start →
playback_end`.

```bash
python -m saathi_agent.voice.metrics report             # p50/p95 per span
python -m saathi_agent.voice.metrics report .metrics/lk_room.jsonl --json
```

There is no `llm_first_token`. The core is synchronous and runs a whole tool
loop per turn, so nothing tokenwise exists to stamp; `llm_done` is the honest
name and `response` (speech end → playback start) is the number the elder
actually experiences.

### How much of the Sarvam socket contract is verified

Worth being precise about, because none of it can be exercised offline:

- **Documented** on docs.sarvam.ai: both endpoint URLs, `api-subscription-key`
  as a handshake header, the STT query parameters and their enums, the STT
  audio frame and `{"type": "flush"}`, the STT `data`/`events`/`error` server
  frames with `START_SPEECH`/`END_SPEECH`, and the TTS
  `config`/`text`/`flush` client frames and `audio`/`event`/`error` replies.
- **Cross-checked** against the official `livekit-plugins-sarvam` 1.6.8
  source, which settles what the docs leave ambiguous: audio is base64 of raw
  little-endian int16 with no WAV container even though `encoding` says
  `audio/wav`, and TTS audio lives at `data.audio`.
- **Undocumented, marked TODO in `sarvam_ws.py`:** `{"type":
  "end_of_stream"}` — the official plugin sends it and it is harmless if the
  server ignores it.
- **Inferred, marked TODO:** interim transcripts. Saaras v3 emits one
  VAD-gated transcript per utterance and the documented schema has no
  `is_final`, so the INTERIM path is forward-compatible plumbing, not
  something observed. It exists so that if a partial ever does arrive it is
  surfaced as interim rather than mistaken for a final — half a sentence
  answering a readback is the failure that matters here.

Two ordering rules are enforced in `SarvamSTTDecoder` and unit-tested:
`END_SPEECH` arrives *before* the transcript it closes, so END_OF_SPEECH is
held until FINAL_TRANSCRIPT has been emitted (otherwise the turn closes on an
empty utterance), and a held one is released after a second if the transcript
never lands (otherwise the turn never closes at all).

## The gate

Every tool call and result lands in an in-memory audit trace
(`session.dump_audit()` → JSONL), the same shape the server writes to
`audit_log`. The suite asserts, per BUILD_GUIDE D.8:

1. `confirm_booking` never fires without a prior `hold_slot` in the session,
   nor on a yes the elder spoke before hearing that hold read back
2. the same idempotency key is reused on a retried booking attempt, retired
   once that attempt's hold is released or expires, and never shown to the
   model — in an argument or in a result
3. no orphaned holds after the suite
4. fabricated vendor / slot / member ids are rejected before the network
5. a distress word mid-booking drops the hold and hands off
6. a readback correction patches one field without restarting

## Deviations from the brief

- **Sync core, async shell.** The brain stayed synchronous. `worker.py` calls
  it through `asyncio.to_thread`, so the event loop keeps servicing audio
  while the tool loop blocks on the booking API. Rewriting 124 passing tests
  as coroutines would have bought nothing.
- **The framework's LLM node is not used.** `AgentSession` gets STT, TTS and
  VAD only; every reply comes from `VoiceSession`, and
  `on_user_turn_completed` raises `StopResponse` so no second, ungated reply
  is generated. Handing the eight tools to the framework's LLM node would put
  the `confirm_booking` gate back inside the model's reach, which is the one
  thing D.2 says never to do.
- **The Sarvam wire contract lives in `sarvam_ws.py`, not in the adapters.**
  Every frame we send and every frame we decode is a pure function, so the
  part that can actually be wrong is unit-tested in the base install with a
  fake socket and no key. The adapters are left with connection management.
  (Week 2 shipped REST-only for both; the sockets landed in week 3, with the
  documented-vs-inferred split spelled out above.)
- **An official `livekit-plugins-sarvam` exists.** These adapters are here to
  pin model, mode and language policy to the elder case — auto language
  detection for mid-sentence Benglish, `transcribe` and never `translate`.
  Swapping to the official plugin is a two-line change in `entrypoint`.
- **Silence handling rides on `user_away_timeout`**, which fires the
  framework's `user_state_changed` → `"away"` into the existing
  `VoiceSession.on_silence()` counter. The one-re-prompt-then-close ladder is
  unit-tested in the core but the *event* half needs a live room to confirm —
  week-2 QA, not something to claim from here.
- **No noise-cancellation plugin wired.** `RoomInputOptions()` is bare;
  background TV is handled by the interruption thresholds for now, and D.4
  says tune on real pilot audio anyway.
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
